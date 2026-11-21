import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { SETUP_LIMITS } from '../setup';
import type { CampaignState, DevFact, Development, DevMoment, ReviewInverse, Unit, ValueAxis } from '../state/types';
import { TUNING } from '../tuning';
import { axisForbidden, axisKind, bondField, discreteAxis, dynamicAxis, isAnchored } from './axes';
import { dislikesOf, likesOf, tastesOf, valuesOf } from './profile';
import { developmentMode, developmentOf, ensureDevelopment, nextDevId } from './state';

export type { ReviewInverse };

/**
 * The development review (P14b): the model proposes shifts and facts, the engine validates every one against her accumulators, her
 * anchors and the caps, and applies what is left. Nothing here draws from the rng.
 */
export type ReviewShift = { axis: string; direction: 'up' | 'down'; size: 'nudge' | 'step'; reason: string };
export type ReviewValue = { shifts: ReviewShift[]; facts: Array<{ text: string; kind: DevFact['kind'] }> };

export const FACT_KINDS: readonly DevFact['kind'][] = ['attitude', 'value', 'habit', 'skill', 'memory'];
const D = TUNING.development;
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

type Room = { up: boolean; down: boolean };

/** Which ways the axis may still move for this unit (caps, scale ends, list limits). Pure. */
/** `pending`: gains (+1) and losses (−1) per list already accepted in this review, so two gains cannot pass a cap that fits one. */
function room(unit: Unit, key: string, pending: Partial<Record<'like' | 'dislike' | 'taste', number>> = {}): Room {
  const kind = axisKind(key);
  const anchored = isAnchored(unit, key);
  if (kind === 'value') {
    const axis = key.slice('value:'.length) as ValueAxis;
    const d = developmentOf(unit).drift[axis] ?? 0;
    const cap = anchored ? D.anchoredValueCap : D.valueCap;
    const now = valuesOf(unit)[axis]; // a value at the end of the scale (±3) cannot move further: the support would be spent on nothing
    return { up: d < cap && now < 3, down: d > -cap && now > -3 };
  }
  if (kind === 'bond' || kind === 'practice' || kind === 'expect') {
    // a discrete axis (a bond field, a practice field, an expectation field): one place on its scale per step, at most the cap from the import
    const d = discreteAxis(unit, key);
    if (d === null) return { up: false, down: false };
    const cur = d.scale.indexOf(d.now);
    const imp = d.scale.indexOf(d.imported);
    const cap = anchored ? D.anchoredDiscreteCap : D.discreteCap;
    return { up: cur + 1 < d.scale.length && cur + 1 - imp <= cap, down: cur - 1 >= 0 && imp - (cur - 1) <= cap };
  }
  const name = key.slice((kind ?? '').length + 1);
  const list = kind === 'like' ? likesOf(unit) : kind === 'dislike' ? dislikesOf(unit) : tastesOf(unit);
  const max = kind === 'like' ? SETUP_LIMITS.likes : kind === 'dislike' ? SETUP_LIMITS.dislikes : TUNING.commander.maxTastes;
  return { up: !list.includes(name) && list.length + (pending[kind as 'like'] ?? 0) < max, down: list.includes(name) };
}

/** The support an axis needs for a step: the base threshold, more when anchored. */
const stepNeed = (unit: Unit, key: string): number => D.stepThreshold * (isAnchored(unit, key) ? D.anchorMult : 1);

/** Axes with enough support to move: direction by the sign of the accumulator and a band, never the number. Discrete axes only step, so they are listed only when strong. */
export function eligibleAxes(
  state: CampaignState, reg: Registries, unit: Unit,
): Array<{ axis: string; direction: 'up' | 'down'; support: 'weak' | 'strong' }> {
  const out: Array<{ axis: string; direction: 'up' | 'down'; support: 'weak' | 'strong' }> = [];
  for (const [axis, acc] of Object.entries(developmentOf(unit).acc)) {
    if (Math.abs(acc) < D.nudgeMin || axisForbidden(state, reg, unit, axis) !== null) continue;
    const direction = acc > 0 ? 'up' : 'down';
    if (!room(unit, axis)[direction]) continue;
    const strong = Math.abs(acc) >= stepNeed(unit, axis);
    if (axisKind(axis) !== 'value' && !strong) continue;
    out.push({ axis, direction, support: strong ? 'strong' : 'weak' });
  }
  return out;
}

/** Is this soldier due: mode on, a named living unit, enough material, and the time or a strong accumulator. */
export function unitDue(state: CampaignState, unitId: string): boolean {
  const mode = developmentMode(state);
  const u = state.squad.find((x) => x.id === unitId);
  if (mode === 'off' || !u || u.kind !== 'named' || !isLiving(u)) return false;
  const dev = developmentOf(u);
  if (dev.pending.length < D.minMaterial) return false;
  return state.day - (dev.lastReview ?? 0) >= D.cadence[mode] || Object.values(dev.acc).some((a) => Math.abs(a) >= D.dueAcc);
}

