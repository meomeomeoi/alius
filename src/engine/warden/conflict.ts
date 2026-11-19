import type { Registries } from '../../content/types';
import { checkActivity } from '../activities';
import { bondTierOf } from '../bonds/profile';
import { dilemmaOptions } from '../dilemma/flow';
import { isLiving } from '../economy';
import { herPick } from '../personal/obedience';
import { computeDeltas } from '../relations/deltas';
import type { CampaignState, Severity } from '../state/types';
import type { WorldEffect } from '../world/types';
import { wardenOf, type Expectation, type ExpectationKind, type WardenOrder } from './state';

/**
 * What she objects to (P13 §3): the closed conflict rules per expectation kind and her alternative. Pure: nothing here draws, and
 * code reads an expectation by its kind, an activity by its `idle` / `quota` fields and an order by its `wardenRule`, never by id.
 */

/** The model's reading of a `personal` expectation (the optional judge): `minor` counts half, `major` the full weight. */
export interface Judged { expectationId: string; conflict: 'none' | 'minor' | 'major' }
export interface Conflict { expectationId: string; weight: number }

const SEVERITY_RANK: Severity[] = ['minor', 'moderate', 'major', 'extreme'];
const atLeastMajor = (s: Severity): boolean => SEVERITY_RANK.indexOf(s) >= SEVERITY_RANK.indexOf('major');
/** An ally at or below this share of her HP is "nearly down" for a risky order. */
const NEARLY_DOWN = 0.25;
/** A unit with this much stress or more should not be sent out. */
const STRESSED = 70;
/** A mission due within this many days makes an idle slot a conflict. */
const DUE_SOON = 2;

type Ctx = { state: CampaignState; reg: Registries; warden: string };
type Rule = (c: Ctx, order: WardenOrder) => boolean;

const isOwnStanding = (c: Ctx, id: string): boolean => id === 'own' || id === c.state.commander.corporationId;
const hasAxis = (fx: WorldEffect, axis: string, direction: -1 | 1): boolean =>
  fx.type === 'unit_event' && (fx.valueAxes ?? []).some((a) => a.axis === axis && a.direction === direction);

function optionEffects(c: Ctx, index: number): WorldEffect[] | null {
  return c.state.dilemmas?.open?.options?.[index]?.effects ?? null;
}

/** Does the option hurt units: stress on the party, HP lost, or a major event that costs a target Trust or Affinity? */
function harmsSquad(c: Ctx, effects: WorldEffect[]): boolean {
  const open = c.state.dilemmas!.open!;
  for (const fx of effects) {
    if (fx.type === 'party_stress' && fx.amount > 0) return true;
    if (fx.type === 'party_hp' && fx.pct < 0) return true;
    if (fx.type !== 'unit_event' || !atLeastMajor(fx.severity)) continue;
    const reached = fx.targets === 'subject' ? (open.subjectId ? [open.subjectId] : []) : fx.targets === 'witnesses' ? open.witnessIds ?? [] : open.units;
    for (const id of reached) {
      if (id === c.warden) continue;
      const d = computeDeltas(c.state, c.reg, id, {
        type: fx.event, actor: 'commander', targets: [id], severity: fx.severity, evidence: 'her reading', confidence: 1,
        ...(fx.valueAxes ? { valueAxes: fx.valueAxes.map((a) => ({ axis: a.axis as never, direction: a.direction })) } : {}),
      });
      if (d.trust + d.affinity < 0) return true;
    }
  }
  return false;
}

const unitOf = (c: Ctx, id: string) => c.state.squad.find((u) => u.id === id);
const shouldNotGo = (c: Ctx, id: string): boolean => {
  const u = unitOf(c, id);
  return u !== undefined && isLiving(u) && (u.status === 'injured' || u.injuries.length > 0 || u.stress >= STRESSED);
};
const orderRule = (c: Ctx, orderId: string): unknown => c.reg.orders.get(orderId)?.wardenRule;
const missionDueSoon = (c: Ctx): boolean => c.state.missions.offered.some((m) => m.deadlineDay !== undefined && m.deadlineDay - c.state.day <= DUE_SOON);

const RULES: Record<Exclude<ExpectationKind, 'personal'>, Rule> = {
  keep_me_close: (c, o) => {
    if (o.kind === 'roster') return !o.activeIds.includes(c.warden);
    if (o.kind === 'expedition') return !o.unitIds.includes(c.warden);
    return o.kind === 'activity' && o.companionId !== undefined && o.companionId !== c.warden;
  },
  protect_squad: (c, o) => {
    if (o.kind === 'expedition') return o.unitIds.some((id) => shouldNotGo(c, id));
    if (o.kind === 'combat_order') {
      if (orderRule(c, o.orderId) !== 'risk') return false;
      return (c.state.combat?.combatants ?? []).some((x) => x.side === 'squad' && !x.downed && x.hp > 0 && x.hp / x.maxHp <= NEARLY_DOWN);
    }
    if (o.kind === 'dilemma') {
      const fx = optionEffects(c, o.index);
      return fx !== null && harmsSquad(c, fx);
    }
    return false;
  },
  no_civilian_harm: (c, o) => o.kind === 'dilemma' && (optionEffects(c, o.index) ?? []).some((fx) => hasAxis(fx, 'mercy', -1)),
  meet_quota: (c, o) => {
    if (o.kind === 'activity') return c.reg.activities.get(o.activityId)?.idle === true && missionDueSoon(c);
    if (o.kind !== 'dilemma') return false;
    return (optionEffects(c, o.index) ?? []).some((fx) => (fx.type === 'resource' && fx.resource === 'credits' && fx.amount < 0) || (fx.type === 'faction' && fx.amount < 0 && isOwnStanding(c, fx.factionId)));
  },
  obey_oversight: (c, o) => {
    if (o.kind === 'combat_order') return orderRule(c, o.orderId) === 'retreat';
    if (o.kind !== 'dilemma') return false;
    return (optionEffects(c, o.index) ?? []).some((fx) => hasAxis(fx, 'corporate', -1) || (fx.type === 'faction' && fx.amount < 0 && isOwnStanding(c, fx.factionId)));
  },
  no_romance_with_others: (c, o) => o.kind === 'activity' && o.companionId !== undefined && o.companionId !== c.warden && bondTierOf(c.state, c.reg, o.companionId) === 'romantic',
};

