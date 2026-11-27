import { registerActivityHook } from '../activities';
import { registerAction, registerAfterAction } from '../dispatch';
import { registerDayEndStep } from '../calendar';
import { decayCraft } from '../craft/decay';
import { installCraftHooks } from '../craft/hooks';
import { noteSlips } from '../craft/lesson';
import { noteHoldEvents } from '../craft/records';
import { touchCraft } from '../craft/book';
import { craftOn } from '../craft/gate';
import { dropPendingDrills, installDrillHooks, noteDrillOutcome, startDrill } from '../craft/drillScene';
import { correctPosture, endPosture, endPostureRun, holdOfCall, slipPosture, takePostureHold } from '../craft/posture';
import { enduranceOf } from '../craft/state';
import { registerCallAnswered } from '../practice/postures';
import { TUNING } from '../tuning';

// Importing this module registers what keeps the craft in step with the rest of the engine (P16b). It must come after `actions/practice`
// (the order of the day-end steps follows the order the action modules are evaluated).

/**
 * Every xp the physics layer gives (a held hold, a streak, a drill) is a use of that endurance: the decay's day is stamped, so a key used
 * within `decay.days` is never touched. Writes only while some holder is craft-live; draws nothing.
 */
registerAfterAction((draft, ctx, events) => {
  if (!craftOn(draft, ctx.registries)) return [];
  for (const e of events) if (e.type === 'endurance_gained') touchCraft(draft, `endurance:${String((e as { physicsId?: unknown }).physicsId)}`);
  return [];
});

/**
 * A clean segment of a hold pays the endurance of its physics, and a finished run (or marathon) sets the pair's records in fiction time and keeps her
 * settling-in count (`craft/records.ts`). Reads only the events of the action; writes only for a craft-live holder; draws nothing.
 */
registerAfterAction((draft, ctx, events) => (events.some((e) => e.type === 'physics_segment' || e.type === 'physics_outcome') ? noteHoldEvents(draft, ctx, events) : []));

/** The day-end decay: a discipline unused for `decay.days` loses a level step, the pair's knowledge after `pairDays` (nothing runs while nothing is written). */
registerDayEndStep('director_tick', (draft, ctx) => decayCraft(draft, ctx.registries));

/**
 * A slip of a craft-live holder teaches when her punishment or her named point follows it in the same scene (`craft/lesson.ts`): half the xp of a clean phase, once
 * per slip. Her point is kept for the reply that follows (`Relation.craft.lesson`, hidden until she says it). Draws nothing.
 */
registerAfterAction((draft, ctx, events) => craftOn(draft, ctx.registries) ? noteSlips(draft, ctx, events) : []);

// the physics layer reads the commander's stillness and her rhythm through these (0 until learnt)
installCraftHooks();

// the drills of the `train` activity: the gate, the alone effect and the partner (the activities layer takes them as hooks)
installDrillHooks();

/** An endurance drill done alone is P15a's (it pays through `commander_endurance_xp`); with a holder running the craft it is also a drill of the book. */
registerActivityHook((draft, ctx, done) => {
  if (done.focus === undefined || done.companionId !== undefined || !craftOn(draft, ctx.registries)) return [];
  const focus = (ctx.registries.activities.get(done.activityId)?.focus as Array<{ id: string; drill?: { key: string } }> | undefined)?.find((f) => f.id === done.focus);
  const key = focus?.drill?.key;
  return key !== undefined && enduranceOf(key) !== null ? [{ type: 'drill_done', key, mult: 1, alone: true, xp: TUNING.physics.endurance.training }] : [];
});

/**
 * `craft/drill_start { unitId, at? }`: the drill she waits to run (a partner drill whose scene is open) starts: its contact is staged by field and the hold begins
 * (`physics/start`). Its outcome pays the drill at the partner's multiplier, with her verdict (a holder) or the sign of being seen together (another woman). Draws no rng.
 */
