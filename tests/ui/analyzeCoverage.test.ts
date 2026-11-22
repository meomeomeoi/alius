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
import { renderOpsTab } from '../../src/ui/ops/opsTab';
import { renderHub, type HubCtx } from '../../src/ui/hub/hubScreen';
import { renderBlockingStrip } from '../../src/ui/scene/blockingStrip';
import { renderMomentCard } from '../../src/ui/scene/momentCard';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/personal';
import '../../src/engine/actions/practice';
import { milestonesDue } from '../../src/engine/dynamic/milestones';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { renderClaimCard, renderMilestoneCard, renderReturnCard } from '../../src/ui/dynamic/cards';
import { bodyMapFor, renderBodyMap } from '../../src/ui/dynamic/bodyMap';
import { drawFrameChips } from '../../src/ui/dynamic/frameChip';
import { drawOfferChips } from '../../src/ui/dynamic/offerComposer';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import { renderTaskCard } from '../../src/ui/practice/taskCard';
import { drawPunishmentCards } from '../../src/ui/practice/punishmentCard';
import { blankPractices } from '../../src/engine/practice/state';
import { ANN as PRACTICE_ANN, BEA as PRACTICE_BEA, withService, world as practiceWorld } from '../engine/practice/world';
import { buildKnowledge } from '../../src/analysis/knowledge';
import { renderWorldParams } from '../../src/ui/setup/worldParams';
import { zoneTag } from '../../src/engine/dynamic/zones';
import { blankReading } from '../../src/engine/dynamic/state';
import { addFact } from '../../src/engine/memory/facts';
import { renderPhysicsPanel } from '../../src/ui/scene/physicsPanel';
import '../../src/engine/actions/blocking';
import '../../src/engine/actions/moments';
import '../../src/engine/actions/physics';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../src/engine/blocking';
import { fireMoment } from '../../src/engine/moments/fire';
import { enable } from '../helpers/bonds';
import { errors, run as runAction, setRelation } from '../helpers/loyalty';
import { offerMission, postRumor } from '../../src/engine/world/missions';
import { ctxOf } from '../helpers/world';
import { run } from '../helpers/world';
import { h } from '../../src/ui/dom';
import '../helpers/power'; // registers the P9b actions
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
    const unit = host.querySelector('article.alius-unit')!; // not just `article`: VoiceCards are articles too
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
  const wizard = () => {
    const w = new Wizard(
      { registries: reg, desireBondDefects: false, importer: async () => ({ kind: 'ok', profile: PROFILE, dropped: [], missing: [] }), onChange: () => {} },
      { personaName: 'Vale', canBindCurrent: false },
    );
    w.setMode('veteran'); // the classic dossier shows the crime cards; the prologue's screens are covered below
    return w;
  };

  it('start and crime cards', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = h('div');
    document.body.append(host);
    renderSetupScreen(host, { wizard: wizard(), registries: reg, st, settings: () => DEFAULT_SETTINGS, onCancel: vi.fn(), onConfirm: vi.fn(async () => {}), modal: vi.fn(async () => null) as never });
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

describe('coverage: world parameters and disposition controls (P8)', () => {
  const wiz = () => new Wizard(
    { registries: reg, desireBondDefects: false, importer: async () => ({ kind: 'ok', profile: PROFILE, dropped: [], missing: [] }), onChange: () => {} },
    { personaName: 'Vale', canBindCurrent: false },
  );

  it('the WORLD PARAMETERS step: every card and preset is marked, resolves and can be reached', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const w = wiz();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    w.next();
    expect(w.state.step).toBe('world');
    const host = h('div');
    document.body.append(host);
    renderSetupScreen(host, { wizard: w, registries: reg, st, settings: () => DEFAULT_SETTINGS, onCancel: vi.fn(), onConfirm: vi.fn(async () => {}), modal: vi.fn(async () => null) as never });
    expect(markerCount(host)).toBeGreaterThanOrEqual(reg.worldPresets.size + 15);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(null))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    const addresses = unitIdsIn(host);
    expect(addresses).toEqual(expect.arrayContaining(['worldOptions:disposition', 'worldOptions:oversight', 'worldPresets:brutal']));
  });

  it('the HEAD START options and the NEW ARRIVAL toggles are marked, resolve and can be reached (P11b)', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const w = wiz();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    w.setHeadStart(14);
    w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    w.toggleUnit({ avatar: 'b.png', name: 'Bea' });
    const renderStep = (): HTMLElement => {
      const host = h('div');
      document.body.append(host);
      renderSetupScreen(host, { wizard: w, registries: reg, st, settings: () => DEFAULT_SETTINGS, onCancel: vi.fn(), onConfirm: vi.fn(async () => {}), modal: vi.fn(async () => null) as never });
      return host;
    };
    w.next();
    expect(w.state.step).toBe('world');
    const world = renderStep();
    expect(world.querySelectorAll('.alius-head-start-choice')).toHaveLength(4);
    expect(unitIdsIn(world)).toContain('glossary:head_start');
    for (const host of [world]) {
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(null))).toEqual([]);
      expect(unreachable(host)).toEqual([]);
    }
    document.body.innerHTML = '';
    for (let i = 0; i < 4 && w.state.step !== 'units'; i++) w.next();
    expect(w.state.step).toBe('units');
    w.toggleNewArrival('b.png');
    const units = renderStep();
    expect(units.querySelectorAll('.alius-new-arrival')).toHaveLength(2);
    expect(markedWithout(units)).toEqual([]);
    expect(unresolved(units, env(null))).toEqual([]);
    expect(unreachable(units)).toEqual([]);
    expect(unitIdsIn(units)).toContain('glossary:new_arrival');
  });

  it('every content category row carries data-analyze and resolves (P9d)', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const w = wiz();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    w.next();
    const host = h('div');
    document.body.append(host);
    renderSetupScreen(host, { wizard: w, registries: reg, st, settings: () => DEFAULT_SETTINGS, onCancel: vi.fn(), onConfirm: vi.fn(async () => {}), modal: vi.fn(async () => null) as never });
    const rows = [...host.querySelectorAll<HTMLElement>('button[data-category]')];
    expect(rows).toHaveLength(22);
    expect(rows.map((r) => r.getAttribute('data-analyze'))).toEqual([...reg.contentCategories.keys()].map((id) => `contentCategories:${id}`));
    expect(unresolved(host, env(null))).toEqual([]);
  });

  it('calibration under a hunted world: offset chips, stance chips', () => {
    const w = wiz();
    for (const [k, v] of Object.entries({ gender_norms: 'inverted', offspec_stigma: 'hunted', disposition: 'prickly' })) w.setWorldOption(k, v);
    w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    const draft = w.state.units[0];
    draft.status = 'ready';
    draft.candidates = structuredClone(PROFILE);
    const host = h('div');
    document.body.append(host);
    renderCalibration(host, { draft, registries: reg, desireBondDefects: false, world: w.state.world.options, onUpdate: vi.fn(), onRegenerate: vi.fn(), onManual: vi.fn() });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(null))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('.alius-offset-chip')).toHaveLength(5);
    expect(host.querySelectorAll('.alius-stance-chip')).toHaveLength(10);
    expect(unitIdsIn(host)).toEqual(expect.arrayContaining(['glossary:world_stance', 'dispositionLevels:prickly']));
  });

  it('the SQUAD disposition chip resolves with the unit in its context', () => {
    const host = squad(world(), false);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(world()))).toEqual([]);
    expect(host.querySelectorAll('.alius-chip[data-disposition]').length).toBeGreaterThan(0);
  });
});

