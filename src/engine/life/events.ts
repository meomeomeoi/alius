import type { Registries } from '../../content/types';
import { bondTierOf } from '../bonds';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { whereabouts } from '../hub';
import { leaderOf } from '../power/state';
import { rationsOf } from '../power/state';
import { TUNING } from '../tuning';
import type { CampaignState, Slot, Unit } from '../state/types';
import { writeLifeFact, plainText } from './facts';
import { newHobby } from './hobbies';
import { enqueue } from './news';
import { lifeChance, lifeHash, lifeMode, temperamentOf } from './state';
import type { LifeEventEntry, LifeRequires, LifeShare } from './types';

/**
 * Her days off-screen (P14c): which life events can happen to her, which one does, and what it writes. Nothing here draws from the rng: a
 * chance is `lifeChance(...)` and a pick is `lifeHash(...) % n` over a list in registry order, so the same state always answers the same.
 */

/** Today's slots in which her whereabouts are read for `requires.location` (the night is spent in her quarters). */
const DAY_SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];
/** Slots a day holds, the unit of `LifeState.busy.slot` (`day × 4 + the slot's index`). */
export const SLOTS_PER_DAY = 4;

const eventsOf = (reg: Pick<Registries, 'lifeEvents'>): LifeEventEntry[] => [...reg.lifeEvents.values()] as unknown as LifeEventEntry[];

const unitOf = (state: Pick<CampaignState, 'squad'>, id: string): Unit | undefined => state.squad.find((u) => u.id === id);

/** A named, living soldier at the base: not out on an open run. Only she takes part in her life. */
export function takesPart(state: Pick<CampaignState, 'squad' | 'expedition'>, unitId: string): boolean {
  const u = unitOf(state, unitId);
  return u !== undefined && u.kind === 'named' && isLiving(u) && state.expedition?.party.includes(u.id) !== true;
}

/** Where she is on each slot of `day` (morning to evening): the rooms of the hub, derived the way the hub derives them. */
function roomsToday(state: CampaignState, reg: Registries, unitId: string, day: number): Array<{ reason: string; locationId: string | null }> {
  return DAY_SLOTS.map((slot) => {
    const w = whereabouts({ ...state, day, slot }, reg).find((x) => x.unitId === unitId);
    const room = w?.roomId ? reg.hubRooms.get(w.roomId) : undefined;
    return { reason: w?.reason ?? 'nowhere', locationId: typeof room?.sceneLocationId === 'string' ? room.sceneLocationId : null };
  });
}

/** The absolute slot index of the busy list for a day and a slot. */
export const busySlot = (day: number, slot: Slot): number => day * SLOTS_PER_DAY + ['morning', 'afternoon', 'evening', 'night'].indexOf(slot);

/**
 * Whether every condition of `req` holds for her on `day` (each field reads state that already exists; an empty `req` always holds).
 * The closed vocabulary is `LifeRequires`; a field this function does not know never holds.
 */
