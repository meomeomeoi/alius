import type { Registries } from '../../content/types';
import { consumeSlots } from '../calendar';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { loyaltyOf, loyaltyRecord } from '../loyalty/state';
import { addChronicle, addFact } from '../memory';
import { applyRelationDelta } from '../relationGain';
import { applyEventToUnit } from '../relations/effects';
import { roundAway } from '../relations/gain';
import { evaluateAutomatic, evaluateEvent, pushHistory } from '../relations/graph';
import type { EventIntent } from '../relations/intents';
import type { CampaignState, LeashKind, LeashLogEntry, Unit } from '../state/types';
import { traitEffects } from '../commander/traits';
import { TUNING } from '../tuning';
import { factionStanding } from '../world/state';
import { crimeEffectAmount, leashLog } from './weekly';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const unitOf = (state: CampaignState, id: string): Unit | undefined => state.squad.find((u) => u.id === id);

export interface LeashCost {
  trust: number;
  affinity: number;
  stress: number;
  failChance: number;
}

/**
 * What the target pays. Compel: base × the product of her defects' `costMult` on Trust and Affinity (rounded away
 * from zero) and `failChance` from the defects; both kinds add the crime's `leash_trust_cost`. A grunt has no Affinity.
 */
export function leashCost(state: CampaignState, reg: Registries, unitId: string, kind: 'compel' | 'suppress'): LeashCost {
  const unit = unitOf(state, unitId);
  let mult = 1;
  let failChance = 0;
  if (kind === 'compel') {
    for (const d of unit?.defects ?? []) {
      const lz = reg.defects.get(d.id)?.leash as { costMult: number; failChance?: number } | undefined;
      if (!lz) continue;
      mult *= lz.costMult;
      failChance = Math.max(failChance, lz.failChance ?? 0);
    }
  }
  const base = TUNING.leash[kind];
  const baseAffinity = kind === 'compel' ? TUNING.leash.compel.affinity : 0;
  return {
    trust: roundAway(base.trust * mult) + crimeEffectAmount(reg, state.commander.crimeId, 'leash_trust_cost'),
    affinity: unit?.kind === 'grunt' ? 0 : roundAway(baseAffinity * mult),
    stress: base.stress,
    failChance,
  };
}

/** Who sees the Leash used: the living named units of the open scene with her, else the expedition party, else the active roster. */
export function witnessesOf(state: CampaignState, unitId: string): string[] {
  const pool = state.scene?.participants.includes(unitId)
    ? state.scene.participants
    : state.expedition ? state.expedition.party : state.roster.activeIds;
  return pool.filter((id) => {
    const u = unitOf(state, id);
    return id !== unitId && u !== undefined && u.kind === 'named' && isLiving(u);
  });
}

/** Why a request cannot be filed right now, or null. Nothing is changed by asking. */
export function checkLeash(state: CampaignState, _reg: Registries, kind: LeashKind, unitId: string): string | null {
  const unit = unitOf(state, unitId);
  if (!unit) return `Unknown unit "${unitId}".`;
  if (!isLiving(unit)) return `${unit.displayName} is no longer in service.`;
  if (state.leash.authorizationsLeft < 1) return 'No Leash authorization is left this week.';
  if (kind === 'terminate') {
    const rec = loyaltyOf(state, unitId);
    if (!rec?.cause) return `There is no cause to terminate ${unit.displayName}: oversight needs an attack or repeated desertion.`;
    if (rec.deniedDay === state.day) return `Oversight already denied ${unit.displayName}'s termination today.`;
    if (state.scene || state.combat || state.expedition) return 'Finish the scene, fight or expedition before filing a termination.';
  }
  return null;
}

function nextNo(draft: CampaignState): number {
  const n = (draft.leash.seq ?? Math.max(0, ...leashLog(draft).map((e) => e.no))) + 1;
  draft.leash.seq = n;
  return n;
}

/** Spends an authorization (unless denied), writes the log entry and reports both. */
function bookUse(
  draft: CampaignState, unitId: string, kind: LeashKind, context: LeashLogEntry['context'], outcome: LeashLogEntry['outcome'],
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const no = nextNo(draft);
  const entry: LeashLogEntry = { no, unitId, kind, day: draft.day, context, outcome };
  draft.leash.log.push(entry);
  if (draft.leash.log.length > TUNING.leash.logMax) draft.leash.log.splice(0, draft.leash.log.length - TUNING.leash.logMax);
  events.push({ type: 'leash_used', kind, unitId, no, outcome });
  if (outcome !== 'denied') {
    draft.leash.authorizationsLeft = Math.max(0, draft.leash.authorizationsLeft - 1);
    events.push({ type: 'leash_changed', amount: -1, left: draft.leash.authorizationsLeft });
  }
  return events;
}

