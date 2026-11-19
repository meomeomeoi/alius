// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState, GenerationRecord } from '../../src/engine/state/types';
import { wardenOf } from '../../src/engine/warden';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import type { SceneController } from '../../src/scene/sceneController';
import type { ExpeditionController } from '../../src/world/expeditionController';
import { renderBaseTab } from '../../src/ui/base/baseTab';
import { renderCommsTab } from '../../src/ui/comms/commsTab';
import { renderDilemma } from '../../src/ui/dilemma/dilemmaPanel';
import { h } from '../../src/ui/dom';
import { renderExpeditionScreen } from '../../src/ui/expedition/expeditionScreen';
import type { GenerationUi } from '../../src/ui/generation/surface';
import { renderHub, type HubCtx } from '../../src/ui/hub/hubScreen';
import { renderSceneScreen } from '../../src/ui/scene/sceneScreen';
import { renderEndScreen } from '../../src/ui/warden/endScreen';
import { renderWardenPanel } from '../../src/ui/warden/wardenPanel';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { depart, withMission } from '../helpers/expedition';
import { campaign, errors, loadCore, run, unitSetup } from '../helpers/world';
import '../../src/engine/actions/generations';

vi.mock('../../src/ui/hub/art', () => ({ probeHubArt: vi.fn(async () => null), peekHubArt: vi.fn(() => undefined) }));

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const rec = (siteId: string, key: string, over: Partial<GenerationRecord> = {}): GenerationRecord => ({
  id: `g_${siteId}_${key}`, siteId, key, reason: 'refused', detail: '', attempts: 1, day: 1, slot: 'morning', at: 1, budgetMult: 1, status: 'open', ...over,
});
const withRecords = (s: CampaignState, ...records: GenerationRecord[]): CampaignState => {
  s.generations = { seq: records.length, records };
  return s;
};

/** A stand-in for `app.generations`: every call is a spy, the reroll state is whatever the test says. */
function fakeUi(over: { reroll?: { enabled: boolean; reason?: string }; settings?: Partial<typeof DEFAULT_SETTINGS> } = {}) {
  let release: () => void = () => {};
  const generations = {
    retry: vi.fn(() => new Promise<never>((res) => { release = () => res({ kind: 'applied', value: 1 } as never); })),
    reroll: vi.fn(async () => ({ kind: 'applied', value: 1 }) as never),
    rerollState: vi.fn(() => over.reroll ?? { enabled: true }),
    drop: vi.fn(),
    useFallback: vi.fn(async () => {}),
  };
  const redraw = vi.fn();
  const ui: GenerationUi = { generations, modal: vi.fn(async () => null), settings: () => ({ ...DEFAULT_SETTINGS, ...over.settings }), toast: vi.fn(), redraw };
  return { ui, generations, redraw, release: () => release() };
}
const btn = (host: HTMLElement, action: string, within = ''): HTMLButtonElement | null => host.querySelector<HTMLButtonElement>(`${within} button[data-action="${action}"]`.trim());
/** Finishes a retry that the fake keeps open and lets its `finally` run. */
const settle = async (m: { release: () => void }): Promise<void> => {
  m.release();
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const chipCount = (host: HTMLElement): number => host.querySelectorAll('.alius-genfail').length;

// ---- scene

const msg = (index: number) => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0 });
function mountScene(records: (sceneId: string) => GenerationRecord[], opts: { reroll?: { enabled: boolean; reason?: string }; noUi?: boolean } = {}) {
  let state = campaign(reg, 4);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ['unit_ann'], origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = withRecords(r.state, ...records(r.state.scene!.id));
  const { ui, generations, redraw, release } = fakeUi();
  const controller = {
    send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [msg(0)], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
    rerollLast: vi.fn(async () => {}), rerollState: vi.fn(() => opts.reroll ?? { enabled: true }),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }), settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }),
    onEnded: vi.fn(), ...(opts.noUi ? {} : { generation: ui }),
  });
  return { host, controller, generations, redraw, release };
}

