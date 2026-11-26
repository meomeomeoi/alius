import { blockingLive } from '../blocking';
import { registerAction } from '../dispatch';
import { creditHold } from '../physics/boundary';
import { isShoeRun } from '../physics/footwear';
import { foundPosed, frameWoke, getUp, physicsSignal, startPhysics, stopPhysics, stopWord } from '../physics/run';
import { finishCounted, startAct } from '../physics/acts';
import { applyWay, decayStimuli } from '../physics/stimuli';
import { registerDayEndStep } from '../calendar';
import { physicsRelief, marathonSkip, nextSegment, physicsInput, shoeSpit, typedBeats } from '../physics/segment';
import { rateService } from '../practice/service';
import { VERDICTS, type Verdict } from '../practice/state';

// Importing this module registers the physics actions (P15a) and, through `physics/run`, what keeps a run in step with the blocking.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

function live(draft: Parameters<typeof blockingLive>[0], reg: Parameters<typeof blockingLive>[1], what: string): void {
  if (!draft.scene) throw new Error(`${what}: no scene is open`);
  if (!blockingLive(draft, reg)) throw new Error(`${what}: the blocking is not live in this scene`);
}

/** `physics/start { physicsId, sourceKind, sourceId, holderId, duration? }`: starts a run for a source that is in the scene. Draws no rng. */
registerAction('physics/start', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/start');
  if (!isObj(payload)) throw new Error('physics/start needs a payload');
  const { physicsId, sourceId, holderId, sourceKind, duration, second } = payload;
  if (second !== undefined && str(second) === undefined) throw new Error('physics/start: second is a physics id');
  if (str(physicsId) === undefined || str(sourceId) === undefined || str(holderId) === undefined || (sourceKind !== 'contact' && sourceKind !== 'item')) {
    throw new Error('physics/start needs { physicsId, sourceKind: contact | item, sourceId, holderId }');
  }
  const hours = isObj(duration) && typeof duration.hours === 'number' && Number.isFinite(duration.hours) && duration.hours > 0 ? { hours: duration.hours } : undefined;
  if (duration !== undefined && duration !== 'unknown' && hours === undefined) throw new Error('physics/start: duration is { hours } or "unknown"');
  return startPhysics(draft, ctx, {
    physicsId: physicsId as string, sourceKind, sourceId: sourceId as string, holderId: holderId as string, ...(second !== undefined ? { second: second as string } : {}), ...(duration === 'unknown' ? { duration: 'unknown' as const } : hours ? { duration: hours } : {}),
  });
});

/** `physics/signal`: the tap, the signal inside the fiction. What it does is what she holds the commander until. Draws no rng. */
registerAction('physics/signal', (draft, _payload, ctx) => {
  live(draft, ctx.registries, 'physics/signal');
  return physicsSignal(draft, ctx);
});

/** `physics/stop_word`: the player's own signal, out of the fiction. It always ends the run and the contact or item that carried it. Draws no rng. */
registerAction('physics/stop_word', (draft, _payload, ctx) => {
  if (!draft.scene) throw new Error('physics/stop_word: no scene is open');
  return stopWord(draft, ctx);
});

/** `physics/next_segment { runId }`: plans the next segment of a held run and starts it (the controller calls it once no reply is pending). Draws the plan. */
registerAction('physics/next_segment', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/next_segment');
  if (!isObj(payload) || str(payload.runId) === undefined) throw new Error('physics/next_segment needs { runId }');
  return nextSegment(draft, ctx, payload.runId as string);
});

/** `physics/segment_end { runId, segment, inputs }`: the inputs of the segment that ended; resolves it and decides the boundary. Draws no rng here. */
registerAction('physics/segment_end', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/segment_end');
  if (!isObj(payload) || str(payload.runId) === undefined || typeof payload.segment !== 'number') throw new Error('physics/segment_end needs { runId, segment, inputs }');
  return physicsInput(draft, ctx, payload.runId as string, payload.segment, payload.inputs ?? []);
});