function addStress(draft: CampaignState, unitId: string, amount: number): EngineEvent[] {
  const u = unitOf(draft, unitId);
  if (!u || amount === 0) return [];
  const next = clamp(u.stress + amount, 0, 100);
  const delta = next - u.stress;
  u.stress = next;
  return delta === 0 ? [] : [{ type: 'stress_changed', unitId, delta }];
}

/** The target pays Trust and Affinity in full (no diminishing returns on losses), then carries the mark of the Leash. */
function payCost(draft: CampaignState, reg: Registries, unitId: string, cost: LeashCost, opts: { skipStress?: boolean } = {}): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const axis of ['trust', 'affinity'] as const) {
    if (cost[axis] === 0) continue;
    const applied = applyRelationDelta(draft, unitId, axis, -cost[axis], 'leash');
    if (applied !== 0) events.push({ type: 'relation_changed', unitId, axis, delta: applied, applied });
  }
  if (!opts.skipStress) events.push(...addStress(draft, unitId, cost.stress));
  const rel = draft.relations[unitId];
  if (rel && !rel.flags.includes('leashed')) rel.flags.push('leashed');
  pushHistory(draft, unitId, { day: draft.day, kind: 'event', type: 'coerced', severity: 'extreme' });
  events.push(...evaluateEvent(draft, reg, unitId, 'coerced'));
  loyaltyRecord(draft, unitId).trigger = { kind: 'leash', day: draft.day };
  return events;
}

const witnessScale = (u: Unit): number => {
  const w = TUNING.leash.witness;
  return clamp(w.base + w.autonomy * u.values.autonomy - w.corporate * u.values.corporate, w.min, w.max);
};

const COERCED: Omit<EventIntent, 'targets' | 'severity'> = { type: 'coerced', actor: 'commander', evidence: 'witnessed the Leash', confidence: 1 };

/**
 * Forces one order. The target pays; every witness reacts by their values (autonomy hates it, a corporate-minded
 * unit may approve). Returns whether the order goes through: a defect can make the burst fail, which still costs.
 * `skipStress` is for combat, where her stress already rose at once.
 */
export function compel(
  draft: CampaignState, ctx: EngineCtx, p: { unitId: string; context: LeashLogEntry['context']; skipStress?: boolean; roll?: boolean },
): { forced: boolean; events: EngineEvent[] } {
  const reg = ctx.registries;
  const why = checkLeash(draft, reg, 'compel', p.unitId);
  if (why) throw new Error(why);
  const cost = leashCost(draft, reg, p.unitId, 'compel');
  const forced = !(p.roll !== false && cost.failChance > 0 && ctx.rng.chance(cost.failChance));
  const events: EngineEvent[] = [];
  events.push(...payCost(draft, reg, p.unitId, cost, { skipStress: p.skipStress }));
  const witnesses = witnessesOf(draft, p.unitId);
  for (const w of witnesses) {
    const unit = unitOf(draft, w)!;
    events.push(...applyEventToUnit(draft, reg, w, { ...COERCED, targets: [w], severity: 'moderate' }, { scale: witnessScale(unit) }));
  }
  for (const id of [p.unitId, ...witnesses]) events.push(...evaluateAutomatic(draft, reg, id));
  events.push(...bookUse(draft, p.unitId, 'compel', p.context, forced ? 'done' : 'failed'));
  return { forced, events };
}

/**
 * Pays the Compels of a finished combat: one `combat` use per entry, her stress already rose when she was compelled and
 * a failed burst was already played out. A unit that is gone by now (a grunt that fell) still costs the authorization.
 */
export function settleCompels(draft: CampaignState, ctx: EngineCtx, unitIds: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const unitId of unitIds) {
    if (draft.leash.authorizationsLeft < 1) break;
    const unit = unitOf(draft, unitId);
    if (!unit || !isLiving(unit)) events.push(...bookUse(draft, unitId, 'compel', 'combat', 'done'));
    else events.push(...compel(draft, ctx, { unitId, context: 'combat', skipStress: true, roll: false }).events);
  }
  return events;
}

/** Stops a desertion or an attack in progress: she keeps her place and pays; the rest of the squad is shaken. */
export function suppress(draft: CampaignState, ctx: EngineCtx, p: { unitId: string; context: 'desertion' | 'mutiny' }): EngineEvent[] {
  const reg = ctx.registries;
  const why = checkLeash(draft, reg, 'suppress', p.unitId);
  if (why) throw new Error(why);
  const events: EngineEvent[] = [];
  events.push(...payCost(draft, reg, p.unitId, leashCost(draft, reg, p.unitId, 'suppress')));
  for (const u of draft.squad) {
    if (u.id !== p.unitId && isLiving(u)) events.push(...addStress(draft, u.id, TUNING.leash.suppress.squadStress));
  }
  events.push(...evaluateAutomatic(draft, reg, p.unitId));
  if (draft.disloyalty?.open?.unitId === p.unitId) delete draft.disloyalty.open;
  loyaltyRecord(draft, p.unitId).nextCheckDay = draft.day + TUNING.disloyalty.desertion.pauseDays;
  events.push(...bookUse(draft, p.unitId, 'suppress', p.context, 'done'));
  return events;
}

