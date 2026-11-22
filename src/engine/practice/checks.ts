/**
 * Checking a task (P16, plan R2, R6): the engine judges what it can (a scene with her, a booking, her token, the roster, a DM, a scene with someone else, a rule), at the event
 * that decides it or at the deadline, and `settleTask` is the one place a verdict lands: the relation event (feeds hold through P15), track xp, favour, her reading and, for a
 * broken task, her offence. A holder who is not live is frozen: nothing of hers is judged and nothing swept. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addCompromat } from '../dynamic/compromat';
import { addSign } from '../dynamic/knowledge';
import { addFavour } from '../dynamic/hold';
import { dynamicOf } from '../dynamic/state';
import { addTrackXp } from '../dynamic/tracks';
import { hitHer } from '../personal/events';
import { wornTokens } from '../personal/tokens';
import type { CampaignState, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { practiceLive } from './gate';
import { noteOffence } from './offences';
import { practiceSample } from './sample';
import { practiceRoll, stakeRank, STAKES, type Stake, type Task } from './state';
import type { EventIntent } from '../relations/intents';
import { isLiving } from '../economy';

/** How a task is settled: by what the engine saw, by what the model read in a talk, by the commander's report, or by the commander's own confession (the routine). */
export type SettleVia = 'engine' | 'model' | 'report' | 'confess';

const ROSTER_CHECKS: readonly string[] = ['on_roster', 'not_on_roster'];
const SEVERITY: readonly Severity[] = ['minor', 'minor', 'moderate', 'major', 'extreme'];
const RECENT_MAX = TUNING.probes.recentMax;

const isOpenTask = (t: Task): boolean => t.kind === 'task' && t.status === 'open' && t.routine !== true;
const stepUp = (s: Stake): Stake => STAKES[Math.min(STAKES.length - 1, stakeRank(s) + 1)];

/** Her seed's gist, or the task's own words cut: what she will not ask for again too soon. */
function formOf(reg: Registries, task: Task): string {
  const seed = task.seedId === undefined ? undefined : (reg.practiceSeeds.get(task.seedId) as { gist?: unknown } | undefined);
  return typeof seed?.gist === 'string' ? seed.gist : task.summary.slice(0, 40);
}

/**
 * Settles one open task: `kept` lands `task_kept` (P15's feed gives hold), `addTrackXp` of her track by the tier, favour +1, a `yielded` sample into her reading; `broken` lands
 * `task_broken` (its row costs Trust and Affinity by the stakes), an offence of the stakes, favour unchanged and a `resisted` sample; `void` costs nothing (`task_void`). Her gist
 * joins her recent forms either way (at most 8). `falseReport`: a report that was false and has been found (stakes one step up, the offence is `false_report`, the event says so).
 * Nothing for a task that is not open, is not a task, or belongs to a holder who is not live.
 */
export function settleTask(
  draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, taskId: string, outcome: 'kept' | 'broken' | 'void', via: SettleVia, opts: { falseReport?: true } = {},
): EngineEvent[] {
  const reg = ctx.registries;
  const task = draft.practices?.tasks.find((t) => t.id === taskId);
  if (task === undefined || task.kind !== 'task' || task.status !== 'open' || !practiceLive(draft, reg, task.holderId)) return [];
  const holderId = task.holderId;
  delete task.sceneId;
  if (outcome === 'void') {
    task.status = 'void';
    return [{ type: 'task_void', taskId, holderId, what: 'task', reason: via }];
  }
  task.status = outcome;
  task.settledDay = draft.day;
  // a third party in the room sees what the commander was asked to do for her, or failed to (R6): a step behind, by her own stance
  const target = task.targetUnitId;
  const sees = target !== undefined && target !== holderId && draft.scene?.participants.includes(target) === true ? addSign(draft, ctx, target, holderId, 'step_behind') : [];
  const dyn = dynamicOf(draft, holderId);
  if (dyn !== undefined) {
    dyn.recent.push(formOf(reg, task));
    while (dyn.recent.length > RECENT_MAX) dyn.recent.shift();
  }
  if (outcome === 'kept') {
    const events: EngineEvent[] = [{ type: 'task_kept', taskId, unitId: holderId, holderId, via, stakes: task.stakes }];
    events.push(...hitHer(draft, reg, holderId, 'task_kept', SEVERITY[stakeRank(task.stakes)], 'kept her task'));
    events.push(...addTrackXp(draft, reg, holderId, task.track, TUNING.practice.xp.kept * task.tier));
    addFavour(draft, holderId, 1);
    events.push(...practiceSample(draft, reg, holderId, 'yielded'), ...sees);
    return events;
  }
  const stakes = opts.falseReport === true ? stepUp(task.stakes) : task.stakes;
  const events: EngineEvent[] = [{ type: 'task_broken', taskId, unitId: holderId, holderId, via, stakes, summary: task.summary, ...(opts.falseReport === true ? { falseReport: true } : {}) }];
  events.push(...hitHer(draft, reg, holderId, 'task_broken', SEVERITY[stakeRank(stakes) + (opts.falseReport === true && stakes === task.stakes ? 1 : 0)], 'broke her task'));
  events.push(...practiceSample(draft, reg, holderId, 'resisted'), ...sees);
  events.push(...noteOffence(draft, ctx, holderId, { kind: opts.falseReport === true ? 'false_report' : 'task_broken', ref: task.id, stakes, day: draft.day }));
  return events;
}