describe('the scene', () => {
  it('shows a failed reading under the transcript and RETRY reads it', async () => {
    const m = mountScene((id) => [rec('scene.intents', `${id}:0-2`)]);
    expect(chipCount(m.host)).toBe(1);
    expect(m.host.querySelector('.alius-generation-chips .alius-genfail')!.textContent).toContain('Scene reading: the model refused.');
    const id = m.host.querySelector('.alius-genfail')!.getAttribute('data-record')!;
    btn(m.host, 'generation-retry')!.click();
    expect(m.generations.retry).toHaveBeenCalledWith(id, undefined);
    await settle(m); // the module keeps pending ids: let the call finish so a later test starts clean
  });

  it('a reading of another scene and a quiet digest are not shown', () => {
    const m = mountScene((id) => [rec('scene.intents', 'other_scene:0-2'), rec('scene.digest', `${id}:3`, { quiet: true })]);
    expect(chipCount(m.host)).toBe(0);
  });

  it('REROLL sits beside the swipe buttons and asks the controller; disabled it says why', async () => {
    const m = mountScene(() => []);
    const tools = m.host.querySelector('.alius-scene-tools')!;
    const reroll = tools.querySelector<HTMLButtonElement>('[data-action="generation-reroll"]')!;
    expect(reroll).not.toBeNull();
    reroll.click();
    expect(m.controller.rerollLast).toHaveBeenCalledOnce();
    document.body.innerHTML = '';
    const off = mountScene(() => [], { reroll: { enabled: false, reason: 'Something happened since: this can no longer be rerolled.' } });
    const btnOff = off.host.querySelector<HTMLButtonElement>('.alius-scene-tools [data-action="generation-reroll"]')!;
    expect(btnOff.getAttribute('aria-disabled')).toBe('true');
    expect(btnOff.title).toContain('Something happened since');
    btnOff.click();
    expect(off.controller.rerollLast).not.toHaveBeenCalled();
  });

  it('draws nothing without the generation context', () => {
    const m = mountScene((id) => [rec('scene.intents', `${id}:0-2`)], { noUi: true });
    expect(chipCount(m.host)).toBe(0);
    expect(m.host.querySelector('[data-action="generation-reroll"]')).toBeNull();
  });
});

// ---- comms

function mountComms(records: GenerationRecord[], reply: { enabled: boolean; reason?: string } | null) {
  const state = campaign(reg, 4);
  state.dms.unit_ann = [
    { id: 'm1', from: 'commander', text: 'hello', day: 1, slot: 'morning', read: true },
    ...(reply ? [{ id: 'm2', from: 'unit_ann', text: 'hi', day: 1, slot: 'morning' as const, read: true }] : []),
  ];
  withRecords(state, ...records);
  const { ui, generations } = fakeUi();
  const run = vi.fn(async () => {});
  const host = h('div');
  document.body.append(host);
  renderCommsTab(host, {
    getState: () => state, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(), generation: ui,
    reply: { state: () => (reply ? { siteKey: 'unit_ann:m1', reroll: reply } : null), run },
  });
  (host.querySelector('button[data-unit="unit_ann"]') as HTMLElement).click();
  return { host, generations, run };
}

describe('COMMS', () => {
  it('shows a failed reply under the message and REROLL is disabled after another dispatch', () => {
    const failed = mountComms([rec('dm.reply', 'unit_ann:m1')], null);
    expect(failed.host.querySelector('.alius-genfail')!.textContent).toContain('Her reply: the model refused.');
    document.body.innerHTML = '';
    const moved = mountComms([], { enabled: false, reason: 'Something happened since: this can no longer be rerolled.' });
    const b = moved.host.querySelector<HTMLButtonElement>('[data-action="generation-reroll"]')!;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    b.click();
    expect(moved.run).not.toHaveBeenCalled();
    document.body.innerHTML = '';
    const ok = mountComms([], { enabled: true });
    ok.host.querySelector<HTMLButtonElement>('[data-action="generation-reroll"]')!.click();
    expect(ok.run).toHaveBeenCalledWith('unit_ann');
  });

  it("shows a quiet initiative nowhere and another soldier's reply not in this thread", () => {
    const m = mountComms([rec('dm.initiate', 'unit_ann:1:morning'), rec('dm.reply', 'unit_bea:m9')], null);
    expect(chipCount(m.host)).toBe(0);
  });
});

// ---- dilemma

describe('the dilemma card', () => {
  const draw = (records: GenerationRecord[], scapegoat = false) => {
    const state = withRecords(campaign(reg, 4), ...records);
    const { ui, generations, release } = fakeUi();
    const host = h('div');
    document.body.append(host);
    renderDilemma(host, {
      title: 'A call', setup: 'Decide.', scale: 'minor', waiting: false, options: [{ index: 0, label: 'Go', disabled: null, hasCheck: false }], onChoose: vi.fn(),
      generation: { ui, state, id: 'dil_1' },
      ...(scapegoat ? { scapegoat: { subject: 'Ann', witnesses: [], options: {} } as never } : {}),
    });
    return { host, generations, release };
  };

  it('shows RETRY on the authored block and REROLL before an answer', async () => {
    const failed = draw([rec('dilemma.generate', 'dil_1', { fallbackApplied: true })]);
    expect(failed.host.querySelector('.alius-genfail')!.textContent).toContain('Decision text: the model refused.');
    expect(failed.host.querySelector('[data-action="generation-reroll"]')).toBeNull();
    btn(failed.host, 'generation-retry')!.click();
    expect(failed.generations.retry).toHaveBeenCalledOnce();
    await settle(failed);
    document.body.innerHTML = '';
    const fine = draw([]);
    fine.host.querySelector<HTMLButtonElement>('[data-action="generation-reroll"]')!.click();
    expect(fine.generations.reroll).toHaveBeenCalledWith('dilemma.generate', 'dil_1');
  });

  it('a scapegoat case is never worded by the model, so it has neither', () => {
    const m = draw([], true);
    expect(m.host.querySelector('[data-action="generation-reroll"]')).toBeNull();
  });
});

