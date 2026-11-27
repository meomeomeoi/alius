/**
 * The drill with her is a scene (P16b, plan Task 8; spec section 5, ruling 3). A partner drill with a physics to run and a contact that can be staged for her opens
 * a scene at the place that hosts the activity, with the drill pending (`Relation.craft.drillPending`: the key, the multiplier it was priced at, the day). `craft/drill_start`
 * stages the drill's contact by field and starts the hold; its outcome pays the drill at its multiplier, with her verdict and Regard by style (a holder) or a sign of being
 * seen together (another woman). The stop word pays nothing. Nothing is written without a craft-live holder, nothing draws.
 */
import type { Entry, Registries } from '../../content/types';
import { COMMANDER, entryAllowed, setBlocking } from '../blocking';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addSign } from '../dynamic/knowledge';
import { regardRise } from '../dynamic/regard';
import { startPhysics } from '../physics/run';
import { rateService, verdictOf } from '../practice/service';
import type { Verdict } from '../practice/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { registerDrillHooks, type DrillAt } from '../activities';
import { drillEffect, drillGate, drillMult, drilledToday, payDrill } from './drills';
import { craftHolders, craftLive, craftOn } from './gate';
import { enduranceOf } from './state';

/**
 * The contacts a drill of this physics can use with her now, in registry order: the entries whose main physics (the first it lists, the one a staged contact starts) is
 * the drill's and that pass `entryAllowed` for her (the content gate, her limits, the frame). Read by field, never by id. The scene's own affordances are checked when
 * one is staged (`startDrill`).
 */
export function drillContacts(state: CampaignState, reg: Registries, unitId: string, physicsId: string): Entry[] {
  return [...reg.blockingContacts.values()].filter((c) => ((c.physics as Array<{ id: string }> | undefined) ?? [])[0]?.id === physicsId && entryAllowed(state, reg, c, [unitId]));
}


/** The place a drill shared with a companion is run: the room that hosts the activity (read by `activityIds`), else none. */
const placeOf = (reg: Registries, activityId: string): string | undefined => [...reg.hubRooms.values()].find((r) => (r.activityIds as string[] | undefined)?.includes(activityId))?.sceneLocationId as string | undefined;

/**
 * A drill a companion shares (the activities' hook). With a physics to run and a contact that can be staged for her it waits for its scene (`Relation.craft.drillPending`,
 * the slot is the scene's); otherwise it pays now, at the multiplier of the partner. Either way the day is the pair's (`partnerDay`: another holder reads it as jealousy).
 */
function partner(draft: CampaignState, ctx: EngineCtx, at: DrillAt): { events: EngineEvent[]; scene?: { locationId: string } } {
  const reg = ctx.registries;
  const key = at.focus.drill!.key;
  const rel = draft.relations[at.companionId];
  if (rel === undefined || !craftOn(draft, reg)) return { events: [] };
  const mult = drillMult(draft, reg, at.companionId);
  const physics = enduranceOf(key);
  const place = placeOf(reg, at.activityId);
  if (physics !== null && place !== undefined && mult > 1 && !drilledToday(draft, key) && drillContacts(draft, reg, at.companionId, physics).length > 0) {
    (rel.craft ??= {}).drillPending = { key, mult, day: draft.day };
    return { events: [], scene: { locationId: place } };
  }
  (rel.craft ??= {}).partnerDay = draft.day;
  return { events: payDrill(draft, reg, key, { companionId: at.companionId, mult }) };
}

/** Installs the hooks the activities take (idempotent: the same hooks twice are one). */
export function installDrillHooks(): void {
  registerDrillHooks({ gate: drillGate, effect: drillEffect, partner });
}

// ---------------------------------------------------------------------------------------------
// The scene

/** The drill waiting for its scene for this unit today, or `undefined`. */
export function drillPendingOf(state: CampaignState, unitId: string): NonNullable<NonNullable<CampaignState['relations'][string]['craft']>['drillPending']> | undefined {
  const p = state.relations[unitId]?.craft?.drillPending;
  return p !== undefined && p.day === state.day ? p : undefined;
}

/**
 * `craft/drill_start`: stages the drill's contact (the first row, in registry order, that names its physics, passes `entryAllowed` for her and that the scene's place allows)
 * and starts the run. Throws with the reason when the drill is not pending, no scene with her is open, a run is on, or nothing can be staged. Draws nothing.
 */
