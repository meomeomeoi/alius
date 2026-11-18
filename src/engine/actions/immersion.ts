import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { notesDayStep } from '../notes/dayStep';

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

// Her daily note: after the personal step (the import order decides: `app.ts` imports `actions/personal` first).
registerDayEndStep('dm_rumors', notesDayStep);

registerAction('notes/read', (draft, payload) => {
  if (!isObj(payload) || typeof payload.id !== 'string') throw new Error('notes/read needs { id }');
  const note = draft.notes?.list.find((n) => n.id === payload.id);
  if (!note) throw new Error(`notes/read: no note "${payload.id}"`);
  note.read = true;
  return [{ type: 'note_read', id: note.id, unitId: note.unitId }];
});
