import type { Registries } from '../../src/content/types';
import type { CampaignState, LoyaltyBand } from '../../src/engine/state/types';
import { run } from './world';

// Importing this registers the P6 actions under test (the P0–P5 actions come with ./world).
import '../../src/engine/actions/leash';

export { campaign, ctxOf, errors, loadCore, ofType, run, unitSetup } from './world';

/** Overwrites relation numbers of one unit in place (and returns the state, for chaining). */
export function setRelation(
  state: CampaignState,
  unitId: string,
  p: { trust?: number; affinity?: number; stateId?: string; band?: LoyaltyBand; stateSince?: number },
): CampaignState {
  const r = state.relations[unitId];
  if (!r) throw new Error(`no relation for ${unitId}`);
  if (p.trust !== undefined) r.trust = p.trust;
  if (p.affinity !== undefined) r.affinity = p.affinity;
  if (p.stateId !== undefined) r.stateId = p.stateId;
  if (p.band !== undefined) r.loyaltyBand = p.band;
  if (p.stateSince !== undefined) r.stateSince = p.stateSince;
  return state;
}

/** Replaces the unit's defects with exactly one (in place). */
export function withDefect(state: CampaignState, unitId: string, defectId: string): CampaignState {
  const u = state.squad.find((x) => x.id === unitId);
  if (!u) throw new Error(`no unit ${unitId}`);
  u.defects = [{ id: defectId, arc: 'manage' }];
  return state;
}

/** Plays the rest of the current day: consumes slots until the day number changes (or a Night slot opens). */
export function endDay(state: CampaignState, reg: Registries): CampaignState {
  const start = state.day;
  let s = state;
  for (let i = 0; i < 4 && s.day === start; i++) {
    const r = run(s, reg, { type: 'calendar/consume_slot' });
    if (r.events.some((e) => e.type === 'error')) throw new Error(JSON.stringify(r.events));
    s = r.state;
    if (s.slot === 'night') break;
  }
  return s;
}
