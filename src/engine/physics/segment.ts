/**
 * P15a: planning and resolving one segment of a contact physics (plan R12). `planSegment` draws everything random about a segment ONCE, at its
 * start (the openings of her rhythm, her shifts, what she wants next, her attention, the cues), and the plan is stored in the run: the UI plays
 * it and a reading never shows it. `resolveSegment` is pure: the plan and the inputs decide, no rng, so a slow model and a fast one give the
 * same outcome (the latency rule).
 */
import type { Registries } from '../../content/types';
import { blockingOf } from '../blocking';
import { SEALS, type CueKind, type InteractionType, type Seal } from '../blocking/types';
import { fnv1a } from '../hub';
import { sceneSettingsOf } from '../moments/settings';
import type { Rng } from '../rng';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import type { EngineEvent } from '../dispatch';
import { momentPass } from '../moments/fire';
import { creditHold, decideBoundary } from './boundary';
import { mergeInputs, STEADY_DRAIN } from './combined';
import { hoursPerPhase, paceScale, phaseSegments, attrition, resolveSkip, STRATEGIES, clockText, type Strategy } from './marathon';
import { chainRun, coreRun, stopPhysics } from './run';
import { attentionCue, attentionPlan, cheatRoll, segmentNoise, type NoiseKind } from './gaze';
import { addEnduranceXp, herSkillOf } from './skill';
import {
  INPUT_KINDS, type Attention, type PhysicsRun, type PhysicsStyle, type PlannedBeat, type ScentBand, type SegmentInput, type SegmentPlan, type SegmentResult,
} from './state';
import { blendedStyle, leadStyle, physicsStyleOf, styleRows } from './style';

/** The commander's stillness skill (P16b): reads 0 until it lands, so every slip is as loud as it is. */
export const stillnessOf = (_state: CampaignState): number => 0;

export type GaugeKind = 'capacity' | 'fill' | 'dirt' | 'progress';

/** Everything `resolveSegment` needs besides the run, the plan and the inputs, as plain data. */
export interface ResolveEnv {
  gaugeKind: GaugeKind;
  interaction: InteractionType;
  style: PhysicsStyle;
  /** Her `seal` level: one step tighter per 2 levels. */
  sealLevel: number;
  band: ScentBand;
  /** Beats on which the breath was held while a hold runs with it: the strength drains 25 % less there (`combined.ts`). */
  steady?: ReadonlySet<number>;
  /** A marathon's pace scale (`paceScale`): every beat's change of the gauge, and the streak xp, count this many times (1 = no scale). Applied per beat, before the clamp. */
  scale?: number;
}

const P = TUNING.physics;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Her personal rhythm (0–2): shifts where her openings fall; stable per seed and holder (`fnv1a(<seed>|<unitId>|rhythm)`). The seed is the life salt. */
export function rhythmOffset(state: Pick<CampaignState, 'life'>, unitId: string): number {
  return fnv1a(`${state.life?.salt ?? 0}|${unitId}|rhythm`) % 3;
}

/** How many beats a segment has: a turn of `turnBeats`, or the entry's seconds in real time. */
export function beatsPerSegment(state: Pick<CampaignState, 'settings'>, segmentSeconds: number): number {
  return sceneSettingsOf(state).physicsRealtime ? Math.max(1, Math.ceil((segmentSeconds * 1000) / P.beatMs)) : P.turnBeats;
}

/** The width of her next opening: the lead's (an obsessive one draws it), blended with the other style of the pair. */
function openingWidth(style: PhysicsStyle, rng: Rng, measuring: boolean): number {
  const { leadKey, other } = styleRows(style);
  const lead = leadKey === 'obsessive' ? rng.int(P.obsessiveMs[0], P.obsessiveMs[1]) : P.style[leadKey]!.windowMs;
  const [a, b] = P.blend;
  const width = other === undefined ? lead : lead * a + other.windowMs * b;
  return measuring ? width / 2 : width;
}

