import type { Registries } from '../content/types';
import { outsideActive } from '../engine/power/outside';
import { grudgeHolds, leaderOf } from '../engine/power/state';
import type { CampaignState } from '../engine/state/types';
import type { Directive, ContextBuilder } from '../llm/context';

/**
 * What the main model is told about the squad's power structure (P9b). Every id starts with `power:`; none starts with a
 * prefix P9, P9d or P11 reserved. The engine decides what is true; this layer only words it.
 */

const VOTE_PREFIX = 'power:vote:';
/** Ids that are derived from the state on every refresh (the others, `power:challenge` and `power:countermand`, are set by the controller). */
const DERIVED = ['power:vote:', 'power:leader', 'power:outside'] as const;

/**
 * Derived from the state, so they survive a reload:
 *  - `power:vote:<unitId>`: a unit the commander overruled in a squad vote may push back openly until the next day end;
 *  - `power:leader`: the squad leader, while she is in the scene (and the endorsement, when there is one);
 *  - `power:outside` (manual): outsiders address the leader as the one who really runs the unit, while outside perception is on.
 */
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
  const leader = leaderOf(state);
  if (leader) {
    const endorsed = state.power?.hierarchy?.endorsed === true;
    if (present.includes(leader.id)) {
      out.push({
        id: 'power:leader', expiresAfter: 'scene',
        text: `${leader.displayName} is the one the squad looks to and speaks for the others.${endorsed ? ` The commander has formally made ${leader.displayName} second-in-command.` : ''}`,
      });
    }
    if (outsideActive(state)) {
      out.push({
        id: 'power:outside', expiresAfter: 'manual',
        text: endorsed
          ? `Oversight treats ${leader.displayName} as the commander's second-in-command; outsiders address both.`
          : `Outsiders (oversight officers, traders, enemy commanders) address ${leader.displayName} as the one who really runs the unit.`,
      });
    }
  }
  return out;
}

/** Drops every directive this layer owns. */
export function clearPowerDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith('power:'));
}

/** Sets the derived directives and drops the ones that no longer hold; the challenge outcome ends with its scene. Called on every refresh. */
export function refreshPowerDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  builder.clearMatching((d) => DERIVED.some((p) => d.id.startsWith(p)) || (d.id === 'power:challenge' && state.scene === undefined));
  for (const d of powerDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
