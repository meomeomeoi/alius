import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { computeHierarchy } from './standing';
import { logVote, powerOf } from './state';

/**
 * The power day step (P9b), run on `director_tick`. Draws no rng. In a save with voting off and no leader the only things it
 * writes are `power.hierarchy.standings` / `computedDay` (and `power.merit` elsewhere). Day end:
 *  - an open vote that nobody carried, dropped or overruled is dropped (an overruled one is logged as overruled);
 *  - every grudge from an overruled vote ends;
 *  - the hierarchy is recomputed when it was never computed or a week has passed.
 * (The queued scapegoat joins this step in chunk (c).)
 */
export function powerDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const power = powerOf(draft);
  const events: EngineEvent[] = [];
  const open = power.votes.open;
  if (open) {
    logVote(draft, open, open.status === 'overruled' ? 'overruled' : 'dropped');
    delete power.votes.open;
    events.push({ type: 'vote_dropped', voteId: open.id, reason: 'day_end' });
  }
  if (power.grudges) {
    events.push({ type: 'grudges_ended', unitIds: Object.keys(power.grudges) });
    delete power.grudges;
  }
  const computed = power.hierarchy?.computedDay;
  if (computed === undefined || draft.day - computed >= TUNING.power.standing.recomputeDays) events.push(...computeHierarchy(draft, ctx.registries));
  return events;
}
