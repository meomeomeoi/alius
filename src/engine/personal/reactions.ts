import type { Registries } from '../../content/types';
import { bondTierOf } from '../bonds/profile';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState, Severity } from '../state/types';
import { hitHer } from './events';
import { valuesOf } from '../development/profile';

export interface FavourReaction { unitId: string; kind: 'rival' | 'respect' }

/**
 * Who notices when the commander is claimed by, or wears a token of, one soldier (P9c §3 and §4): every other named living unit
 * with an imported bond reacts. A romantic tier feels `rival_favoured` (at `rival` severity, × her own `pressureMult`); a close
 * tier or `ingroup ≥ 1` feels `bond_shown` (minor); the rest nothing. No draw.
 */
export function favourReactions(draft: CampaignState, reg: Registries, favouredId: string, rival: Severity): { events: EngineEvent[]; reactions: FavourReaction[] } {
  const events: EngineEvent[] = [];
  const reactions: FavourReaction[] = [];
  for (const other of draft.squad) {
    if (other.id === favouredId || other.kind !== 'named' || !isLiving(other) || other.bond === undefined || !draft.relations[other.id]) continue;
    const tier = bondTierOf(draft, reg, other.id);
    if (tier === 'romantic') {
      reactions.push({ unitId: other.id, kind: 'rival' });
      events.push(...hitHer(draft, reg, other.id, 'rival_favoured', rival, 'the commander favoured someone else', { amplified: true }));
    } else if (tier === 'close' || valuesOf(other).ingroup >= 1) {
      reactions.push({ unitId: other.id, kind: 'respect' });
      events.push(...hitHer(draft, reg, other.id, 'bond_shown', 'minor', 'a bond was shown'));
    }
  }
  return { events, reactions };
}
