import type { Registries } from '../../content/types';
import { injureCommander } from '../calendar';
import type { StartPayload } from '../combat/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { removeFromService } from '../leash/use';
import { nextId } from '../memory';
import { enqueueNight } from '../night';
import { enterState } from '../relations/graph';
import type { CampaignState, Confrontation, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { dispositionById } from '../worldOptions';
import { closeNight, emitSign, loyaltyOf, loyaltyRecord, requireOpen } from './state';

const SEVERITY_RANK: Record<Severity, number> = { minor: 0, moderate: 1, major: 2, extreme: 3 };
/** Events in her history that can set off a mutiny (at `major` or worse). */
const BETRAYALS: readonly string[] = ['lied_detected', 'broke_promise', 'coerced', 'decision_violated', 'crime_revealed'];

type Trigger = { kind: 'leash' | 'betrayal' | 'forced_cure'; day: number };

/**
 * The latest thing inside the trigger period that can set her off: a Leash use or a forced cure (recorded on her loyalty
 * record, always extreme) or a betrayal in her history at `minSeverity` or worse.
 */
export function mutinyTrigger(state: CampaignState, unitId: string, minSeverity: 'major' | 'extreme' = 'major'): Trigger | null {
  const within = (day: number): boolean => state.day - day <= TUNING.mutiny.triggerWindowDays;
  const found: Trigger[] = [];
  const rec = loyaltyOf(state, unitId);
  if (rec?.trigger && within(rec.trigger.day)) found.push({ kind: rec.trigger.kind, day: rec.trigger.day });
  for (const h of state.relations[unitId]?.history ?? []) {
    if (h.kind !== 'event' || !BETRAYALS.includes(h.type) || h.severity === undefined) continue;
    if (SEVERITY_RANK[h.severity] >= SEVERITY_RANK[minSeverity] && within(h.day)) found.push({ kind: 'betrayal', day: h.day });
  }
  return found.sort((a, b) => b.day - a.day)[0] ?? null;
}

const mutinySigns = (state: CampaignState, unitId: string) => (loyaltyOf(state, unitId)?.signs ?? []).filter((s) => s.about === 'mutiny');

/**
 * P8: when a mutiny can come from her. Her disposition level decides if it can at all, from which relationship states, after
 * how many days in the state and how many warning signs. `despises` at the guarded level is the P6 rule.
 */
export function mutinyRules(state: CampaignState, reg: Registries, unitId: string): { enabled: boolean; states: string[]; minDaysInState: number; minSigns: number } {
  return dispositionById(state, reg, unitId).mutiny;
}

/** Whether she is in a state a mutiny can come from right now (before signs are counted). */
function mayMutiny(state: CampaignState, reg: Registries, unitId: string): boolean {
  const unit = state.squad.find((u) => u.id === unitId);
  const rel = state.relations[unitId];
  if (!unit || !rel || unit.kind !== 'named' || !isLiving(unit)) return false;
  const rules = mutinyRules(state, reg, unitId);
  if (!rules.enabled) return false;
  if (rules.states.includes(rel.stateId)) return state.day - rel.stateSince >= rules.minDaysInState;
  return rel.stateId === 'obsessed' && mutinyTrigger(state, unitId, 'extreme') !== null;
}

/**
 * Named, living, in one of her level's mutiny states for its days (or `obsessed` with an extreme trigger), a trigger in the
 * last 3 days and the level's number of signs on different days (guarded: `despises`, 2 days, 2 signs).
 */
export function mutinyReady(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!mayMutiny(state, reg, unitId)) return false;
  const rules = mutinyRules(state, reg, unitId);
  if (rules.states.includes(state.relations[unitId].stateId) && mutinyTrigger(state, unitId) === null) return false;
  const signs = mutinySigns(state, unitId);
  return signs.length >= rules.minSigns && new Set(signs.map((s) => s.day)).size >= rules.minSigns;
}

/** Other named active units whose loyalty has loosened and whose Trust is low: they side with her (at most 2, lowest Trust first). */
export function sympathizers(state: CampaignState, unitId: string): string[] {
  return state.roster.activeIds
    .filter((id) => {
      const u = state.squad.find((x) => x.id === id);
      const rel = state.relations[id];
      return id !== unitId && u !== undefined && rel !== undefined && u.kind === 'named' && isLiving(u) && u.status === 'active'
        && rel.loyaltyBand !== 'steady' && rel.trust < TUNING.mutiny.sympathizerTrustBelow;
    })
    .sort((a, b) => state.relations[a].trust - state.relations[b].trust)
    .slice(0, TUNING.mutiny.maxSympathizers);
}