/**
 * Takes a unit out of the campaign for good (deserted or terminated) and cleans everything that pointed at her.
 * Refused while a scene, a fight or an expedition with her is open. Her items stay in the stash.
 */
export function removeFromService(draft: CampaignState, unitId: string, status: 'deserted' | 'terminated'): void {
  const unit = unitOf(draft, unitId);
  if (!unit) throw new Error(`Unknown unit "${unitId}".`);
  if (draft.scene?.participants.includes(unitId)) throw new Error(`${unit.displayName} is in the open scene: end it first.`);
  if (draft.combat?.combatants.some((c) => c.unitId === unitId)) throw new Error(`${unit.displayName} is in the open combat: finish it first.`);
  if (draft.expedition?.party.includes(unitId)) throw new Error(`${unit.displayName} is on the expedition: finish it first.`);
  unit.status = status;
  unit.equipment = {};
  delete unit.breakdown;
  draft.roster.activeIds = draft.roster.activeIds.filter((id) => id !== unitId);
  draft.calendar.nightEventsQueue = draft.calendar.nightEventsQueue.filter((n) => n.unitId !== unitId);
  if (draft.calendar.pendingScene?.unitId === unitId) delete draft.calendar.pendingScene;
  if (draft.proposals) draft.proposals = draft.proposals.filter((x) => x.unitId !== unitId);
  if (draft.disloyalty?.open?.unitId === unitId) delete draft.disloyalty.open;
  if (draft.calendar.nightEvent?.unitId === unitId) delete draft.calendar.nightEvent;
  const waiting = draft.dilemmas?.open;
  if (waiting) waiting.units = waiting.units.filter((id) => id !== unitId);
}

/** The oversight's approval of a termination: the corporation's base, a little per point of its standing, and the commander's traits. */
export function terminateChance(state: CampaignState, reg: Registries): number {
  const own = state.commander.corporationId;
  const base = (own === null ? undefined : (reg.corporations.get(own)?.leash as { approval: number } | undefined)?.approval) ?? 0.5;
  const t = TUNING.leash.terminate;
  const traits = traitEffects(state, reg, 'terminate_approval').reduce((n, fx) => n + fx.amount, 0);
  return clamp(base + t.approvalPerStanding * (own === null ? 0 : factionStanding(state, own)) + traits, t.approvalMin, t.approvalMax);
}

/**
 * Asks oversight for a permanent deactivation. The approval roll is the corporation's base plus a little per point of
 * its standing. An approved request costs one authorization; a denied one costs none and cannot be filed again today.
 */
export function terminate(draft: CampaignState, ctx: EngineCtx, unitId: string): { approved: boolean; events: EngineEvent[] } {
  const reg = ctx.registries;
  const why = checkLeash(draft, reg, 'terminate', unitId);
  if (why) throw new Error(why);
  const unit = unitOf(draft, unitId)!;
  const chance = terminateChance(draft, reg);
  if (!ctx.rng.chance(chance)) {
    loyaltyRecord(draft, unitId).deniedDay = draft.day;
    return { approved: false, events: bookUse(draft, unitId, 'terminate', 'desertion', 'denied') };
  }
  const events: EngineEvent[] = [];
  const herNight = draft.slot === 'night' && draft.calendar.nightEvent?.unitId === unitId;
  removeFromService(draft, unitId, 'terminated');
  events.push(...bookUse(draft, unitId, 'terminate', 'desertion', 'done'));
  if (herNight) events.push(...consumeSlots(draft, 1, ctx)); // her night is over: the day rolls on instead of waiting for her
  const reactors = draft.squad.filter((u) => u.id !== unitId && u.kind === 'named' && isLiving(u));
  for (const u of reactors) {
    events.push(...applyEventToUnit(draft, reg, u.id, {
      type: 'decision_violated', actor: 'commander', targets: [u.id], severity: 'extreme', evidence: 'a termination was filed',
      valueAxes: [{ axis: 'mercy', direction: -1 }, { axis: 'ingroup', direction: -1 }], confidence: 1,
    }));
  }
  for (const u of reactors) events.push(...evaluateAutomatic(draft, reg, u.id));
  addFact(draft, {
    about: [unitId], text: `${unit.displayName} was terminated by corporate order on the commander's request.`,
    tags: ['leash', 'terminated'], importance: 5, day: draft.day, knownBy: ['*'],
  });
  addChronicle(draft, { kind: 'scene', day: draft.day, text: `Day ${draft.day}: ${unit.displayName} was terminated through the Leash.` });
  events.push({ type: 'unit_terminated', unitId });
  return { approved: true, events };
}