/**
 * Draws the plan of the next segment. Her openings (breath, gulp) come every 2–4 beats, the first moved by her personal rhythm; her shifts
 * (weight) every 3–5 beats; what she wants next (tongue work) each beat; her attention every beat. A `cruel` holder gives some openings
 * no cue in turn-based mode, a `playful` one sends false ones, a counting one calls every beat. The commander's endurance changes nothing here.
 */
export function planSegment(state: CampaignState, reg: Registries, run: PhysicsRun, rng: Rng): SegmentPlan {
  const phys = reg.contactPhysics.get(run.physicsId)!;
  const style = physicsStyleOf(state, run.holderId, reg);
  const n = beatsPerSegment(state, Number(phys.segmentSeconds)); // a second physics runs on the same beats: the first one's length
  const lead = leadStyle(style);
  const realtime = sceneSettingsOf(state).physicsRealtime;
  const activity = blockingOf(state.scene, run.holderId).activity;
  const attention = attentionPlan(n, activity !== undefined ? (reg.blockingActivities.get(activity)?.attention as string | undefined) : undefined, style, rng);
  const beats: PlannedBeat[] = attention.map((a) => ({ attention: a }));
  const interactions = [String(phys.interaction), ...(run.second ? [String(reg.contactPhysics.get(run.second.physicsId)?.interaction)] : [])];
  if (interactions.includes('timing')) {
    let pos = run.act === 'pet' ? 0 : ((rhythmOffset(state, run.holderId) + (run.rhythmShift ?? 0)) % 3) + rng.int(0, 1);
    let k = 0;
    while (pos < n) {
      const measuring = lead.key === 'clinical' && ++k % rng.int(P.clinicalEvery[0], P.clinicalEvery[1]) === 0;
      const isFalse = rng.chance(blendedStyle(style, 'falseShare'));
      const silent = !realtime && rng.chance(blendedStyle(style, 'noCueShare'));
      beats[pos] = {
        ...beats[pos]!, opening: { widthMs: openingWidth(style, rng, measuring), ...(isFalse ? { false: true as const } : {}) },
        ...(silent ? {} : { cue: isFalse ? ('window_false' as const) : ('window_open' as const) }),
      };
      pos += run.act === 'pet' ? 1 : rng.int(P.breath.windowEvery[0], P.breath.windowEvery[1]); // a pet's quick rhythm: an opening every beat
    }
  }
  if (interactions.includes('hold')) {
    let pos = rng.int(P.weight.shiftEvery[0] - 1, P.weight.shiftEvery[1] - 1) + (rhythmOffset(state, run.holderId) > 1 ? 1 : 0);
    while (pos < n) {
      beats[pos] = { ...beats[pos]!, shift: rng.int(P.weight.shift[0], P.weight.shift[1]), cue: 'shift' };
      pos += rng.int(P.weight.shiftEvery[0], P.weight.shiftEvery[1]);
    }
  }
  if (interactions.includes('order')) {
    for (let i = 0; i < n; i++) beats[i] = { ...beats[i]!, part: rng.pick(P.tongue.parts) };
  }
  // the signs of her attention: a cue where it changed (she starts watching, she looks away); the player reads her gaze from these alone
  for (let i = 0; i < n; i++) {
    const sign = attentionCue(attention[i - 1], attention[i]!);
    if (sign !== null && beats[i]!.cue === undefined) beats[i] = { ...beats[i]!, cue: sign };
  }
  if (lead.cues === 'count') for (let i = 0; i < n; i++) if (beats[i]!.cue === undefined) beats[i] = { ...beats[i]!, cue: 'count' };
  if (lead.cues === 'sparse') for (let i = 0; i < n; i++) if (beats[i]!.cue !== undefined && rng.chance(0.5)) delete beats[i]!.cue;
  return { beats };
}

/** The seal she is using this segment: the run's, tightened one step per 2 levels of her `seal` skill. */
export function sealNow(run: Pick<PhysicsRun, 'seal'>, sealLevel: number): Seal {
  const at = SEALS.indexOf(run.seal ?? 'tight');
  return SEALS[clamp(at + Math.floor(sealLevel / 2), 0, SEALS.length - 1)]!;
}