const groupOf = (open: Confrontation): string[] => [open.unitId, ...(open.sympathizers ?? [])];

/** The able active units who stay on the commander's side: the roster without her and her sympathizers. */
export function loyalUnits(state: CampaignState, unitId: string): string[] {
  const open = state.disloyalty?.open;
  const mutineers = new Set([unitId, ...(open?.unitId === unitId && open.sympathizers ? open.sympathizers : sympathizers(state, unitId))]);
  return state.roster.activeIds.filter((id) => {
    const u = state.squad.find((x) => x.id === id);
    return !mutineers.has(id) && u !== undefined && isLiving(u) && u.status === 'active';
  });
}

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

function startMutiny(draft: CampaignState, unitId: string): EngineEvent[] {
  const group = sympathizers(draft, unitId);
  const entry = {
    id: nextId(draft, 'n'), unitId, kind: 'mutiny', priority: TUNING.mutiny.nightPriority,
    framing: `${nameOf(draft, unitId)} is not alone: voices in the corridor, weapons out of the racks. This is about to turn violent.`,
    ignore: { event: 'dismissed', severity: 'major' as const }, expiresDay: draft.day + TUNING.disloyalty.night.expiresInDays,
  };
  draft.calendar.nightEventsQueue = draft.calendar.nightEventsQueue.filter((n) => !(n.unitId === unitId && n.kind === 'mutiny'));
  enqueueNight(draft, entry);
  (draft.disloyalty ??= { units: {} }).open = { kind: 'mutiny', unitId, day: draft.day, at: 'night', nightEntryId: entry.id, sympathizers: group };
  return [{ type: 'mutiny_started', unitId, sympathizers: group }];
}

/** Day-end part of the mutiny rule: escalating signs for a unit that may mutiny, and the daily roll once she is ready. */
export function mutinyDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const u of draft.squad.filter((x) => x.kind === 'named' && isLiving(x))) {
    const rec = loyaltyOf(draft, u.id);
    const rules = mutinyRules(draft, ctx.registries, u.id);
    const stateId = draft.relations[u.id]?.stateId;
    const candidate = rules.enabled && (rules.states.includes(stateId ?? '')
      || (stateId === 'obsessed' && mutinyTrigger(draft, u.id, 'extreme') !== null));
    if (!candidate) {
      if (rec?.signs.some((s) => s.about === 'mutiny')) rec.signs = rec.signs.filter((s) => s.about !== 'mutiny'); // a fresh warning next time
      continue;
    }
    const signs = mutinySigns(draft, u.id);
    const newest = Math.max(-Infinity, ...signs.map((s) => s.day));
    if (signs.length === 0) events.push(...emitSign(draft, ctx, u.id, 'mutiny', 1));
    else if (signs.length === 1 && rules.minSigns >= 2 && newest < draft.day) events.push(...emitSign(draft, ctx, u.id, 'mutiny', 2));
    // she is telegraphed: the newest sign is at least a day old
    const aged = mutinySigns(draft, u.id);
    const lastSign = Math.max(-Infinity, ...aged.map((s) => s.day));
    if (draft.disloyalty?.open || draft.day - lastSign < 1 || !mutinyReady(draft, ctx.registries, u.id)) continue;
    if (ctx.rng.chance(TUNING.mutiny.chancePerDay)) events.push(...startMutiny(draft, u.id));
  }
  return events;
}

// ---------------------------------------------------------------------------------------------
// Answers

/** The combat payload of the mutiny: she and her sympathizers on the enemy side, the commander exposed behind a cover unit. */
export function fightPayload(
  state: CampaignState, p: { formation: { front: string[]; back: string[] }; coverId?: string; allowRetry?: boolean },
): StartPayload {
  const open = requireOpen(state, 'mutiny');
  if (open.combatId !== undefined) throw new Error('The fight has already been fought: resolve it.');
  const loyal = new Set(loyalUnits(state, open.unitId));
  const ids = [...p.formation.front, ...p.formation.back];
  if (ids.length === 0) throw new Error('Choose who stands with you.');
  for (const id of ids) {
    if (!loyal.has(id)) throw new Error(`${nameOf(state, id)} cannot stand with you: only your able, loyal units can.`);
  }
  return {
    encounter: { enemies: [], mutineers: groupOf(open).map((unitId) => ({ unitId })), exposesCommander: true, danger: 0 },
    formation: { front: [...p.formation.front], back: [...p.formation.back] },
    ...(p.coverId !== undefined ? { coverId: p.coverId } : {}),
    allowRetry: p.allowRetry === true,
  };
}

