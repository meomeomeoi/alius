/**
 * P15a: planning and resolving one segment of a contact physics (plan R12). `planSegment` draws everything random about a segment ONCE, at its
 * start (the openings of her rhythm, her shifts, what she wants next, her attention, the cues), and the plan is stored in the run: the UI plays
 * it and a reading never shows it. `resolveSegment` is pure: the plan and the inputs decide, no rng, so a slow model and a fast one give the
 * same outcome (the latency rule).
 */
import type { Registries } from '../../content/types';
import { bend } from '../bend';
import { blockingOf, contactTargetOf } from '../blocking';
import { SEALS, type CueKind, type InteractionType, type Seal } from '../blocking/types';
import { fnv1a } from '../hub';
import { LONG_HOLD, sceneSettingsOf } from '../moments/settings';
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
import { addEnduranceXp, commanderSkill, herSkillOf } from './skill';
import {
  GAUGE_FULL, INPUT_KINDS, type Attention, type JawOrder, type PhysicsRun, type PhysicsStyle, type PlannedBeat, type ScentBand, type SegmentInput, type SegmentPlan, type SegmentResult,
} from './state';
import { blendedStyle, leadStyle, physicsMannerOf, physicsStyleOf, rhythmKnownOf, segmentSecondsOf, stillnessOf, styleRows } from './style';

export { segmentSecondsOf };
import { scentBand } from './scent';
import { isShoeRun } from './footwear';
import { headCapacity, scentToleranceOf } from './stimuli';
import { ATT_BY_STEP, frameOf, presenceOf, PRESENCE_WATCH } from './presence';
import { floorStart, flowEnded, gulpRowOf, isGulpPhysics, isGulpRun, layFlow } from './gulp';

/** The commander's stillness (P16b): a reader of `style.ts`, 0 until something is learnt, so every slip is as loud as it is. */
export { stillnessOf };

export type GaugeKind = 'capacity' | 'fill' | 'dirt' | 'progress';