/** What `resolveSegment` reads from the state, as data. */
export function resolveEnvOf(state: CampaignState, reg: Registries, run: PhysicsRun): ResolveEnv {
  const phys = reg.contactPhysics.get(run.physicsId)!;
  return {
    gaugeKind: (phys.gauge as { kind: GaugeKind }).kind, interaction: String(phys.interaction) as InteractionType, style: physicsStyleOf(state, run.holderId, reg),
    sealLevel: herSkillOf(state, run.holderId).seal, band: 'noticeable', // Task 26 reads the scent band of the part she presses
  };
}

/** How far from its end the gauge is, 1 untouched to 0 spent (a cleaning or her own task has no end: 1). */
function share(kind: GaugeKind, gauge: number, capacity: number): number {
  return kind === 'capacity' ? gauge / capacity : kind === 'fill' ? 1 - gauge / capacity : 1;
}

/** Whether `kind` is a valid input of the wire format. */
export const validInput = (i: unknown): i is SegmentInput =>
  typeof i === 'object' && i !== null && Number.isInteger((i as SegmentInput).beat) && (i as SegmentInput).beat >= 0 && (INPUT_KINDS as readonly string[]).includes((i as SegmentInput).kind);

/**
 * Resolves one segment: the plan and the inputs decide, nothing is drawn. Inputs on beats that lapsed (a typed message) are dropped.
 * Rules by interaction (plan R12): timing, hold, decision, order, passive, gesture; the numbers are `TUNING.physics`.
 */
