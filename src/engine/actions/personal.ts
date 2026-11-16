import { registerAction } from '../dispatch';
import { registerDayEndStep } from '../calendar';
import { DECOR_PARTS, removeDecor } from '../personal/decor';
import { personalDayStep } from '../personal/dayStep';
import type { DecorPart } from '../state/types';

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
