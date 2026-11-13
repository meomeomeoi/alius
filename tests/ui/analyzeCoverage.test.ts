// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { ArcPathInfo } from '../../src/engine/arcs';
import { trustBand } from '../../src/engine/relations/bands';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { attachAnalyzer } from '../../src/ui/analyze/analyzer';
import { depart, withMission } from '../helpers/expedition';
import { Wizard } from '../../src/setup/wizard';
import type { ImportedProfile } from '../../src/setup/profile';
import { renderCalibration } from '../../src/ui/setup/calibration';
import { renderSetupScreen } from '../../src/ui/setup/setupScreen';
import { renderCombatScreen } from '../../src/ui/combat/combatScreen';
import { renderDilemma } from '../../src/ui/dilemma/dilemmaPanel';
import { renderExpeditionScreen } from '../../src/ui/expedition/expeditionScreen';
import { renderSysTab } from '../../src/ui/shell/sysTab';
import { run } from '../helpers/world';
import { h } from '../../src/ui/dom';
import { renderBaseTab } from '../../src/ui/base/baseTab';
import { renderInvTab } from '../../src/ui/inv/invTab';
import { createShell } from '../../src/ui/shell/shell';
import { renderStatusHeader } from '../../src/ui/shell/status';
import { renderSquadTab } from '../../src/ui/squad/squadTab';
import { campaign, loadCore } from '../helpers/world';
import { markedWithout, markerCount, unreachable, unresolved } from '../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};

/** A campaign with a worn, affixed item, a spare item, an injured commander and a supply shortage. */
function world(): CampaignState {
  const s = campaign(reg, 4);
  s.resources = { credits: 500, supplies: 30, plyx: 120 };
  s.inventory.push(
    { uid: 'it_1', itemId: 'item_blade', rarity: 'refined', upgrade: 1, affixes: ['honed', 'keen'] },
    { uid: 'it_2', itemId: 'upper_light', rarity: 'standard', upgrade: 0, affixes: [] },
    { uid: 'it_3', itemId: 'item_smg', rarity: 'standard', upgrade: 0, affixes: ['calming'] },
  );
  Object.assign(s.squad[0].equipment, { weapon: 'it_1' });
  s.squad[0].stress = 63;
  s.commander.injuredUntilDay = s.day + 2;
  s.calendar.shortageStreak = 1;
  return s;
}

const ARC_PATHS: ArcPathInfo[] = (['cure', 'manage', 'embrace'] as const).map((path) => ({
  path, available: true, reason: null, wanted: path === 'manage', refuses: path === 'cure', cost: { credits: 5 }, text: `${path} text`,
}));

function squad(state: CampaignState, raw: boolean) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const host = mount();
  const settings = { ...getSettings(st), showRawValues: raw };
  renderSquadTab(host, {
    st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings,
    onNewCampaign: vi.fn(), onUnlock: vi.fn(), onRespec: vi.fn(), onSetLoadout: vi.fn(), onEquip: vi.fn(), onUnequip: vi.fn(),
    onLeash: vi.fn(), onArc: vi.fn(), arcPaths: () => ARC_PATHS, canTerminate: () => null,
  });
  return host;
}

function inv(state: CampaignState) {
  const host = mount();
  renderInvTab(host, { getState: () => state, registries: reg, onEquip: vi.fn(), onCraft: vi.fn(), onUpgrade: vi.fn(), onReroll: vi.fn(), onDismantle: vi.fn() });
  host.querySelector<HTMLElement>('[data-uid="it_1"]')!.click(); // select the worn blade: compare panel and workshop actions
  return host;
}

