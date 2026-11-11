import { consumeSlots, registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { compel, suppress, terminate } from '../leash/use';
import { ensureLeash, refreshLeash } from '../leash/weekly';

// Importing this module registers the P6 Leash actions and day-end step (more are added by the use, loyalty and dilemma modules).

registerAction('leash/seed', (draft, _payload, ctx) => ensureLeash(draft, ctx.registries));

// Registered after P5's deadline step (actions/world), so a `leash −1` that lands on the refresh day belongs to the old week.
registerDayEndStep('mission_deadlines', (draft, ctx) => [...ensureLeash(draft, ctx.registries), ...refreshLeash(draft, ctx.registries)]);

// ---------------------------------------------------------------------------------------------
// Using the Leash

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const unitIdOf = (payload: unknown, action: string): string => {
  const id = isObj(payload) ? payload.unitId : undefined;
  if (typeof id !== 'string') throw new Error(`${action} needs { unitId }`);
  return id;
};

registerAction('leash/compel', (draft, payload, ctx) => {
  const unitId = unitIdOf(payload, 'leash/compel');
  const refusal = draft.scene?.refusals?.find((r) => r.unitId === unitId);
  if (!draft.scene?.participants.includes(unitId) || !refusal) throw new Error('She has not refused an order in this scene: there is nothing to compel.');
  const { forced, events } = compel(draft, ctx, { unitId, context: 'scene' });
  if (forced && draft.scene.refusals) draft.scene.refusals = draft.scene.refusals.filter((r) => r.unitId !== unitId);
  return [...events, { type: 'scene_compelled', unitId, forced }];
});

registerAction('leash/suppress', (draft, payload, ctx) => {
  const unitId = unitIdOf(payload, 'leash/suppress');
  const open = draft.disloyalty?.open;
  if (!open || open.unitId !== unitId || (open.kind !== 'desertion' && open.kind !== 'mutiny')) {
    throw new Error('There is nothing to suppress: no desertion or attack is about to happen.');
  }
  const events = suppress(draft, ctx, { unitId, context: open.kind });
  if (open.at === 'night') events.push(...consumeSlots(draft, 1, ctx));
  return events;
});

registerAction('leash/terminate', (draft, payload, ctx) => terminate(draft, ctx, unitIdOf(payload, 'leash/terminate')).events);
