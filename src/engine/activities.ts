import { rollCountermand } from './power/leader';
import { commanderRestriction } from './warden/punish';
import { judgedOf, plainPayload } from './warden/override';
import { holderWith } from './dynamic/capabilities';
import { rollOverrides } from './dynamic/command';
import type { Capability } from './dynamic/types';
import type { Entry, Registries } from '../content/types';
import type { ActivityEffect } from '../content/schemas';
import { consumeSlots, isQuietNight } from './calendar';
import type { EngineCtx, EngineEvent } from './dispatch';
import { activeRosterUnits, facilityEffect, facilityLevel, isLiving, recoverUnit } from './economy';
import { applyRelationDelta } from './relationGain';
import { addSocialPoints, socialGrowthMult, socialRank } from './social';
import type { CampaignState, Unit } from './state/types';
import { addBodyXp, bodyGrowthMult } from './commander/profile';
import { hasTraitEffect, traitEffects } from './commander/traits';
import { trainEndurance, trainedToday } from './physics/skill';
import { TUNING } from './tuning';
import { restrictionReason } from './discipline/restrictions';
import { addCommanderStress } from './special/commanderStress';
import { burnImplant } from './special/frequency/discovery';
import { likesOf } from './development/profile';

export interface ActivityRequest {
  activityId: string;
  /** The unit the commander spends the slot with. */
  companionId?: string;
  /** Squad units picked for the alone variant (when the chosen focus asks for units). */
  unitIds?: string[];
  focus?: string;
  /** P9b: the leader's countermand was answered (OVERRULE): run the activity without rolling it again. */
  countermandChecked?: boolean;
  /** P13: the warden's override was answered (or there is none to roll): run the activity without asking her again. */
  wardenChecked?: boolean;
  /** P14c: the pastime of a quiet hour (the activity that carries `pastime: true`); it travels with the request so an override answered later runs the same pastime. */
  pastimeId?: string;
}

type Cost = { credits?: number; supplies?: number; plyx?: number };
/** P16b: a focus that is a drill of the craft: the key of the discipline it trains (`endurance:<physics>` or a discipline) and whether a companion may share it (an instrument takes a partner). */
export type FocusDrill = { key: string; partner?: true };
export type Focus = { id: string; label: string; units?: { min: number; max: number }; requires?: { traitEffect?: string; capabilityHeldBy?: string }; confirm?: string; drill?: FocusDrill };
type Fx = ActivityEffect & { when?: { focus?: string; companionLikes?: string }; scale?: { facility: string; key: string } };

/** What an activity just did; hooks (P3 defect social effects) react to it. */
export interface ActivityDone {
  activityId: string;
  companionId?: string;
  /** Living units on the active roster when the activity ran. */
  rosterIds: string[];
  /** P14c: the pastime the request named (a quiet hour). */
  pastimeId?: string;
  /** P16b: the focus the activity ran with (a partner drill keeps it with a companion; an alone focus is the request's). */
  focus?: string;
}
/** Runs after the activity's effects and before its slot is consumed; the events it returns join the activity's events. */
export type ActivityHook = (draft: CampaignState, ctx: EngineCtx, done: ActivityDone) => EngineEvent[];

const activityHooks: ActivityHook[] = [];
export const registerActivityHook = (fn: ActivityHook): void => {
  activityHooks.push(fn);
};
export const resetActivityHooks = (): void => {
  activityHooks.length = 0;
};

/**
 * P16b: what the craft plugs into the activities (this layer imports nothing of it). `gate` says why a drill focus cannot be done now (`null`: it can): called for a
 * focus that carries `drill`, for `alone` (the request has no companion) or `partner` (a companion shares it). `effect` runs an effect type this layer does not know
 * (`commander_craft_xp`). `partner` runs a drill a companion shares and says whether it opens a scene (the slot is then the scene's, at `locationId`).
 * Each is registered once by the craft; with none registered a drill focus behaves as it did before the craft (a companion drops the focus).
 */
