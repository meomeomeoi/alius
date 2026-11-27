/**
 * Disciplines fade unused (P16b, plan Task 2; spec section 2). A key of `Commander.craft` not used for `decay.days` loses one level step of
 * xp, never below level 1 and never while it was used within the days; what the pair has learnt (postures, her rhythm, her signals, her
 * routine) fades after `decay.pairDays`, the same way. The day-end step does nothing while nothing of the craft is written. Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { levelForXp, setEnduranceXp } from '../physics/skill';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { craftOn } from './gate';
import { craftWord, enduranceOf, type Known } from './state';

const THRESHOLDS = TUNING.physics.endurance.thresholds;

/** The xp one level step down: the threshold of the level below (level 2 falls to 30 xp), or `null` at level 1 and under (the floor holds). */
export function stepDownXp(xp: number): number | null {
  const level = levelForXp(xp);
  return level <= 1 ? null : THRESHOLDS[level - 2]!;
}

/** Days since a thing was last used or last decayed, whichever is later. */
const idle = (day: number, last: number, decayed: number | undefined): number => day - Math.max(last, decayed ?? 0);

/**
 * The day-end decay. Runs only while some holder is craft-live; otherwise it returns `[]` before touching anything. A key of
 * `Commander.endurance` that the craft book has not stamped yet (the commander trained before any holder was live) starts its clock today, so it is never
 * decayed for a use that was never counted. A level that falls says so (`craft_level` with `fell`); the pair's knowledge fades without an event.
 */
export function decayCraft(draft: CampaignState, reg: Registries): EngineEvent[] {
  if (!craftOn(draft, reg)) return []; // the decay is the craft's: with nobody craft-live the book sleeps (and its clock is kept by the stamp of every use)
  const pairs = Object.values(draft.relations).filter((r) => r.craft !== undefined);
  const events: EngineEvent[] = [];
  const day = draft.day;
  const D = TUNING.craft.decay;
  for (const physics of Object.keys(draft.commander.endurance ?? {})) {
    const book = (draft.commander.craft ??= {});
    book[`endurance:${physics}`] ??= { xp: 0, level: 0, lastDay: day };
  }
  for (const [key, row] of Object.entries(draft.commander.craft ?? {})) {
    if (idle(day, row.lastDay, row.decayedDay) <= D.days) continue;
    const physics = enduranceOf(key);
    const xp = physics !== null ? draft.commander.endurance?.[physics]?.xp ?? 0 : row.xp;
    const to = stepDownXp(xp);
    if (to === null) continue;
    row.decayedDay = day;
    if (physics !== null) setEnduranceXp(draft, physics, to);
    else {
      row.xp = to;
      row.level = levelForXp(to);
    }
    const level = levelForXp(to);
    events.push({ type: 'craft_level', key, level, word: craftWord(level), fell: true });
  }
  for (const rel of pairs) {
    fadePair(rel.craft!, day, D.pairDays);
    if (rel.craft!.headlock !== undefined && rel.craft!.headlock.day < day) delete rel.craft!.headlock; // the sparring hold is the day's
  }
  return events;
}

/** What a pair has learnt fades after `pairDays` unused: xp to the step below (level 1 holds); a signal she named stays named and its answered count falls by one, to 1. */
function fadePair(book: NonNullable<CampaignState['relations'][string]['craft']>, day: number, pairDays: number): void {
  const fade = (k: Known | undefined): void => {
    if (k === undefined || idle(day, k.day, k.decayedDay) <= pairDays) return;
    const to = stepDownXp(k.xp);
    if (to === null) return;
    k.xp = to;
    k.decayedDay = day;
  };
  for (const k of Object.values(book.postures ?? {})) fade(k);
  fade(book.rhythm);
  fade(book.routine);
  for (const s of Object.values(book.signals ?? {})) {
    if (s.answered <= 1 || idle(day, s.day, s.decayedDay) <= pairDays) continue;
    s.answered -= 1;
    s.decayedDay = day;
  }
}