/** The mutineers get away (hostile, gone) and the commander is hurt, unless he already was. */
function escape(draft: CampaignState, ctx: EngineCtx, open: Confrontation, how: 'defeat' | 'retreat' | 'yield', commanderHurt: boolean): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const id of groupOf(open)) {
    const u = draft.squad.find((x) => x.id === id);
    if (!u || !isLiving(u)) continue;
    removeFromService(draft, id, 'deserted');
    const rec = loyaltyRecord(draft, id);
    rec.desertedDay = draft.day;
    rec.stance = 'hostile';
    delete rec.returned;
    rec.signs = rec.signs.filter((s) => s.about !== 'mutiny');
    delete rec.trigger;
  }
  if (!commanderHurt && (draft.commander.injuredUntilDay ?? 0) <= draft.day) events.push(...injureCommander(draft, TUNING.combat.commanderInjuryDays));
  delete draft.disloyalty!.open;
  events.push({ type: 'mutiny_escaped', unitId: open.unitId, sympathizers: open.sympathizers ?? [], how });
  events.push(...closeNight(draft, ctx, open));
  return events;
}

/** Only with no loyal unit left: they walk out and the commander is beaten. */
export function yieldToMutiny(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const open = requireOpen(draft, 'mutiny');
  if (loyalUnits(draft, open.unitId).length > 0) throw new Error('You still have soldiers who can fight: stand with them or suppress it.');
  return escape(draft, ctx, open, 'yield', false);
}

/** The fight is won: everyone who rose lies at 1 HP for two days; she stays, resentful, and may now be terminated. */
function subdue(draft: CampaignState, open: Confrontation, fought: string[]): EngineEvent[] {
  for (const id of fought) {
    const u = draft.squad.find((x) => x.id === id);
    if (!u || !isLiving(u)) continue;
    u.status = 'injured';
    u.currentHp = 1;
    u.injuryDays = Math.max(u.injuryDays ?? 0, TUNING.mutiny.subduedInjuryDays);
    if (u.injuries.length === 0) u.injuries.push('wounded');
  }
  const events: EngineEvent[] = [];
  const rel = draft.relations[open.unitId];
  if (rel && rel.stateId !== 'resentful') events.push(enterState(draft, open.unitId, 'resentful', 'mutiny_subdued'));
  const rec = loyaltyRecord(draft, open.unitId);
  rec.cause = { kind: 'attack', day: draft.day };
  rec.signs = rec.signs.filter((s) => s.about !== 'mutiny');
  delete rec.trigger;
  delete draft.disloyalty!.open;
  events.push({ type: 'mutiny_subdued', unitId: open.unitId, sympathizers: open.sympathizers ?? [] });
  return events;
}

/** Consumes the result of the mutiny fight, exactly once (`open.combatId` must match `lastCombat`). */
export function resolveMutiny(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const open = requireOpen(draft, 'mutiny');
  if (open.combatId === undefined) throw new Error('The fight has not been fought yet.');
  if (draft.combat) throw new Error('The fight is still going on.');
  const result = draft.lastCombat;
  if (!result || result.id !== open.combatId) throw new Error('The result of that fight is no longer available.');
  const events = result.outcome === 'won'
    ? subdue(draft, open, (result.mutineers ?? []).map((m) => m.unitId))
    : escape(draft, ctx, open, result.outcome === 'retreated' ? 'retreat' : 'defeat', result.commanderInjured);
  if (result.outcome === 'won') events.push(...closeNight(draft, ctx, open));
  return events;
}

/** An unanswered mutiny at the next day end: a finished fight is resolved, otherwise the commander yields. */
export function resolveExpiredMutiny(draft: CampaignState, ctx: EngineCtx, open: Confrontation): EngineEvent[] {
  if (open.combatId !== undefined && !draft.combat && draft.lastCombat?.id === open.combatId) return resolveMutiny(draft, ctx);
  return escape(draft, ctx, open, 'yield', false);
}