/** The unit a roster, scene or rule check is about: the check's own argument, else the task's target. */
const subjectOf = (t: Task): string | undefined => t.checkArg ?? t.targetUnitId;

/**
 * What the engine's own check says now, from the state alone: `kept` or `broken`, or `unknown` when only an event, the deadline or the model can say. A false report is read
 * against this (R6): a task whose own check says `broken` that the commander reported kept.
 */
export function verdictNow(state: CampaignState, task: Task): 'kept' | 'broken' | 'unknown' {
  const unit = subjectOf(task);
  switch (task.check) {
    case 'on_roster': return unit === undefined ? 'unknown' : state.roster.activeIds.includes(unit) ? 'kept' : 'broken';
    case 'not_on_roster': return unit === undefined ? 'unknown' : state.roster.activeIds.includes(unit) ? 'broken' : 'kept';
    case 'token_worn': return wornTokens(state).some((t) => t.giverId === task.holderId) ? 'kept' : 'broken';
    case 'no_scene_with': return 'kept';
    case 'rule_kept_until': return 'kept';
    default: return 'unknown';
  }
}

/** Can the slot a scene opens in count for a `slot_with_her` task (the deadline's slot when it names one, else any scene by the deadline day)? */
function sceneCounts(state: CampaignState, task: Task): boolean {
  const d = task.deadline;
  if (d === undefined) return true;
  if (d.slot !== undefined) return state.day === d.day && state.slot === d.slot;
  return state.day <= d.day;
}

/** The commander sent her a DM: for a `dm_report` task it is the report. */
function markReport(task: Task, day: number): void {
  if (task.report === undefined) task.report = { day };
}

/**
 * The after-action of the checks (registered by `actions/practice.ts`): what an event decides. A scene started with her marks a `slot_with_her` task (and it is kept when that
 * scene ends; an aborted one clears the mark); a scene with the unit a `no_scene_with` task names breaks it; a token taken off, a booking cancelled or lapsed (a booking lost to another
 * holder's is void), a `rule_broken` of the rule a task watches, break theirs; a booking played keeps its task; a DM to her is the report of a `dm_report` task; a finished run judges the
 * field tasks against its party. Nothing while no task is open.
 */
export function taskChecksFromEvents(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const p = draft.practices;
  if (p === undefined || p.tasks.length === 0) return [];
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  const live = (): Task[] => p.tasks.filter((t) => isOpenTask(t) && practiceLive(draft, reg, t.holderId));
  const settle = (t: Task, outcome: 'kept' | 'broken' | 'void'): void => { out.push(...settleTask(draft, ctx, t.id, outcome, 'engine')); };
  for (const e of events) {
    switch (e.type) {
      case 'scene_started': {
        const present = Array.isArray(e.participants) ? (e.participants as string[]) : [];
        for (const t of live()) {
          if (t.check === 'no_scene_with' && t.checkArg !== undefined && present.includes(t.checkArg)) settle(t, 'broken');
          else if (t.check === 'slot_with_her' && present.includes(t.holderId) && sceneCounts(draft, t)) t.sceneId = String(e.sceneId);
        }
        break;
      }
      case 'scene_ended':
        for (const t of live()) if (t.check === 'slot_with_her' && t.sceneId === e.sceneId) settle(t, 'kept');
        break;
      case 'scene_aborted':
        for (const t of p.tasks) if (t.sceneId === e.sceneId) delete t.sceneId;
        break;
      case 'token_taken_off':
        for (const t of live()) if (t.check === 'token_worn' && t.holderId === e.giverId) settle(t, 'broken');
        break;
      case 'booking_played':
        for (const t of live()) if (t.check === 'booking_kept' && (t.bookingId === undefined ? t.holderId === e.unitId : t.bookingId === e.bookingId)) settle(t, 'kept');
        break;
      case 'booking_cancelled':
      case 'booking_lapsed':
        for (const t of live()) if (t.check === 'booking_kept' && t.bookingId !== undefined && t.bookingId === e.bookingId) settle(t, e.lost === true ? 'void' : 'broken');
        break;
      case 'rule_broken':
        for (const t of live()) if (t.check === 'rule_kept_until' && t.checkArg === e.ruleId) settle(t, 'broken');
        break;
      case 'dm_sent':
        for (const t of live()) if (t.check === 'dm_report' && t.holderId === e.unitId) markReport(t, draft.day);
        break;
      case 'expedition_ended': {
        const last = draft.lastExpedition;
        const party = last !== undefined && last.id === e.reportId ? last.party : undefined;
        if (party === undefined) break;
        for (const t of live()) {
          if (t.field !== true || !ROSTER_CHECKS.includes(t.check)) continue;
          const unit = subjectOf(t);
          if (unit === undefined) settle(t, 'void');
          else settle(t, party.includes(unit) === (t.check === 'on_roster') ? 'kept' : 'broken');
        }
        break;
      }
      default:
    }
  }
  return out;
}

