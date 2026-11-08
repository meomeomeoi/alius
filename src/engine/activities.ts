import type { Entry, Registries } from '../content/types';
import type { ActivityEffect } from '../content/schemas';
import { consumeSlots } from './calendar';
import type { EngineCtx, EngineEvent } from './dispatch';
import { activeRosterUnits, facilityEffect, facilityLevel, isLiving, recoverUnit } from './economy';
import { applyRelationDelta } from './relationGain';
import { addSocialPoints, socialRank } from './social';
import type { CampaignState, Unit } from './state/types';

export interface ActivityRequest {
  activityId: string;
  /** The unit the commander spends the slot with. */
  companionId?: string;
  /** Squad units picked for the alone variant (when the chosen focus asks for units). */
  unitIds?: string[];
  focus?: string;
}

type Cost = { credits?: number; supplies?: number; plyx?: number };
type Focus = { id: string; label: string; units?: { min: number; max: number } };
type Fx = ActivityEffect & { when?: { focus?: string; companionLikes?: string }; scale?: { facility: string; key: string } };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const asReq = (v: unknown): ActivityRequest | null => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.activityId !== 'string') return null;
  if (r.companionId !== undefined && typeof r.companionId !== 'string') return null;
  if (r.focus !== undefined && typeof r.focus !== 'string') return null;
  if (r.unitIds !== undefined && !(Array.isArray(r.unitIds) && r.unitIds.every((x) => typeof x === 'string'))) return null;
  return r as unknown as ActivityRequest;
};
export { asReq as parseActivityRequest };

const focusOf = (a: Entry, req: ActivityRequest): Focus | undefined => {
  const list = (a.focus as Focus[] | undefined) ?? [];
  return req.focus === undefined ? list[0] : list.find((f) => f.id === req.focus);
};

/** Why the activity cannot be done right now, or null. Pure; the UI uses it to grey out buttons. */
export function checkActivity(state: CampaignState, reg: Registries, request: unknown): string | null {
  const req = asReq(request);
  if (!req) return 'Invalid activity request.';
  const a = reg.activities.get(req.activityId);
  if (!a) return `Unknown activity "${req.activityId}".`;
  const name = String(a.name);

  if (state.calendar.pendingScene) return 'A conversation is still open; end it first.';
  if (!(a.slotRules as string[]).includes(state.slot)) return `${name} is not available in the ${state.slot}.`;
  const need = a.facilityReq as { id: string; level: number } | undefined;
  if (need && facilityLevel(state, need.id) < need.level) {
    return `${name} needs ${String(reg.facilities.get(need.id)?.name ?? need.id)} level ${need.level}.`;
  }
  if (a.blockedWhenCommanderInjured === true && state.day < (state.commander.injuredUntilDay ?? 0)) {
    return `The commander is injured; ${name} is blocked until day ${state.commander.injuredUntilDay}.`;
  }
  const cost = a.cost as Cost;
  for (const k of ['credits', 'supplies', 'plyx'] as const) {
    if ((cost[k] ?? 0) > state.resources[k]) return `Not enough ${k} for ${name} (needs ${cost[k]}).`;
  }

  const mode = a.companion as 'none' | 'optional' | 'required';
  if (req.companionId !== undefined) {
    if (mode === 'none') return `${name} cannot be done with a companion.`;
    const c = state.squad.find((u) => u.id === req.companionId);
    if (!c || !isLiving(c)) return `Companion "${req.companionId}" is not available.`;
    return null;
  }
  if (mode === 'required') return `${name} needs a companion.`;

  const focus = focusOf(a, req);
  if (req.focus !== undefined && !focus) return `Unknown focus "${req.focus}" for ${name}.`;
  if (focus?.units) {
    const ids = req.unitIds ?? [];
    if (ids.length < focus.units.min || ids.length > focus.units.max) {
      return `${focus.label}: pick ${focus.units.min} to ${focus.units.max} units.`;
    }
    if (new Set(ids).size !== ids.length) return `${focus.label}: a unit was picked twice.`;
    for (const id of ids) {
      const u = state.squad.find((x) => x.id === id);
      if (!u || !isLiving(u)) return `${focus.label}: unit "${id}" is not available.`;
    }
  }
  return null;
}

const scaled = (amount: number, state: CampaignState, reg: Registries, scale?: Fx['scale']): number => {
  if (!scale) return amount;
  const factor = 1 + facilityEffect(state, reg, scale.facility, scale.key) / 100;
  return Math.sign(amount) * Math.round(Math.abs(amount) * factor);
};

