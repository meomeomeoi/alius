/**
 * The sparring hold (P16b, plan Task 18; spec section 9, ruling 4). Losing a sparring bout (a P9c wager) to a craft-live woman whose expectations put the target of the headlock contact (the
 * contact row with `headlock: true`, read by field) at `enjoys` or `craves` ends in a short scene at the training yard with that contact: she puts the commander's face in her armpit and the
 * hold runs on the physics the contact names; the tap is the way out. The squad that was at the yard to see it loses Regard for the commander (each witness's share, through `regardFall`)
 * and sees the sign `protocol_public`, unless it knows the dynamic. The escape game is P16c's.
 *
 * The wager keeps its own draw and fact: the hook after the bout (`registerAfterBout`, installed by `installCraftHooks`) draws nothing. Hidden: nothing here is a value.
 */
import type { Entry, Registries } from '../../content/types';
import { COMMANDER, entryAllowed, setBlocking } from '../blocking';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { expectationsOf } from '../dynamic/expectations';
import { addSign, levelOf } from '../dynamic/knowledge';
import { regardFall } from '../dynamic/regard';
import { whereabouts } from '../hub';
import { startPhysics } from '../physics/run';
import type { BoutResult } from '../personal/wagers';
import type { CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { craftLive } from './gate';

const NEXT_SLOT: Record<Slot, Slot> = { morning: 'afternoon', afternoon: 'evening', evening: 'night', night: 'morning' };

/** The contact of the sparring hold that passes `entryAllowed` for her (the content gate, her limits, the frame): the first row with `headlock: true`, in registry order. */
export function headlockContact(state: CampaignState, reg: Registries, unitId: string): Entry | undefined {
  return [...reg.blockingContacts.values()].find((c) => c.headlock === true && entryAllowed(state, reg, c, [unitId]));
}

/** Does the hold suit her: her attitude to a target of the contact is `enjoys` or `craves` (through `expectationsOf`: her own words, drift and the content gate included)? */
export function headlockWished(state: CampaignState, reg: Registries, unitId: string, contact: Entry): boolean {
  const worship = expectationsOf(state, reg, unitId).worship ?? {};
  return ((contact.target as string[] | undefined) ?? []).some((t) => worship[t]?.attitude === 'enjoys' || worship[t]?.attitude === 'craves');
}

/** The scene location of the hold: the place of the first activity that trains (an effect in `trainingEffects`), by the hub room that hosts it; `undefined` when none does. */
export function headlockPlace(reg: Registries): string | undefined {
  const trains = (id: string): boolean => ((reg.activities.get(id)?.effects as Array<{ type: string }> | undefined) ?? []).some((e) => TUNING.dynamic.style.trainingEffects.includes(e.type));
  const room = [...reg.hubRooms.values()].find((r) => ((r.activityIds as string[] | undefined) ?? []).some(trains));
  return room === undefined ? undefined : String(room.sceneLocationId);
}

/**
 * The hook after a sparring bout: when she won, the craft is live for her, the hold suits her and the yard will be open once the bout's slot is spent, the hold is offered
 * (`headlock_offered`) and kept for the day (`Relation.craft.headlock`) with the soldiers whose whereabouts are the yard in this slot. Draws nothing.
 */
export function offerHeadlock(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, bout: BoutResult): EngineEvent[] {
  const reg = ctx.registries;
  if (bout.kind !== 'sparring' || bout.winner !== 'unit' || !craftLive(draft, reg, bout.unitId)) return [];
  const contact = headlockContact(draft, reg, bout.unitId);
  const place = headlockPlace(reg);
  if (contact === undefined || place === undefined || !headlockWished(draft, reg, bout.unitId, contact)) return [];
  if (!((reg.locations.get(place)?.slots as string[] | undefined) ?? []).includes(NEXT_SLOT[draft.slot])) return [];
  const witnesses = whereabouts(draft, reg)
    .filter((w) => w.unitId !== bout.unitId && w.roomId !== null && reg.hubRooms.get(w.roomId)?.sceneLocationId === place)
    .map((w) => w.unitId)
    .filter((id) => { const u = draft.squad.find((x) => x.id === id); return u !== undefined && u.kind === 'named' && isLiving(u); });
  ((draft.relations[bout.unitId]!).craft ??= {}).headlock = { day: draft.day, witnesses };
  return [{ type: 'headlock_offered', unitId: bout.unitId, locationId: place }];
}

/** The mark of the hold waiting for her today, or `undefined`. */
export const headlockOf = (state: CampaignState, unitId: string): NonNullable<NonNullable<CampaignState['relations'][string]['craft']>['headlock']> | undefined => {
  const h = state.relations[unitId]?.craft?.headlock;
  return h !== undefined && h.day === state.day ? h : undefined;
};

/**
 * `craft/headlock_start`: the scene at the yard is open with her alone: the headlock contact is staged with her (the staging starts the physics the contact names) and the run is kept with
 * the mark. Throws with the reason when there is no mark for today, no scene with her, a hold is running or the contact cannot be staged here. Draws nothing.
 */
export function startHeadlock(draft: CampaignState, ctx: EngineCtx, unitId: string, at?: number): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  const mark = headlockOf(draft, unitId);
  if (scene === undefined) throw new Error('craft/headlock_start: no scene is open');
  if (mark === undefined) throw new Error('craft/headlock_start: she has no hold waiting');
  if (!scene.participants.includes(unitId)) throw new Error('craft/headlock_start: she is not in the open scene');
  if (scene.physics !== undefined) throw new Error('craft/headlock_start: a hold is running already');
  const contact = headlockContact(draft, reg, unitId);
  if (contact === undefined) throw new Error('craft/headlock_start: the hold is not open for her');
  const events = setBlocking(draft, ctx, { person: unitId, field: 'contact', value: String(contact.id), with: COMMANDER }, { at: at ?? scene.readIndex ?? scene.startIndex, source: 'chip' });
  const main = ((contact.physics as Array<{ id: string }> | undefined) ?? [])[0]?.id;
  // staging a contact starts its main physics by itself; when a gate refused that, say why by starting it here
  if (scene.physics === undefined && main !== undefined) events.push(...startPhysics(draft, ctx, { physicsId: main, sourceKind: 'contact', sourceId: String(contact.id), holderId: unitId }));
  if (scene.physics === undefined) throw new Error('craft/headlock_start: the hold did not begin');
  mark.runId = (scene.physics as { id: string }).id;
  return events;
}

