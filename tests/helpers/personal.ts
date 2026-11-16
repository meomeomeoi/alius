import type { Registries } from '../../src/content/types';
import { impunityOf } from '../../src/engine/discipline/impunity';
import { Rng, seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { withBond } from './bonds';
import { campaign, setRecord, setRelation } from './discipline';

export * from './discipline';
export { enable, withBond } from './bonds';
export { withOptions } from './power';

// Importing this registers the P9c actions and the personal day step under test (the other actions come with ./discipline).
import '../../src/engine/actions/personal';

export const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
export type Lead = 'yielding' | 'balanced' | 'assertive' | 'dominant';

/** Puts her Impunity at exactly `n` (moves the stored record; the range is ±40 around what her state and Trust give). */
export function atImpunity(s: CampaignState, reg: Registries, id: string, n: number): CampaignState {
  setRecord(s, id, 0);
  const at0 = impunityOf(s, reg, id)!.value;
  setRecord(s, id, n - at0);
  const got = impunityOf(s, reg, id)!.value;
  if (got !== n) throw new Error(`could not put ${id} at Impunity ${n} (got ${got})`);
  return s;
}

/** A four-unit campaign with every defect removed, so only what a test sets matters. */
export function plain(reg: Registries): CampaignState {
  const s = campaign(reg, 4);
  for (const u of s.squad) u.defects = [];
  return s;
}

/** Gives a unit an imported bond profile and a state with the axes (in place, returns the state). */
export function partner(
  s: CampaignState, id: string, o: { lead?: Lead; attachment?: 'slow' | 'steady' | 'intense' | 'avoidant'; stateId?: string; affinity?: number; trust?: number; want?: number } = {},
): CampaignState {
  withBond(s, id, { leadStyle: o.lead ?? 'assertive', attachment: o.attachment ?? 'steady', desire: 'high' });
  setRelation(s, id, { stateId: o.stateId ?? 'lover', affinity: o.affinity ?? 70, trust: o.trust ?? 60 });
  if (o.want !== undefined) s.relations[id].want = o.want;
  return s;
}

/** A context drawing from the state's own rng (for calling engine functions directly; the draw is not written back). */
export const ctxFrom = (s: CampaignState, registries: Registries) => ({ registries, rng: new Rng(s.rng) });

/** Reseeds a copy of the state. */
export function seeded(s: CampaignState, seed: number): CampaignState {
  const t = structuredClone(s);
  t.rng = seedRng(seed);
  return t;
}