/** Everything `resolveSegment` needs besides the run, the plan and the inputs, as plain data. */
export interface ResolveEnv {
  gaugeKind: GaugeKind;
  interaction: InteractionType;
  style: PhysicsStyle;
  /** Her `seal` level: one step tighter per 2 levels. */
  sealLevel: number;
  band: ScentBand;
  /** P10e-e R18: the words scent's head holds (`headCapacity`): one `inhale` or blown word is `capacity / head` of the gauge. Absent: the starting tolerance's. */
  head?: number;
  /** Beats on which the breath was held while a hold runs with it: the strength drains 25 % less there (`combined.ts`). */
  steady?: ReadonlySet<number>;
  /** A marathon's pace scale (`paceScale`): every beat's change of the gauge, and the streak xp, count this many times (1 = no scale). Applied per beat, before the clamp. */
  scale?: number;
  /** P15b: her `warmth` (−2 … +2; absent at 0 or without a manner): +2 grants the jaw's rest whatever her style, −2 refuses it. */
  warmth?: number;
  /** P10e-e 24b: the long hold's drain factor of a weight inside her frame (`LONG_HOLD[longHoldStrain]`); absent outside a frame. */
  longHold?: number;
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

/** P16b: each level of her rhythm the commander knows widens an opening by `craft.rhythm.widenPerLevel`; at 0 the width is untouched. */
const widened = (width: number, known: number): number => (known === 0 ? width : width * (1 + TUNING.craft.rhythm.widenPerLevel * known));

/** The width of her next opening: the lead's (an obsessive one draws it), blended with the other style of the pair. */
function openingWidth(style: PhysicsStyle, rng: Rng, measuring: boolean, tempo = 0): number {
  const { leadKey, other } = styleRows(style);
  const lead = leadKey === 'obsessive' ? rng.int(P.obsessiveMs[0], P.obsessiveMs[1]) : P.style[leadKey]!.windowMs;
  const [a, b] = P.blend;
  const width = other === undefined ? lead : lead * a + other.windowMs * b;
  // P15b: her tempo (+ = quicker = a narrower opening); the draw above is made either way
  return bend(measuring ? width / 2 : width, tempo, { scale: -TUNING.manner.scale });
}

/**
 * Draws the plan of the next segment. Her openings (breath, gulp) come every 2–4 beats, the first moved by her personal rhythm; her shifts
 * (weight) every 3–5 beats; what she wants next (tongue work) each beat; her attention every beat. A `cruel` holder gives some openings
 * no cue in turn-based mode, a `playful` one sends false ones, a counting one calls every beat. The commander's endurance changes nothing here.
 */
export function planSegment(state: CampaignState, reg: Registries, run: PhysicsRun, rng: Rng): SegmentPlan {
  const phys = reg.contactPhysics.get(run.physicsId)!;
  const style = physicsStyleOf(state, run.holderId, reg);
  const n = beatsPerSegment(state, segmentSecondsOf(state, reg, run, Number(phys.segmentSeconds))); // a second physics runs on the same beats: the first one's length
  const lead = leadStyle(style);
  const manner = physicsMannerOf(state, run.holderId, reg); // P15b: her tempo, order and voice (null: every axis at 0, and every number below is the style's)
  const tempo = manner?.tempo ?? 0, order = manner?.order ?? 0, voice = manner?.voice ?? 0;
  const realtime = sceneSettingsOf(state).physicsRealtime;
  const activity = blockingOf(state.scene, run.holderId).activity;
  const word = activity !== undefined ? (reg.blockingActivities.get(activity)?.attention as string | undefined) : undefined;
  // R25: in her frame her attention mixes her activity's word with her presence (her_activity.html `attentionDraw`: 0.4 / 0.6, her style's watch); one draw a beat, as before
  const attention = attentionPlan(n, word, style, rng, run.sourceKind === 'activity' ? frameWeights(state, reg, run, word, lead.key) : undefined);
  const beats: PlannedBeat[] = attention.map((a) => ({ attention: a }));
  const interactions = [String(phys.interaction), ...(run.second ? [String(reg.contactPhysics.get(run.second.physicsId)?.interaction)] : [])];
  if (interactions.includes('timing')) {
    const known = rhythmKnownOf(state, run.holderId); // P16b: the levels of her rhythm the commander knows (0 until learnt)
    let pos = run.act === 'pet' ? 0 : ((rhythmOffset(state, run.holderId) + (run.rhythmShift ?? 0)) % 3) + rng.int(0, 1);
    let k = 0;
    while (pos < n) {
      const measuring = lead.key === 'clinical' && ++k % rng.int(P.clinicalEvery[0], P.clinicalEvery[1]) === 0;
      const isFalse = rng.chance(blendedStyle(style, 'falseShare'));
      // R4: in real time a holder whose cues are `none` gives her openings no cue (decided, not drawn: no new draw); turn-based, `noCueShare` as before
      const silent = (realtime && lead.cues === 'none') || (!realtime && rng.chance(blendedStyle(style, 'noCueShare')));
      beats[pos] = {
        ...beats[pos]!, opening: { widthMs: widened(openingWidth(style, rng, measuring, tempo), known), ...(isFalse ? { false: true as const } : {}) },
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
    if (sign !== null && beats[i]!.cue === undefined && !(realtime && lead.cues === 'none' && beats[i]!.opening)) beats[i] = { ...beats[i]!, cue: sign }; // R4: her silent openings stay silent
  }
  if (order === 0) {
    if (lead.cues === 'count') for (let i = 0; i < n; i++) if (beats[i]!.cue === undefined) beats[i] = { ...beats[i]!, cue: 'count' };
  } else {
    // P15b: her order moves the share of free beats that carry a counting cue (a counting holder's 1 down, any other's 0 up); by hash, so no draw is added; a silent holder's openings stay silent
    const share = clamp((lead.cues === 'count' ? 1 : 0) + order * TUNING.manner.counted, 0, 1);
    for (let i = 0; i < n; i++) {
      if (beats[i]!.cue !== undefined || (realtime && lead.cues === 'none' && beats[i]!.opening)) continue;
      if (share >= 1 || (share > 0 && mannerUnit(state, run, i, 'count') < share)) beats[i] = { ...beats[i]!, cue: 'count' };
    }
  }
  if (lead.cues === 'sparse') {
    // P15b: her voice moves what share of the cues she keeps (half at 0); the draw is made for every cue-bearing beat as before, only its threshold moves
    // Below 0 only her chatter is thinned (as for any other holder): what the player needs (an opening, a shift, her orders) keeps the sparse style's own half.
    const drop = voice === 0 ? 0.5 : 1 - Math.min(1, 0.5 * voiceFactor(voice));
    for (let i = 0; i < n; i++) {
      const cue = beats[i]!.cue;
      if (cue !== undefined && rng.chance(voice < 0 && !CHATTER.has(cue) ? 0.5 : drop)) delete beats[i]!.cue;
    }
  } else if (voice !== 0) voiceLines(beats, state, run, voice, realtime && lead.cues === 'none');
  // R22: her moves in the jaw, in real time only (the turn-based card is unchanged); by hash after every draw above, so no draw is added or moved
  if (realtime && interactions.includes('gesture') && jawSourceOf(run, reg) !== null) planJaw(beats, state, run, jawRowOf(lead), tempo, voice);
  // R32: her flow in gulp, in real time only (the turn-based card is unchanged); by hash after every draw above, so no draw is added or moved
  if (realtime && isGulpPhysics(phys)) layFlow(beats, state, run, gulpRowOf(lead.key, manner), n);
  return { beats };
}

/** P15b: the share of her cue lines by her `voice` (`TUNING.manner.voiceLines`). */
const voiceFactor = (voice: number): number => TUNING.manner.voiceLines[String(Math.max(-2, Math.min(2, Math.trunc(voice))))] ?? 1;

/** P15b: a stable value 0 … 1 of this run's segment and beat (`fnv1a(<salt>|<runId>|<segment>|<beat>|manner|<key>)`), never an rng draw. */
function mannerUnit(state: Pick<CampaignState, 'life'>, run: Pick<PhysicsRun, 'id' | 'segment'>, beat: number, key: string): number {
  return (fnv1a(`${state.life?.salt ?? 0}|${run.id}|${run.segment.n}|${beat}|manner|${key}`) % 10000) / 10000;
}

/** The cue her attention gives a beat she keeps on watching, or looks away from (the signs of a change are laid already). */
const ATTENTION_LINE: Record<string, CueKind | undefined> = { watching: 'watch', busy: 'look_away' };
/** The cues a `voice` below 0 may drop: her chatter, never what the player needs to play (an opening, a shift, her orders). */
const CHATTER: ReadonlySet<CueKind> = new Set(['count', 'watch', 'look_away']);

/**
 * P15b: her `voice` over the cue lines of a segment (not a sparse holder's, whose threshold already carries it). Below 0 her chatter is thinned
 * (half at -1, all but what the player needs at -2); above 0 she gives more, ×1.5 at +1 and ×2 at +2 of the beats that had one: on a beat with no
 * line, whose attention she comments on, never within `lineGapMs` of her last line (a line a beat at most). By hash: no draw is added or moved.
 */
function voiceLines(beats: PlannedBeat[], state: CampaignState, run: PhysicsRun, voice: number, silent: boolean): void {
  const factor = voiceFactor(voice);
  if (voice < 0) {
    for (let i = 0; i < beats.length; i++) {
      const cue = beats[i]!.cue;
      if (cue !== undefined && CHATTER.has(cue) && (factor === 0 || mannerUnit(state, run, i, 'voice') >= factor)) delete beats[i]!.cue;
    }
    return;
  }
  const had = beats.filter((b) => b.cue !== undefined).length;
  const gap = Math.max(1, Math.ceil(TUNING.manner.lineGapMs / P.beatMs));
  const p = Math.min(1, ((factor - 1) * had) / Math.max(1, beats.length - had));
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i]!;
    const line = ATTENTION_LINE[b.attention];
    if (b.cue !== undefined || line === undefined || (silent && b.opening)) continue;
    if (beats.slice(Math.max(0, i - gap), i).some((x) => x.cue !== undefined)) continue;
    if (mannerUnit(state, run, i, 'line') < p) beats[i] = { ...b, cue: line };
  }
}

/** R25: her attention's weights `[watching, glancing]` in her frame: `0.4 × the activity's + 0.6 × her presence's`, her style's watch bias on watching; asleep, busy. */
function frameWeights(state: CampaignState, reg: Registries, run: PhysicsRun, word: string | undefined, key: string): [number, number] {
  if (frameOf(reg.blockingActivities.get(run.sourceId))?.sleep) return [0, 0];
  const [w0, g0] = P.gaze.attention[word ?? 'on_commander'] ?? P.gaze.attention.on_commander!;
  const a = [w0!, g0!, Math.max(0, 1 - w0! - g0!)];
  const b = ATT_BY_STEP[presenceOf(state, reg, run, run.marathon?.phase ?? 1)];
  const p = [0, 1, 2].map((i) => 0.4 * a[i]! + 0.6 * b[i]!);
  p[0] = clamp(p[0]! + (PRESENCE_WATCH[key as keyof typeof PRESENCE_WATCH] ?? 0), 0, 1);
  const sum = p[0]! + p[1]! + p[2]!;
  return [p[0]! / sum, p[1]! / sum];
}

/**
 * P10e-e R22: what holds the mouth open in a jaw run, read by field: an item worn in the mouth is the ring (`ring_gag`), a contact on her toes
 * is her toes (`sole_to_mouth`); anything else (`oral_service`: P17b's) is neither, and gets no moves of hers. The jaw instrument reads the same.
 */
export function jawSourceOf(run: Pick<PhysicsRun, 'sourceKind' | 'sourceId'>, reg: Registries): 'sole_to_mouth' | 'ring_gag' | null {
  if (run.sourceKind === 'item') return ((reg.blockingItems.get(run.sourceId)?.slots as string[] | undefined) ?? []).includes('mouth') ? 'ring_gag' : null;
  const target = (reg.blockingContacts.get(run.sourceId)?.target as string[] | undefined) ?? [];
  return target.includes('toes') ? 'sole_to_mouth' : null;
}
/** jaw.html's styles by the cues of a style it has no row of (Ruling R); a silent or sparse one is neutral's, so only cruel and vindictive refuse a rest. */
const JAW_ROW_BY_CUES: Readonly<Record<string, string>> = { count: 'ritual', announce: 'ritual', false: 'playful', shift: 'clinical' };
/** The jaw.html row of a holder's lead style: her own when the prototype has it, else by her cues, else neutral (the engine and the instrument agree). */
export function jawRowOf(lead: { key: string; cues: string }): string {
  return lead.key !== 'other' && lead.key in P.jawOrders.styles ? lead.key : JAW_ROW_BY_CUES[lead.cues] ?? 'neutral';
}

/**
 * P10e-e R22 (R3): her moves in a jaw segment, by hash (`fnv1a(<salt>|<runId>|<segment>|<beat>|jaw|<key>)`), never by rng. As jaw.html's
 * `herMove`: the first `firstMs` in, the next after her style's `every` seconds plus the order's own length. Her toes (a contact) push
 * `deeper`, `pull_back`, ask her to `suck` or want it `wider`; the ring (an item) asks her question or wants it `wider`. An order's cue is its
 * own kind and replaces whatever cue the beat had; a question has none.
 */
function planJaw(beats: PlannedBeat[], state: CampaignState, run: PhysicsRun, row: string, tempo = 0, voice = 0): void {
  const J = P.jawOrders;
  const st = J.styles[row] ?? J.styles.other!;
  const h = (b: number, key: string): number => fnv1a(`${state.life?.salt ?? 0}|${run.id}|${run.segment.n}|${b}|jaw|${key}`);
  const unit = (b: number, key: string): number => (h(b, key) % 10000) / 10000;
  const span = (b: number, key: string, [lo, hi]: readonly [number, number]): number => lo + (h(b, key) % (hi - lo + 1));
  // P15b: her tempo (+ = quicker = a shorter spacing) and her voice (the share of her moves that are questions); at 0 the style's own numbers
  const every: [number, number] = [bend(st.every[0] * 1000, tempo, { scale: -TUNING.manner.scale }), bend(st.every[1] * 1000, tempo, { scale: -TUNING.manner.scale })];
  const ask = voice === 0 ? st.ask : Math.min(1, st.ask * voiceFactor(voice));
  let t = J.firstMs;
  for (let b = Math.floor(t / P.beatMs); b < beats.length; b = Math.floor(t / P.beatMs)) {
    const r = unit(b, 'move');
    let order: JawOrder | undefined;
    if (run.sourceKind === 'item') {
      if (r < 0.4 + ask * 0.5) beats[b] = { ...beats[b]!, ask: true };
      else order = 'wider';
    } else order = r < J.toes[0] ? 'deeper' : r < J.toes[1] ? 'pull_back' : r < J.toes[2] ? 'suck' : 'wider';
    let ms = 0;
    if (order !== undefined) {
      ms = order === 'suck' ? span(b, 'len', J.suckMs) : order === 'wider' ? span(b, 'len', J.wideMs) : 0;
      beats[b] = { ...beats[b]!, order, cue: order, ...(ms > 0 ? { orderMs: ms } : {}) };
    }
    t += span(b, 'every', every) + ms;
  }
}

/** The seal she is using this segment: the run's, tightened one step per 2 levels of her `seal` skill. */
export function sealNow(run: Pick<PhysicsRun, 'seal'>, sealLevel: number): Seal {
  const at = SEALS.indexOf(run.seal ?? 'tight');
  return SEALS[clamp(at + Math.floor(sealLevel / 2), 0, SEALS.length - 1)]!;
}

/** What `resolveSegment` reads from the state, as data. */
export function resolveEnvOf(state: CampaignState, reg: Registries, run: PhysicsRun): ResolveEnv {
  const phys = reg.contactPhysics.get(run.physicsId)!;
  const warmth = physicsMannerOf(state, run.holderId, reg)?.warmth ?? 0;
  return {
    gaugeKind: (phys.gauge as { kind: GaugeKind }).kind, interaction: String(phys.interaction) as InteractionType, style: physicsStyleOf(state, run.holderId, reg),
    sealLevel: herSkillOf(state, run.holderId).seal,
    // R19: her own band, of the part she presses (a contact's target; an item has none: the rest of her)
    band: scentBand(state, reg, run.holderId, run.sourceKind === 'contact' ? contactTargetOf(state.scene, reg, run.sourceId) ?? run.targetId : undefined),
    head: headCapacity(scentToleranceOf(state, reg, run.holderId)),
    ...(run.sourceKind === 'activity' ? { longHold: LONG_HOLD[sceneSettingsOf(state).longHoldStrain] } : {}),
    ...(warmth !== 0 ? { warmth } : {}),
  };
}

/** How far from its end the gauge is, 1 untouched to 0 spent (a cleaning or her own task has no end: 1). */
function share(kind: GaugeKind, gauge: number, capacity: number): number {
  return kind === 'capacity' ? gauge / capacity : kind === 'fill' ? 1 - gauge / capacity : 1;
}

/** Whether `kind` is a valid input of the wire format. */
export const validInput = (i: unknown): i is SegmentInput =>
  typeof i === 'object' && i !== null && Number.isInteger((i as SegmentInput).beat) && (i as SegmentInput).beat >= 0 && (INPUT_KINDS as readonly string[]).includes((i as SegmentInput).kind)
  && ((i as SegmentInput).amount === undefined || (typeof (i as SegmentInput).amount === 'number' && Number.isFinite((i as SegmentInput).amount) && (i as SegmentInput).amount! >= 0));

/** P10e-e R15: how many beats her openings move later when she notices a strain, by her lead style. */
export const overDelayOf = (style: string): number => P.breath.overDelay[style] ?? P.breath.overDelay.other!;

/**
 * P10e-e R15: the plan's openings with the delays of noticed strains applied (a `strain` of amount ≥ 1 on beat b moves every opening after b
 * later by her style's `overDelay` beats, as the prototype's queue of windows moves; one moved past the segment is gone). Without a noticed
 * strain these are the plan's openings as they are. Pure; the engine and the instrument both read it.
 */
export function effectiveOpenings(plan: SegmentPlan, inputs: readonly SegmentInput[], style: string): Array<{ beat: number; widthMs: number; false?: true }> {
  const list = plan.beats.flatMap((b, i) => (b.opening ? [{ beat: i, widthMs: b.opening.widthMs, ...(b.opening.false ? { false: true as const } : {}) }] : []));
  const delay = overDelayOf(style);
  if (delay === 0) return list;
  const noticed = inputs.filter((i) => i.kind === 'strain' && (i.amount ?? 0) >= 1).map((i) => i.beat).sort((a, b) => a - b);
  for (const at of noticed) for (const o of list) if (o.beat > at) o.beat += delay;
  return list.filter((o) => o.beat < plan.beats.length);
}

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
    const key = `${i.beat}|${i.kind}${i.kind === 'bite' && i.part === 'teeth' ? '|teeth' : ''}${(i.kind === 'ask_rest' || i.kind === 'spill') && i.part !== undefined ? `|${i.part}` : ''}`; // a touch of the teeth and the beat's cost are two inputs (a cough's spill and an overflow's too)
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const at = (beat: number, kind: SegmentInput['kind']): SegmentInput[] => live.filter((i) => i.beat === beat && i.kind === kind);
  const rest = env.interaction === 'gesture' ? live.find((i) => i.kind === 'ask_rest') : undefined;
  // R21: the jaw's cost of the opening: a segment the instrument reported (any bite but the teeth) costs per × amount a beat instead of per
  const bitten = env.interaction === 'gesture' && live.some((i) => i.kind === 'bite' && i.part !== 'teeth');
  // Ruling V: a rest in an instrument segment does not cut it short (the instrument charges nothing over the rest itself); turn-based, as before
  const run_ = rest && !bitten ? Math.min(plan.beats.length, rest.beat + 1) : plan.beats.length;
  // P15b: her warmth decides over the style at ±2 (+2 grants, −2 refuses); otherwise cruel and vindictive refuse
  const restGranted = rest !== undefined && ((env.warmth ?? 0) >= 2 || ((env.warmth ?? 0) > -2 && !['cruel', 'vindictive'].includes(leadStyle(env.style).key)));
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
  // R15: her openings as they fall once the noticed strains moved them (the plan's, without one)
  const openings = env.interaction === 'timing' ? new Map(effectiveOpenings(plan, live, leadStyle(env.style).key).map((o) => [o.beat, o])) : null;
  // a shift costs when the hold was uneven on its beat or the one before: no hold there, or (Ruling S) a hold that ended off level, which the
  // instrument carries on that beat's `uneven` input as `part: 'tilted'` (an old input has no part: as before)
  const evenBefore = (b: number): boolean => ![b - 1, b].some((x) => x >= 0 && (at(x, 'hold').length === 0 || at(x, 'uneven').some((u) => u.part === 'tilted')));

