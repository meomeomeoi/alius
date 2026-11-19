import type { DemandCost } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { contentAllowed } from '../bonds/content';
import { publicityMismatch } from '../bonds/publicity';
import { WANT_VISIT_KIND } from '../bonds/scene';
import { relieveWant } from '../bonds/want';
import { queueNightSpec } from '../night';
import { pushMessage } from '../dms';
import { canEquip, equippedBy } from '../items';
import { nextId, revealCrime } from '../memory';
import { overrideHer } from '../personal/obedience';
import { commanderObeys, unitObeys } from '../personal/state';
import { assertiveness } from '../power/options';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { RARITIES, type CampaignState, type Demand, type Unit } from '../state/types';
import { TUNING } from '../tuning';
import { dispositionFor } from '../worldOptions';
import { inAcquaintance } from './acquaintance';
import { countDeed } from './deeds';
import { impunityOf } from './impunity';
import { addRecord, disciplineOf, holdDefiance } from './record';
import { addRestriction, restrictionReason } from './restrictions';
import { commandStance, stanceEntry } from './stance';
import { dislikesOf, likesOf } from '../development/profile';

/** Stances whose demands are "buying loyalty" when granted. */
const DRIVEN: readonly string[] = ['open_defiance', 'defiant_loyal'];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const costsOf = (t: Entry): DemandCost[] => (t.grantCost as DemandCost[] | undefined) ?? [];
const namedLiving = (state: CampaignState): Unit[] => state.squad.filter((u) => u.kind === 'named' && isLiving(u));

/** How often she opens a demand: `0.04 × Impunity / 50 × her disposition's refusalMult × her stance's demandWeight × the squad's demandMult`, at most 0.5. */
export function demandChance(state: CampaignState, reg: Registries, unitId: string): number {
  const unit = state.squad.find((u) => u.id === unitId);
  const i = impunityOf(state, reg, unitId);
  const stance = commandStance(state, reg, unitId);
  if (!unit || !i || stance === null) return 0;
  const T = TUNING.demands;
  const weight = Number(stanceEntry(reg, stance)?.demandWeight ?? 1);
  const mult = Number(dispositionFor(state, reg, unit).refusalMult);
  const squad = assertiveness(state, reg).demandMult; // P9b: a pushy squad asks more often
  return clamp(T.baseChance * (i.value / TUNING.impunity.stance.impunityHigh) * mult * weight * squad, 0, T.maxChance);
}

/** Demands she opened in the last `weekDays` days. */
const openedThisWeek = (state: CampaignState, unitId: string): number =>
  (state.discipline?.demandLog ?? []).filter((e) => e.unitId === unitId && state.day - e.day < TUNING.demands.weekDays).length;

const hasOpen = (state: CampaignState, unitId: string): boolean => (state.discipline?.demands ?? []).some((d) => d.unitId === unitId);

/** The unworn item of the stash that a `equip_item` cost would hand to her: the best rarity first. */
function itemFor(state: CampaignState, reg: Registries, unit: Unit, cost: Extract<DemandCost, { type: 'equip_item' }>) {
  const min = RARITIES.indexOf(cost.minRarity);
  return state.inventory
    .filter((i) => reg.items.get(i.itemId)?.slot === cost.slot && RARITIES.indexOf(i.rarity) >= min && equippedBy(state, i.uid) === undefined && canEquip(reg, unit, i) === null)
    .sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.upgrade - a.upgrade)[0];
}

/** The other named living unit an `other_unit_event` cost lands on: the one with the lowest Affinity. */
const otherUnit = (state: CampaignState, unitId: string): Unit | undefined =>
  namedLiving(state).filter((u) => u.id !== unitId).sort((a, b) => (state.relations[a.id]?.affinity ?? 0) - (state.relations[b.id]?.affinity ?? 0))[0];

