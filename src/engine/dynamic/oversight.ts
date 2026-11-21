/**
 * Oversight's inquiry (P15, plan R16, spec §10): the block has an outside limit. Every Leash request a holder holds or cancels is noted
 * (`leashBlock.ts`); when `blockedMax` of them fall within the span (`spanDays`, shortened by the holder's cover) the engine clock
 * `oversight_inquiry` moves one segment, the first time with a thread, and the count starts over. At 3 and 5 segments oversight sends a notice; when it
 * fills, oversight acts on the holder, by a hash and never a draw: a reprimand (her stress and hold), a transfer threat (she has `threatDays` to lift
 * the block, else she is reassigned) or a forced Leash on her (a `done` entry copying oversight, the means of a `force` exit that day). The clock then
 * starts over. Also here: the transfer request the commander files (the other means of a forced exit). All of it says `oversight_inquiry { stage }`;
 * the chance, the span and the pick are hidden. Nothing here runs while the dynamic is off.
 */
import type { Registries } from '../../content/types';
import { addFact } from '../memory/facts';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { nextNo, removeFromService } from '../leash/use';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { advanceClock, addClock } from '../world/clocks';
import { clockById } from '../world/state';
import type { Clock } from '../world/types';
import { coverMult } from './cover';
import { dynamicOn } from './gate';
import { addHold } from './hold';
import { leashBlockOf } from './leashBlock';
import { dynamicOf } from './state';
import { dynamicRoll } from './witness';

export { coverMult };

/** The engine clock the inquiry moves (its `clocks` entry carries `engine`, so the world does not seed it). */
export const OVERSIGHT_CLOCK = 'oversight_inquiry';
/** The thread the director sees. */
const THREAD = 'oversight_inquiry';

/** What oversight can do to her when the inquiry fills, in the order the hash picks from. */
export const OVERSIGHT_ACTS = ['reprimand', 'transfer_threat', 'forced_leash'] as const;
export type OversightAct = (typeof OVERSIGHT_ACTS)[number];

type Ctx = Pick<EngineCtx, 'registries' | 'rng'>;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const stage = (s: string, extra: Record<string, unknown> = {}): EngineEvent => ({ type: 'oversight_inquiry', stage: s, ...extra });

/** The act oversight takes against her, from a hash of her and the day (no draw): the same state always picks the same. */
export function oversightActOf(state: CampaignState, holderId: string): OversightAct {
  return OVERSIGHT_ACTS[Math.min(OVERSIGHT_ACTS.length - 1, Math.floor(dynamicRoll(state, holderId, 'oversight_acts') * OVERSIGHT_ACTS.length))];
}

/** The clock of the inquiry: made from its entry the first time it is needed (the world does not seed it). */
function ensureClock(draft: CampaignState, reg: Registries): Clock | undefined {
  const have = clockById(draft, OVERSIGHT_CLOCK);
  if (have !== undefined) return have;
  const def = reg.clocks.get(OVERSIGHT_CLOCK);
  if (def === undefined) return undefined;
  addClock(draft, { id: OVERSIGHT_CLOCK, label: String(def.label), segments: def.segments as number, filled: def.startFilled as number, visibleToPlayer: def.visibleToPlayer === true, engine: true });
  return clockById(draft, OVERSIGHT_CLOCK);
}

/** The thread opens the first time the inquiry moves, and again after a cycle that ended (a resolved thread is reopened, never doubled). Names nobody. */
function openThread(draft: CampaignState, reg: Registries): boolean {
  const title = String(reg.clocks.get(OVERSIGHT_CLOCK)?.label ?? 'Oversight inquiry');
  const have = draft.world.threads.find((t) => t.id === THREAD);
  if (have !== undefined) {
    if (have.status === 'open') return false;
    have.status = 'open';
    return true;
  }
  draft.world.threads.push({ id: THREAD, title, status: 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: draft.day });
  return true;
}

/** The world's fact of a notice: it says what oversight is looking at and names no one. */
const NOTICE_TEXT: Readonly<Record<number, string>> = {
  3: 'AUTHOR TO WRITE: Oversight has started asking why so many Leash requests from the commander\'s device were never filed.',
  5: 'AUTHOR TO WRITE: Oversight has opened a formal inquiry into the commander\'s cancelled Leash requests.',
};

/** Stress an act puts on her, clamped. */
function addStress(draft: CampaignState, unitId: string, amount: number): EngineEvent[] {
  const u = draft.squad.find((x) => x.id === unitId);
  if (u === undefined || amount === 0) return [];
  const next = clamp(u.stress + amount, 0, 100);
  const delta = next - u.stress;
  u.stress = next;
  return delta === 0 ? [] : [{ type: 'stress_changed', unitId, delta }];
}

/**
 * Oversight acts on her (the inquiry filled): a hashed pick of a reprimand, a transfer threat or a forced Leash (see the file's head). The
 * forced Leash is oversight's own: it spends none of the commander's authorizations and costs the commander nothing. Draws nothing.
 */
