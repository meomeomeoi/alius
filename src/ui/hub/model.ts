import type { Registries } from '../../content/types';
import { isLiving } from '../../engine/economy';
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
  const first = objectiveList(state, reg)[0];
  if (first) return { text: first.text, dueDays: first.dueDays, source: first.source };
  const active = state.missions.active;
  const pick =
    active.find((m) => m.spineBeat !== undefined)
    ?? [...active].filter((m) => m.deadlineDay !== undefined).sort((a, b) => (a.deadlineDay as number) - (b.deadlineDay as number))[0]
    ?? active[0]
    ?? state.missions.offered.find((m) => m.spineBeat !== undefined);
  return pick ? { text: pick.title, dueDays: dueIn(pick, state.day), source: 'mission', missionId: pick.id } : null;
}

export interface TonightItem {
  kind: 'knock' | 'dm' | 'demand' | 'intake' | 'deadline' | 'warning';
  text: string;
  unitId?: string;
  tone: MarkerTone;
  /** Analysis address (`glossary:<id>`) of the line. */
  analyze: string;
}

const TONIGHT_MAX = 6;

/** The night entry a loyalty sign of kind `talk` queues: the one visit the existing toast already announces. */
const KNOCK_KIND = 'we_need_to_talk';

const unreadFrom = (state: CampaignState, unitId: string): number => (state.dms[unitId] ?? []).filter((m) => m.from !== 'commander' && !m.read).length;

/** What is waiting by the end of the day, in a fixed order, at most six lines. */
export function tonightItems(state: CampaignState, _reg: Registries): TonightItem[] {
  const out: TonightItem[] = [];
  const living = state.squad.filter(isLiving);
  const nameOf = (id: string): string => living.find((u) => u.id === id)?.displayName ?? '';

  for (const e of state.calendar.nightEventsQueue) {
    if (e.kind !== KNOCK_KIND || e.expiresDay < state.day || !nameOf(e.unitId)) continue;
    out.push({ kind: 'knock', text: `${nameOf(e.unitId)} will knock tonight.`, unitId: e.unitId, tone: 'warn', analyze: 'glossary:tonight' });
  }
  for (const u of living) {
    const n = unreadFrom(state, u.id);
    if (n > 0) out.push({ kind: 'dm', text: `${u.displayName}: ${n} unread message${n === 1 ? '' : 's'}.`, unitId: u.id, tone: 'neutral', analyze: 'glossary:tonight' });
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
  return out.slice(0, TONIGHT_MAX);
}

/** Why `END {SLOT}` cannot be pressed right now, or `null`. Read-only campaigns are the caller's business. */
export function endSlotBlock(state: CampaignState): string | null {
  if (state.scene) return 'A conversation is open.';
  if (state.calendar.pendingScene) return 'A talk is waiting for its scene.';
  if (state.expedition) return 'The squad is out.';
  if (state.dilemmas?.open?.status === 'presented') return 'A decision is waiting.';
  if (state.calendar.nightEvent) return 'Someone is at the door.';
  return null;
}

/** The newest Leash request of today or yesterday, for the hub's oversight card. */
export function latestOversight(state: CampaignState): LeashLogEntry | null {
  const recent = leashLog(state).filter((e) => e.day >= state.day - 1);
  return recent.reduce<LeashLogEntry | null>((best, e) => (best === null || e.no > best.no ? e : best), null);
}
