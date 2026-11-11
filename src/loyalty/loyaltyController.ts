import type { EngineEvent } from '../engine/dispatch';
import { leashLog } from '../engine/leash/weekly';
import { TUNING } from '../engine/tuning';
import type { LoyaltyDeps } from './deps';
import {
  aftermathDirective, bandDirective, compelFailedDirective, compelledDirective, refusalDirective, refusalReason, traumaDirective,
} from './directives';

export type { LoyaltyDeps } from './deps';

export interface LoyaltyController {
  /** Gives an order to a unit in the open scene. Returns whether she refused. */
  order(unitId: string): boolean;
  /** Forces a refused order through the Leash. Returns whether it went through. */
  compel(unitId: string): boolean;
  onSceneOpened(): void;
  onSceneClosed(): void;
  onEvents(events: EngineEvent[]): void;
}

/** Directives that last for one scene and belong to this layer. */
const SCENE_PREFIXES = ['refusal:', 'loyalty:', 'leash_trauma:'] as const;

/**
 * The loyalty half of a scene: refusals and Leash uses become hard directives for the main model, a unit's loyalty band
 * and a recent Leash use colour the scene she is in, and a decided dilemma is narrated as a fixed fact.
 */
export function createLoyalty(deps: LoyaltyDeps): LoyaltyController {
  const nameOf = (unitId: string): string => deps.app.current().state?.squad.find((u) => u.id === unitId)?.displayName ?? unitId;
  const failure = (events: EngineEvent[]): EngineEvent | undefined => events.find((e) => e.type === 'error');
  const toastFailure = (e: EngineEvent): void => void deps.toast('error', String(e.message ?? e.code));

  function order(unitId: string): boolean {
    const events = deps.app.dispatch({ type: 'scene/order', payload: { unitId } });
    const bad = failure(events);
    if (bad) {
      toastFailure(bad);
      return false;
    }
    const refused = events.find((e) => e.type === 'scene_order')?.refused === true;
    const state = deps.app.current().state;
    if (refused && state) deps.context.setDirective(refusalDirective(unitId, nameOf(unitId), refusalReason(state, deps.registries(), unitId)));
    else deps.context.clearDirective(`refusal:${unitId}`);
    deps.refreshContext();
    return refused;
  }

  function compel(unitId: string): boolean {
    const events = deps.app.dispatch({ type: 'leash/compel', payload: { unitId, context: 'scene' } });
    const bad = failure(events);
    if (bad) {
      toastFailure(bad);
      return false;
    }
    const forced = events.find((e) => e.type === 'scene_compelled')?.forced === true;
    deps.context.setDirective(forced ? compelledDirective(unitId, nameOf(unitId)) : compelFailedDirective(unitId, nameOf(unitId)));
    deps.refreshContext();
    return forced;
  }

  function onSceneOpened(): void {
    const state = deps.app.current().state;
    if (!state?.scene) return;
    const log = leashLog(state);
    let set = false;
    for (const id of state.scene.participants) {
      const rel = state.relations[id];
      if (!rel) continue;
      const band = bandDirective(id, nameOf(id), rel.loyaltyBand);
      if (band) {
        deps.context.setDirective(band);
        set = true;
      }
      const recent = log.some((e) => e.unitId === id && state.day - e.day <= TUNING.leash.traumaDays);
      if (rel.flags.includes('leashed') && recent) {
        deps.context.setDirective(traumaDirective(id, nameOf(id)));
        set = true;
      }
    }
    if (set) deps.refreshContext();
  }

  function onSceneClosed(): void {
    deps.context.clearMatching((d) => d.id === 'dilemma' || SCENE_PREFIXES.some((p) => d.id.startsWith(p)));
    deps.refreshContext();
  }

  function onEvents(events: EngineEvent[]): void {
    let set = false;
    const sceneOpen = deps.app.current().state?.scene !== undefined;
    for (const e of events) {
      if (e.type !== 'dilemma_resolved' || e.nothing === true || typeof e.label !== 'string') continue;
      deps.context.setDirective(aftermathDirective(String(e.title ?? e.templateId), e.label, sceneOpen ? 'scene' : 'next_reply'));
      set = true;
    }
    if (set) deps.refreshContext();
  }

  return { order, compel, onSceneOpened, onSceneClosed, onEvents };
}
