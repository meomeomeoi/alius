/**
 * What a holder's domains let her do (P15, plan R12): the readers every other layer asks. A leaf of the dynamic: it imports only the gate, the state
 * and types, so the personal, hub, rules and power layers can read a capability without a cycle. Code reads a domain by what it grants, never by its id.
 */
import type { Registries } from '../../content/types';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { dynamicOn } from './gate';
import { dynamicOf, type DynamicDomain } from './state';
import type { Capability, DynamicDomainEntry } from './types';

export const domainEntry = (reg: Registries, id: string): DynamicDomainEntry | undefined => reg.dynamicDomains.get(id) as unknown as DynamicDomainEntry | undefined;
export const domainRows = (reg: Registries): DynamicDomainEntry[] => [...reg.dynamicDomains.values()] as unknown as DynamicDomainEntry[];

/** Whether a domain on her list counts today: a partial yield (a compromise) lapses on its day. */
export const standing = (d: DynamicDomain, day: number): boolean => d.partialUntil === undefined || d.partialUntil > day;

/** The hold a domain's band starts at (`Infinity` for a band the pack no longer has, so a broken row never grants). */
export const bandMin = (reg: Registries, entry: DynamicDomainEntry): number => Number(reg.holdBands.get(entry.requires.holdBand)?.min ?? Infinity);

/**
 * What her domains let her do, by capability: the union of the `grants` of every domain she holds today (an expired partial yield and a row
 * the pack no longer has grant nothing). Empty while the dynamic is off and for a unit who is not a living named holder. Pure.
 */
export function capabilitiesOf(state: CampaignState, reg: Registries, unitId: string): Capability[] {
  const dyn = dynamicOf(state, unitId);
  const unit = state.squad.find((u) => u.id === unitId);
  if (dyn === undefined || unit === undefined || unit.kind !== 'named' || !isLiving(unit) || !dynamicOn(state, reg)) return [];
  const held = new Set<Capability>();
  for (const d of dyn.domains) if (standing(d, state.day)) for (const c of domainEntry(reg, d.id)?.grants ?? []) held.add(c);
  return [...held];
}

export const hasCapability = (state: CampaignState, reg: Registries, unitId: string, cap: Capability): boolean => capabilitiesOf(state, reg, unitId).includes(cap);

/** The first unit (squad order) whose domains grant `cap`, or `null`. */
export function holderWith(state: CampaignState, reg: Registries, cap: Capability): string | null {
  return state.squad.find((u) => u.kind === 'named' && hasCapability(state, reg, u.id, cap))?.id ?? null;
}

/**
 * The holder whose second place (`second_place`) the commander spends this slot in (R12, review I9): a booking of the evening of today that stands
 * (booked or played, as the hub reads a booking) belonging to a unit whose domains grant it. The first in the bookings' order. Only the Evening slot
 * has one. Derived, nothing is stored, no draw. `null` while the dynamic is off.
 */
export function secondPlaceHolder(state: CampaignState, reg: Registries): string | null {
  if (state.slot !== 'evening') return null;
  const b = (state.personal?.bookings ?? []).find((x) => x.day === state.day && x.slot === 'evening' && (x.status === 'booked' || x.status === 'played') && hasCapability(state, reg, x.unitId, 'second_place'));
  return b?.unitId ?? null;
}

/** Without the command her open override is void (nothing runs, nothing is owed): called after a domain of hers is lost. */
export function dropVoidOverride(draft: CampaignState, reg: Registries, unitId: string): void {
  if (draft.dynamic?.override?.unitId === unitId && !hasCapability(draft, reg, unitId, 'countermand')) delete draft.dynamic.override;
}