registerAction('craft/drill_start', (draft, payload, ctx) => {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  if (typeof p.unitId !== 'string' || p.unitId === '') throw new Error('craft/drill_start needs { unitId }');
  if (p.at !== undefined && !(typeof p.at === 'number' && Number.isInteger(p.at) && p.at >= 0)) throw new Error('craft/drill_start: at is a chat index');
  return startDrill(draft, ctx, p.unitId, p.at as number | undefined);
});

/** The outcome of the hold a drill began pays it; a scene that is over takes the drill that waited for it. */
registerAfterAction((draft, ctx, events) => {
  dropPendingDrills(draft, events);
  return events.some((e) => e.type === 'physics_outcome') ? noteDrillOutcome(draft, ctx, events) : [];
});

// ---------------------------------------------------------------------------------------------
// The game of postures (P16b, Tasks 11 and 12). The instrument plays the drift in real time and reports; the engine judges. No action here draws.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `posture/take { presetId, holderId?, until?, hidden?, at? }`: the commander takes a posture (a preset, or an old base name that reads as its default preset) and the hold of the holder in the room begins.
 * `until` is the planned length in beats and `hidden` keeps it from the commander (no duration); `at` is the chat index it is staged at (a chip's). Everything is checked first; throws with the reason
 * when she cannot hold, the preset is unknown or forbidden here, the place cannot give it or a hold is running. Emits `posture_taken`.
 */
registerAction('posture/take', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.presetId !== 'string' || payload.presetId === '') throw new Error('posture/take needs { presetId }.');
  if (payload.holderId !== undefined && typeof payload.holderId !== 'string') throw new Error('posture/take: holderId is a unit id.');
  if (payload.until !== undefined && !(typeof payload.until === 'number' && Number.isInteger(payload.until) && payload.until > 0)) throw new Error('posture/take: until is a count of beats.');
  if (payload.at !== undefined && !(typeof payload.at === 'number' && Number.isInteger(payload.at) && payload.at >= 0)) throw new Error('posture/take: at is a chat index.');
  return takePostureHold(draft, ctx, {
    presetId: payload.presetId, ...(payload.holderId !== undefined ? { holderId: payload.holderId } : {}), ...(payload.until !== undefined ? { until: payload.until } : {}),
    ...(payload.hidden === true ? { hidden: true } : {}), ...(payload.at !== undefined ? { at: payload.at } : {}),
  });
});

/** `posture/correct { point, amount, attention?, beat? }`: a correction of a point (`amount` of drift taken back): it makes noise, and under her eyes a loud one is fidgeting she sees. Emits `posture_corrected`. */
registerAction('posture/correct', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('posture/correct needs { point, amount }.');
  return correctPosture(draft, ctx, { point: payload.point, amount: payload.amount, attention: payload.attention, beat: payload.beat });
});

/** `posture/slip { point }`: a point went past its threshold: one offence of hers, `posture_slip` and `posture_slip_noted`; the streak starts over. */
registerAction('posture/slip', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('posture/slip needs { point }.');
  return slipPosture(draft, ctx, payload.point);
});

/** `posture/end { reason, beats? }`: the hold ends (`released`, `tapped`, `collapse`, `stopped`, `gone`); a clean one to her release pays xp, mastery and a record in fiction time. Emits `posture_ended`. */
registerAction('posture/end', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('posture/end needs { reason }.');
  return endPosture(draft, ctx, { reason: payload.reason, beats: payload.beats });
});

/** Her call answered in time may start the hold of the posture she called (the practices' hook): by her style's share, a hashed roll, nothing drawn. */
registerCallAnswered((draft, ctx, info) => holdOfCall(draft, ctx, info));

/** A scene that is over takes the hold with it, out of the fiction: no pay, no record, no Regard. */
registerAfterAction((draft, ctx, events) => (events.some((e) => e.type === 'scene_ended' || e.type === 'scene_aborted') ? endPostureRun(draft, ctx, 'gone') : []));
