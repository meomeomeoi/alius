/**
 * What the craft plugs into the physics layer (P16b, plan Task 4; ruling 12): the commander's stillness (a share of how much quieter a slip is, `noise.perLevel`
 * a level) and how many levels of her personal rhythm the commander knows (each widens her openings). Both read 0 while nothing of the craft is written, so a campaign
 * without it is as it was. Installed once when `actions/craft` is imported; `installCraftHooks` is idempotent (tests that reset the physics hooks call it again).
 */
import { levelForXp } from '../physics/skill';
import { registerCombatPassive } from '../combat/build';
import { registerRhythmKnown, registerServiceReport, registerStillness, registerStopHook } from '../physics/style';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { craftLevel } from './book';
import { registerAfterBout } from '../personal/wagers';
import { careOfFeet, noteFootSignal, noteServiceVerdict } from './feet';
import { offerHeadlock } from './headlock';
import { endPostureRun } from './posture';

/** How quiet the commander is, 0 to 0.9: `noise.perLevel` for each level of `stillness`. */
export function stillnessShare(state: Pick<CampaignState, 'commander'>): number {
  return Math.min(0.9, TUNING.craft.noise.perLevel * craftLevel(state, 'stillness'));
}

/** The levels (0-5) of her rhythm the commander knows with this holder. */
export function rhythmLevel(state: Pick<CampaignState, 'relations'>, holderId: string): number {
  return levelForXp(state.relations[holderId]?.craft?.rhythm?.xp ?? 0);
}

export function installCraftHooks(): void {
  registerStopHook((draft, ctx) => endPostureRun(draft, ctx, 'stopped'), 'craft'); // the stop word ends a posture hold, out of the fiction
  registerStillness((state) => stillnessShare(state), 'craft');
  registerRhythmKnown((state, holderId) => rhythmLevel(state, holderId), 'craft');
  // her feet: a pleased foot or shoe service cares for them (her form in the next run), and a bout of her foot language is her signal answered or missed
  registerAfterBout((draft, ctx, bout) => offerHeadlock(draft, ctx, bout), 'craft'); // the sparring hold: she won a bout and it suits her
  registerCombatPassive(careOfFeet);
  registerServiceReport((draft, ctx, r) => [
    ...(r.verdict !== undefined ? noteServiceVerdict(draft, ctx.registries, r.holderId, r.verdict) : []),
    ...(r.signal !== undefined ? noteFootSignal(draft, ctx.registries, r.holderId, r.signal.motion, r.signal.answered) : []),
  ], 'craft');
}
