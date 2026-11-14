// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type AliusApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { offerMission } from '../src/engine/world/missions';
import { Rng } from '../src/engine/rng';
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

const DIRECTOR = readFileSync('tests/fixtures/director_tick/valid.txt', 'utf8');
const IMPORT_REPLY = JSON.stringify({
  roleCandidates: [{ roleId: 'defender', reason: 'Protective.' }],
  values: { pragmatism: 1, autonomy: -1, ingroup: 3, mercy: -2, corporate: 0, sacrifice: 2 },
  likes: ['rain'], dislikes: ['smoke'], triggers: ['fire'],
  signatureCandidates: [{ templateId: 'sig_shared_pain', name: 'Carry It', description: 'She takes the blow.' }],
  defectCandidates: [{ defectId: 'echo_bleed', origin: 'Heard things.' }],
  notes: 'ok',
});
const unit = (name: string, roleId = 'assault') => ({
  cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId,
  signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
  values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 },
});
const setupResult = (): SetupResult => ({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit('Rhea'), unit('Mira', 'defender')] });

function scriptedShell() {
  type Script = (opts: ModalOpts) => Promise<string | null>;
  const script: Script[] = [];
  const modals: ModalOpts[] = [];
  const toasts: Array<{ kind: string; text: string }> = [];
  const tabRenderers = new Map<string, (host: HTMLElement) => void>();
  const screenRenderers = new Map<string, (host: HTMLElement) => void>();
  const screens: string[] = [];
  const badges = new Map<string, number>();
  const shell = {
    open: vi.fn(), close() {}, isOpen: () => true,
    showScreen(id: string) { screens.push(id); },
    showTab() {},
    registerTab(id: string, r: (host: HTMLElement) => void) { tabRenderers.set(id, r); },
    registerScreen(id: string, r: (host: HTMLElement) => void) { screenRenderers.set(id, r); },
    setTabBadge(id: string, n: number) { badges.set(id, n); },
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal(opts: ModalOpts) {
      modals.push(opts);
      const next = script.shift();
      return next ? next(opts) : null;
    },
    setPalette() {}, refresh: vi.fn(), destroy() {},
  };
  return { shell, script, modals, toasts, tabRenderers, screenRenderers, screens, badges };
}