export function requiresHold(state: CampaignState, reg: Registries, unitId: string, req: LifeRequires | undefined, day: number): boolean {
  if (!req) return true;
  const unit = unitOf(state, unitId);
  if (!unit) return false;
  const life = state.life;
  const rel = state.relations[unitId];
  const run = state.expedition;
  for (const [field, value] of Object.entries(req)) {
    let ok: boolean;
    switch (field as keyof LifeRequires) {
      case 'hobby': ok = (unit.hobbies ?? []).some((h) => h.state === 'active' && (value === 'any' || h.id === value)); break;
      case 'location': ok = roomsToday(state, reg, unitId, day).some((r) => r.reason === 'routine' && r.locationId !== null && (value as string[]).includes(r.locationId)); break;
      case 'activity': {
        const lo = day * SLOTS_PER_DAY;
        ok = (life?.busy ?? []).some((b) => b.unitId === unitId && b.slot >= lo && b.slot < lo + SLOTS_PER_DAY && b.activityId !== undefined && (value as string[]).includes(b.activityId));
        break;
      }
      case 'afterRun': {
        const last = state.lastExpedition;
        ok = last !== undefined && last.day >= day - 1 && last.party.includes(unitId) && ((value as { hurt?: true }).hurt !== true || last.injuries.includes(unitId));
        break;
      }
      case 'noRunDays': {
        const last = state.lastExpedition;
        ok = run?.party.includes(unitId) !== true && !(last?.party.includes(unitId) === true && day - last.day < (value as number));
        break;
      }
      case 'stressMin': ok = unit.stress >= (value as number); break;
      case 'stressMax': ok = unit.stress <= (value as number); break;
      case 'defectCategory': ok = unit.defects.some((d) => reg.defects.get(d.id)?.category === value); break;
      case 'injured': ok = unit.injuries.length > 0; break;
      case 'otherNamed': ok = state.squad.some((u) => u.id !== unitId && takesPart(state, u.id)); break;
      case 'affinityMin': ok = rel !== undefined && rel.affinity >= (value as number); break;
      case 'trustMin': ok = rel !== undefined && rel.trust >= (value as number); break;
      case 'romantic': ok = bondTierOf(state, reg, unitId) === 'romantic'; break;
      case 'leaderNotHer': { const leader = leaderOf(state); ok = leader !== null && leader.id !== unitId; break; }
      case 'gruntDiedDays': ok = (life?.deaths ?? []).some((d) => d.grunt && day - d.day >= 0 && day - d.day <= (value as number)); break;
      case 'deathAgo': ok = (life?.deaths ?? []).some((d) => day - d.day >= (value as number) && (day - d.day) % (value as number) === 0); break;
      case 'rumour': ok = state.rumors.length > 0; break;
      case 'rationsShort': ok = rationsOf(state) !== 'equal' || (life?.shortageDay !== undefined && day - life.shortageDay <= TUNING.life.shortageDays); break;
      case 'sparring': {
        const winner = value === 'won' ? 'unit' : 'commander';
        ok = (state.personal?.wagers?.log ?? []).some((w) => w.unitId === unitId && day - w.day <= TUNING.life.sparringDays && w.winner === winner && reg.wagerGames.get(w.gameId)?.kind === 'sparring');
        break;
      }
      case 'bloomHalf': ok = state.world.clocks.some((c) => c.regionId !== undefined && c.filled * 2 >= c.segments); break;
      case 'missionBoard': ok = state.missions.offered.length > 0; break;
      case 'afterEvent': { const at = life?.units[unitId]?.last[value as string]; ok = at !== undefined && day - at <= TUNING.life.afterEventDays; break; }
      case 'otherHadThisWeek':
        ok = Object.entries(life?.units ?? {}).some(([id, l]) => id !== unitId && l.last[value as string] !== undefined && day - l.last[value as string] <= TUNING.life.otherWeekDays);
        break;
      default: ok = false;
    }
    if (!ok) return false;
  }
  return true;
}

/** Events a woman may have this week (a hash of her id staggers `rare`: one every other week). */
function weekAllowance(state: CampaignState, unitId: string, week: number): number {
  const mode = lifeMode(state);
  if (mode === 'off' || !state.life) return 0;
  const perWeek = TUNING.life.perWeek[mode];
  if (perWeek >= 1) return perWeek;
  return (week + lifeHash(state.life, unitId)) % 2 === 0 ? 1 : 0;
}

/** What she has had this week (zero when the stored week is an earlier one). */
function weekOf(state: CampaignState, unitId: string, day: number): { n: number; events: number; notable: number } {
  const week = Math.floor(day / 7);
  const w = state.life?.units[unitId]?.week;
  return w !== undefined && w.n === week ? w : { n: week, events: 0, notable: 0 };
}