/** What is left to say about a task whose deadline has come and that no event settled: a roster, token, scene or rule check reads the state; a slot, a booking, a DM report or a model task that was never reported is broken (a report keeps it). */
function atDeadline(draft: CampaignState, task: Task): 'kept' | 'broken' | 'void' {
  const now = verdictNow(draft, task);
  if (now !== 'unknown') return now;
  if (task.check === 'on_roster' || task.check === 'not_on_roster') return 'void';
  if (task.check === 'dm_report' || task.check === 'model') return task.report !== undefined ? 'kept' : 'broken';
  return 'broken';
}

/**
 * The deadline part of the day step (R7.1), at the end of `draft.day`: an offered task whose deadline has passed unanswered is void; an open task whose deadline is today (or past)
 * is settled by what the engine saw (`atDeadline`); a `token_worn` task whose token is off at a day end is broken before its deadline. Only live holders' tasks; routines and tasks with
 * no deadline are not swept.
 */
export function deadlineSweep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const p = draft.practices;
  if (p === undefined) return [];
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const task of [...p.tasks]) {
    if (task.kind !== 'task' || task.routine === true || !practiceLive(draft, reg, task.holderId)) continue;
    if (task.status === 'offered') {
      if (task.deadline !== undefined && task.deadline.day < draft.day) {
        task.status = 'void';
        out.push({ type: 'task_void', taskId: task.id, holderId: task.holderId, what: 'task', reason: 'expired' });
      }
      continue;
    }
    if (task.status !== 'open') continue;
    // the token breaks it before its deadline only from the day after it was accepted (the evening it was accepted the token may not be on yet)
    if (task.check === 'token_worn' && draft.day > (task.answeredDay ?? task.day) && verdictNow(draft, task) === 'broken') { out.push(...settleTask(draft, ctx, task.id, 'broken', 'engine')); continue; }
    if (task.deadline === undefined || task.deadline.day > draft.day) continue;
    out.push(...settleTask(draft, ctx, task.id, atDeadline(draft, task), 'engine'));
  }
  return out;
}

/** Is this a kind of task the commander's own word can settle (a model check or a DM report), as opposed to one the engine sees? */
const bySay = (t: Task): boolean => t.check === 'model' || t.check === 'dm_report';

/** The people who would see a false report for what it is: whoever the task names (its subject and its audience) who is alive, named, at base and not her. */
function witnessesOf(state: CampaignState, task: Task): string[] {
  const named = [subjectOf(task), ...(task.audienceIds ?? [])].filter((id): id is string => id !== undefined && id !== task.holderId);
  const away = state.expedition?.party ?? [];
  return [...new Set(named)].filter((id) => state.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)) && !away.includes(id));
}

/** Her chance a day of finding a false report out: a witness at base (`witness`) plus what her own insight sees (`insight`), at most 1. Hidden: nothing shows it. */
export function falseReportChance(state: CampaignState, _reg: Registries, task: Task): number {
  const T = TUNING.practice.falseReport;
  const insight = state.squad.find((u) => u.id === task.holderId)?.insight ?? 'mid';
  return Math.min(1, (witnessesOf(state, task).length > 0 ? T.witness : 0) + T.insight[insight]);
}

/** Is the report recent enough to be found (made within `falseReport.days`)? */
const recentEnough = (state: CampaignState, task: Task): boolean => {
  const since = task.report?.day ?? task.settledDay ?? task.day;
  return state.day >= since && state.day - since <= TUNING.practice.falseReport.days;
};

