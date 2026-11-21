/**
 * P15a: what happens at the end of a segment (plan R12): the credit for a hold that was endured, whether the run ends by what she holds the
 * commander until, and her next move (press, lift, change her rhythm, fall asleep, "forget" to let go). A blackout ends the scene (the
 * controller closes it) and leaves a wake card, a slot lost, `dizzy` and a little stress. The only draws: whether she forgets (when a release
 * was due) and whether she falls asleep (when she can).
 */
import type { Registries } from '../../content/types';
import { blockingOf, setQuietly, unsetActivity } from '../blocking';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { impunityOf } from '../discipline/impunity';
import type { Rng } from '../rng';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { setCondition } from './conditions';
import { releaseCheck, stopPhysics } from './run';
import { addEnduranceXp, practise, type HerSkill } from './skill';
import { leadStyle, physicsStyleOf } from './style';
import type { Outcome, PhysicsRun, SegmentResult } from './state';

const P = TUNING.physics;

/** The practice a hold gives her, by what it was (plan R12): seal ← breath, weight ← weight, reading ← any hold, rhythm ← any timing hold. */
function practiceKinds(reg: Registries, run: PhysicsRun): HerSkill[] {
  const kinds: HerSkill[] = ['reading'];
  if (run.physicsId === 'breath') kinds.push('seal');
  if (run.physicsId === 'weight') kinds.push('weight');
  if (reg.contactPhysics.get(run.physicsId)?.interaction === 'timing') kinds.push('rhythm');
  return kinds;
}

/** A hold that was endured: the commander's xp and her practice, once, when it ends well. */
export function creditHold(draft: CampaignState, reg: Registries, run: PhysicsRun): EngineEvent[] {
  const events: EngineEvent[] = [];
  if (reg.contactPhysics.get(run.physicsId)?.skill === true) events.push(addEnduranceXp(draft, run.physicsId, P.endurance.hold));
  events.push(...practise(draft, run.holderId, practiceKinds(reg, run), leadStyle(physicsStyleOf(draft, run.holderId)).key));
  return events;
}

/** The chance she "forgets" to let go when a release is due: 0.10, +0.15 for a cruel holder, +0.002 per Impunity point above 50. */
export function forgetChance(state: CampaignState, reg: Registries, unitId: string): number {
  const f = P.forget;
  const cruel = leadStyle(physicsStyleOf(state, unitId)).key === 'cruel' ? f.cruel : 0;
  return f.base + cruel + f.perImpunity * Math.max(0, (impunityOf(state, reg, unitId)?.value ?? 0) - f.from);
}

/** Her activity is rest: she may doze off in a hold (the activity's `pairTags` says `relaxed` or `asleep`). */
function resting(state: CampaignState, reg: Registries, unitId: string): boolean {
  const activity = blockingOf(state.scene, unitId).activity;
  const tags = activity !== undefined ? (reg.blockingActivities.get(activity)?.pairTags as string[] | undefined) : undefined;
  return tags?.includes('relaxed') === true || tags?.includes('asleep') === true;
}

/** The scene is cut: a slot is lost, the commander is dizzy for the rest of the day and a little shaken, and a wake card is kept for the end. */
function blackoutAftermath(draft: CampaignState, reg: Registries, run: PhysicsRun): EngineEvent[] {
  const scene = draft.scene!;
  scene.extraSlots = (scene.extraSlots ?? 0) + P.blackout.slots;
  scene.blackout = true;
  draft.lastWake = { day: draft.day, slot: draft.slot, unitId: run.holderId };
  return [{ type: 'blackout', unitId: run.holderId, runId: run.id, physicsId: run.physicsId }, ...setCondition(draft, reg, 'dizzy', { day: draft.day })];
}

const ENDED_WELL: ReadonlySet<Outcome> = new Set(['released', 'checked']);
const PRESSES = new Set(['cruel', 'vindictive', 'possessive']);
const CHANGES = new Set(['playful', 'obsessive']);