/**
 * The outcome of the hold's run (an after-action step): the stop word is out of the fiction (nothing falls); any other end costs each soldier who watched, and who does not know the dynamic,
 * Regard for the commander (`humiliation`, the witness share) and shows her the sign `protocol_public`. The mark goes either way. Writes nothing for an outcome that is not the hold's.
 */
export function noteHeadlockOutcome(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type !== 'physics_outcome' || typeof e.holderId !== 'string' || typeof e.runId !== 'string') continue;
    const unitId = e.holderId;
    const mark = draft.relations[unitId]?.craft?.headlock;
    if (mark === undefined || mark.runId !== e.runId) continue;
    delete draft.relations[unitId]!.craft!.headlock;
    if (e.result === 'stopped') continue;
    for (const w of mark.witnesses) {
      if (!draft.squad.some((u) => u.id === w && isLiving(u)) || levelOf(draft, w, unitId) === 'knows_dynamic') continue;
      out.push(...regardFall(draft, reg, w, TUNING.craft.headlock.humiliation, { witness: true, cause: 'headlock' }), ...addSign(draft, ctx as EngineCtx, w, unitId, 'protocol_public'));
    }
  }
  return out;
}

/** A scene that ended, was aborted or was cancelled takes the hold that waited for it (it is only ever the day's and the open scene's). */
export function dropHeadlocks(draft: CampaignState, events: readonly EngineEvent[]): void {
  if (!events.some((e) => e.type === 'scene_ended' || e.type === 'scene_aborted' || e.type === 'scene_cancelled')) return;
  for (const rel of Object.values(draft.relations)) if (rel.craft?.headlock !== undefined) delete rel.craft.headlock;
}
