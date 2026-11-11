import { registerAction } from '../dispatch';
import { orderInScene } from '../loyalty/refusal';

// Importing this module registers the P6 loyalty actions (more are added by the desertion and mutiny modules).

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerAction('scene/order', (draft, payload, ctx) => {
  const unitId = isObj(payload) ? payload.unitId : undefined;
  if (typeof unitId !== 'string') throw new Error('scene/order needs { unitId }');
  return orderInScene(draft, ctx, unitId);
});