/**
 * The entries that can happen to her on `day`: their `requires` hold and no cooldown stands (her own last day of this kind + `cooldownDays`,
 * 21 for a small event and 45 for a notable one; the same kind for any woman within `squadKindDays`). A `yearly` event is in the pool only
 * on its own day of the year. A notable one is left out once she has had one this week (a yearly one is not: it is her day). Registry order.
 */
export function eventPool(state: CampaignState, reg: Registries, unitId: string, day: number): LifeEventEntry[] {
  const life = state.life;
  if (!life || !takesPart(state, unitId)) return [];
  const mine = life.units[unitId]?.last ?? {};
  const week = weekOf(state, unitId, day);
  return eventsOf(reg).filter((e) => {
    if (e.size === 'notable' && e.yearly !== true && week.notable >= TUNING.life.notablePerWeek) return false;
    const cooldown = e.yearly === true ? TUNING.life.cooldown.yearly : (e.cooldownDays ?? TUNING.life.cooldown[e.size]);
    if (mine[e.id] !== undefined && day - mine[e.id] < cooldown) return false;
    if (life.kinds.some((k) => k.kind === e.id && k.unitId !== unitId && day - k.day < TUNING.life.squadKindDays)) return false;
    if (e.yearly === true && lifeHash(life, `${unitId}|vat`) % TUNING.life.cooldown.yearly !== day % TUNING.life.cooldown.yearly) return false;
    return requiresHold(state, reg, unitId, e.requires, day);
  });
}

/**
 * The life event that happens to her on `day`, or null. She has at most one a day and the week's allowance (`rare` every other week, `normal`
 * one, `often` two); today's chance is the allowance over seven days times `dayBoost`, so the allowance is usually used. A `yearly` event in
 * the pool takes the day without the chance or the allowance (an anniversary that mostly did not happen would not be one); it still counts
 * toward the week. The pick is a hash over the pool.
 */
export function pickLifeEvent(state: CampaignState, reg: Registries, unitId: string, day: number): LifeEventEntry | null {
  const life = state.life;
  const mode = lifeMode(state);
  if (!life || mode === 'off' || !takesPart(state, unitId)) return null;
  const week = weekOf(state, unitId, day);
  const pool = eventPool(state, reg, unitId, day);
  if (pool.length === 0) return null;
  const yearly = pool.filter((e) => e.yearly === true);
  if (yearly.length === 0 && week.events >= weekAllowance(state, unitId, week.n)) return null;
  if (yearly.length === 0 && !lifeChance(life, `${unitId}|life|${day}`, Math.min(1, (TUNING.life.perWeek[mode] / 7) * TUNING.life.dayBoost))) return null;
  const from = yearly.length > 0 ? yearly : pool;
  return from[lifeHash(life, `${unitId}|life|${day}|pick`) % from.length];
}

/** Who she would tell: a `keeps` event she shares anyway when ANY of its `keepsUnless` conditions holds (Affinity at the minimum, or romance). */
export function effectiveShare(state: CampaignState, reg: Registries, unitId: string, entry: LifeEventEntry): LifeShare {
  if (entry.share !== 'keeps') return entry.share;
  const rel = state.relations[unitId];
  const u = entry.keepsUnless;
  const lifted = u !== undefined
    && ((u.affinityMin !== undefined && rel !== undefined && rel.affinity >= u.affinityMin) || (u.romantic === true && bondTierOf(state, reg, unitId) === 'romantic'));
  return lifted ? 'close' : 'keeps';
}

/** The chance she tells the commander: by talkativeness, halved below the Affinity a closer friend needs; `close` news needs that Affinity, `keeps` is never told. */
export function shareChance(state: CampaignState, reg: Registries, unitId: string, entry: LifeEventEntry): number {
  const share = effectiveShare(state, reg, unitId, entry);
  if (share === 'keeps') return 0;
  const close = (state.relations[unitId]?.affinity ?? 0) >= TUNING.life.shareAffinity;
  if (share === 'close' && !close) return 0;
  return TUNING.life.share[temperamentOf(state, unitId).talkativeness] * (close ? 1 : TUNING.life.shareLowMult);
}

