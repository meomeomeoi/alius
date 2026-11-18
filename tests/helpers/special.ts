import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { seedRng } from '../../src/engine/rng';
import { unitSetup } from './world';

// Importing this registers the actions the special tests run through.
import '../../src/engine/actions/special';

export const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
export type SpecialTrait = 'secret_frequency' | 'bloom_paranoia' | 'web_of_debts';

/** A four-unit campaign (no defects, so only what a test sets matters) with a special trait, or with none. */
export function specialCampaign(reg: Registries, trait?: SpecialTrait, seed = 5): CampaignState {
  const r = buildCampaign(
    {
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
      units: ['Ann', 'Bea', 'Cat', 'Dee'].map((n) => unitSetup(n)),
      commander: { body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular: [], ...(trait ? { special: trait } : {}) } },
    },
    reg, { desireBondDefects: false, seed },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  for (const u of r.state.squad) u.defects = []; // a defect needs 1–2 at setup; only what a test sets should matter afterwards
  return r.state;
}

/** The same state with the campaign rng set to `seed` (a state is cloned, never changed in place). */
export function reseed(s: CampaignState, seed: number): CampaignState {
  return { ...structuredClone(s), rng: seedRng(seed) };
}