// ---- report

describe('the after-action report', () => {
  const finished = (recap?: string): CampaignState => {
    const { state, mission } = withMission(reg, campaign(reg, 4));
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.objectiveDone = true;
    const done = dispatch(s, { type: 'expedition/return', payload: {} }, reg).state;
    if (recap) done.lastExpedition!.recap = recap;
    return done;
  };
  const mount = (state: CampaignState) => {
    const { ui, generations } = fakeUi();
    const host = h('div');
    document.body.append(host);
    const controller = { acknowledge: vi.fn(), debrief: vi.fn(), requestRecap: vi.fn() } as unknown as ExpeditionController;
    renderExpeditionScreen(host, { getState: () => state, registries: reg, settings: () => DEFAULT_SETTINGS, controller, onClose: vi.fn(), generation: ui });
    return { host, generations };
  };

  it('shows a recap chip, then REROLL', () => {
    const s = finished();
    const failed = mount(withRecords(s, rec('expedition.recap', s.lastExpedition!.id, { reason: 'truncated' })));
    expect(failed.host.querySelector('.alius-genfail')!.textContent).toContain('After-action recap: the answer was cut off at');
    document.body.innerHTML = '';
    const done = mount(finished('The squad came back.'));
    expect(done.host.querySelector('.alius-genfail')).toBeNull();
    done.host.querySelector<HTMLButtonElement>('[data-action="generation-reroll"]')!.click();
    expect(done.generations.reroll).toHaveBeenCalledWith('expedition.recap', expect.any(String));
  });
});

// ---- hub

describe('the hub', () => {
  const mount = (state: CampaignState, lastScene?: HubCtx['lastScene']) => {
    const { ui, generations } = fakeUi();
    const ctx: HubCtx = {
      getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
      ops: { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
      onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null, generation: ui, ...(lastScene ? { lastScene } : {}),
    };
    const host = h('div', { id: 'alius-shell' });
    document.body.append(host);
    renderHub(host, h('div'), ctx);
    return { host, generations };
  };

  it('lists a failed summary and a held director tick with USE FALLBACK', () => {
    const state = withRecords(campaign(reg, 4), rec('scene.summary', 's1'), rec('director.tick', 'req1'), rec('scene.digest', 's1:3', { quiet: true }));
    const m = mount(state);
    const block = m.host.querySelector('.alius-generation-failed')!;
    expect(block.querySelector('h2')!.textContent).toBe('FAILED');
    expect([...block.querySelectorAll('.alius-genfail')].map((c) => c.getAttribute('data-site'))).toEqual(['scene.summary', 'director.tick']);
    expect(block.querySelectorAll('[data-action="generation-fallback"]').length).toBe(1);
    expect(block.querySelector('.alius-genfail[data-site="director.tick"] [data-action="generation-fallback"]')).not.toBeNull();
    block.querySelector<HTMLButtonElement>('.alius-genfail[data-site="director.tick"] [data-action="generation-fallback"]')!.click();
    expect(m.generations.useFallback).toHaveBeenCalledWith('g_director.tick_req1');
  });

  it('puts REROLL on the last scene while its summary can be asked for again, and draws no block when nothing failed', () => {
    const run = vi.fn(async () => {});
    const m = mount(campaign(reg, 4), { state: () => ({ enabled: true }), run });
    m.host.querySelector<HTMLButtonElement>('.alius-last-scene [data-action="generation-reroll"]')!.click();
    expect(run).toHaveBeenCalledOnce();
    document.body.innerHTML = '';
    const none = mount(campaign(reg, 4), { state: () => ({ enabled: false, reason: 'No scene has ended yet.' }), run });
    expect(none.host.querySelector('.alius-generation-failed')).toBeNull();
  });
});

// ---- end screen, base, warden

describe('the END screen', () => {
  it('rerolls the epilogue and shows a failed one as a chip', () => {
    const out = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann')],
      mode: { kind: 'leashswap', deathRule: 'campaign_end', warden: { by: 'player', index: 0 } },
    }, reg, { desireBondDefects: false, seed: 3 });
    if (!out.ok) throw new Error(out.errors.join('; '));
    const s = out.state;
    s.ended = { day: 7, cause: 'terminated', epilogue: 'The squad held the gate.' };
    const ok = fakeUi();
    const host = h('div');
    document.body.append(host);
    renderEndScreen(host, s, { onExport: vi.fn(), generation: ok.ui });
    host.querySelector<HTMLButtonElement>('[data-action="generation-reroll"]')!.click();
    expect(ok.generations.reroll).toHaveBeenCalledWith('warden.epilogue', 'epilogue');
    const lost = structuredClone(s);
    delete lost.ended!.epilogue;
    withRecords(lost, rec('warden.epilogue', 'epilogue'));
    const host2 = h('div');
    renderEndScreen(host2, lost, { onExport: vi.fn(), generation: fakeUi().ui });
    expect(host2.querySelector('.alius-genfail')!.textContent).toContain('Epilogue: the model refused.');
    expect(host2.querySelector('[data-action="generation-reroll"]')).toBeNull();
    // the only other button is still EXPORT
    expect([...host2.querySelectorAll('button')].map((b) => b.getAttribute('data-action'))).toEqual(['generation-retry', 'generation-menu', 'export']);
  });
});

