/**
 * Her reading of the commander's position (P15, plan R10, spec §15.2, §16.4). It is HER reading, not the truth: three slow averages (readiness
 * r, friction f, the share of provocations the commander took back, p), the shares of flat and deflected answers, and five motive weights.
 * Probe answers, moment answers and (later) practice answers move them; a region names the picture, with hysteresis so that one misread scene
 * changes nothing. The style colours the reading (`possessive` sees devotion, `cruel` sees defiance, `clinical` reads exactly), deterministically:
 * nothing here draws.
 */
import type { ResponseType } from '../blocking/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { PhysicsStyle } from '../physics/state';
import { physicsStyleOf } from '../physics/style';
import type { CampaignState, Insight } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicOn, herPracticeLive } from './gate';
import { regardRise } from './regard';
import { blankReading, dynamicOf, type DynamicRelation, type HerReading } from './state';
import { MOTIVES, TONES, type Motive, type RegionRank, type Tone } from './types';

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A fresh reading: nobody's idea of the commander yet. */
export const newReading = (): HerReading => blankReading();

/** What one answer tells her (R10): the response, the tone it came in, and whether a threat came in the same exchange. */
export interface ReadingSample { response: ResponseType; tone?: Tone; afterThreat?: boolean }

/**
 * Events that are a threat to the commander (user ruling, I4; P16 R18): the commander punished or leashed, and what a holder did to the commander in the practices: a punishment issued or
 * answered, a slap dealt, a threat voiced, a hold that is a punishment. A sample of an action that holds one is `afterThreat`. Read through `isThreat`: a hold that is not punitive, an
 * order about a soldier (`forUnitId`) and an answer that is a compromise or an order carried out are not. (`threatened` is the commander's own threat toward a unit, so it can say nothing
 * about hers.)
 */
const THREAT_EVENTS: readonly string[] = ['commander_punished', 'commander_leashed', 'punishment_issued', 'punishment_answered', 'slap_dealt', 'threat_voiced', 'hold_started'];

/** Is this event a threat to the commander (the types above, less the ones that are not)? */
export function isThreat(e: Pick<EngineEvent, 'type'> & { [k: string]: unknown }): boolean {
  if (!THREAT_EVENTS.includes(e.type)) return false;
  if (e.type === 'hold_started') return e.punitive === true;
  if (e.type === 'punishment_issued') return e.forUnitId === undefined; // her order about a soldier is not a threat to the commander
  if (e.type === 'punishment_answered') return e.answer !== 'compromise' && e.answer !== 'do_it';
  return true;
}
export const threatIn = (events: readonly EngineEvent[]): boolean => events.some(isThreat);

/**
 * Was there a threat in this action (`threatIn`), or just before it in the same exchange: the practices write `lastThreat` on each threat event (an after-action), and it names the
 * unit, the scene and its exchange (or, in a DM, the day). It counts in the same exchange and the next of the same scene, never in another scene, for another woman or on another day.
 * Reads the shared state only (the practices are above this layer). False without a threat.
 */
export function threatNear(state: CampaignState, events: readonly EngineEvent[], unitId: string): boolean {
  if (threatIn(events)) return true;
  const last = state.practices?.lastThreat;
  if (last === undefined || last.unitId !== unitId) return false;
  const scene = state.scene;
  if (scene !== undefined) return last.sceneId === scene.id && scene.exchanges - last.exchange <= 1 && scene.exchanges - last.exchange >= 0;
  return last.sceneId === undefined && last.day === state.day;
}

/** The motive weights with a declaration blended in (`declared.weight` of the way toward its motive). */
function blended(m: Record<Motive, number>, declared?: { motive: Motive; weight: number }): Record<Motive, number> {
  if (declared === undefined || declared.weight <= 0) return m;
  const w = Math.min(1, declared.weight);
  return Object.fromEntries(MOTIVES.map((k) => [k, m[k] * (1 - w) + (k === declared.motive ? w : 0)])) as Record<Motive, number>;
}

/** Is `k` the one largest weight (strictly)? A tie is nobody's. */
const largest = (m: Record<Motive, number>, k: Motive): boolean => MOTIVES.every((j) => j === k || m[k] > m[j]);

/**
 * The region of a reading, tested in the order of `REGION_RANKS` (§15.2 with `cowed` after `elusive`, §16.4): `dutiful` needs `order`
 * largest and `hungry` needs `process` largest; `devoted` is what is left. A declaration, while it has weight, is blended into the motive.
 */
