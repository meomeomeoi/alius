import type { Registries } from '../../content/types';
import { consumeSlots } from '../calendar';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { arcDayStep } from '../arcs';
import { intimidationBonus } from '../commander/profile';
import { removeFromService } from '../leash/use';
import { nextId } from '../memory';
import { enqueueNight } from '../night';
import { applyRelationDelta } from '../relationGain';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { socialRank } from '../social';
import type { CampaignState, Confrontation } from '../state/types';
import { TUNING } from '../tuning';
import { applyWorldEffects } from '../world/effects';
import { postRumor, rumorPostedEvent } from '../world/missions';
import { mutinyDayStep, resolveExpiredMutiny } from './mutiny';
import { closeNight, emitSign, loyaltyOf, loyaltyRecord, requireOpen } from './state';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Chance per check that a breaking unit walks: low Trust, cold Affinity and high stress raise it, a warm bond lowers it. */
export function desertionChance(state: CampaignState, reg: Registries, unitId: string): number {
  const unit = state.squad.find((u) => u.id === unitId);
  const rel = state.relations[unitId];
  if (!unit || !rel) return 0;
  const t = TUNING.disloyalty.desertion;
  let p = t.base + t.perTrustBelow * Math.max(0, t.trustRef - rel.trust);
  p += rel.affinity < 0 ? t.affinityNegative * -rel.affinity : -t.affinityPositive * rel.affinity;
  p += t.perStressAbove * Math.max(0, unit.stress - t.stressRef);
  for (const d of unit.defects) p += (reg.defects.get(d.id)?.desertionMod as number | undefined) ?? 0;
  return clamp(p, t.min, t.max);
}

/** Whether a desertion check may run for her now: nothing is open, the pause is over, and a sign at least a day old was given. */
export function mayDesert(state: CampaignState, unitId: string): boolean {
  if (state.disloyalty?.open) return false;
  const rec = loyaltyOf(state, unitId);
  if (!rec) return false;
  if (rec.nextCheckDay !== undefined && state.day < rec.nextCheckDay) return false;
  const newest = Math.max(-Infinity, ...rec.signs.filter((s) => s.about === 'desertion').map((s) => s.day));
  return state.day - newest >= TUNING.disloyalty.desertion.minSignAgeDays;
}

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** Opens a desertion attempt: counts it (the second gives cause for Terminate), queues the night entry, opens the confrontation. */
export function startDesertion(draft: CampaignState, unitId: string, at: Confrontation['at']): EngineEvent[] {
  const rec = loyaltyRecord(draft, unitId);
  rec.attempts += 1;
  if (rec.attempts >= TUNING.leash.terminate.attemptsForCause) rec.cause = { kind: 'desertion', day: draft.day };
  const open: Confrontation = { kind: 'desertion', unitId, day: draft.day, at };
  if (at === 'night') {
    const entry = {
      id: nextId(draft, 'n'), unitId, kind: 'desertion', priority: TUNING.disloyalty.night.desertion,
      framing: `${nameOf(draft, unitId)} is about to walk out. This is the moment to say something, or to stop her.`,
      ignore: { event: 'dismissed', severity: 'moderate' as const }, expiresDay: draft.day + TUNING.disloyalty.night.expiresInDays,
    };
    draft.calendar.nightEventsQueue = draft.calendar.nightEventsQueue.filter((n) => !(n.unitId === unitId && n.kind === 'desertion'));
    enqueueNight(draft, entry);
    open.nightEntryId = entry.id;
  }
  (draft.disloyalty ??= { units: {} }).open = open;
  return [{ type: 'desertion_attempt', unitId, at }];
}

