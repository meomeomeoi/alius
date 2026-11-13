import type { Registries } from '../../content/types';
import type { CheckRoute, RouteCheck } from '../../content/schemas';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { trustBand, type TrustBand } from '../relations/bands';
import { applyRelationDelta } from '../relationGain';
import { socialRank } from '../social';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { commanderProfile, descriptor } from './profile';

/**
 * P7 check routes: a check lists the ways to get it done (body, ask a unit, social, item, bypass). `routeChoices`
 * tells the UI which are open and why not; `resolveRoute` takes one. Overview P10: the content validator guarantees
 * a non-body route exists, so a weak commander is never at a dead end.
 */

export interface RouteChoice {
  /** Index into `check.routes`. */
  route: number;
  kind: CheckRoute['kind'];
  label: string;
  /** Why the route cannot be taken now, or null. */
  disabled: string | null;
  /** Delegate routes: the units that can be asked. */
  unitIds?: string[];
}

export interface RoutePick { route: number; unitId?: string }
export interface RouteScope {
  /** The units that can be asked (a run: the party). Absent = every living squad unit. */
  unitIds?: string[];
}

const TRUST_ORDER: readonly TrustBand[] = ['none', 'low', 'guarded', 'solid', 'high'];
const DEFAULT_TRUST_CHECK: TrustBand = 'guarded';
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function askable(state: CampaignState, route: Extract<CheckRoute, { kind: 'delegate' }>, scope: RouteScope): string[] {
  const roles = route.unitFilter?.roles;
  return state.squad
    .filter((u) => isLiving(u) && (scope.unitIds === undefined || scope.unitIds.includes(u.id)) && (roles === undefined || roles.includes(u.roleId)))
    .map((u) => u.id);
}

function choiceOf(state: CampaignState, reg: Registries, route: CheckRoute, index: number, scope: RouteScope): RouteChoice {
  const base = { route: index, kind: route.kind };
  switch (route.kind) {
    case 'body': {
      const have = commanderProfile(state).body[route.stat];
      return {
        ...base,
        label: `${route.stat.toUpperCase()}: ${descriptor(route.stat, route.min)} or better`,
        disabled: have >= route.min ? null : `Needs ${route.stat} ${descriptor(route.stat, route.min)} or better; yours is ${descriptor(route.stat, have)}.`,
      };
    }
    case 'social': {
      const have = socialRank(state, route.stat);
      return {
        ...base,
        label: `${route.stat.toUpperCase()} ${route.min}`,
        disabled: have >= route.min ? null : `Needs ${route.stat} rank ${route.min}; yours is ${have}.`,
      };
    }
    case 'item': {
      const name = String(reg.items.get(route.itemId)?.name ?? route.itemId);
      return {
        ...base,
        label: `Use ${name}`,
        disabled: state.inventory.some((i) => i.itemId === route.itemId) ? null : `No ${name} in the inventory.`,
      };
    }
    case 'bypass': {
      const { resource, amount } = route.cost;
      return {
        ...base,
        label: `Pay ${amount} ${resource}`,
        disabled: state.resources[resource] >= amount ? null : `Not enough ${resource} (needs ${amount}).`,
      };
    }
    case 'delegate': {
      const unitIds = askable(state, route, scope);
      return {
        ...base,
        label: `Ask a unit (Trust: ${route.cost.trustCheck ?? DEFAULT_TRUST_CHECK})`,
        disabled: unitIds.length > 0 ? null : 'No unit is available to ask.',
        unitIds,
      };
    }
  }
}

/** Every route of a check with its label and, when closed, the reason. Pure. */
export function routeChoices(state: CampaignState, reg: Registries, check: RouteCheck, scope: RouteScope): RouteChoice[] {
  return check.routes.map((route, i) => choiceOf(state, reg, route, i, scope));
}

/**
 * Takes a route. Throws with the closed route's reason (or `Unit … is not available`) on a stale or disabled pick, so
 * the action changes nothing. A delegate request goes through the unit's loyalty and Trust: loyalty `breaking` refuses;
 * Trust at or above the check's band complies (sometimes with a remark); exactly one band below is a demand (a
 * refusal until P9 gives it a price); lower refuses. Only a compliance pays the affinity and stress cost.
 */
export function resolveRoute(
  draft: CampaignState, ctx: EngineCtx, check: RouteCheck, pick: RoutePick, scope: RouteScope,
): { passed: boolean; events: EngineEvent[] } {
  const choice = routeChoices(draft, ctx.registries, check, scope)[pick.route];
  if (!choice) throw new Error(`The check "${check.id}" has no route ${String(pick.route)}.`);
  if (choice.disabled) throw new Error(choice.disabled);
  const route = check.routes[pick.route];
  const events: EngineEvent[] = [];
  let passed = true;

  switch (route.kind) {
    case 'body':
    case 'social':
    case 'item':
      break;
    case 'bypass': {
      draft.resources[route.cost.resource] -= route.cost.amount;
      events.push({ type: 'resource_changed', resource: route.cost.resource, amount: -route.cost.amount });
      break;
    }
    case 'delegate': {
      if (typeof pick.unitId !== 'string') throw new Error('Pick a unit to ask.');
      if (!choice.unitIds?.includes(pick.unitId)) throw new Error(`Unit "${pick.unitId}" is not available for this request.`);
      const unit = draft.squad.find((u) => u.id === pick.unitId)!;
      const rel = draft.relations[unit.id];
      const have = TRUST_ORDER.indexOf(trustBand(rel?.trust ?? 0));
      const need = TRUST_ORDER.indexOf(route.cost.trustCheck ?? DEFAULT_TRUST_CHECK);
      if (!rel || rel.loyaltyBand === 'breaking' || have < need - 1) {
        passed = false;
        events.push({ type: 'delegate_refused', unitId: unit.id });
      } else if (have < need) {
        passed = false;
        events.push({ type: 'delegate_demand', unitId: unit.id });
      } else {
        const { affinityCost = 0, stress = 0 } = route.cost;
        if (affinityCost > 0) {
          const applied = applyRelationDelta(draft, unit.id, 'affinity', -affinityCost, `route:${check.id}`);
          events.push({ type: 'relation_changed', unitId: unit.id, axis: 'affinity', applied });
        }
        if (stress > 0) {
          const next = Math.min(100, unit.stress + stress);
          events.push({ type: 'stress_changed', unitId: unit.id, delta: next - unit.stress });
          unit.stress = next;
        }
        if (ctx.rng.chance(TUNING.commander.delegateRemarkChance)) events.push({ type: 'delegate_remark', unitId: unit.id });
      }
      break;
    }
  }
  events.push({ type: 'route_taken', checkId: check.id, kind: route.kind, passed });
  return { passed, events };
}