describe('coverage: header', () => {
  it('every marker has data-analyze, every address resolves, and the header is not vacuous', () => {
    const s = world();
    const host = mount();
    renderStatusHeader(host, s);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(5);
    // clock, three resources, Leash, injury and shortage
    const addresses = [...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze'));
    expect(addresses).toEqual(expect.arrayContaining([
      'glossary:slots', 'glossary:credits', 'glossary:supplies', 'glossary:plyx', 'glossary:leash', 'glossary:commander_injury', 'glossary:upkeep',
    ]));
  });

  it('the header text is unchanged', () => {
    const s = world();
    const host = mount();
    renderStatusHeader(host, s);
    expect(host.querySelector('.alius-resources')!.textContent).toBe('CR 500 · SUP 30 · PLYX 120');
    expect(host.querySelector('.alius-leash')!.textContent).toBe(`LEASH ${s.leash.authorizationsLeft}`);
    expect(host.textContent).toContain('INJURED 2d');
    expect(host.textContent).toContain('SHORTAGE 1d');
  });

  it('a header without a campaign has nothing to mark', () => {
    const host = mount();
    renderStatusHeader(host, null);
    expect(markerCount(host)).toBe(0);
  });
});

describe('coverage: SQUAD', () => {
  for (const raw of [false, true]) {
    it(`every marker has data-analyze and every address resolves (raw values ${raw ? 'on' : 'off'}, named unit and grunt)`, () => {
      const s = world();
      s.squad[1].kind = 'grunt';
      s.squad[1].designation = 'K-117';
      const host = squad(s, raw);
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(s, raw))).toEqual([]);
      expect(unreachable(host)).toEqual([]);
      expect(markerCount(host)).toBeGreaterThanOrEqual(25);
      const addresses = new Set([...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze')));
      for (const wanted of [
        'glossary:trust', 'glossary:affinity', 'glossary:attraction', 'glossary:loyalty_band', 'glossary:stress', 'glossary:level_xp',
        'glossary:skill_points', 'glossary:stat_hp', 'glossary:stat_crit', 'glossary:value_mercy', 'glossary:arc_cure', 'glossary:leash_compel',
        'glossary:leash_suppress', 'glossary:leash_terminate', 'roles:assault', 'items:item_blade', 'defects:echo_bleed', 'signatures:sig_last_stand',
      ]) expect(addresses.has(wanted), wanted).toBe(true);
      expect([...addresses].some((a) => a!.startsWith('relationshipStates:'))).toBe(true);
      expect([...addresses].some((a) => a!.startsWith('skills:'))).toBe(true);
    });
  }

  it('live chips carry the unit in their ctx', () => {
    const s = world();
    const host = squad(s, false);
    const trust = host.querySelector<HTMLElement>('[data-analyze="glossary:trust"]')!;
    expect(JSON.parse(trust.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: s.squad[0].id });
    expect(JSON.parse(host.querySelector('[data-analyze="glossary:stat_atk"]')!.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: s.squad[0].id });
  });

  it('the SQUAD stress chip shows a band and no number with raw values off', () => {
    const s = world();
    const off = squad(s, false);
    const chip = off.querySelector<HTMLElement>('.alius-stress [data-analyze="glossary:stress"]')!;
    expect(chip.textContent).toBe('STRESS STRAINED');
    expect(off.querySelector('.alius-stress')!.textContent).not.toMatch(/\d/);
    document.body.innerHTML = '';
    const on = squad(s, true);
    expect(on.querySelector('.alius-stress [data-analyze="glossary:stress"]')!.textContent).toBe('STRESS STRAINED (63)');
  });

  it('the existing unit text is unchanged', () => {
    const s = world();
    const host = squad(s, false);
    const unit = host.querySelector('article')!;
    const text = unit.textContent!;
    expect(text).toMatch(/TRUST [A-Z]+ · AFFINITY [A-Z]+ · ATTRACTION [A-Z]+/);
    expect(text).toContain('LOYALTY: ');
    expect(text).toMatch(/Assault · LVL 1/);
    expect(text).toMatch(/XP 0\/\d+ · SKILL POINTS \d+/);
    expect(text).toMatch(/HP \d+ · ATK \d+ · DEF \d+ · SPD \d+ · CRIT \d+%/);
    expect(text).toMatch(/PRAGMATISM: [A-Z]+ · AUTONOMY: [A-Z]+/);
    expect(unit.querySelector('.alius-values')!.children.length).toBe(6);
  });
});

describe('coverage: BASE', () => {
  it('every marker has data-analyze, every address resolves, and the tab is not vacuous', () => {
    const s = world();
    const host = mount();
    renderBaseTab(host, { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onUpgrade: vi.fn(), onRecruit: vi.fn(), onSetRoster: vi.fn() });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(6);
    const addresses = new Set([...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze')));
    expect(addresses.has('glossary:roster')).toBe(true);
    expect(addresses.has('glossary:grunt')).toBe(true);
    expect([...addresses].some((a) => a!.startsWith('facilities:'))).toBe(true);
    expect(host.querySelector('.alius-facility h3')!.textContent).toMatch(/^.+ — LEVEL \d\/\d$/);
  });
});

describe('coverage: INV', () => {
  it('every marker has data-analyze, every address resolves, and the tab is not vacuous', () => {
    const s = world();
    s.workshopSession = { day: s.day, opsLeft: 3 };
    const host = inv(s);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(6);
    const addresses = new Set([...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze')));
    for (const wanted of ['glossary:credits', 'glossary:supplies', 'glossary:plyx', 'glossary:rarity', 'glossary:workshop', 'items:item_blade', 'affixes:honed', 'affixes:keen']) {
      expect(addresses.has(wanted), wanted).toBe(true);
    }
    expect([...addresses].some((a) => a!.startsWith('glossary:stat_'))).toBe(true);
    expect(host.querySelector('.alius-inv-res')!.textContent).toBe('CREDITS 500 · SUPPLIES 30 · PLYX 120');
  });
});

const unitIdsIn = (host: HTMLElement) => [...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze')!);

/** An open combat: a bleeding, a strained, a downed and a broken-down unit, and a friendship that gives a synergy. */
function combatWorld(): CampaignState {
  const base = world();
  const s = structuredClone(base);
  for (const id of ['unit_ann', 'unit_bea']) s.relations[id].stateId = 'friend';
  const r = run(s, reg, {
    type: 'combat/start',
    payload: {
      encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }, { enemyId: 'scav_marksman', level: 1, affixes: [] }], danger: 1 },
      formation: { front: ['unit_ann', 'unit_bea', 'unit_cat'], back: ['unit_dee'] },
    },
  });
  const cs = r.state.combat!;
  cs.awaitingCid = 's1';
  cs.cp = 3;
  const by = (cid: string) => cs.combatants.find((c) => c.cid === cid)!;
  by('s2').statuses.push({ id: 'bleed', turns: 2, stacks: 2, sourceCid: 'e1' });
  by('s3').stress = 60;
  by('s4').downed = true;
  by('s4').hp = 0;
  by('s1').breakdown = { defectId: 'echo_bleed', policy: 'skip', ignoresOrders: true, actionEffects: [] };
  return r.state;
}

function combat(state: CampaignState) {
  const shell = h('div', { id: 'alius-shell' });
  document.body.append(shell);
  const host = h('div');
  shell.append(host);
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const screen = renderCombatScreen(host, {
    getState: () => state, registries: reg, st, settings: () => DEFAULT_SETTINGS, onAct: vi.fn(), onOrder: vi.fn(), onAuto: vi.fn(),
    onRetry: vi.fn(), onAccept: vi.fn(), onRetreat: vi.fn(), onClose: vi.fn(), onCompel: vi.fn(),
  });
  return { host, screen };
}

describe('coverage: combat', () => {
  it('every marker has data-analyze, every address resolves, and the screen is not vacuous', () => {
    const s = combatWorld();
    const { host, screen } = combat(s);
    try {
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(s))).toEqual([]);
      expect(unreachable(host)).toEqual([]);
      expect(markerCount(host)).toBeGreaterThanOrEqual(10);
      const addresses = new Set(unitIdsIn(host));
      for (const wanted of [
        'statuses:bleed', 'glossary:stress_strained', 'glossary:downed', 'glossary:stress_breakdown', 'glossary:stat_hp', 'glossary:stress',
        'glossary:cp', 'glossary:leash', 'synergies:friend_assist',
      ]) expect(addresses.has(wanted), wanted).toBe(true);
      expect([...addresses].some((a) => a.startsWith('skills:'))).toBe(true);
      expect([...addresses].some((a) => a.startsWith('orders:'))).toBe(true);
    } finally {
      screen.dispose();
    }
  });

  it('the card text is unchanged: tags keep their [TAG] form and synergies read as names', () => {
    const s = combatWorld();
    const { host, screen } = combat(s);
    try {
      const card = (cid: string) => host.querySelector(`.alius-cc[data-cid="${cid}"]`)!.textContent!;
      expect(card('s2')).toContain('[BLD×2]');
      expect(card('s3')).toContain('[STRAINED]');
      expect(card('s4')).toContain('[DOWN]');
      expect(card('s1')).toContain('[BREAKDOWN]');
      expect(card('s1')).toContain(String(reg.synergies.get('friend_assist')!.name));
      expect(card('s1')).toMatch(/HP █+░* \d+\/\d+/);
      expect(card('s1')).toMatch(/ST [█░]+ \d+/);
      expect(host.querySelector('.alius-combat-cp')!.textContent).toMatch(/^CP [●○]{5}$/);
    } finally {
      screen.dispose();
    }
  });

  it('squad stress carries the unit, enemy hit points do not', () => {
    const s = combatWorld();
    const { host, screen } = combat(s);
    try {
      const st = host.querySelector('.alius-cc[data-cid="s1"] [data-analyze="glossary:stress"]')!;
      expect(JSON.parse(st.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: 'unit_ann' });
      expect(host.querySelector('.alius-cc[data-cid="e1"] [data-analyze="glossary:stress"]')).toBeNull();
    } finally {
      screen.dispose();
    }
  });
});

describe('coverage: expedition node map', () => {
  it('every node carries its type, hidden ones are unknown nodes', () => {
    const { state, mission } = withMission(reg, campaign(reg, 4));
    const s = depart(reg, state, mission.id);
    const host = h('div');
    document.body.append(host);
    renderExpeditionScreen(host, {
      getState: () => s, registries: reg, settings: () => DEFAULT_SETTINGS, onClose: vi.fn(),
      controller: new Proxy({}, { get: () => vi.fn(() => null) }) as never,
    });
    const map = host.querySelector('.alius-nodemap') as HTMLElement;
    expect(markedWithout(map)).toEqual([]);
    expect(unresolved(map, env(s))).toEqual([]);
    expect(unreachable(map)).toEqual([]);
    expect(markerCount(map)).toBeGreaterThanOrEqual(3);
    const addresses = unitIdsIn(map);
    expect(addresses.some((a) => a.startsWith('nodeTypes:'))).toBe(true);
    expect(addresses).toContain('glossary:unknown_node');
    // a hidden node still reads "[ ]" and a known one keeps its glyph
    expect([...map.querySelectorAll('[data-analyze="glossary:unknown_node"]')].every((e) => e.textContent === '[ ]')).toBe(true);
  });
});

describe('coverage: dilemma options', () => {
  it('options explain their tags only', () => {
    const host = h('div');
    document.body.append(host);
    renderDilemma(host, {
      title: 'A hard call', setup: 'Decide.', scale: 'major', waiting: false, onChoose: vi.fn(),
      options: [
        { index: 0, label: 'Push', disabled: null, hasCheck: true, check: { stat: 'authority', rank: 3 } },
        { index: 1, label: 'Talk', disabled: 'NEEDS EMPATHY 3', hasCheck: false, requires: { stat: 'empathy', rank: 3 } },
        { index: 2, label: 'Wait', disabled: null, hasCheck: false },
      ],
    });
    const s = world();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(2);
    const ctxs = [...host.querySelectorAll('[data-analyze="glossary:decision_option"]')].map((e) => JSON.parse(e.getAttribute('data-analyze-ctx')!));
    expect(ctxs).toEqual([
      { scale: 'major', check: { stat: 'authority', rank: 3 } },
      { scale: 'major', requires: { stat: 'empathy', rank: 3 } },
      { scale: 'major' },
    ]);
    expect(host.textContent).toContain('[ Push ] — CHECK');
  });
});

const PROFILE: ImportedProfile = {
  roleCandidates: [{ roleId: 'defender', reason: 'Protective.' }, { roleId: 'assault', reason: 'Aggressive.' }],
  values: { pragmatism: 0, autonomy: 0, ingroup: 2, mercy: 1, corporate: 0, sacrifice: 0 },
  likes: ['tea'], dislikes: [], triggers: [],
  signatureCandidates: [
    { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
    { templateId: 'sig_shared_pain', name: 'Carry It', description: 'She takes the blow.' },
  ],
  defectCandidates: [{ defectId: 'threat_saturation', origin: 'Three tours.' }, { defectId: 'echo_bleed', origin: 'Heard things.' }],
  baseline: { trust: 12, affinity: 0, attraction: 0 },
  notes: 'A veteran.',
};

describe('coverage: setup wizard', () => {
  const wizard = () => new Wizard(
    { registries: reg, desireBondDefects: false, importer: async () => ({ kind: 'ok', profile: PROFILE, dropped: [], missing: [] }), onChange: () => {} },
    { personaName: 'Vale', canBindCurrent: false },
  );

  it('start and crime cards', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = h('div');
    document.body.append(host);
    renderSetupScreen(host, { wizard: wizard(), registries: reg, st, onCancel: vi.fn(), onConfirm: vi.fn(async () => {}), modal: vi.fn(async () => null) as never });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(null))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    const addresses = unitIdsIn(host);
    expect(addresses.filter((a) => a.startsWith('starts:'))).toHaveLength(reg.starts.size);
    expect(addresses.filter((a) => a.startsWith('crimes:'))).toHaveLength(reg.crimes.size);
    expect(host.querySelector('.alius-start-card')!.classList.contains('alius-option')).toBe(true);
    expect(host.querySelector('.alius-card')!.getAttribute('aria-pressed')).not.toBeNull();
  });

  it('calibration: roles, signatures, defects, value and baseline sliders', () => {
    const w = wizard();
    w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    const draft = w.state.units[0];
    draft.status = 'ready';
    draft.candidates = structuredClone(PROFILE);
    draft.choice.likes = ['tea'];
    const host = h('div');
    document.body.append(host);
    renderCalibration(host, { draft, registries: reg, desireBondDefects: false, onUpdate: vi.fn(), onRegenerate: vi.fn(), onManual: vi.fn() });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(null))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(6);
    const addresses = unitIdsIn(host);
    for (const wanted of ['roles:defender', 'signatures:sig_last_stand', 'defects:echo_bleed', 'glossary:value_mercy', 'glossary:trust', 'glossary:affinity', 'glossary:attraction']) {
      expect(addresses, wanted).toContain(wanted);
    }
    // the sliders keep working: the label still holds the range input
    expect(host.querySelector('label.alius-slider input[type="range"][data-axis="mercy"]')).not.toBeNull();
    // tag chips are the legacy tag chips, not analysis markers
    expect(host.querySelector('.alius-tagchip')).not.toBeNull();
  });
});