/** Can this template be asked of her now? Its conditions hold and what it would ask for exists. */
function eligible(state: CampaignState, reg: Registries, unit: Unit, t: Entry): boolean {
  const rel = state.relations[unit.id];
  const c = (t.conditions ?? {}) as { stances?: string[]; impunity?: [number, number]; dispositionRanks?: [number, number]; tagsAny?: string[]; statesAny?: string[]; flagsNone?: string[]; publicityMismatch?: boolean };
  const stance = commandStance(state, reg, unit.id);
  const i = impunityOf(state, reg, unit.id)?.value;
  if (c.stances && (stance === null || !c.stances.includes(stance))) return false;
  if (c.impunity && (i === undefined || i < c.impunity[0] || i > c.impunity[1])) return false;
  const rank = Number(dispositionFor(state, reg, unit).rank);
  if (c.dispositionRanks && (rank < c.dispositionRanks[0] || rank > c.dispositionRanks[1])) return false;
  if (c.tagsAny && !c.tagsAny.some((tag) => [...likesOf(unit), ...dislikesOf(unit), ...unit.triggers].includes(tag))) return false;
  if (c.statesAny && !c.statesAny.includes(rel?.stateId ?? '')) return false;
  if (c.flagsNone && c.flagsNone.some((f) => rel?.flags.includes(f))) return false;
  if (c.publicityMismatch === true && !publicityMismatch(state, unit.id)) return false; // P9d
  for (const cost of costsOf(t)) {
    if (cost.type === 'equip_item' && !itemFor(state, reg, unit, cost)) return false;
    if (cost.type === 'other_unit_event' && !otherUnit(state, unit.id)) return false;
    if (cost.type === 'reveal_crime' && rel?.flags.includes('knows_crime')) return false;
  }
  return true;
}

/**
 * The templates she may ask now. A `desire` template only comes up when it is asked for (`kind: 'desire'`: Want opens it,
 * never the daily roll); every other call leaves them out.
 */
export function eligibleTemplates(state: CampaignState, reg: Registries, unitId: string, kind?: 'desire'): Entry[] {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit) || !state.relations[unitId]) return [];
  // P9d: a template tagged with a category that is off, or one of her own limits, is never asked
  return [...reg.demandTemplates.values()].filter((t) => (t.kind === 'desire') === (kind === 'desire') && contentAllowed(state, reg, t, unitId) && eligible(state, reg, unit, t));
}

/**
 * Opens a demand for her: a weighted, seeded pick among the eligible templates (never her last one while another exists).
 * It opens `undelivered`; the app words it and delivers it, or the day step delivers the template text. `null` when she is
 * not a named living unit, cannot take part in a scene (the brig, extra duty), already has an open demand, is over `perWeek` openings this week or nothing is eligible.
 */
export function openDemand(draft: CampaignState, ctx: EngineCtx, unitId: string, opts: { owed?: boolean; /** P9d: open a `desire` demand (Want's own cadence replaces the weekly cap). */ desire?: boolean } = {}): { demand: Demand; events: EngineEvent[] } | null {
  const reg = ctx.registries;
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit) || unitObeys(draft, unitId) || hasOpen(draft, unitId) || (opts.desire !== true && openedThisWeek(draft, unitId) >= TUNING.demands.perWeek)) return null;
  if (restrictionReason(draft, unitId, 'scene') !== null) return null; // in the brig or on duty she cannot be talked to: its [TALK] would always fail
  let pool = eligibleTemplates(draft, reg, unitId, opts.desire === true ? 'desire' : undefined);
  const last = [...(draft.discipline?.demandLog ?? [])].reverse().find((e) => e.unitId === unitId)?.templateId;
  if (pool.length > 1) pool = pool.filter((t) => t.id !== last);
  if (pool.length === 0) return null;
  const total = pool.reduce((s, t) => s + Number(t.weight), 0);
  let r = ctx.rng.float() * total;
  const tpl = pool.find((t) => (r -= Number(t.weight)) < 0) ?? pool[pool.length - 1];
  const stance = commandStance(draft, reg, unitId);
  const demand: Demand = {
    id: nextId(draft, 'd'), unitId, templateId: String(tpl.id), text: String(tpl.text).replaceAll('{name}', unit.displayName), day: draft.day,
    expiresDay: draft.day + TUNING.demands.expiresInDays, status: 'undelivered', impunityDriven: opts.desire !== true && stance !== null && DRIVEN.includes(stance),
    ...(opts.owed ? { owed: true } : {}),
  };
  const d = disciplineOf(draft);
  d.demands.push(demand);
  d.demandLog.push({ unitId, day: draft.day, templateId: demand.templateId });
  return { demand, events: [{ type: 'demand_opened', demandId: demand.id, unitId, templateId: demand.templateId }] };
}

