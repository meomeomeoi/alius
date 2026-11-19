import { revealPending, wardenOf } from '../engine/warden';
import type { Registries } from '../content/types';
import type { CampaignState } from '../engine/state/types';
import type { Directive } from '../llm/context';

/**
 * What the main model is told about the warden (P13). Every id starts with `warden:` and none starts with a prefix an older package
 * reserved. The engine decides what is true; this layer only words it. No text gives the commander a pronoun (lore §0).
 */

export const REVEAL_DIRECTIVE = 'warden:reveal';

/** Ids derived from the state on every refresh. */
export const WARDEN_DERIVED: readonly string[] = [REVEAL_DIRECTIVE];

/**
 * Derived from the state, so they survive a reload:
 *  - `warden:reveal`: until the commander has been shown who holds the controller (the prologue's reveal scene, or the notice), the
 *    soldiers do not speak of it as settled news.
 */
export function wardenDirectives(state: CampaignState, reg: Registries): Directive[] {
  const out: Directive[] = [];
  const warden = wardenOf(state);
  const unit = warden ? state.squad.find((u) => u.id === warden.unitId) : undefined;
  if (unit && revealPending(state, reg)) {
    out.push({
      id: REVEAL_DIRECTIVE, expiresAfter: 'manual',
      text: `AUTHOR TO WRITE: ${unit.displayName} holds the controller of the commander's implant, by order of the corporation. The commander has not been formally told yet: if it comes up, it comes out in this scene, not as old news.`,
    });
  }
  return out;
}