/** What an event turns into: a hobby she takes up (or a push for one she has) and a topic her opinion may form on. */
function applyBecomes(draft: CampaignState, reg: Registries, unitId: string, entry: LifeEventEntry, day: number): EngineEvent[] {
  const events: EngineEvent[] = [];
  const unit = unitOf(draft, unitId);
  const becomes = entry.becomes;
  if (!unit || !becomes) return events;
  if (becomes.hobby !== undefined && reg.hobbies.has(becomes.hobby)) {
    const have = (unit.hobbies ??= []).find((h) => h.id === becomes.hobby);
    if (have) {
      // a push: the interest rises (the plateau a push breaks is the practice pass's)
      have.interest = Math.min(100, have.interest + TUNING.life.interest.push);
    } else {
      unit.hobbies!.push(newHobby(becomes.hobby, day));
      events.push({ type: 'hobby_started', unitId, hobbyId: becomes.hobby });
      const active = unit.hobbies!.filter((h) => h.state === 'active');
      if (active.length > TUNING.life.maxActive) {
        // a fourth active pushes the one she cares least about to cooling (ties: the older one)
        const least = active.filter((h) => h.id !== becomes.hobby).sort((a, b) => a.interest - b.interest)[0];
        least.state = 'cooling';
        least.coolingSince = day;
        events.push({ type: 'hobby_cooling', unitId, hobbyId: least.id });
      }
    }
  }
  if (becomes.opinionTopic !== undefined && reg.opinionTopics.has(becomes.opinionTopic) && unit.opinions?.[becomes.opinionTopic] === undefined) {
    const mine = (draft.life!.units[unitId] ??= { last: {} });
    const pending = (mine.pendingTopics ??= []);
    if (!pending.includes(becomes.opinionTopic)) pending.push(becomes.opinionTopic);
  }
  return events;
}

/**
 * Records a life event for her: the hidden fact, her hub line, the week's and the cooldowns' bookkeeping, `becomes`, and the share (a hit
 * queues it for the commander). A `keeps` event stays hers: no hub line, never queued.
 */
export function applyLifeEvent(draft: CampaignState, reg: Registries, unitId: string, entry: LifeEventEntry, day: number): EngineEvent[] {
  const life = draft.life;
  const unit = unitOf(draft, unitId);
  if (!life || !unit) return [];
  const mine = (life.units[unitId] ??= { last: {} });
  const week = weekOf(draft, unitId, day);
  mine.week = { n: week.n, events: week.events + 1, notable: week.notable + (entry.size === 'notable' ? 1 : 0) };
  mine.last[entry.id] = day;
  life.kinds = [...life.kinds.filter((k) => day - k.day < TUNING.life.kindsKeepDays), { kind: entry.id, unitId, day }];

  const fact = writeLifeFact(draft, unitId, `${unit.displayName}: ${plainText(String(entry.description))}`, [entry.id, ...(entry.tags ?? [])], entry.size === 'notable' ? 2 : 1);
  const events: EngineEvent[] = [{ type: 'life_event', unitId, eventId: entry.id, size: entry.size }];
  const share = effectiveShare(draft, reg, unitId, entry);
  if (share !== 'keeps') mine.hub = { eventId: entry.id, day };
  events.push(...applyBecomes(draft, reg, unitId, entry, day));
  if (lifeChance(life, `${unitId}|share|${day}|${entry.id}`, shareChance(draft, reg, unitId, entry))) {
    events.push(...enqueue(draft, {
      unitId, kind: 'event', ref: entry.id, what: 'event', factId: fact.id, category: entry.category, day,
      ...(entry.size === 'notable' ? { notable: true as const } : {}), ...(entry.urgent === true ? { urgent: true as const } : {}),
    }));
    events.push({ type: 'life_shared', unitId, eventId: entry.id });
  }
  return events;
}
