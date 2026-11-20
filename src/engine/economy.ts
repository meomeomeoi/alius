import type { Registries } from '../content/types';
import { traitEffects } from './commander/traits';
import type { EngineEvent } from './dispatch';
import { rationsOf } from './power/state';
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

export const isLiving = (u: Unit): boolean => u.status !== 'dead' && u.status !== 'deserted' && u.status !== 'terminated' && u.status !== 'reassigned';

/** Living units on the active expedition roster. */
export function activeRosterUnits(state: CampaignState): Unit[] {
  return state.roster.activeIds
    .map((id) => state.squad.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined && isLiving(u));
}

const eatsDouble = (u: Unit): boolean => u.defects.some((d) => d.id === TUNING.upkeep.doubledByDefect);

/** Everyone alive in the squad eats, on the roster or in reserve. */
export const livingUnits = (state: CampaignState): Unit[] => state.squad.filter(isLiving);

export function upkeepNeeded(state: CampaignState, reg: Registries): { units: number; needed: number } {
  const units = livingUnits(state);
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
  let missing = needed - paid;
  draft.resources.supplies -= paid;
  events.push({ type: 'upkeep', needed, paid, shortage: missing });

  // P9b `commander_short`: the commander goes without first, up to the commander's own share, and sleeps through the next morning
  const mode = rationsOf(draft);
  if (missing > 0 && mode === 'commander_short') {
    const covered = Math.min(missing, TUNING.upkeep.commander);
    missing -= covered;
    draft.calendar.loseMorning = true;
    events.push({ type: 'commander_went_hungry', day: draft.day, covered });
    // the squad sees the commander go without: every named unit trusts the commander a little more
    for (const u of livingUnits(draft)) if (u.kind === 'named') applyRelationDelta(draft, u.id, 'trust', TUNING.power.rations.hungerTrust, 'commander_hungry');
  }

  if (missing === 0) {
    draft.calendar.shortageStreak = 0;
    return events;
  }

  const units = livingUnits(draft);
  // a double eater holds two shares, so the shortage "hits her hardest"
  const slots = units.flatMap((u) => (eatsDouble(u) ? [u, u] : [u]));
  let stress = spread(missing * TUNING.shortage.stressPerPoint, slots.length, draft.day);
  let affinity = spread(missing * TUNING.shortage.affinityPerPoint, slots.length, draft.day);
  // P9b `fighters_first`: reserve units take a point each first, the roster only what is left over (no reserve unit: as `equal`)
  const onRoster = (u: Unit): boolean => draft.roster.activeIds.includes(u.id);
  if (mode === 'fighters_first' && slots.some((u) => !onRoster(u))) {
    const order = slots.map((_, i) => i).sort((a, b) => Number(onRoster(slots[a])) - Number(onRoster(slots[b])));
    const points = new Array<number>(slots.length).fill(0);
    let left = missing;
    for (const i of order) {
      points[i] = Math.min(left, 1);
      left -= points[i];
    }
    if (left > 0) spread(left, slots.length, draft.day).forEach((n, i) => { points[i] += n; }); // more than a point a share: spill evenly
    stress = points.map((p) => p * TUNING.shortage.stressPerPoint);
    affinity = points.map((p) => p * TUNING.shortage.affinityPerPoint);
    // the reserve units who go without so that the roster does not feel it resent it
    slots.forEach((u, i) => {
      if (!onRoster(u) && points[i] > 0 && u.kind === 'named') applyRelationDelta(draft, u.id, 'trust', -points[i] * TUNING.power.rations.unfairTrust, 'shortage_unfair');
    });
  }
  slots.forEach((u, i) => {
    u.stress = clamp(u.stress + stress[i], 0, 100);
    if (affinity[i] > 0) applyRelationDelta(draft, u.id, 'affinity', -affinity[i], 'shortage');
  });

  const streak = (draft.calendar.shortageStreak ?? 0) + 1;
  draft.calendar.shortageStreak = streak;
  events.push({ type: 'supply_shortage', missing, streak, hit: units.length });
  if (streak % TUNING.shortage.streakDays === 0) {
    for (const u of units) applyRelationDelta(draft, u.id, 'trust', -TUNING.shortage.trustPenalty, 'shortage_streak');
    events.push({ type: 'trust_penalty_event', streak, units: units.map((u) => u.id), amount: TUNING.shortage.trustPenalty });
  }
  return events;
}

/** Why facility `id` cannot be upgraded now, or null. Shared by the action and the BASE tab. */
export function checkUpgrade(state: CampaignState, reg: Registries, id: string): string | null {
  const facility = reg.facilities.get(id);
  if (!facility) return `Unknown facility "${id}".`;
  const name = String(facility.name);
  const levels = facilityLevels(reg, id);
  const level = facilityLevel(state, id);
  if (level >= levels.length) return `${name} is already at its max level (${levels.length}).`;
  if ((state.base.upgrades ?? []).some((u) => u.facilityId === id)) return `${name} is already being upgraded.`;
  const up = levels[level].upgrade;
  if (!up) return `${name} has no upgrade to level ${level + 1}.`;
  if (state.resources.credits < up.credits) return `Not enough credits to upgrade ${name} (needs ${up.credits}).`;
  if (state.resources.plyx < up.plyx) return `Not enough PLYX to upgrade ${name} (needs ${up.plyx}).`;
  return null;
}

/** Why a grunt cannot be recruited now, or null. */
export function checkRecruit(state: CampaignState): string | null {
  if (state.squad.filter(isLiving).length >= state.roster.capacity) {
    return `The barracks are full (${state.roster.capacity} beds). Upgrade them to recruit more.`;
  }
  if (state.resources.credits < TUNING.recruit.credits) {
    return `Not enough credits to recruit a grunt (needs ${TUNING.recruit.credits}).`;
  }
  return null;
}

/** Ends a unit's injury; she returns to the roster only if she is on it, otherwise to reserve. */
export function recoverUnit(draft: CampaignState, u: Unit): EngineEvent {
  delete u.injuryDays;
  u.injuries = [];
  if (u.status === 'injured') u.status = draft.roster.activeIds.includes(u.id) ? 'active' : 'reserve';
  return { type: 'unit_recovered', unitId: u.id };
}

/**
 * What `n` supplies cost in credits: the fixed rate, changed by the commander's `requisition_price` traits, rounded up and
 * never below 1 credit per supply.
 */
export function requisitionCost(state: CampaignState, reg: Registries, n: number): number {
  const pct = traitEffects(state, reg, 'requisition_price').reduce((sum, fx) => sum + fx.pct, 0);
  const raw = n * TUNING.requisition.creditsPerSupply * Math.max(0, 1 + pct / 100);
  return Math.max(n, Math.ceil(raw - 1e-9));
}
