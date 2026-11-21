/**
 * The hold feed (P15, plan R1, R8): relation events that land on a holder move her hold, through the one writer (`addHold`). It is
 * registered on the landing hook of `applyEventToUnit` (`registerEventLanded`, from `actions/dynamic.ts`), so engine relation events and
 * model-reported ones take the same path and there is no second pipeline. It draws nothing and answers `[]` while the dynamic is off.
 */
import type { Registries } from '../../content/types';
import { rulesOf } from '../bonds/rules';
import type { EngineEvent } from '../dispatch';
import type { EventIntent } from '../relations/intents';
import type { CampaignState, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicOn } from './gate';
import { addHold } from './hold';
import { dynamicOf } from './state';

/**
 * Relation event type → the key of `TUNING.dynamic.gains` it feeds. A `granted_demand` counts only for a `desire` template and a
 * `service_rated` only when the verdict (`kind`) is `pleased`. The last five are P16's: nothing in P15 produces them, the rows are ready.
 */
export const FEED_CAUSE: Readonly<Record<string, keyof typeof TUNING.dynamic.gains>> = Object.freeze({
  followed_lead: 'followed_lead',
  rule_accepted: 'rule_accepted',
  rule_broken: 'rule_broken',
  refused_demand: 'refusal',
  granted_demand: 'desire_granted',
  overrode_her: 'overrode_her',
  commander_enforced: 'commander_enforced',
  task_kept: 'task_kept',
  punishment_accepted: 'punishment_accepted',
  service_rated: 'service_rated_pleased',
  staging_held: 'staging_held',
  task_broken: 'task_broken',
});

/** The cause an event feeds on this holder, or `null` (not a feeding type, a demand that is not a desire, a verdict that is not `pleased`). */
function causeOf(reg: Registries, event: EventIntent): string | null {
  const cause = FEED_CAUSE[event.type];
  if (cause === undefined) return null;
  if (event.type === 'granted_demand') return event.templateId !== undefined && reg.demandTemplates.get(event.templateId)?.kind === 'desire' ? cause : null;
  if ((event.type as string) === 'service_rated') return event.kind === 'pleased' ? cause : null;
  return cause;
}

/**
 * Moves the hold of a holder the event landed on. Only the commander's own events count, only for a unit who already has her dynamic
 * (probes and seeds start it, not an event), and nothing happens while the dynamic is off. The severity is not read: the gain table is
 * flat. Returns the hold events.
 */
export function holdFeed(draft: CampaignState, reg: Registries, unitId: string, event: EventIntent, _severity: Severity): EngineEvent[] {
  if (event.actor !== 'commander' || !dynamicOn(draft, reg) || dynamicOf(draft, unitId) === undefined) return [];
  // one break of one rule counts once a day: whichever of the engine's check and a report lands second finds it counted (`applyRuleEvent` stamps the day)
  if (event.type === 'rule_broken' && event.ruleId !== undefined && rulesOf(draft).some((r) => r.id === event.ruleId && r.lastBrokenDay === draft.day)) return [];
  const cause = causeOf(reg, event);
  if (cause === null) return [];
  return addHold(draft, { registries: reg }, unitId, TUNING.dynamic.gains[cause as keyof typeof TUNING.dynamic.gains], cause);
}
