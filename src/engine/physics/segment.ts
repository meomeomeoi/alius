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
import { decideBoundary } from './boundary';
import { chainRun } from './run';
import { addEnduranceXp, herSkillOf } from './skill';
import {
  INPUT_KINDS, type Attention, type PhysicsRun, type PhysicsStyle, type PlannedBeat, type ScentBand, type SegmentInput, type SegmentPlan, type SegmentResult,
} from './state';
import { blendedStyle, leadStyle, physicsStyleOf, styleRows } from './style';

export type GaugeKind = 'capacity' | 'fill' | 'dirt' | 'progress';

/** Everything `resolveSegment` needs besides the run, the plan and the inputs, as plain data. */
export interface ResolveEnv {
  gaugeKind: GaugeKind;
  interaction: InteractionType;
  style: PhysicsStyle;
  /** Her `seal` level: one step tighter per 2 levels. */
  sealLevel: number;
  band: ScentBand;
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

function attentionOf(state: CampaignState, reg: Registries, run: PhysicsRun, style: PhysicsStyle, rng: Rng): Attention {
  if (leadStyle(style).key === 'clinical') return 'watching'; // always watching (AUTHOR TO TUNE)
  const activity = blockingOf(state.scene, run.holderId).activity;
  const attention = (activity !== undefined ? (reg.blockingActivities.get(activity)?.attention as string | undefined) : undefined) ?? 'on_commander';
  const [w, g] = P.gaze.attention[attention] ?? P.gaze.attention.on_commander!;
  const x = rng.float();
  return x < w! ? 'watching' : x < w! + g! ? 'glancing' : 'busy';
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
  const style = physicsStyleOf(state, run.holderId);
  const n = beatsPerSegment(state, Number(phys.segmentSeconds));
  const lead = leadStyle(style);
  const realtime = sceneSettingsOf(state).physicsRealtime;
  const beats: PlannedBeat[] = Array.from({ length: n }, () => ({ attention: attentionOf(state, reg, run, style, rng) }));
  const interaction = String(phys.interaction);
  if (interaction === 'timing') {
    let pos = rhythmOffset(state, run.holderId) + rng.int(0, 1);
    let k = 0;
    while (pos < n) {
      const measuring = lead.key === 'clinical' && ++k % rng.int(P.clinicalEvery[0], P.clinicalEvery[1]) === 0;
      const isFalse = rng.chance(blendedStyle(style, 'falseShare'));
      const silent = !realtime && rng.chance(blendedStyle(style, 'noCueShare'));
      beats[pos] = {
        ...beats[pos]!, opening: { widthMs: openingWidth(style, rng, measuring), ...(isFalse ? { false: true as const } : {}) },
        ...(silent ? {} : { cue: isFalse ? ('window_false' as const) : ('window_open' as const) }),
      };
      pos += rng.int(P.breath.windowEvery[0], P.breath.windowEvery[1]);
    }
  } else if (interaction === 'hold') {
    let pos = rng.int(P.weight.shiftEvery[0] - 1, P.weight.shiftEvery[1] - 1) + (rhythmOffset(state, run.holderId) > 1 ? 1 : 0);
    while (pos < n) {
      beats[pos] = { ...beats[pos]!, shift: rng.int(P.weight.shift[0], P.weight.shift[1]), cue: 'shift' };
      pos += rng.int(P.weight.shiftEvery[0], P.weight.shiftEvery[1]);
    }
  } else if (interaction === 'order') {
    for (let i = 0; i < n; i++) beats[i] = { ...beats[i]!, part: rng.pick(P.tongue.parts) };
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
    gaugeKind: (phys.gauge as { kind: GaugeKind }).kind, interaction: String(phys.interaction) as InteractionType, style: physicsStyleOf(state, run.holderId),
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
  const live = inputs.filter((i) => !lapsed.has(i.beat) && i.beat < plan.beats.length);
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

  for (let b = 0; b < run_; b++) {
    const beat = plan.beats[b]!;
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
              r.streak += 1;
              if (r.streak > P.endurance.streakFrom) r.streakBonus += 1;
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
        const drain = P.weight.drain * (run.pressure ?? 1);
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
        for (const g of at(b, 'part')) r.gauge -= g.part !== undefined && g.part === beat.part ? P.tongue.right : P.tongue.wrong;
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
    r.gauge = clamp(r.gauge, 0, env.gaugeKind === 'dirt' || env.gaugeKind === 'progress' ? 100 : cap);
  }
  if (rest) {
    r.askedRest = true;
    r.restGranted = !['cruel', 'vindictive'].includes(leadStyle(env.style).key);
    if (r.restGranted) r.gauge = Math.max(0, r.gauge - P.jawRest);
  }
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
  const result = resolveSegment(run, run.segment.plan, inputs, resolveEnvOf(draft, reg, run));
  const lapsed = run.segment.lapsed?.length ?? 0;
  const physicsId = run.physicsId;
  run.gauge = result.gauge;
  run.streak = result.streak;
  run.last = {
    caught: result.caught, missed: result.missed, falseTaken: result.falseTaken, slips: result.slips, gasps: result.gasps, reliefs: result.reliefs, noise: result.noise, cues: result.cues,
    ...(result.warning ? { warning: true } : {}),
  };
  run.segment = { n: run.segment.n, state: 'held' };
  const events: EngineEvent[] = [{ type: 'physics_segment', runId, n: segment, phase: 'end', physicsId, caught: result.caught, missed: result.missed, slips: result.slips, reliefs: result.reliefs, lapsed, warning: result.warning }];
  if (result.streakBonus > 0) events.push(addEnduranceXp(draft, physicsId, TUNING.physics.endurance.streak * result.streakBonus));
  if (result.slips > 0) {
    events.push({ type: 'physics_slip', runId, kind: 'slip', count: result.slips, holderId: run.holderId });
    const chained = chainRun(draft, reg, run);
    if (chained.length > 0) events.push(...chained);
    else run.extend += TUNING.physics.slipExtend;
  }
  events.push(...decideBoundary(draft, ctx, run, result));
  return events;
}

/** A message was typed in a turn-based scene: its length uses up beats (`ceil(chars / 40)`) from the beat the panel says, whose inputs lapse. */
export function typedBeats(draft: CampaignState, chars: number, from: number): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!run || run.segment.state !== 'running' || !run.segment.plan) return [];
  const n = Math.max(0, Math.ceil(chars / TUNING.physics.typing.charsPerBeat));
  const total = run.segment.plan.beats.length;
  const set = new Set(run.segment.lapsed ?? []);
  for (let b = Math.max(0, from); b < Math.min(total, Math.max(0, from) + n); b++) set.add(b);
  run.segment.lapsed = [...set].sort((a, b) => a - b);
  return [{ type: 'physics_segment', runId: run.id, n: run.segment.n, phase: 'typed', lapsed: run.segment.lapsed.length }];
}
