import type { Registries } from '../../content/types';
import { traitEffects } from '../commander/traits';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, LeashKind, LeashLogEntry } from '../state/types';
import { TUNING } from '../tuning';
import { factionStanding } from '../world/state';

const KINDS: readonly string[] = ['compel', 'suppress', 'terminate'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The well-formed entries of `leash.log`; anything else (older saves, other tools) is kept in state and ignored here. */
export function leashLog(state: Pick<CampaignState, 'leash'>): LeashLogEntry[] {
  const out: LeashLogEntry[] = [];
  for (const e of state.leash.log) {
    if (isObj(e) && typeof e.unitId === 'string' && typeof e.kind === 'string' && KINDS.includes(e.kind)
      && typeof e.day === 'number' && typeof e.no === 'number') {
      out.push(e as unknown as LeashLogEntry & { kind: LeashKind });
    }
  }
  return out;
}

/** Sum of a crime's effects of one type (`leash_weekly`, `leash_trust_cost`), perk and flaw together. */
export function crimeEffectAmount(reg: Registries, crimeId: string | null, type: string): number {
  const crime = crimeId === null ? undefined : reg.crimes.get(crimeId);
  if (!crime) return 0;
  let sum = 0;
  for (const part of [crime.perk, crime.flaw]) {
    const list = (part as { effects?: unknown } | undefined)?.effects;
    if (!Array.isArray(list)) continue;
    for (const fx of list) {
      if (isObj(fx) && fx.type === type && typeof fx.amount === 'number') sum += fx.amount;
    }
  }
  return sum;
}

/** Authorizations per week: corporation base + crime modifiers ± the own corporation's standing, clamped 0…5. */
export function leashWeekly(state: CampaignState, reg: Registries): number {
  const id = state.commander.corporationId;
  const corp = id === null ? undefined : reg.corporations.get(id);
  const weekly = (corp?.leash as { weekly?: number } | undefined)?.weekly ?? TUNING.leash.weeklyFallback;
  let n = weekly + crimeEffectAmount(reg, state.commander.crimeId, 'leash_weekly');
  n += traitEffects(state, reg, 'leash_weekly').reduce((sum, fx) => sum + fx.amount, 0); // P7 traits
  if (id !== null) {
    const standing = factionStanding(state, id);
    if (standing >= TUNING.leash.standingStep) n += 1;
    else if (standing <= -TUNING.leash.standingStep) n -= 1;
  }
  return Math.max(0, Math.min(TUNING.leash.weeklyMax, n));
}

/** Gives a campaign its first full week, once. Older saves (`{ 0, 1, [] }`) are seeded by `leash/seed` or the first day end. */
export function ensureLeash(draft: CampaignState, reg: Registries): EngineEvent[] {
  if (draft.leash.seeded === true) return [];
  draft.leash.authorizationsLeft = leashWeekly(draft, reg);
  draft.leash.refreshDay = draft.day + TUNING.leash.refreshDays;
  draft.leash.seeded = true;
  return [{ type: 'leash_seeded', left: draft.leash.authorizationsLeft }];
}

/** Day-end: when the new day opens the refresh day, the week is refilled and the next refresh moves by 7 days. */
export function refreshLeash(draft: CampaignState, reg: Registries): EngineEvent[] {
  if (draft.day + 1 < draft.leash.refreshDay) return [];
  draft.leash.authorizationsLeft = leashWeekly(draft, reg);
  draft.leash.refreshDay += TUNING.leash.refreshDays;
  return [{ type: 'leash_refreshed', left: draft.leash.authorizationsLeft }];
}