/**
 * The boundary after a segment. A finished cleaning is checked and a finished task of hers is released; otherwise the gauge decides by what she
 * holds the commander until. A release that was due may be put off by a slip (`extend`) or by her "forgetting". When the run goes on she makes
 * a move: she falls asleep (night or rest), else presses, lifts or changes her rhythm by her style. Returns the events and the move, if any.
 */
export function decideBoundary(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'> & { rng: Rng }, run: PhysicsRun, result: SegmentResult): { events: EngineEvent[]; move?: string } {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  let outcome: Outcome | null = null;
  let move: string | undefined;
  if (result.checked) outcome = 'checked';
  else if (result.complete) outcome = 'released';
  else {
    const release = releaseCheck(draft, reg, run);
    if (release === 'release') {
      if (run.extend > 0) run.extend -= 1;
      else if (ctx.rng.chance(forgetChance(draft, reg, run.holderId))) {
        run.extend += 1;
        move = 'forgets';
      } else outcome = 'released';
    } else if (release !== 'continue') outcome = release;
  }
  if (outcome === null) {
    const scene = draft.scene!;
    if (move === undefined && (draft.slot === 'night' || resting(draft, reg, run.holderId)) && blockingOf(scene, run.holderId).activity !== 'sleeping') {
      if (ctx.rng.chance(1 - (1 - P.asleep.perBeat) ** result.beatsRun)) {
        if (setQuietly(draft, reg, { person: run.holderId, field: 'activity', value: 'sleeping' })) {
          (scene.sleepUntil ??= {})[run.holderId] = scene.exchanges + ctx.rng.int(P.asleep.exchanges[0], P.asleep.exchanges[1]);
          move = 'asleep';
        }
      }
    }
    if (move === undefined) {
      const key = leadStyle(physicsStyleOf(draft, run.holderId)).key;
      const left = run.capacity > 0 ? (reg.contactPhysics.get(run.physicsId)?.gauge as { kind: string }).kind === 'capacity' ? run.gauge / run.capacity : 1 : 1;
      if (PRESSES.has(key) && result.missed === 0 && result.slips === 0) {
        run.pressure = Math.min(1.5, (run.pressure ?? 1) + 0.25);
        move = 'press';
      } else if (key === 'affectionate' && left <= 0.5) {
        run.pressure = Math.max(0.5, (run.pressure ?? 1) - 0.25);
        move = 'lift';
      } else if (CHANGES.has(key) && result.streak >= P.endurance.streakFrom) {
        run.rhythmShift = (run.rhythmShift ?? 0) + 1;
        move = 'rhythm';
      }
    }
    if (move !== undefined && run.last) run.last.move = move;
    return { events, ...(move !== undefined ? { move } : {}) };
  }
  if (outcome === 'collapse' || outcome === 'limit_broken') events.push({ type: 'physics_slip', runId: run.id, kind: 'collapse', holderId: run.holderId });
  if (ENDED_WELL.has(outcome)) events.push(...creditHold(draft, reg, run));
  const blackout = outcome === 'blackout' ? blackoutAftermath(draft, reg, run) : [];
  events.push(...stopPhysics(draft, reg, outcome), ...blackout);
  return { events, move: 'release' };
}

/** Whoever fell asleep in a hold wakes when her exchanges are up: her activity goes (quietly). Call it as an exchange passes. */
export function wakeSleepers(draft: CampaignState): void {
  const scene = draft.scene;
  if (!scene?.sleepUntil) return;
  for (const [unitId, until] of Object.entries(scene.sleepUntil)) {
    if (until > scene.exchanges) continue;
    if (blockingOf(scene, unitId).activity === 'sleeping') unsetActivity(draft, unitId);
    delete scene.sleepUntil[unitId];
  }
  if (Object.keys(scene.sleepUntil).length === 0) delete scene.sleepUntil;
}