export function startDrill(draft: CampaignState, ctx: EngineCtx, unitId: string, at?: number): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  const pending = drillPendingOf(draft, unitId);
  if (scene === undefined) throw new Error('craft/drill_start: no scene is open');
  if (pending === undefined) throw new Error('craft/drill_start: no drill is waiting for her');
  if (!scene.participants.includes(unitId)) throw new Error('craft/drill_start: she is not in the open scene');
  if (scene.physics !== undefined) throw new Error('craft/drill_start: a hold is running already');
  const physics = enduranceOf(pending.key);
  if (physics === null) throw new Error('craft/drill_start: that drill has no instrument');
  const events: EngineEvent[] = [];
  let staged: Entry | undefined;
  for (const c of drillContacts(draft, reg, unitId, physics)) {
    try {
      events.push(...setBlocking(draft, ctx, { person: unitId, field: 'contact', value: String(c.id), with: COMMANDER, ...(c.dir === 'either' ? { direction: 'from' as const } : {}) }, { at: at ?? scene.readIndex ?? scene.startIndex, source: 'chip' }));
      staged = c;
      break;
    } catch {
      // the place does not allow this one (an affordance it lacks, a posture it cannot leave): the next
    }
  }
  if (staged === undefined) throw new Error('craft/drill_start: no contact of this drill can be staged here');
  // staging a contact starts its main physics by itself; when a gate refused that, say why by starting it here
  if (scene.physics === undefined) events.push(...startPhysics(draft, ctx, { physicsId: physics, sourceKind: 'contact', sourceId: String(staged.id), holderId: unitId }));
  pending.runId = scene.physics!.id;
  return events;
}

/** The verdict a drill she ran earns when the scene's own is not in yet: clean is `pleased`, slips `adequate`, a collapse, a broken limit or a blackout `displeased`. */
function outcomeVerdict(result: string, slips: number): Verdict {
  if (result === 'collapse' || result === 'limit_broken' || result === 'blackout') return 'displeased';
  return slips > 0 ? 'adequate' : 'pleased';
}

/**
 * The outcome of the run a drill began (an after-action step): the stop word pays nothing (it is out of the fiction); any other end pays the drill at the multiplier
 * it was priced at. A holder rates it (`rateService` with the scene's verdict, else the run's), and a `pleased` one raises her Regard by `TUNING.craft.drill.regard`
 * (her style reads it); another woman gives no verdict, and each craft-live holder who is not she (and each other soul in the scene) gets the sign of being seen
 * together. The day is the pair's. The waiting drill is dropped. Writes nothing for an outcome that is not a drill's.
 */
export function noteDrillOutcome(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type !== 'physics_outcome' || typeof e.holderId !== 'string' || typeof e.runId !== 'string') continue;
    const unitId = e.holderId;
    const rel = draft.relations[unitId];
    const pending = rel?.craft?.drillPending;
    if (rel === undefined || pending === undefined || pending.runId !== e.runId) continue;
    const mult = pending.mult;
    delete rel.craft!.drillPending;
    if (e.result === 'stopped') continue;
    rel.craft!.partnerDay = draft.day;
    out.push(...payDrill(draft, reg, pending.key, { companionId: unitId, mult }));
    const sceneId = draft.scene?.id;
    if (craftLive(draft, reg, unitId)) {
      if (sceneId === undefined) continue;
      const tally = (typeof e.tally === 'object' && e.tally !== null ? e.tally : {}) as Record<string, number>;
      const verdict = verdictOf(draft, reg, unitId, sceneId) ?? outcomeVerdict(String(e.result), Number(tally.slips) || 0);
      out.push(...rateService(draft, ctx, unitId, verdict, 'engine', sceneId));
      if (verdict === 'pleased') out.push(...regardRise(draft, reg, unitId, 'value', TUNING.craft.drill.regard));
    } else {
      const witnesses = new Set([...craftHolders(draft, reg), ...(draft.scene?.participants ?? [])]);
      witnesses.delete(unitId);
      for (const id of witnesses) out.push(...addSign(draft, ctx, id, unitId, 'seen_together'));
    }
  }
  return out;
}

/** A scene that ended, was aborted or was cancelled takes the drill that waited for it (it is only ever the open scene's). */
export function dropPendingDrills(draft: CampaignState, events: readonly EngineEvent[]): void {
  if (!events.some((e) => e.type === 'scene_ended' || e.type === 'scene_aborted' || e.type === 'scene_cancelled')) return;
  for (const rel of Object.values(draft.relations)) {
    if (rel.craft?.drillPending !== undefined) delete rel.craft.drillPending;
  }
}
