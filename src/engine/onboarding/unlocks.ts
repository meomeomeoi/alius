import type { Entry, Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { onboardingDone } from './state';

interface Condition { minDay?: number; afterStep?: string }

const conditionOf = (row: Entry): Condition => (row.condition ?? {}) as Condition;
const tabOf = (row: Entry): string => String((row.target as { tab: string }).tab);

function holds(state: CampaignState, c: Condition): boolean {
  if (c.minDay !== undefined && state.day < c.minDay) return false;
  if (c.afterStep !== undefined) {
    const o = state.onboarding;
    if (!o || !(o.completed.includes(c.afterStep) || o.skipped.includes(c.afterStep))) return false;
  }
  return true;
}

/**
 * The PDA tabs that are locked now: while a prologue is under way, a tab is locked when some `uiUnlocks` row for it does
 * not hold. A tab with no row is always open; no prologue (or a finished one) locks nothing. (Tab ids are plain strings
 * here: the engine does not know the UI's list.)
 */
export function lockedTabs(state: CampaignState, reg: Registries): Set<string> {
  const out = new Set<string>();
  if (onboardingDone(state)) return out;
  for (const row of reg.uiUnlocks.values()) if (!holds(state, conditionOf(row))) out.add(tabOf(row));
  return out;
}

/** The rows whose tab went from locked to open between two states (what the unlock notice is for). */
export function unlockedBetween(before: CampaignState, after: CampaignState, reg: Registries): Entry[] {
  const was = lockedTabs(before, reg);
  const now = lockedTabs(after, reg);
  return [...reg.uiUnlocks.values()].filter((row) => was.has(tabOf(row)) && !now.has(tabOf(row)));
}
