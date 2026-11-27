/**
 * `[ANTICIPATE]` (P16b, plan Task 17; ruling 20), the engine's half: the commander does for her what she was about to ask, so P16's `practice_anticipated` runs (favour, Regard and a
 * `yielded` sample of her reading with the motive `her`, once a scene). The chip is shown by her reading's axes only (`readOf.r` and `.p`, never the region); it stages the first judged
 * service of the commander's, in registry order, that fits what she is doing and passes `entryAllowed`. Its card and chip come with their prototype round (chunk c7). Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { Entry } from '../../content/types';
import { blockingLive, COMMANDER, entryAllowed, setBlocking } from '../blocking';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { dynamicOf } from '../dynamic/state';
import { asksForService, defaultActivity } from '../practice/service';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { craftLive } from './gate';

/** Does this service fit what she is doing: its `fits` has `any`, or one of the pair tags of her activity (no `fits` fits nothing)? */
function fitsHer(state: CampaignState, reg: Registries, unitId: string, row: Entry): boolean {
  const fits = (row.fits as string[] | undefined) ?? [];
  const blocking = state.scene?.blocking;
  const hers = reg.blockingActivities.get(blocking?.[unitId]?.activity ?? defaultActivity(reg) ?? '');
  const tags = (hers?.pairTags as string[] | undefined) ?? [];
  return fits.includes('any') || tags.some((t) => fits.includes(t));
}

/** The service the chip would stage: the first judged service of the commander's, in registry order, that fits her and is allowed for her (and is not what the commander is doing already). */
export function anticipateRow(state: CampaignState, reg: Registries, unitId: string): Entry | undefined {
  const now = state.scene?.blocking?.[COMMANDER]?.activity;
  for (const a of reg.blockingActivities.values()) {
    if (a.actor !== 'commander' || a.scope !== 'dynamic' || a.judged !== true || a.id === now) continue;
    if (fitsHer(state, reg, unitId, a) && entryAllowed(state, reg, a, [unitId])) return a;
  }
  return undefined;
}

/**
 * Is `[ANTICIPATE]` shown for her: the craft is live, she is in the open scene (the blocking live), she has a reading of the commander that is ready enough and believed enough
 * (`TUNING.craft.anticipate`), nothing of hers asks for service now, she has not been anticipated in this scene and there is a service to stage. Reads only: never the region.
 */
export function anticipateShown(state: CampaignState, reg: Registries, unitId: string): boolean {
  const scene = state.scene;
  const dyn = dynamicOf(state, unitId);
  if (scene === undefined || dyn === undefined || !scene.participants.includes(unitId) || !craftLive(state, reg, unitId) || !blockingLive(state, reg)) return false;
  const T = TUNING.craft.anticipate;
  if (dyn.readOf.updates <= 0 || dyn.readOf.r < T.minR || dyn.readOf.p < T.minP) return false;
  const rec = state.practices?.service?.[unitId];
  if (rec !== undefined && rec.sceneId === scene.id && rec.anticipated === true) return false;
  return !asksForService(state, unitId) && anticipateRow(state, reg, unitId) !== undefined;
}

/**
 * The commander does for her what she was about to ask: the service is staged as the commander's activity (`at` is the chat index of the chip; the scene's own pointer without one), P16's
 * after-action then anticipates it. Throws with the reason when it is not shown. Writes `Relation.craft.anticipate` (the directive's mark). Draws no rng.
 */
export function stageAnticipation(draft: CampaignState, ctx: EngineCtx, unitId: string, at?: number): EngineEvent[] {
  const reg = ctx.registries;
  if (!anticipateShown(draft, reg, unitId)) throw new Error('craft/anticipate: nothing to anticipate for her now.');
  const scene = draft.scene!;
  const row = anticipateRow(draft, reg, unitId)!;
  const events = setBlocking(draft, ctx, { person: COMMANDER, field: 'activity', value: String(row.id) }, { at: at ?? scene.readIndex ?? scene.startIndex, source: 'chip' });
  if (!events.some((e) => e.type === 'blocking_changed' && e.person === COMMANDER && e.field === 'activity')) throw new Error('craft/anticipate: the scene would not stage it.');
  ((draft.relations[unitId]!).craft ??= {}).anticipate = { scene: scene.id, exchange: scene.exchanges, activityId: String(row.id) };
  return events;
}