describe('coverage: OPS', () => {
  function opsWorld(): CampaignState {
    const s = world();
    s.slot = 'morning';
    offerMission(s, ctxOf(s, reg), { templateId: 'tpl_recover', regionId: 'quarantine_d7', source: 'command' });
    offerMission(s, ctxOf(s, reg), { templateId: 'tpl_recover', regionId: 'quarantine_d7', source: 'side' });
    postRumor(s, ctxOf(s, reg), { text: 'Something moves in the quarantine zone.', tags: ['bloom'], leadsTo: 'mission', lead: { templateId: 'tpl_recover', regionId: 'quarantine_d7' } });
    return s;
  }

  it('activity cards, requisition, missions and rumors are explained', () => {
    const s = opsWorld();
    const host = mount();
    renderOpsTab(host, {
      getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn(),
      onPlan: vi.fn(), onDismiss: vi.fn(), onFollowRumor: vi.fn(),
    });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(25);
    const addresses = new Set(unitIdsIn(host));
    for (const [id, a] of reg.activities) if (a.pastime !== true) expect(addresses.has(`activities:${id}`), id).toBe(true); // P14c: a quiet meeting is picked from her pastimes
    for (const wanted of ['glossary:supplies', 'glossary:mission_board', 'glossary:expedition', 'glossary:danger', 'glossary:reward_tier', 'glossary:mission_deadline', 'regions:quarantine_d7']) {
      expect(addresses.has(wanted), wanted).toBe(true);
    }
    expect([...addresses].some((a) => a.startsWith('nodeTypes:'))).toBe(true);
  });

  it('the text of the cards is unchanged', () => {
    const s = opsWorld();
    const host = mount();
    renderOpsTab(host, { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn(), onPlan: vi.fn(), onDismiss: vi.fn() });
    expect(host.querySelector('[data-activity="train"] h3')!.textContent).toBe('Train');
    expect(host.querySelector('.alius-mission .alius-dim')!.textContent).toMatch(/^.+ · DANGER \d · OBJECTIVE: .+ \(\w+\) · (NO DEADLINE|D-\d+)$/);
    expect(host.querySelector('.alius-board h2')!.textContent).toMatch(/^MISSION BOARD \d+\/\d+$/);
    expect(host.querySelector('.alius-mission')!.textContent).toMatch(/REWARD: TIER \d/);
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
    // `explicitContent` has no SYS row since P9d: the content categories replaced it (it is read once, for the carry-over)
    const missing = [...Object.keys(DEFAULT_SETTINGS), 'difficulty'].filter((k) => k !== 'explicitContent' && !settings.has(k));
    expect(missing).toEqual([]);
    expect(host.querySelectorAll('label.alius-field.alius-option')).toHaveLength(host.querySelectorAll('label.alius-field').length);
  });
});