/** `physics/typed { chars, beat? }`: a message was typed in turn-based play; its beats lapse. Nothing while no segment runs. */
registerAction('physics/typed', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/typed');
  if (!isObj(payload) || typeof payload.chars !== 'number' || !Number.isFinite(payload.chars) || payload.chars < 0) throw new Error('physics/typed needs { chars }');
  return typedBeats(draft, payload.chars, typeof payload.beat === 'number' ? Math.trunc(payload.beat) : 0);
});

/** `physics/wake_seen`: the commander has seen the wake card; it goes. Draws no rng. */
registerAction('physics/wake_seen', (draft) => {
  delete draft.lastWake;
  return [];
});

/** `physics/skip { strategy }`: how the commander spends the stretch between two phases of a marathon (endure, spare, cheat, rest). Draws at most once. */
registerAction('physics/skip', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/skip');
  if (!isObj(payload)) throw new Error('physics/skip needs { strategy }');
  return marathonSkip(draft, ctx, payload.strategy);
});

/** `physics/stimulus { way, kind, depth? }`: the commander's way with a stimulus (avoid, sniff, inhale, nuzzle, ordered, secret, taste). Draws only for avoid and secret. */
registerAction('physics/stimulus', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/stimulus');
  if (!isObj(payload)) throw new Error('physics/stimulus needs { way, kind }');
  return applyWay(draft, ctx, payload.way, payload.kind, payload.depth);
});

// the body layer: tolerance slips back with days apart and a craved kind that is missed costs a little stress (once a day)
registerDayEndStep('director_tick', (draft, ctx) => decayStimuli(draft, ctx.registries));

/** `physics/act { kind }`: an act of the mouth on a contact that has one (kiss, counted, long, lick, pet, mouth). Draws no rng. */
registerAction('physics/act', (draft, payload, ctx) => {
  if (!draft.scene) throw new Error('physics/act: no scene is open');
  if (!isObj(payload)) throw new Error('physics/act needs { kind }');
  return startAct(draft, ctx, payload.kind);
});

/** `physics/act_finish { typed }`: the commander's count of the kisses she asked for. Draws no rng. */
registerAction('physics/act_finish', (draft, payload, ctx) => {
  if (!draft.scene) throw new Error('physics/act_finish: no scene is open');
  if (!isObj(payload)) throw new Error('physics/act_finish needs { typed }');
  return finishCounted(draft, ctx, payload.typed);
});

/**
 * P10e-e R20: `physics/answer { runId, right, lie, caught }`: the commander's answer to her question under scent, as the instrument judged it by
 * her rule (`right`), whether a word said was not the body's own (`lie`) and whether the body gave the lie away (`caught`, only with a lie).
 * Emits `scent_answer` (bookkeeping) and, for a lie she found out, `scent_lie_caught` (remembered by her). Only for a run with a decision
 * physics (read by interaction, never by id). Draws no rng.
 */
registerAction('physics/answer', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/answer');
  if (!isObj(payload) || str(payload.runId) === undefined || typeof payload.right !== 'boolean' || typeof payload.lie !== 'boolean' || typeof payload.caught !== 'boolean') {
    throw new Error('physics/answer needs { runId, right, lie, caught }');
  }
  const run = draft.scene!.physics;
  if (!run || run.id !== payload.runId) throw new Error('Stale physics run.');
  if (payload.caught && !payload.lie) throw new Error('physics/answer: only a lie can be caught');
  const decision = [run.physicsId, run.second?.physicsId].some((id) => id !== undefined && ctx.registries.contactPhysics.get(id)?.interaction === 'decision');
  if (!decision) throw new Error('physics/answer: she asks only under a decision physics');
  const { right, lie, caught } = payload;
  return [
    { type: 'scent_answer', runId: run.id, holderId: run.holderId, right, lie, caught },
    ...(lie && caught ? [{ type: 'scent_lie_caught', holderId: run.holderId }] : []),
  ];
});

