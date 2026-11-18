import { registerAction } from '../dispatch';

// Importing this module registers the actions of the interface of intimacy (P10b): her hand, and (Task 10) her notes.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerAction('squad/set_hand', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string' || typeof payload.handId !== 'string') throw new Error('squad/set_hand needs { unitId, handId }');
  const unit = draft.squad.find((u) => u.id === payload.unitId);
  if (!unit || unit.kind !== 'named') throw new Error('Only a named soldier has a hand.');
  if (!ctx.registries.handFonts.has(payload.handId)) throw new Error(`squad/set_hand: unknown hand "${payload.handId}"`);
  unit.hand = payload.handId;
  return [{ type: 'hand_set', unitId: unit.id, handId: payload.handId }];
});
