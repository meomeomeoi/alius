/**
 * P15b: what draws her (spec §2, planning ruling 7) and what she has practised with the commander (ruling 8). `drawnFavour` is the small favour a
 * matching outcome gives (+1 to the main kind, +0.5 to the second, `addFavour`); `notePractised` writes `dynamic.practised` and gives `discovery`'s
 * favour for the first practice of a kind (and feeds `curiosity`). Both do nothing for a holder with no `manner` (an old save, a profile from before P15b). The dynamic's
 * layer: the practices and the physics feed call it, it imports nothing of them. Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addFavour } from './favour';
import { feedDrawn, feedPractised } from './mannerFeed';
import { mannerOf } from './manner';
import { dynamicOf } from './state';
import type { DrawnBy } from './types';

/** What she has practised with the commander (empty lists when nothing is written). */
export function practisedOf(state: Pick<CampaignState, 'relations'>, unitId: string): { kinds: readonly string[]; categories: readonly string[] } {
  const p = dynamicOf(state, unitId)?.practised;
  return { kinds: p?.kinds ?? [], categories: p?.categories ?? [] };
}

/** The favour she gives for an outcome she is drawn to: +1 when it is her main kind, +0.5 when it is her second, nothing otherwise. */
export function drawnFavour(draft: CampaignState, reg: Registries, unitId: string, kind: DrawnBy): void {
  feedDrawn(draft, unitId, kind); // what the commander does moves what draws her (the accumulator of that kind), whoever she is drawn to now (P15b ruling 4, spec §7)
  const at = mannerOf(draft, reg, unitId)?.drawnBy.indexOf(kind) ?? -1;
  if (at < 0) return;
  addFavour(draft, unitId, at === 0 ? TUNING.manner.favour.main : TUNING.manner.favour.second);
}

/**
 * A practice of hers was kept or done: its `kind` (the seed it came from, a punishment's entry, else the card's kind) and its categories are written
 * once each. The first time a kind is written, `discovery` gives its favour. Nothing for a holder with no manner, or with no dynamic.
 */
export function notePractised(draft: CampaignState, reg: Registries, unitId: string, kind: string, categories: readonly string[]): void {
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined || mannerOf(draft, reg, unitId) === null) return;
  const done = (dyn.practised ??= { kinds: [], categories: [] });
  const first = !done.kinds.includes(kind);
  if (first) done.kinds.push(kind);
  done.streak = done.streak?.kind === kind ? { kind, n: done.streak.n + 1 } : { kind, n: 1 };
  feedPractised(draft, unitId, first, done.streak.n, mannerOf(draft, reg, unitId)?.drawnBy.includes('discovery') === true);
  for (const c of categories) if (!done.categories.includes(c)) done.categories.push(c);
  if (first) drawnFavour(draft, reg, unitId, 'discovery');
}