  const scale = env.scale ?? 1;
  // R18: scent's head (decision): whether the instrument reported the words breathed in, and what one word is worth of the gauge
  const inhaled = env.interaction === 'decision' && live.some((i) => i.kind === 'inhale');
  const word = cap / (env.head ?? headCapacity(TUNING.stimuli.startTolerance));
  // R29: whether the shoe instrument reported the mask (any wipe): then the wipes, not the parts, clean
  const wiped = env.interaction === 'order' && live.some((i) => i.kind === 'wipe');
  // R32: whether the gulp instrument reported the mouth (any swallow or spill): then the mouth, not the windows, is the gauge
  const mouthed = env.interaction === 'timing' && env.gaugeKind === 'fill' && live.some((i) => i.kind === 'swallow' || i.kind === 'spill');
  for (let b = 0; b < run_; b++) {
    const beat = plan.beats[b]!;
    const beatStart = r.gauge;
    if (beat.cue !== undefined) r.cues.push(beat.cue);
    switch (env.interaction) {
      case 'timing': {
        // R14: a breath carries the share of the opening held (absent: the whole of it, as the card's); none held is no breath
        const breath = at(b, 'breathe')[0];
        const breathed = breath !== undefined && (breath.amount === undefined || breath.amount > 0);
        const held = breath?.amount === undefined ? 1 : Math.min(1, breath.amount);
        const opening = openings!.get(b);
        if (env.gaugeKind === 'capacity') {
          r.gauge += -P.breath.drain + P.breath.seal[seal];
          if (opening && !opening.false) {
            if (breathed) {
              r.gauge += P.breath.caught * held;
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
          // R15: straining against her drains the beat twice; noticed (amount ≥ 1), the streak goes (her openings moved above)
          for (const s of at(b, 'strain')) {
            r.gauge += -P.breath.drain + P.breath.seal[seal];
            r.strains = (r.strains ?? 0) + 1;
            if ((s.amount ?? 0) >= 1) {
              r.noticed = (r.noticed ?? 0) + 1;
              r.streak = 0;
            }
          }
        } else if (mouthed) {
          // R32: the mouth: her flow on this beat comes in (mouths a second × the beat), the swallows and the spills go out (× the capacity);
          // what was spilled is counted for her flow's end; a spill is a slip, counted as gulp.html counts it: an overflow (re-armed under 0.9) or
          // a cough begins one (`part` `overflow` / `cough`; none: one), an overflow running on (`part: 'more'`) is its amount only
          r.gauge += (beat.flow?.level ?? 0) * (P.beatMs / 1000) * cap;
          for (const g of at(b, 'swallow')) r.gauge -= (g.amount ?? 0) * cap;
          for (const g of at(b, 'spill')) {
            r.gauge -= (g.amount ?? 0) * cap;
            r.spilled = (r.spilled ?? 0) + (g.amount ?? 0);
            if (g.part === 'more') continue;
            r.slips += 1;
            r.spills = (r.spills ?? 0) + 1;
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
        // Ruling W: the weight inside her frame. While she is up or resting (`ask_rest` `part: 'up'`) her weight is gone: no drain, no slip; the
        // end of her rest (`part: 'rest'`) gives back its `amount`, a hard landing (`part: 'charge'`) costs its `amount` (gauge points)
        if (env.longHold !== undefined) {
          for (const g of at(b, 'ask_rest')) if (g.part === 'rest') r.gauge += g.amount ?? 0; else if (g.part === 'charge') r.gauge -= g.amount ?? 0;
          if (at(b, 'ask_rest').some((g) => g.part === 'up')) break;
        }
        // Ruling AE: a shift she caught at once leans her in heavier for the beats after it (weight.html: 1.5 for 3 beats)
        const leaned = live.some((i) => i.kind === 'shift_weight' && i.part === 'caught' && b > i.beat && b <= i.beat + P.weight.caughtLean.beats);
        const drain = P.weight.drain * (leaned ? P.weight.caughtLean.pressure : run.pressure ?? 1) * (env.steady?.has(b) ? STEADY_DRAIN : 1);
        // 24b: inside her frame the strength's drain is a long hold's (`LONG_HOLD[longHoldStrain]`, throne.html `S.frameDrain`): the beat's drain
        // and its uneven share; a slip costs as before (the prototype's `wSlip` is not scaled). Outside a frame `longHold` is absent: as before.
        const flow = drain * (env.longHold ?? 1);
        r.gauge -= flow;
        if (at(b, 'hold').length === 0) {
          r.slips += 1;
          r.gauge -= drain;
        }
        // R16: held off level, the beat drains more: the mean extra factor of the beat (the instrument's), one a beat
        const uneven = at(b, 'uneven')[0];
        if (uneven !== undefined) r.gauge -= flow * (uneven.amount ?? 0);
        if (beat.shift !== undefined && !evenBefore(b)) r.gauge -= beat.shift;
        for (const g of at(b, 'shift_weight')) {
          // Ruling AE: the instrument decided it at once (`physics/relief`): not caught, the relief; caught, 10 strength off (weight.html)
          if (g.part === 'caught') { r.gauge -= P.weight.caught; r.reliefs += 1; continue; }
          r.gauge += P.weight.relief;
          if (g.part === 'free') r.reliefs += 1;
          else relief(g.beat, 'shift_weight');
        }
        break;
      }
      case 'decision': {
        // R18: the instrument's head is the gauge: a segment with any inhale fills by the words breathed in alone (one word = cap / head)
        if (inhaled) for (const g of at(b, 'inhale')) r.gauge += (g.amount ?? 0) * word;
        else r.gauge += P.saturation.per * P.saturation.bandFactor[env.band];
        for (const g of at(b, 'mouth_breath')) {
          r.gauge -= g.amount === undefined ? P.saturation.mouth : g.amount * word;
          // Ruling AE: the instrument decided its catches at once, word by word (`physics/relief`): no roll at the segment's end
          if (g.part === 'decided') r.reliefs += 1;
          else relief(g.beat, 'mouth_breath');
        }
        // Ruling U: words that left the head without the mouth (a cough, the overflow, an answer): the fill follows the head down
        for (const g of at(b, 'scatter')) r.gauge -= (g.amount ?? 0) * word;
        break;
      }
      case 'order': {
        // R29: shoe service's zones are the parts: a segment the instrument reported wipes in follows the mask (100 × the dirt left)
        if (wiped) for (const g of at(b, 'wipe')) r.gauge -= GAUGE_FULL * (g.amount ?? 0);
        else for (const g of at(b, 'part')) r.gauge -= g.part !== undefined && g.part === beat.part && (run.dryness ?? 0) < 100 ? P.tongue.right : P.tongue.wrong;
        if (run.dryness !== undefined) r.dryness = Math.min(100, (r.dryness ?? run.dryness) + P.tongue.dryness);
        break;
      }
      case 'passive':
        r.gauge += P.progressPerBeat;
        break;
      case 'gesture': {
        const bites = at(b, 'bite');
        const cost = bites.find((i) => i.part !== 'teeth');
        r.gauge += bitten ? P.jaw.per * (cost?.amount ?? 1) : P.jaw.per; // a beat the instrument did not report (a hidden tab) costs the flat rate
        if (bites.some((i) => i.part === 'teeth')) r.slips += 1; // R22: the teeth touched her: a slip (bookkeeping)
        // Ruling V: in an instrument segment a granted rest takes the prototype's rest off where it was asked (the fatigue never below 0 there, as on
        // the screen): `jawRest` as a share of the gauge (the instrument's fatigue is gauge / capacity × 100)
        if (bitten && rest !== undefined && rest.beat === b && restGranted) r.gauge = Math.max(0, r.gauge - (P.jawRest * cap) / 100);
        if (r.gauge >= P.jaw.degradeAt) r.degraded = true;
        break;
      }
    }
    // the pace scale is applied to the beat, then clamped, so that a phase gives the same fiction at every pace (review: it was applied after the clamp)
    if (scale !== 1) r.gauge = Math.round((beatStart + (r.gauge - beatStart) * scale) * 100) / 100;
    r.gauge = clamp(r.gauge, 0, env.gaugeKind === 'dirt' || env.gaugeKind === 'progress' ? 100 : cap);
    // Ruling W: inside her frame the strength never ends the hold: at 0 the commander buckles and gets back to 35 (three end it, `physicsInput`)
    if (env.longHold !== undefined && env.interaction === 'hold' && r.gauge <= 0) { r.gauge = 0.35 * cap; r.buckles = (r.buckles ?? 0) + 1; }
  }
  if (rest) {
    r.askedRest = true;
    r.restGranted = restGranted;
    // turn-based, `jawRest` gauge points at the segment's end as before (an instrument segment took its rest where it was asked)
    if (r.restGranted && !bitten) r.gauge = Math.max(0, r.gauge - P.jawRest);
  }
  if (run.dryness !== undefined && r.dryness === undefined) r.dryness = run.dryness;
  // R32: the floor after a gulp (the run carries `gulp`) is one segment: gulp.html's cleaning ends at 10 % left (the instrument ends the segment
  // there) or after its 40 s, and her check follows either way
  r.checked = env.interaction === 'order' && (r.gauge <= P.tongue.checkAt || run.gulp !== undefined);
  r.complete = env.interaction === 'passive' && r.gauge >= 100;
  const after = share(env.gaugeKind, r.gauge, cap);
  // review I1: the engine's mouth in a segment the gulp instrument reported is not the tide shown (her answers to a tap, the entry): it sets no
  // warning (no "close to the limit" and no `physics_warning` moment from a value the player never sees)
  r.warning = !mouthed && before > P.warning / 100 && after <= P.warning / 100;
  r.noise = r.slips + r.gasps > 0 ? P.noiseSlip : 0;
  return r;
}

/** Starts the next segment of a held run: plans it (the only draws of a segment) and sets the body running. */
export function nextSegment(draft: CampaignState, ctx: { registries: Registries; rng: Rng }, runId: string): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!run || run.id !== runId) throw new Error('Stale physics run.');
  if (run.segment.state !== 'held') throw new Error('A segment is running already.');
  if (run.marathon?.waiting) throw new Error('The phase is over: choose how to spend the stretch first.');
  if (run.forgotten) throw new Error('She has left: the commander waits posed (get up, or wait to be found).');
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
    const merged = mergeInputs(envMain.interaction, envSecond.interaction, plan, inputs, run.sourceKind === 'activity'); // review N2: her frame's weight owns her rise, rest and landing
    const steady = new Set(merged.steady);
    const m = resolveSegment(run, plan, merged.main, envMain.interaction === 'hold' ? { ...envMain, steady } : envMain);
    const x = resolveSegment(second, plan, merged.second, envSecond.interaction === 'hold' ? { ...envSecond, steady } : envSecond);
    notices = merged.notices;
    secondBonus = x.streakBonus;
    secondPart = { gasps: x.gasps, slips: x.slips, reliefs: x.reliefs, interaction: envSecond.interaction };
    if (x.buckles) run.second!.buckles = (run.second!.buckles ?? 0) + x.buckles; // Ruling W: three buckles end her frame (below)
    run.second!.gauge = x.gauge;
    run.second!.streak = x.streak;
    result = {
      ...m, caught: m.caught + x.caught, missed: m.missed + x.missed, falseTaken: m.falseTaken + x.falseTaken, slips: m.slips + x.slips, gasps: m.gasps + x.gasps,
      reliefs: m.reliefs + x.reliefs, reliefInputs: [...m.reliefInputs, ...x.reliefInputs], warning: m.warning || x.warning, checked: m.checked || x.checked,
      complete: m.complete || x.complete, degraded: m.degraded || x.degraded, askedRest: m.askedRest || x.askedRest,
      ...(m.strains !== undefined || x.strains !== undefined ? { strains: (m.strains ?? 0) + (x.strains ?? 0) } : {}),
      ...(m.noticed !== undefined || x.noticed !== undefined ? { noticed: (m.noticed ?? 0) + (x.noticed ?? 0) } : {}),
    };
  }
  // Ruling U: a decision segment the scent instrument reported (its head is the gauge): a full head is recoverable (`releaseOf`)
  if (envMain.interaction === 'decision' && inputs.some((i) => (i as SegmentInput).kind === 'inhale')) run.headed = true;
  // R32: a gulp the instrument reported (its mouth is the gauge): it carries what was spilled to her flow's end
  if (isGulpRun(run, reg) && inputs.some((i) => (i as SegmentInput).kind === 'swallow' || (i as SegmentInput).kind === 'spill')) run.gulp ??= { spilled: 0 };
  if (run.gulp && result.spilled !== undefined && isGulpRun(run, reg)) run.gulp.spilled = Math.round((run.gulp.spilled + result.spilled) * 1e6) / 1e6;
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
  sounds = segmentNoise(mainPart, envMain.interaction, stillnessOf(draft, run.holderId));
  if (secondPart) {
    for (const x of segmentNoise(secondPart, secondPart.interaction, stillnessOf(draft, run.holderId))) {
      const have = sounds.find((y) => y.kind === x.kind);
      if (have) have.loudness += x.loudness;
      else sounds.push(x);
    }
  }
  result.noise = sounds.reduce((n, x) => n + x.loudness, 0);
  for (const x of sounds) events.push({ type: 'physics_noise', runId, holderId: run.holderId, kind: x.kind, loudness: x.loudness });
  // R28: the tally of the run, from what this segment resolved (only what she perceived: a relief counts only once she caught it)
  addTally(run, {
    caught: result.caught, missed: result.missed, falseTaken: result.falseTaken, strains: result.strains ?? 0, noticed: result.noticed ?? 0,
    slips: result.slips - (result.spills ?? 0), gasps: result.gasps, cheatsCaught: events.filter((e) => e.type === 'physics_caught').length, spills: result.spills ?? 0,
    spilled: result.spilled !== undefined ? Math.round(result.spilled * 100) / 100 : 0,
  });
  // Minor 4: the reliefs she caught in this stretch, at its end and at once (Rulings Y, AC, AE), for the running directive
  const cheats = events.filter((e) => e.type === 'physics_caught').length + (run.segment.caughtNow ?? 0);
  run.gauge = result.gauge;
  run.streak = result.streak;
  if (result.dryness !== undefined) run.dryness = result.dryness;
  run.last = {
    caught: result.caught, missed: result.missed, falseTaken: result.falseTaken, slips: result.slips - (result.spills ?? 0), gasps: result.gasps, reliefs: result.reliefs, noise: result.noise, cues: result.cues,
    ...(result.warning ? { warning: true } : {}), ...(result.spills ? { spills: result.spills } : {}),
    ...(cheats > 0 ? { cheats } : {}),
  };
  run.segment = { n: run.segment.n, state: 'held' };
  events.unshift({ type: 'physics_segment', runId, n: segment, phase: 'end', physicsId, holderId: run.holderId, caught: result.caught, missed: result.missed, slips: result.slips, reliefs: result.reliefs, lapsed, warning: result.warning, ...(run.marathon ? { scale } : {}) }); // P16b: who held, and a marathon's pace scale, for the craft's xp
  if (result.streakBonus > 0) events.push(addEnduranceXp(draft, physicsId, Math.round(TUNING.physics.endurance.streak * result.streakBonus * 100) / 100));
  if (secondBonus > 0 && run.second) events.push(addEnduranceXp(draft, run.second.physicsId, TUNING.physics.endurance.streak * secondBonus));
  const gulped = run.gulp !== undefined && isGulpRun(run, reg);
  if (result.slips > 0) {
    events.push({ type: 'physics_slip', runId, kind: 'slip', count: result.slips, holderId: run.holderId, physicsId });
    if (!gulped) { // R32: a gulp's spills are carried to her flow's end (below), where the cleaning starts from all of them
      const chained = chainRun(draft, reg, run);
      if (chained.length > 0) events.push(...chained);
      else run.extend += TUNING.physics.slipExtend;
    }
  }
  // R32: her flow's end (her volume): she makes the commander clean what was spilled (her row's `check`, over `cleanFrom`) at 100 × spilled,
  // else the hold is released (little spilled, or she wipes it up herself)
  if (gulped && flowEnded(draft, run, beatsPerSegment(draft, segmentSecondsOf(draft, reg, run, Number(reg.contactPhysics.get(physicsId)?.segmentSeconds))))) {
    const row = gulpRowOf(leadStyle(physicsStyleOf(draft, run.holderId, reg)).key);
    if (run.gulp!.spilled > TUNING.physics.gulpFlow.cleanFrom && row.check === 'clean') events.push(...chainRun(draft, reg, run, floorStart(run.gulp!.spilled)));
    else events.push(...creditHold(draft, reg, run), ...stopPhysics(draft, reg, 'released'));
    events.push(...momentPass(draft, ctx, 'segment'));
    return events;
  }
  // Ruling W: the third buckle under her weight ends the session (her verdict is the instrument's)
  if (run.sourceKind === 'activity' && (run.second?.buckles ?? 0) >= 3) {
    events.push({ type: 'physics_buckle', runId, holderId: run.holderId, count: run.second!.buckles }, ...stopPhysics(draft, reg, 'collapse'));
    return events;
  }
  const boundary = decideBoundary(draft, ctx, run, result);
  if (boundary.move !== undefined) (events[0] as { move?: string }).move = boundary.move;
  events.push(...boundary.events);
  if (run.marathon && draft.scene?.physics === run) events.push(...phaseBoundary(draft, reg, run));
  events.push(...momentPass(draft, ctx, 'segment')); // a warning or a slip of this segment may bring a moment up (a no-op, and no draw, unless one is live)
  return events;
}

/** Adds a segment's counts to the run's tally (a key appears once it is above 0; nothing is written while all are 0). */
function addTally(run: PhysicsRun, counts: Record<string, number>): void {
  for (const [k, n] of Object.entries(counts)) {
    if (n <= 0) continue;
    run.tally ??= {};
    run.tally[k] = (run.tally[k] ?? 0) + n;
  }
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
    // R28: in her frame, at `use` in its last phase, she forgets the commander: she leaves, the commander stays posed (the run waits, nothing drains)
    if (run.sourceKind === 'activity' && presenceOf(draft, reg, run, m.phase) === 'use') {
      run.forgotten = true;
      return [{ type: 'marathon_phase', runId: run.id, phase: m.phase, over: true, last: true }, ...creditHold(draft, reg, run), { type: 'forgotten_end', runId: run.id, holderId: run.holderId }];
    }
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
    events.push({ type: 'physics_slip', runId: run.id, kind: 'skip', count: 1, holderId: run.holderId, physicsId: run.physicsId });
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

/**
 * P10e-e Ruling AC (e10 fix I2): a spit of grit during shoe service, decided when it is made, whether a segment runs or the run is held (her
 * answer follows at once, as the prototype's). One draw with shoe.html's chance by her attention (`TUNING.physics.shoe.spitSeen`): her
 * planned attention on the beat while a segment runs, else the attention the instrument shows (the last planned). Seen: `physics_caught`
 * (remembered as any caught cheat) and the tally's `cheatsCaught`. Shoe runs only.
 */
export function shoeSpit(draft: CampaignState, ctx: { registries: Registries; rng: Rng }, payload: Record<string, unknown>): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!run || run.id !== payload.runId) throw new Error('Stale physics run.');
  if (!isShoeRun(run, ctx.registries)) throw new Error('physics/spit: only in shoe service');
  const beat = Number.isInteger(payload.beat) && (payload.beat as number) >= 0 ? (payload.beat as number) : 0;
  const shown = typeof payload.attention === 'string' && ['watching', 'glancing', 'busy'].includes(payload.attention) ? (payload.attention as Attention) : 'busy';
  const beats = run.segment.state === 'running' ? run.segment.plan?.beats : undefined;
  const attention = beats && beats.length > 0 ? beats[Math.min(beat, beats.length - 1)]!.attention : shown;
  const events: EngineEvent[] = [{ type: 'physics_cheat', runId: run.id, holderId: run.holderId, kind: 'spit', beat }];
  if (!ctx.rng.chance(P.shoe.spitSeen[attention] ?? 0)) return events;
  caughtAtOnce(run);
  return [...events, { type: 'physics_caught', runId: run.id, holderId: run.holderId, kind: 'spit', beat }];
}

