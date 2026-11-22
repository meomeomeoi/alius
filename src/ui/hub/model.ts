import { fullOpenRecords } from '../../llm/sites';
import { aftermathRowOf } from '../../engine/dynamic/aftermath';
import { dynamicOn } from '../../engine/dynamic/gate';
import type { Registries } from '../../content/types';
import { HANDLER_VISIT_KIND } from '../../engine/special/state';
import { isLiving } from '../../engine/economy';
import { bookingGuard } from '../../engine/personal/bookings';
import { objectiveList, waitingDemands, type ObjectiveSource } from '../../engine/onboarding';
import { leashLog } from '../../engine/leash/weekly';
import { affinityBand } from '../../engine/relations/bands';
import type { CampaignState, LeashLogEntry, Unit } from '../../engine/state/types';
import type { Mission } from '../../engine/world/types';

/**
 * Pure readers behind the hub: what colour of ring a marker gets, the standing order, the Tonight list and why the
 * END button is dead. Nothing here reveals a value the PDA does not already show.
 */

export type MarkerTone = 'danger' | 'bond' | 'trust' | 'affinity' | 'warn' | 'neutral';

/** The symbol that travels with every tone, so colour is never the only carrier. */
export const TONE_GLYPH: Record<MarkerTone, string> = { danger: '!', bond: '♥', trust: '+', affinity: '*', warn: '~', neutral: '·' };

/** The word that names each tone, for the legend and for screen readers. */
export const TONE_LABEL: Record<MarkerTone, string> = { danger: 'danger', bond: 'bond', trust: 'trust', affinity: 'affinity', warn: 'warning', neutral: 'steady' };

const isInjured = (u: Unit): boolean => u.status === 'injured' || (u.injuryDays ?? 0) > 0;

/**
 * The ring of a marker. Danger wins over everything; then a romantic bond, a platonic bond, a warning (a cold state or
 * rising stress) and, last, devoted warmth. A unit without a relation (a grunt) reads from stress and injury alone.
 */
export function markerTone(state: CampaignState, reg: Registries, unit: Unit): MarkerTone {
  const rel = state.relations[unit.id];
  if (unit.stress >= 80 || isInjured(unit) || rel?.loyaltyBand === 'breaking') return 'danger';
  const st = rel ? reg.relationshipStates.get(rel.stateId) : undefined;
  if (st?.romance === true) return 'bond';
  if (st?.group === 'platonic') return 'trust';
  if (st?.group === 'negative' || unit.stress >= 50) return 'warn';
  if (rel && affinityBand(rel.affinity) === 'devoted') return 'affinity';
  return 'neutral';
}

/** The hub's standing order. `source` says where it came from; `missionId` only the mission fallback has. */
export interface Objective { text: string; dueDays: number | null; source: ObjectiveSource | 'mission'; missionId?: string }

const dueIn = (m: Mission, day: number): number | null => (m.deadlineDay === undefined ? null : m.deadlineDay - day);

/**
 * The standing order: the first of the objective list (prologue step, proposed beat, the director's lead, a soldier
 * waiting), else the old mission pick (the active story mission, else the active mission with the nearest deadline, else
 * an offered story mission), else nothing. An older save has no list, so it reads exactly as it did.
 */
export function currentObjective(state: CampaignState, reg: Registries): Objective | null {
  const list = objectiveList(state, reg);
  // a soldier waiting is secondary: it never pushes a mission off the hub (an older save reads as it did)
  const first = list.find((o) => o.source !== 'unit');
  if (first) return { text: first.text, dueDays: first.dueDays, source: first.source };
  const active = state.missions.active;
  const pick =
    active.find((m) => m.spineBeat !== undefined)
    ?? [...active].filter((m) => m.deadlineDay !== undefined).sort((a, b) => (a.deadlineDay as number) - (b.deadlineDay as number))[0]
    ?? active[0]
    ?? state.missions.offered.find((m) => m.spineBeat !== undefined);
  if (pick) return { text: pick.title, dueDays: dueIn(pick, state.day), source: 'mission', missionId: pick.id };
  const unit = list[0];
  return unit ? { text: unit.text, dueDays: unit.dueDays, source: unit.source } : null;
}

export interface TonightItem {
  kind: 'knock' | 'dm' | 'note' | 'demand' | 'intake' | 'deadline' | 'warning' | 'booking' | 'dynamic' | 'generation';
  text: string;
  unitId?: string;
  tone: MarkerTone;
  /** Analysis address (`glossary:<id>`) of the line. */
  analyze: string;
}

