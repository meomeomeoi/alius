/**
 * The game of postures, the engine's half (P16b, Tasks 11 and 12; spec section 7). A posture is a preset (`servicePostures`): target states for some points. In real time the instrument
 * (chunk c6) plays the drift, the clicks and the keys; the engine owns every number: `driftRates` says how hard each point of a preset is to hold, `temptations` what pulls the gaze up
 * in the scene, and (Task 12) the hold's run judges what the instrument reports. Nothing here draws: a chance is a hash (`fnv1a` of the run and the event, `craftRoll`), a pick an index.
 *
 * Every number is `TUNING.craft.posture` (AUTHOR TO TUNE, a G1 draft from the prototype's tables).
 */
import type { Entry, Registries } from '../../content/types';
import { blockingOf, COMMANDER, commanderPresetOf, presetAllowed, presetOf, presetProblem, setBlocking } from '../blocking';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { practiceOf } from '../dynamic/profile';
import { addSign, levelOf } from '../dynamic/knowledge';
import { regardFall } from '../dynamic/regard';
import { fnv1a } from '../hub';
import { sceneSettingsOf } from '../moments/settings';
import { noiseOf } from '../physics/gaze';
import { levelForXp } from '../physics/skill';
import { stillnessOf } from '../physics/style';
import { leaderOf } from '../power/state';
import { ensurePractices } from '../practice/gate';
import { noteOffence } from '../practice/offences';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addCraftXp, craftCapacity, craftLevel } from './book';
import { craftLive } from './gate';
import { fictionSeconds, setRecord } from './records';
import { noteClean, settlingDue, settlingModifier } from './streak';
import { craftRoll, type PostureRun } from './state';

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

// ---------------------------------------------------------------------------------------------
// The hold (Task 12)

/** The pair's mastery of a preset: the one writer of `Relation.craft.postures`. Says nothing (the pair's knowledge is quiet). Nothing for a holder who is not craft-live. */
export function addPostureMastery(draft: CampaignState, reg: Registries, holderId: string, presetId: string, xp: number): void {
  const preset = presetOf(reg, presetId);
  const rel = draft.relations[holderId];
  if (preset === undefined || rel === undefined || !(xp > 0) || !craftLive(draft, reg, holderId)) return;
  const row = (((rel.craft ??= {}).postures ??= {})[preset.id] ??= { xp: 0, day: draft.day });
  row.xp += xp;
  row.day = draft.day;
  delete row.decayedDay;
}

/** The end of a hold as the commander may see it: `null` while it has none to show (no duration: it ends when she says). Mirrors P16's `heldEndShown`. */
export const postureEndShown = (run: Pick<PostureRun, 'hidden' | 'until'>): number | null => (run.hidden === true || run.until === undefined ? null : run.until);

/** What starts a hold. `until` is the planned length in beats, `hidden` keeps it from the commander (no duration), `source` says who asked (`take`, `her_call`, `drill`, `attendance`). */
export interface PostureStart { holderId: string; presetId: string; until?: number; hidden?: boolean; source: string }

/**
 * Starts the hold of a posture (one at a time; P17g's `attendance` reuses it). The commander must be in the preset already (`posture/take` and her call set it first), the holder craft-live and in
 * the room, the preset allowed for her (`presetAllowed`). When she has seen three clean holds of this kind in a row she adds a load her style likes (the settling-in count, hidden): a hold with no
 * duration among them, and the count starts over. Counts a hold for the day's fatigue when it ends. Throws with the reason when it cannot start; draws nothing.
 */