/** P10e-e R28: `physics/get_up { runId }`: the commander gets up alone after her forgotten end (her offence `hold_defied`, through her practices). */
registerAction('physics/get_up', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/get_up');
  return getUp(draft, ctx, isObj(payload) ? payload.runId : undefined);
});

/** P10e-e R28: `physics/found { runId, finderId }`: a visitor of her frame comes in and finds the commander posed (`found_posed`). */
registerAction('physics/found', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/found');
  return foundPosed(draft, ctx, isObj(payload) ? payload.runId : undefined, isObj(payload) ? payload.finderId : undefined);
});

/**
 * P10e-e Rulings X, Y and AE: `physics/relief { runId, beat, kind, amount, part, attention?, involuntary? }`, decided at once (one draw): a
 * relief of the body in her frame (`relieve`, `fidget`), or the commander's own shift of weight or mouth breath in an instrument (`shift_weight`,
 * `mouth_breath`).
 */
registerAction('physics/relief', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/relief');
  if (!isObj(payload)) throw new Error('physics/relief needs a payload');
  return physicsRelief(draft, ctx, payload);
});

/** P10e-e Ruling AC (e10 fix I2): `physics/spit { runId, beat, attention }`: grit spat aside in shoe service, decided at once (one draw). */
registerAction('physics/spit', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/spit');
  if (!isObj(payload)) throw new Error('physics/spit needs a payload');
  return shoeSpit(draft, ctx, payload);
});

/** P10e-e review I7: `physics/woke { runId }`: she woke in her sleep (the third stir): her frame ends. */
registerAction('physics/woke', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/woke');
  return frameWoke(draft, ctx, isObj(payload) ? payload.runId : undefined);
});

/**
 * P10e-e Task 25 (R27): `physics/service { runId, verdict }`: her verdict on a session of foot service in her frame, from the crafts' quality
 * (`verdictOf`, the instrument's), through P16's `rateService(…, 'engine', sceneId)`: once a scene (a second is ignored, as `rateService` does).
 * The run is her frame that is open, or the one that just ended (its id is the scene's last and the frame done's): the instrument says it at
 * the session's end. Memory: none new (`service_rated` lands as P16 decided). Draws no rng.
 *
 * Task 27 (R27, R29): shoe service ends with her verdict too. An open shoe run (`isShoeRun`) is rated and ends as `checked` (her inspection of
 * the last surface is the check: the hold is credited as a finished cleaning); a shoe run that ended `checked` (the engine's own check at ≤ 10,
 * or her verdict) is rated by its id against the scene's `shoeDone` (the holder is the record's). A run that ended otherwise (the stop word) is refused.
 */
registerAction('physics/service', (draft, payload, ctx) => {
  live(draft, ctx.registries, 'physics/service');
  if (!isObj(payload) || str(payload.runId) === undefined || !(VERDICTS as readonly unknown[]).includes(payload.verdict)) {
    throw new Error('physics/service needs { runId, verdict: pleased | adequate | displeased }');
  }
  const scene = draft.scene!;
  const run = scene.physics;
  let holderId: string;
  if (run !== undefined && run.id === payload.runId && isShoeRun(run, ctx.registries)) {
    const rated = rateService(draft, ctx, run.holderId, payload.verdict as Verdict, 'engine', scene.id);
    return [...rated, ...creditHold(draft, ctx.registries, run), ...stopPhysics(draft, ctx.registries, 'checked')];
  }
  const latest = payload.runId === `p${scene.physicsCount ?? 0}`;
  if (run !== undefined && run.id === payload.runId && run.sourceKind === 'activity') holderId = run.holderId;
  else if (run === undefined && scene.frameDone !== undefined && scene.frameDone.runId === payload.runId && latest) holderId = scene.frameDone.holderId;
  else if (run === undefined && latest && scene.shoeDone !== undefined && scene.shoeDone.runId === payload.runId) holderId = scene.shoeDone.holderId;
  else throw new Error('physics/service: stale physics run (her frame or her shoe service, open or just ended)');
  return rateService(draft, ctx, holderId, payload.verdict as Verdict, 'engine', scene.id);
});
