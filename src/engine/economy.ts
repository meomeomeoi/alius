import type { Registries } from '../content/types';
import type { EngineEvent } from './dispatch';
import { applyRelationDelta } from './relationGain';
import type { CampaignState, Unit } from './state/types';
import { TUNING } from './tuning';

type LevelEntry = { effects: Record<string, number>; upgrade?: { credits: number; plyx: number; days: number } };

/** Facilities start at level 1; an absent key in `base.facilities` means level 1. */
export const facilityLevel = (state: CampaignState, id: string): number => state.base.facilities[id] ?? 1;

export function facilityLevels(reg: Registries, id: string): LevelEntry[] {
  return (reg.facilities.get(id)?.levels as LevelEntry[] | undefined) ?? [];
}

/** The value of effect `key` of facility `id` at its current level; unknown facility or key → 0. */
export function facilityEffect(state: CampaignState, reg: Registries, id: string, key: string): number {
  const levels = facilityLevels(reg, id);
  if (levels.length === 0) return 0;
  return levels[Math.min(facilityLevel(state, id), levels.length) - 1].effects[key] ?? 0;
}

export function rosterCapacityFor(reg: Registries, barracksLevel: number): number {
  const levels = facilityLevels(reg, 'barracks');
  if (levels.length === 0) return TUNING.rosterBaseCapacity;
  return levels[Math.min(barracksLevel, levels.length) - 1].effects.rosterCapacity ?? TUNING.rosterBaseCapacity;
}

export const isLiving = (u: Unit): boolean => u.status !== 'dead' && u.status !== 'deserted' && u.status !== 'terminated';

/** Living units on the active expedition roster. */
export function activeRosterUnits(state: CampaignState): Unit[] {
  return state.roster.activeIds
    .map((id) => state.squad.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined && isLiving(u));
}

const eatsDouble = (u: Unit): boolean => u.defects.some((d) => d.id === TUNING.upkeep.doubledByDefect);

export function upkeepNeeded(state: CampaignState, reg: Registries): { units: number; needed: number } {
  const units = activeRosterUnits(state);
  const raw = units.reduce((n, u) => n + TUNING.upkeep.perUnit * (eatsDouble(u) ? 2 : 1), 0) + TUNING.upkeep.commander;
  const needed = Math.max(0, raw - facilityEffect(state, reg, 'mess_hall', 'upkeepReduction'));
  return { units: units.length, needed };
}

/** Splits `total` into `n` integer shares that sum to `total`; the remainder starts at `offset % n`. */
export function spread(total: number, n: number, offset: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  const out = new Array<number>(n).fill(base);
  for (let i = 0; i < extra; i++) out[(((offset % n) + n) % n + i) % n] += 1;
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Pays the day's supplies; a shortage costs stress and Affinity, a long one Trust. No randomness. */
export function runUpkeep(draft: CampaignState, reg: Registries): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { needed } = upkeepNeeded(draft, reg);
  const paid = Math.min(draft.resources.supplies, needed);
  const missing = needed - paid;
  draft.resources.supplies -= paid;
  events.push({ type: 'upkeep', needed, paid, shortage: missing });

  if (missing === 0) {
    draft.calendar.shortageStreak = 0;
    return events;
  }

  const units = activeRosterUnits(draft);
  // a double eater holds two shares, so the shortage "hits her hardest"
  const slots = units.flatMap((u) => (eatsDouble(u) ? [u, u] : [u]));
  const stress = spread(missing * TUNING.shortage.stressPerPoint, slots.length, draft.day);
  const affinity = spread(missing * TUNING.shortage.affinityPerPoint, slots.length, draft.day);
  slots.forEach((u, i) => {
    u.stress = clamp(u.stress + stress[i], 0, 100);
    if (affinity[i] > 0) applyRelationDelta(draft, u.id, 'affinity', -affinity[i], 'shortage');
  });

  const streak = (draft.calendar.shortageStreak ?? 0) + 1;
  draft.calendar.shortageStreak = streak;
  events.push({ type: 'supply_shortage', missing, streak });
  if (streak % TUNING.shortage.streakDays === 0) {
    for (const u of units) applyRelationDelta(draft, u.id, 'trust', -TUNING.shortage.trustPenalty, 'shortage_streak');
    events.push({ type: 'trust_penalty_event', streak, units: units.map((u) => u.id), amount: TUNING.shortage.trustPenalty });
  }
  return events;
}
