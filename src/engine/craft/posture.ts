/**
 * The game of postures, the engine's half (P16b, Tasks 11 and 12; spec section 7). A posture is a preset (`servicePostures`): target states for some points. In real time the instrument
 * (chunk c6) plays the drift, the clicks and the keys; the engine owns every number: `driftRates` says how hard each point of a preset is to hold, `temptations` what pulls the gaze up
 * in the scene, and (Task 12) the hold's run judges what the instrument reports. Nothing here draws: a chance is a hash (`fnv1a` of the run and the event, `craftRoll`), a pick an index.
 *
 * Every number is `TUNING.craft.posture` (AUTHOR TO TUNE, a G1 draft from the prototype's tables).
 */
import type { Entry, Registries } from '../../content/types';
import { COMMANDER, presetOf } from '../blocking';
import { fnv1a } from '../hub';
import { levelForXp } from '../physics/skill';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { craftCapacity } from './book';
import type { PostureRun } from './state';

const P = TUNING.craft.posture;

/** The points of a posture, and the rates the engine gives them (points per 10 s at skill 0). */
export const POSTURE_POINTS = ['torso', 'hips', 'knees', 'arms', 'head', 'gaze', 'feet'] as const;
export type PosturePoint = (typeof POSTURE_POINTS)[number];
export type DriftRates = Partial<Record<PosturePoint, number>>;

/**
 * What else bears on the body for one hold. Every field is optional: what is absent is read from the state (`earlierHolds`: the day's holds; `hardFloor`: the commander's place;
 * `weight`: a physics running on a contact the posture supports) except `load`, which only a caller can say (she hands the commander something to carry).
 */
export interface PostureMods { load?: boolean; hardFloor?: boolean; weight?: boolean; earlierHolds?: number }

/** The holds the commander has already held today, as the day's fatigue counts them. */
export const earlierHoldsOf = (state: Pick<CampaignState, 'practices' | 'day'>): number => (state.practices?.postureDay?.day === state.day ? state.practices.postureDay.holds : 0);

/**
 * Is the commander on a hard floor: a place is set and it is not furniture (a bunk is soft; the bare floor, a corner, the doorway, at her feet are not). Read by the anchor's `kind`, never by
 * its id. With no place set nothing says so.
 */
export function floorIsHard(state: Pick<CampaignState, 'scene'>, reg: Registries): boolean {
  const anchor = state.scene?.blocking?.[COMMANDER]?.anchor;
  const kind = anchor === undefined ? undefined : reg.blockingAnchors.get(anchor.id)?.kind;
  return kind !== undefined && kind !== 'furniture';
}

/** Does her weight bear on the commander now: a hold runs on a contact the preset `supports`, and its physics is a held weight (a `hold` interaction). */
export function weightBears(state: Pick<CampaignState, 'scene'>, reg: Registries, preset: Entry): boolean {
  const run = state.scene?.physics;
  if (run === undefined || !Array.isArray(preset.supports)) return false;
  return run.sourceKind === 'contact' && (preset.supports as string[]).includes(run.sourceId) && reg.contactPhysics.get(run.physicsId)?.interaction === 'hold';
}

/** The pair's mastery of a posture, in levels 0-5 (the xp they have held it for, on the endurance thresholds). */
export function masteryOf(state: Pick<CampaignState, 'relations'>, holderId: string, presetId: string): number {
  return levelForXp(state.relations[holderId]?.craft?.postures?.[presetId]?.xp ?? 0);
}

/**
 * How hard each judged point of a preset is to hold: the preset's rate times the day's fatigue (1 + 0.1 per hold earlier the same day), a load (x 1.3), a hard floor (x 1.2), her weight
 * (x 1.25: a physics the posture supports, running), the commander's skill (1 - 0.08 per level of `posture` capacity, which carries the body route) and the pair's mastery of this posture
 * (1 - 0.05 per level). An old base name reads as the base's default preset. The gaze has no fatigue term: only skill and mastery move it (its rate is the preset's own, 0 in the registry:
 * it drifts by temptation). Reads only. The terms inside one hold (the hold tires the body as it goes, a drift feeds itself) are `withinHold` and `selfFeeding`.
 */