type Boot = Awaited<ReturnType<typeof boot>>;
async function boot(opts: { st?: FakeStAdapter; deploy?: boolean } = {}) {
  const st = opts.st ?? new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }, { avatar: 'mira.png', name: 'Mira' }, { avatar: 'zed.png', name: 'Zed' }];
  for (const [avatar, name] of [['rhea.png', 'Rhea'], ['mira.png', 'Mira'], ['zed.png', 'Zed']]) {
    st.cards.set(avatar, { avatar, name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  }
  st.settings.unitDms = false; // no unit DMs: they would eat the queued model replies
  st.settings.chronicleCompaction = false;
  const sh = scriptedShell();
  let shellDeps: { onSettingsChanged?: () => void } = {};
  const app: AliusApp = createApp(st, { loadContent: async () => content, shellFactory: (d) => { shellDeps = d as never; return sh.shell as never; }, assetUrl: (p) => `/${p}` });
  await app.start();
  if (opts.deploy !== false) {
    expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
    await settle();
  }
  const initialScreens = [...sh.screens];
  sh.toasts.length = 0;
  sh.screens.length = 0;
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
  const tab = (id: string): HTMLElement => {
    const host = h('div');
    document.body.append(host);
    sh.tabRenderers.get(id)!(host);
    return host;
  };
  const endDay = async () => {
    app.dispatch({ type: 'calendar/consume_slot', payload: { slots: 3, reason: 'test' } });
    await settle();
  };
  /** An offered command mission in the start region, ready to plan. */
  const offer = (templateId = 'tpl_recover'): string => {
    let id = '';
    edit((s) => {
      id = offerMission(s, { registries: content.registries, rng: new Rng(s.rng) }, { templateId, regionId: 'quarantine_d7', source: 'command' }).mission!.id;
    });
    return id;
  };
  /** Plans and launches the mission with the whole active roster; the first layer's n0_0 is typed as given. */
  const launch = (type = 'cache', missionId = offer()): void => {
    app.expedition.plan({ missionId });
    const ids = state().roster.activeIds;
    expect(app.expedition.launch({ unitIds: ids, formation: { front: ids.slice(0, 1), back: ids.slice(1) }, supplies: 2 })).toBe(true);
    edit((s) => { s.expedition!.map.nodes.n0_0.type = type; });
  };
  return { st, app, sh, state, edit, mount, tab, endDay, offer, launch, initialScreens, settingsChanged: () => shellDeps.onSettingsChanged?.() };
}
const click = (el: Element | null | undefined) => (el as HTMLElement).click();
const btn = (host: HTMLElement, label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent!.includes(label));

describe('loading', () => {
  it('a P4-era campaign is seeded on load', async () => {
    const t = await boot();
    t.edit((s) => { s.world.clocks = []; s.world.factions = {}; s.world.regions = {}; delete s.world.seeded; });
    expect(t.state().world.seeded).toBeUndefined();
    await settle();
    // a second app over the same chat metadata, as after a reload
    const again = await boot({ st: t.st, deploy: false });
    expect(again.state().world.seeded).toBe(true);
    expect(again.state().world.clocks).toHaveLength(5);
    expect(again.state().world.regions.quarantine_d7.known).toBe(true);
  });

  it('the MAP tab is no longer a stub and the OPS tab carries the board', async () => {
    const t = await boot();
    const map = t.tab('map');
    expect(map.textContent).toContain('WORLD MAP');
    // the image URL comes from the asset hook; its polygons are the hotspots
    expect(map.querySelector('img')?.getAttribute('src')).toBe('/content/core/map/world.png');
    expect(map.querySelectorAll('polygon[data-region]').length).toBe(5);
    expect(t.tab('ops').textContent).toContain('MISSION BOARD');
    // an image that fails to load falls back to the ASCII grid, whose regions are buttons
    map.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(map.querySelectorAll('button[data-region]').length).toBeGreaterThan(0);
  });
});

describe('the director', () => {
  it('ending the day requests the director and applies the model\'s offers to the board', async () => {
    const t = await boot();
    t.st.mainReplies = [DIRECTOR];
    await t.endDay();
    expect(t.st.calls.filter((c) => (c.system ?? '').includes('story director'))).toHaveLength(1);
    expect(t.state().world.director!.pending).toBeUndefined();
    expect(t.state().missions.offered.some((m) => m.title === 'Clear the Ashway convoy road')).toBe(true);
    expect(t.state().world.spine?.proposed).toBe('beat_1');
    expect(t.state().rumors).toHaveLength(1);
    expect(t.state().world.threads.some((th) => th.title === 'The silent overpass')).toBe(true);
  });

  it('without a mechanic profile the fallback fills the board', async () => {
    const t = await boot();
    t.st.settings.mechanicFallbackToMain = false;
    await t.endDay();
    expect(t.st.calls.filter((c) => (c.system ?? '').includes('story director'))).toHaveLength(0);
    expect(t.state().world.director!.pending).toBeUndefined();
    expect(t.state().missions.offered.length).toBeGreaterThan(0);
  });

  it('the director setting off never calls the model', async () => {
    const t = await boot();
    t.st.settings.directorEnabled = false;
    t.st.mainReplies = [DIRECTOR];
    await t.endDay();
    expect(t.st.calls).toHaveLength(0);
    expect(t.state().missions.offered.length).toBeGreaterThan(0);
  });

  it('scout_net posts rumors through a scout request', async () => {
    const t = await boot();
    t.st.mainReplies = [DIRECTOR];
    await t.app.performActivity({ activityId: 'scout_net' });
    await settle();
    expect(t.state().rumors.length).toBeGreaterThan(0);
    expect(t.state().missions.offered).toEqual([]); // scouts bring rumors only
    expect(t.state().world.director!.pending).toBeUndefined();
  });

  it('a late director answer for another chat is dropped', async () => {
    const t = await boot();
    t.st.mainReplies = [DIRECTOR];
    const original = t.st.generateMain.bind(t.st);
    t.st.generateMain = async (req) => {
      t.st.switchChat({ chatId: 'chat-other', isGroup: true, groupId: 'gx' });
      return original(req);
    };
    await t.endDay();
    // back in the first chat the request is still open and the answer was never applied
    t.st.generateMain = original;
    t.st.switchChat({ chatId: t.st.getActiveChat()!.chatId, isGroup: true, groupId: t.st.getActiveChat()!.groupId });
    expect(t.sh.toasts.filter((x) => x.kind === 'error')).toEqual([]);
  });
});

describe('expeditions', () => {
  it('planning from MAP and departing shows the expedition screen', async () => {
    const t = await boot();
    const map = t.tab('map');
    click(map.querySelector('button[data-poi="scavenge"]'));
    expect(t.app.expedition.planning()).toEqual({ poi: { regionId: 'quarantine_d7', poiId: 'scavenge' } });
    expect(t.sh.screens.at(-1)).toBe('expedition');
    const host = t.mount('expedition');
    expect(host.textContent).toContain('DEPART');
    for (const box of host.querySelectorAll<HTMLInputElement>('input[data-unit]')) {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    click(btn(host, 'DEPART'));
    expect(t.state().expedition).toBeDefined();
    expect(t.state().missions.active[0].poiId).toBe('scavenge');
    expect(t.mount('expedition').querySelector('.alius-nodemap')).not.toBeNull();
  });

  it('planning from the OPS board works the same way', async () => {
    const t = await boot();
    const id = t.offer();
    const ops = t.tab('ops');
    click(ops.querySelector(`button[data-plan="${id}"]`));
    expect(t.app.expedition.planning()).toEqual({ missionId: id });
    expect(t.sh.screens.at(-1)).toBe('expedition');
  });

  it('a combat node opens the combat screen and CONTINUE returns to the expedition with the node resolved', async () => {
    const t = await boot();
    t.launch('combat');
    t.edit((s) => { for (const u of s.squad) u.level = 12; });
    t.app.expedition.move('n0_0');
    t.edit((s) => { (s.expedition!.pending as { encounter: { enemies: unknown[] } }).encounter.enemies = [{ enemyId: 'husk', level: 1, affixes: [] }]; });
    expect(t.state().expedition!.phase).toBe('combat');
    expect(t.app.expedition.fight({})).toBe(true);
    expect(t.sh.screens.at(-1)).toBe('combat');
    expect(t.state().combat).toBeDefined();
    expect(t.state().combat!.expedition).toBe(true);
    expect(t.state().combat!.bankLoot).toBe(false);
    t.app.dispatch({ type: 'combat/auto', payload: { on: true } });
    if (t.state().combat) t.app.dispatch({ type: 'combat/accept', payload: {} });
    expect(t.state().lastCombat!.outcome).toBe('won');
    const combat = t.mount('combat');
    click(combat.querySelector('[data-act="continue"]'));
    expect(t.sh.screens.at(-1)).toBe('expedition');
    expect(t.state().expedition!.phase).toBe('travel');
    expect(t.state().expedition!.log.some((l) => l.kind === 'combat')).toBe(true);
    // the same result is never counted twice
    t.app.expedition.afterCombat();
    expect(t.state().expedition!.log.filter((l) => l.kind === 'combat')).toHaveLength(1);
  });

  it('reload with a finished fight resolves the node', async () => {
    const t = await boot();
    t.launch('combat');
    t.edit((s) => { for (const u of s.squad) u.level = 12; });
    t.app.expedition.move('n0_0');
    t.edit((s) => { (s.expedition!.pending as { encounter: { enemies: unknown[] } }).encounter.enemies = [{ enemyId: 'husk', level: 1, affixes: [] }]; });
    t.app.expedition.fight({});
    t.app.dispatch({ type: 'combat/auto', payload: { on: true } });
    if (t.state().combat) t.app.dispatch({ type: 'combat/accept', payload: {} });
    await settle();
    expect(t.state().expedition!.phase).toBe('combat');
    const again = await boot({ st: t.st, deploy: false });
    await settle();
    expect(again.state().expedition!.phase).toBe('travel');
    expect(again.state().expedition!.log.filter((l) => l.kind === 'combat')).toHaveLength(1);
  });

  it('reload mid-expedition shows the expedition screen', async () => {
    const t = await boot();
    t.launch('cache');
    t.app.expedition.move('n0_0');
    await settle();
    const again = await boot({ st: t.st, deploy: false });
    expect(again.initialScreens).toContain('expedition');
    expect(again.state().expedition!.at).toBe('n0_0');
    expect(again.initialScreens).not.toContain('combat');
  });

  it('a full run to RETURN shows the after-action report and requests a recap once', async () => {
    const t = await boot();
    t.launch('cache');
    t.edit((s) => {
      s.expedition!.map = {
        layers: [['n0_0', 'n0_1']], objectiveId: 'obj',
        nodes: {
          n0_0: { id: 'n0_0', layer: 0, type: 'cache', edges: ['obj'], visited: false },
          n0_1: { id: 'n0_1', layer: 0, type: 'cache', edges: ['obj'], visited: false },
          obj: { id: 'obj', layer: 1, type: 'objective', edges: [], visited: false },
        },
      };
    });
    t.app.expedition.move('n0_0');
    t.app.expedition.move('obj');
    expect(t.state().expedition!.objectiveDone).toBe(true);
    t.st.settings.directorEnabled = false; // the engine's own request after the return must not take the queued reply
    t.st.mainReplies = ['The squad went in at dawn and came back with the cache.'];
    t.app.expedition.return();
    await settle();
    expect(t.state().expedition).toBeUndefined();
    expect(t.sh.screens.at(-1)).toBe('expedition');
    const report = t.mount('expedition');
    expect(report.textContent).toContain('AFTER-ACTION REPORT');
    expect(t.state().lastExpedition!.recap).toBe('The squad went in at dawn and came back with the cache.');
    expect(t.st.calls.filter((c) => (c.system ?? '').includes('after-action report'))).toHaveLength(1);
    // another refresh does not ask again
    await t.app.expedition.requestRecap();
    expect(t.st.calls.filter((c) => (c.system ?? '').includes('after-action report'))).toHaveLength(1);
  });

  it('a late recap for another chat is dropped', async () => {
    const t = await boot();
    t.launch('cache');
    t.edit((s) => { s.expedition!.objectiveDone = true; });
    t.st.settings.directorEnabled = false;
    t.st.mainReplies = ['A recap that arrives too late.'];
    const original = t.st.generateMain.bind(t.st);
    t.st.generateMain = async (req) => {
      t.st.switchChat({ chatId: 'chat-other', isGroup: true, groupId: 'gx' });
      return original(req);
    };
    const chat = t.st.getActiveChat()!;
    t.app.expedition.return();
    await settle();
    t.st.generateMain = original;
    t.st.switchChat(chat);
    await settle();
    expect(t.state().lastExpedition!.recap).toBeUndefined();
    expect(t.sh.toasts.filter((x) => x.kind === 'error')).toEqual([]);
  });

  it('retreat returns to the PDA with the mission back on the board', async () => {
    const t = await boot();
    const id = t.offer();
    t.launch('cache', id);
    t.st.settings.expeditionRecap = false;
    t.app.expedition.retreat();
    await settle();
    expect(t.state().missions.offered.map((m) => m.id)).toContain(id);
    expect(t.state().missions.active).toEqual([]);
    expect(t.sh.screens.at(-1)).toBe('expedition'); // the report first
    const host = t.mount('expedition');
    click(btn(host, 'CLOSE'));
    expect(t.sh.screens.at(-1)).toBe('pda');
    expect(t.state().lastExpedition!.acknowledged).toBe(true);
  });

  it('an unacknowledged report is offered by an OPS banner', async () => {
    const t = await boot();
    t.launch('cache');
    t.st.settings.expeditionRecap = false;
    t.app.expedition.retreat();
    await settle();
    const ops = t.tab('ops');
    expect(ops.textContent).toContain('REPORT READY');
    t.sh.screens.length = 0;
    click(btn(ops, 'OPEN REPORT'));
    expect(t.sh.screens.at(-1)).toBe('expedition');
  });

  it('new story and command offers put a badge on OPS until the tab is shown', async () => {
    const t = await boot();
    t.offer();
    expect(t.sh.badges.get('ops')).toBe(1);
    t.tab('ops');
    t.app.dispatch({ type: 'debug/noop', payload: {} });
    expect(t.sh.badges.get('ops') ?? 0).toBe(0);
  });
});

describe('intake', () => {
  const waiting = (t: Boot) => t.edit((s) => { s.world.incomingUnits = 1; });

  it('intake adds the picked card to the squad and the group', async () => {
    const t = await boot();
    waiting(t);
    t.st.mainReplies = [IMPORT_REPLY];
    t.sh.script.push(
      async (opts) => {
        const select = (opts.body as HTMLElement).querySelector<HTMLSelectElement>('select')!;
        // cards already in the squad are not offered
        expect([...select.options].map((o) => o.value)).toEqual(['zed.png']);
        select.value = 'zed.png';
        return 'pick';
      },
      async () => { await flush(); await flush(); return 'apply'; },
    );
    await t.app.intakeUnit();
    const added = t.state().squad.find((u) => u.cardRef === 'zed.png')!;
    expect(added).toBeDefined();
    expect(added.roleId).toBe('defender');
    expect(t.state().world.incomingUnits).toBe(0);
    expect(t.st.members.some((m) => m.avatar === 'zed.png')).toBe(true);
    expect(t.sh.toasts.some((x) => x.text.includes('Zed'))).toBe(true);
  });

  it('decline adds a grunt', async () => {
    const t = await boot();
    waiting(t);
    t.sh.script.push(async () => 'decline');
    const before = t.state().squad.length;
    await t.app.intakeUnit();
    expect(t.state().squad.length).toBe(before + 1);
    expect(t.state().squad.at(-1)!.kind).toBe('grunt');
    expect(t.state().world.incomingUnits).toBe(0);
  });

  it('cancel changes nothing, and nobody waiting is a toast', async () => {
    const t = await boot();
    waiting(t);
    t.sh.script.push(async () => 'cancel');
    await t.app.intakeUnit();
    expect(t.state().world.incomingUnits).toBe(1);
    const none = await boot();
    await none.app.intakeUnit();
    expect(none.sh.toasts.at(-1)!.text).toMatch(/no unit is waiting/i);
    expect(none.sh.modals).toHaveLength(0);
  });

  it('a unit waiting for intake shows the OPS banner with a review button', async () => {
    const t = await boot();
    waiting(t);
    const ops = t.tab('ops');
    expect(ops.textContent).toContain('INTAKE PENDING');
    t.sh.script.push(async () => 'cancel');
    click(btn(ops, 'REVIEW'));
    await settle();
    expect(t.sh.modals).toHaveLength(1);
  });
});

describe('world toasts', () => {
  it('a new command mission and a failed mission are announced', async () => {
    const t = await boot();
    t.st.settings.directorEnabled = false; // the fallback offers a command mission on the first day end
    await t.endDay();
    expect(t.sh.toasts.some((x) => /new command mission/i.test(x.text))).toBe(true);
    t.sh.toasts.length = 0;
    t.edit((s) => { for (const m of s.missions.offered) m.deadlineDay = s.day; });
    await t.endDay();
    expect(t.sh.toasts.some((x) => /mission failed/i.test(x.text))).toBe(true);
  });
});

describe('review fixes', () => {
  it('closing the report after a return through the Evening shows the night knock that was waiting', async () => {
    const t = await boot();
    t.st.settings.expeditionRecap = false;
    t.st.settings.directorEnabled = false;
    t.edit((s) => { s.slot = 'afternoon'; });
    t.launch('cache');
    const unitId = t.state().roster.activeIds[0];
    t.edit((s) => {
      s.calendar.nightEventsQueue.push({ id: 'n1', unitId, kind: 'after_breakdown', priority: 60, framing: 'She is at your door.', ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: s.day + 2 });
    });
    t.app.expedition.retreat();
    await settle();
    expect(t.state().slot).toBe('night');
    expect(t.state().calendar.nightEvent).toBeDefined();
    const report = t.mount('expedition');
    click(btn(report, 'CLOSE'));
    expect(t.sh.screens.at(-1)).toBe('scene'); // the knock, not the PDA
  });

  it('a director answer that comes due during a fight waits for the fight to end, without an error toast', async () => {
    const t = await boot();
    t.st.settings.directorEnabled = false;
    t.edit((s) => { for (const u of s.squad) u.level = 12; });
    t.app.dispatch({ type: 'director/request', payload: { reason: 'scout' } });
    expect(t.state().world.director!.pending).toBeDefined();
    await settle();
    expect(t.state().world.director!.pending).toBeUndefined(); // answered at once outside a fight
    t.app.dispatch({ type: 'director/request', payload: { reason: 'scout' } });
    t.edit((s) => { s.world.director!.pending = { id: 'd9', reason: 'scout', day: s.day }; });
    t.app.startCombat({ encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: { front: t.state().roster.activeIds.slice(0, 1), back: t.state().roster.activeIds.slice(1) }, expedition: false, bankLoot: false });
    expect(t.state().combat).toBeDefined();
    t.sh.toasts.length = 0;
    await t.app.director.onRequested();
    expect(t.sh.toasts.filter((x) => x.kind === 'error')).toEqual([]);
    expect(t.state().world.director!.pending!.id).toBe('d9');
    t.app.dispatch({ type: 'combat/auto', payload: { on: true } });
    if (t.state().combat) t.app.dispatch({ type: 'combat/accept', payload: {} });
    await settle();
    expect(t.state().world.director!.pending).toBeUndefined();
  });
});

describe('minor fixes', () => {
  it('the beat cooldown setting is mirrored into the campaign on load and when it changes', async () => {
    const st = new FakeStAdapter(SOLO);
    st.settings.beatCooldownDays = 7;
    const t = await boot({ st });
    expect(t.state().settings.beatCooldownDays).toBe(7);
    t.st.settings.beatCooldownDays = 2;
    t.settingsChanged();
    expect(t.state().settings.beatCooldownDays).toBe(2);
  });

  it('a plan and the OPS badge memory do not survive a chat switch', async () => {
    const t = await boot();
    const id = t.offer();
    t.tab('ops');
    expect(t.sh.badges.get('ops')).toBe(0);
    t.app.expedition.plan({ missionId: id });
    const chat = t.st.getActiveChat()!;
    t.st.switchChat({ chatId: 'chat-other', isGroup: true, groupId: 'gx' });
    expect(t.app.expedition.planning()).toBeNull();
    t.st.switchChat(chat);
    expect(t.sh.badges.get('ops')).toBe(1); // the offer is unseen again in the reloaded campaign
  });

  it('a Leash authorization lost to a clock is announced', async () => {
    const t = await boot();
    t.st.settings.directorEnabled = false;
    t.edit((s) => {
      s.leash.authorizationsLeft = 2;
      s.world.clocks.find((c) => c.id === 'oversight')!.filled = 5;
    });
    const id = t.offer('tpl_sweep');
    t.edit((s) => { s.missions.offered.find((m) => m.id === id)!.deadlineDay = s.day; });
    await t.endDay();
    expect(t.sh.toasts.some((x) => /leash/i.test(x.text))).toBe(true);
  });
});

describe('world options in the injected context (P8)', () => {
  it('the WORLD SETTINGS block and the Bloom directive are injected without a scene, and a live switch replaces them', async () => {
    const t = await boot();
    const ctx = () => t.st.injections.get('ctx')!.text;
    const dir = () => t.st.injections.get('dir')?.text ?? '';
    expect(ctx()).toContain('World settings: ');
    expect(ctx()).toContain('Mutants and wounds are described with restraint.');
    expect(dir()).toContain('without gore');
    const events = t.app.dispatch({ type: 'world/set_option', payload: { optionId: 'bloom_horror', choiceId: 'graphic' } });
    expect(events.some((e) => e.type === 'world_option_changed')).toBe(true);
    expect(ctx()).toContain('graphic, unflinching detail');
    expect(ctx()).not.toContain('described with restraint');
    expect(dir()).toContain('unflinching physical detail');
    expect(dir()).not.toContain('without gore');
  });

  it('a locked option cannot be switched from the app either', async () => {
    const t = await boot();
    const events = t.app.dispatch({ type: 'world/set_option', payload: { optionId: 'oversight', choiceId: 'brutal' } });
    expect(events.find((e) => e.type === 'error')).toMatchObject({ message: 'World option "oversight" is locked after the campaign start.' });
    expect(t.state().world.options!.oversight).toBe('standard');
  });
});