export interface DrillAt { activityId: string; focus: Focus; companionId: string }
export interface DrillHooks {
  gate?: (state: CampaignState, reg: Registries, focus: Focus, mode: 'alone' | 'partner') => string | null;
  effect?: (draft: CampaignState, ctx: EngineCtx, fx: ActivityEffect, at: { activityId: string; focusId?: string }) => EngineEvent[];
  partner?: (draft: CampaignState, ctx: EngineCtx, at: DrillAt) => { events: EngineEvent[]; scene?: { locationId: string } };
}
let drillHooks: DrillHooks = {};
export const registerDrillHooks = (hooks: DrillHooks): void => {
  drillHooks = { ...drillHooks, ...hooks };
};
export const resetDrillHooks = (): void => {
  drillHooks = {};
};

/** Why a drill focus is not offered now (`null` for any other focus, or while the craft has not registered a gate). The one place the OPS tab and the checks ask. */
export function drillReason(state: CampaignState, reg: Registries, focus: Focus, mode: 'alone' | 'partner'): string | null {
  return focus.drill === undefined || drillHooks.gate === undefined ? null : drillHooks.gate(state, reg, focus, mode);
}

/** The focus a companion shares (a partner drill, while the craft offers it), else `undefined`: every other focus is dropped with a companion, as it always was. */
export function partnerFocus(state: CampaignState, reg: Registries, a: Entry, req: ActivityRequest): Focus | undefined {
  if (req.focus === undefined || drillHooks.partner === undefined) return undefined;
  const focus = ((a.focus as Focus[] | undefined) ?? []).find((f) => f.id === req.focus);
  return focus?.drill?.partner === true && drillReason(state, reg, focus, 'partner') === null ? focus : undefined;
}

/** What an activity costs the commander now: its own cost plus the `activity_cost` trait effects for it (P7). */
export function activityCost(state: CampaignState, reg: Registries, a: Entry): Cost {
  const out: Cost = { ...(a.cost as Cost) };
  for (const fx of traitEffects(state, reg, 'activity_cost')) {
    if (fx.activityId === a.id) out[fx.resource] = Math.max(0, (out[fx.resource] ?? 0) + fx.amount);
  }
  for (const k of ['credits', 'supplies', 'plyx'] as const) if (out[k] === 0) delete out[k];
  return out;
}

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

/** P12: the question a one-way focus asks before it runs (its `confirm` text), or null for an ordinary request. The app asks it first. */
export function focusConfirm(reg: Registries, request: unknown): string | null {
  const req = asReq(request);
  const a = req ? reg.activities.get(req.activityId) : undefined;
  if (!req || !a || req.companionId !== undefined) return null;
  const confirm = focusOf(a, req)?.confirm;
  return typeof confirm === 'string' ? confirm : null;
}

