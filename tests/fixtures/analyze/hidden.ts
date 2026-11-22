import { registerKnowledgeRule } from '../../../src/analysis/knowledge';
import { specialKnowledgeRule } from '../../../src/analysis/providers/special';
import { wardenKnowledgeRule } from '../../../src/analysis/providers/warden';
import type { Registries } from '../../../src/content/types';
import type { LifeEventEntry } from '../../../src/engine/life/types';
import { addCompromat } from '../../../src/engine/dynamic/compromat';
import { blankDynamic, blankReading, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { DYNAMIC_KNOWLEDGE_TAG } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign } from '../../helpers/world';

/** Numbers and texts the player must never read off a panel (with raw values off, or at all). */
export interface Sentinels {
  numbers: number[];
  texts: string[];
}

/**
 * A campaign full of things the analysis tool must not reveal: exact axis values, stress, ledger amounts,
 * a hidden clock, a fact a knowledge rule hides, disloyalty internals and the effects of an open decision.
 * Registers the knowledge rule that hides the sentinel fact; tests call `resetKnowledgeRules()` afterwards.
 */
export function hiddenFixture(reg: Registries): { state: CampaignState; unitId: string; sentinels: Sentinels } {
  const state = campaign(reg, 4);
  state.day = 8;
  const unit = state.squad[0];
  unit.stress = 63;
  Object.assign(state.relations[unit.id], { trust: 37, affinity: -41, attraction: 23, impunityRecord: 31 });
  // P9: the stored term of her Impunity, a queued covert sabotage and the commander's counted deeds are never shown
  state.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [], demandLog: [], sabotage: { queued: [{ unitId: unit.id, day: 8 }] } };
  state.commander.deeds = { threats_empty: 53, punish_2: 59 };
  state.commander.reputation = { active: [{ id: 'iron_rule', name: 'Iron Rule', sinceDay: 3 }] }; // its counter is the sentinel 59

  state.ledger = [
    { day: 8, slot: 'morning', action: 'scene/exchange', key: `axis:${unit.id}:trust`, delta: 17 },
    { day: 8, slot: 'morning', action: 'scene/exchange', key: `stress:${unit.id}`, delta: -29 },
  ];

  state.world.clocks.push({ id: 'secret_plan', label: 'SENTINEL_CLOCK', segments: 8, filled: 5, visibleToPlayer: false });

  state.memory.facts.push({
    id: 'fact_sentinel', about: [unit.id], text: 'SENTINEL_FACT', tags: ['sentinel'], importance: 3, day: 8, knownBy: [],
  });
  registerKnowledgeRule({ fact: (f) => !f.tags.includes('sentinel') });

  // P9c: a squad secret the commander has not found: its text and its kind's wording never reach a reading
  state.personal = {
    seq: 1,
    secrets: [{ id: 'sx_1', kindId: 'trader_deal', text: 'SENTINEL_SECRET', knownBy: [unit.id, state.squad[1].id], reason: 'self_interest', day: 8, status: 'kept' }],
  };

  // P12: what the frequency caught (a true fragment, its worded text), how suspicious she is and the hidden fact of her discovery
  state.special = {
    frequency: {
      intercepts: [{ id: 'fq1', unitId: unit.id, day: 8, kind: 'stance', value: 'fearful', true: true, partial: false, text: 'SENTINEL_FREQ_TRUE' }],
      seq: 1, suspicion: { [unit.id]: 71 }, dmDay: {}, factId: 'fact_freq',
    },
  };
  // P12: the handler's clocks and an unanswered visit with a false item whose label is a sentinel
  state.special.debts = {
    corporationId: 'kestrel', handlerId: 'the_clerk', visitSeq: 1, answered: [], handlerSuspicion: 57, handlerPressure: 12, oversightSuspicion: 63, scheduled: [], exposures: [],
    visit: { id: 'hv1', day: 8, items: [{ id: 'plan:sentinel', kind: 'plan', refId: 'sentinel', label: 'SENTINEL_INTEL_FALSE' }] },
  };
  // P12: a real and a false premonition: their ids and the fact that one is real never reach a reading
  state.special.paranoia = {
    seq: 2,
    premonitions: [
      { id: 'SENTINEL_PREMONITION_REAL', unitId: unit.id, about: 'mutiny', day: 8, expiresDay: 11, real: true },
      { id: 'SENTINEL_PREMONITION_FALSE', unitId: state.squad[1].id, about: 'doubt', day: 8, expiresDay: 11, real: false },
    ],
  };
  state.memory.facts.push({
    id: 'fact_freq', about: [unit.id], text: 'SENTINEL_FREQ_FACT', tags: ['frequency'], importance: 5, day: 8, knownBy: [unit.id], hiddenFromCommander: true,
  });
  state.relations[unit.id].flags.push('knows_frequency');
  registerKnowledgeRule(specialKnowledgeRule); // P12's own rule hides the fact and the flag (not announced)

  // P13: a warden whose satisfaction, defiance and unknown expectation (its kind, text and weight) never reach a reading
  state.leashswap = {
    deathRule: 'rewind_day', status: 'held',
    intrigue: { suspicion: 67, seq: 0, lastAllyDay: {}, hack: { step: 0 }, discovered: 0 },
    warden: {
      unitId: state.squad[1].id, assignedBy: 'player', sinceDay: 1, agenda: 'model', satisfaction: 43, defiance: 47, warnings: [], leashLeft: 2, leashRefreshDay: 14, restrictions: [], punishLog: [],
      expectations: [
        { id: 'x1', kind: 'personal', weight: 0.31, source: 'card', known: false, text: 'SENTINEL_EXPECTATION' },
        { id: 'x2', kind: 'meet_quota', weight: 0.5, source: 'corporate', known: false },
        { id: 'x3', kind: 'protect_squad', weight: 0.19, source: 'values', known: true },
      ],
    },
  };

  // P13: a kompromat fact the commander has not found: its text never reaches a reading, and neither does the intrigue suspicion (67 above)
  state.memory.facts.push({ id: 'fact_komp', about: [state.squad[1].id], text: 'SENTINEL_KOMPROMAT', tags: ['kompromat'], importance: 3, day: 8, knownBy: [unit.id], hiddenFromCommander: true });
  registerKnowledgeRule(wardenKnowledgeRule); // P13: what the warden knows about an ally

  // P14b: what she is becoming that no panel may show: the accumulator (4.37), a moment and a line no scene has carried, a pending and a misread appraisal
  state.squad[0].insight = 'low';
  state.squad[0].development = {
    drift: { mercy: 1.4 }, acc: { 'value:mercy': 4.37, 'value:autonomy': 2.19 }, anchors: ['value:ingroup'], counters: { 'activity:train': 7 }, habits: [], nextId: 9,
    pending: [{ id: 'ap1', day: 7, kind: 'praised', target: 'her', role: 'witness', wanted: 'no', initiator: 'actor', harm: 'minor', outcome: 'bad', severity: 'moderate', subject: 'commander', pushes: [], summary: 'SENTINEL-PENDING' }],
    misread: [{ id: 'ap2', day: 7, kind: 'coerced', target: 'commander', role: 'witness', wanted: 'no', initiator: 'actor', harm: 'minor', outcome: 'bad', severity: 'moderate', subject: 'commander', misread: true, truth: { wanted: 'yes', initiator: 'target', harm: 'none', outcome: 'good' }, pushes: [], summary: 'SENTINEL-MISREAD' }],
    moments: [
      { id: 'dm1', axis: 'value:mercy', from: '0', to: '1', reason: 'A reason she has shown.', day: 5, sceneId: 's1', shownDay: 6 },
      { id: 'dm2', axis: 'value:autonomy', from: '0', to: '1', reason: 'SENTINEL-UNSHOWN-MOMENT', day: 7 },
    ],
    facts: [
      { id: 'df1', text: 'She keeps a spare ration.', kind: 'attitude', day: 5, source: 'review', sceneId: 's1', shownDay: 6 },
      { id: 'df2', text: 'SENTINEL-UNSHOWN-FACT', kind: 'memory', day: 7, source: 'review' },
    ],
  };
  state.squad[0].development.drift.autonomy = 1.2; // the unshown moment's axis has already moved: the effective value changed, nothing says so yet

  state.disloyalty = { units: { [unit.id]: { signs: [], attempts: 3, nextCheckDay: 97 } } };

  state.dilemmas = {
    seq: 1,
    open: {
      id: 'dil_1', templateId: 'dil_fixture', scale: 'major', context: 'base', day: 8, status: 'presented', attempts: 0,
      units: [unit.id], beatId: 'beat_fixture', title: 'A hard call', setup: 'Something must be decided.',
      options: [
        { label: 'SENTINEL_OPTION_EFFECT', effects: [{ type: 'faction', factionId: 'vesper', amount: 77 }], magnitudes: [] },
        { label: 'Hold back', requires: { stat: 'empathy', rank: 2 }, effects: [{ type: 'party_stress', amount: 5 }], magnitudes: [] },
      ],
    },
  } as CampaignState['dilemmas'];

  // P14c: her life that no panel may show. An event she has not told and one she keeps to herself (their text AND their ids travel on `life_event` /
  // `life_shared`, so no describe, toast, log or reading may render either), an opinion she has not voiced, the persuasion on one she has, a joke count,
  // skill and interest as numbers, a queued item, and her aptitudes (drawn only while the edit lock is off)
  const events = [...reg.lifeEvents.values()] as unknown as LifeEventEntry[];
  const untoldEvent = events.find((e) => e.share === 'anyone' && e.becomes === undefined)!;
  const keepsEvent = events.find((e) => e.share === 'keeps' && e.keepsUnless === undefined && e.becomes === undefined)!;
  state.settings.lifeEvents = 'normal';
  state.memory.facts.push(
    { id: 'fact_untold', about: [unit.id], text: 'SENTINEL-UNTOLD', tags: ['life', 'untold', 'sentinel', untoldEvent.id], importance: 1, day: 7, knownBy: [unit.id], hiddenFromCommander: true },
    { id: 'fact_keeps', about: [unit.id], text: 'SENTINEL-KEEPS', tags: ['life', 'untold', 'sentinel', keepsEvent.id], importance: 1, day: 7, knownBy: [unit.id], hiddenFromCommander: true },
  );
  state.life = {
    salt: 5, nextId: 1, queue: [{ id: 'ln_SENTINEL-QUEUED', unitId: unit.id, kind: 'event', ref: untoldEvent.id, what: 'event', factId: 'fact_untold', category: 'things', day: 7 }],
    delivered: [], outbox: [], news: [], kinds: [], deaths: [], busy: [],
    units: { [unit.id]: { last: { [untoldEvent.id]: 7, [keepsEvent.id]: 7 }, jokes: { fact_sentinel: { count: 19, last: 7 } } } },
  };
  state.squad[0].hobbies = [{ id: 'reading', skill: 47.31, interest: 63.17, state: 'active', since: 1, milestones: [], plateau: { at: 47.31, since: 5 } }];
  state.squad[0].aptitudes = { high: ['stargazing'], low: ['woodcarving'] };
  state.squad[0].opinions = {
    books: { position: 'SENTINEL-UNVOICED-POSITION', strength: 'strong', formedDay: 3, text: 'SENTINEL-UNVOICED' },
    corporations: { position: 'necessary', strength: 'held', formedDay: 3, voicedDay: 6, push: { toward: 'last', amount: 5.13 } },
  };

  // P15a: what a hold keeps from the commander: the xp behind the endurance words (83.77), her skills and the practice behind them (6.83), a tolerance, an
  // exposure and the seeking share of a scent (the stage is a word, the numbers are not)
  state.commander.endurance = { breath: { xp: 83.77, level: 2 } };
  state.commander.stimuli = { scent_feet: { tolerance: 31.41, exposure: 8.86, lastDay: 7, best: 31.41, seek: 0.6174, stage: 'accustomed' } };
  state.relations[unit.id]!.herSkill = { seal: 3, weight: 1, reading: 2, swing: 0, rhythm: 1, practice: { seal: 6.83 } };

  // P15: what the dynamic keeps from the commander. Her hold (37.37) and her Regard (61.61), a witness's suspicion (59.59) and the fact of what she knows, her reading's readiness
  // (0.4141), the xp behind the commander's mastery (23.23), a compromat fact she has not mentioned, a tell and a worship entry no fact has shown, and the stage of an aftermath (7.77).
  // She holds the command (a countermand), so her override has a chance that is computed and must never be written either (`hidden.test.ts` asserts it).
  const witness = state.squad[1].id;
  state.content = { enabled: ['restraint', 'worship'] };
  unit.bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  unit.expectations = { tells: { irritation: 'SENTINEL_TELL', pleasure: 'SENTINEL_TELL' }, worship: { feet: { attitude: 'craves', how: 'SENTINEL_WORSHIP_HOW' } }, holdsUntil: 'blackout' };
  state.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  state.relations[unit.id].dynamic = {
    ...blankDynamic(8), frame: 'play', hold: 37.37, domains: [{ id: 'command', since: 1 }], tracks: { restraint: { xp: 44.44, level: 2 } },
    readOf: { ...blankReading(), r: 0.4141, f: 0.1212, p: 0.3, region: 'dutiful', updates: 5 },
    aftermath: { id: 'da1', kind: 'grief', stage: 0, untilDay: 7.77, stageUntil: 7.77 },
  };
  state.relations[unit.id].regard = 61.61;
  state.relations[unit.id].mastery = { feet: 23.23 };
  state.dynamic.knowledge = { [witness]: { [unit.id]: { suspicion: 59.59, level: 'knows_dynamic', levelDay: 7 } } };
  addCompromat(state, unit.id, 'SENTINEL_COMPROMAT_P15', [witness]);
  state.memory.facts.push({
    id: 'fact_dyn_knows', about: [witness, unit.id], text: 'SENTINEL_KNOWLEDGE_P15', tags: [DYNAMIC_KNOWLEDGE_TAG, 'knows_dynamic'], importance: 3, day: 7, knownBy: [witness], hiddenFromCommander: true,
  });
  registerKnowledgeRule({ fact: (f) => f.hiddenFromCommander !== true }); // P3b's own rule (registered once, with the core providers, which a test's reset removes)

  return {
    state,
    unitId: unit.id,
    sentinels: {
      numbers: [37, 41, 23, 63, 17, 29, 97, 77, 31, 53, 59, 71, 57, 43, 47, 67, 4.37, 2.19, 47.31, 63.17, 5.13, 19, 83.77, 6.83, 31.41, 8.86, 0.6174, 37.37, 61.61, 59.59, 0.4141, 23.23, 7.77, 44.44],
      texts: ['SENTINEL-UNTOLD', 'SENTINEL-KEEPS', 'SENTINEL-UNVOICED', 'SENTINEL-QUEUED', 'stargazing', 'woodcarving', untoldEvent.id, keepsEvent.id, 'SENTINEL-PENDING', 'SENTINEL-MISREAD', 'SENTINEL-UNSHOWN-MOMENT', 'SENTINEL-UNSHOWN-FACT', 'SENTINEL_CLOCK', 'SENTINEL_FACT', 'SENTINEL_OPTION_EFFECT', 'SENTINEL_SECRET', 'SENTINEL_FREQ_TRUE', 'SENTINEL_FREQ_FACT', 'SENTINEL_PREMONITION_REAL', 'SENTINEL_PREMONITION_FALSE', 'SENTINEL_INTEL_FALSE', 'SENTINEL_EXPECTATION', 'SENTINEL_KOMPROMAT', 'SENTINEL_COMPROMAT_P15', 'SENTINEL_TELL', 'SENTINEL_WORSHIP_HOW', 'SENTINEL_KNOWLEDGE_P15'],
    },
  };
}