export function oversightActs(draft: CampaignState, ctx: Ctx, holderId: string): EngineEvent[] {
  const dyn = dynamicOf(draft, holderId);
  const unit = draft.squad.find((u) => u.id === holderId);
  if (dyn === undefined || unit === undefined || !isLiving(unit)) return [];
  const O = TUNING.dynamic.oversight;
  const act = oversightActOf(draft, holderId);
  const events: EngineEvent[] = [stage(act, { unitId: holderId })];
  if (act === 'reprimand') {
    events.push(...addStress(draft, holderId, O.reprimandStress), ...addHold(draft, ctx, holderId, -O.reprimandHold, 'oversight', { practice: false }));
  } else if (act === 'transfer_threat') {
    (draft.dynamic!.oversight ??= { blocked: [] }).threat = { unitId: holderId, untilDay: draft.day + O.threatDays };
  } else {
    const no = nextNo(draft);
    draft.leash.log.push({ no, unitId: holderId, kind: 'compel', day: draft.day, context: 'pda', outcome: 'done', cc: 'oversight' });
    if (draft.leash.log.length > TUNING.leash.logMax) draft.leash.log.splice(0, draft.leash.log.length - TUNING.leash.logMax);
    const rel = draft.relations[holderId];
    if (rel !== undefined && !rel.flags.includes('leashed')) rel.flags.push('leashed');
    events.push({ type: 'leash_used', kind: 'compel', unitId: holderId, no, outcome: 'done', by: 'oversight' }, ...addStress(draft, holderId, TUNING.leash.compel.stress));
  }
  return events;
}

/** The transfer threat's day: she is reassigned while the block still stands (waiting while she is in a scene, a fight or a run), else she stays. */
function threatDayStep(draft: CampaignState, ctx: Ctx): EngineEvent[] {
  const o = draft.dynamic?.oversight;
  const t = o?.threat;
  if (o === undefined || t === undefined) return [];
  const unit = draft.squad.find((u) => u.id === t.unitId);
  if (unit === undefined || !isLiving(unit)) { delete o.threat; return []; }
  if (draft.day < t.untilDay) return [];
  if (leashBlockOf(draft, ctx.registries) !== t.unitId) {
    delete o.threat;
    return [stage('lifted', { unitId: t.unitId })];
  }
  const busy = draft.scene?.participants.includes(t.unitId) || draft.combat?.combatants.some((c) => c.unitId === t.unitId) || draft.expedition?.party.includes(t.unitId);
  if (busy) return []; // she is not where oversight can reach her: it waits for the next day
  const events = removeFromService(draft, t.unitId, 'reassigned', ctx as EngineCtx);
  delete o.threat;
  return [stage('reassigned', { unitId: t.unitId }), ...events];
}

/**
 * Day end: the transfer threat's day, then oversight counts the requests that were held or cancelled in the span. `blockedMax` of them move the
 * inquiry one segment (once; the count starts over). A notice at the segments of `notices`, and on fill oversight acts on the holder it was about.
 * The span is `spanDays` times the holder's cover. Draws nothing, and does nothing without blocks, a threat or a request on file.
 */
export function oversightDayStep(draft: CampaignState, ctx: Ctx): EngineEvent[] {
  const x = draft.dynamic;
  const o = x?.oversight;
  if (x === undefined || o === undefined || !dynamicOn(draft, ctx.registries)) return [];
  const O = TUNING.dynamic.oversight;
  const events: EngineEvent[] = threatDayStep(draft, ctx);
  o.requests = (o.requests ?? []).filter((r) => draft.day - r.day <= 3);
  if (o.requests.length === 0) delete o.requests;
  const span = Math.max(1, Math.round(O.spanDays * coverMult(draft, ctx.registries)));
  o.blocked = o.blocked.filter((d) => draft.day - d <= span);
  if (o.blocked.length < O.blockedMax) return events;
  o.blocked = [];
  const clock = ensureClock(draft, ctx.registries);
  if (clock === undefined) return events;
  const holder = leashBlockOf(draft, ctx.registries) ?? o.holderId;
  if (holder !== null && holder !== undefined) o.holderId = holder;
  const opened = openThread(draft, ctx.registries);
  if (opened) o.threadId = THREAD;
  events.push(...advanceClock(draft, ctx as EngineCtx, OVERSIGHT_CLOCK, 1, 'oversight'));
  if (opened) events.push(stage('opened'));
  const filled = clockById(draft, OVERSIGHT_CLOCK)!;
  if (filled.filled >= filled.segments) {
    // oversight acts on the one it was about, then the inquiry starts over (the thread rests until the next advance)
    if (o.holderId !== undefined) events.push(...oversightActs(draft, ctx, o.holderId));
    filled.filled = 0;
    delete filled.filledDay;
    const thread = draft.world.threads.find((t) => t.id === THREAD);
    if (thread !== undefined) thread.status = 'resolved';
    return events;
  }
  if (O.notices.includes(filled.filled) && NOTICE_TEXT[filled.filled] !== undefined) {
    events.push(stage('notice', { filled: filled.filled }));
    addFact(draft, { about: [], text: NOTICE_TEXT[filled.filled], tags: ['world', 'oversight_inquiry'], importance: 3, day: draft.day, knownBy: ['*'] });
  }
  return events;
}

/**
 * The commander asks oversight to move her out (`dynamic/request_transfer`): the means of a forced exit that needs no authorization. Filed once a day
 * for a holder at `play` or beyond; the exit reads it from the state (`meansDone`). Never draws.
 */
export function requestTransfer(draft: CampaignState, unitId: string): EngineEvent[] {
  const o = (draft.dynamic!.oversight ??= { blocked: [] });
  const requests = (o.requests ??= []);
  if (!requests.some((r) => r.unitId === unitId && r.day === draft.day)) requests.push({ unitId, day: draft.day });
  return [stage('transfer_requested', { unitId })];
}
