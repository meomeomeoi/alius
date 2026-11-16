import { registerAction } from '../dispatch';
import { registerDayEndStep } from '../calendar';
import { cancelBooking, playBooking, resolveConflict } from '../personal/bookings';
import { refuseClaim } from '../personal/courtship';
import { DECOR_PARTS, removeDecor } from '../personal/decor';
import { personalDayStep } from '../personal/dayStep';
import { INTERCEPT_CHANNELS, resolveIntercept, rollIntercept } from '../personal/intercept';
import type { DecorPart, InterceptChannel, Slot } from '../state/types';

// Importing this module registers the P9c actions and the personal day step. The step runs after the comms night roll and
// the bonds step on `dm_rumors`, so import it after `./comms` and `./bonds`.

registerDayEndStep('dm_rumors', personalDayStep);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** PEEL: the commander removes one part of a unit's decor. Draws no rng. */
registerAction('device/remove_decor', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string' || !DECOR_PARTS.includes(payload.part as DecorPart)) {
    throw new Error('device/remove_decor needs { unitId, part: "sticker" | "wallpaper" | "contact" }');
  }
  return removeDecor(draft, ctx, payload.unitId, payload.part as DecorPart);
});

/** The roll for one thing the commander is about to send: `{ channel: 'dm' | 'leash' | 'recruit', toUnitId? }` (the recipient of a DM). */
registerAction('device/intercept', (draft, payload, ctx) => {
  if (!isObj(payload) || !INTERCEPT_CHANNELS.includes(payload.channel as InterceptChannel) || (payload.toUnitId !== undefined && typeof payload.toUnitId !== 'string')) {
    throw new Error('device/intercept needs { channel: "dm" | "leash" | "recruit", toUnitId? }');
  }
  return rollIntercept(draft, ctx, { channel: payload.channel as InterceptChannel, ...(payload.toUnitId !== undefined ? { toUnitId: payload.toUnitId } : {}) });
});

/** KEEP / REVERT on the waiting edit. Draws no rng. */
registerAction('device/resolve_intercept', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.id !== 'string' || typeof payload.keep !== 'boolean') throw new Error('device/resolve_intercept needs { id, keep }');
  return resolveIntercept(draft, ctx, payload.id, payload.keep);
});

const SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];

/** CANCEL: the commander cancels a booking before it is played (the P9 refuse path). Draws no rng. */
registerAction('booking/cancel', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.bookingId !== 'string') throw new Error('booking/cancel needs { bookingId }');
  return cancelBooking(draft, ctx, payload.bookingId);
});

/** Two bookings of one slot: `{ bookingId }` keeps that one, `{ day, slot, settle: true }` lets them settle it. Draws no rng. */
registerAction('booking/resolve', (draft, payload, ctx) => {
  if (isObj(payload) && typeof payload.bookingId === 'string') return resolveConflict(draft, ctx, { bookingId: payload.bookingId });
  if (isObj(payload) && payload.settle === true && typeof payload.day === 'number' && SLOTS.includes(payload.slot as Slot)) {
    return resolveConflict(draft, ctx, { day: payload.day, slot: payload.slot as Slot, settle: true });
  }
  throw new Error('booking/resolve needs { bookingId } or { day, slot, settle: true }');
});

/** The slot is here: plays the due booking (a conflict settles itself first). The scene to open is in `booking_played.scene`. Draws no rng. */
registerAction('booking/play', (draft, payload, ctx) => {
  const id = isObj(payload) && typeof payload.bookingId === 'string' ? payload.bookingId : undefined;
  return playBooking(draft, ctx, id).events;
});

/** REFUSE PUBLICLY on a claim (only while `public_humiliation` is allowed for her). Draws no rng. */
registerAction('courtship/refuse_claim', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string') throw new Error('courtship/refuse_claim needs { unitId }');
  return refuseClaim(draft, ctx, payload.unitId);
});
