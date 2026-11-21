/**
 * P15a: what happens at the end of a segment (plan R12): the credit for a hold that was endured, and whether the run ends by what she holds
 * the commander until. (Her moves, the blackout's aftermath and the conditions come with Task 20.) Draws nothing here.
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addEnduranceXp, practise, type HerSkill } from './skill';
import { releaseCheck, stopPhysics } from './run';
import { leadStyle, physicsStyleOf } from './style';
import type { Outcome, PhysicsRun, SegmentResult } from './state';

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
  if (reg.contactPhysics.get(run.physicsId)?.skill === true) events.push(addEnduranceXp(draft, run.physicsId, TUNING.physics.endurance.hold));
  events.push(...practise(draft, run.holderId, practiceKinds(reg, run), leadStyle(physicsStyleOf(draft, run.holderId)).key));
  return events;
}

const ENDED_WELL: ReadonlySet<Outcome> = new Set(['released', 'checked']);

/**
 * The boundary after a segment: a finished cleaning is checked, a finished task of hers is released, otherwise the gauge decides by what she
 * holds the commander until. A release the slip put off (`extend`) waits one more segment. The run ends here or goes on `held`.
 */
export function decideBoundary(draft: CampaignState, ctx: { registries: Registries }, run: PhysicsRun, result: SegmentResult): EngineEvent[] {
  const reg = ctx.registries;
  let outcome: Outcome | null = null;
  if (result.checked) outcome = 'checked';
  else if (result.complete) outcome = 'released';
  else {
    const release = releaseCheck(draft, reg, run);
    if (release === 'release') {
      if (run.extend > 0) run.extend -= 1;
      else outcome = 'released';
    } else if (release !== 'continue') outcome = release;
  }
  if (outcome === null) return [];
  const events: EngineEvent[] = [];
  if (outcome === 'collapse' || outcome === 'limit_broken') events.push({ type: 'physics_slip', runId: run.id, kind: 'collapse', holderId: run.holderId });
  if (ENDED_WELL.has(outcome)) events.push(...creditHold(draft, reg, run));
  events.push(...stopPhysics(draft, reg, outcome));
  return events;
}