/**
 * The expectation an order cuts across, and its weight: the highest weight among the rule matches (the first listed wins a tie) and,
 * for a `personal` expectation of hers, the judge's reading (`minor` half the weight, `major` all of it; an id that is not a personal
 * expectation of the current warden is ignored). Null when nobody holds the leash or nothing conflicts.
 */
export function conflictOf(state: CampaignState, reg: Registries, order: WardenOrder, judged?: Judged): Conflict | null {
  const w = wardenOf(state);
  if (!w) return null;
  const c: Ctx = { state, reg, warden: w.unitId };
  let best: Conflict | null = null;
  const offer = (x: Expectation, weight: number): void => {
    if (weight > 0 && (best === null || weight > best.weight)) best = { expectationId: x.id, weight };
  };
  for (const x of w.expectations) {
    if (x.kind === 'personal') continue; // by rule never: only the judge can name it
    if (RULES[x.kind](c, order)) offer(x, x.weight);
  }
  if (judged && judged.conflict !== 'none') {
    const x = w.expectations.find((e) => e.id === judged.expectationId);
    if (x && x.kind === 'personal') offer(x, Math.round(x.weight * (judged.conflict === 'major' ? 1 : 0.5) * 100) / 100);
  }
  return best;
}

export interface Alternative { order: WardenOrder | null; label: string }

const HOLD = (label = 'Hold: nothing is done'): Alternative => ({ order: null, label });
const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

function activityAlt(c: Ctx, order: Extract<WardenOrder, { kind: 'activity' }>, kind: ExpectationKind | undefined): Alternative {
  const { state, reg } = c;
  const label = (id: string): string => String(reg.activities.get(id)?.name ?? id);
  if (kind === 'meet_quota') {
    const work = [...reg.activities.values()].find((a) => a.quota === true && checkActivity(state, reg, { activityId: String(a.id) }) === null);
    return work ? { order: { kind: 'activity', activityId: String(work.id) }, label: label(String(work.id)) } : HOLD();
  }
  const next = { activityId: order.activityId, companionId: c.warden };
  if (kind === 'keep_me_close' || kind === 'no_romance_with_others') {
    return checkActivity(state, reg, next) === null
      ? { order: { kind: 'activity', ...next }, label: `${label(order.activityId)} with ${nameOf(state, c.warden)}` }
      : HOLD();
  }
  return HOLD();
}

function listAlt(c: Ctx, ids: string[], kind: ExpectationKind | undefined, make: (ids: string[]) => WardenOrder): Alternative {
  let next = ids;
  if (kind === 'keep_me_close') next = ids.includes(c.warden) ? ids : [...ids.slice(0, -1), c.warden];
  else if (kind === 'protect_squad') next = ids.filter((id) => !shouldNotGo(c, id));
  else return HOLD();
  if (next.length === 0 || (next.length === ids.length && next.every((id, i) => id === ids[i]))) return HOLD();
  // her goes in the last unit's place; the action's own limits are checked again when COMPLY runs it
  const label = kind === 'keep_me_close' ? `With ${nameOf(c.state, c.warden)} in place of the last unit` : 'Without the units who are hurt or at their limit';
  return { order: make(next), label };
}

/**
 * What she wants instead, as an order the engine can run (or `null`: hold, nothing happens and no slot is spent) and its label for the
 * chip. An activity: the same one with her as companion, or the quota activity; a roster or an expedition: her in place of the last
 * unit, or without the units who are hurt; a dilemma: her pick, else the first enabled option that does not conflict; a combat order:
 * hold. No warden or an unknown expectation: hold. Draws nothing.
 */
export function herAlternative(state: CampaignState, reg: Registries, order: WardenOrder, expectationId: string): Alternative {
  const w = wardenOf(state);
  if (!w) return HOLD();
  const c: Ctx = { state, reg, warden: w.unitId };
  const kind = w.expectations.find((x) => x.id === expectationId)?.kind;
  switch (order.kind) {
    case 'activity': return activityAlt(c, order, kind);
    case 'roster': return listAlt(c, order.activeIds, kind, (activeIds) => ({ kind: 'roster', activeIds }));
    case 'expedition': return listAlt(c, order.unitIds, kind, (unitIds) => ({ kind: 'expedition', ...(order.missionId !== undefined ? { missionId: order.missionId } : {}), unitIds }));
    case 'dilemma': {
      const options = dilemmaOptions(state, reg);
      const hers = herPick(state, reg, w.unitId);
      // an option that asks how it is done (a route check) cannot be chosen for the commander
      const plain = (i: number): boolean => options[i]?.disabled === null && state.dilemmas?.open?.options?.[i]?.routeCheck === undefined;
      const ok = (i: number): boolean => i !== order.index && plain(i) && conflictOf(state, reg, { kind: 'dilemma', index: i }) === null;
      const index = hers !== null && hers !== order.index && plain(hers) ? hers : options.findIndex((_, i) => ok(i));
      return index >= 0 ? { order: { kind: 'dilemma', index }, label: options[index].label } : HOLD();
    }
    case 'combat_order': return HOLD('Hold: the order is not given');
  }
}
