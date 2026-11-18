import { registerKnowledgeRule } from '../../../src/analysis/knowledge';
import { specialKnowledgeRule } from '../../../src/analysis/providers/special';
import type { Registries } from '../../../src/content/types';
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

  return {
    state,
    unitId: unit.id,
    sentinels: {
      numbers: [37, 41, 23, 63, 17, 29, 97, 77, 31, 53, 59, 71, 57],
      texts: ['SENTINEL_CLOCK', 'SENTINEL_FACT', 'SENTINEL_OPTION_EFFECT', 'SENTINEL_SECRET', 'SENTINEL_FREQ_TRUE', 'SENTINEL_FREQ_FACT', 'SENTINEL_PREMONITION_REAL', 'SENTINEL_PREMONITION_FALSE', 'SENTINEL_INTEL_FALSE'],
    },
  };
}
