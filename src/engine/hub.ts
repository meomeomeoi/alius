import type { Entry, Registries } from '../content/types';
import { activeRestrictions } from './discipline/restrictions';
import { facilityLevel, isLiving, livingUnits } from './economy';
import type { CampaignState, Slot, Unit } from './state/types';
import { likesOf } from './development/profile';

/** FNV-1a, 32 bit. The hub's only source of "randomness": a stable function of its input, never a draw from the campaign RNG. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Demands waiting for the commander's answer: open ones of soldiers who are still with the squad (the Tonight list and the objectives read this). */
export function waitingDemands(state: CampaignState): Array<NonNullable<CampaignState['discipline']>['demands'][number]> {
  return (state.discipline?.demands ?? []).filter((d) => d.status === 'open' && state.squad.some((u) => u.id === d.unitId && isLiving(u)));
}

export interface Whereabout {
  unitId: string;
  /** `null` while she is out on an expedition, or when no room qualifies. */
  roomId: string | null;
  reason: 'injured' | 'confined' | 'duty' | 'night' | 'routine' | 'expedition' | 'nowhere';
}

/** A room the pack lists, in registry order, so the pick never depends on how a `Map` was filled. */
const roomsOf = (reg: Registries): Entry[] => [...reg.hubRooms.values()];

const hostOf = (rooms: Entry[], host: string): Entry | undefined =>
  rooms.find((r) => ((r.hosts ?? []) as string[]).includes(host));

const isInjured = (u: Unit): boolean => u.status === 'injured' || (u.injuryDays ?? 0) > 0;

/** A room is a routine candidate when its location is open this slot, its facility stands and its weight is above zero. */
function routineWeight(state: CampaignState, reg: Registries, room: Entry, unit: Unit): number {
  const base = ((room.weights ?? {}) as Partial<Record<Slot, number>>)[state.slot] ?? 0;
  if (base <= 0) return 0;
  const open = ((reg.locations.get(room.sceneLocationId as string)?.slots ?? []) as string[]).includes(state.slot);
  if (!open) return 0;
  if (typeof room.facilityId === 'string' && facilityLevel(state, room.facilityId) < 1) return 0;
  const liked = ((room.likeTags ?? []) as string[]).some((t) => likesOf(unit).some((l) => l.toLowerCase() === t.toLowerCase()));
  return base + (liked ? 2 : 0);
}

function place(state: CampaignState, reg: Registries, rooms: Entry[], unit: Unit): Whereabout {
  const here = (room: Entry | undefined, reason: Whereabout['reason']): Whereabout | null =>
    room ? { unitId: unit.id, roomId: room.id, reason } : null;

  if (state.expedition?.party.includes(unit.id)) return { unitId: unit.id, roomId: null, reason: 'expedition' };

  const held = activeRestrictions(state, unit.id);
  const found =
    (isInjured(unit) ? here(hostOf(rooms, 'injured'), 'injured') : null)
    ?? (held.some((r) => r.kind === 'confined') ? here(hostOf(rooms, 'confined'), 'confined') : null)
    ?? (held.some((r) => r.kind === 'duty') ? here(hostOf(rooms, 'duty'), 'duty') : null)
    ?? (state.slot === 'night' ? here(hostOf(rooms, 'night'), 'night') : null);
  if (found) return found;

  // P9c: in a slot she booked she is where the booking says (the room of its location)
  const booked = state.personal?.bookings?.find((b) => b.unitId === unit.id && b.day === state.day && b.slot === state.slot && (b.status === 'booked' || b.status === 'played'));
  const bookedRoom = booked ? rooms.find((r) => r.sceneLocationId === reg.bookingKinds.get(booked.kindId)?.locationId) : undefined;
  if (bookedRoom) return { unitId: unit.id, roomId: bookedRoom.id, reason: 'routine' };

  const weights = rooms.map((room) => routineWeight(state, reg, room, unit));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return { unitId: unit.id, roomId: null, reason: 'nowhere' };
  let pick = fnv1a(`${state.day}|${state.slot}|${unit.id}`) % total;
  for (let i = 0; i < rooms.length; i++) {
    if (pick < weights[i]) return { unitId: unit.id, roomId: rooms[i].id, reason: 'routine' };
    pick -= weights[i];
  }
  return { unitId: unit.id, roomId: null, reason: 'nowhere' };
}

/**
 * Where every living unit is this slot. Derived, never stored: the engine has no schedules, so the room comes from what
 * it does know (an expedition, an injury, a restriction, the night) and otherwise from a stable hash of day, slot and
 * unit id weighted by the rooms' `weights` and her likes. Same state, same answer; no RNG is drawn.
 */
export function whereabouts(state: CampaignState, reg: Registries): Whereabout[] {
  const rooms = roomsOf(reg);
  return livingUnits(state).map((u) => place(state, reg, rooms, u));
}
