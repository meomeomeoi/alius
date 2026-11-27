import type { Registries } from '../content/types';
import { blockingLive } from '../engine/blocking';
import type { CueKind } from '../engine/blocking/types';
import type { Action, EngineEvent } from '../engine/dispatch';
import { temperamentOf } from '../engine/life/state';
import { leadStyle, physicsStyleOf, segmentSecondsOf } from '../engine/physics/style';
import type { ReliefReport, SegmentInput } from '../engine/physics/state';
import type { CampaignState } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import type { Envelope } from '../llm/envelope';
import { completeCues, pickCue, sanitizeCues, type CuePool, type PhysicsCuesInput } from '../llm/calls/physicsCues';
import { sanitizeScript, type ActivityScriptInput, type ScriptLine } from '../llm/calls/activityScript';
import { buildKnowledge } from '../analysis/knowledge';
import { frameOf } from '../engine/physics/presence';
import { listenerKnows } from '../engine/physics/mention';
import { phaseSegments } from '../engine/physics/marathon';
import { CUE_KINDS } from '../engine/blocking/types';
import type { ContextBuilder } from '../llm/context';
import type { AliusSettings } from '../settings';

const CUES_SITE = 'physics.cues';
/** P10e-e R26: her hour's script, one call per phase of her frame. */
const SCRIPT_SITE = 'physics.script';
/** How many of the facts she knows go into the script's input. */
const KNOWN_MAX = 6;
/** Her card, cut for the cue call. */
const CARD_MAX = 600;
/** Inputs that need steady hands: they lapse while keys are typed (real time). */
const MAINTENANCE = new Set<SegmentInput['kind']>(['hold', 'breathe']);

