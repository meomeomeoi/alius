import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { logVote } from './state';

/**
 * The power day step (P9b), run on `director_tick`. It writes nothing in a save that has no `power`. Day end:
 *  - an open vote that nobody carried, dropped or overruled is dropped (an overruled one is logged as overruled);
 *  - every grudge from an overruled vote ends.
 * (The weekly hierarchy recompute and the queued scapegoat join this step in chunks (b) and (c).)
 */
export function powerDayStep(draft: CampaignState, _ctx: EngineCtx): EngineEvent[] {
  const power = draft.power;
  if (!power) return [];
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
  return events;
}