const commanderLevel = (state: CampaignState, physicsId: string): number => commanderSkill(state, physicsId);

/**
 * P10e-e Rulings X and Y: a relief or a fidget of the commander's body in her frame, decided when it is reported (her tell and her answer follow
 * at once, as the prototype's). One draw, the prototype's noticing: `p = 1 − (1 − p_seen)(1 − p_heard)`, with `p_heard = amount × her ears × 1.35`
 * (`amount` = loudness × (1 − cover), the instrument's) and `p_seen = CAUGHT[her attention on this beat] × (0.6 while a call or a visitor has her
 * eyes)` when it was visible (`part`: `seen`, `seen_shared`; `unseen` is not; `away`: she is out, nothing is noticed and nothing is drawn). A
 * voluntary one she noticed is a caught cheat (`physics_caught`, remembered as any); an involuntary one (the body giving way) is only noticed
 * (`physics_noticed`). Frame runs only; no draw when nothing could notice it.
 */
export function frameRelief(draft: CampaignState, ctx: { registries: Registries; rng: Rng }, payload: Record<string, unknown>): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!run || run.id !== payload.runId) throw new Error('Stale physics run.');
  if (run.sourceKind !== 'activity' || run.forgotten) throw new Error('physics/relief: only in her frame, while she is there');
  const kind = payload.kind === 'fidget' ? 'fidget' : payload.kind === 'relieve' ? 'relieve' : null;
  const amount = typeof payload.amount === 'number' && Number.isFinite(payload.amount) ? Math.max(0, Math.min(1, payload.amount)) : null;
  const part = typeof payload.part === 'string' && ['seen', 'unseen', 'seen_shared', 'away'].includes(payload.part) ? payload.part : null;
  if (kind === null || amount === null || part === null) throw new Error('physics/relief needs { runId, kind: relieve | fidget, amount 0–1, part: seen | unseen | seen_shared | away }');
  const beat = Number.isInteger(payload.beat) ? (payload.beat as number) : 0;
  const involuntary = payload.involuntary === true;
  const ears = frameOf(ctx.registries.blockingActivities.get(run.sourceId))?.hear ?? 1;
  const attention = attentionAt(run, beat, payload.attention);
  const pHeard = part === 'away' ? 0 : Math.min(1, amount * ears * 1.35);
  const pSeen = part === 'seen' || part === 'seen_shared' ? P.gaze.caught[attention] * (part === 'seen_shared' ? 0.6 : 1) : 0;
  const p = 1 - (1 - pSeen) * (1 - pHeard);
  const events: EngineEvent[] = involuntary ? [] : [{ type: 'physics_cheat', runId: run.id, holderId: run.holderId, kind, beat }];
  if (p <= 0 || !ctx.rng.chance(p)) return events;
  if (involuntary) {
    addTally(run, { moved: 1 });
    return [{ type: 'physics_noticed', runId: run.id, holderId: run.holderId, beat }];
  }
  caughtAtOnce(run);
  return [...events, { type: 'physics_caught', runId: run.id, holderId: run.holderId, kind, beat }];
}