export interface StagingDeps {
  app: {
    dispatch(action: Action, opts?: { expectChatId?: string }): EngineEvent[];
    current(): { state: CampaignState | null; load?: unknown };
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
  /**
   * The panel's input for the segment that is running. Maintenance inputs lapse while keys are typed (real time), unless the mouse made them
   * (`pointer`, P10e-e ruling O: an instrument's mouse acts while the field has focus).
   */
  input(i: SegmentInput, opts?: { pointer?: boolean }): void;
  /** The beat of the running segment the clock is at (real time): where an input made now lands. */
  beat(): number;
  /** P10e-e R5: when the running segment started (null while none runs), the length of a beat and now, all on the controller's clock. */
  clock(): { startedAt: number | null; beatMs: number; now: number };
  /** P10e-e: how a run of the open scene ended (the `physics_outcome` this controller saw), or null. */
  outcome(runId: string): { runId: string; physicsId: string; result: string; tally?: Record<string, number> } | null;
  /** A key was typed in the scene input (real time: maintenance lapses for `TUNING.physics.typing.lapseMs`). */
  keystroke(): void;
  /** A message was sent (turn-based: its length uses beats from `beat`). */
  typed(chars: number, beat?: number): EngineEvent[];
  /** Sends the inputs of the segment that ended (the panel when its beats are used up; the clock in real time). */
  endSegment(): EngineEvent[];
  /** The player's stop word: always ends the hold. */
  stopWord(): EngineEvent[];
  /** An act of the mouth on a contact that has one, and the commander's count for counted kisses. */
  act(kind: string): EngineEvent[];
  finishCounted(typed: number): EngineEvent[];
  /** The commander's way with a stimulus (`physics/stimulus`). */
  stimulus(way: string, kind: string, depth?: number | string): EngineEvent[];
  /** P10e-e R20: the commander's answer to her question under scent (`physics/answer` of the open run). */
  answer(right: boolean, lie: boolean, caught: boolean): EngineEvent[];
  /** A marathon between two phases: how the commander spends the stretch (`physics/skip`). */
  skip(strategy: string): EngineEvent[];
  /** P10e-e R28: after her forgotten end the commander gets up alone (`physics/get_up`), or a visitor of the frame comes in (`physics/found`). */
  getUp(): EngineEvent[];
  found(finderId: string): EngineEvent[];
  /**
   * P10e-e Rulings X, Y and AE: a relief decided at once (`physics/relief`): the body in her frame (`relieve`, `fidget`), or the commander's own
   * shift of weight or mouth breath in an instrument (`shift_weight`, `mouth_breath` with its loudness). `attention` is hers as shown, read
   * only between segments (Minor 6).
   */
  relief(r: ReliefReport): EngineEvent[];
  /** P10e-e review I7: she woke (the third stir in her sleep): her frame ends (`physics/woke`). */
  woke(): EngineEvent[];
  /** P10e-e 24b: a decision of her hour's script (`physics/decide`, through her command capability; refused without it). */
  decide(kind: string, ref?: string): EngineEvent[];
  /** P10e-e Task 26: her verdict on a session of foot service in her frame (`physics/service`), its run open or just ended; Task 28: or of shoe service. */
  service(runId: string, verdict: 'pleased' | 'adequate' | 'displeased'): EngineEvent[];
  signal(runId: string, motion: string, answered: boolean): EngineEvent[];
  /** P10e-e Ruling AC: grit spat aside in shoe service, decided at once (`physics/spit`), whether a segment runs or the run is held. */
  spit(beat: number, attention: string): EngineEvent[];
  /** P10e-e e11 review M8: the running segment's clock starts again now (gulp's floor: its 40 s count from the puddle shown). */
  restart(): void;
  /** Drives the clock: ends a real-time segment on time and starts the next one when nothing is pending. */
  tick(nowMs: number): void;
  /**
   * P10e-e Ruling AF (final review I3): the page was hidden or shown again (the app's `visibilitychange`). While it is hidden and real time is
   * on, the clock pauses: no segment ends or starts (the instruments' frames are frozen too, as the prototypes freeze); shown again, the running
   * segment resumes where it left off (its start moves by the hidden time). Nothing is synthesised. Turn-based play is not paused.
   */
  visibility(hidden: boolean, nowMs: number): void;
  /** One of her cue lines of a kind for a beat of the running segment, or `null`. */
  cue(kind: CueKind, beat: number): string | null;
  /**
   * P10e-e ruling Q: one of her cue lines of a kind for a beat, only when the model worded that kind for this run (her own words), never the
   * registry's fallback narration; `null` otherwise. An instrument writes this in her hand in place of its own line.
   */
  voiced(kind: CueKind, beat: number): string | null;
  /**
   * P10e-e R26: the script of the running frame's phase (her hour's lines from the model, validated), or `null` until it arrives and when the
   * call failed (her placeholder lines play then). Kept in memory by `sceneId|runId|phase`, dropped on a chat switch.
   */
  script(phase?: number): ScriptLine[] | null;
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
  /** Ruling AF: when the page was hidden (null while it is shown). */
  let hiddenAt: number | null = null;
  const pools = new Map<string, ReturnType<typeof completeCues>>();
  /** The model's own lines per run (only the kinds it worded): ruling Q. */
  const voicedPools = new Map<string, CuePool>();
  const asked = new Set<string>();
  const ended = new Set<string>();
  /** P10e-e: the outcomes seen, by scene and run (an instrument plays the end of its run). */
  const outcomes = new Map<string, { runId: string; physicsId: string; result: string; tally?: Record<string, number> }>();
  /** P10e-e R26: her hour's scripts, by `sceneId|runId|phase`. */
  const scripts = new Map<string, ScriptLine[]>();
  const work = new Set<Promise<unknown>>();

  const state = (): CampaignState | null => deps.app.current().state;
  const chatId = (): string | undefined => (deps.app.current().load as { chatId?: string } | undefined)?.chatId;
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

  /** Run ids repeat in every scene (`p1`), so every key here carries the scene's id (review I1). */
  const keyOf = (sceneId: string, runId: string): string => `${sceneId}|${runId}`;
  const runKey = (s: CampaignState | null | undefined): string | null => (s?.scene?.physics ? keyOf(s.scene.id, s.scene.physics.id) : null);

  function cuesInput(s: CampaignState, key: string): PhysicsCuesInput | { expired: string } {
    const r = s.scene?.physics;
    if (!r || runKey(s) !== key) return { expired: 'The hold is over.' };
    const reg = deps.registries();
    const unit = s.squad.find((u) => u.id === r.holderId);
    const card = String((unit as { card?: unknown } | undefined)?.card ?? '').slice(0, CARD_MAX);
    return {
      unitId: r.holderId, name: unit?.displayName ?? r.holderId, card, physicsId: r.physicsId, physics: String(reg.contactPhysics.get(r.physicsId)?.label ?? r.physicsId),
      style: leadStyle(physicsStyleOf(s, r.holderId, reg)).key, kinds: [...CUE_KINDS],
    };
  }

  const scriptKey = (s: CampaignState | null | undefined, phase: number): string | null => { const k = runKey(s); return k === null ? null : `${k}|${phase}`; };

  /** R26: the script call's input, built through `Knowledge` (what the commander may know too); her presence is never sent. */
  function scriptInput(s: CampaignState, key: string): ActivityScriptInput | { expired: string } {
    const r = s.scene?.physics;
    const phase = Number(key.split('|')[2]);
    if (!r || r.sourceKind !== 'activity' || scriptKey(s, phase) !== key) return { expired: 'The hold is over.' };
    const reg = deps.registries();
    const unit = s.squad.find((u) => u.id === r.holderId);
    const entry = reg.blockingActivities.get(r.sourceId);
    const frame = frameOf(entry);
    const knowledge = buildKnowledge(s, deps.settings());
    const known = knowledge.facts().filter((f) => f.about.includes(r.holderId) || f.knownBy?.includes(r.holderId) === true).slice(-KNOWN_MAX).map((f) => f.text);
    for (const u of s.squad) if (u.status === 'injured' && u.kind === 'named') known.push(`${u.displayName} is injured.`);
    const listeners: ActivityScriptInput['listeners'] = [];
    if (frame?.call) listeners.push({ id: 'oversight', name: 'Oversight', knows: 'none' });
    if (frame?.visitor || frame?.audience) {
      const other = s.squad.find((u) => u.kind === 'named' && u.id !== r.holderId && u.status === 'active' && !(s.scene?.participants ?? []).includes(u.id));
      if (other) listeners.push({ id: other.id, name: other.displayName, knows: listenerKnows(s, r.holderId, other.id) });
    }
    return {
      unitId: r.holderId, name: unit?.displayName ?? r.holderId, card: String((unit as { card?: unknown } | undefined)?.card ?? '').slice(0, CARD_MAX),
      activity: String(entry?.label ?? r.sourceId), phase, seconds: phaseSegments(s, reg, r) * segmentSecondsOf(s, reg, r, 30),
      hours: r.marathon?.hours ?? 'unknown', style: leadStyle(physicsStyleOf(s, r.holderId, reg)).key, known: known.slice(-KNOWN_MAX - 2), listeners,
      ...(frame?.audience ? { throne: true as const } : {}),
    };
  }

  deps.generations.bind<ActivityScriptInput, ScriptLine[]>(SCRIPT_SITE, {
    build: (key) => { const s = state(); return s ? scriptInput(s, key) : { expired: 'No campaign is open.' }; },
    parse: (raw, input) => sanitizeScript(raw, input),
    apply(key, value) {
      const s = state();
      if (!active || scriptKey(s, Number(key.split('|')[2])) !== key) return { stale: true };
      scripts.set(key, value);
      return 'ok';
    },
    // without the call her placeholder lines play (the cue pool and her voice): nothing to store
    fallback: (key) => active && scriptKey(state(), Number(key.split('|')[2])) === key,
  });

  /** R26: asks for the script of a phase of the running frame, once. */
  function askScript(phase: number): void {
    const s = state();
    if (s?.scene?.physics?.sourceKind !== 'activity') return;
    const key = scriptKey(s, phase);
    if (key === null || asked.has(key)) return;
    asked.add(key);
    track(deps.generations.generate(SCRIPT_SITE, key).catch(() => {}));
  }

  deps.generations.bind<PhysicsCuesInput, CuePool>(CUES_SITE, {
    build: (key) => { const s = state(); return s ? cuesInput(s, key) : { expired: 'No campaign is open.' }; },
    parse: (raw) => sanitizeCues(raw),
    apply(key, value, input) {
      if (!active || runKey(state()) !== key) return { stale: true };
      pools.set(key, completeCues(value, deps.registries(), input.physicsId));
      if (value) voicedPools.set(key, value);
      return 'ok';
    },
    fallback(key, input) {
      const r = run();
      if (!r || runKey(state()) !== key) return false;
      pools.set(key, completeCues(null, deps.registries(), input?.physicsId ?? r.physicsId));
      return true;
    },
  });

  /** What a settled dispatch sets in motion: her cue pool for a run that starts, the scene's end after a blackout. */
  function handle(events: readonly EngineEvent[]): void {
    if (!active) return;
    for (const e of events) {
      if (e.type === 'physics_started' && e.chained !== true) {
        const id = keyOf(state()?.scene?.id ?? '', String(e.runId));
        if (!asked.has(id)) {
          asked.add(id);
          const mine = generation;
          track(deps.generations.generate(CUES_SITE, id).then(() => { void mine; }).catch(() => {}));
        }
        startedAt = null;
        if (e.sourceKind === 'activity') askScript(1);
      }
      // R26: a new phase of her frame (the stretch between phases was resolved): its script
      if (e.type === 'marathon_phase' && e.over !== true && typeof e.phase === 'number') askScript(e.phase);
      if (e.type === 'physics_outcome') {
        const tally = e.tally as Record<string, number> | undefined;
        outcomes.set(keyOf(state()?.scene?.id ?? '', String(e.runId)), { runId: String(e.runId), physicsId: String(e.physicsId), result: String(e.result), ...(tally ? { tally: { ...tally } } : {}) });
        collected = [];
        startedAt = null;
      }
      if (e.type === 'marathon_done' && e.result !== 'stopped') {
        // the hold ran its fiction time out: the scene ends (the slots it cost are spent when it does)
        const id = `marathon:${state()?.scene?.id ?? ''}:${String(e.unitId)}:${String(e.hours)}`;
        if (!ended.has(id)) {
          ended.add(id);
          track(deps.scene.end().catch((err) => deps.toast('error', `Could not end the scene: ${err instanceof Error ? err.message : String(err)}`)));
        }
      }
      if (e.type === 'blackout') {
        const id = keyOf(state()?.scene?.id ?? '', String(e.runId));
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
    if (hiddenAt !== null && s.settings.physicsRealtime === true) return; // Ruling AF: the page is hidden, the clock is paused
    if (!blockingLive(s, deps.registries())) {
      // the bond fell below close with a hold running: the layer is gone, so every segment action would fail; the hold ends here, once, through the stop word (it has no live guard)
      dispatch({ type: 'physics/stop_word', payload: {} });
      collected = [];
      startedAt = null;
      return;
    }
    if (r.segment.state === 'running') {
      if (startedAt === null) startedAt = now;
      const seconds = segmentSecondsOf(s, deps.registries(), r); // P15b: her tempo moves it, as it moves the plan's beats
      if (s.settings.physicsRealtime === true && now - startedAt >= seconds * 1000) endSegment();
      return;
    }
    // held: nothing drains; a marathon between two phases waits for the player's strategy; otherwise the next segment starts when no reply is on its way (a silent holder never waits)
    if (r.marathon?.waiting || r.forgotten) return; // R28: after her forgotten end nothing is planned: the commander waits posed
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
    if (!active || !r || r.segment.state !== 'running') return [];
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
    input(i, opts) {
      const r = run();
      if (!active || !r || r.segment.state !== 'running') return;
      if (MAINTENANCE.has(i.kind) && opts?.pointer !== true && deps.now() < lapseUntil) return;
      collected.push(i);
    },
    beat() {
      const r = run();
      if (!r?.segment.plan || startedAt === null) return 0;
      return Math.min(r.segment.plan.beats.length - 1, Math.max(0, Math.floor((deps.now() - startedAt) / TUNING.physics.beatMs)));
    },
    outcome(runId) {
      return outcomes.get(keyOf(state()?.scene?.id ?? '', runId)) ?? null;
    },
    clock() {
      return { startedAt, beatMs: TUNING.physics.beatMs, now: deps.now() };
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
    act(kind) {
      return active ? dispatch({ type: 'physics/act', payload: { kind } }) : [];
    },
    finishCounted(typed) {
      return active ? dispatch({ type: 'physics/act_finish', payload: { typed } }) : [];
    },
    stimulus(way, kind, depth) {
      return active ? dispatch({ type: 'physics/stimulus', payload: { way, kind, ...(depth !== undefined ? { depth } : {}) } }) : [];
    },
    answer(right, lie, caught) {
      const r = run();
      return active && r ? dispatch({ type: 'physics/answer', payload: { runId: r.id, right, lie, caught } }) : [];
    },
    skip(strategy) {
      return active && run() ? dispatch({ type: 'physics/skip', payload: { strategy } }) : [];
    },
    getUp() {
      const r = run();
      return active && r?.forgotten ? dispatch({ type: 'physics/get_up', payload: { runId: r.id } }) : [];
    },
    found(finderId) {
      const r = run();
      return active && r?.forgotten ? dispatch({ type: 'physics/found', payload: { runId: r.id, finderId } }) : [];
    },
    relief(x) {
      const r = run();
      return active && r ? dispatch({ type: 'physics/relief', payload: { runId: r.id, beat: this.beat(), ...x, ...(x.involuntary ? { involuntary: true } : {}) } }) : [];
    },
    woke() {
      const r = run();
      return active && r ? dispatch({ type: 'physics/woke', payload: { runId: r.id } }) : [];
    },
    decide(kind, ref) {
      const r = run();
      return active && r ? dispatch({ type: 'physics/decide', payload: { runId: r.id, kind, ...(ref !== undefined ? { ref } : {}) } }) : [];
    },
    service(runId, verdict) {
      return active ? dispatch({ type: 'physics/service', payload: { runId, verdict } }) : [];
    },
    signal(runId, motion, answered) {
      return active ? dispatch({ type: 'physics/service', payload: { runId, signal: { motion, answered } } }) : [];
    },
    restart() {
      const r = run();
      if (active && r?.segment.state === 'running' && startedAt !== null) startedAt = deps.now();
    },
    spit(beat, attention) {
      const r = run();
      return active && r ? dispatch({ type: 'physics/spit', payload: { runId: r.id, beat, attention } }) : [];
    },
    tick(nowMs) {
      if (active) advance(nowMs);
    },
    visibility(hidden, nowMs) {
      if (hidden) {
        hiddenAt ??= nowMs;
        return;
      }
      if (hiddenAt === null) return;
      if (startedAt !== null) startedAt += Math.max(0, nowMs - hiddenAt); // the running segment resumes where it left off
      hiddenAt = null;
    },
    cue(kind, beat) {
      const r = run();
      if (!active || !r) return null;
      const pool = pools.get(runKey(state()) ?? r.id) ?? completeCues(null, deps.registries(), r.physicsId);
      return pickCue(pool, kind, `${r.id}|${r.segment.n}|${beat}`);
    },
    voiced(kind, beat) {
      const r = run();
      if (!active || !r) return null;
      const lines = voicedPools.get(runKey(state()) ?? '')?.[kind];
      return lines && lines.length > 0 ? pickCue({ [kind]: lines } as Record<CueKind, string[]>, kind, `${r.id}|${r.segment.n}|${beat}`) : null;
    },
    script(phase) {
      const r = run();
      if (!active || !r || r.sourceKind !== 'activity') return null;
      const key = scriptKey(state(), phase ?? r.marathon?.phase ?? 1);
      return key !== null ? scripts.get(key) ?? null : null;
    },
    reset() {
      active = false;
      scripts.clear();
      generation += 1;
      collected = [];
      startedAt = null;
      lapseUntil = 0;
      pools.clear();
      voicedPools.clear();
      asked.clear();
      ended.clear();
      outcomes.clear();
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