export function resolveSegment(run: PhysicsRun, plan: SegmentPlan, inputs: SegmentInput[], env: ResolveEnv): SegmentResult {
  const lapsed = new Set(run.segment.lapsed ?? []);
  const seen = new Set<string>();
  // one input of a kind counts once on a beat: a key pressed five times in a beat is not five breaths (review)
  const live = inputs.filter((i) => {
    if (lapsed.has(i.beat) || i.beat >= plan.beats.length) return false;
    const key = `${i.beat}|${i.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const at = (beat: number, kind: SegmentInput['kind']): SegmentInput[] => live.filter((i) => i.beat === beat && i.kind === kind);
  const rest = env.interaction === 'gesture' ? live.find((i) => i.kind === 'ask_rest') : undefined;
  const run_ = rest ? Math.min(plan.beats.length, rest.beat + 1) : plan.beats.length;
  const cap = run.capacity;
  const cruel = leadStyle(env.style).key === 'cruel';
  const r: SegmentResult = {
    gauge: run.gauge, caught: 0, missed: 0, falseTaken: 0, slips: 0, gasps: 0, reliefs: 0, reliefInputs: [], streak: run.streak, streakBonus: 0, warning: false,
    checked: false, complete: false, degraded: false, askedRest: false, restGranted: false, beatsRun: run_, cues: [], noise: 0,
  };
  const before = share(env.gaugeKind, run.gauge, cap);
  const relief = (beat: number, kind: SegmentInput['kind']): void => {
    r.reliefs += 1;
    r.reliefInputs.push({ beat, kind });
  };
  const seal = sealNow(run, env.sealLevel);
  const evenBefore = (b: number): boolean => ![b - 1, b].some((x) => x >= 0 && at(x, 'hold').length === 0);

  const scale = env.scale ?? 1;
  for (let b = 0; b < run_; b++) {
    const beat = plan.beats[b]!;
    const beatStart = r.gauge;
    if (beat.cue !== undefined) r.cues.push(beat.cue);
    switch (env.interaction) {
      case 'timing': {
        const breathed = at(b, 'breathe').length > 0;
        const opening = beat.opening;
        if (env.gaugeKind === 'capacity') {
          r.gauge += -P.breath.drain + P.breath.seal[seal];
          if (opening && !opening.false) {
            if (breathed) {
              r.gauge += P.breath.caught;
              r.caught += 1;
              r.streak += scale; // a catch of a coarser pace counts as many as the normal pace's catches it stands for
              if (r.streak > P.endurance.streakFrom) r.streakBonus += scale;
            } else {
              r.gauge += cruel ? P.breath.cruelMissed : P.breath.missed;
              r.missed += 1;
              r.streak = 0;
              if (r.gauge / cap <= P.warning / 100) r.gasps += 1;
            }
          } else if (opening?.false && breathed) {
            r.falseTaken += 1;
            r.streak = 0;
          }
          for (const g of at(b, 'gap_breath')) {
            if (seal !== 'leaky') continue;
            r.gauge += P.breath.gapRelief;
            relief(g.beat, 'gap_breath');
          }
        } else if (opening && !opening.false) {
          // keeping up with a flow (a gulp): a caught swallow eases the fill, a missed one spills
          if (breathed) {
            r.gauge -= P.gulpFill.caught;
            r.caught += 1;
          } else {
            r.gauge += P.gulpFill.spill;
            r.missed += 1;
            r.slips += 1;
          }
        }
        break;
      }
      case 'hold': {
        const drain = P.weight.drain * (run.pressure ?? 1) * (env.steady?.has(b) ? STEADY_DRAIN : 1);
        r.gauge -= drain;
        if (at(b, 'hold').length === 0) {
          r.slips += 1;
          r.gauge -= drain;
        }
        if (beat.shift !== undefined && !evenBefore(b)) r.gauge -= beat.shift;
        for (const g of at(b, 'shift_weight')) {
          r.gauge += P.weight.relief;
          relief(g.beat, 'shift_weight');
        }
        break;
      }
      case 'decision': {
        r.gauge += P.saturation.per * P.saturation.bandFactor[env.band];
        for (const g of at(b, 'mouth_breath')) {
          r.gauge -= P.saturation.mouth;
          relief(g.beat, 'mouth_breath');
        }
        break;
      }
      case 'order': {
        for (const g of at(b, 'part')) r.gauge -= g.part !== undefined && g.part === beat.part && (run.dryness ?? 0) < 100 ? P.tongue.right : P.tongue.wrong;
        if (run.dryness !== undefined) r.dryness = Math.min(100, (r.dryness ?? run.dryness) + P.tongue.dryness);
        break;
      }
      case 'passive':
        r.gauge += P.progressPerBeat;
        break;
      case 'gesture':
        r.gauge += P.jaw.per;
        if (r.gauge >= P.jaw.degradeAt) r.degraded = true;
        break;
    }
    // the pace scale is applied to the beat, then clamped, so that a phase gives the same fiction at every pace (review: it was applied after the clamp)
    if (scale !== 1) r.gauge = Math.round((beatStart + (r.gauge - beatStart) * scale) * 100) / 100;
    r.gauge = clamp(r.gauge, 0, env.gaugeKind === 'dirt' || env.gaugeKind === 'progress' ? 100 : cap);
  }
  if (rest) {
    r.askedRest = true;
    r.restGranted = !['cruel', 'vindictive'].includes(leadStyle(env.style).key);
    if (r.restGranted) r.gauge = Math.max(0, r.gauge - P.jawRest);
  }
  if (run.dryness !== undefined && r.dryness === undefined) r.dryness = run.dryness;
  r.checked = env.interaction === 'order' && r.gauge <= P.tongue.checkAt;
  r.complete = env.interaction === 'passive' && r.gauge >= 100;
  const after = share(env.gaugeKind, r.gauge, cap);
  r.warning = before > P.warning / 100 && after <= P.warning / 100;
  r.noise = r.slips + r.gasps > 0 ? P.noiseSlip : 0;
  return r;
}

/** Starts the next segment of a held run: plans it (the only draws of a segment) and sets the body running. */
export function nextSegment(draft: CampaignState, ctx: { registries: Registries; rng: Rng }, runId: string): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!run || run.id !== runId) throw new Error('Stale physics run.');
  if (run.segment.state !== 'held') throw new Error('A segment is running already.');
  if (run.marathon?.waiting) throw new Error('The phase is over: choose how to spend the stretch first.');
  run.segment = { n: run.segment.n + 1, state: 'running', plan: planSegment(draft, ctx.registries, run, ctx.rng) };
  return [{ type: 'physics_segment', runId: run.id, n: run.segment.n, phase: 'start', beats: run.segment.plan!.beats.length }];
}

/**
 * The inputs of a segment that ended: resolves it (no draw), applies the result, pays the xp for a streak, turns a spill into its chained
 * physics, and lets the boundary decide whether the run ends. The body is `held` afterwards: nothing drains until the next segment starts.
 */
export function physicsInput(draft: CampaignState, ctx: { registries: Registries; rng: Rng }, runId: string, segment: number, inputs: unknown): EngineEvent[] {
  const reg = ctx.registries;
  const run = draft.scene?.physics;
  if (!run || run.id !== runId) throw new Error('Stale physics run.');
  if (run.segment.n !== segment) throw new Error('Stale physics segment.');
  if (run.segment.state !== 'running' || !run.segment.plan) throw new Error('No segment is running.');
  if (!Array.isArray(inputs) || !inputs.every(validInput)) throw new Error('physics/segment_end: inputs are { beat, kind } with a known kind');
  const plan = run.segment.plan;
  const scale = run.marathon ? paceScale(draft, reg, run) : 1;
  const envMain = { ...resolveEnvOf(draft, reg, run), scale };
  const second = coreRun(run, 'second');
  let result: SegmentResult;
  let notices = 0;
  let secondBonus = 0;
  let sounds: Array<{ kind: NoiseKind; loudness: number }> = [];
  let secondPart: { gasps: number; slips: number; reliefs: number; interaction: string } | null = null;
  if (!second) result = resolveSegment(run, plan, inputs, envMain);
  else {
    // two physics on the same beats: each input goes to its owner and the pair's conflicts apply (`combined.ts`)
    const envSecond = { ...resolveEnvOf(draft, reg, second), scale };
    const merged = mergeInputs(envMain.interaction, envSecond.interaction, plan, inputs);
    const steady = new Set(merged.steady);
    const m = resolveSegment(run, plan, merged.main, envMain.interaction === 'hold' ? { ...envMain, steady } : envMain);
    const x = resolveSegment(second, plan, merged.second, envSecond.interaction === 'hold' ? { ...envSecond, steady } : envSecond);
    notices = merged.notices;
    secondBonus = x.streakBonus;
    secondPart = { gasps: x.gasps, slips: x.slips, reliefs: x.reliefs, interaction: envSecond.interaction };
    run.second!.gauge = x.gauge;
    run.second!.streak = x.streak;
    result = {
      ...m, caught: m.caught + x.caught, missed: m.missed + x.missed, falseTaken: m.falseTaken + x.falseTaken, slips: m.slips + x.slips, gasps: m.gasps + x.gasps,
      reliefs: m.reliefs + x.reliefs, reliefInputs: [...m.reliefInputs, ...x.reliefInputs], warning: m.warning || x.warning, checked: m.checked || x.checked,
      complete: m.complete || x.complete, degraded: m.degraded || x.degraded, askedRest: m.askedRest || x.askedRest,
    };
  }
  const lapsed = run.segment.lapsed?.length ?? 0;
  const physicsId = run.physicsId;
  const events: EngineEvent[] = [];
  // a relief input is a cheat: she may catch it, by her attention on that beat and her `reading` skill (one draw per relief; none without one)
  const reading = herSkillOf(draft, run.holderId).reading;
  for (const rel of result.reliefInputs) {
    const attention = run.segment.plan.beats[rel.beat]?.attention ?? 'busy';
    events.push({ type: 'physics_cheat', runId, holderId: run.holderId, kind: rel.kind, beat: rel.beat });
    if (cheatRoll(ctx.rng, attention, reading)) {
      result.slips += 2; // caught: a double slip
      events.push({ type: 'physics_caught', runId, holderId: run.holderId, kind: rel.kind, beat: rel.beat });
    }
  }
  // a mouth breath in an opening is noticed by rule (0.6), whatever her attention
  for (let i = 0; i < notices; i++) {
    events.push({ type: 'physics_cheat', runId, holderId: run.holderId, kind: 'mouth_breath', beat: -1 });
    if (ctx.rng.chance(TUNING.physics.saturation.noticed)) {
      result.slips += 2;
      events.push({ type: 'physics_caught', runId, holderId: run.holderId, kind: 'mouth_breath', beat: -1 });
    }
  }
  // every slip is a sound, by the physics it came from (the extra slips of a catch are the first one's)
  const mainPart = { gasps: result.gasps - (secondPart?.gasps ?? 0), slips: result.slips - (secondPart?.slips ?? 0), reliefs: result.reliefs - (secondPart?.reliefs ?? 0) };
  sounds = segmentNoise(mainPart, envMain.interaction, stillnessOf(draft));
  if (secondPart) {
    for (const x of segmentNoise(secondPart, secondPart.interaction, stillnessOf(draft))) {
      const have = sounds.find((y) => y.kind === x.kind);
      if (have) have.loudness += x.loudness;
      else sounds.push(x);
    }
  }
  result.noise = sounds.reduce((n, x) => n + x.loudness, 0);
  for (const x of sounds) events.push({ type: 'physics_noise', runId, holderId: run.holderId, kind: x.kind, loudness: x.loudness });
  run.gauge = result.gauge;
  run.streak = result.streak;
  if (result.dryness !== undefined) run.dryness = result.dryness;
  run.last = {
    caught: result.caught, missed: result.missed, falseTaken: result.falseTaken, slips: result.slips, gasps: result.gasps, reliefs: result.reliefs, noise: result.noise, cues: result.cues,
    ...(result.warning ? { warning: true } : {}),
  };
  run.segment = { n: run.segment.n, state: 'held' };
  events.unshift({ type: 'physics_segment', runId, n: segment, phase: 'end', physicsId, caught: result.caught, missed: result.missed, slips: result.slips, reliefs: result.reliefs, lapsed, warning: result.warning });
  if (result.streakBonus > 0) events.push(addEnduranceXp(draft, physicsId, Math.round(TUNING.physics.endurance.streak * result.streakBonus * 100) / 100));
  if (secondBonus > 0 && run.second) events.push(addEnduranceXp(draft, run.second.physicsId, TUNING.physics.endurance.streak * secondBonus));
  if (result.slips > 0) {
    events.push({ type: 'physics_slip', runId, kind: 'slip', count: result.slips, holderId: run.holderId });
    const chained = chainRun(draft, reg, run);
    if (chained.length > 0) events.push(...chained);
    else run.extend += TUNING.physics.slipExtend;
  }
  const boundary = decideBoundary(draft, ctx, run, result);
  if (boundary.move !== undefined) (events[0] as { move?: string }).move = boundary.move;
  events.push(...boundary.events);
  if (run.marathon && draft.scene?.physics === run) events.push(...phaseBoundary(draft, reg, run));
  events.push(...momentPass(draft, ctx, 'segment')); // a warning or a slip of this segment may bring a moment up (a no-op, and no draw, unless one is live)
  return events;
}

/** A message was typed in a turn-based scene: its length uses up beats (`ceil(chars / 40)`) from the beat the panel says, whose inputs lapse. */
export function typedBeats(draft: CampaignState, chars: number, from: number): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!run || run.segment.state !== 'running' || !run.segment.plan) return [];
  if (draft.settings.physicsRealtime === true) return []; // real time: the keystroke rule of the panel already lapses what needs steady hands
  const n = Math.max(0, Math.ceil(chars / TUNING.physics.typing.charsPerBeat));
  const total = run.segment.plan.beats.length;
  const set = new Set(run.segment.lapsed ?? []);
  for (let b = Math.max(0, from); b < Math.min(total, Math.max(0, from) + n); b++) set.add(b);
  run.segment.lapsed = [...set].sort((a, b) => a - b);
  return [{ type: 'physics_segment', runId: run.id, n: run.segment.n, phase: 'typed', lapsed: run.segment.lapsed.length }];
}

/** A marathon after a segment: the phase may be over. The last one ends the hold (released); another waits for the player's strategy. */
function phaseBoundary(draft: CampaignState, reg: Registries, run: PhysicsRun): EngineEvent[] {
  const m = run.marathon!;
  m.segmentsDone += 1;
  if (m.segmentsDone < phaseSegments(draft, reg, run)) return [];
  if (m.phase >= m.phases) {
    m.clockMin += hoursPerPhase(m) * 60;
    return [{ type: 'marathon_phase', runId: run.id, phase: m.phase, over: true, last: true }, ...creditHold(draft, reg, run), ...stopPhysics(draft, reg, 'released')];
  }
  m.waiting = true;
  return [{ type: 'marathon_phase', runId: run.id, phase: m.phase, over: true, clock: clockText(m.clockMin) }];
}

/**
 * `physics/skip`: the player's strategy for the stretch between two phases (endure, spare strength, cheat, ask for a rest). One draw at most,
 * a summary in words, then the next phase starts weaker: attrition takes capacity, and the stretch decides the gauge it starts with.
 */
export function marathonSkip(draft: CampaignState, ctx: { registries: Registries; rng: Rng }, strategy: unknown): EngineEvent[] {
  const reg = ctx.registries;
  const run = draft.scene?.physics;
  const m = run?.marathon;
  if (!run || !m) throw new Error('physics/skip: no marathon is running');
  if (!m.waiting) throw new Error('physics/skip: the phase is not over');
  if (typeof strategy !== 'string' || !(STRATEGIES as readonly string[]).includes(strategy)) throw new Error('physics/skip: strategy is endure, spare, cheat or rest');
  const k = resolveSkip(draft, reg, run, strategy as Strategy, ctx.rng);
  const events: EngineEvent[] = [];
  if (k.slip) {
    events.push({ type: 'physics_slip', runId: run.id, kind: 'skip', count: 1, holderId: run.holderId });
    run.extend += TUNING.physics.slipExtend;
  }
  if (k.caught) events.push({ type: 'physics_caught', runId: run.id, holderId: run.holderId, kind: 'cheat', beat: -1 });
  const hpp = hoursPerPhase(m);
  const loss = attrition(hpp, commanderLevel(draft, run.physicsId));
  const base = run.baseCapacity ?? run.capacity;
  const next = (cap: number, gaugeKind: string, gauge: number): { capacity: number; gauge: number } => {
    const capacity = Math.max(Math.round(base * 0.2), cap - loss);
    if (gaugeKind === 'capacity') return { capacity, gauge: Math.min(capacity, Math.max(1, capacity + k.delta)) };
    if (gaugeKind === 'fill') return { capacity, gauge: Math.min(capacity - 1, Math.max(0, -Math.min(0, k.delta))) };
    return { capacity, gauge };
  };
  const kindOf = (id: string): string => String((reg.contactPhysics.get(id)?.gauge as { kind: string }).kind);
  Object.assign(run, next(run.capacity, kindOf(run.physicsId), run.gauge));
  if (run.second) Object.assign(run.second, next(run.second.capacity, kindOf(run.second.physicsId), run.second.gauge));
  m.clockMin += hpp * 60;
  m.phase += 1;
  m.segmentsDone = 0;
  m.waiting = false;
  m.summary = k.summary;
  if (k.spare !== undefined) m.spare = k.spare;
  else delete m.spare;
  events.push({ type: 'marathon_phase', runId: run.id, phase: m.phase, phases: m.hours === 'unknown' ? undefined : m.phases, strategy, held: k.held, summary: k.summary, clock: clockText(m.clockMin) });
  return events;
}

const commanderLevel = (state: CampaignState, physicsId: string): number => state.commander.endurance?.[physicsId]?.level ?? 0;