const TONIGHT_MAX = 6;
const SLOT_RANK: Record<string, number> = { morning: 0, afternoon: 1, evening: 2, night: 3 };

/** The night entry a loyalty sign of kind `talk` queues: the one visit the existing toast already announces. */
const KNOCK_KIND = 'we_need_to_talk';

const unreadFrom = (state: CampaignState, unitId: string): number => (state.dms[unitId] ?? []).filter((m) => m.from !== 'commander' && !m.read).length;

/** What is waiting by the end of the day, in a fixed order, at most six lines. */
export function tonightItems(state: CampaignState, reg: Registries): TonightItem[] {
  const out: TonightItem[] = [];
  const living = state.squad.filter(isLiving);
  const nameOf = (id: string): string => living.find((u) => u.id === id)?.displayName ?? '';

  for (const e of state.calendar.nightEventsQueue) {
    if (e.kind !== KNOCK_KIND || e.expiresDay < state.day || !nameOf(e.unitId)) continue;
    out.push({ kind: 'knock', text: `${nameOf(e.unitId)} will knock tonight.`, unitId: e.unitId, tone: 'warn', analyze: 'glossary:tonight' });
  }
  // P12: the rival corporation's handler at the gate (an own-panel entry that belongs to no soldier)
  if (state.calendar.nightEventsQueue.some((e) => e.kind === HANDLER_VISIT_KIND && e.expiresDay >= state.day)) {
    out.push({ kind: 'knock', text: 'A visitor at the gate.', tone: 'warn', analyze: 'glossary:handler' });
  }
  for (const u of living) {
    const n = unreadFrom(state, u.id);
    if (n > 0) out.push({ kind: 'dm', text: `${u.displayName}: ${n} unread message${n === 1 ? '' : 's'}.`, unitId: u.id, tone: 'neutral', analyze: 'glossary:tonight' });
  }
  // P10b: a note pushed under the door (unread, from today or yesterday)
  for (const n of state.notes?.list ?? []) {
    if (n.where !== 'door' || n.read === true || state.day - n.day > 1 || !nameOf(n.unitId)) continue;
    out.push({ kind: 'note', text: `${nameOf(n.unitId)} left a note under your door.`, unitId: n.unitId, tone: 'neutral', analyze: 'glossary:hand_note' });
  }
  for (const d of waitingDemands(state)) {
    out.push({ kind: 'demand', text: `${nameOf(d.unitId)} is waiting for an answer.`, unitId: d.unitId, tone: 'warn', analyze: 'glossary:demand' });
  }
  if ((state.world.incomingUnits ?? 0) > 0) out.push({ kind: 'intake', text: 'A new unit is waiting for intake.', tone: 'neutral', analyze: 'glossary:tonight' });
  for (const m of [...state.missions.active, ...state.missions.offered]) {
    const due = dueIn(m, state.day);
    if (due === null || due < 0 || due > 1) continue;
    out.push({ kind: 'deadline', text: `${m.title}: due ${due === 0 ? 'today' : 'tomorrow'}.`, tone: due === 0 ? 'danger' : 'warn', analyze: 'glossary:mission_deadline' });
  }
  const shortage = state.calendar.shortageStreak ?? 0;
  if (shortage > 0) out.push({ kind: 'warning', text: `SHORTAGE ${shortage}d`, tone: 'danger', analyze: 'glossary:upkeep' });
  const injured = (state.commander.injuredUntilDay ?? 0) - state.day;
  if (injured > 0) out.push({ kind: 'warning', text: `INJURED ${injured}d`, tone: 'danger', analyze: 'glossary:commander_injury' });
  // P9c: the next slot a soldier booked (today's or tomorrow's), last in the order
  const booked = (state.personal?.bookings ?? [])
    .filter((b) => b.status === 'booked' && (b.day === state.day || b.day === state.day + 1) && nameOf(b.unitId))
    .sort((a, b) => a.day - b.day || SLOT_RANK[a.slot] - SLOT_RANK[b.slot])[0];
  if (booked) {
    out.push({
      kind: 'booking', text: `${nameOf(booked.unitId)} has booked ${booked.day === state.day ? 'today' : 'tomorrow'}'s ${booked.slot}.`, unitId: booked.unitId,
      tone: booked.day === state.day ? 'warn' : 'neutral', analyze: 'glossary:booking',
    });
  }
  // P15: a holder who waits for an answer (an open milestone, claim or return offer): one line for each woman, after the booking, naming nobody's number and no frame
  if (dynamicOn(state, reg)) {
    const open = state.dynamic!.open;
    const waiting = new Set<string>();
    const milestoneFor = new Set<string>(open.milestones.map((m) => m.unitId));
    const claimFor = new Set<string>(open.claims.map((c) => c.unitId));
    const returnFor = open.returnOffer?.unitId;
    for (const id of [...open.milestones.map((m) => m.unitId), ...open.claims.map((c) => c.unitId), ...(open.returnOffer ? [open.returnOffer.unitId] : [])]) if (nameOf(id)) waiting.add(id);
    for (const id of waiting) {
      out.push({ kind: 'dynamic', text: `${nameOf(id)} has something to ask.`, unitId: id, tone: 'warn', analyze: milestoneFor.has(id) ? 'glossary:milestone' : claimFor.has(id) ? 'glossary:claim' : returnFor === id ? 'glossary:aftermath' : 'glossary:frame' });
    }
    // P15: the notice of the stage an aftermath of hers is in (her words; never the kind, the stage number or a day), and oversight's threat to move a holder (no day either)
    for (const u of living) {
      const aftermath = state.relations[u.id]?.dynamic?.aftermath;
      const notice = aftermath === undefined ? undefined : (aftermathRowOf(reg, aftermath.kind)?.stages[aftermath.stage]?.notice);
      if (notice !== undefined) out.push({ kind: 'dynamic', text: `${u.displayName}: ${notice}`, unitId: u.id, tone: 'neutral', analyze: 'glossary:aftermath' });
    }
    const threat = state.dynamic!.oversight?.threat;
    if (threat !== undefined && nameOf(threat.unitId) !== '') {
      out.push({ kind: 'dynamic', text: `Oversight will move ${nameOf(threat.unitId)} unless the commander's Leash requests are released.`, unitId: threat.unitId, tone: 'danger', analyze: 'glossary:oversight_inquiry' });
    }
  }
  // P14: failed generations that wait for a retry, always the last line (the cut keeps room for it, so a full list never drops it)
  const failed = fullOpenRecords(state).length;
  const line: TonightItem | null = failed > 0
    ? { kind: 'generation', text: `${failed} generation${failed === 1 ? '' : 's'} failed.`, tone: 'warn', analyze: 'glossary:generation_record' }
    : null;
  return line ? [...cutTonight(out, TONIGHT_MAX - 1), line] : cutTonight(out, TONIGHT_MAX);
}