export function startPostureHold(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, o: PostureStart): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  if (scene === undefined) throw new Error('No scene is open.');
  if (!sceneSettingsOf(draft).physicsInteractions.posture) throw new Error('The game of postures is switched off.');
  if (!scene.participants.includes(o.holderId)) throw new Error('She is not in the scene.');
  if (!craftLive(draft, reg, o.holderId)) throw new Error('She is not holding now.');
  const preset = presetOf(reg, o.presetId);
  if (preset === undefined) throw new Error(`Unknown posture "${o.presetId}".`);
  if (draft.practices?.postureRun !== undefined) throw new Error('A posture hold is running.');
  if (commanderPresetOf(draft, reg)?.id !== preset.id) throw new Error('The commander is not in that posture.');
  if (!presetAllowed(draft, reg, preset, [o.holderId])) throw new Error(`${String(preset.label)} is not available here.`);
  let hidden = o.hidden === true;
  let load: string | undefined;
  if (settlingDue(draft, reg, o.holderId, 'posture')) {
    load = settlingModifier(draft, reg, o.holderId) ?? undefined;
    noteClean(draft, o.holderId, 'posture', false); // the count starts over once a load is added
    if (load === 'no_duration') hidden = true;
  }
  const p = ensurePractices(draft);
  const run: PostureRun = {
    id: `pr${p.seq++}`, holderId: o.holderId, presetId: preset.id, startedAt: scene.exchanges, present: [...scene.participants], beats: 0, slips: 0, corrections: 0, source: o.source,
    ...(o.until !== undefined ? { until: o.until } : {}), ...(hidden ? { hidden: true as const } : {}), ...(load !== undefined ? { load } : {}),
  };
  p.postureRun = run;
  return [{ type: 'posture_taken', unitId: o.holderId, holderId: o.holderId, presetId: preset.id, runId: run.id, source: o.source }];
}

/** The hold that runs, or throws. */
function runOf(draft: CampaignState): PostureRun {
  const run = draft.practices?.postureRun;
  if (run === undefined) throw new Error('No posture hold is running.');
  return run;
}

/** Her attention at a beat of the hold: reported by the instrument as it shows it, else a hash of the run and the beat over the weights of her activity's attention (never drawn). A clinical holder always watches. */
export function attentionAt(draft: CampaignState, reg: Registries, run: PostureRun, beat: number): 'watching' | 'glancing' | 'busy' {
  const style = practiceOf(draft, reg, run.holderId)?.style.primary;
  if (style === 'clinical') return 'watching';
  const activity = blockingOf(draft.scene, run.holderId).activity;
  const word = String(activity !== undefined ? reg.blockingActivities.get(activity)?.attention ?? 'on_commander' : 'on_commander');
  const [w, g] = TUNING.physics.gaze.attention[word] ?? TUNING.physics.gaze.attention.on_commander!;
  const x = hash01(`attn|${run.id}|${Math.max(0, Math.floor(beat))}`);
  return x < w! ? 'watching' : x < w! + g! ? 'glancing' : 'busy';
}

const isPoint = (v: unknown): v is PosturePoint => typeof v === 'string' && (POSTURE_POINTS as readonly string[]).includes(v);

/** The slip of a point: one offence of hers, the craft's note of it, the streak starts over. P16's `posture_slip` is what the lesson and her punishment read. */
function slip(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, run: PostureRun, point: PosturePoint, why?: string): EngineEvent[] {
  run.slips++;
  noteClean(draft, run.holderId, 'posture', false);
  const base = { unitId: run.holderId, holderId: run.holderId, runId: run.id, presetId: run.presetId } as const;
  return [
    { type: 'posture_slip', ...base, point, ...(why !== undefined ? { why } : {}) },
    { type: 'posture_slip_noted', ...base, point },
    ...noteOffence(draft, ctx, run.holderId, { kind: 'posture_slip', ref: `${run.id}:${run.slips}`, stakes: 'trivial', day: draft.day }),
  ];
}

