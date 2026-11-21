/**
 * P15a: long holds (plan R13, spec §16.3). A hold of an hour of fiction or more is a marathon: phases of a few segments, the stretch between
 * them resolved by the strategy the player picks (one draw at most), attrition that makes each phase start weaker, a fiction clock, and a price in
 * slots. The pace (`marathonPace`) changes only how long a phase takes in play: every fiction-time result is the same at every pace.
 */
import type { Registries } from '../../content/types';
import { sceneSettingsOf, type MarathonPace } from '../moments/settings';
import type { Rng } from '../rng';
import type { CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { averageCaught } from './gaze';
import { commanderSkill, herSkillOf } from './skill';
import { leadStyle, physicsStyleOf } from './style';
import type { MarathonState, PhysicsRun } from './state';

const M = TUNING.physics.marathon;

/** A hold of an hour or more, or of a length nobody says. */
export const isMarathon = (duration: PhysicsRun['duration']): boolean => duration === 'unknown' || (duration !== undefined && duration.hours >= 1);

/** Two phases per two fiction hours (one an hour), at least 2 and at most 8; 6 when the length is unknown (and then the count is hidden). */
export function phasesOf(duration: NonNullable<PhysicsRun['duration']>): number {
  return duration === 'unknown' ? M.unknownPhases : Math.min(M.maxPhases, Math.max(M.minPhases, Math.round(duration.hours)));
}

/** Fiction hours in one phase (an unknown length counts an hour a phase). */
export const hoursPerPhase = (m: Pick<MarathonState, 'hours' | 'phases'>): number => (m.hours === 'unknown' ? 1 : m.hours / m.phases);

/** How many segments a phase takes at this pace: real time, `paceMinutes × 60 / segmentSeconds`; turn-based, `phaseBeats` over a turn. */
export function phaseLength(pace: MarathonPace, realtime: boolean, segmentSeconds: number): number {
  return Math.max(1, realtime ? Math.round((M.paceMinutes[pace] * 60) / segmentSeconds) : Math.round(M.phaseBeats[pace] / TUNING.physics.turnBeats));
}

export function phaseSegments(state: CampaignState, reg: Registries, run: PhysicsRun): number {
  const s = sceneSettingsOf(state);
  return phaseLength(s.marathonPace, s.physicsRealtime, Number(reg.contactPhysics.get(run.physicsId)?.segmentSeconds ?? 20));
}

/** The marathon state of a run that has just started (the clock begins where the slot does). */
export function initMarathon(state: CampaignState, duration: NonNullable<PhysicsRun['duration']>): MarathonState {
  const start = M.startClock[state.slot as Slot];
  return { hours: duration === 'unknown' ? 'unknown' : duration.hours, phase: 1, phases: phasesOf(duration), segmentsDone: 0, clockMin: start, startMin: start, waiting: false };
}

/** How much a segment of a marathon counts, so that a phase costs the same at every pace: the normal pace's segments over this phase's. */
export function paceScale(state: CampaignState, reg: Registries, run: PhysicsRun): number {
  const s = sceneSettingsOf(state);
  const secs = Number(reg.contactPhysics.get(run.physicsId)?.segmentSeconds ?? 20);
  return phaseLength('normal', s.physicsRealtime, secs) / phaseSegments(state, reg, run);
}

/** The capacity lost at the start of each phase after the first: `attrition` per fiction hour, less 2 a level of endurance. */
export function attrition(hours: number, level: number): number {
  return Math.max(0, M.attrition * hours - M.perLevel * level);
}

export type Strategy = 'endure' | 'spare' | 'cheat' | 'rest';
export const STRATEGIES: readonly Strategy[] = ['endure', 'spare', 'cheat', 'rest'];

export interface Skip { held: boolean; summary: string; /** Added to the next phase's starting gauge (negative: a cost). */ delta: number; caught?: boolean; slip?: boolean; spare?: number }

const SUMMARY: Record<Strategy, { good: string; bad: string }> = {
  endure: { good: 'The stretch passes in a long, steady hold.', bad: 'The stretch passes badly: the body gives, and she sees it.' },
  spare: { good: 'The commander spares strength through the stretch and moves as little as possible.', bad: '' },
  cheat: { good: 'The commander eases the body whenever she is not looking, and she does not notice.', bad: 'The commander eases the body and she catches it.' },
  rest: { good: 'She allows a rest, and the commander takes it.', bad: 'She refuses the rest, and the stretch is long.' },
};

/**
 * Resolves the stretch between two phases by the strategy. At most ONE draw: endure holds with `0.5 + 0.1 × the endurance level` (+0.2 if the
 * last stretch was spared); spare and rest draw nothing (a cruel or vindictive holder refuses the rest); a cheat is caught with the chance
 * of her gaze, averaged over her activity's attention (one draw instead of two).
 */
export function resolveSkip(state: CampaignState, reg: Registries, run: PhysicsRun, strategy: Strategy, rng: Rng): Skip {
  const m = run.marathon!;
  switch (strategy) {
    case 'endure': {
      const level = commanderSkill(state, run.physicsId);
      const held = rng.chance(Math.min(1, M.endure.base + M.endure.perLevel * level + (m.spare ?? 0)));
      return { held, summary: held ? SUMMARY.endure.good : SUMMARY.endure.bad, delta: held ? 0 : -M.failCost, slip: !held };
    }
    case 'spare':
      return { held: true, summary: SUMMARY.spare.good, delta: -M.spareCost, spare: M.spare };
    case 'cheat': {
      const reading = herSkillOf(state, run.holderId).reading;
      const activity = state.scene?.blocking?.[run.holderId]?.activity;
      const attention = activity !== undefined ? (reg.blockingActivities.get(activity)?.attention as string | undefined) : undefined;
      const p = averageCaught(attention, physicsStyleOf(state, run.holderId, reg), reading);
      const hit = rng.chance(p);
      return { held: !hit, summary: hit ? SUMMARY.cheat.bad : SUMMARY.cheat.good, delta: hit ? -M.failCost : M.cheatRelief, caught: hit, slip: hit };
    }
    case 'rest': {
      const refused = ['cruel', 'vindictive'].includes(leadStyle(physicsStyleOf(state, run.holderId, reg)).key);
      return { held: !refused, summary: refused ? SUMMARY.rest.bad : SUMMARY.rest.good, delta: refused ? -M.spareCost : M.rest };
    }
  }
}

/** The fiction clock as `HH:MM`. */
export function clockText(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** The slots a marathon costs beyond its own: the slots its fiction time spans, less one. */
export const extraSlotsFor = (elapsedMin: number): number => Math.max(0, Math.ceil(elapsedMin / 60 / M.slotHours) - 1);