/**
 * Keeps `max` lines. Without a dynamic line it is the first `max`, as it always was. With some, the lines of the dynamic are never cut before an older one, and oversight's threat to move a
 * holder (it has a deadline) is the last of all to go; the lines that stay keep their order.
 */
function cutTonight(items: TonightItem[], max: number): TonightItem[] {
  if (items.length <= max) return items;
  const score = (i: TonightItem): number => (i.kind !== 'dynamic' ? 1 : i.analyze === 'glossary:oversight_inquiry' ? 3 : 2);
  const keep = new Set(items.map((item, at) => ({ item, at })).sort((a, b) => score(b.item) - score(a.item) || a.at - b.at).slice(0, max).map((x) => x.at));
  return items.filter((_, at) => keep.has(at));
}

/** Why `END {SLOT}` cannot be pressed right now, or `null`. Read-only campaigns are the caller's business. */
export function endSlotBlock(state: CampaignState): string | null {
  if (state.scene) return 'A conversation is open.';
  if (state.calendar.pendingScene) return 'A talk is waiting for its scene.';
  if (state.expedition) return 'The squad is out.';
  if (state.dilemmas?.open?.status === 'presented') return 'A decision is waiting.';
  if (state.calendar.nightEvent) return 'Someone is at the door.';
  return bookingGuard(state, { type: 'calendar/consume_slot' })?.message ?? null; // P9c: a slot she booked and can keep
}

/** The newest Leash request of today or yesterday, for the hub's oversight card. */
export function latestOversight(state: CampaignState): LeashLogEntry | null {
  const recent = leashLog(state).filter((e) => e.day >= state.day - 1);
  return recent.reduce<LeashLogEntry | null>((best, e) => (best === null || e.no > best.no ? e : best), null);
}
