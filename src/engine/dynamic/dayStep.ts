/**
 * The dynamic's day step (P15, plan R8, spec §15.12): what a day does to every holder, in a fixed order. It runs from the `dm_rumors`
 * hook, after her life's step (`actions/dynamic.ts` is imported last). While the dynamic is off it returns `[]` and touches nothing.
 * The later tasks add their sub-steps in place, in the order of the list below: probes (Task 14), milestones (19), claims (22),
 * knowledge (27), aftermaths (30), oversight (34), Regard (36), exchange (38). Steps 1 to 4 draw nothing; the probe step draws one chance for a unit that is eligible and has room.
 */
import type { Registries } from '../../content/types';
import { impunityOf } from '../discipline/impunity';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { leaderOf } from '../power/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { frameRank } from '../blocking/state';
import { aftermathDayStep } from './aftermath';
import { claimsDue } from './domains';
import { dynamicOn } from './gate';
import { addFavour, addHold } from './hold';
import { knowledgeDayStep } from './knowledge';
import { milestonesDue } from './milestones';
import { oversightDayStep } from './oversight';
import { probeDayStep } from './probes';
import { regardDayStep } from './regard';
import { fadeDeclarations } from './reading';
import { dynamicOf } from './state';
import { levelOfXp } from './tracks';
import type { DynamicTrackEntry } from './types';

type SubStep = (draft: CampaignState, ctx: Pick<EngineCtx, 'registries' | 'rng'>, holders: string[]) => EngineEvent[];

/** The living named units that have a dynamic, in squad order. */
const holdersOf = (draft: CampaignState): string[] => draft.squad.filter((u) => u.kind === 'named' && isLiving(u) && dynamicOf(draft, u.id) !== undefined).map((u) => u.id);

/** 1. Decay: after `idleDays` without a gain, a little each day, faster at the lower frames (nothing at `equal`); never below the frame's floor. */
const decay: SubStep = (draft, ctx, holders) => {
  const T = TUNING.dynamic.decay;
  const events: EngineEvent[] = [];
  for (const id of holders) {
    const dyn = dynamicOf(draft, id)!;
    if (dyn.frame === 'equal' || draft.day - dyn.lastPracticeDay <= T.idleDays) continue;
    events.push(...addHold(draft, ctx, id, -T[dyn.frame], 'decay', { practice: false }));
  }
  return events;
};

/** 2. The slow term: while her Impunity is at the route's level, and while she leads the squad, at frame `play` or beyond. */
const slowTerm: SubStep = (draft, ctx, holders) => {
  const T = TUNING.dynamic;
  const leader = leaderOf(draft)?.id;
  const events: EngineEvent[] = [];
  for (const id of holders) {
    if (frameRank(dynamicOf(draft, id)!.frame) < frameRank('play')) continue;
    const base = ((impunityOf(draft, ctx.registries, id)?.value ?? 0) >= T.impunityRoute ? T.slow.impunity : 0) + (id === leader ? T.slow.leader : 0);
    if (base > 0) events.push(...addHold(draft, ctx, id, base, 'standing', { practice: false }));
  }
  return events;
};

/** 3. Track decay: a track loses a little xp each day after `tracks.idleDays` without practice; the level follows the xp. */
const trackDecay: SubStep = (draft, ctx, holders) => {
  const T = TUNING.dynamic.tracks;
  for (const id of holders) {
    const dyn = dynamicOf(draft, id)!;
    if (draft.day - dyn.lastPracticeDay <= T.idleDays) continue;
    for (const [trackId, track] of Object.entries(dyn.tracks)) {
      if (track.xp <= 0) continue;
      const entry = (ctx.registries as Registries).dynamicTracks.get(trackId) as unknown as DynamicTrackEntry | undefined;
      track.xp = Math.max(0, Math.round((track.xp - T.decayPerDay) * 1e4) / 1e4);
      if (entry !== undefined) track.level = levelOfXp(entry.thresholds, track.xp);
    }
  }
  return [];
};

/** 4. Favour drifts toward 0 by `favour.decayPerDay`. */
const favourDecay: SubStep = (draft, _ctx, holders) => {
  const step = TUNING.dynamic.favour.decayPerDay;
  for (const id of holders) {
    const favour = dynamicOf(draft, id)!.favour;
    if (favour !== 0) addFavour(draft, id, favour > 0 ? -Math.min(step, favour) : Math.min(step, -favour));
  }
  return [];
};

/** 5. Probes (Task 14): a pending probe lapses, the queue is kept, and at most one eligible unit rolls her daily chance (the only draw of the step). */
const probes: SubStep = (draft, ctx) => probeDayStep(draft, ctx);

/** 5b. Declarations fade (Task 15): a declared motive loses weight each day and is gone at 0. Draws nothing. */
const declarations: SubStep = (draft, _ctx, holders) => fadeDeclarations(draft, holders);

/** 6. Milestones (Task 19): what time alone makes due (a cooling, a cooldown that ran out) applies or opens; the hold changes asked it already. Draws nothing. */
const milestones: SubStep = (draft, ctx, holders) => holders.flatMap((id) => milestonesDue(draft, ctx, id));

/** 7. Claims (Task 22): a holder who is due a domain draws once and may open her claim; a claim of a held domain is settled between the holders. */
const claims: SubStep = (draft, ctx) => claimsDue(draft, ctx);

/** 8. Knowledge (Task 27): what has not been fed ages, then the background, what the holders tell and the gossip add to what the squad suspects. Draws nothing. */
const knowledge: SubStep = (draft, ctx) => knowledgeDayStep(draft, ctx);

/** 9. Aftermaths (Task 30): a stage whose day has come gives way to the next, the last one ends (and may chain, one draw). */
const aftermaths: SubStep = (draft, ctx) => aftermathDayStep(draft, ctx);

/** 10. Oversight (Task 34): the transfer threat's day, then the held and cancelled Leash requests are counted and the inquiry moves; on fill it acts. Draws nothing. */
const oversight: SubStep = (draft, ctx) => oversightDayStep(draft, ctx);

/** 11. Regard (Task 36): a holder whose style counts the days she has served gets a rise for each week without a slip. Draws nothing. */
const regard: SubStep = (draft, ctx, holders) => regardDayStep(draft, ctx.registries, holders);

/** The sub-steps, in order. The numbers are the plan's (Task 12); a later task inserts its own at its place. */
const STEPS: readonly SubStep[] = [decay, slowTerm, trackDecay, favourDecay, probes, declarations, milestones, claims, knowledge, aftermaths, oversight, regard];

/** The day-end step of the dynamic (registered on `dm_rumors`). */
export function dynamicDayStep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries' | 'rng'>): EngineEvent[] {
  if (!dynamicOn(draft, ctx.registries)) return [];
  const holders = holdersOf(draft);
  const events: EngineEvent[] = [];
  for (const step of STEPS) events.push(...step(draft, ctx, holders));
  return events;
}
