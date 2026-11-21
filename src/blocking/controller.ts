import type { Registries } from '../content/types';
import type { CueKind } from '../engine/blocking/types';
import type { Action, EngineEvent } from '../engine/dispatch';
import { temperamentOf } from '../engine/life/state';
import { leadStyle, physicsStyleOf } from '../engine/physics/style';
import type { SegmentInput } from '../engine/physics/state';
import type { CampaignState } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import type { Envelope } from '../llm/envelope';
import { completeCues, pickCue, sanitizeCues, type CuePool, type PhysicsCuesInput } from '../llm/calls/physicsCues';
import { CUE_KINDS } from '../engine/blocking/types';
import type { ContextBuilder } from '../llm/context';
import type { AliusSettings } from '../settings';

const CUES_SITE = 'physics.cues';
/** Her card, cut for the cue call. */
const CARD_MAX = 600;
/** Inputs that need steady hands: they lapse while keys are typed (real time). */
const MAINTENANCE = new Set<SegmentInput['kind']>(['hold', 'breathe']);

export interface StagingDeps {
  app: {
    dispatch(action: Action, opts?: { expectChatId?: string }): EngineEvent[];
    current(): { state: CampaignState | null; load?: { chatId?: string } };
    context?: ContextBuilder;
    refreshContext?(): void;
  };
  registries(): Registries;
  settings(): AliusSettings;
  generations: Envelope;
  /** The scene controller: whether a reply from the main model is on its way, and how a blackout ends the scene. */
  scene: { replyPending(): boolean; end(): Promise<void> };
  /** The clock (injected so tests drive it). */
  now(): number;
  toast(kind: 'info' | 'warn' | 'error', text: string): void;
}

export interface StagingController {
  /** The events of a settled dispatch (the app calls it from `followUps`): a run that starts asks for her cue pool; a blackout ends the scene. */
  onEvents(events: readonly EngineEvent[]): void;
  /** The panel's input for the segment that is running. Maintenance inputs lapse while keys are typed (real time). */
  input(i: SegmentInput): void;
  /** A key was typed in the scene input (real time: maintenance lapses for `TUNING.physics.typing.lapseMs`). */
  keystroke(): void;
  /** A message was sent (turn-based: its length uses beats from `beat`). */
  typed(chars: number, beat?: number): EngineEvent[];
  /** Sends the inputs of the segment that ended (the panel when its beats are used up; the clock in real time). */
  endSegment(): EngineEvent[];
  /** The player's stop word: always ends the hold. */
  stopWord(): EngineEvent[];
  /** Drives the clock: ends a real-time segment on time and starts the next one when nothing is pending. */
  tick(nowMs: number): void;
  /** One of her cue lines of a kind for a beat of the running segment, or `null`. */
  cue(kind: CueKind, beat: number): string | null;
  /** A chat switch: the clock stops, the inputs and the pool go, nothing more is dispatched until `resume`. */
  reset(): void;
  /** A campaign was opened: an open run is driven again. */
  resume(): void;
  /** Waits for the work in flight (tests). */
  idle(): Promise<void>;
}

/**
 * The real-time layer of the contact physics (P15a §16.1). It never waits for the model: a run starts its segments on its own, a segment ends on
 * the clock (or when the panel says its beats are used up) and the body is `held` between segments, with nothing draining, until no reply is
 * pending. The cue pool is asked for once per run; until it arrives, and if it never does, the registry's lines are shown. Everything that
 * counts (planning, resolving, the boundary) is the engine's: this only decides when to call it.
 */
