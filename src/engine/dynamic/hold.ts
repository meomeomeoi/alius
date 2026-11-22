/**
 * Hold (P15, plan R8, spec §4, §15.12): the one writer of a holder's hold, the band and frame readers, and favour. Hold is a float: the
 * pace, her compatibility and the romantic tier scale a gain, and the bands read it. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import { bondTierOf } from '../bonds/profile';
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { reconcileDomains } from './domains';
import { canHold, dynamicOn, ensureDynamic } from './gate';
import { milestonesDue } from './milestones';
import { distanceToPoint } from './reading';
import { dynamicOf } from './state';
import type { DynamicFrameEntry, Frame, HoldBandEntry, PracticeStyleEntry } from './types';

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The hold bands, lowest first (a band holds a float: it reads from its `min` up to the next band's). */
function bandsOf(reg: Registries): HoldBandEntry[] {
  return [...reg.holdBands.values()].map((b) => b as unknown as HoldBandEntry).sort((a, b) => a.min - b.min);
}

/** The index (lowest band 0) of the band a hold stands in: the highest band whose `min` it has reached. */
export function bandIndex(reg: Registries, hold: number): number {
  const bands = bandsOf(reg);
  let at = 0;
  for (let i = 0; i < bands.length; i++) if (hold >= bands[i].min) at = i;
  return at;
}

/** The hold a band starts at, by its position (0 = the lowest); the highest band's for a position past the end. */
export function bandMinAt(reg: Registries, index: number): number {
  const bands = bandsOf(reg);
  return bands[Math.min(Math.max(0, index), bands.length - 1)]?.min ?? 0;
}

/** The id of the band a hold stands in (R8). */
export function holdBandOf(reg: Registries, hold: number): string {
  return bandsOf(reg)[bandIndex(reg, hold)]?.id ?? '';
}

/** The registry row of a frame (its floor, ceiling, refusal cost and reach). */
export function frameEntry(reg: Registries, frame: Frame): DynamicFrameEntry | undefined {
  return reg.dynamicFrames.get(frame) as unknown as DynamicFrameEntry | undefined;
}

/**
 * How well the commander stands at her point, as a multiplier on a gain (R10): `1.2 - 0.2 x distance` from her reading to her style's point
 * (plus her own offset), clamped to 0.8 ... 1.2; `notWith: 'other_women'` takes 0.1 off per other woman in a romantic bond. `clinical` has no
 * point: 1 + 0.2 x her share of sincere tones - 0.2 when she reads a double game or a hollow answer. It is 1 until she has read anything, and
 * for a unit with no dynamic. Pure.
 */
export function compatibilityOf(state: CampaignState, reg: Registries, unitId: string): number {
  const dyn = dynamicOf(state, unitId);
  const C = TUNING.position;
  const D = TUNING.dynamic.compatibility;
  if (dyn === undefined || dyn.readOf.updates === 0) return 1;
  const unit = state.squad.find((u) => u.id === unitId);
  const primary = unit?.bond?.practice?.style.primary;
  const entry = primary === undefined ? undefined : (reg.practiceStyles.get(primary) as unknown as PracticeStyleEntry | undefined);
  if (entry === undefined) return 1;
  const rd = dyn.readOf;
  if (entry.point === null) {
    const bad = rd.region === 'double_game' || rd.region === 'hollow' ? 1 : 0;
    return Math.min(D.max, Math.max(D.min, 1 + C.clinical.sincere * (rd.sincere ?? 0) - C.clinical.hollow * bad));
  }
  const offset = unit?.kind === 'named' ? unit.expectations?.offset : undefined;
  const point = { r: entry.point.r + (offset?.r ?? 0), f: entry.point.f + (offset?.f ?? 0) };
  let value = D.max - D.perDistance * distanceToPoint(rd, point);
  if (entry.point.notWith === 'other_women') {
    const others = state.squad.filter((u) => u.id !== unitId && u.kind === 'named' && bondTierOf(state, reg, u.id) === 'romantic').length;
    value -= C.notWith * others;
  }
  return Math.min(D.max, Math.max(D.min, value));
}

