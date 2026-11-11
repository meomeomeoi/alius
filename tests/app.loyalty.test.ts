// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type AliusApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import { loyaltyRecord } from '../src/engine/loyalty/state';
import { seedRng } from '../src/engine/rng';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { offerMission } from '../src/engine/world/missions';
import { Rng } from '../src/engine/rng';
import type { NodeMap } from '../src/engine/world/types';
import { FakeStAdapter } from '../src/st/fake';
import { h } from '../src/ui/dom';
import type { ModalOpts } from '../src/ui/shell/modal';

const SOLO = { chatId: 'solo', isGroup: false };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
afterEach(() => {
  document.body.innerHTML = '';
});

const unit = (name: string, roleId = 'assault', values = ZERO) => ({
  cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId,
  signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
  values: { ...values }, likes: [], dislikes: [], triggers: [],
  baseline: { trust: 40, affinity: 10, attraction: 0 },
});
const setupResult = (): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'purge',
  units: [unit('Rhea', 'assault', { ...ZERO, mercy: 3 }), unit('Mira', 'defender', { ...ZERO, mercy: -3 })],
});
const RHEA = 'unit_rhea';
const MIRA = 'unit_mira';

function scriptedShell() {
  const script: Array<(opts: ModalOpts) => Promise<string | null>> = [];
  const modals: ModalOpts[] = [];
  const toasts: Array<{ kind: string; text: string }> = [];
  const screenRenderers = new Map<string, (host: HTMLElement) => void>();
  const tabRenderers = new Map<string, (host: HTMLElement) => void>();
  const screens: string[] = [];
  const shell = {
    open: vi.fn(), close() {}, isOpen: () => true,
    showScreen(id: string) { screens.push(id); }, showTab() {},
    registerTab(id: string, r: (host: HTMLElement) => void) { tabRenderers.set(id, r); },
    registerScreen(id: string, r: (host: HTMLElement) => void) { screenRenderers.set(id, r); },
    setTabBadge() {},
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal(opts: ModalOpts) {
      modals.push(opts);
      const next = script.shift();
      return next ? next(opts) : null;
    },
    closeModal: vi.fn(),
    setPalette() {}, refresh: vi.fn(), destroy() {},
  };
  return { shell, script, modals, toasts, screenRenderers, tabRenderers, screens };
}