/** Is a kept task of hers one the model may still say was not done (it was kept by the commander's word and it is recent)? */
export const keptByWordRecently = (state: CampaignState, task: Task): boolean => task.kind === 'task' && task.status === 'kept' && task.routine !== true && bySay(task) && task.settledDay !== undefined && state.day >= task.settledDay && state.day - task.settledDay <= TUNING.practice.falseReport.days;

/**
 * A false report is found: the kept task is broken after all, with the stakes one step up (the offence is `false_report`, the event says so), and she keeps something of it
 * (compromat, with whoever it concerned as witness). Her gains from the kept task stay (she was fooled). Nothing for a task that is not kept or a holder who is not live.
 */
export function findFalseReport(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, taskId: string, via: SettleVia): EngineEvent[] {
  const task = draft.practices?.tasks.find((t) => t.id === taskId);
  if (task === undefined || task.kind !== 'task' || task.status !== 'kept' || !practiceLive(draft, ctx.registries, task.holderId)) return [];
  task.status = 'open';
  const events = settleTask(draft, ctx, taskId, 'broken', via, { falseReport: true });
  if (events.length === 0) { task.status = 'kept'; return []; }
  task.report = { ...(task.report ?? { day: draft.day }), falseReport: true };
  addCompromat(draft, task.holderId, TUNING.practice.falseReport.compromat.replaceAll('{what}', task.summary), witnessesOf(draft, task)); // `addCompromat` reads the draft through `plainDraft` itself
  return events;
}

/**
 * The commander reports a task done (`practice/report`, for a task whose proof is a DM report or whose check is one). A DM-report or model task is only marked reported (the
 * model judges the talk; a report nobody faults is kept at its deadline). A task the engine can check is kept on the commander's word: if its own check says otherwise the report is
 * false, which is stored on the task (hidden; nothing shows it) and may be found out later. Throws for a task that is gone, not open, not a reported kind, or hers while she is not holding.
 */
export function reportTask(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, taskId: string): EngineEvent[] {
  const task = draft.practices?.tasks.find((t) => t.id === taskId);
  if (task === undefined || task.kind !== 'task') throw new Error('That task is gone.');
  if (!practiceLive(draft, ctx.registries, task.holderId)) throw new Error('She is not holding now.');
  if (task.status !== 'open') throw new Error('That task is not open.');
  if (task.proof !== 'dm_report' && task.check !== 'dm_report') throw new Error('That task is not reported.');
  task.report ??= { day: draft.day };
  const events: EngineEvent[] = [{ type: 'task_answered', taskId, holderId: task.holderId, answer: 'report' }];
  if (bySay(task)) return events;
  if (verdictNow(draft, task) === 'broken') task.report.falseReport = true;
  return [...events, ...settleTask(draft, ctx, taskId, 'kept', 'report')];
}

/**
 * What the model reported about a task (`task_kept`, `task_broken`, offered only for the commander's-word kinds): an open task is kept or broken by it (via `model`); a task kept
 * lately that the talk now shows was not done is a false report found (stakes up). Anything else does nothing.
 */
export function fromIntent(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, ev: Pick<EventIntent, 'type' | 'taskId'>): EngineEvent[] {
  const task = ev.taskId === undefined ? undefined : draft.practices?.tasks.find((t) => t.id === ev.taskId && t.holderId === unitId && t.kind === 'task');
  if (task === undefined) return [];
  if (task.status === 'open') return settleTask(draft, ctx, task.id, ev.type === 'task_kept' ? 'kept' : 'broken', 'model');
  if (ev.type === 'task_broken' && keptByWordRecently(draft, task)) return findFalseReport(draft, ctx, task.id, 'model');
  return [];
}

/** The day step's false-report part (R7.4): each task she was told was done that was not, within its days, is found out by the day's chance (a hashed roll, `practiceRoll(her, 'false:' + id)`). Only live holders'. */
export function falseReportSweep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const out: EngineEvent[] = [];
  for (const task of [...(draft.practices?.tasks ?? [])]) {
    if (task.kind !== 'task' || task.status !== 'kept' || task.report?.falseReport !== true || !recentEnough(draft, task) || !practiceLive(draft, ctx.registries, task.holderId)) continue;
    if (practiceRoll(draft, task.holderId, `false:${task.id}`) < falseReportChance(draft, ctx.registries, task)) out.push(...findFalseReport(draft, ctx, task.id, 'report'));
  }
  return out;
}