export function createStaging(deps: StagingDeps): StagingController {
  let active = true;
  let generation = 0;
  let collected: SegmentInput[] = [];
  let startedAt: number | null = null;
  let lapseUntil = 0;
  const pools = new Map<string, ReturnType<typeof completeCues>>();
  const asked = new Set<string>();
  const ended = new Set<string>();
  const work = new Set<Promise<unknown>>();

  const state = (): CampaignState | null => deps.app.current().state;
  const chatId = (): string | undefined => deps.app.current().load?.chatId;
  const run = () => state()?.scene?.physics;
  const dispatch = (action: Action): EngineEvent[] => {
    const events = deps.app.dispatch(action, { expectChatId: chatId() });
    handle(events);
    return events;
  };
  const track = (p: Promise<unknown>): void => {
    work.add(p);
    void p.finally(() => work.delete(p));
  };

  function cuesInput(s: CampaignState, runId: string): PhysicsCuesInput | { expired: string } {
    const r = s.scene?.physics;
    if (!r || r.id !== runId) return { expired: 'The hold is over.' };
    const reg = deps.registries();
    const unit = s.squad.find((u) => u.id === r.holderId);
    const card = String((unit as { card?: unknown } | undefined)?.card ?? '').slice(0, CARD_MAX);
    return {
      unitId: r.holderId, name: unit?.displayName ?? r.holderId, card, physicsId: r.physicsId, physics: String(reg.contactPhysics.get(r.physicsId)?.label ?? r.physicsId),
      style: leadStyle(physicsStyleOf(s, r.holderId)).key, kinds: [...CUE_KINDS],
    };
  }

  deps.generations.bind<PhysicsCuesInput, CuePool>(CUES_SITE, {
    build: (key) => { const s = state(); return s ? cuesInput(s, key) : { expired: 'No campaign is open.' }; },
    parse: (raw) => sanitizeCues(raw),
    apply(key, value, input) {
      if (!active || run()?.id !== key) return { stale: true };
      pools.set(key, completeCues(value, deps.registries(), input.physicsId));
      return 'ok';
    },
    fallback(key, input) {
      const r = run();
      if (!r || r.id !== key) return false;
      pools.set(key, completeCues(null, deps.registries(), input?.physicsId ?? r.physicsId));
      return true;
    },
  });

  /** What a settled dispatch sets in motion: her cue pool for a run that starts, the scene's end after a blackout. */
  function handle(events: readonly EngineEvent[]): void {
    if (!active) return;
    for (const e of events) {
      if (e.type === 'physics_started' && e.chained !== true) {
        const id = String(e.runId);
        if (!asked.has(id)) {
          asked.add(id);
          const mine = generation;
          track(deps.generations.generate(CUES_SITE, id).then(() => { void mine; }).catch(() => {}));
        }
        startedAt = null;
      }
      if (e.type === 'physics_outcome') {
        collected = [];
        startedAt = null;
      }
      if (e.type === 'blackout') {
        const id = String(e.runId);
        if (!ended.has(id)) {
          ended.add(id);
          track(deps.scene.end().catch((err) => deps.toast('error', `Could not end the scene: ${err instanceof Error ? err.message : String(err)}`)));
        }
      }
    }
  }

  const silent = (s: CampaignState, unitId: string): boolean => temperamentOf(s, unitId).talkativeness === 'silent';

  function advance(now: number): void {
    const s = state();
    const r = s?.scene?.physics;
    if (!s || !r) return;
    if (r.segment.state === 'running') {
      if (startedAt === null) startedAt = now;
      const seconds = Number(deps.registries().contactPhysics.get(r.physicsId)?.segmentSeconds ?? 20);
      if (s.settings.physicsRealtime === true && now - startedAt >= seconds * 1000) endSegment();
      return;
    }
    // held: nothing drains; the next segment starts when no reply is on its way (a silent holder never waits)
    if (!deps.scene.replyPending() || silent(s, r.holderId)) {
      const events = dispatch({ type: 'physics/next_segment', payload: { runId: r.id } });
      if (!events.some((e) => e.type === 'error')) {
        startedAt = deps.now();
        collected = [];
      }
    }
  }

  function endSegment(): EngineEvent[] {
    const r = run();
    if (!r || r.segment.state !== 'running') return [];
    const inputs = collected;
    collected = [];
    startedAt = null;
    return dispatch({ type: 'physics/segment_end', payload: { runId: r.id, segment: r.segment.n, inputs } });
  }

  return {
    onEvents(events) {
      handle(events);
      if (active) advance(deps.now());
    },
    input(i) {
      const r = run();
      if (!active || !r || r.segment.state !== 'running') return;
      if (MAINTENANCE.has(i.kind) && deps.now() < lapseUntil) return;
      collected.push(i);
    },
    keystroke() {
      lapseUntil = deps.now() + TUNING.physics.typing.lapseMs;
    },
    typed(chars, beat = 0) {
      return active && run() ? dispatch({ type: 'physics/typed', payload: { chars, beat } }) : [];
    },
    endSegment,
    stopWord() {
      return dispatch({ type: 'physics/stop_word', payload: {} });
    },
    tick(nowMs) {
      if (active) advance(nowMs);
    },
    cue(kind, beat) {
      const r = run();
      if (!active || !r) return null;
      const pool = pools.get(r.id) ?? completeCues(null, deps.registries(), r.physicsId);
      return pickCue(pool, kind, `${r.id}|${r.segment.n}|${beat}`);
    },
    reset() {
      active = false;
      generation += 1;
      collected = [];
      startedAt = null;
      lapseUntil = 0;
      pools.clear();
      asked.clear();
      ended.clear();
    },
    resume() {
      active = true;
      startedAt = null;
    },
    async idle() {
      while (work.size > 0) await Promise.all([...work]);
    },
  };
}