/** Applies the activity. Throws with the rejection reason when `checkActivity` fails. */
export function runActivity(draft: CampaignState, ctx: EngineCtx, request: unknown): EngineEvent[] {
  const reg = ctx.registries;
  const reason = checkActivity(draft, reg, request);
  if (reason) throw new Error(reason);
  const req = asReq(request) as ActivityRequest;
  const a = reg.activities.get(req.activityId) as Entry;
  const events: EngineEvent[] = [];

  const cost = a.cost as Cost;
  for (const k of ['credits', 'supplies', 'plyx'] as const) {
    if (cost[k]) {
      draft.resources[k] -= cost[k]!;
      events.push({ type: 'resource_changed', resource: k, amount: -cost[k]! });
    }
  }

  const companion = req.companionId ? draft.squad.find((u) => u.id === req.companionId) : undefined;
  const focus = companion ? undefined : focusOf(a, req);
  const selected: Unit[] = focus?.units
    ? (req.unitIds ?? []).map((id) => draft.squad.find((u) => u.id === id) as Unit)
    : [];
  const unitsOf = (target: string): Unit[] =>
    target === 'companion' ? (companion ? [companion] : []) : target === 'selected' ? selected : activeRosterUnits(draft);
  const recover = (u: Unit): void => {
    events.push(recoverUnit(draft, u));
  };

  const list = (companion ? a.companionEffects : a.effects) as Fx[];
  for (const fx of list) {
    if (fx.when?.focus !== undefined && fx.when.focus !== focus?.id) continue;
    if (fx.when?.companionLikes !== undefined && !companion?.likes.includes(fx.when.companionLikes)) continue;

    switch (fx.type) {
      case 'resource': {
        const wanted = scaled(fx.amount + (fx.perStat ? fx.perStat.per * socialRank(draft, fx.perStat.stat) : 0), draft, reg, fx.scale);
        const before = draft.resources[fx.resource];
        draft.resources[fx.resource] = Math.max(0, before + wanted);
        events.push({ type: 'resource_changed', resource: fx.resource, amount: draft.resources[fx.resource] - before });
        break;
      }
      case 'commander_stat': {
        const r = addSocialPoints(draft.commander, fx.stat, scaled(fx.amount, draft, reg, fx.scale));
        events.push({ type: 'social_gained', stat: fx.stat, gained: r.gained, rank: r.rank, rankedUp: r.rankedUp });
        break;
      }
      case 'unit_xp':
        for (const u of unitsOf(fx.target)) {
          const amount = scaled(fx.amount, draft, reg, fx.scale);
          u.xp += amount;
          events.push({ type: 'xp_gained', unitId: u.id, amount });
        }
        break;
      case 'unit_stress':
        for (const u of unitsOf(fx.target)) {
          const next = clamp(u.stress + scaled(fx.amount, draft, reg, fx.scale), 0, 100);
          events.push({ type: 'stress_changed', unitId: u.id, delta: next - u.stress });
          u.stress = next;
        }
        break;
      case 'injury_days':
        for (const u of unitsOf(fx.target)) {
          if (u.injuryDays === undefined) continue;
          u.injuryDays += fx.amount;
          if (u.injuryDays <= 0) recover(u);
        }
        break;
      case 'commander_injury_days': {
        const until = draft.commander.injuredUntilDay;
        if (until === undefined || until <= draft.day) break;
        const next = until + fx.amount;
        if (next <= draft.day) delete draft.commander.injuredUntilDay;
        else draft.commander.injuredUntilDay = next;
        events.push({ type: 'commander_injury_changed', until: draft.commander.injuredUntilDay ?? null });
        break;
      }
      case 'defect_upkeep':
        for (const u of unitsOf(fx.target)) {
          const kept = u.defects.filter((d) => d.arc === 'manage');
          for (const d of kept) d.upkeepDay = draft.day;
          if (kept.length > 0) events.push({ type: 'defect_upkeep', unitId: u.id, defectIds: kept.map((d) => d.id) });
        }
        break;
      case 'relation':
        // grunts are trust-only: warmth and attraction effects skip them
        if (companion && !(companion.kind === 'grunt' && fx.axis !== 'trust')) {
          const applied = applyRelationDelta(draft, companion.id, fx.axis, scaled(fx.amount, draft, reg, fx.scale), `activity:${a.id}`);
          events.push({ type: 'relation_changed', unitId: companion.id, axis: fx.axis, applied });
        }
        break;
      case 'emit_event':
        events.push({
          type: fx.event, activityId: a.id, ...(companion ? { unitId: companion.id } : {}),
          ...(fx.event === 'scene_requested' ? { origin: 'activity' } : {}),
        });
        break;
    }
  }

  events.push({
    type: 'activity_done', activityId: a.id, ...(companion ? { companionId: companion.id } : {}),
    vignette: companion !== undefined && a.flavor === 'short',
  });
  if (a.startsScene === true) {
    // the scene holds this slot; P3 ends it with `calendar/consume_slot { reason: 'scene_end' }`
    if (companion) draft.calendar.pendingScene = { unitId: companion.id, day: draft.day, slot: draft.slot };
  } else {
    events.push(...consumeSlots(draft, 1, ctx));
  }
  return events;
}
