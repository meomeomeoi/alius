import type { Registries } from '../content/types';
import { grudgeHolds } from '../engine/power/state';
import type { CampaignState } from '../engine/state/types';
import type { Directive, ContextBuilder } from '../llm/context';

/**
 * What the main model is told about the squad's power structure (P9b). Every id starts with `power:`; none starts with a
 * prefix P9, P9d or P11 reserved. The engine decides what is true; this layer only words it.
 */

const VOTE_PREFIX = 'power:vote:';

/** A unit the commander overruled in a squad vote may push back openly until the next day end (from the state, so it survives a reload). */
export function powerDirectives(state: CampaignState, _reg: Registries, present: string[]): Directive[] {
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    if (!unit || !grudgeHolds(state, id)) continue;
    out.push({
      id: `${VOTE_PREFIX}${id}`, expiresAfter: 'scene',
      text: `${unit.displayName} voted against the commander's decision and was overruled; she may push back openly.`,
    });
  }
  return out;
}

/** Drops every directive this layer owns. */
export function clearPowerDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith('power:'));
}

/** Sets the vote directives of the units in the open scene and drops the ones that no longer hold. Called on every refresh. */
export function refreshPowerDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith(VOTE_PREFIX));
  for (const d of powerDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