/** `posture/slip { point }`: the instrument reports a point past its threshold. Throws with no hold or a point that is none. */
export function slipPosture(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, point: unknown, why?: string): EngineEvent[] {
  const run = runOf(draft);
  if (!isPoint(point)) throw new Error('posture/slip needs a point: torso, hips, knees, arms, head, gaze or feet.');
  if (!craftLive(draft, ctx.registries, run.holderId)) throw new Error('She is not holding now.');
  return slip(draft, ctx, run, point, why);
}

/**
 * `posture/correct { point, amount, attention?, beat? }`: the commander took `amount` (0-100) of drift back from a point. It makes noise: (amount / 100) ^ 1.4, by the preset's `noise` word and the
 * commander's stillness (`noiseOf('posture')`). Under her eyes a loud one reads as fidgeting (above 0.42 while she watches, 0.72 while she glances, never while she is busy), and every third one
 * she sees is a slip. `attention` is hers as the instrument shows it (else hashed from the run and the beat). A point the preset does not judge is refused. Draws nothing.
 */
export function correctPosture(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, o: { point: unknown; amount: unknown; attention?: unknown; beat?: unknown }): EngineEvent[] {
  const reg = ctx.registries;
  const run = runOf(draft);
  if (!isPoint(o.point)) throw new Error('posture/correct needs a point: torso, hips, knees, arms, head, gaze or feet.');
  if (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || o.amount < 0 || o.amount > TUNING.craft.posture.slipAt) throw new Error('posture/correct needs an amount from 0 to 100 (the drift taken back).');
  if (o.beat !== undefined && !(typeof o.beat === 'number' && Number.isInteger(o.beat) && o.beat >= 0)) throw new Error('posture/correct: beat is a count of beats.');
  if (o.attention !== undefined && o.attention !== 'watching' && o.attention !== 'glancing' && o.attention !== 'busy') throw new Error('posture/correct: attention is watching, glancing or busy.');
  if (!craftLive(draft, reg, run.holderId)) throw new Error('She is not holding now.');
  const preset = presetOf(reg, run.presetId)!;
  if (!(o.point in ((preset.drift ?? {}) as object))) throw new Error('That point is not held in this posture.');
  const beat = o.beat ?? run.beats;
  run.beats = Math.max(run.beats, beat);
  const attention = o.attention ?? attentionAt(draft, reg, run, beat);
  const P = TUNING.craft.posture;
  const loudness = loudnessOf(o.amount) * (P.noiseMult[String(preset.noise)] ?? 1) * noiseOf('posture', stillnessOf(draft, run.holderId)).loudness;
  const seen = loudness > P.seen[attention]!;
  run.corrections++;
  if (loudness > P.loudAt) run.loud = (run.loud ?? 0) + 1;
  const events: EngineEvent[] = [{ type: 'posture_corrected', unitId: run.holderId, holderId: run.holderId, runId: run.id, presetId: run.presetId, point: o.point, loud: loudness > P.loudAt, seen }];
  if (seen) {
    run.fidgets = (run.fidgets ?? 0) + 1;
    if (run.fidgets % P.fidgetSlipEvery === 0) events.push(...slip(draft, ctx, run, o.point, 'fidgeting'));
  }
  return events;
}

/** How a hold may end: her release (the term, or her word), the commander's tap, a collapse, the stop word (out of the fiction), or the scene gone. */
export const POSTURE_END_REASONS = ['released', 'tapped', 'collapse', 'stopped', 'gone'] as const;
export type PostureEndReason = (typeof POSTURE_END_REASONS)[number];

/** The humiliation of a hold: the preset's plus the situation (someone else present, the leader, a group scene, a long hold, her `show_off` audience before others), at most 5. */
export function humiliationOf(draft: CampaignState, reg: Registries, run: PostureRun, preset: Entry, seconds: number): number {
  const S = TUNING.craft.posture.situation;
  const witnesses = witnessesOf(draft, run.holderId);
  let h = Number(preset.humiliation) || 0;
  if (witnesses.length > 0) {
    h += S.witness;
    if (leaderOf(draft) !== null && witnesses.includes(leaderOf(draft)!.id)) h += S.leader;
    if (practiceOf(draft, reg, run.holderId)?.audience === 'show_off') h += S.showOff;
  }
  if (draft.scene?.mode === 'group') h += S.crowd;
  if (seconds >= S.longSeconds) h += S.long;
  return Math.min(S.max, h);
}

