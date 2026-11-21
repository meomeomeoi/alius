import { bondTierOf } from '../engine/bonds';
import { TUNING } from '../engine/tuning';
import { describeOrder, revealPending, wardenOf, wardenOverrideOpen } from '../engine/warden';
import type { Registries } from '../content/types';
import type { CampaignState } from '../engine/state/types';
import type { Directive } from '../llm/context';

/**
 * What the main model is told about the warden (P13). Every id starts with `warden:` and none starts with a prefix an older package
 * reserved. The engine decides what is true; this layer only words it. No text gives the commander a pronoun (lore §0).
 */

export const REVEAL_DIRECTIVE = 'warden:reveal';

/** Ids derived from the state on every refresh. */
export const ARGUE_DIRECTIVE = 'warden:argue';
export const ROMANCE_DIRECTIVE = 'warden:romance';
export const WARNING_DIRECTIVE = 'warden:warning';
export const REMOTE_DIRECTIVE = 'warden:remote';
export const WARDEN_DERIVED: readonly string[] = [REVEAL_DIRECTIVE, ARGUE_DIRECTIVE, ROMANCE_DIRECTIVE, WARNING_DIRECTIVE, REMOTE_DIRECTIVE];

/**
 * Derived from the state, so they survive a reload:
 *  - `warden:reveal`: until the commander has been shown who holds the controller (the prologue's reveal scene, or the notice), the
 *    soldiers do not speak of it as settled news;
 *  - `warden:argue`: while the scene with her alone is the argument over an override, what she overrode, what she wants and that only a
 *    real compromise moves her;
 *  - `warden:romance`: while she is in a romantic-tier state and in the scene, any tenderness between her and the commander runs through
 *    the controller she holds;
 *  - `warden:remote`: while oversight runs the controller (the investigation is open and nobody holds the leash), every scene knows the
 *    rules are corporate and automatic: quota, obedience, no argument;
 *  - `warden:warning`: from her first warning until defiance falls below 50, while she is in the scene: what she has warned and that she
 *    means it.
 */
export function wardenDirectives(state: CampaignState, reg: Registries): Directive[] {
  const out: Directive[] = [];
  const warden = wardenOf(state);
  const unit = warden ? state.squad.find((u) => u.id === warden.unitId) : undefined;
  const ov = wardenOverrideOpen(state);
  if (unit && warden && ov && ov.arguing !== undefined && state.scene?.id === ov.arguing) {
    out.push({
      id: ARGUE_DIRECTIVE, expiresAfter: 'scene',
      text: `AUTHOR TO WRITE: ${unit.displayName} has overridden the commander's order: ${describeOrder(state, reg, ov.order)}. She wants: ${ov.altLabel}. She can be talked round only by a real compromise.`,
    });
  }
  if (unit && warden && state.scene?.participants.includes(unit.id) && bondTierOf(state, reg, unit.id) === 'romantic') {
    out.push({
      id: ROMANCE_DIRECTIVE, expiresAfter: 'scene',
      text: `AUTHOR TO WRITE: ${unit.displayName} holds the commander's controller. Any tenderness between them runs through that power; she knows it and so does the commander.`,
    });
  }
  if (unit && warden && state.scene?.participants.includes(unit.id) && warden.warnings.length > 0 && warden.defiance >= TUNING.warden.escalation.warning1) {
    const final = warden.warnings.length >= 2;
    out.push({
      id: WARNING_DIRECTIVE, expiresAfter: 'manual',
      text: `AUTHOR TO WRITE: ${unit.displayName} has warned the commander that open defiance has gone too far${final ? ': this is the final warning' : ''}. She holds the controller and will use it if it goes on.`,
    });
  }
  if (state.leashswap?.remote !== undefined && wardenOf(state) === null) {
    out.push({
      id: REMOTE_DIRECTIVE, expiresAfter: 'manual',
      text: 'AUTHOR TO WRITE: Nobody holds the commander\'s Leash while oversight investigates. The controller runs on corporate rules, quota and obedience, with no argument and no exceptions. The squad knows the warden is gone and does not yet know how this ends.',
    });
  }
  if (unit && revealPending(state, reg)) {
    out.push({
      id: REVEAL_DIRECTIVE, expiresAfter: 'manual',
      text: `AUTHOR TO WRITE: ${unit.displayName} holds the controller of the commander's implant, by order of the corporation. The commander has not been formally told yet: if it comes up, it comes out in this scene, not as old news.`,
    });
  }
  return out;
}