describe('coverage: squad vote and rations (P9b)', () => {
  it('the VOTE panel and the RATIONS row mark every element, every address resolves and every one can be reached', async () => {
    const { renderVotePanel } = await import('../../src/ui/power/votePanel');
    const s = campaign(reg, 4);
    s.leash.authorizationsLeft = 1;
    s.world.options = { ...(s.world.options ?? {}), voting: 'on' };
    for (const u of s.squad) u.values = { pragmatism: -3, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
    const opened = run(s, reg, { type: 'vote/open', payload: { kind: 'upgrade', subject: 'workshop' } }).state;
    const panel = mount();
    renderVotePanel(panel, opened.power!.votes.open!, { unit_ann: 'Ann objects.' }, { state: opened, registries: reg, onCarry: vi.fn(), onDrop: vi.fn(), onOverrule: vi.fn() });
    const rations = mount();
    renderBaseTab(rations, { getState: () => opened, getLoad: () => ({ kind: 'ok', state: opened, chatId: 'c' }), registries: reg, onUpgrade: vi.fn(), onRecruit: vi.fn(), onSetRoster: vi.fn(), onSetRations: vi.fn() });
    for (const host of [panel, rations]) {
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(opened))).toEqual([]);
      expect(unreachable(host)).toEqual([]);
    }
    const addresses = new Set(unitIdsIn(panel).concat(unitIdsIn(rations)));
    for (const wanted of ['glossary:vote', 'glossary:rations', 'voteKinds:upgrade']) expect(addresses.has(wanted), wanted).toBe(true);
  });
});

