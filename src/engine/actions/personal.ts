import { registerAction } from '../dispatch';
import { registerDayEndStep } from '../calendar';
import { DECOR_PARTS, removeDecor } from '../personal/decor';
import { personalDayStep } from '../personal/dayStep';
import { INTERCEPT_CHANNELS, resolveIntercept, rollIntercept } from '../personal/intercept';
import type { DecorPart, InterceptChannel } from '../state/types';

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