export function regionOf(reading: HerReading, declared?: { motive: Motive; weight: number }): RegionRank {
  const R = TUNING.position.region;
  const m = blended(reading.motive, declared);
  const { r, f, p } = reading;
  if (reading.flat >= R.flat) return 'hollow';
  if (reading.deflect >= R.deflect) return 'elusive';
  if (largest(m, 'fear')) return 'cowed';
  if (f >= R.friction && largest(m, 'gain')) return 'double_game';
  if (f < R.friction && largest(m, 'gain')) return 'calculating';
  if (f >= R.friction && p >= R.play) return 'bratty';
  if (f >= R.friction) return 'proud';
  if (r >= R.ready && f >= 0 && largest(m, 'process')) return 'hungry';
  if (r < 0) return 'reluctant'; // f < 0.3 here
  if (r >= R.ready && largest(m, 'order')) return 'dutiful';
  return 'devoted';
}

/** The motive an answer speaks for, or none (R10): a yield right after a threat is fear; a transactional tone is gain; a sincere yield is order. */
function motiveOf(sample: ReadingSample): Motive | undefined {
  if (sample.afterThreat === true && sample.response === 'yielded') return 'fear';
  if (sample.tone === 'transactional') return 'gain';
  if (sample.tone === 'sincere' && sample.response === 'yielded') return 'order';
  return undefined;
}

/** Her region after this update, with hysteresis: a new one counts only after `hysteresis` updates in a row. Returns the change, if it happened. */
function settle(rel: DynamicRelation): { from: RegionRank; to: RegionRank } | undefined {
  const rd = rel.readOf;
  const candidate = regionOf(rd, rel.declared);
  if (candidate === rd.region) {
    delete rd.pending;
    return undefined;
  }
  const count = rd.pending?.region === candidate ? rd.pending.count + 1 : 1;
  if (count < TUNING.position.hysteresis) {
    rd.pending = { region: candidate, count };
    return undefined;
  }
  const from = rd.region;
  rd.region = candidate;
  delete rd.pending;
  return { from, to: candidate };
}

/** Where readiness and friction stand after one answer of this weight (no side effects; the default expectation previews with it). */
export function axisStep(rd: Pick<HerReading, 'r' | 'f'>, response: ResponseType, alpha: number): { r: number; f: number } {
  const toward = (v: number, target: number): number => v + alpha * (target - v);
  if (response === 'yielded') return { r: toward(rd.r, 1), f: rd.f };
  if (response === 'resisted') return { r: toward(rd.r, -1), f: toward(rd.f, 0.5) };
  if (response === 'returned') return { r: rd.r, f: toward(rd.f, 1) };
  return { r: rd.r, f: rd.f };
}

/**
 * One answer into her reading (R10): each axis moves `alpha` of the way toward what the answer says (`yielded` r toward +1; `resisted` r
 * toward -1, f toward 0.5, p to 0; `returned` f toward +1, p toward 1; every answer moves the deflect share, a toned one the flat and
 * sincere shares); the motive average moves 1.5 times as far toward the motive it speaks for. The leading style then colours it: a
 * `possessive` or `obsessive` reading moves the motive 0.1 of the way toward `her`, a `cruel` or `vindictive` one takes 0.1 off r, each
 * doubled by a low insight. Deterministic. Returns the region change, if the hysteresis let one through.
 */
