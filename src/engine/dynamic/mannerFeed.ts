/**
 * The feed of her manner's accumulators (P15b, spec §7, planning ruling 4): P14b's rules see only appraised relation events, and the dynamic's and the practices' own events
 * bypass them, so what the dynamic does to her pushes `development.acc['manner:<axis>']` (and `manner:drawn_by.<kind>`) from here. The pushes are `TUNING.manner.push`, scaled
 * by the development mode (slow 0.5), clamped to ±`accCap` like P14b's rules. Nothing moves without the setting on, a `bond.practice.manner`, a dynamic with her and the field
 * unlocked; no push is a draw. The steps themselves are the review's (`development/mannerDrift.ts`). `playSince` is stamped here, when her frame first reaches `play`.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { mannerHeldKey } from '../development/axes';
import { valuesOf } from '../development/profile';
import { developmentMode, ensureDevelopment } from '../development/state';
import { isLiving } from '../economy';
import type { EventIntent } from '../relations/intents';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { styleOf } from './profile';
import { dynamicOf } from './state';
import type { DrawnBy, MannerAxis, RegionRank } from './types';

const P = TUNING.manner.push;
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** A named living holder of a campaign with development on, a manner and a dynamic: her unit, else null. */
export function holderOf(draft: CampaignState, unitId: string): Unit | null {
  if (developmentMode(draft) === 'off') return null;
  const unit = draft.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || unit.bond?.practice?.manner === undefined || dynamicOf(draft, unitId) === undefined) return null; // P14b: raw profile
  return unit;
}

/** Stamps the day her frame first reached `play` (or beyond): the 28 days of drift and the 56 of a turn count from it. Once; nothing for a holder with no manner. */
export function notePlaySince(draft: CampaignState, unitId: string): void {
  const dyn = dynamicOf(draft, unitId);
  const unit = draft.squad.find((u) => u.id === unitId);
  if (dyn === undefined || dyn.playSince !== undefined || unit?.bond?.practice?.manner === undefined || frameRank(dyn.frame) < frameRank('play')) return; // P14b: raw profile
  dyn.playSince = draft.day;
}

/** Adds pushes (`[key, amount]`) to her accumulators: scaled by the mode, a locked field skipped, each key clamped to ±`accCap`. */
export function mannerPush(draft: CampaignState, unitId: string, pushes: ReadonlyArray<readonly [string, number]>): void {
  const unit = holderOf(draft, unitId);
  if (unit === null) return;
  notePlaySince(draft, unitId);
  const locks = unit.practiceLocks ?? [];
  const mult = TUNING.development.modeMult[developmentMode(draft) as 'slow' | 'normal'];
  const cap = TUNING.development.accCap;
  const held = unit.development?.held ?? [];
  const live = pushes.filter(([key, amount]) => amount !== 0 && !locks.includes(key.startsWith('manner:drawn_by') ? 'drawnBy' : 'manner') && !held.includes(mannerHeldKey(key))); // the player's HOLD stops a push as it stops a step
  if (live.length === 0) return;
  const acc = ensureDevelopment(unit).acc;
  for (const [key, amount] of live) {
    const next = round(Math.min(cap, Math.max(-cap, (acc[key] ?? 0) + amount * mult)));
    if (next === 0) delete acc[key];
    else acc[key] = next;
  }
}

const axisPushes = (row: Partial<Record<MannerAxis, number>>): Array<[string, number]> => Object.entries(row).map(([a, v]) => [`manner:${a}`, v as number]);

/** The commander yielded to her (a probe answered `yielded`, an offer taken, a task kept or a punishment taken): `intensity` up and `warmth` down, the latter never for a woman with `mercy` at the block. */
export function feedYield(draft: CampaignState, unitId: string): void {
  const unit = holderOf(draft, unitId);
  if (unit === null) return;
  const row: Partial<Record<MannerAxis, number>> = { ...P.yielded };
  if (valuesOf(unit).mercy >= P.mercyBlock) delete row.warmth;
  mannerPush(draft, unitId, axisPushes(row));
}

/**
 * The commander refused her at `role` or beyond (the refusal `refusalCost` noted): a defiance she respects while her reading of the commander is in a region her style likes (the style's
 * `likesRegion`, or `proud` / `bratty` for a style with no such list) pulls her toward forms (`order` up).
 */
export function feedRefusal(draft: CampaignState, reg: Registries, unitId: string): void {
  const unit = holderOf(draft, unitId);
  if (unit === null) return;
  const own = styleOf(unit)?.primary;
  const likes = (own === undefined ? undefined : (reg.practiceStyles.get(own) as unknown as { likesRegion?: RegionRank[] } | undefined)?.likesRegion) ?? ['proud', 'bratty'];
  if (likes.includes(dynamicOf(draft, unitId)!.readOf.region)) mannerPush(draft, unitId, axisPushes(P.refusal));
}

/** The kinds of relation event that are care from the commander (unasked care, a quiet meeting, a kept promise): `warmth` up. */
const CARE: readonly string[] = ['comforted', 'kept_promise', 'time_together'];

/** The landing hook (`registerEventLanded`): a care event of the commander's that landed on her. */
export function mannerFeedLanded(draft: CampaignState, _reg: Registries, unitId: string, event: Pick<EventIntent, 'type' | 'actor'>): [] {
  if (event.actor !== 'commander') return [];
  if (CARE.includes(event.type)) mannerPush(draft, unitId, axisPushes(P.care));
  else if (event.type === 'rule_accepted') feedForms(draft, unitId); // the commander took on a rule of hers: a form kept
  return [];
}

/** One of her forms kept (a ceremony step done, a rule of hers accepted): `order` up. */
export function feedForms(draft: CampaignState, unitId: string): void {
  mannerPush(draft, unitId, axisPushes(P.forms));
}

/**
 * A practice with the commander was kept or done (`notePractised`): the first of a kind pulls `curiosity` up (more when `discovery` draws her), and the same kind many times in a row (`repeatRun`
 * or more) pulls it down. `streak` is the run including this one; `first` says the kind had not been practised before.
 */
export function feedPractised(draft: CampaignState, unitId: string, first: boolean, streak: number, discovery: boolean): void {
  if (first) mannerPush(draft, unitId, axisPushes(Object.fromEntries(Object.entries(P.firstWell).map(([a, v]) => [a, v * (discovery ? P.discoveryMult : 1)]))));
  else if (streak >= P.repeatRun) mannerPush(draft, unitId, axisPushes(P.repeat));
}

/** An outcome a `drawnBy` kind rewards happened: that kind's accumulator rises (whoever she is drawn to; it is what the commander does that moves what draws her). */
export function feedDrawn(draft: CampaignState, unitId: string, kind: DrawnBy): void {
  mannerPush(draft, unitId, [[`manner:drawn_by.${kind}`, P.drawn[kind]]]);
}
