// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp, type AliusApp } from '../../src/app';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import type { SetupResult } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createOnboarding } from '../../src/onboarding/controller';
import { FakeStAdapter } from '../../src/st/fake';
import { campaign, loadCore, run } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  reg = await loadCore();
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
afterEach(() => {
  document.body.innerHTML = '';
});

const report = (over = {}) => ({ id: 'r1', missionId: 'm_t', debriefed: false, acknowledged: true, party: ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'], ...over }) as never;
const flush = () => new Promise((r) => setTimeout(r, 0));

function rig(tweak: (s: CampaignState) => void = () => {}) {
  const s = campaign(reg, 4, { onboarding: 'prologue' });
  s.onboarding!.stepId = 'debrief';
  s.onboarding!.tutorialMissionId = 'm_t';
  s.lastExpedition = report();
  tweak(s);
  const h = worldHarness(reg, s);
  const spies = { initiateDm: vi.fn(async () => {}), talkAt: vi.fn(async (_u: string, _l: string) => true), debrief: vi.fn(async (_ids: string[]) => true) };
  let ob!: ReturnType<typeof createOnboarding>;
  const ctx = new ContextBuilder();
  ob = createOnboarding({
    ...h.deps, context: ctx, refreshContext: vi.fn(), modal: vi.fn(async () => null) as never, resumeScene: vi.fn(), openExpedition: vi.fn(),
    startScene: async () => true, endScene: async () => {}, ...spies,
  });
  const act = (type: string, payload?: unknown): EngineEvent[] => {
    const events = h.app().dispatch({ type, payload });
    ob.onEvents(events);
    return events;
  };
  return { h, ob, act, ...spies };
}

describe('the debrief step', () => {
  it('debriefTutorial talks to the party of the tutorial report', async () => {
    const r = rig();
    expect(await r.ob.debriefTutorial()).toBe(true);
    expect(r.debrief).toHaveBeenCalledWith(['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee']);
  });

  it('leaves out the dead and the confined, and refuses with nobody', async () => {
    const r = rig((s) => {
      s.squad[0].status = 'dead';
      s.discipline = { restrictions: [{ id: 'r1', unitId: 'unit_bea', kind: 'confined', untilDay: 9 }] } as never;
    });
    await r.ob.debriefTutorial();
    expect(r.debrief).toHaveBeenCalledWith(['unit_cat', 'unit_dee']);
    const none = rig((s) => { s.squad.forEach((u) => { u.status = 'dead'; }); });
    expect(await none.ob.debriefTutorial()).toBe(false);
    expect(none.debrief).not.toHaveBeenCalled();
  });

  it('marking the report debriefed completes the step, from the card or from the report screen alike', async () => {
    const r = rig();
    r.act('expedition/mark_debriefed', {});
    await flush();
    expect(r.h.state().onboarding).toMatchObject({ stepId: 'first_evening', completed: expect.arrayContaining(['debrief']) });
  });

  it('a debrief of a report that is not the tutorial\'s does not complete it', async () => {
    const r = rig((s) => { s.lastExpedition = report({ missionId: 'm_other' }); });
    r.act('expedition/mark_debriefed', {});
    await flush();
    expect(r.h.state().onboarding!.stepId).toBe('debrief');
  });

  it('does nothing on another step', async () => {
    const r = rig((s) => { s.onboarding!.stepId = 'lineup'; });
    expect(await r.ob.debriefTutorial()).toBe(false);
  });
});

describe('the first evening', () => {
  const evening = (tweak: (s: CampaignState) => void = () => {}) =>
    rig((s) => { s.onboarding!.stepId = 'first_evening'; s.onboarding!.guideUnitId = 'unit_cat'; tweak(s); });

  it('entering first_evening sends one initiated DM from the guide', async () => {
    const r = rig((s) => { s.lastExpedition = report({ debriefed: true }); s.relations.unit_dee.affinity = 60; });
    r.act('onboarding/complete_step', { stepId: 'debrief' });
    await flush();
    expect(r.initiateDm).toHaveBeenCalledTimes(1);
    expect(r.initiateDm).toHaveBeenCalledWith('unit_dee');
  });

  it('waits for an open scene to close before the DM goes out', async () => {
    const r = rig((s) => { s.lastExpedition = report({ debriefed: true }); });
    r.act('scene/start', { locationId: 'garage', participants: ['unit_ann'], origin: 'debrief', startIndex: 0, consumesSlot: false });
    r.act('onboarding/complete_step', { stepId: 'debrief' });
    await flush();
    expect(r.initiateDm).not.toHaveBeenCalled();
    r.act('scene/end', {});
    await flush();
    expect(r.initiateDm).toHaveBeenCalledTimes(1);
  });

  it('next day completes the step and ends the prologue', async () => {
    const r = evening();
    r.h.setState((s) => { s.day += 1; });
    r.ob.onEvents([{ type: 'day_started', day: r.h.state().day }]);
    await flush();
    expect(r.h.state().onboarding).toMatchObject({ stepId: 'free', done: true });
  });

  it('the same day completes nothing', async () => {
    const r = evening();
    r.ob.onEvents([{ type: 'day_started', day: r.h.state().day }]);
    await flush();
    expect(r.h.state().onboarding!.stepId).toBe('first_evening');
  });

  it('a new day during the line-up does not complete the line-up', async () => {
    const r = rig((s) => { s.onboarding!.stepId = 'lineup'; });
    r.h.setState((s) => { s.day += 1; });
    r.ob.onEvents([{ type: 'day_started', day: 2 }]);
    await flush();
    expect(r.h.state().onboarding!.stepId).toBe('lineup');
  });

  it('talkGuide opens a talk with her in the room she is in', async () => {
    const r = evening();
    expect(await r.ob.talkGuide()).toBe(true);
    expect(r.talkAt).toHaveBeenCalledTimes(1);
    expect(r.talkAt.mock.calls[0][0]).toBe('unit_cat');
    expect(typeof r.talkAt.mock.calls[0][1]).toBe('string');
    expect(reg.locations.has(r.talkAt.mock.calls[0][1] as string)).toBe(true);
  });

  it('talkGuide refuses with no guide or a guide who is gone', async () => {
    expect(await evening((s) => { delete s.onboarding!.guideUnitId; }).ob.talkGuide()).toBe(false);
    const gone = evening((s) => { s.squad.find((u) => u.id === 'unit_cat')!.status = 'dead'; });
    expect(await gone.ob.talkGuide()).toBe(false);
    expect(gone.talkAt).not.toHaveBeenCalled();
  });
});

describe('unlock notices (in the app)', () => {
  const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  const unit = (name: string) => ({
    cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId: 'assault',
    signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
    defects: [{ id: 'threat_saturation', origin: 'Three tours.' }], values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
    baseline: { trust: 20, affinity: 0, attraction: 0 },
  });
  const setup = (): SetupResult => ({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit('Rhea'), unit('Mira')],
    onboarding: { prologueId: 'prologue_vesper', veteran: false },
  });

  async function boot() {
    const st = new FakeStAdapter({ chatId: 'solo', isGroup: false });
    st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }, { avatar: 'mira.png', name: 'Mira' }];
    for (const [avatar, name] of [['rhea.png', 'Rhea'], ['mira.png', 'Mira']]) st.cards.set(avatar, { avatar, name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
    const toasts: Array<{ kind: string; text: string; voice?: string }> = [];
    const locks = new Map<string, boolean>();
    const shell = {
      open: vi.fn(), close() {}, isOpen: () => true, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {}, setTabBadge() {},
      setTabLocked: (id: string, locked: boolean) => { locks.set(id, locked); },
      toast: (kind: string, text: string, o?: { voice?: string }) => { toasts.push({ kind, text, ...(o?.voice ? { voice: o.voice } : {}) }); },
      async modal() { return null; }, setPalette() {}, refresh: vi.fn(), destroy() {},
    };
    const app: AliusApp = createApp(st, { loadContent: async () => content, shellFactory: () => shell as never });
    await app.start();
    expect(await app.deployCampaign(setup(), 'new_group')).toBe(true);
    return { app, toasts, locks };
  }

  it('a new prologue campaign locks ops, map, base and inv', async () => {
    const t = await boot();
    expect([...t.locks].filter(([, locked]) => locked).map(([id]) => id).sort()).toEqual(['base', 'inv', 'map', 'ops']);
    expect(t.locks.get('squad')).toBeFalsy();
  });

  it('an unlock shows a terminal toast with the notice, and the tab opens', async () => {
    const t = await boot();
    t.toasts.length = 0;
    const s = structuredClone(t.app.current().state!);
    s.onboarding!.stepId = 'tutorial';
    s.onboarding!.completed = [...s.onboarding!.completed, 'first_words'];
    t.app.replaceState(s);
    t.toasts.length = 0;
    const events = t.app.dispatch({ type: 'onboarding/skip_step', payload: { stepId: 'tutorial' } });
    expect(events.some((e) => e.type === 'error')).toBe(false);
    const notices = t.toasts.filter((x) => /MODULE ONLINE/.test(x.text));
    expect(notices.map((x) => x.text).sort()).toEqual(['MODULE ONLINE: INV', 'MODULE ONLINE: MAP', 'MODULE ONLINE: OPS']);
    expect(notices.every((x) => x.voice === 'terminal' && x.kind === 'info')).toBe(true);
    expect(t.locks.get('ops')).toBe(false);
    expect(t.locks.get('map')).toBe(false);
    expect(t.locks.get('inv')).toBe(false);
    expect(t.locks.get('base')).toBe(true);
  });

  it('an old campaign locks nothing and announces nothing', async () => {
    const st = new FakeStAdapter({ chatId: 'solo', isGroup: false });
    st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }];
    st.cards.set('rhea.png', { avatar: 'rhea.png', name: 'Rhea', description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
    const locks = new Map<string, boolean>();
    const shell = {
      open: vi.fn(), close() {}, isOpen: () => true, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {}, setTabBadge() {},
      setTabLocked: (id: string, l: boolean) => { locks.set(id, l); }, toast() {}, async modal() { return null; }, setPalette() {}, refresh: vi.fn(), destroy() {},
    };
    const app = createApp(st, { loadContent: async () => content, shellFactory: () => shell as never });
    await app.start();
    const noPrologue: SetupResult = { ...setup(), units: [unit('Rhea')] };
    delete noPrologue.onboarding;
    expect(await app.deployCampaign(noPrologue, 'new_group')).toBe(true);
    expect([...locks.values()].some(Boolean)).toBe(false);
  });
});