/** The daily roll: at most one new demand per roll, two open at a time; a unit in her acquaintance period never asks. */
export function rollDemands(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  if ((draft.discipline?.demands.length ?? 0) >= TUNING.demands.maxOpen) return [];
  const candidates = namedLiving(draft).filter((u) => !hasOpen(draft, u.id) && openedThisWeek(draft, u.id) < TUNING.demands.perWeek && !inAcquaintance(draft, reg, u.id) && demandChance(draft, reg, u.id) > 0);
  if (candidates.length === 0) return [];
  const start = ctx.rng.int(0, candidates.length - 1); // no unit is always asked first
  for (let k = 0; k < candidates.length; k++) {
    const u = candidates[(start + k) % candidates.length];
    if (!ctx.rng.chance(demandChance(draft, reg, u.id))) continue;
    const opened = openDemand(draft, ctx, u.id);
    if (opened) return opened.events;
  }
  return [];
}

const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, TUNING.demands.textMax).trim();

/** Makes the demand `open`: with the worded text (cleaned, plain, at most 240) or the template's, and a DM from her unless she is in the room. */
export function deliverDemand(draft: CampaignState, demandId: string, text?: string): EngineEvent[] {
  const demand = draft.discipline?.demands.find((d) => d.id === demandId);
  if (!demand) throw new Error(`Unknown demand "${demandId}".`);
  if (demand.status !== 'undelivered') throw new Error('That demand was already delivered.');
  const worded = text === undefined ? '' : clean(text);
  if (worded !== '') demand.text = worded;
  demand.status = 'open';
  const viaDm = draft.scene?.participants.includes(demand.unitId) !== true;
  if (viaDm) demand.dmId = pushMessage(draft, demand.unitId, { from: demand.unitId, text: demand.text, day: draft.day, slot: draft.slot, read: false, initiated: true }).id;
  return [{ type: 'demand_delivered', demandId, unitId: demand.unitId, viaDm }];
}

/**
 * P14: a new wording of a demand that was delivered and waits for an answer (RETRY of the template text, REROLL). The text is cleaned
 * exactly like the first one; the DM that carried the demand shows the new words. Draws nothing.
 */
export function rewordDemand(draft: CampaignState, demandId: string, text: string): EngineEvent[] {
  const demand = draft.discipline?.demands.find((d) => d.id === demandId);
  if (!demand) throw new Error(`Unknown demand "${demandId}".`);
  if (demand.status !== 'open') throw new Error('Only a demand that waits for an answer can be reworded.');
  const worded = clean(text);
  if (worded === '') throw new Error('The wording is empty.');
  demand.text = worded;
  const carrier = demand.dmId === undefined ? undefined : draft.dms[demand.unitId]?.find((m) => m.id === demand.dmId);
  if (carrier) carrier.text = worded;
  return [{ type: 'demand_reworded', demandId, unitId: demand.unitId }];
}

/** Why the commander cannot grant this demand now, or `null`. */
export function grantProblem(state: CampaignState, reg: Registries, demandId: string): string | null {
  const demand = state.discipline?.demands.find((d) => d.id === demandId);
  const tpl = demand ? reg.demandTemplates.get(demand.templateId) : undefined;
  const unit = demand ? state.squad.find((u) => u.id === demand.unitId) : undefined;
  if (!demand || !tpl || !unit) return 'Unknown demand.';
  for (const cost of costsOf(tpl)) {
    if (cost.type === 'resource' && state.resources[cost.resource] < cost.amount) return `Not enough ${cost.resource} (needs ${cost.amount}).`;
    if (cost.type === 'equip_item' && !itemFor(state, reg, unit, cost)) return `There is no suitable ${cost.slot} to give.`;
    if (cost.type === 'reveal_crime' && state.relations[unit.id]?.flags.includes('knows_crime')) return 'She already knows.';
    if (cost.type === 'other_unit_event' && !otherUnit(state, unit.id)) return 'There is nobody else to bring into it.';
    if (cost.type === 'night_visit' && state.calendar.nightEventsQueue.some((e) => e.unitId === unit.id && e.kind === WANT_VISIT_KIND)) return 'She is already coming tonight.';
  }
  return null;
}