export function updateReading(
  rel: DynamicRelation, sample: ReadingSample, alpha: number, style: PhysicsStyle, insight: Insight,
): { region?: { from: RegionRank; to: RegionRank } } {
  const rd = rel.readOf;
  const toward = (v: number, target: number, a: number): number => v + a * (target - v);
  const axes = axisStep(rd, sample.response, alpha);
  rd.r = axes.r;
  rd.f = axes.f;
  if (sample.response === 'resisted') rd.p = toward(rd.p, 0, alpha);
  if (sample.response === 'returned') rd.p = toward(rd.p, 1, alpha);
  rd.deflect = toward(rd.deflect, sample.response === 'deflected' ? 1 : 0, alpha);
  if (sample.tone !== undefined) {
    rd.flat = toward(rd.flat, sample.tone === 'flat' ? 1 : 0, alpha);
    rd.sincere = toward(rd.sincere ?? 0, sample.tone === 'sincere' ? 1 : 0, alpha);
  }
  const target = motiveOf(sample);
  const step = Math.min(1, (alpha * TUNING.position.alpha.motive) / TUNING.position.alpha.probe);
  if (target !== undefined) for (const k of MOTIVES) rd.motive[k] = toward(rd.motive[k], k === target ? 1 : 0, step);
  const lead = style.phaseLead === 'secondary' && style.secondary !== undefined ? style.secondary : style.primary;
  const bias = TUNING.position.insight[insight];
  if (lead === 'possessive' || lead === 'obsessive') for (const k of MOTIVES) rd.motive[k] = toward(rd.motive[k], k === 'her' ? 1 : 0, TUNING.position.bias.herToward * bias);
  if (lead === 'cruel' || lead === 'vindictive') rd.r += TUNING.position.bias.readiness * bias;
  rd.r = round4(clamp(rd.r, -1, 1));
  rd.f = round4(clamp(rd.f, -1, 1));
  rd.p = round4(clamp(rd.p, 0, 1));
  rd.flat = round4(clamp(rd.flat, 0, 1));
  rd.deflect = round4(clamp(rd.deflect, 0, 1));
  if (rd.sincere !== undefined) rd.sincere = round4(clamp(rd.sincere, 0, 1));
  for (const k of MOTIVES) rd.motive[k] = round4(rd.motive[k]);
  rd.updates += 1;
  const region = settle(rel);
  return region === undefined ? {} : { region };
}

/** Her reading after a declaration (or its fading): the same hysteresis, no new sample. */
export function resettleReading(rel: DynamicRelation): { region?: { from: RegionRank; to: RegionRank } } {
  const region = settle(rel);
  return region === undefined ? {} : { region };
}

/** The distance in the (readiness, friction) plane from her reading to a point: 0 … about 2.8 (compatibility reads 0 … 2). */
export function distanceToPoint(reading: Pick<HerReading, 'r' | 'f'>, point: { r: number; f: number }): number {
  return Math.hypot(reading.r - point.r, reading.f - point.f);
}

/** A declaration's effect on the day: it fades by `fadePerDay` and is gone at 0 (the reading settles without it). */
export function fadeDeclarations(draft: CampaignState, ids: readonly string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const id of ids) {
    const rel = dynamicOf(draft, id);
    if (rel?.declared === undefined) continue;
    rel.declared.weight = round4(rel.declared.weight - TUNING.position.declaration.fadePerDay);
    if (rel.declared.weight <= 0) delete rel.declared;
    const shift = resettleReading(rel).region;
    if (shift !== undefined) events.push({ type: 'position_shifted', unitId: id, from: shift.from, to: shift.to });
  }
  return events;
}

/**
 * After every action: a `moment_answered` of a unit who has a dynamic feeds her reading (`alpha.moment`), never her hold (user ruling R1: only
 * the spec's sources move hold). Nothing happens while the dynamic is off or for a unit without a block; draws nothing.
 */
export function readMoments(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const answers = events.filter((e) => e.type === 'moment_answered');
  if (answers.length === 0 || !dynamicOn(draft, ctx.registries)) return [];
  const out: EngineEvent[] = [];
  for (const e of answers) {
    const unitId = String(e.unitId);
    const unit = draft.squad.find((u) => u.id === unitId);
    const rel = dynamicOf(draft, unitId);
    if (unit === undefined || rel === undefined || !isLiving(unit) || !herPracticeLive(draft, unitId)) continue;
    const tone = TONES.find((t) => t === e.tone);
    const afterThreat = threatNear(draft, events, unitId); // a threat in the same action, or just before in the same exchange (P16)
    if (e.responseType === 'yielded') out.push(...regardRise(draft, ctx.registries, unitId, 'cost')); // a yield that cost her something (r at 0 or less, read before this answer moves it) (R18)
    const region = updateReading(rel, { response: e.responseType as ResponseType, ...(tone !== undefined ? { tone } : {}), ...(afterThreat ? { afterThreat } : {}) }, TUNING.position.alpha.moment, physicsStyleOf(draft, unitId, ctx.registries), unit.insight ?? 'mid').region;
    if (region !== undefined) out.push({ type: 'position_shifted', unitId, from: region.from, to: region.to });
  }
  return out;
}
