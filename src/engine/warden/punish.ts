import type { CommanderPunishmentEffect } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import { consumeSlots } from '../calendar';
import { NOT_LEAVE } from '../discipline/restrictions';
import { addRecord } from '../discipline/record';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { injureCommander } from '../calendar';
import { addCommanderStress } from '../special/commanderStress';
import type { CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { wardenOf, type WardenState } from './state';

/**
 * What the warden does to the commander (P13 §3): the registry `commanderPunishments`, a closed effect vocabulary read by `type`, a
 * punishment roll after a DEFY and the commander's restrictions. Code never names a punishment's id; it reads severity and effects.
 */

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const SLOTS: Slot[] = ['morning', 'afternoon', 'evening'];

const entries = (reg: Registries) => [...reg.commanderPunishments.values()];
const effectsOf = (entry: Entry): CommanderPunishmentEffect[] => (entry.effects ?? []) as CommanderPunishmentEffect[];
const isLeash = (entry: Entry): boolean => effectsOf(entry).some((e) => e.type === 'leash');

/**
 * The punishment of this severity: the first entry in registry order. A Leash punishment needs an authorization (`leashLeft ≥ 1`); without
 * one the next lower severity is tried. Null when nothing is left. Draws nothing.
 */
export function pickPunishment(state: CampaignState, reg: Registries, severity: number): string | null {
  const w = wardenOf(state);
  for (let sev = Math.min(4, Math.floor(severity)); sev >= 1; sev--) {
    const hit = entries(reg).find((e) => e.severity === sev && !(isLeash(e) && (w?.leashLeft ?? 0) < 1));
    if (hit) return String(hit.id);
  }
  return null;
}

/** Why the commander cannot do this right now because of what the warden revoked, or null. Absent mode (or no warden in service): null. */
export function commanderRestriction(state: CampaignState, use: 'companion' | 'dm', activityId?: string): string | null {
  const w = wardenOf(state);
  if (!w) return null;
  for (const r of w.restrictions) {
    if (state.day > r.untilDay) continue;
    if (r.what === 'no_leave' && use === 'companion' && !(activityId !== undefined && NOT_LEAVE.includes(activityId))) return `The warden has revoked the commander's leave until day ${r.untilDay}.`;
    if (r.what === 'no_dms' && use === 'dm') return `The warden has revoked the commander's messages until day ${r.untilDay}.`;
  }
  return null;
}

/** Slots the commander may lose today: from now to the evening, never past it. */
const slotsLeftToday = (slot: Slot): number => Math.max(0, SLOTS.indexOf('evening') - SLOTS.indexOf(slot));

/** Runs one effect. The Leash on the commander is `leashCommander` (Task 10) and is skipped until it exists. */
function runEffect(draft: CampaignState, ctx: EngineCtx, w: WardenState, fx: CommanderPunishmentEffect, events: EngineEvent[]): void {
  switch (fx.type) {
    case 'commander_stress':
      events.push(...addCommanderStress(draft, fx.amount, 'warden_punishment'));
      return;
    case 'restrict': {
      const untilDay = draft.day + fx.days;
      w.restrictions = [...w.restrictions.filter((r) => r.what !== fx.what), { what: fx.what, untilDay }];
      events.push({ type: 'commander_restricted', what: fx.what, untilDay });
      return;
    }
    case 'lose_slots': {
      const wanted = ctx.rng.int(fx.min, fx.max); // one draw for the count
      const count = Math.min(wanted, slotsLeftToday(draft.slot));
      if (count > 0) events.push(...consumeSlots(draft, count, ctx));
      return;
    }
    case 'squad_record':
      for (const u of draft.squad) if (u.kind === 'named' && isLiving(u) && u.id !== w.unitId) events.push(...addRecord(draft, u.id, fx.amount, 'warden_humiliation'));
      return;
    case 'injury': {
      const endurance = draft.commander.body?.endurance ?? 0;
      if (ctx.rng.chance(clamp(fx.chance - fx.perEndurance * endurance, 0, 1))) events.push(...injureCommander(draft, fx.days));
      return;
    }
    case 'leash':
      events.push(...leashEffect(draft, ctx, fx.kind));
      return;
  }
}

/** The hook the Leash on the commander fills (Task 10). */
let leashEffect: (draft: CampaignState, ctx: EngineCtx, kind: 'compel' | 'suppress') => EngineEvent[] = () => [];
export function setLeashEffect(fn: typeof leashEffect): void {
  leashEffect = fn;
}

/**
 * Applies a punishment of the commander: its effects, then defiance falls by its `defianceDelta`, her satisfaction rises by its
 * `satisfactionDelta`, the log keeps it (newest 20) and `commander_punished` says so. Throws outside the mode, with no warden in service,
 * or for an unknown id.
 */
export function applyCommanderPunishment(draft: CampaignState, ctx: EngineCtx, punishmentId: string): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w) throw new Error('Nobody holds the leash.');
  const entry = ctx.registries.commanderPunishments.get(punishmentId);
  if (!entry) throw new Error(`Unknown commander punishment "${punishmentId}".`);
  const events: EngineEvent[] = [];
  for (const fx of effectsOf(entry)) runEffect(draft, ctx, w, fx, events);
  w.defiance = clamp(w.defiance + (entry.defianceDelta as number), 0, 100);
  w.satisfaction = clamp(w.satisfaction + (entry.satisfactionDelta as number), 0, 100);
  w.punishLog = [...w.punishLog, { punishmentId, day: draft.day, severity: entry.severity as number }].slice(-TUNING.warden.escalation.logMax);
  events.unshift({ type: 'commander_punished', punishmentId, severity: entry.severity });
  return events;
}

/**
 * After a DEFY: one draw at `0.5 + 0.3 × weight − 0.2 × max(0, affinity) / 100`. A hit picks the severity from her defiance (below 25 →
 * 1, below 50 → 2, below 75 → 3, else 4; a Leash punishment without an authorization drops one) and applies it; no further draw. No draw
 * at all without a warden in service.
 */
export function punishRoll(draft: CampaignState, ctx: EngineCtx, weight: number): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w) return [];
  const P = TUNING.warden.punish;
  const affinity = draft.relations[w.unitId]?.affinity ?? 0;
  if (!ctx.rng.chance(clamp(P.base + P.perWeight * weight - (P.perAffinity * Math.max(0, affinity)) / 100, 0, 1))) return [];
  const [a, b, c] = P.bands;
  const severity = w.defiance < a ? 1 : w.defiance < b ? 2 : w.defiance < c ? 3 : 4;
  const id = pickPunishment(draft, ctx.registries, severity);
  return id === null ? [] : applyCommanderPunishment(draft, ctx, id);
}