function pay(draft: CampaignState, ctx: EngineCtx, unit: Unit, cost: DemandCost): EngineEvent[] {
  const reg = ctx.registries;
  switch (cost.type) {
    case 'resource':
      draft.resources[cost.resource] -= cost.amount;
      return [{ type: 'resource_changed', resource: cost.resource, amount: -cost.amount }];
    case 'squad_stress': {
      const out: EngineEvent[] = [];
      for (const u of draft.squad.filter((x) => x.id !== unit.id && isLiving(x))) {
        const next = clamp(u.stress + cost.amount, 0, 100);
        if (next !== u.stress) out.push({ type: 'stress_changed', unitId: u.id, delta: next - u.stress });
        u.stress = next;
      }
      return out;
    }
    case 'relation_flag': {
      const flags = draft.relations[unit.id].flags;
      if (!flags.includes(cost.flagId)) flags.push(cost.flagId);
      return [];
    }
    case 'bench_self':
      return addRestriction(draft, { unitId: unit.id, kind: 'benched' });
    case 'equip_item': {
      const item = itemFor(draft, reg, unit, cost)!;
      unit.equipment[cost.slot] = item.uid;
      return [{ type: 'item_equipped', unitId: unit.id, uid: item.uid, slot: cost.slot }];
    }
    case 'reveal_crime':
      return revealCrime(draft, reg, [unit.id]);
    case 'night_visit': {
      const v = TUNING.bonds.want.visit;
      return queueNightSpec(draft, unit, { id: WANT_VISIT_KIND, kind: WANT_VISIT_KIND, chance: 1, priority: TUNING.bonds.want.satisfyPriority, trigger: 'daily', framing: v.framing, ignore: { ...v.ignore }, contentTags: [] } as never);
    }
    case 'other_unit_event': {
      const other = otherUnit(draft, unit.id)!;
      return [...applyEventToUnit(draft, reg, other.id, { type: cost.event, actor: 'commander', targets: [other.id], severity: cost.severity, evidence: 'a demand was granted', confidence: 1 }), ...evaluateAutomatic(draft, reg, other.id)];
    }
  }
}

/**
 * The refuse path of a demand, for anything that is refused the same way (P9c: a cancelled booking): `refused_demand`
 * (moderate) at her weight, ×`refuseHighMult` at Impunity 50 or more, where it also holds a moderate defiance; the deed
 * `demands_refused` is counted. Her relationship state is not re-evaluated here (the caller does that once).
 */
export function refuseLikeDemand(draft: CampaignState, ctx: EngineCtx, unitId: string, opts: { templateId?: string; evidence: string }): EngineEvent[] {
  const high = (impunityOf(draft, ctx.registries, unitId)?.value ?? 0) >= TUNING.impunity.stance.impunityHigh;
  const events = applyEventToUnit(draft, ctx.registries, unitId, {
    type: 'refused_demand', actor: 'commander', targets: [unitId], severity: 'moderate', ...(opts.templateId !== undefined ? { templateId: opts.templateId } : {}),
    evidence: opts.evidence, confidence: 1,
  } as never, { scale: high ? TUNING.demands.refuseHighMult : 1 });
  countDeed(draft, 'demands_refused');
  if (high) events.push(...holdDefiance(draft, unitId, 'moderate', 'demand'));
  return events;
}

/**
 * The commander answers an open demand. Grant: pays every cost (refused, changing nothing, when one cannot be paid), her
 * Trust and Affinity move by `grantDeltas` (a costly grant is a big gesture) and an impunity-driven grant adds to her record
 * ("buying loyalty"). Refuse: `refuseDeltas`, times 1.5 at Impunity 50 or more, where it also holds a moderate defiance; an owed
 * demand refused breaks a promise. `expired` is the day step's refusal.
 */