/** Why the activity cannot be done right now, or null. Pure; the UI uses it to grey out buttons. */
export function checkActivity(state: CampaignState, reg: Registries, request: unknown): string | null {
  const req = asReq(request);
  if (!req) return 'Invalid activity request.';
  const a = reg.activities.get(req.activityId);
  if (!a) return `Unknown activity "${req.activityId}".`;
  const name = String(a.name);

  if (state.calendar.pendingScene) return 'A conversation is still open; end it first.';
  // P7: in a quiet night the evening's rules apply
  const slot = isQuietNight(state) ? 'evening' : state.slot;
  if (!(a.slotRules as string[]).includes(slot)) return `${name} is not available in the ${state.slot}.`;
  const need = a.facilityReq as { id: string; level: number } | undefined;
  if (need && facilityLevel(state, need.id) < need.level) {
    return `${name} needs ${String(reg.facilities.get(need.id)?.name ?? need.id)} level ${need.level}.`;
  }
  if (a.blockedWhenCommanderInjured === true && state.day < (state.commander.injuredUntilDay ?? 0)) {
    return `The commander is injured; ${name} is blocked until day ${state.commander.injuredUntilDay}.`;
  }
  const cost = activityCost(state, reg, a);
  for (const k of ['credits', 'supplies', 'plyx'] as const) {
    if ((cost[k] ?? 0) > state.resources[k]) return `Not enough ${k} for ${name} (needs ${cost[k]}).`;
  }

  const mode = a.companion as 'none' | 'optional' | 'required';
  if (req.companionId !== undefined) {
    if (mode === 'none') return `${name} cannot be done with a companion.`;
    const c = state.squad.find((u) => u.id === req.companionId);
    if (!c || !isLiving(c)) return `Companion "${req.companionId}" is not available.`;
    // P16b: a drill that takes a partner keeps its focus with a companion (it is once a day for an endurance drill, as alone)
    const shared = partnerFocus(state, reg, a, req);
    if (shared !== undefined && enduranceDrillDone(state, a, shared)) return `${shared.label} was done today.`;
    return restrictionReason(state, reg, c.id, 'companion', req.activityId) ?? commanderRestriction(state, reg, 'companion', req.activityId); // P9: the brig, no leave, extra duty; P13: what the warden revoked
  }
  if (mode === 'required') return `${name} needs a companion.`;

  const focus = focusOf(a, req);
  if (req.focus !== undefined && !focus) return `Unknown focus "${req.focus}" for ${name}.`;
  // P12: a focus only a commander with a given trait effect may take, and a one-way burn that cannot be done twice
  if (focus?.requires?.traitEffect !== undefined && !hasTraitEffect(state, reg, focus.requires.traitEffect as never)) return `${focus.label} is not available to this commander.`;
  // P15: a focus that exists only while some holder holds a capability (the Leash terminal, while a block stands)
  if (focus?.requires?.capabilityHeldBy !== undefined && holderWith(state, reg, focus.requires.capabilityHeldBy as Capability) === null) return `${focus.label} is not available: nobody holds that.`;
  if (focus && state.special?.frequency?.burnedDay !== undefined
    && (a.effects as Fx[]).some((fx) => fx.type === 'burn_frequency_implant' && fx.when?.focus === focus.id)) return 'The implant is already burned.';
  // P15a: an endurance drill is done once a day for each physics
  if (focus !== undefined && enduranceDrillDone(state, a, focus)) return `${focus.label} was done today.`;
  // P16b: a drill of the craft is offered only while a holder runs it
  const notDrill = focus === undefined ? null : drillReason(state, reg, focus, 'alone');
  if (notDrill !== null) return notDrill;
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

/** P15a: has the endurance drill of this focus been done today (once a day for each physics)? */
const enduranceDrillDone = (state: CampaignState, a: Entry, focus: Focus): boolean =>
  (a.effects as Fx[]).some((x) => x.type === 'commander_endurance_xp' && x.when?.focus === focus.id && trainedToday(state, String((x as { physics?: unknown }).physics)));

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

  // P9b: the squad leader may countermand a minor order (nothing happens, no slot is spent); draws rng only while a leader exists
  if (req.countermandChecked !== true) {
    const countermanded = rollCountermand(draft, ctx, req);
    if (countermanded) return countermanded;
  }

  // P13 / P15: the warden, then a holder of the command, may override an order that cuts across what she expects (nothing happens, no slot is spent); draws rng only on a conflict
  if (req.wardenChecked !== true) {
    const overridden = rollOverrides(draft, ctx, { kind: 'activity', activityId: req.activityId, ...(req.companionId !== undefined ? { companionId: req.companionId } : {}), ...(req.unitIds !== undefined ? { unitIds: req.unitIds } : {}) }, { payload: plainPayload(request), judged: judgedOf(request) });
    if (overridden) return overridden;
  }

  const cost = activityCost(draft, reg, a);
  for (const k of ['credits', 'supplies', 'plyx'] as const) {
    if (cost[k]) {
      draft.resources[k] -= cost[k]!;
      events.push({ type: 'resource_changed', resource: k, amount: -cost[k]! });
    }
  }

  const companion = req.companionId ? draft.squad.find((u) => u.id === req.companionId) : undefined;
  const focus = companion ? partnerFocus(draft, reg, a, req) : focusOf(a, req); // P16b: a partner drill keeps its focus with a companion
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
    if (fx.when?.companionLikes !== undefined && !(companion && likesOf(companion).includes(fx.when.companionLikes))) continue;

    switch (fx.type) {
      case 'resource': {
        const wanted = scaled(fx.amount + (fx.perStat ? fx.perStat.per * socialRank(draft, fx.perStat.stat) : 0), draft, reg, fx.scale);
        const before = draft.resources[fx.resource];
        draft.resources[fx.resource] = Math.max(0, before + wanted);
        events.push({ type: 'resource_changed', resource: fx.resource, amount: draft.resources[fx.resource] - before });
        break;
      }
      case 'commander_stat': {
        const r = addSocialPoints(draft.commander, fx.stat, Math.round(scaled(fx.amount, draft, reg, fx.scale) * socialGrowthMult(draft, reg, fx.stat)));
        events.push({ type: 'social_gained', stat: fx.stat, gained: r.gained, rank: r.rank, rankedUp: r.rankedUp });
        break;
      }
      case 'commander_craft_xp':
        events.push(...(drillHooks.effect?.(draft, ctx, fx, { activityId: a.id, ...(focus ? { focusId: focus.id } : {}) }) ?? []));
        break;
      case 'commander_endurance_xp': {
        const gained = trainEndurance(draft, String((fx as { physics?: unknown }).physics));
        if (gained) events.push(gained);
        break;
      }
      case 'commander_body_xp': {
        const r = addBodyXp(draft.commander, fx.stat, Math.round(TUNING.commander.bodyXpPerSession * bodyGrowthMult(draft, reg)));
        events.push({ type: 'body_trained', stat: fx.stat, value: r.value, raised: r.gained });
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
      case 'commander_stress':
        events.push(...addCommanderStress(draft, fx.amount, 'medbay'));
        break;
      case 'burn_frequency_implant':
        events.push(...burnImplant(draft));
        break;
      case 'emit_event':
        events.push({
          type: fx.event, activityId: a.id, ...(companion ? { unitId: companion.id } : {}),
          ...(fx.event === 'scene_requested' ? { origin: 'activity' } : {}),
        });
        break;
    }
  }

  // P7: `activity_relation` traits: the companion warms up to a particular activity
  if (companion) {
    for (const fx of traitEffects(draft, reg, 'activity_relation')) {
      if (fx.activityId !== a.id || (companion.kind === 'grunt' && fx.axis !== 'trust')) continue;
      const applied = applyRelationDelta(draft, companion.id, fx.axis, fx.amount, `activity:${a.id}`);
      events.push({ type: 'relation_changed', unitId: companion.id, axis: fx.axis, applied });
    }
  }

  // P7: a night spent doing something is a night not slept: tomorrow the trait's rank penalty applies
  if (isQuietNight(draft)) {
    const penalty = traitEffects(draft, reg, 'sleepless_rank');
    if (penalty.length > 0) {
      draft.commander.sleeplessDay = draft.day + 1;
      const sum: Partial<Record<'authority' | 'insight' | 'empathy' | 'cunning', number>> = {};
      for (const fx of penalty) sum[fx.stat] = (sum[fx.stat] ?? 0) + fx.amount;
      draft.commander.sleeplessRank = sum;
    }
  }

  // P16b: the drill a companion shares (a partner drill): pays now, or opens its scene at its place (the slot is then the scene's)
  let drillScene: { locationId: string } | undefined;
  if (companion && focus?.drill?.partner === true && drillHooks.partner !== undefined) {
    const shared = drillHooks.partner(draft, ctx, { activityId: a.id, focus, companionId: companion.id });
    events.push(...shared.events);
    drillScene = shared.scene;
    if (drillScene !== undefined) events.push({ type: 'scene_requested', activityId: a.id, unitId: companion.id, origin: 'activity', locationId: drillScene.locationId });
  }

  events.push({
    type: 'activity_done', activityId: a.id, ...(companion ? { companionId: companion.id } : {}),
    vignette: companion !== undefined && a.flavor === 'short',
    slot: draft.slot, // P3b: the slot spent (a day end inside `consumeSlots` below moves it on)
  });
  const done: ActivityDone = {
    activityId: a.id, ...(companion ? { companionId: companion.id } : {}), rosterIds: activeRosterUnits(draft).map((u) => u.id),
    ...(typeof req.pastimeId === 'string' ? { pastimeId: req.pastimeId } : {}),
    ...(focus !== undefined ? { focus: focus.id } : {}),
  };
  for (const hook of activityHooks) events.push(...hook(draft, ctx, done));
  if (a.startsScene === true || drillScene !== undefined) {
    // the scene holds this slot; P3 ends it with `calendar/consume_slot { reason: 'scene_end' }`
    if (companion) draft.calendar.pendingScene = { unitId: companion.id, day: draft.day, slot: draft.slot };
  } else {
    events.push(...consumeSlots(draft, 1, ctx));
  }
  return events;
}
