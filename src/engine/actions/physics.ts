import { blockingLive } from '../blocking';
import { registerAction } from '../dispatch';
import { physicsSignal, startPhysics, stopWord } from '../physics/run';
import { nextSegment, physicsInput, typedBeats } from '../physics/segment';

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
  const { physicsId, sourceId, holderId, sourceKind, duration } = payload;
  if (str(physicsId) === undefined || str(sourceId) === undefined || str(holderId) === undefined || (sourceKind !== 'contact' && sourceKind !== 'item')) {
    throw new Error('physics/start needs { physicsId, sourceKind: contact | item, sourceId, holderId }');
  }
  const hours = isObj(duration) && typeof duration.hours === 'number' && Number.isFinite(duration.hours) && duration.hours > 0 ? { hours: duration.hours } : undefined;
  if (duration !== undefined && duration !== 'unknown' && hours === undefined) throw new Error('physics/start: duration is { hours } or "unknown"');
  return startPhysics(draft, ctx, {
    physicsId: physicsId as string, sourceKind, sourceId: sourceId as string, holderId: holderId as string, ...(duration === 'unknown' ? { duration: 'unknown' as const } : hours ? { duration: hours } : {}),
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