describe('coverage: the hierarchy block and the countermand chips (P9b)', () => {
  it('every marker has data-analyze, every address resolves and every one can be reached', async () => {
    const { renderHierarchyBlock } = await import('../../src/ui/power/hierarchy');
    const { drawCountermandChips } = await import('../../src/ui/power/chips');
    const { withLeader } = await import('../helpers/power');
    const s = withLeader(campaign(reg, 4), 'unit_ann');
    s.power!.countermand = { leaderId: 'unit_ann', unitId: 'unit_bea', payload: { activityId: 'train', companionId: 'unit_bea' }, day: s.day, slot: s.slot };
    const block = mount();
    renderHierarchyBlock(block, s, reg, 'unit_ann', { onEndorse: vi.fn(), onChallenge: vi.fn() });
    (block.querySelector('[data-power-act="challenge"]') as HTMLElement).click();
    const chips = mount();
    drawCountermandChips(chips, s, reg, vi.fn());
    for (const host of [block, chips]) {
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(s))).toEqual([]);
      expect(unreachable(host)).toEqual([]);
    }
    const addresses = new Set(unitIdsIn(block).concat(unitIdsIn(chips)));
    for (const wanted of ['glossary:standing', 'glossary:squad_leader', 'glossary:endorse', 'glossary:challenge', 'glossary:countermand']) expect(addresses.has(wanted), wanted).toBe(true);
  });
});