/**
 * Moves a holder's hold by `base` (negative for a loss) for `cause` (a key of `TUNING.dynamic.gains`, or free text for a seed). The pace
 * scales both ways; a gain is also scaled by compatibility and by the romantic tier (`affectionate` / `possessive` primary warm, `cold`
 * cold, only while the pair's state is romantic). The result is clamped to the frame's floor and ceiling and is never moved the wrong
 * way by the clamp. A gain starts the dynamic of an eligible unit who has none and sets `lastPracticeDay` (unless `opts.practice` is
 * false: the day step's slow term is a gain that is not practice); a loss on a unit with no dynamic does nothing. Emits `hold_changed` and, across a band, `hold_band_changed`, takes the domains whose band she has left (`domain_lost`), then asks which milestones are due (`milestonesDue`). Writes nothing while the dynamic is off.
 */
export function addHold(
  draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, base: number, cause: string, opts: { practice?: boolean } = {},
): EngineEvent[] {
  const reg = ctx.registries;
  if (base === 0 || !dynamicOn(draft, reg) || draft.relations[unitId] === undefined) return [];
  const events: EngineEvent[] = [];
  if (dynamicOf(draft, unitId) === undefined) {
    if (base < 0 || canHold(draft, reg, unitId) !== null) return [];
    events.push(...ensureDynamic(draft, reg, unitId));
  }
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined) return events;
  const gain = base > 0;
  let delta = base * TUNING.dynamic.pace[draft.dynamic!.setup.pace];
  if (gain) {
    delta *= compatibilityOf(draft, reg, unitId);
    if (bondTierOf(draft, reg, unitId) === 'romantic') {
      const primary = draft.squad.find((u) => u.id === unitId)?.bond?.practice?.style.primary;
      if (primary === 'affectionate' || primary === 'possessive') delta *= TUNING.dynamic.romanticTier.warm;
      else if (primary === 'cold') delta *= TUNING.dynamic.romanticTier.cold;
    }
  }
  const frame = frameEntry(reg, dyn.frame);
  const floor = frame?.holdFloor ?? 0;
  const ceiling = frame?.holdCeiling ?? 100;
  const from = dyn.hold;
  let to = round4(Math.min(ceiling, Math.max(floor, from + delta)));
  if (gain && to < from) to = from; // the clamp never turns a gain into a loss (a hold above its ceiling stays)
  if (!gain && to > from) to = from;
  if (gain && opts.practice !== false) dyn.lastPracticeDay = draft.day;
  if (to === from) return events;
  dyn.hold = to;
  events.push({ type: 'hold_changed', unitId, from, to, cause });
  const was = holdBandOf(reg, from);
  const now = holdBandOf(reg, to);
  if (was !== now) events.push({ type: 'hold_band_changed', unitId, from: was, to: now });
  events.push(...reconcileDomains(draft, reg, unitId)); // a domain whose band she has fallen below is lost at once (R12)
  events.push(...milestonesDue(draft, ctx, unitId)); // a frame moves only through a milestone: the hold only makes one due
  return events;
}

/**
 * Puts a holder's hold back to a value it had (P16's UNDO of an answer to her discipline): the one writer of hold besides `addHold`, used only for that. It moves no band-dependent
 * state (a domain she lost stays lost). Emits `hold_changed { cause: 'undo' }` when the value moved. Nothing for a unit with no dynamic.
 */
export function restoreHold(draft: CampaignState, unitId: string, value: number): EngineEvent[] {
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined || dyn.hold === value) return [];
  const from = dyn.hold;
  dyn.hold = value;
  return [{ type: 'hold_changed', unitId, from, to: value, cause: 'undo' }];
}

/** Her favour moves by `n`, clamped to ±`TUNING.dynamic.favour.max`. A unit with no dynamic has none: nothing happens. */
export function addFavour(draft: CampaignState, unitId: string, n: number): void {
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined) return;
  const max = TUNING.dynamic.favour.max;
  dyn.favour = Math.min(max, Math.max(-max, dyn.favour + n));
}