describe('BASE and WARDEN', () => {
  it('a grunt row has REROLL for her name', () => {
    const state = campaign(reg, 4);
    state.squad.find((u) => u.id === 'unit_dee')!.kind = 'grunt';
    const { ui, generations } = fakeUi();
    const host = h('div');
    document.body.append(host);
    renderBaseTab(host, {
      getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onUpgrade: vi.fn(), onRecruit: vi.fn(), onSetRoster: vi.fn(), generation: ui,
    });
    const rerolls = host.querySelectorAll<HTMLButtonElement>('.alius-roster-row [data-action="generation-reroll"]');
    expect(rerolls.length).toBe(1);
    rerolls[0].click();
    expect(generations.reroll).toHaveBeenCalledWith('flavor.grunt', 'unit_dee');
  });

  it("the warden's agenda can be rerolled while it is the fallback", () => {
    const out = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
      mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
    }, reg, { desireBondDefects: false, seed: 4 });
    if (!out.ok) throw new Error(out.errors.join('; '));
    const s = out.state;
    const w = wardenOf(s)!;
    const { ui, generations } = fakeUi();
    const drawIt = (agenda: 'fallback' | 'model') => {
      w.agenda = agenda;
      const host = h('div');
      document.body.append(host);
      renderWardenPanel(host, s, reg, { generation: ui });
      return host;
    };
    drawIt('fallback').querySelector<HTMLButtonElement>('[data-action="generation-reroll"]')!.click();
    expect(generations.reroll).toHaveBeenCalledWith('warden.agenda', `${w.unitId}:${w.sinceDay}`);
    expect(drawIt('model').querySelectorAll('[data-action="generation-reroll"]').length).toBe(0); // a model agenda is not rerolled here
  });
});

// ---- cross-surface

describe('every surface', () => {
  it('a pending retry disables its buttons until it settles', async () => {
    const m = mountScene((id) => [rec('scene.intents', `${id}:0-2`)]);
    btn(m.host, 'generation-retry')!.click();
    expect(m.redraw).toHaveBeenCalled(); // redraws at once so the buttons wait
    await settle(m);
    expect(m.redraw.mock.calls.length).toBeGreaterThanOrEqual(2); // and again when the call settled
  });

  it('marks and explains every chip and button it draws', () => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ['unit_ann'], origin: 'event', startIndex: 0 } });
    const m = mountScene((id) => [rec('scene.intents', `${id}:0-2`)]);
    expect(markedWithout(m.host)).toEqual([]);
    expect(unreachable(m.host.querySelector('.alius-generation-chips') as HTMLElement)).toEqual([]);
    expect(unresolved(m.host.querySelector('.alius-generation-chips') as HTMLElement, { registries: reg, state: r.state, settings: DEFAULT_SETTINGS })).toEqual([]);
  });

  it('quiet records show on no surface', () => {
    const quiet = [
      rec('scene.digest', 'x:1', { quiet: true }), rec('dm.initiate', 'unit_ann:1:morning', { quiet: true }), rec('flavor.grunt', 'unit_dee', { quiet: true }),
      rec('flavor.demand', 'd1', { quiet: true }), rec('warden.agenda', 'unit_bea:1', { quiet: true }), rec('memory.rumor', 'f1', { quiet: true }), rec('activity.vignette', 'a:u:1:m', { quiet: true }),
    ];
    const hub = (() => {
      const { ui } = fakeUi();
      const state = withRecords(campaign(reg, 4), ...quiet);
      const host = h('div', { id: 'alius-shell' });
      document.body.append(host);
      renderHub(host, h('div'), {
        getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
        ops: { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
        onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null, generation: ui,
      });
      return host;
    })();
    expect(hub.querySelector('.alius-genfail')).toBeNull();
    expect(hub.querySelector('.alius-generation-failed')).toBeNull();
    const comms = mountComms(quiet, null);
    expect(chipCount(comms.host)).toBe(0);
  });
});
