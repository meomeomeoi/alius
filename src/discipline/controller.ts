import type { EngineEvent } from '../engine/dispatch';
import { commandStance, stanceEntry } from '../engine/discipline';
import { clearDisciplineDirectives, disciplineDirectives } from './context';
import type { DisciplineDeps } from './deps';
import { measureLabel, punishDirective, threatDirective } from './directives';

export type { DisciplineDeps } from './deps';

export interface DisciplineController {
  /** Reads the events of one dispatch: a threat becomes a directive, a lapse and (in debug mode) a sabotage a toast. */
  onEvents(events: EngineEvent[]): void;
  onSceneOpened(): void;
  onSceneClosed(): void;
  /** The menu path: imposes a measure (and the days of a brig) on a unit. Toasts and returns false when the engine refuses. */
  punish(unitId: string, measure: string, days?: number): boolean;
  /** UNDO — not what I meant: an application read from dialogue or a threat. Toasts and returns false when it cannot be undone. */
  undo(id: string): boolean;
}

/**
 * The discipline half of a scene (P9): the stance text of every present unit and what she makes of a threat, as hard
 * directives for the main model. The engine decides what is true; this layer only words it. Nothing here reaches the
 * mechanic model.
 */
export function createDiscipline(deps: DisciplineDeps): DisciplineController {
  const nameOf = (unitId: string): string => deps.app.current().state?.squad.find((u) => u.id === unitId)?.displayName ?? unitId;

  function onEvents(events: EngineEvent[]): void {
    let set = false;
    for (const e of events) {
      if (e.type === 'threat_registered') {
        const unitId = String(e.unitId);
        deps.context.setDirective(threatDirective(unitId, nameOf(unitId), measureLabel(deps.registries(), String(e.measure)), e.believed === true));
        set = true;
      } else if (e.type === 'threat_lapsed') {
        deps.toast('info', `A threat lapsed: ${nameOf(String(e.unitId))} saw the commander back down.`);
      } else if (e.type === 'covert_sabotage' && deps.settings().debug) {
        deps.toast('info', `Covert sabotage (${String(e.kind)}).`); // nobody is named: the squad does not know who did it either
      }
    }
    if (set) deps.refreshContext();
  }

  function onSceneOpened(): void {
    const state = deps.app.current().state;
    if (!state?.scene) return;
    disciplineDirectives(deps.context, state, deps.registries());
    deps.refreshContext();
  }

  function onSceneClosed(): void {
    clearDisciplineDirectives(deps.context);
    deps.refreshContext();
  }

  const failure = (events: EngineEvent[]): EngineEvent | undefined => events.find((e) => e.type === 'error');

  function punish(unitId: string, measure: string, days?: number): boolean {
    const events = deps.app.dispatch({ type: 'discipline/punish', payload: { unitId, measure, ...(days !== undefined ? { days } : {}) } });
    const bad = failure(events);
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    const state = deps.app.current().state;
    const reg = deps.registries();
    const name = nameOf(unitId);
    const label = measureLabel(reg, measure);
    if (state?.scene?.participants.includes(unitId)) {
      // she is in the room: her next reply reacts to it, in the stance she is in now
      const stance = commandStance(state, reg, unitId);
      deps.context.setDirective(punishDirective(unitId, name, label, String(stance === null ? '' : stanceEntry(reg, stance)?.name ?? stance)));
      deps.refreshContext();
    } else {
      deps.toast('info', `The commander imposed ${label} on ${name}.`);
    }
    return true;
  }

  function undo(id: string): boolean {
    const unitId = deps.app.current().state?.discipline?.applications.find((a) => a.id === id)?.unitId
      ?? deps.app.current().state?.discipline?.threats.find((t) => t.id === id)?.unitId;
    const events = deps.app.dispatch({ type: 'discipline/undo', payload: { id } });
    const bad = failure(events);
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    if (unitId !== undefined) {
      deps.context.clearDirective(`discipline:${unitId}`);
      if (id.startsWith('th')) deps.context.clearDirective(`threat:${unitId}`);
    }
    deps.refreshContext();
    deps.toast('info', 'Undone.');
    return true;
  }

  return { onEvents, onSceneOpened, onSceneClosed, punish, undo };
}