/** The first due soldier in squad order, or null. */
export function reviewDue(state: CampaignState, _reg: Registries): string | null {
  return state.squad.find((u) => unitDue(state, u.id))?.id ?? null;
}

const cut = (s: string, n: number): string => s.replace(/\s+/g, ' ').trim().slice(0, n).trim();

/** Which of a review's shifts and facts the engine accepts for this soldier, and why the others were dropped. */
export function validateReview(
  state: CampaignState, reg: Registries, unitId: string, v: ReviewValue,
): { shifts: ReviewShift[]; facts: ReviewValue['facts']; dropped: Array<{ axis: string; why: string }> } {
  const unit = state.squad.find((u) => u.id === unitId);
  const dropped: Array<{ axis: string; why: string }> = [];
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) return { shifts: [], facts: [], dropped: (v.shifts ?? []).map((s) => ({ axis: s.axis, why: 'not a named living unit' })) };
  const shifts: ReviewShift[] = [];
  const listDelta: Partial<Record<'like' | 'dislike' | 'taste', number>> = {};
  for (const s of v.shifts ?? []) {
    const no = (why: string): void => void dropped.push({ axis: s.axis, why });
    const forbidden = axisForbidden(state, reg, unit, s.axis);
    const acc = developmentOf(unit).acc[s.axis] ?? 0;
    if (forbidden !== null) no(forbidden);
    else if (s.direction !== 'up' && s.direction !== 'down') no('no direction');
    else if (s.size !== 'nudge' && s.size !== 'step') no('no size');
    else if (shifts.some((x) => x.axis === s.axis)) no('named twice');
    else if (Math.abs(acc) < D.nudgeMin) no('no support');
    else if ((acc > 0) !== (s.direction === 'up')) no('against the accumulator');
    else if (s.size === 'nudge' && axisKind(s.axis) !== 'value') no('only a value nudges');
    else if (s.size === 'step' && Math.abs(acc) < stepNeed(unit, s.axis)) no('not enough support for a step');
    else if (!room(unit, s.axis, listDelta)[s.direction]) no('at its cap');
    else {
      const kind = axisKind(s.axis);
      if (kind === 'like' || kind === 'dislike' || kind === 'taste') listDelta[kind] = (listDelta[kind] ?? 0) + (s.direction === 'up' ? 1 : -1);
      shifts.push({ axis: s.axis, direction: s.direction, size: s.size, reason: cut(String(s.reason ?? ''), D.reasonMax) });
    }
  }
  const facts: ReviewValue['facts'] = [];
  for (const f of v.facts ?? []) {
    const text = cut(String(f.text ?? ''), D.factTextMax);
    if (text !== '' && FACT_KINDS.includes(f.kind)) facts.push({ text, kind: f.kind });
  }
  return { shifts: shifts.slice(0, D.maxShifts), facts: facts.slice(0, D.maxFacts), dropped };
}

/** The review the engine writes itself: a nudge for each eligible value axis with support, the strongest first, at most three; no facts and no steps. */
export function fallbackReview(state: CampaignState, reg: Registries, unitId: string): ReviewValue {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit) return { shifts: [], facts: [] };
  const acc = developmentOf(unit).acc;
  const shifts = eligibleAxes(state, reg, unit)
    .filter((a) => axisKind(a.axis) === 'value')
    .sort((a, b) => Math.abs(acc[b.axis]) - Math.abs(acc[a.axis]))
    .slice(0, D.maxShifts)
    .map((a): ReviewShift => ({ axis: a.axis, direction: a.direction, size: 'nudge', reason: 'What she has lived through.' }));
  return { shifts, facts: [] };
}

const sign = (n: number): number => (n > 0 ? 1 : -1);

/** Takes `amount` of support out of an accumulator toward zero, and records what was really taken (signed). */
function consume(dev: Development, taken: Record<string, number>, axis: string, amount: number): void {
  const cur = dev.acc[axis] ?? 0;
  const take = Math.min(Math.abs(cur), amount) * sign(cur);
  const next = round(cur - take);
  if (next === 0) delete dev.acc[axis];
  else dev.acc[axis] = next;
  taken[axis] = round((taken[axis] ?? 0) + take);
}

const listField = { like: 'likes', dislike: 'dislikes', taste: 'tastes' } as const;