/** The named living soldiers in the room besides her. */
const witnessesOf = (draft: CampaignState, holderId: string): string[] =>
  (draft.scene?.participants ?? []).filter((id) => id !== holderId && draft.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));

/**
 * Ends the hold. A clean one to her release (no slip) pays `xp.posture` to the `posture` discipline, the pair's mastery of the preset (`xp.knowledge`) and keeps its record in fiction time (beats x
 * 45 s x (1 + 0.25 per level of `posture`)); any hold that ran (not the stop word, not a scene that is gone) is counted for the day's fatigue, sets the longest record, keeps or breaks the settling-in
 * count, and costs Regard by its humiliation: her own, and each witness's who does not know the dynamic (by the witness factor), who also see the sign of it. Draws nothing.
 */
export function endPosture(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, o: { reason: unknown; beats?: unknown }): EngineEvent[] {
  const reg = ctx.registries;
  const run = runOf(draft);
  if (typeof o.reason !== 'string' || !(POSTURE_END_REASONS as readonly string[]).includes(o.reason)) throw new Error(`posture/end needs a reason: ${POSTURE_END_REASONS.join(', ')}.`);
  if (o.beats !== undefined && !(typeof o.beats === 'number' && Number.isInteger(o.beats) && o.beats >= 0)) throw new Error('posture/end: beats is a count.');
  const reason = o.reason as PostureEndReason;
  const preset = presetOf(reg, run.presetId)!;
  const p = draft.practices!;
  delete p.postureRun;
  const base = { unitId: run.holderId, holderId: run.holderId, runId: run.id, presetId: run.presetId, slips: run.slips } as const;
  if (reason === 'stopped' || reason === 'gone' || !craftLive(draft, reg, run.holderId)) return [{ type: 'posture_ended', ...base, reason: reason === 'stopped' ? 'stopped' : 'gone', clean: false }];
  const beats = o.beats ?? run.until ?? run.beats;
  const seconds = fictionSeconds('posture', beats, craftLevel(draft, 'posture'));
  const clean = reason === 'released' && run.slips === 0;
  p.postureDay = { day: draft.day, holds: (p.postureDay?.day === draft.day ? p.postureDay.holds : 0) + 1 };
  const events: EngineEvent[] = [{ type: 'posture_ended', ...base, reason, clean, seconds }];
  noteClean(draft, run.holderId, 'posture', clean);
  if (clean) {
    events.push(...addCraftXp(draft, reg, 'posture', TUNING.craft.xp.posture, 'hold'));
    addPostureMastery(draft, reg, run.holderId, preset.id, TUNING.craft.xp.knowledge);
  }
  events.push(...setRecord(draft, run.holderId, `posture:${preset.id}`, seconds, { unclean: !clean, tapped: reason === 'tapped' }));
  // what it cost before those who saw it (P15 section 16.3): her Regard of the commander, and each witness's who did not know, by the witness factor; the sign of the dynamic reaches them
  const humiliation = humiliationOf(draft, reg, run, preset, seconds);
  if (humiliation > 0) {
    events.push(...regardFall(draft, reg, run.holderId, humiliation, { witness: false, cause: 'posture' }));
    for (const w of witnessesOf(draft, run.holderId)) {
      if (levelOf(draft, w, run.holderId) === 'knows_dynamic') continue;
      events.push(...regardFall(draft, reg, w, humiliation, { witness: true, cause: 'posture' }), ...addSign(draft, ctx as EngineCtx, w, run.holderId, 'protocol_public'));
    }
  }
  return events;
}

