import { consumeSlots, registerDayEndStep } from '../calendar';
import { actOnWarning } from '../special/paranoia/accusations';
import { registerAction, type EngineCtx, type EngineEvent } from '../dispatch';
import type { CampaignState, LeashKind, LeashLogEntry } from '../state/types';
import { wardenOf } from '../warden/state';
import { compel, suppress, terminate } from '../leash/use';
import { ensureLeash, refreshLeash } from '../leash/weekly';
import { checkLeash } from '../leash/use';
import { logCosignDenied, refreshWardenLeash, rollCosign } from '../warden/leash';

// Importing this module registers the P6 Leash actions and day-end step (more are added by the use, loyalty and dilemma modules).

registerAction('leash/seed', (draft, _payload, ctx) => ensureLeash(draft, ctx.registries));

// Registered after P5's deadline step (actions/world), so a `leash −1` that lands on the refresh day belongs to the old week.
registerDayEndStep('mission_deadlines', (draft, ctx) => {
  const events = [...ensureLeash(draft, ctx.registries), ...refreshLeash(draft, ctx.registries)];
  if (events.some((e) => e.type === 'leash_refreshed')) events.push(...refreshWardenLeash(draft, ctx.registries)); // P13: her authorizations refill with the squad's
  return events;
});

// ---------------------------------------------------------------------------------------------
// Using the Leash

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const unitIdOf = (payload: unknown, action: string): string => {
  const id = isObj(payload) ? payload.unitId : undefined;
  if (typeof id !== 'string') throw new Error(`${action} needs { unitId }`);
  return id;
};

/**
 * P13: a squad Leash request that is valid goes to the warden first (while she is in service). A denial is logged (`denied`, copying her),
 * spends nothing and stops the request; a co-sign (or no warden) lets it run as before, with her event in front. An invalid request throws
 * before she is asked, so nothing is drawn for it.
 */
function askWarden(draft: CampaignState, ctx: EngineCtx, unitId: string, kind: LeashKind, context: LeashLogEntry['context']): { denied: boolean; events: EngineEvent[] } {
  if (wardenOf(draft) === null) return { denied: false, events: [] };
  const why = checkLeash(draft, ctx.registries, kind, unitId);
  if (why) throw new Error(why);
  const asked = rollCosign(draft, ctx, unitId, kind);
  return asked.ok ? { denied: false, events: asked.events } : { denied: true, events: [...asked.events, ...logCosignDenied(draft, ctx, unitId, kind, context)] };
}

registerAction('leash/compel', (draft, payload, ctx) => {
  const unitId = unitIdOf(payload, 'leash/compel');
  const refusal = draft.scene?.refusals?.find((r) => r.unitId === unitId);
  if (!draft.scene?.participants.includes(unitId) || !refusal) throw new Error('She has not refused an order in this scene: there is nothing to compel.');
  const asked = askWarden(draft, ctx, unitId, 'compel', 'scene'); // P13: the warden co-signs, or not
  if (asked.denied) return asked.events;
  const { forced, events } = compel(draft, ctx, { unitId, context: 'scene' });
  if (forced && draft.scene.refusals) draft.scene.refusals = draft.scene.refusals.filter((r) => r.unitId !== unitId);
  return [...asked.events, ...events, { type: 'scene_compelled', unitId, forced }, ...(forced ? actOnWarning(draft, ctx, unitId, 'leash') : [])]; // P12
});

registerAction('leash/suppress', (draft, payload, ctx) => {
  const unitId = unitIdOf(payload, 'leash/suppress');
  const open = draft.disloyalty?.open;
  if (!open || open.unitId !== unitId || (open.kind !== 'desertion' && open.kind !== 'mutiny')) {
    throw new Error('There is nothing to suppress: no desertion or attack is about to happen.');
  }
  const asked = askWarden(draft, ctx, unitId, 'suppress', open.kind); // P13
  if (asked.denied) return asked.events;
  const events = [...asked.events, ...suppress(draft, ctx, { unitId, context: open.kind })];
  events.push(...actOnWarning(draft, ctx, unitId, 'leash')); // P12
  if (open.at === 'night') events.push(...consumeSlots(draft, 1, ctx));
  return events;
});

registerAction('leash/terminate', (draft, payload, ctx) => {
  const unitId = unitIdOf(payload, 'leash/terminate');
  const asked = askWarden(draft, ctx, unitId, 'terminate', 'desertion'); // P13
  return asked.denied ? asked.events : [...asked.events, ...terminate(draft, ctx, unitId).events];
});