/**
 * Her attention for a relief decided at once: her planned attention on the beat while a segment runs; between segments (the held gap, a
 * marathon's wait: no plan) the attention the instrument shows (final review, Minor 6: never `busy` by default while she is watching), else
 * `busy`.
 */
function attentionAt(run: PhysicsRun, beat: number, shown: unknown): Attention {
  const beats = run.segment.state === 'running' ? run.segment.plan?.beats : undefined;
  if (beats && beats.length > 0) return beats[Math.max(0, Math.min(beat, beats.length - 1))]!.attention;
  return typeof shown === 'string' && ['watching', 'glancing', 'busy'].includes(shown) ? (shown as Attention) : 'busy';
}

/** A relief she caught at once (Rulings Y, AC, AE): the tally's `cheatsCaught`, and the stretch's count for the running directive (Minor 4). */
function caughtAtOnce(run: PhysicsRun): void {
  addTally(run, { cheatsCaught: 1 });
  if (run.segment.state === 'running') run.segment.caughtNow = (run.segment.caughtNow ?? 0) + 1;
  else if (run.last) run.last.cheats = (run.last.cheats ?? 0) + 1;
}

/**
 * P10e-e Ruling AE (final review I1): the commander's own relief in a weight or a scent run, decided when it is made, as the prototypes do
 * (Rulings Y, AC, AD extended). One draw, only when the commander takes it:
 * - `shift_weight` (a hold run, main or second): weight.html's `relief`, p = `CAUGHT[her attention]` (`TUNING.physics.gaze.caught`, the same
 *   table); `part: 'away'` (her frame, she is out: throne.html's `!G.away`) is never caught and draws nothing;
 * - `mouth_breath` (a decision run): saturation.html's per blown word, p = `NOTICED[her attention] × amount` (the same table; `amount` the
 *   breath's loudness, 0.25 short, 0.6 long).
 * Caught: `physics_caught` (remembered as any caught cheat) and the tally's `cheatsCaught`. The segment input it goes with is marked (`part`
 * `free` / `caught`, `decided`), so the segment's `cheatRoll` never rolls it again. The card and turn-based inputs are unmarked: as before.
 */
