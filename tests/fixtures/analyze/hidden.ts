import { registerKnowledgeRule } from '../../../src/analysis/knowledge';
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
  Object.assign(state.relations[unit.id], { trust: 37, affinity: -41, attraction: 23 });

  state.ledger = [
    { day: 8, slot: 'morning', action: 'scene/exchange', key: `axis:${unit.id}:trust`, delta: 17 },
    { day: 8, slot: 'morning', action: 'scene/exchange', key: `stress:${unit.id}`, delta: -29 },
  ];

  state.world.clocks.push({ id: 'secret_plan', label: 'SENTINEL_CLOCK', segments: 8, filled: 5, visibleToPlayer: false });

  state.memory.facts.push({
    id: 'fact_sentinel', about: [unit.id], text: 'SENTINEL_FACT', tags: ['sentinel'], importance: 3, day: 8, knownBy: [],
  });
  registerKnowledgeRule({ fact: (f) => !f.tags.includes('sentinel') });

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
      numbers: [37, 41, 23, 63, 17, 29, 97, 77],
      texts: ['SENTINEL_CLOCK', 'SENTINEL_FACT', 'SENTINEL_OPTION_EFFECT'],
    },
  };
}