describe('coverage: hub (P10)', () => {
  /** A hub with an injured and a confined unit, a unit away, a story mission, a message, a supply shortage and a Leash entry. */
  function hubWorld(): CampaignState {
    const s = world();
    s.slot = 'morning';
    s.squad[1].status = 'injured';
    s.expedition = { party: [s.squad[3].id] } as unknown as CampaignState['expedition'];
    s.missions.active = [{ id: 'm1', title: 'Hold the line', deadlineDay: s.day + 1, spineBeat: 'b1', status: 'active' } as never];
    s.dms[s.squad[2].id] = [{ id: 'd1', from: s.squad[2].id, text: 'hi', day: s.day, slot: 'morning', read: false }];
    s.world.incomingUnits = 1;
    s.leash.log = [{ no: 1, unitId: s.squad[0].id, kind: 'compel', day: s.day, context: 'scene', outcome: 'done' }];
    return s;
  }
  const hubCtx = (s: CampaignState): HubCtx => ({
    getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
    ops: { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
    onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null,
  });

  it('every marker has data-analyze, every address resolves, and the hub with a room panel open is not vacuous', () => {
    const s = hubWorld();
    const host = mount();
    renderHub(host, h('div'), hubCtx(s));
    host.querySelector<HTMLElement>('.alius-room[data-room="medbay"]')!.click();
    expect(host.querySelector('.alius-room-panel')).not.toBeNull();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(25);
    const addresses = new Set(unitIdsIn(host));
    for (const wanted of ['glossary:objective', 'glossary:end_slot', 'glossary:pda_device', 'glossary:marker_tone', 'glossary:away', 'glossary:tonight', 'glossary:leash', 'hubRooms:medbay']) {
      expect(addresses.has(wanted), wanted).toBe(true);
    }
    // P10d: a hub room drawn as cabins is addressed by its cabins (glossary:cabin), every other one by itself
    for (const id of reg.hubRooms.keys()) {
      const cabins = [...reg.planRooms.values()].some((p) => p.hubRoomId === id && p.cabin !== undefined);
      expect(addresses.has(cabins ? 'glossary:cabin' : `hubRooms:${id}`), id).toBe(true);
    }
  });
});

describe('coverage: her milestone (P15)', () => {
  it('the card and its Tonight line mark every element, and every one opens a panel with no network or model call', () => {
    const state = campaign(reg, 4);
    state.squad[0].bond = {
      leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
      practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
    };
    state.content = { enabled: ['restraint'] };
    state.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
    state.relations[state.squad[0].id].dynamic = { ...blankDynamic(state.day), hold: 25 };
    milestonesDue(state, ctxOf(state, reg), state.squad[0].id);
    expect(state.dynamic.open.milestones).toHaveLength(1);
    const fetchSpy = vi.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as never;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    const root = h('div', { id: 'alius-shell' });
    document.body.append(root);
    try {
      const card = h('div');
      root.append(card);
      renderMilestoneCard(card, { state, reg, milestone: state.dynamic.open.milestones[0], onAnswer: vi.fn() });
      const hubCtx: HubCtx = {
        getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
        ops: { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
        onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null,
      };
      const hubHost = h('div');
      root.append(hubHost);
      renderHub(hubHost, h('div'), hubCtx);
      expect(markedWithout(root)).toEqual([]);
      expect(unresolved(root, env(state))).toEqual([]);
      expect(unreachable(root)).toEqual([]);
      const addresses = new Set(unitIdsIn(root));
      expect(addresses.has('glossary:milestone')).toBe(true);
      expect(addresses.has('dynamicMilestones:first_yes')).toBe(true);
      const analyzer = attachAnalyzer(root, { getEnv: () => ({ registries: reg, state, settings: getSettings(st) }) });
      for (const el of [...root.querySelectorAll<HTMLElement>('[data-analyze="glossary:milestone"], [data-analyze="dynamicMilestones:first_yes"]')]) {
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
      globalThis.fetch = realFetch;
    }
  });
});

describe('coverage: her task card and the record (P16)', () => {
  it('every form of the card and the record lines mark every element, and every one opens a panel with no network or model call', () => {
    const state = withService(practiceWorld(reg, 'role'));
    const base = { id: 'pt1', holderId: PRACTICE_ANN, kind: 'task' as const, tags: ['service'], track: 'service', tier: 1 as const, stakes: 'minor' as const, check: 'model' as const, proof: 'none' as const, text: 'Bring the roster.', summary: 'bring the roster', status: 'offered' as const, acceptForm: 'button_cost' as const, day: state.day };
    const forms = [
      { ...base, id: 'pt1', stakes: 'trivial' as const, acceptForm: 'button' as const },
      { ...base, id: 'pt2', check: 'slot_with_her' as const, deadline: { day: state.day, slot: 'evening' as const } },
      { ...base, id: 'pt3', stakes: 'major' as const, acceptForm: 'words' as const, proof: 'witness' as const, audienceIds: [PRACTICE_BEA] },
      { ...base, id: 'pt4', stakes: 'severe' as const, acceptForm: 'signed' as const },
      { ...base, id: 'pt5', stakes: 'severe' as const, acceptForm: 'signed' as const, said: true as const, handover: 'key' as const },
      { ...base, id: 'pt6', stakes: 'major' as const, acceptForm: 'sealed' as const, sealed: true as const },
    ];
    state.practices = { ...blankPractices(), seq: 7, tasks: forms, records: [{ day: 12, holderId: PRACTICE_ANN, line: 'Bring the roster. Day 12.' }] };
    const fetchSpy = vi.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as never;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    const root = h('div', { id: 'alius-shell' });
    document.body.append(root);
    try {
      for (const task of forms) {
        const card = h('div');
        root.append(card);
        renderTaskCard(card, { state, reg, task, onAnswer: vi.fn(), onSign: vi.fn(), focusInput: vi.fn() });
      }
      const cmdr = h('div');
      root.append(cmdr);
      renderCmdrCard(cmdr, { state, registries: reg, raw: false });
      expect(markedWithout(root)).toEqual([]);
      expect(unresolved(root, env(state))).toEqual([]);
      expect(unreachable(root)).toEqual([]);
      const addresses = new Set(unitIdsIn(root));
      for (const id of ['task_card', 'practice_task', 'consent_ladder', 'accept_words', 'accept_signed', 'practice_record', 'sealed']) expect(addresses.has(`glossary:${id}`), id).toBe(true);
      const analyzer = attachAnalyzer(root, { getEnv: () => ({ registries: reg, state, settings: getSettings(st) }) });
      for (const el of [...root.querySelectorAll<HTMLElement>('[data-analyze^="glossary:"]')]) {
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
      globalThis.fetch = realFetch;
    }
  });
});

describe('coverage: her discipline cards (P16)', () => {
  it('the punishment card, the TAKE IT INSTEAD card and the UNDO chip mark every element, and every one opens a panel with no network or model call', async () => {
    const state = withService(practiceWorld(reg, 'role'));
    const { dynamicOf } = await import('../../src/engine/dynamic/state');
    const { run } = await import('../helpers/world');
    dynamicOf(state, PRACTICE_ANN)!.hold = 45;
    const pun = (id: string, over: Record<string, unknown> = {}) => ({ id, holderId: PRACTICE_ANN, entryId: 'no_messages', severity: 2 as const, offence: { kind: 'task_broken' as const, stakes: 'major' as const, day: state.day }, text: 'A day without messages.', summary: 'a day without messages', status: 'offered' as const, day: state.day, ...over });
    state.practices = { ...blankPractices(), seq: 9, punishments: [pun('pp1'), pun('pp2', { entryId: 'verbal', severity: 1, forUnitId: PRACTICE_BEA, text: 'Bea earned a talking-to.', summary: 'a talking-to for Bea', plain: true }), pun('pp3', { status: 'negotiating', entryId: 'kept_in_quarters', severity: 3 })] };
    const answered = run(structuredClone(state), reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } }).state;
    const fetchSpy = vi.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as never;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    const root = h('div', { id: 'alius-shell' });
    document.body.append(root);
    try {
      for (const s of [state, answered]) {
        const host = h('div');
        root.append(host);
        drawPunishmentCards(host, s, reg, () => true, { answer: vi.fn(), takeInstead: vi.fn(), undo: vi.fn() });
      }
      expect(root.querySelector('[data-undo-practice]')).not.toBeNull();
      expect(root.querySelector('.alius-take-instead')).not.toBeNull();
      expect(markedWithout(root)).toEqual([]);
      expect(unresolved(root, env(answered))).toEqual([]);
      expect(unreachable(root)).toEqual([]);
      const addresses = new Set(unitIdsIn(root));
      for (const id of ['holder_punishment', 'punishment_card', 'take_it_instead']) expect(addresses.has(`glossary:${id}`), id).toBe(true);
      const analyzer = attachAnalyzer(root, { getEnv: () => ({ registries: reg, state: answered, settings: getSettings(st) }) });
      for (const el of [...root.querySelectorAll<HTMLElement>('[data-analyze^="glossary:"]')]) {
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
      globalThis.fetch = realFetch;
    }
  });
});

describe('coverage: the dynamic (P15)', () => {
  /** Ann holds at role (a domain, a track, a vow, a claim and a milestone waiting); Bea at play; Cat's return offer is open and Eve's grief runs; oversight threatens Ann. */
  function dynWorld(): CampaignState {
    const s = campaign(reg, 4);
    const bond = {
      leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
      practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary: 'cold' as const }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
    };
    const [ann, bea, cat, dee] = s.squad.map((u) => u.id);
    for (const u of s.squad.slice(0, 2)) u.bond = bond;
    s.squad[0].expectations = { worship: { feet: { attitude: 'craves', meaning: 'intimacy' }, toes: { attitude: 'enjoys' } }, holdsUntil: 'limit', tells: { irritation: 'she taps the table' } };
    s.content = { enabled: ['restraint', 'worship', 'service', 'humiliation', 'objectification'] };
    s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
    s.relations[ann].dynamic = {
      ...blankDynamic(s.day), frame: 'role', hold: 62, domains: [{ id: 'device', since: 1 }], tracks: { restraint: { xp: 40, level: 2 } },
      readOf: { ...blankReading(), region: 'proud', updates: 4 }, sworn: { day: 3 },
    };
    s.relations[bea].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
    s.relations[dee].dynamic = { ...blankDynamic(s.day), aftermath: { id: 'da1', kind: 'grief', stage: 0, untilDay: s.day + 5 } };
    s.dynamic.open.claims.push({ id: 'dc1', unitId: ann, domainId: 'body', day: s.day });
    s.dynamic.open.milestones.push({ id: 'dm1', unitId: ann, milestoneId: 'handover', day: s.day, form: 'scene' });
    s.dynamic.open.returnOffer = { id: 'dr1', unitId: cat, terms: 'lower_band', day: s.day };
    s.dynamic.oversight = { blocked: [], threat: { unitId: ann, untilDay: s.day + 4 } };
    addFact(s, { about: [ann], text: 'AUTHOR TO WRITE: Ann likes her feet looked after.', tags: [zoneTag('feet')], importance: 2, day: 4, knownBy: [ann] });
    return s;
  }

  it('the section, its cards and exit, the CMDR line, the frame chip, the composer, the body map, the setup block and SYS mark every element, and every one opens a panel with no network or model call', () => {
    const state = dynWorld();
    const [ann, , cat] = state.squad.map((u) => u.id);
    const fetchSpy = vi.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as never;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    const settings = { ...getSettings(st), showRawValues: true };
    const root = h('div', { id: 'alius-shell' });
    document.body.append(root);
    const add = (): HTMLElement => { const el = h('div'); root.append(el); return el; };
    try {
      // her dossier: the DYNAMIC section with the exit card open
      const squadHost = add();
      renderSquadTab(squadHost, {
        st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings,
        onNewCampaign: vi.fn(), onPunish: vi.fn(), onLeash: vi.fn(), dynamic: { dispatch: () => [], onChanged: vi.fn(), actions: { exit: vi.fn(), requestTransfer: vi.fn() } },
      } as never);
      for (const b of squadHost.querySelectorAll<HTMLElement>('[data-action="dyn-exit"]')) b.click();
      expect(squadHost.querySelectorAll('.alius-dynamic-section')).toHaveLength(3); // Ann, Bea and Dee (at equal, with an aftermath: nothing to end)
      expect(squadHost.querySelectorAll('.alius-exit')).toHaveLength(2); // Ann's and Bea's
      // the cards
      const cards = add();
      renderClaimCard(cards, { state, reg, claim: state.dynamic!.open.claims[0], onAnswer: vi.fn() });
      renderReturnCard(cards, { state, reg, offer: state.dynamic!.open.returnOffer!, onAnswer: vi.fn() });
      // the CMDR line, the frame chip beside the lead chips, the body map and the offer composer (open)
      renderCmdrCard(add(), { state, registries: reg, raw: true });
      drawFrameChips(add(), state, reg, () => true, false);
      renderBodyMap(add(), bodyMapFor(state, reg, buildKnowledge(state, settings), ann, false));
      const offer = add();
      drawOfferChips(offer, { state, reg, pick: (id) => id === ann, onOffer: vi.fn() });
      offer.querySelector<HTMLElement>('[data-action="offer"]')!.click();
      expect(offer.querySelector('.alius-offer')).not.toBeNull();
      // the hub's Tonight lines (a claim and a milestone waiting, a return offer, an aftermath's notice, oversight's threat)
      const hubHost = add();
      renderHub(hubHost, h('div'), {
        getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings,
        ops: { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
        onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null,
      });
      // SYS › Dynamic, and WORLD PARAMETERS › DYNAMIC
      renderSysTab(add(), { st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), getRegistries: () => reg, dispatch: () => [], toast: vi.fn(), modal: async () => null, onSettingsChanged: vi.fn() } as never);
      const w = new Wizard(
        { registries: reg, desireBondDefects: false, importer: async () => ({ kind: 'ok', profile: PROFILE, dropped: [], missing: [] }), onChange: () => {} },
        { personaName: 'Vale', canBindCurrent: false },
      );
      w.setStart('start_vesper');
      w.setCrime('mutiny');
      w.setContent(['restraint']);
      w.setHeadStart(7);
      renderWorldParams(add(), { wizard: w, registries: reg });

      expect(root.querySelector('.alius-dynamic')).not.toBeNull(); // the setup block was drawn
      expect(root.querySelector('.alius-dynamic-host select')).not.toBeNull(); // and SYS's
      expect(markedWithout(root)).toEqual([]);
      expect(unresolved(root, env(state, true))).toEqual([]);
      expect(unreachable(root)).toEqual([]);
      const addresses = new Set(unitIdsIn(root));
      for (const wanted of [
        'glossary:frame', 'glossary:hold', 'glossary:vow', 'glossary:her_reading', 'glossary:dynamic', 'glossary:dynamic_exit', 'glossary:claim', 'glossary:milestone', 'glossary:aftermath',
        'glossary:offer', 'glossary:oversight_inquiry', 'dynamicDomains:device', 'dynamicTracks:restraint', 'worshipTargets:feet', 'glossary:dynamic_may_hold', 'glossary:setting_dynamic_holders',
      ]) expect(addresses.has(wanted), wanted).toBe(true);
      expect(addresses.has('setting:dynamicHidden')).toBe(true);
      expect(cat).toBeDefined();
      const analyzer = attachAnalyzer(root, { getEnv: () => ({ registries: reg, state, settings }) });
      const marked = [...root.querySelectorAll<HTMLElement>('[data-analyze]')];
      expect(marked.length).toBeGreaterThan(80);
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
      globalThis.fetch = realFetch;
    }
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
      const hubHost = addHost();
      renderHub(hubHost, h('div'), {
        getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => getSettings(st),
        ops: { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
        onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null,
      });
      hubHost.querySelector<HTMLElement>('.alius-room[data-room="mess"]')!.click();

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
      shell.showTab('squad'); // the hub opens first; the tab is drawn once the PDA is raised (P10b: ask for SQUAD, HOME is the default)
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

describe('coverage: the prologue screens (P11)', () => {
  const screen = (step: 'dossier' | 'cold_open' | 'intake' | 'exam' | 'file', canBind = false): HTMLElement => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const w = new Wizard(
      { registries: reg, desireBondDefects: false, importer: async () => ({ kind: 'ok', profile: PROFILE, dropped: [], missing: [] }), onChange: () => {} },
      { personaName: 'Vale', canBindCurrent: canBind },
    );
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    for (let i = 0; i < 12 && w.state.step !== step; i++) w.next();
    expect(w.state.step).toBe(step);
    const host = mount();
    renderSetupScreen(host, { wizard: w, registries: reg, st, settings: () => DEFAULT_SETTINGS, onCancel: vi.fn(), onConfirm: vi.fn(async () => {}), modal: vi.fn(async () => null) as never });
    return host;
  };

  it.each(['dossier', 'cold_open', 'intake', 'exam', 'file'] as const)('%s: every option, chip and stat is marked, resolves and can be reached', (step) => {
    const host = screen(step, step === 'file');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(null))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('the intake marks the crime cards, the exam its controls, the dossier its buttons and the dossier step the veteran toggle', () => {
    const addresses = (step: Parameters<typeof screen>[0]) => unitIdsIn(screen(step));
    expect(addresses('intake').filter((a) => a.startsWith('crimes:'))).toHaveLength(reg.crimes.size);
    expect(addresses('exam')).toEqual(expect.arrayContaining(['glossary:body_strength', 'glossary:expression', 'glossary:seasoning']));
    expect(addresses('file')).toEqual(expect.arrayContaining(['glossary:personnel_dossier', 'glossary:intake_interview', 'glossary:medical_exam']));
    expect(addresses('dossier')).toContain('glossary:veteran_intake');
  });
});


describe('coverage: the scene (P15a)', () => {
  afterEach(() => resetBlockingHooks());

  it('the strip, the moment card and the physics panel mark every element, and every one opens a panel with no network or model call', () => {
    registerFrameReader(() => 'play');
    const base = campaign(reg, 4);
    setRelation(base, 'unit_ann', { stateId: 'confidant' });
    enable(base, 'worship', 'restraint', 'service', 'objectification', 'humiliation');
    const opened = runAction(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: ['unit_ann'], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(opened.events)).toEqual([]);
    const s = opened.state;
    setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'hood' }, { at: 1, source: 'chip' });
    setBlocking(s, { registries: reg }, { person: 'unit_ann', field: 'contact', value: 'smothered_armpit', with: COMMANDER }, { at: 2, source: 'chip' });
    const held = runAction(s, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
    expect(errors(held.events)).toEqual([]);
    const state = held.state;
    fireMoment(state, { registries: reg }, 'third_party', 'unit_ann');
    const fetchSpy = vi.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as never;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    const root = h('div', { id: 'alius-shell' });
    document.body.append(root);
    try {
      const strip = h('div'), card = h('div'), panel = h('div');
      root.append(strip, card, panel);
      renderBlockingStrip(strip, { state, registries: reg, onStage: vi.fn() });
      renderMomentCard(card, { state, registries: reg, chips: 'chips', onStage: vi.fn() });
      renderPhysicsPanel(panel, {
        state, registries: reg, settings: DEFAULT_SETTINGS, onTap: vi.fn(),
        staging: { input: vi.fn(), endSegment: () => [], stopWord: () => [], skip: () => [], stimulus: () => [], act: () => [], finishCounted: () => [], cue: () => null, beat: () => 0 },
      });
      expect(markedWithout(root)).toEqual([]);
      expect(unresolved(root, env(state))).toEqual([]);
      expect(unreachable(root)).toEqual([]);
      const analyzer = attachAnalyzer(root, { getEnv: () => ({ registries: reg, state, settings: getSettings(st) }) });
      const marked = [...root.querySelectorAll<HTMLElement>('[data-analyze]')];
      expect(marked.length).toBeGreaterThan(20);
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
      globalThis.fetch = realFetch;
    }
  });
});