export function answerDemand(draft: CampaignState, ctx: EngineCtx, demandId: string, answer: 'grant' | 'refuse', opts: { expired?: boolean } = {}): EngineEvent[] {
  const reg = ctx.registries;
  const d = disciplineOf(draft);
  const demand = d.demands.find((x) => x.id === demandId);
  if (!demand) throw new Error(`Unknown demand "${demandId}".`);
  if (demand.status !== 'open') throw new Error('That demand has not been delivered yet.');
  const tpl = reg.demandTemplates.get(demand.templateId);
  const unit = draft.squad.find((u) => u.id === demand.unitId);
  const events: EngineEvent[] = [];
  d.demands = d.demands.filter((x) => x.id !== demandId);
  if (!tpl || !unit || !isLiving(unit)) return [{ type: 'demand_resolved', demandId, unitId: demand.unitId, answer: 'refuse', expired: true }];
  if (answer === 'grant') {
    d.demands.push(demand); // checked while it still exists
    const why = grantProblem(draft, reg, demandId);
    d.demands = d.demands.filter((x) => x.id !== demandId);
    if (why) throw new Error(why);
    for (const cost of costsOf(tpl)) events.push(...pay(draft, ctx, unit, cost));
    events.push(...applyEventToUnit(draft, reg, unit.id, {
      type: 'granted_demand', actor: 'commander', targets: [unit.id], severity: tpl.costly === true ? 'major' : 'minor', templateId: demand.templateId, evidence: 'a demand was granted', confidence: 1,
    }));
    // P9d: a soldier's own want is not a contest of authority: no deed, no record, and her Want falls at once by the template's `wantRelief`
    if (tpl.kind !== 'desire') countDeed(draft, 'demands_granted');
    if (demand.impunityDriven) events.push(...addRecord(draft, unit.id, TUNING.demands.grantRecord, 'demand_granted'));
    if (typeof tpl.wantRelief === 'number') events.push(...relieveWant(draft, unit.id, tpl.wantRelief, 'demand'));
  } else if (tpl.kind === 'desire') {
    // POSTPONE: the template's refuse deltas and nothing else (she is asked to wait, not defied)
    events.push(...applyEventToUnit(draft, reg, unit.id, {
      type: 'refused_demand', actor: 'commander', targets: [unit.id], severity: 'moderate', templateId: demand.templateId, evidence: 'a demand was postponed', confidence: 1,
    }));
  } else {
    events.push(...refuseLikeDemand(draft, ctx, unit.id, { templateId: demand.templateId, evidence: 'a demand was refused' }));
    if (demand.owed) {
      events.push(...applyEventToUnit(draft, reg, unit.id, { type: 'broke_promise', actor: 'commander', targets: [unit.id], severity: 'moderate', evidence: 'an owed demand was refused', confidence: 1 }));
    }
  }
  // P9c: a day the commander obeys her: refusing or putting off her demand is choosing against her (an expired one is nobody's choice)
  if (answer !== 'grant' && opts.expired !== true && commanderObeys(draft, unit.id)) events.push(...overrideHer(draft, ctx, unit.id, 'refused her demand on the day of obedience'));
  events.push(...evaluateAutomatic(draft, reg, unit.id));
  // P3b: putting a soldier's own want off is asking her to wait, not a refusal (memory does not remember it as one)
  events.push({ type: 'demand_resolved', demandId, unitId: unit.id, answer, ...(opts.expired ? { expired: true } : {}), ...(answer === 'refuse' && tpl.kind === 'desire' ? { postponed: true } : {}) });
  return events;
}

/**
 * The day-end part of demands: one that was never delivered is delivered with its template text, one that has lived its
 * `expiresInDays` days is refused (`expired`), and the openings of the week before are forgotten.
 */
export function demandDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const d = draft.discipline;
  if (!d) return [];
  const events: EngineEvent[] = [];
  for (const demand of [...d.demands]) if (demand.status === 'undelivered') events.push(...deliverDemand(draft, demand.id));
  for (const demand of [...d.demands]) {
    if (demand.expiresDay > draft.day + 1) continue;
    events.push(...answerDemand(draft, ctx, demand.id, 'refuse', { expired: true }));
  }
  d.demandLog = d.demandLog.filter((e) => draft.day - e.day < TUNING.demands.weekDays);
  return events;
}