/** Ends the run out of the fiction without a word of the commander's (the stop word, a scene that is gone): no pay, no record, no Regard. `[]` when no hold runs. */
export function endPostureRun(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, reason: 'stopped' | 'gone'): EngineEvent[] {
  return draft.practices?.postureRun === undefined ? [] : endPosture(draft, ctx, { reason });
}

/**
 * Takes the posture and starts its hold (`posture/take { presetId, holderId?, until?, hidden?, at? }`): the commander is put in the preset (the base and the preset, as a chip would) and the hold of
 * the holder in the room begins (`holderId`, else the first craft-live soldier present). Everything is checked before anything is written: an unknown preset, one her categories forbid, one the place
 * cannot give, no holder, a hold already running. Draws nothing.
 */
export function takePostureHold(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, o: { presetId: string; holderId?: string; until?: number; hidden?: boolean; at?: number }): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  if (scene === undefined) throw new Error('No scene is open.');
  if (!sceneSettingsOf(draft).physicsInteractions.posture) throw new Error('The game of postures is switched off.');
  const preset = presetOf(reg, o.presetId);
  if (preset === undefined) throw new Error(`Unknown posture "${o.presetId}".`);
  const holderId = o.holderId ?? scene.participants.find((id) => craftLive(draft, reg, id));
  if (holderId === undefined || !craftLive(draft, reg, holderId)) throw new Error('Nobody is holding here: there is no one to hold the posture for.');
  if (!scene.participants.includes(holderId)) throw new Error('She is not in the scene.');
  if (draft.practices?.postureRun !== undefined) throw new Error('A posture hold is running.');
  if (!presetAllowed(draft, reg, preset, [holderId])) throw new Error(`${String(preset.label)} is not available here.`);
  const problem = presetProblem(draft, reg, preset);
  if (problem !== null) throw new Error(problem);
  const events = setBlocking(draft, ctx, { person: COMMANDER, field: 'posture', value: String(preset.base), preset: preset.id }, { at: o.at ?? scene.readIndex ?? scene.startIndex, source: 'chip' });
  return [...events, ...startPostureHold(draft, ctx, { holderId, presetId: preset.id, ...(o.until !== undefined ? { until: o.until } : {}), ...(o.hidden === true ? { hidden: true } : {}), source: 'take' })];
}

/**
 * Her call answered in time may start the hold of the posture (the practices' hook): the share is `holdShare` by her style, the roll `craftRoll(her, 'hold:<call>')`, the length a hash between
 * `holdBeats`, and a `cold` or `cruel` holder keeps the end to herself. Nothing for a holder who is not craft-live, with a hold running already, or for a posture the commander is not in.
 */
export function holdOfCall(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, info: { holderId: string; callId: string; postureId: string }): EngineEvent[] {
  const reg = ctx.registries;
  if (!craftLive(draft, reg, info.holderId) || draft.practices?.postureRun !== undefined || !sceneSettingsOf(draft).physicsInteractions.posture) return [];
  const preset = presetOf(reg, info.postureId);
  if (preset === undefined || commanderPresetOf(draft, reg)?.id !== preset.id) return [];
  const T = TUNING.craft.posture;
  const style = practiceOf(draft, reg, info.holderId)?.style.primary ?? '';
  if (craftRoll(draft, info.holderId, `hold:${info.callId}`) >= (T.holdShare[style] ?? T.holdShare.other!)) return [];
  const until = T.holdBeats.min + Math.floor(craftRoll(draft, info.holderId, `hold:len:${info.callId}`) * (T.holdBeats.max - T.holdBeats.min + 1));
  try {
    return startPostureHold(draft, ctx, { holderId: info.holderId, presetId: preset.id, until, ...(T.hiddenEnd.includes(style) ? { hidden: true } : {}), source: 'her_call' });
  } catch {
    return []; // she could not start it (the place, a gate): the posture is taken all the same
  }
}
