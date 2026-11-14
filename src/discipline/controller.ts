import type { EngineEvent } from '../engine/dispatch';
import { clearDisciplineDirectives, disciplineDirectives } from './context';
import type { DisciplineDeps } from './deps';
import { measureLabel, threatDirective } from './directives';

export type { DisciplineDeps } from './deps';

export interface DisciplineController {
  /** Reads the events of one dispatch: a threat becomes a directive, a lapse and (in debug mode) a sabotage a toast. */
  onEvents(events: EngineEvent[]): void;
  onSceneOpened(): void;
  onSceneClosed(): void;
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

  return { onEvents, onSceneOpened, onSceneClosed };
}
