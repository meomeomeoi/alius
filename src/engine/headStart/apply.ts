import type { Registries } from '../../content/types';
import type { CampaignState, HeadStartState } from '../state/types';
import { developRelation, impressionOf, rollCrime, type AxisDelta } from './develop';
import { applyMoment, capTrust, headStartTransition, pickMoments } from './moments';

export { HEAD_START_SKIPPED_KINDS } from './skip';

/**
 * Applies the head start once, after every unit has joined (P11b §3): for each soldier who is not a new arrival, in squad order,
 * development of her first impression, the crime roll, her remembered moments, the trust cap and at most one transition. Then every
 * `dailyGain` is reset (the crime reaction went through the gain handler; day 1 starts with fresh gains) and `headStart` is stored.
 * `impressions` holds, per known unit, the change `applyFirstImpression` made and her Trust right after it. Deterministic, no draw.
 */
export function applyHeadStart(
  draft: CampaignState, reg: Registries,
  o: { seed: number; days: 7 | 14 | 30; impressions: Map<string, { delta: AxisDelta; trustBefore: number }> },
): void {
  const units: HeadStartState['units'] = [];
  for (const unit of draft.squad) {
    const known = o.impressions.get(unit.id);
    const rel = draft.relations[unit.id];
    if (!known || !rel) continue;
    developRelation(rel, known.delta, o.days, o.seed, unit.id);
    const impression = impressionOf(known.delta);
    rollCrime(draft, reg, unit, o.days, o.seed);
    const moments = pickMoments(draft, reg, unit, { days: o.days, seed: o.seed, impression, knowsCrime: rel.flags.includes('knows_crime') });
    for (const m of moments) applyMoment(draft, reg, unit.id, m);
    capTrust(rel, known.trustBefore);
    headStartTransition(draft, reg, unit.id);
    units.push({ unitId: unit.id, impression, moments: moments.map((m) => String(m.id)) });
  }
  for (const rel of Object.values(draft.relations)) rel.dailyGain = { trust: 0, affinity: 0, attraction: 0 };
  draft.headStart = { days: o.days, units };
}
