/**
 * The day end of her manner's feed (P15b, spec §7): `playSince` is stamped when her frame has reached `play`; her own days (P14c: a life event with a `mood` of the day, bad ones pull `warmth` down,
 * good ones up); and a day at the bottom (the lowest two bands) or the top Regard band. Draws nothing. Its own file: it reads Regard, which reads the favour of `drawn.ts`, which pushes the feed.
 */
import type { Registries } from '../../content/types';
import { developmentMode } from '../development/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { holderOf, mannerPush, notePlaySince } from './mannerFeed';
import { regardBandRank, regardOf } from './regard';

const P = TUNING.manner.push;
const warmth = (row: { warmth: number }): Array<[string, number]> => [['manner:warmth', row.warmth]];

export function mannerDayStep(draft: CampaignState, reg: Registries, holders: readonly string[]): [] {
  if (developmentMode(draft) === 'off') return [];
  const bands = reg.regardBands.size;
  for (const id of holders) {
    if (holderOf(draft, id) === null) continue;
    notePlaySince(draft, id);
    const last = draft.life?.units[id]?.last ?? {};
    for (const eid of Object.keys(last)) {
      if (last[eid] !== draft.day) continue;
      const mood = (reg.lifeEvents.get(eid) as unknown as { mood?: string } | undefined)?.mood;
      if (mood === 'irritated' || mood === 'low') mannerPush(draft, id, warmth(P.badDay));
      else if (mood === 'good') mannerPush(draft, id, warmth(P.goodDay));
    }
    if (bands >= 2) {
      const rank = regardBandRank(reg, regardOf(draft, reg, id));
      if (rank === 0) mannerPush(draft, id, warmth(P.regardHigh));
      else if (rank >= bands - 2) mannerPush(draft, id, warmth(P.regardLow));
    }
  }
  return [];
}