/** The check made when an expedition is about to leave: a breaking party member may walk instead. Returns the attempt or null. */
export function missionStartCheck(draft: CampaignState, ctx: EngineCtx, unitIds: string[]): EngineEvent[] | null {
  for (const id of unitIds) {
    if (draft.relations[id]?.loyaltyBand !== 'breaking' || !mayDesert(draft, id)) continue;
    if (ctx.rng.chance(desertionChance(draft, ctx.registries, id))) return startDesertion(draft, id, 'mission_start');
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Answers

/** One seeded social check with Authority or Empathy against a difficulty that grows with low Trust and high stress. */
export function talkDown(draft: CampaignState, ctx: EngineCtx, stat: 'authority' | 'empathy'): EngineEvent[] {
  const open = requireOpen(draft, 'desertion');
  if (stat !== 'authority' && stat !== 'empathy') throw new Error('Talk her down with Authority or Empathy.');
  if (open.talkTried) throw new Error('She has already heard you out: choose another answer.');
  const unit = draft.squad.find((u) => u.id === open.unitId)!;
  const rel = draft.relations[open.unitId];
  const t = TUNING.disloyalty.talkDown;
  const difficulty = t.baseRank + (rel.trust < t.lowTrust ? 1 : 0) + (unit.stress >= t.highStress ? 1 : 0);
  // P7: a strong, seasoned commander intimidates better (Authority only), a weak, green one worse
  const bonus = stat === 'authority' ? intimidationBonus(draft) : 0;
  const chance = clamp(t.base + t.perRank * (socialRank(draft, stat) - difficulty) + bonus, t.min, t.max);
  const success = ctx.rng.chance(chance);
  const events: EngineEvent[] = [];
  if (success) {
    const applied = applyRelationDelta(draft, open.unitId, 'trust', t.trustGain, 'talk_down');
    if (applied !== 0) events.push({ type: 'relation_changed', unitId: open.unitId, axis: 'trust', delta: applied, applied });
    events.push(...evaluateAutomatic(draft, ctx.registries, open.unitId));
    loyaltyRecord(draft, open.unitId).nextCheckDay = draft.day + t.pauseDays;
    delete draft.disloyalty!.open;
    events.push({ type: 'loyalty_talk_down', unitId: open.unitId, stat, success, chance });
    events.push(...closeNight(draft, ctx, open));
  } else {
    open.talkTried = true;
    events.push({ type: 'loyalty_talk_down', unitId: open.unitId, stat, success, chance });
  }
  return events;
}

/** She leaves: out of the squad, the roster and her gear (the items stay), and the squad reacts by what they value. */
export function letGo(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const open = requireOpen(draft, 'desertion');
  const reg = ctx.registries;
  const unitId = open.unitId;
  const stance = (draft.relations[unitId]?.affinity ?? 0) >= TUNING.disloyalty.comeback.allyAffinity ? 'ally' : 'hostile';
  removeFromService(draft, unitId, 'deserted');
  const rec = loyaltyRecord(draft, unitId);
  rec.desertedDay = draft.day;
  rec.stance = stance;
  delete rec.returned;
  const events: EngineEvent[] = [];
  const witnesses = draft.squad.filter((u) => u.id !== unitId && u.kind === 'named' && isLiving(u));
  for (const w of witnesses) {
    events.push(...applyEventToUnit(draft, reg, w.id, {
      type: 'decision_aligned', actor: 'commander', targets: [w.id], severity: 'moderate', evidence: `let ${nameOf(draft, unitId)} go`,
      valueAxes: [{ axis: 'autonomy', direction: 1 }, { axis: 'mercy', direction: 1 }], confidence: 1,
    }));
  }
  for (const w of witnesses) events.push(...evaluateAutomatic(draft, reg, w.id));
  events.push({ type: 'unit_deserted', unitId, stance });
  events.push(...closeNight(draft, ctx, open));
  return events;
}

/** An ally deserter asks to come back: needs a free bed; she returns to the reserve at Trust 15 with a clean record. */
export function takeBack(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const open = requireOpen(draft, 'return');
  const unit = draft.squad.find((u) => u.id === open.unitId)!;
  if (draft.squad.filter(isLiving).length >= draft.roster.capacity) {
    throw new Error(`The barracks are full (${draft.roster.capacity} beds). Upgrade them to take ${unit.displayName} back.`);
  }
  const stance = loyaltyOf(draft, open.unitId)?.stance ?? 'ally';
  unit.status = 'reserve';
  draft.relations[open.unitId].trust = TUNING.disloyalty.comeback.backTrust;
  const events = evaluateAutomatic(draft, ctx.registries, open.unitId);
  delete draft.disloyalty!.units[open.unitId];
  delete draft.disloyalty!.open;
  events.push({ type: 'deserter_answered', unitId: open.unitId, stance, taken: true });
  events.push(...closeNight(draft, ctx, open));
  return events;
}

/** She stays gone; she asked once and will not ask again. */
export function turnAway(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const open = requireOpen(draft, 'return');
  const rec = loyaltyRecord(draft, open.unitId);
  rec.returned = true;
  delete draft.disloyalty!.open;
  const events: EngineEvent[] = [{ type: 'deserter_answered', unitId: open.unitId, stance: rec.stance ?? 'ally', taken: false }];
  events.push(...closeNight(draft, ctx, open));
  return events;
}

// ---------------------------------------------------------------------------------------------
// The day step

/** A night confrontation whose entry is gone (the night passed, it expired) or a mission-start one from an earlier day. */
function expiredConfrontation(draft: CampaignState, open: Confrontation): boolean {
  if (open.at === 'mission_start') return draft.day > open.day;
  const id = open.nightEntryId;
  if (id === undefined) return true;
  return draft.calendar.nightEvent?.id !== id && !draft.calendar.nightEventsQueue.some((n) => n.id === id);
}

function comeBack(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const rec = loyaltyRecord(draft, unitId);
  const name = nameOf(draft, unitId);
  const stance = rec.stance ?? 'hostile';
  rec.returned = true;
  const events: EngineEvent[] = [{ type: 'deserter_returned', unitId, stance }];
  if (stance === 'ally') {
    const entry = {
      id: nextId(draft, 'n'), unitId, kind: 'deserter_return', priority: TUNING.disloyalty.night.return,
      framing: `${name} is at the gate, asking to be let back in.`,
      ignore: { event: 'dismissed', severity: 'minor' as const }, expiresDay: draft.day + TUNING.disloyalty.night.expiresInDays,
    };
    enqueueNight(draft, entry);
    (draft.disloyalty ??= { units: {} }).open = { kind: 'return', unitId, day: draft.day, at: 'night', nightEntryId: entry.id };
  } else {
    const rumor = postRumor(draft, ctx, {
      text: `${name} was seen with armed deserters near the old checkpoints, asking questions about the commander.`,
      tags: ['loyalty', 'deserter'], leadsTo: 'none',
    });
    if (rumor) events.push(rumorPostedEvent(rumor));
    events.push(...applyWorldEffects(draft, ctx, [
      { type: 'clock', clockId: 'oversight', by: 1 },
      { type: 'fact', text: `${name} deserted and now runs with armed deserters hostile to the commander.`, tags: ['loyalty', 'deserter'], importance: 4 },
    ], { kind: 'event', id: 'deserter_return', label: `${name} turned hostile` }));
  }
  return events;
}

/** Deserters may come back once, after a few days: an engine rule (seeded, no model). */
function returns(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  const t = TUNING.disloyalty.comeback;
  for (const [unitId, rec] of Object.entries(draft.disloyalty?.units ?? {})) {
    const unit = draft.squad.find((u) => u.id === unitId);
    if (!unit || unit.status !== 'deserted' || rec.desertedDay === undefined || rec.returned === true) continue;
    if (draft.day - rec.desertedDay < t.afterDays) continue;
    const stance = rec.stance ?? 'hostile';
    if (stance === 'ally' && draft.disloyalty?.open) continue; // one knock at a time: she waits
    if (!ctx.rng.chance(t.chancePerDay)) continue;
    events.push(...comeBack(draft, ctx, unitId));
  }
  return events;
}

/**
 * Day-end step (after P5's director): refreshes every band, resolves an unanswered confrontation as "let her go",
 * gives warning signs, rolls desertion for breaking units (the first breaking day only leaves a sign) and lets
 * deserters return. Never throws for content that vanished.
 */
export function loyaltyDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const u of draft.squad.filter(isLiving)) events.push(...evaluateAutomatic(draft, reg, u.id));

  const open = draft.disloyalty?.open;
  if (open && expiredConfrontation(draft, open)) {
    if (open.kind === 'desertion') events.push(...letGo(draft, ctx));
    else if (open.kind === 'return') events.push(...turnAway(draft, ctx));
    else events.push(...resolveExpiredMutiny(draft, ctx, open));
  }

  for (const u of draft.squad.filter(isLiving)) {
    const band = draft.relations[u.id]?.loyaltyBand;
    const rec = loyaltyOf(draft, u.id);
    if (band !== 'breaking' && rec?.signs.some((s) => s.about === 'desertion')) {
      rec.signs = rec.signs.filter((s) => s.about !== 'desertion'); // the next breaking spell starts with a fresh warning
    }
    if (band !== 'wavering' && rec?.nextDoubtDay !== undefined) delete rec.nextDoubtDay;
    if (band === 'wavering' && u.kind === 'named') {
      const wait = loyaltyRecord(draft, u.id); // a unit that has just started wavering waits one interval before the first sign
      if (wait.nextDoubtDay === undefined) wait.nextDoubtDay = draft.day + TUNING.disloyalty.doubtEveryDays;
      else if (draft.day >= wait.nextDoubtDay) {
        events.push(...emitSign(draft, ctx, u.id, 'doubt'));
        wait.nextDoubtDay = draft.day + TUNING.disloyalty.doubtEveryDays;
      }
    }
    if (band !== 'breaking') continue;
    if (!rec?.signs.some((s) => s.about === 'desertion')) {
      events.push(...emitSign(draft, ctx, u.id, 'desertion')); // the first breaking day only leaves a sign
      continue;
    }
    if (mayDesert(draft, u.id) && ctx.rng.chance(desertionChance(draft, reg, u.id))) {
      events.push(...startDesertion(draft, u.id, 'night'));
    }
  }

  events.push(...arcDayStep(draft, ctx));
  events.push(...mutinyDayStep(draft, ctx));
  events.push(...returns(draft, ctx));
  return events;
}
