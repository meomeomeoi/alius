import type { Registries } from '../../content/types';
import { bondTierOf } from '../bonds';
import type { EngineEvent } from '../dispatch';
import { leaderOf } from '../power/state';
import { rationsOf } from '../power/state';
import { TUNING } from '../tuning';
import type { CampaignState } from '../state/types';
import { writeLifeFact, plainText } from './facts';
import { grantMilestone, openTopic, pushHobby, startHobby } from './hobbies';
import { enqueue } from './news';
import { SLOTS_PER_DAY, placesOf, takesPart, unitOf, type DayPlaces } from './places';
import { lifeChance, lifeHash, lifeMode, temperamentOf } from './state';
import type { LifeEventEntry, LifeRequires, LifeShare } from './types';

/**
 * Her days off-screen (P14c): which life events can happen to her, which one does, and what it writes. Nothing here draws from the rng: a
 * chance is `lifeChance(...)` and a pick is `lifeHash(...) % n` over a list in registry order, so the same state always answers the same.
 */

export { SLOTS_PER_DAY, busySlot, takesPart } from './places';

const eventsOf = (reg: Pick<Registries, 'lifeEvents'>): LifeEventEntry[] => [...reg.lifeEvents.values()] as unknown as LifeEventEntry[];

/** Where she is on each slot of `day` (morning to evening): the rooms of the hub, derived the way the hub derives them. */
function roomsToday(state: CampaignState, reg: Registries, unitId: string, day: number, cache?: DayPlaces): Array<{ reason: string; locationId: string | null }> {
  return placesOf(state, reg, unitId, day, cache).map((w) => {
    const room = w.roomId ? reg.hubRooms.get(w.roomId) : undefined;
    return { reason: w.reason, locationId: typeof room?.sceneLocationId === 'string' ? room.sceneLocationId : null };
  });
}

/**
 * Whether every condition of `req` holds for her on `day` (each field reads state that already exists; an empty `req` always holds).
 * The closed vocabulary is `LifeRequires`; a field this function does not know never holds.
 */
export function requiresHold(state: CampaignState, reg: Registries, unitId: string, req: LifeRequires | undefined, day: number, cache?: DayPlaces): boolean {
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
      case 'location': ok = roomsToday(state, reg, unitId, day, cache).some((r) => r.reason === 'routine' && r.locationId !== null && (value as string[]).includes(r.locationId)); break;
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
      case 'gruntDiedDays': ok = (life?.deaths ?? []).some((d) => d.old !== true && d.grunt && day - d.day >= 0 && day - d.day <= (value as number)); break;
      case 'deathAgo': ok = (life?.deaths ?? []).some((d) => d.old !== true && day - d.day >= (value as number) && (day - d.day) % (value as number) === 0); break;
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
export function eventPool(state: CampaignState, reg: Registries, unitId: string, day: number, cache: DayPlaces = new Map()): LifeEventEntry[] {
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
    return requiresHold(state, reg, unitId, e.requires, day, cache);
  });
}

/**
 * The life event that happens to her on `day`, or null. She has at most one a day and the week's allowance (`rare` every other week, `normal`
 * one, `often` two); today's chance is the allowance over seven days times `dayBoost`, so the allowance is usually used. A `yearly` event in
 * the pool takes the day without the chance or the allowance (an anniversary that mostly did not happen would not be one); it still counts
 * toward the week. The pick is a hash over the pool.
 */
export function pickLifeEvent(state: CampaignState, reg: Registries, unitId: string, day: number, cache?: DayPlaces): LifeEventEntry | null {
  const life = state.life;
  const mode = lifeMode(state);
  if (!life || mode === 'off' || !takesPart(state, unitId)) return null;
  const week = weekOf(state, unitId, day);
  const pool = eventPool(state, reg, unitId, day, cache);
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

/**
 * The hobby a `milestone` event moves on: the one it names (`becomes.hobby`, else the one it requires), and for `any` one of her active hobbies
 * that can still move on, picked by a hash. Null when she has none.
 */
function milestoneHobby(draft: CampaignState, reg: Registries, unitId: string, entry: LifeEventEntry, day: number): string | null {
  const unit = unitOf(draft, unitId);
  const named = entry.becomes?.hobby ?? (entry.requires?.hobby !== 'any' ? entry.requires?.hobby : undefined);
  const movable = (unit?.hobbies ?? []).filter((h) => h.state === 'active' && h.mastered !== true && h.ceiling !== true && h.milestones.length < 4 && reg.hobbies.has(h.id));
  if (named !== undefined) return movable.some((h) => h.id === named) ? named : null;
  return movable.length === 0 ? null : movable[lifeHash(draft.life!, `${unitId}|${day}|milestone`) % movable.length].id;
}

/**
 * What an event turns into: a hobby she takes up (or a push for one she has: its interest rises and a plateau breaks), the next milestone of a
 * hobby (the event is the news, so the milestone is not queued again), and a topic her opinion may form on.
 */
function applyBecomes(draft: CampaignState, reg: Registries, unitId: string, entry: LifeEventEntry, day: number, facts: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  const unit = unitOf(draft, unitId);
  const becomes = entry.becomes;
  if (!unit || !becomes) return events;
  if (becomes.hobby !== undefined && reg.hobbies.has(becomes.hobby)) {
    const have = (unit.hobbies ??= []).find((h) => h.id === becomes.hobby);
    if (have) events.push(...pushHobby(draft, reg, unitId, becomes.hobby, day));
    else events.push(...startHobby(draft, reg, unitId, becomes.hobby, day, 'event', facts));
  }
  if (becomes.milestone === true) {
    const id = milestoneHobby(draft, reg, unitId, entry, day);
    const h = id === null ? undefined : unit.hobbies?.find((x) => x.id === id);
    if (id !== null && h) events.push(...grantMilestone(draft, reg, unitId, id, h.milestones.length, { told: true, facts }));
  }
  if (becomes.opinionTopic !== undefined) openTopic(draft, reg, unitId, becomes.opinionTopic);
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
  const also: string[] = []; // what `becomes` wrote about her (a milestone, a hobby): told with the event
  events.push(...applyBecomes(draft, reg, unitId, entry, day, also));
  if (lifeChance(life, `${unitId}|share|${day}|${entry.id}`, shareChance(draft, reg, unitId, entry))) {
    events.push(...enqueue(draft, {
      unitId, kind: 'event', ref: entry.id, what: 'event', factId: fact.id, category: entry.category, day,
      ...(also.length > 0 ? { alsoFacts: also } : {}),
      ...(entry.size === 'notable' ? { notable: true as const } : {}), ...(entry.urgent === true ? { urgent: true as const } : {}),
    }));
    events.push({ type: 'life_shared', unitId, eventId: entry.id });
  }
  return events;
}