export function driftRates(state: CampaignState, reg: Registries, holderId: string, presetId: string, mods: PostureMods = {}): DriftRates {
  const preset = presetOf(reg, presetId);
  if (preset === undefined) return {};
  const base = (preset.drift ?? {}) as DriftRates;
  const fatigue = 1 + P.fatigue * (mods.earlierHolds ?? earlierHoldsOf(state));
  const load = mods.load === true ? P.load : 1;
  const floor = (mods.hardFloor ?? floorIsHard(state, reg)) ? P.hardFloor : 1;
  const weight = (mods.weight ?? weightBears(state, reg, preset)) ? P.weight : 1;
  const skill = Math.max(P.skillFloor, 1 - TUNING.craft.drift.perLevel * craftCapacity(state, 'posture'));
  const mastery = Math.max(P.skillFloor, 1 - P.mastery * masteryOf(state, holderId, preset.id));
  const out: DriftRates = {};
  for (const point of POSTURE_POINTS) {
    const rate = base[point];
    if (rate === undefined) continue;
    out[point] = point === 'gaze' ? rate * skill * mastery : rate * fatigue * load * floor * weight * skill * mastery;
  }
  return out;
}

/** The hold tires the body as it goes: x (1 + 0.4) over the first two minutes (`seconds` held so far), no more after. */
export const withinHold = (seconds: number): number => 1 + Math.min(P.within.extra, (Math.max(0, seconds) / P.within.seconds) * P.within.extra);

/** Past half way a drift feeds itself (the muscle gives faster as it goes): x (1 + (drift - 50) / 100), where `drift` is the point's 0-100 offset. */
export const selfFeeding = (drift: number): number => 1 + Math.max(0, drift - P.selfFeed.from) / P.selfFeed.per;

/** How loud a correction is: (drift / 100) ^ 1.4, so small early corrections are quiet. */
export const loudnessOf = (drift: number): number => Math.pow(Math.max(0, drift) / P.slipAt, P.loudExp);

/** One pull on the gaze: an impulse of `size` points over `len` seconds, begun `delay` seconds after the event that caused it. */
export interface Temptation {
  /** The event it answers (`join:<unitId>`, `blocking:<exchange>:<item>`, `moment:<source>:<exchange>`): stable, so a redraw never doubles it. */
  key: string;
  kind: 'visitor' | 'undress';
  size: number;
  len: number;
  delay: number;
}

const hash01 = (key: string): number => fnv1a(key) / 4294967296;

/**
 * What tempts the gaze during this hold: an impulse of 30 for each event in the scene since the run began (a visitor 50), placed by a hash of the run and the event, never drawn. The events
 * are read from the scene by kind: a participant who was not there when the hold began (a visitor), a worn item of hers taken off (her undressing), a moment source whose `live` kind is
 * `visitor` that fired since. Nothing happens in a quiet scene. The instrument plays the impulses when the events come; the engine never decides whether the commander looked.
 */
export function temptations(state: CampaignState, reg: Registries, run: PostureRun): Temptation[] {
  const scene = state.scene;
  if (scene === undefined) return [];
  const at = (key: string, kind: Temptation['kind'], size: number): Temptation => ({ key, kind, size, len: P.impulse.len[kind]!, delay: Math.round(hash01(`${run.id}|${key}`) * P.impulse.delayMax * 1000) / 1000 });
  const out: Temptation[] = [];
  for (const id of scene.participants) if (!run.present.includes(id)) out.push(at(`join:${id}`, 'visitor', P.impulse.visitor));
  for (const e of scene.stagingLog ?? []) {
    if (e.person === undefined || e.person === COMMANDER || e.field !== 'removed' || (e.exchange ?? 0) < run.startedAt || !reg.blockingItems.has(String(e.value ?? ''))) continue;
    out.push(at(`blocking:${e.exchange ?? 0}:${String(e.value)}`, 'undress', P.impulse.event));
  }
  for (const f of scene.moments?.fired ?? []) {
    const live = reg.momentSources.get(f.sourceId)?.live;
    if (f.exchange >= run.startedAt && Array.isArray(live) && (live as string[]).includes('visitor')) out.push(at(`moment:${f.sourceId}:${f.exchange}`, 'visitor', P.impulse.visitor));
  }
  return out;
}
