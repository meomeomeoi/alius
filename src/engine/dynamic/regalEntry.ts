/**
 * P15b chunk m7 (spec §12.3): the pieces of the `regal` way into probing that are not probe rows.
 * - `first_below`: the moment of the first time below her. A P15a moment source live through the `external` kind (`firstBelowLive`), once per pair (`dynamic.firstBelow`, written when
 *   the moment fires, by `noteFirstBelow`), at the hold band `TUNING.manner.regal.firstBelowBand`, in the equal frame, only for a woman with a manner for whom some probe row would match.
 * - Being admired: the commander's praises of her (`notePraise`, on the landing hook; the days of the last `praiseDays`, at most `praisedKeep`) wake a latent woman who is moved by
 *   being admired (`praisedLately`, read by `latentCause`). Counted here and not read from the relation's history, which trims chatty scenes and does not say who praised.
 * Nothing is written for a woman with no manner. Draws nothing.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { EventIntent } from '../relations/intents';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicOn } from './gate';
import { mannerOf } from './manner';
import { matchesProbeRow } from './probeNeeds';
import { dynamicOf } from './state';

const R = TUNING.manner.regal;

/** The moment source `first_below` is live for her now (the `external` trigger). */
export function firstBelowLive(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!dynamicOn(state, reg)) return false;
  const dyn = dynamicOf(state, unitId);
  const band = reg.holdBands.get(R.firstBelowBand);
  if (dyn === undefined || band === undefined || dyn.firstBelow === true || frameRank(dyn.frame) !== frameRank('equal')) return false;
  if (dyn.hold < Number(band.min) || dyn.hold > Number(band.max)) return false;
  return matchesProbeRow(state, reg, unitId);
}

/** After an action: a `first_below` moment that fired is done for that pair. */
export function noteFirstBelow(draft: CampaignState, _ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  for (const e of events) {
    if (e.type !== 'moment_fired' || e.sourceId !== 'first_below' || typeof e.unitId !== 'string') continue;
    const dyn = dynamicOf(draft, e.unitId);
    if (dyn !== undefined) dyn.firstBelow = true;
  }
  return [];
}

/** The landing hook: a praise of the commander's that landed on a woman with a manner is counted (nothing for another kind of event, another actor or a woman with no manner). */
export function notePraise(draft: CampaignState, reg: Registries, unitId: string, event: Pick<EventIntent, 'type' | 'actor'>): [] {
  if (event.type !== 'praised' || event.actor !== 'commander' || draft.dynamic === undefined || mannerOf({ squad: draft.squad }, reg, unitId) === null) return [];
  const noted = (draft.dynamic.noted ??= {});
  const days = ((noted.praised ??= {})[unitId] ??= []);
  days.push(draft.day);
  noted.praised[unitId] = days.filter((d) => draft.day - d < R.praiseDays).slice(-R.praisedKeep);
  return [];
}

/** How many praises of the commander's she has had in the last `praiseDays` days (today counts). */
export function praisedLately(state: Pick<CampaignState, 'dynamic' | 'day'>, unitId: string): number {
  return (state.dynamic?.noted?.praised?.[unitId] ?? []).filter((d) => state.day - d < R.praiseDays).length;
}
