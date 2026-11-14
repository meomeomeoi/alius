import type { Registries } from '../content/types';
import { commandStance, stanceEntry } from '../engine/discipline';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';
import { stanceDirective } from './directives';

/** The prefixes of the directives this layer owns (the `loyalty:` stance text shares its id with P6's band text and replaces it). */
const OWN_PREFIXES = ['loyalty:', 'threat:', 'discipline:'] as const;

export function clearDisciplineDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => OWN_PREFIXES.some((p) => d.id.startsWith(p)));
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
}
