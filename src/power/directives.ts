import type { Registries } from '../content/types';
import { isLiving } from '../engine/economy';
import { askFirstHolds } from '../engine/power/herCall';
import { outsideActive } from '../engine/power/outside';
import { grudgeHolds, leaderOf } from '../engine/power/state';
import type { CampaignState } from '../engine/state/types';
import type { Directive, ContextBuilder } from '../llm/context';

/**
 * What the main model is told about the squad's power structure (P9b). Every id starts with `power:`; none starts with a
 * prefix P9, P9d or P11 reserved. The engine decides what is true; this layer only words it.
 */

const VOTE_PREFIX = 'power:vote:';
const ASK_FIRST_PREFIX = 'power:ask_first:';
const HER_CALL_PREFIX = 'power:herCall:';
/** "The scene after the run": the day the squad is back and the next one. */
const HER_CALL_DAYS = 1;
/** Ids that are derived from the state on every refresh (the others, `power:challenge` and `power:countermand`, are set by the controller). */
const DERIVED = ['power:vote:', 'power:leader', 'power:outside', 'power:ask_first:', 'power:herCall:'] as const;

/** How her last call of the latest run went, while that run is recent; read from the report, so it follows the chat and never outlives it. */
function herCallOf(state: CampaignState, unitId: string): 'good' | 'bad' | undefined {
  const report = state.lastExpedition;
  if (!report || state.day - report.day > HER_CALL_DAYS) return undefined;
  return report.herCalls?.filter((c) => c.unitId === unitId).at(-1)?.outcome;
}

/**
 * Derived from the state, so they survive a reload:
 *  - `power:vote:<unitId>`: a unit the commander overruled in a squad vote may push back openly until the next day end;
 *  - `power:leader`: the squad leader, while she is in the scene (and the endorsement, when there is one);
 *  - `power:herCall:<unitId>` (P9e): she took a decision herself in the run that just ended (its report's `herCalls`, her last call), while she is in the scene and the report is from today or yesterday;
 *  - `power:ask_first:<unitId>` (P9e): the commander ordered her to ask before she decides anything in the field, while she is in the scene;
 *  - `power:outside` (manual): outsiders address the leader as the one who really runs the unit, while outside perception is on.
 */
export function powerDirectives(state: CampaignState, _reg: Registries, present: string[]): Directive[] {
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    if (unit && askFirstHolds(state, id)) {
      out.push({ id: `${ASK_FIRST_PREFIX}${id}`, expiresAfter: 'scene', text: `The commander has ordered ${unit.displayName} to ask before she decides anything in the field.` });
    }
    const call = unit && isLiving(unit) ? herCallOf(state, id) : undefined;
    if (unit && call) out.push({ id: `${HER_CALL_PREFIX}${id}`, expiresAfter: 'scene', text: `${unit.displayName} took the decision herself in the field; it went ${call === 'good' ? 'well' : 'badly'}.` });
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
