/**
 * Her manner drifts (P15b, spec §7, planning rulings 4 and 5): the engine decides every step, the weekly review only words it or leaves it out, and
 * the fallback review applies it as proposed. A step of one axis, a change of what draws her and a turn of her style are proposals read from the
 * state (her accumulators, `dynamic.playSince`, the days of her last steps); nothing here draws, and nothing is proposed for a holder with no
 * `bond.practice.manner`, a campaign with the setting off, or a field the player locked. `applyMannerShift` writes the overlay in
 * `development.practice` (`manner`, `drawnBy`, `primary`, `secondary`), never her imported profile.
 */
import type { Registries } from '../../content/types';
import { isLiving } from '../economy';
import { styleOf } from '../dynamic/profile';
import { dynamicOf, type DynamicRelation } from '../dynamic/state';
import { DRAWN_BY, MANNER_AXES, type DrawnBy, type MannerAxis, type ProfileStyle } from '../dynamic/types';
import type { CampaignState, Development, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { axisForbidden } from './axes';
import { driftedAxes, driftedDrawnBy, mannerKey } from './mannerKeys';
import { developmentMode, developmentOf } from './state';

const D = TUNING.development;

export interface MannerProposal {
  axis: string;
  direction: 'up' | 'down';
  kind: 'axis' | 'drawn' | 'turn';
  /** The accumulator the step takes its support from (none for a turn). */
  accKey?: string;
}

/** A named living holder of a campaign with development on, with a manner and a dynamic; the dynamic, or null. */
function holderDynamic(state: Pick<CampaignState, 'settings' | 'relations'>, unit: Unit): DynamicRelation | null {
  if (developmentMode(state) === 'off' || unit.kind !== 'named' || !isLiving(unit) || unit.bond?.practice?.manner === undefined) return null; // P14b: raw profile
  return dynamicOf(state, unit.id) ?? null;
}

/**
 * Is one of her runs open: a physics she holds (the scene's), a hold she keeps the commander in, her slap, or a ceremony she is running? A run reads her style and her axes
 * as it goes, so nothing of her manner moves while one is open (the turn of Review Focus 4: a run open at the turn keeps its style, the next run reads the new one); the proposal
 * comes back at the first review after it ends.
 */
export function runOpenFor(state: Pick<CampaignState, 'scene' | 'practices'>, unitId: string): boolean {
  const practices = state.practices;
  return state.scene?.physics?.holderId === unitId
    || practices?.held?.by === unitId
    || practices?.slap?.holderId === unitId
    || (practices?.punishments ?? []).some((p) => p.holderId === unitId && p.ceremony !== undefined && p.ceremony.carried !== true);
}

/** The place of a style on the six axes (hidden coordinates), or undefined when the pack gives none. */
function placeOf(reg: Registries, id: string): Record<MannerAxis, number> | undefined {
  return (reg.practiceStyles.get(id) as unknown as { manner?: Record<MannerAxis, number> } | undefined)?.manner;
}

const distance = (a: Record<MannerAxis, number>, b: Record<MannerAxis, number>): number => MANNER_AXES.reduce((n, k) => n + Math.abs(a[k] - b[k]), 0);

/** Her absolute place: her style's place plus her axes as she has become them. Null without a place for her style. */
function absolutePlace(reg: Registries, unit: Unit): { own: ProfileStyle; place: Record<MannerAxis, number>; abs: Record<MannerAxis, number> } | null {
  const own = styleOf(unit)?.primary;
  const axes = driftedAxes(unit);
  const place = own === undefined ? undefined : placeOf(reg, own);
  if (own === undefined || axes === null || place === undefined) return null;
  const abs = {} as Record<MannerAxis, number>;
  for (const a of MANNER_AXES) abs[a] = place[a] + axes[a];
  return { own, place, abs };
}

export interface TurnRead { to: ProfileStyle; own: number; near: number; abs: Record<MannerAxis, number> }

/**
 * The style her absolute place is nearer to than her own by `turn.margin`, or null: the sum of the absolute differences over the six axes, the nearest other
 * style with a place (the first in registry order on a tie). It says nothing of the weeks or the days (`turnProposal` does).
 */
export function turnRead(reg: Registries, unit: Unit): TurnRead | null {
  const here = absolutePlace(reg, unit);
  if (here === null) return null;
  const own = distance(here.abs, here.place);
  let best: { id: string; d: number } | null = null;
  for (const e of reg.practiceStyles.values()) {
    const id = String(e.id);
    const place = id === here.own ? undefined : placeOf(reg, id);
    if (place === undefined) continue;
    const d = distance(here.abs, place);
    if (best === null || d < best.d) best = { id, d };
  }
  if (best === null || own - best.d < TUNING.manner.turn.margin) return null;
  return { to: best.id as ProfileStyle, own, near: best.d, abs: here.abs };
}

/** The turn due now: she has been nearer to the same other style by the margin at `turn.reviews - 1` earlier reviews in a row, and `turn.days` have passed since `playSince` or her last turn. */
function turnProposal(state: CampaignState, reg: Registries, unit: Unit, dyn: DynamicRelation): MannerProposal | null {
  const read = turnRead(reg, unit);
  const T = TUNING.manner.turn;
  if (read === null || dyn.playSince === undefined) return null;
  const run = dyn.mannerTurn;
  if (run === undefined || run.candidate !== read.to || run.reviews < T.reviews - 1) return null;
  if (state.day - Math.max(dyn.playSince, run.lastDay ?? dyn.playSince) < T.days) return null;
  return { axis: 'manner:turn', direction: 'up', kind: 'turn' };
}

/** At most one step per axis per `drift.days` days of the dynamic, counted from `playSince`. */
function paceOk(state: Pick<CampaignState, 'day'>, dyn: DynamicRelation, key: MannerAxis | 'drawn_by'): boolean {
  if (dyn.playSince === undefined) return false;
  const last = dyn.mannerStepped?.[key];
  const days = TUNING.manner.drift.days;
  return state.day - dyn.playSince >= days && (last === undefined || state.day - last >= days);
}

/** The kind with the highest accumulator past the threshold that is not already first (`manner:drawn_by.<kind>`), or null. */
export function drawnByCandidate(unit: Pick<Unit, 'development' | 'bond'>): DrawnBy | null {
  const acc = developmentOf(unit).acc;
  const first = driftedDrawnBy(unit)[0];
  let best: DrawnBy | null = null;
  let bestV = D.stepThreshold - 1e-9;
  for (const k of DRAWN_BY) {
    const v = acc[`manner:drawn_by.${k}`] ?? 0;
    if (k !== first && v > bestV) { best = k; bestV = v; }
  }
  return best;
}

/** What draws her after one step: the candidate becomes her second (or her only one), a candidate who is already second swaps with the first, never replacing the first directly. */
export function nextDrawnBy(cur: readonly DrawnBy[], cand: DrawnBy): DrawnBy[] {
  if (cur.length === 0) return [cand];
  if (cur.length === 1) return [cur[0], cand];
  return cand === cur[1] ? [cur[1], cur[0]] : [cur[0], cand];
}

/**
 * The manner steps the engine proposes for this unit now (ruling 4): a turn (alone: it rebases the axes), else the axes with an accumulator past the step
 * threshold, the strongest first, and what draws her. Every proposal respects the pace (28 days since `playSince` and since that axis' last step), the locks
 * and the end of the scale. The review may word one or leave it out; `fallbackReview` applies them all.
 */
export function mannerProposals(state: CampaignState, reg: Registries, unit: Unit): MannerProposal[] {
  const dyn = holderDynamic(state, unit);
  if (dyn === null || runOpenFor(state, unit.id)) return [];
  const turn = turnProposal(state, reg, unit, dyn);
  if (turn !== null && axisForbidden(state, reg, unit, turn.axis) === null) return [turn];
  const out: MannerProposal[] = [];
  const dev = developmentOf(unit);
  const axes = driftedAxes(unit)!;
  const strong = MANNER_AXES
    .map((a) => ({ a, acc: dev.acc[`manner:${a}`] ?? 0 }))
    .filter((x) => Math.abs(x.acc) >= D.stepThreshold)
    .sort((x, y) => Math.abs(y.acc) - Math.abs(x.acc));
  for (const { a, acc } of strong) {
    const direction = acc > 0 ? 'up' : 'down';
    const next = axes[a] + (acc > 0 ? 1 : -1);
    if (Math.abs(next) > 2 || !paceOk(state, dyn, a) || axisForbidden(state, reg, unit, `manner:${a}`) !== null) continue;
    out.push({ axis: `manner:${a}`, direction, kind: 'axis', accKey: `manner:${a}` });
  }
  const cand = drawnByCandidate(unit);
  if (cand !== null && paceOk(state, dyn, 'drawn_by') && axisForbidden(state, reg, unit, 'manner:drawn_by') === null) out.push({ axis: 'manner:drawn_by', direction: 'up', kind: 'drawn', accKey: `manner:drawn_by.${cand}` });
  return out;
}

/**
 * Is this holder due for a review for her manner alone (no experiences needed): the cadence has passed and something is proposed, or a turn is being read (she is nearer another style by
 * the margin): the reviews that count toward a turn are the weekly ones, so a holder with no other material must still come due.
 */
export function mannerDue(state: CampaignState, reg: Registries, unit: Unit): boolean {
  const mode = developmentMode(state);
  if (mode === 'off' || state.day - (developmentOf(unit).lastReview ?? 0) < D.cadence[mode]) return false;
  return mannerProposals(state, reg, unit).length > 0 || (holderDynamic(state, unit) !== null && turnRead(reg, unit) !== null);
}

/**
 * Counts this review toward a turn (the review's own, before its shifts apply): she is nearer to the same other style by the margin one more review in a row, or the run
 * starts again at one with another style, or ends. Nothing for a holder with no dynamic or manner. Hidden.
 */
export function noteTurnReview(state: CampaignState, reg: Registries, unit: Unit): void {
  const dyn = holderDynamic(state, unit);
  if (dyn === null) return;
  const read = turnRead(reg, unit);
  const run = dyn.mannerTurn;
  if (read === null) {
    if (run !== undefined && run.reviews !== 0) dyn.mannerTurn = { candidate: run.candidate, reviews: 0, ...(run.lastDay !== undefined ? { lastDay: run.lastDay } : {}) };
    return;
  }
  const reviews = run !== undefined && run.candidate === read.to ? run.reviews + 1 : 1;
  dyn.mannerTurn = { candidate: read.to, reviews, ...(run?.lastDay !== undefined ? { lastDay: run.lastDay } : {}) };
}

const clamp2 = (v: number): number => Math.max(-2, Math.min(2, v));

/** Writes one manner step into her overlay and her relation; returns what the moment shows (`from`, `to`) and the accumulator the step consumes. */
export function applyMannerShift(
  draft: CampaignState, reg: Registries, unit: Unit, dev: Development, shift: { axis: string; direction: 'up' | 'down' },
): { from: string; to: string; accKey?: string; priorPractice?: NonNullable<Development['practice']> } | null {
  const key = mannerKey(shift.axis);
  const dyn = dynamicOf(draft, unit.id);
  if (key === null || dyn === undefined) return null;
  const up = shift.direction === 'up';
  const practice = (dev.practice ??= {});
  const tidy = (): void => { if (Object.keys(practice).length === 0) delete dev.practice; };
  const stepped = (k: MannerAxis | 'drawn_by'): void => { (dyn.mannerStepped ??= {})[k] = draft.day; };
  if (key.kind === 'axis') {
    const before = driftedAxes(unit)![key.axis];
    const manner = (practice.manner ??= {});
    const now = (manner[key.axis] ?? 0) + (up ? 1 : -1);
    if (now === 0) delete manner[key.axis]; else manner[key.axis] = now;
    if (Object.keys(manner).length === 0) delete practice.manner;
    tidy();
    stepped(key.axis);
    return { from: String(before), to: String(driftedAxes(unit)![key.axis]), accKey: `manner:${key.axis}` };
  }
  if (key.kind === 'drawn_by') {
    const cand = drawnByCandidate(unit);
    if (cand === null) return null;
    const cur = driftedDrawnBy(unit);
    const next = nextDrawnBy(cur, cand);
    const stored = unit.bond?.practice?.drawnBy ?? []; // P14b: raw profile
    if (next.length === stored.length && next.every((k, i) => k === stored[i])) delete practice.drawnBy; else practice.drawnBy = next;
    tidy();
    stepped('drawn_by');
    return { from: cur.join(' and '), to: next.join(' and '), accKey: `manner:drawn_by.${cand}` };
  }
  return applyTurn(draft, reg, unit, dev, dyn);
}

/**
 * The turn (spec §7): her primary becomes the nearer style; her former primary becomes her secondary when she had none, when the nearer style was her secondary,
 * or when it is further from her place than the one she had; her axes are rebased in the overlay so her absolute place does not jump (clamped to ±2).
 */
function applyTurn(draft: CampaignState, reg: Registries, unit: Unit, dev: Development, dyn: DynamicRelation): { from: string; to: string; priorPractice: NonNullable<Development['practice']> } | null {
  const read = turnRead(reg, unit);
  const style = styleOf(unit);
  const storedStyle = unit.bond?.practice?.style; // P14b: raw profile
  const target = read === null ? undefined : placeOf(reg, read.to);
  if (read === null || style === undefined || storedStyle === undefined || target === undefined) return null;
  const former = style.primary;
  const priorPractice = structuredClone(dev.practice ?? {});
  const practice = (dev.practice ??= {});
  // the rebase: new axes = her absolute place minus the new style's place, clamped; the overlay is what is added to the imported axes
  const stored = unit.bond!.practice!.manner!; // P14b: raw profile
  const manner: Partial<Record<MannerAxis, number>> = {};
  for (const a of MANNER_AXES) {
    const delta = clamp2(read.abs[a] - target[a]) - (stored[a] ?? 0);
    if (delta !== 0) manner[a] = delta;
  }
  if (Object.keys(manner).length === 0) delete practice.manner; else practice.manner = manner;
  // the style pair
  const secondary = style.secondary;
  const secondaryPlace = secondary === undefined ? undefined : placeOf(reg, secondary);
  const formerPlace = placeOf(reg, former);
  const keepSecondary = secondary !== undefined && secondary !== read.to && secondaryPlace !== undefined && formerPlace !== undefined && distance(read.abs, secondaryPlace) <= distance(read.abs, formerPlace);
  const nextSecondary: ProfileStyle = keepSecondary ? secondary : former;
  if (read.to === storedStyle.primary) delete practice.primary; else practice.primary = read.to;
  if (nextSecondary === storedStyle.secondary) delete practice.secondary; else practice.secondary = nextSecondary;
  if (Object.keys(practice).length === 0) delete dev.practice;
  dyn.mannerTurn = { candidate: read.to, reviews: 0, lastDay: draft.day };
  return { from: former, to: read.to, priorPractice };
}