export function instrumentRelief(draft: CampaignState, ctx: { registries: Registries; rng: Rng }, payload: Record<string, unknown>): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!run || run.id !== payload.runId) throw new Error('Stale physics run.');
  const kind = payload.kind as 'shift_weight' | 'mouth_breath';
  const interaction = kind === 'shift_weight' ? 'hold' : 'decision';
  const owns = [run.physicsId, run.second?.physicsId].some((id) => id !== undefined && ctx.registries.contactPhysics.get(id)?.interaction === interaction);
  if (!owns) throw new Error(`physics/relief: ${kind} only in a ${interaction} run`);
  if (run.forgotten) throw new Error('physics/relief: she has left');
  const amount = kind === 'mouth_breath'
    ? (typeof payload.amount === 'number' && Number.isFinite(payload.amount) ? Math.max(0, Math.min(1, payload.amount)) : null)
    : 1;
  if (amount === null) throw new Error('physics/relief: a mouth breath needs its loudness (amount 0–1)');
  const beat = Number.isInteger(payload.beat) && (payload.beat as number) >= 0 ? (payload.beat as number) : 0;
  const attention = attentionAt(run, beat, payload.attention);
  const p = payload.part === 'away' ? 0 : P.gaze.caught[attention] * amount;
  const events: EngineEvent[] = [{ type: 'physics_cheat', runId: run.id, holderId: run.holderId, kind, beat }];
  if (p <= 0 || !ctx.rng.chance(p)) return events;
  caughtAtOnce(run);
  return [...events, { type: 'physics_caught', runId: run.id, holderId: run.holderId, kind, beat }];
}

/** `physics/relief`: by kind, the instrument's own relief (Ruling AE) or the body in her frame (Rulings X, Y). */
export function physicsRelief(draft: CampaignState, ctx: { registries: Registries; rng: Rng }, payload: Record<string, unknown>): EngineEvent[] {
  return payload.kind === 'shift_weight' || payload.kind === 'mouth_breath' ? instrumentRelief(draft, ctx, payload) : frameRelief(draft, ctx, payload);
}
