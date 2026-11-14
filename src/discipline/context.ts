import type { Registries } from '../content/types';
import { commandStance, stanceEntry } from '../engine/discipline';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';
import { demandDirective, reputationDirective, stanceDirective } from './directives';

/** The prefixes of the directives this layer owns (the `loyalty:` stance text shares its id with P6's band text and replaces it). */
const OWN_PREFIXES = ['loyalty:', 'threat:', 'discipline:', 'demand:', 'reputation:'] as const;

export function clearDisciplineDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id === 'nickname' || OWN_PREFIXES.some((p) => d.id.startsWith(p)));
}

/**
 * Sets `loyalty:<unitId>` for every named unit in the open scene from her current command stance (so a stance that changes
 * during the scene is told on the next render) and drops the ones of units who are no longer in it. A unit whose stance
 * the content does not describe keeps whatever `loyalty:` directive she has (the P6 band text). Called on every refresh.
 */
export function disciplineDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  const present = new Set(state.scene?.participants ?? []);
  builder.clearMatching((d) => d.id.startsWith('loyalty:') && !present.has(d.id.slice('loyalty:'.length)));
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    const stance = commandStance(state, reg, id);
    const entry = stance === null ? undefined : stanceEntry(reg, stance);
    if (!unit || !entry) continue;
    builder.setDirective(stanceDirective(id, unit.displayName, entry, state.relations[id]?.loyaltyBand ?? 'steady'));
  }
  // an open demand of a unit in the room is pressed in the scene; one that is answered (or whose unit left) is dropped
  builder.clearMatching((d) => d.id.startsWith('demand:') && !(state.discipline?.demands ?? []).some((x) => x.status === 'open' && `demand:${x.unitId}` === d.id && present.has(x.unitId)));
  for (const d of state.discipline?.demands ?? []) {
    const unit = state.squad.find((u) => u.id === d.unitId);
    if (d.status === 'open' && present.has(d.unitId) && unit) builder.setDirective(demandDirective(d.unitId, unit.displayName, d.text));
  }
}

/**
 * `reputation:<id>` for every active nickname whose entry carries its own directive text; refreshed on every call so a
 * nickname that has left, or a pack that changed, is dropped. The first-time line (`nickname`) is the controller's.
 */
export function reputationDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith('reputation:'));
  for (const a of state.commander.reputation?.active ?? []) {
    const text = (reg.reputations.get(a.id)?.effects as { directive?: unknown } | undefined)?.directive;
    if (typeof text === 'string' && text !== '') builder.setDirective(reputationDirective(a.id, text));
  }
}