/** Gains or loses one entry of her likes, dislikes or tastes, keeping `gained` / `lost` in normal form (a gain of a lost import just cancels it). */
function changeList(dev: Development, field: 'likes' | 'dislikes' | 'tastes', name: string, gain: boolean): void {
  const [onto, off] = gain ? (['gained', 'lost'] as const) : (['lost', 'gained'] as const);
  const offList = dev[off]?.[field];
  if (offList?.includes(name)) {
    dev[off]![field] = offList.filter((t) => t !== name);
  } else {
    const o = (dev[onto] ??= {});
    (o[field] ??= []).push(name);
  }
  for (const k of ['gained', 'lost'] as const) {
    const bag = dev[k];
    if (!bag) continue;
    for (const f of Object.keys(bag) as Array<keyof typeof bag>) if (bag[f]?.length === 0) delete bag[f];
    if (Object.keys(bag).length === 0) delete dev[k];
  }
}

/** Writes where a discrete axis stands now into her development; the entry goes when it is back at the import, and the empty parents with it. */
function writeDiscrete(dev: Development, key: string, to: string | boolean, imported: string | boolean): void {
  const field = bondField(key);
  if (field !== null) {
    const bag = (dev.bond ??= {}) as Record<string, unknown>;
    if (to === imported) delete bag[field];
    else bag[field] = to;
    if (Object.keys(bag).length === 0) delete dev.bond;
    return;
  }
  const d = dynamicAxis(key)!;
  const same = to === imported;
  if (d.kind === 'practice') {
    const practice = (dev.practice ??= {});
    if (d.field === 'secondary') {
      if (same) delete practice.secondary;
      else practice.secondary = to as NonNullable<Development['practice']>['secondary'];
    } else if (d.field === 'as' || d.field === 'witness') {
      const cats = (practice.categories ??= {});
      const entry = (cats[d.category] ??= {}) as Record<string, unknown>;
      if (same) delete entry[d.field];
      else entry[d.field] = to;
      if (Object.keys(entry).length === 0) delete cats[d.category];
      if (Object.keys(cats).length === 0) delete practice.categories;
    }
    if (Object.keys(practice).length === 0) delete dev.practice;
    return;
  }
  const expect = (dev.expect ??= {});
  if (d.field === 'holds_until') {
    if (same) delete expect.holdsUntil;
    else expect.holdsUntil = to as NonNullable<Development['expect']>['holdsUntil'];
  } else if (d.field === 'worship') {
    const worship = (expect.worship ??= {});
    if (same) delete worship[d.target];
    else worship[d.target] = to as NonNullable<NonNullable<Development['expect']>['worship']>[string];
    if (Object.keys(worship).length === 0) delete expect.worship;
  }
  if (Object.keys(expect).length === 0) delete dev.expect;
}

/** Applies one validated shift; returns the change of her effective value for a moment (from/to), or null when nothing visible changed. */
function applyShift(unit: Unit, dev: Development, s: ReviewShift): { from: string; to: string } | null {
  const kind = axisKind(s.axis);
  const up = s.direction === 'up';
  if (kind === 'value') {
    const axis = s.axis.slice('value:'.length) as ValueAxis;
    const before = valuesOf(unit)[axis];
    const old = dev.drift[axis] ?? 0;
    const cap = isAnchored(unit, s.axis) ? D.anchoredValueCap : D.valueCap;
    const delta = D.nudge * (isAnchored(unit, s.axis) ? D.anchorInertia : 1);
    const next = s.size === 'nudge' ? old + (up ? delta : -delta) : Math.trunc(old) + (up ? 1 : -1); // the next whole step from what she shows now (`valuesOf` truncates)
    dev.drift[axis] = round(Math.min(cap, Math.max(-cap, next)));
    const after = valuesOf(unit)[axis];
    return after === before ? null : { from: String(before), to: String(after) };
  }
  if (kind === 'bond' || kind === 'practice' || kind === 'expect') {
    const d = discreteAxis(unit, s.axis)!;
    const to = d.scale[d.scale.indexOf(d.now) + (up ? 1 : -1)];
    writeDiscrete(dev, s.axis, to, d.imported);
    return { from: String(d.now), to: String(to) };
  }
  const name = s.axis.slice((kind ?? '').length + 1);
  changeList(dev, listField[kind as keyof typeof listField], name, up);
  if (kind === 'like' && up && dislikesOf(unit).includes(name)) changeList(dev, 'dislikes', name, false);
  if (kind === 'dislike' && up && likesOf(unit).includes(name)) changeList(dev, 'likes', name, false);
  return { from: up ? 'no' : 'yes', to: up ? 'yes' : 'no' };
}

/**
 * Validates again, then applies: shifts and the accumulators they consume, a quiet moment for every change she will show, the facts
 * (at most `factsMax`, the oldest unedited one out), then the batch is closed (`pending` cleared, the day kept) and the inverse kept
 * for a REROLL. Emits `development_shift`, `development_moment`, `development_fact` and one `development_review`.
 */