describe('coverage: SYS', () => {
  it('every setting has an explained field', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const s = world();
    const host = h('div');
    document.body.append(host);
    renderSysTab(host, {
      st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), dispatch: () => [],
      toast: vi.fn(), modal: async () => null, onSettingsChanged: vi.fn(),
    });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(30);
    const settings = new Set(unitIdsIn(host).filter((a) => a.startsWith('setting:')).map((a) => a.slice('setting:'.length)));
    const missing = [...Object.keys(DEFAULT_SETTINGS), 'difficulty'].filter((k) => !settings.has(k));
    expect(missing).toEqual([]);
    expect(host.querySelectorAll('label.alius-field.alius-option')).toHaveLength(host.querySelectorAll('label.alius-field').length);
  });
});

describe('analysis makes no network or model call', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('no network or LLM call happens while every marked element on every screen is analyzed', () => {
    const fetchSpy = vi.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as never;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    const s = world();
    const cs = combatWorld();
    const root = h('div', { id: 'alius-shell' });
    document.body.append(root);
    const screens: Array<() => void> = [];
    try {
      const addHost = () => { const host = h('div'); root.append(host); return host; };
      renderStatusHeader(addHost(), s);
      const squadHost = addHost();
      renderSquadTab(squadHost, {
        st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => getSettings(st), onNewCampaign: vi.fn(),
        onLeash: vi.fn(), onArc: vi.fn(), arcPaths: () => ARC_PATHS, canTerminate: () => null, onUnlock: vi.fn(), onSetLoadout: vi.fn(),
      });
      renderBaseTab(addHost(), { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onUpgrade: vi.fn(), onRecruit: vi.fn(), onSetRoster: vi.fn() });
      const invHost = addHost();
      s.workshopSession = { day: s.day, opsLeft: 3 };
      renderInvTab(invHost, { getState: () => s, registries: reg, onEquip: vi.fn(), onCraft: vi.fn(), onUpgrade: vi.fn(), onReroll: vi.fn(), onDismantle: vi.fn() });
      invHost.querySelector<HTMLElement>('[data-uid="it_1"]')!.click();
      const combatScreen = renderCombatScreen(addHost(), {
        getState: () => cs, registries: reg, st, settings: () => DEFAULT_SETTINGS, onAct: vi.fn(), onOrder: vi.fn(), onAuto: vi.fn(),
        onRetry: vi.fn(), onAccept: vi.fn(), onRetreat: vi.fn(), onClose: vi.fn(), onCompel: vi.fn(),
      });
      screens.push(() => combatScreen.dispose());
      renderDilemma(addHost(), {
        title: 'T', setup: 'S', scale: 'minor', waiting: false, onChoose: vi.fn(),
        options: [{ index: 0, label: 'Push', disabled: null, hasCheck: true, check: { stat: 'authority', rank: 3 } }],
      });
      renderSysTab(addHost(), { st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), dispatch: () => [], toast: vi.fn(), modal: async () => null, onSettingsChanged: vi.fn() });

      const analyzer = attachAnalyzer(root, { getEnv: () => ({ registries: reg, state: s, settings: getSettings(st) }) });
      const marked = [...root.querySelectorAll<HTMLElement>('[data-analyze]')];
      expect(marked.length).toBeGreaterThan(150);
      for (const el of marked) {
        analyzer.openFor(el, { x: 10, y: 10 });
        const text = document.querySelector('.alius-analyze')?.textContent ?? '';
        expect(text, el.getAttribute('data-analyze')!).not.toBe('');
        expect(text, el.getAttribute('data-analyze')!).not.toContain('NO DATA');
        analyzer.close();
      }
      analyzer.destroy();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(st.calls).toEqual([]);
    } finally {
      screens.forEach((f) => f());
      globalThis.fetch = realFetch;
    }
  });
});

describe('coverage: end to end', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hovering a SQUAD trust chip in a real shell shows a reading with the band', () => {
    const s = world();
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    const shell = createShell({ st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), analyze: { registries: () => reg } });
    try {
      shell.registerTab('squad', (host) => renderSquadTab(host, {
        st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => getSettings(st), onNewCampaign: vi.fn(),
      }));
      shell.open();
      const chip = document.querySelector<HTMLElement>('#alius-shell [data-analyze="glossary:trust"]')!;
      chip.dispatchEvent(Object.assign(new Event('pointerover', { bubbles: true }), { pointerType: 'mouse', clientX: 30, clientY: 30 }));
      vi.advanceTimersByTime(250);
      const panel = document.querySelector('#alius-shell .alius-analyze')!;
      const band = trustBand(s.relations[s.squad[0].id].trust).toUpperCase();
      expect(panel.textContent).toContain('Trust');
      expect(panel.textContent).toContain('CURRENT READING');
      expect(panel.textContent).toContain(`${s.squad[0].displayName}: ${band}`);
    } finally {
      shell.destroy();
    }
  });
});