async function boot(opts: { st?: FakeStAdapter; deploy?: boolean; settings?: Record<string, unknown> } = {}) {
  const st = opts.st ?? new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }, { avatar: 'mira.png', name: 'Mira' }];
  for (const [avatar, name] of [['rhea.png', 'Rhea'], ['mira.png', 'Mira']]) {
    st.cards.set(avatar, { avatar, name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  }
  st.settings.unitDms = false;
  st.settings.chronicleCompaction = false;
  st.settings.directorEnabled = false;
  Object.assign(st.settings, opts.settings ?? {});
  const sh = scriptedShell();
  const app: AliusApp = createApp(st, {
    loadContent: async () => content, shellFactory: () => sh.shell as never, assetUrl: (p) => `/${p}`, leashDelayMs: 0,
  });
  await app.start();
  if (opts.deploy !== false) {
    expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
    await settle();
  }
  const initialScreens = [...sh.screens];
  sh.toasts.length = 0;
  sh.screens.length = 0;
  sh.modals.length = 0;
  st.calls.length = 0;
  const state = (): CampaignState => app.current().state!;
  const edit = (f: (s: CampaignState) => void): void => {
    const s = structuredClone(state());
    f(s);
    app.replaceState(s);
  };
  const mount = (screen: string): HTMLElement => {
    const host = h('div');
    document.body.append(host);
    sh.screenRenderers.get(screen)!(host);
    return host;
  };
  const directives = (): string => app.context.build(state(), 5000).directives;
  return { st, app, sh, state, edit, mount, directives, initialScreens };
}
type Boot = Awaited<ReturnType<typeof boot>>;
const btn = (host: HTMLElement, label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent!.includes(label)) as HTMLButtonElement | undefined;
const eff = (kind: string, target: string, direction: 1 | -1, magnitude = 'small') => ({ kind, target, direction, magnitude });
const RATIONS = JSON.stringify({
  title: 'Short rations', setup: 'The mess hall is short again.',
  options: [
    { label: 'Cut portions', effects: [eff('resource', 'supplies', 1), eff('stress', 'squad', 1)] },
    { label: 'Buy on the black market', effects: [eff('resource', 'supplies', 1), eff('resource', 'credits', -1), eff('faction', 'sable', 1)] },
  ],
});
const VESPER = JSON.stringify({
  title: 'The evidence', setup: 'Three buyers, one chance.',
  options: [
    { label: 'Hand it to Vesper', effects: [eff('flag', 'evidence_delivered_vesper', 1), eff('faction', 'vesper', 1, 'medium'), eff('faction', 'aurum', -1, 'medium')] },
    { label: 'Sell it to Aurum', effects: [eff('flag', 'evidence_sold_aurum', 1), eff('resource', 'credits', 1, 'large'), eff('faction', 'vesper', -1, 'large'), eff('unit_event', 'mercy', -1, 'medium')] },
    { label: 'Bury it', effects: [eff('flag', 'evidence_buried', 1), eff('clock', 'oversight', 1), eff('stress', 'squad', -1)] },
  ],
});
const requestRations = (t: Boot) => t.app.dispatch({ type: 'dilemma/request', payload: { templateId: 'dil_rations', context: 'base' } });

describe('loading', () => {
  it('loading a pre-P6 campaign seeds the Leash once', async () => {
    const t = await boot();
    t.edit((s) => { s.leash = { authorizationsLeft: 0, refreshDay: 1, log: [] }; });
    const again = await boot({ st: t.st, deploy: false });
    expect(again.state().leash).toMatchObject({ authorizationsLeft: 3, refreshDay: 8, seeded: true });
    again.edit((s) => { s.leash.authorizationsLeft = 1; });
    const third = await boot({ st: t.st, deploy: false });
    expect(third.state().leash.authorizationsLeft).toBe(1);
  });
});

describe('dilemmas', () => {
  it('a requested dilemma is generated, presented and blocks an activity until chosen', async () => {
    const t = await boot();
    t.st.mainReplies = [RATIONS];
    requestRations(t);
    await settle();
    expect(t.state().dilemmas!.open).toMatchObject({ status: 'presented', source: 'model', title: 'Short rations' });
    expect(t.st.calls).toHaveLength(1);
    // the panel opened as a modal over the PDA
    const modal = t.sh.modals.at(-1)!;
    expect(modal.title).toBe('DECISION');
    const body = modal.body as HTMLElement;
    expect(body.textContent).toContain('Short rations');
    const blocked = t.app.dispatch({ type: 'activity/do', payload: { activityId: 'rest' } });
    expect(blocked).toMatchObject([{ type: 'error', code: 'dilemma_open' }]);
    // a blocked action brings the decision back
    expect(t.sh.modals.at(-1)).not.toBe(modal);
    const panel = t.sh.modals.at(-1)!.body as HTMLElement;
    btn(panel, 'Cut portions')!.click();
    expect(t.state().dilemmas!.open).toBeUndefined();
    expect(t.app.dispatch({ type: 'activity/do', payload: { activityId: 'rest' } }).some((e) => e.type === 'error')).toBe(false);
  });

  it('with no mechanic profile the authored fallback is presented', async () => {
    const t = await boot({ settings: { mechanicFallbackToMain: false } });
    t.st.mainReplies = [RATIONS];
    requestRations(t);
    await settle();
    expect(t.st.calls).toHaveLength(0);
    expect(t.state().dilemmas!.open).toMatchObject({ status: 'presented', source: 'fallback' });
    expect((t.sh.modals.at(-1)!.body as HTMLElement).textContent).toContain('Short rations');
  });

  it('with the setting off the authored block is shown and the model is not asked', async () => {
    const t = await boot({ settings: { dilemmasEnabled: false } });
    t.st.mainReplies = [RATIONS];
    requestRations(t);
    await settle();
    expect(t.st.calls).toHaveLength(0);
    expect(t.state().dilemmas!.open!.source).toBe('fallback');
  });

  it('a chosen base dilemma sets the aftermath directive and names the people it moved', async () => {
    const t = await boot();
    t.st.mainReplies = [RATIONS];
    requestRations(t);
    await settle();
    // the second option carries a value-axis event in the fallback; the generated one is plain: choose it
    btn(t.sh.modals.at(-1)!.body as HTMLElement, 'Buy on the black market')!.click();
    await settle();
    expect(t.directives()).toContain('The commander has just decided "Short rations": Buy on the black market.');
    expect(t.directives()).toContain('Narrate the immediate aftermath');
  });

  it('a decision that moved people suggests talking to them', async () => {
    const t = await boot({ settings: { mechanicFallbackToMain: false } });
    t.st.settings.dilemmasEnabled = false;
    t.app.dispatch({ type: 'dilemma/request', payload: { templateId: 'dil_rations', context: 'base' } });
    await settle();
    // the fallback's first option carries a value-axis event: Rhea (mercy +3) and Mira (mercy −3) both move
    btn(t.sh.modals.at(-1)!.body as HTMLElement, 'Cut everyone')!.click();
    await settle();
    const toast = t.sh.toasts.find((x) => /Rhea|Mira/.test(x.text) && /decision/i.test(x.text));
    expect(toast).toBeDefined();
    expect(t.sh.modals.some((m) => m.title === 'Talk it over?')).toBe(true);
  });

  it('a pinned expedition event with a generate block becomes a dilemma and finishes the node', async () => {
    const t = await boot();
    let missionId = '';
    t.edit((s) => {
      missionId = offerMission(s, { registries: content.registries, rng: new Rng(s.rng) }, { templateId: 'tpl_vesper_beat_4', regionId: 'quarantine_d7', source: 'story', spineBeat: 'beat_4' }).mission!.id;
    });
    t.app.expedition.plan({ missionId });
    const ids = t.state().roster.activeIds;
    expect(t.app.expedition.launch({ unitIds: ids, formation: { front: ids.slice(0, 1), back: ids.slice(1) }, supplies: 2 })).toBe(true);
    const map: NodeMap = {
      layers: [['n0_0']], objectiveId: 'obj',
      nodes: { n0_0: { id: 'n0_0', layer: 0, type: 'cache', edges: ['obj'], visited: false }, obj: { id: 'obj', layer: 1, type: 'objective', edges: [], visited: false } },
    };
    t.edit((s) => { s.expedition!.map = map; });
    t.st.mainReplies = [VESPER];
    t.app.expedition.move('n0_0');
    t.app.expedition.move('obj');
    await settle();
    expect(t.state().dilemmas!.open).toMatchObject({ status: 'presented', source: 'model', context: 'expedition_event', scale: 'defining' });
    // no modal: the expedition screen shows it
    expect(t.sh.modals.some((m) => m.title === 'DECISION')).toBe(false);
    const screen = t.mount('expedition');
    expect(screen.textContent).toContain('The evidence');
    btn(screen, 'Bury it')!.click();
    expect(t.state().world.flags).toContain('evidence_buried');
    expect(t.state().expedition!.phase).toBe('travel');
    expect(t.state().expedition!.objectiveDone).toBe(true);
  });
});

describe('confrontations', () => {
  /** A desertion waiting at night, as the day end leaves it. */
  async function desertionNight(t: Boot, over: Partial<NonNullable<CampaignState['disloyalty']>['open']> = {}): Promise<void> {
    t.edit((s) => {
      const entry = { id: 'n_d', unitId: RHEA, kind: 'desertion', priority: 95, framing: 'Rhea is about to walk out.', ignore: { event: 'dismissed', severity: 'moderate' as const }, expiresDay: s.day + 2 };
      s.slot = 'evening';
      s.calendar.nightEventsQueue.push(entry);
      loyaltyRecord(s, RHEA).attempts = 1;
      s.disloyalty!.open = { kind: 'desertion', unitId: RHEA, day: s.day, at: 'night', nightEntryId: 'n_d', ...over };
    });
    t.app.dispatch({ type: 'calendar/consume_slot', payload: {} }); // the day ends and the night begins
    await settle();
    expect(t.state().slot).toBe('night');
  }

  it('a desertion night shows the confrontation, not the knock', async () => {
    const t = await boot();
    await desertionNight(t);
    const host = t.mount('scene');
    expect(host.textContent).toContain('DESERTION');
    expect(host.textContent).toContain('Rhea is about to walk out.');
    expect(btn(host, '[LET HER GO]')).toBeDefined();
    expect(host.textContent).not.toContain('[ OPEN ]');
    // answering lets her go and returns to the PDA
    btn(host, '[LET HER GO]')!.click();
    expect(t.state().squad.find((u) => u.id === RHEA)!.status).toBe('deserted');
    expect(t.state().slot).toBe('morning');
    expect(t.sh.screens.at(-1)).toBe('pda');
  });

  it('a failed talk-down keeps the panel without the talk options', async () => {
    const t = await boot();
    await desertionNight(t);
    t.edit((s) => { s.commander.socialStats.authority = 1; s.relations[RHEA].trust = 4; s.squad[0].stress = 90; });
    let host = t.mount('scene');
    for (let seed = 1; seed <= 60; seed++) {
      t.edit((s) => { s.rng = seedRng(seed); delete s.disloyalty!.open!.talkTried; });
      host = t.mount('scene');
      btn(host, 'TALK HER DOWN — AUTHORITY')!.click();
      if (t.state().disloyalty?.open?.talkTried) break;
      await desertionNight(t);
    }
    expect(t.state().disloyalty!.open!.talkTried).toBe(true);
    host = t.mount('scene');
    expect(btn(host, 'TALK HER DOWN')).toBeUndefined();
    expect(btn(host, '[LET HER GO]')).toBeDefined();
  });

  it('reload with an open confrontation shows it again', async () => {
    const t = await boot();
    await desertionNight(t);
    await settle();
    const again = await boot({ st: t.st, deploy: false });
    expect(again.state().disloyalty!.open!.kind).toBe('desertion');
    expect(again.mount('scene').textContent).toContain('[LET HER GO]');
    expect(again.initialScreens).toContain('scene');
  });

  it('a mission-start desertion opens the same panel as a modal', async () => {
    const t = await boot();
    let missionId = '';
    t.edit((s) => {
      missionId = offerMission(s, { registries: content.registries, rng: new Rng(s.rng) }, { templateId: 'tpl_recover', regionId: 'quarantine_d7', source: 'command' }).mission!.id;
      Object.assign(s.relations[RHEA], { trust: 0, affinity: -100, loyaltyBand: 'breaking' });
      loyaltyRecord(s, RHEA).signs.push({ day: s.day - 2, about: 'desertion', kind: 'fact', signId: 'x' });
    });
    t.app.expedition.plan({ missionId });
    const ids = t.state().roster.activeIds;
    for (let seed = 1; seed <= 100 && !t.state().disloyalty?.open; seed++) {
      t.edit((s) => { s.rng = seedRng(seed); });
      t.app.expedition.launch({ unitIds: ids, formation: { front: ids.slice(0, 1), back: ids.slice(1) }, supplies: 2 });
    }
    await settle();
    expect(t.state().disloyalty!.open).toMatchObject({ kind: 'desertion', at: 'mission_start' });
    const modal = t.sh.modals.at(-1)!;
    expect(modal.title).toMatch(/DESERTION/);
    expect((modal.body as HTMLElement).textContent).toContain('[LET HER GO]');
  });

  it('fight starts a combat against her and its end resolves the mutiny once', async () => {
    const t = await boot();
    t.edit((s) => {
      const rhea = s.squad.find((u) => u.id === RHEA)!;
      rhea.baseStats = { hp: 20, atk: 2, def: 0, spd: 1, crit: 0 };
      rhea.currentHp = 20;
      const entry = { id: 'n_m', unitId: RHEA, kind: 'mutiny', priority: 100, framing: 'Rhea is not alone.', ignore: { event: 'dismissed', severity: 'major' as const }, expiresDay: s.day + 2 };
      s.slot = 'night';
      s.calendar.nightEvent = entry;
      s.disloyalty ??= { units: {} };
      s.disloyalty.open = { kind: 'mutiny', unitId: RHEA, day: s.day, at: 'night', nightEntryId: 'n_m', sympathizers: [] };
    });
    const host = t.mount('scene');
    expect(btn(host, '[FIGHT]')).toBeDefined();
    btn(host, '[FIGHT]')!.click();
    const cs = t.state().combat!;
    expect(cs.encounter.mutineers).toEqual([{ unitId: RHEA }]);
    expect(t.state().disloyalty!.open!.combatId).toBe(cs.id);
    expect(t.sh.screens).toContain('combat');
    t.app.dispatch({ type: 'combat/auto', payload: { on: true } });
    await settle();
    expect(t.state().combat).toBeUndefined();
    expect(t.state().disloyalty!.open).toBeUndefined();
    expect(t.state().relations[RHEA].stateId).toBe('resentful');
    expect(t.sh.toasts.filter((x) => /subdued|put down/i.test(x.text))).toHaveLength(1);
    // nothing is resolved twice
    expect(t.app.dispatch({ type: 'loyalty/resolve_mutiny' }).some((e) => e.type === 'error')).toBe(true);
  });

  it('a terminated unit is removed from the active chat members', async () => {
    const t = await boot();
    expect(t.st.members.filter((m) => m.active).map((m) => m.avatar)).toContain('rhea.png');
    t.edit((s) => { loyaltyRecord(s, RHEA).cause = { kind: 'attack', day: s.day }; });
    for (let seed = 1; seed <= 80; seed++) {
      t.edit((s) => { s.rng = seedRng(seed); delete s.disloyalty!.units[RHEA].deniedDay; });
      t.app.dispatch({ type: 'leash/terminate', payload: { unitId: RHEA } });
      await settle();
      if (t.state().squad.find((u) => u.id === RHEA)!.status === 'terminated') break;
    }
    expect(t.state().squad.find((u) => u.id === RHEA)!.status).toBe('terminated');
    expect(t.st.members.find((m) => m.avatar === 'rhea.png')!.active).toBe(false);
    expect(t.st.members.find((m) => m.avatar === 'mira.png')!.active).toBe(true);
    expect(t.sh.toasts.some((x) => /Rhea/.test(x.text) && /terminat/i.test(x.text))).toBe(true);
  });
});

describe('the Leash in scenes', () => {
  async function inScene(t: Boot): Promise<void> {
    expect(await t.app.startScene({ locationId: 'mess_hall', participants: [RHEA], origin: 'event' })).toBe(true);
    t.edit((s) => { s.scene!.refusals = [{ unitId: RHEA, exchange: 0 }]; });
  }

  it('filing a Compel in a scene goes through the form and sets the compelled directive', async () => {
    const t = await boot();
    await inScene(t);
    t.sh.script.push(async () => 'file');
    const before = t.state().leash.authorizationsLeft;
    expect(await t.app.fileLeash('compel', RHEA)).toBe(true);
    expect(t.sh.modals[0].title).toMatch(/^OVERSIGHT REQUEST #0001$/);
    expect(t.state().leash.authorizationsLeft).toBe(before - 1);
    expect(t.directives()).toContain('Rhea has just been COMPELLED through the Leash');
    expect(t.state().scene!.refusals).toEqual([]);
  });

  it('withdrawing the form dispatches nothing', async () => {
    const t = await boot();
    await inScene(t);
    t.sh.script.push(async () => 'withdraw');
    const before = t.state();
    expect(await t.app.fileLeash('compel', RHEA)).toBe(false);
    expect(t.state()).toBe(before);
  });

  it('a request that cannot apply is refused before the form opens', async () => {
    const t = await boot();
    expect(await t.app.fileLeash('compel', RHEA)).toBe(false);
    expect(await t.app.fileLeash('suppress', RHEA)).toBe(false);
    expect(await t.app.fileLeash('terminate', RHEA)).toBe(false);
    expect(t.sh.modals).toHaveLength(0);
    expect(t.sh.toasts.filter((x) => x.kind !== 'info').length).toBeGreaterThanOrEqual(3);
  });

  it('a scene with a wavering unit carries the band directive and closing it clears it', async () => {
    const t = await boot();
    t.edit((s) => { Object.assign(s.relations[RHEA], { loyaltyBand: 'wavering', trust: 20 }); });
    expect(await t.app.startScene({ locationId: 'mess_hall', participants: [RHEA], origin: 'event' })).toBe(true);
    expect(t.directives()).toContain('Rhea openly doubts the commander in this scene');
    await t.app.scene.end();
    await settle();
    expect(t.directives()).not.toContain('openly doubts');
  });

  it('a chat switch clears refusal, trauma and aftermath directives', async () => {
    const t = await boot();
    for (const [id, text] of [['refusal:unit_rhea', 'REFUSAL TEXT'], ['loyalty:unit_rhea', 'BAND TEXT'], ['leash_trauma:unit_rhea', 'TRAUMA TEXT'], ['dilemma', 'AFTERMATH TEXT']] as const) {
      t.app.context.setDirective({ id, text, expiresAfter: 'scene' });
    }
    t.app.refreshContext();
    expect(t.directives()).toContain('AFTERMATH TEXT');
    t.st.emit('chat_changed');
    await settle();
    for (const gone of ['REFUSAL TEXT', 'BAND TEXT', 'TRAUMA TEXT', 'AFTERMATH TEXT']) expect(t.directives()).not.toContain(gone);
  });
});

describe('toasts', () => {
  it('a Leash use is announced with its number', async () => {
    const t = await boot();
    await t.app.startScene({ locationId: 'mess_hall', participants: [RHEA], origin: 'event' });
    t.edit((s) => { s.scene!.refusals = [{ unitId: RHEA, exchange: 0 }]; });
    t.sh.script.push(async () => 'file');
    await t.app.fileLeash('compel', RHEA);
    expect(t.sh.toasts.some((x) => /Oversight request #0001/i.test(x.text) && /compel/i.test(x.text))).toBe(true);
  });

  it('an arc that unlocks overnight is announced', async () => {
    const t = await boot();
    t.edit((s) => {
      s.day = 8;
      s.base.facilities.medbay = 5;
      Object.assign(s.relations[RHEA], { stateId: 'confidant', trust: 80, affinity: 30, loyaltyBand: 'steady' });
      s.slot = 'evening';
    });
    t.app.dispatch({ type: 'calendar/consume_slot', payload: {} });
    await settle();
    expect(t.sh.toasts.some((x) => /Rhea/.test(x.text) && /defect|arc|talk/i.test(x.text))).toBe(true);
  });

  it('a desertion sign that is a fact or a knock is announced, a DM is not (it shows in COMMS)', async () => {
    const t = await boot();
    const before = t.sh.toasts.length;
    t.edit((s) => {
      const rel = s.relations[RHEA];
      Object.assign(rel, { loyaltyBand: 'wavering', trust: 20 });
      loyaltyRecord(s, RHEA).nextDoubtDay = s.day;
      s.slot = 'evening';
    });
    t.app.dispatch({ type: 'calendar/consume_slot', payload: {} });
    await settle();
    const signs = t.state().disloyalty!.units[RHEA].signs;
    expect(signs).toHaveLength(1);
    const announced = t.sh.toasts.slice(before).some((x) => /Rhea/.test(x.text) && /concern|talk|noticed|seen|word/i.test(x.text));
    expect(announced).toBe(signs[0].kind !== 'dm');
  });
});