export function applyReview(draft: CampaignState, reg: Registries, unitId: string, v: ReviewValue, source: 'model' | 'fallback'): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit) return [];
  const ok = validateReview(draft, reg, unitId, v);
  const dev = ensureDevelopment(unit);
  const inverse: ReviewInverse = {
    drift: structuredClone(dev.drift), bond: structuredClone(dev.bond), practice: structuredClone(dev.practice), expect: structuredClone(dev.expect), gained: structuredClone(dev.gained), lost: structuredClone(dev.lost),
    acc: {}, factIds: [], momentIds: [], ...(dev.lastReview !== undefined ? { lastReview: dev.lastReview } : {}), pending: structuredClone(dev.pending),
  };
  const events: EngineEvent[] = [];
  for (const s of ok.shifts) {
    const change = applyShift(unit, dev, s);
    consume(dev, inverse.acc, s.axis, s.size === 'step' ? D.stepThreshold : D.nudgeCost);
    events.push({ type: 'development_shift', unitId, axis: s.axis, size: s.size });
    if (change !== null) {
      const m: DevMoment = { id: nextDevId(dev, 'dm'), axis: s.axis, from: change.from, to: change.to, reason: s.reason, day: draft.day };
      dev.moments.push(m);
      inverse.momentIds.push(m.id);
      events.push({ type: 'development_moment', unitId, momentId: m.id, axis: s.axis });
    }
  }
  for (const f of ok.facts) {
    const fact: DevFact = { id: nextDevId(dev, 'df'), text: f.text, kind: f.kind, day: draft.day, source: 'review' };
    dev.facts.push(fact);
    inverse.factIds.push(fact.id);
    events.push({ type: 'development_fact', unitId, factId: fact.id });
  }
  while (dev.facts.length > D.factsMax) {
    const i = dev.facts.findIndex((f) => f.edited !== true && !inverse.factIds.includes(f.id));
    if (i < 0) break;
    (inverse.droppedFacts ??= []).push(...dev.facts.splice(i, 1));
  }
  dev.pending = [];
  dev.lastReview = draft.day;
  dev.lastApplied = inverse;
  events.push({ type: 'development_review', unitId, source, shifts: ok.shifts.length, facts: ok.facts.length });
  return events;
}

/** Puts back what the last review changed (drift, discrete fields, the support it took, its facts and moments, `pending`); what was recorded since stays. */
export function undoReview(draft: CampaignState, unitId: string): boolean {
  const dev = draft.squad.find((u) => u.id === unitId)?.development;
  const inv = dev?.lastApplied;
  if (!dev || !inv) return false;
  dev.drift = structuredClone(inv.drift);
  if (inv.bond) dev.bond = structuredClone(inv.bond); else delete dev.bond;
  if (inv.practice) dev.practice = structuredClone(inv.practice); else delete dev.practice; // P15
  if (inv.expect) dev.expect = structuredClone(inv.expect); else delete dev.expect;
  if (inv.gained) dev.gained = structuredClone(inv.gained); else delete dev.gained;
  if (inv.lost) dev.lost = structuredClone(inv.lost); else delete dev.lost;
  for (const [axis, taken] of Object.entries(inv.acc)) {
    const next = round((dev.acc[axis] ?? 0) + taken);
    if (next === 0) delete dev.acc[axis]; else dev.acc[axis] = next;
  }
  dev.facts = dev.facts.filter((f) => !inv.factIds.includes(f.id));
  if (inv.droppedFacts) dev.facts.unshift(...structuredClone(inv.droppedFacts));
  dev.moments = dev.moments.filter((m) => !inv.momentIds.includes(m.id));
  if (inv.lastReview !== undefined) dev.lastReview = inv.lastReview; else delete dev.lastReview;
  dev.pending = [...structuredClone(inv.pending), ...dev.pending];
  // `nextId` is never moved back: an appraisal recorded since keeps its id, and ids only have to stay unique
  delete dev.lastApplied;
  return true;
}

/** Why the last review cannot be replaced any more, or null: a scene has started since (a moment or fact of it carries a scene id). */
export function reviewCommitted(state: CampaignState, unitId: string): string | null {
  const dev = state.squad.find((u) => u.id === unitId)?.development;
  const inv = dev?.lastApplied;
  if (!dev || !inv) return null;
  const shown = dev.moments.some((m) => inv.momentIds.includes(m.id) && (m.sceneId !== undefined || m.shownDay !== undefined))
    || dev.facts.some((f) => inv.factIds.includes(f.id) && (f.sceneId !== undefined || f.shownDay !== undefined));
  return shown ? 'She has already shown it.' : null;
}

