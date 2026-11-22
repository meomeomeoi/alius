/**
 * The intent plumbing of the practices (P16, plan R19): what the mechanic model may report about them, built from the state each time and offered only while
 * its subject exists (an open task of hers in the room, an offered one answered in words, a negotiable punishment or alarm, a running ceremony, a denial rule
 * of hers, a service activity, a holder in the room), and the router for what it reported after `validateIntents` kept only what was offered. The model reports
 * closed-vocabulary events and ids; the engine decides every number. Nothing is offered with no live holder in the room, and the prompt is then byte-identical
 * to before the package. A type whose handler is not built yet is dropped by `applyPracticeIntent`. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import { COMMANDER } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { practiceOf } from '../dynamic/profile';
import { isLiving } from '../economy';
import type { EventIntent } from '../relations/intents';
import { PRACTICE_INTENT_TYPES } from '../relations/vocab';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { fromIntent, keptByWordRecently } from './checks';
import { practiceLive, practicesOn } from './gate';
import { acceptByWords, compromiseTask } from './tasks';

/** The model-reported types of the practices: their own rows are zero or are applied by their handlers, so `applyIntents` leaves them to `applyPracticeIntent`. */
export const PRACTICE_ROW_IS_CONDITIONAL: readonly string[] = PRACTICE_INTENT_TYPES;

/** One thing she asked, as the model is shown it: the id it may name, her, and what it is in a few words. */
export interface PracticeRow { id: string; unitId: string; summary: string }

/**
 * What the prompt carries for the practices. `tasks`: open tasks the talk can judge (`task_kept`, `task_broken`); `accepts`: offered tasks answered in words
 * (`practice_accepted`); `talks`: offered tasks, and `punishments` and `alarms` that a compromise may settle (`compromise_reached`); `ceremonies`: a running ceremony's
 * next step when it is said in words or a number (`ceremony_step`); `handovers`: what the commander gives in words (none until the handover is built); `denial`,
 * `service` and `threats`: the units (by id) for `denial_broken`, `service_rated` and `threat_voiced`.
 */
export interface PracticeOffer {
  types: string[];
  tasks: PracticeRow[];
  accepts: PracticeRow[];
  talks: PracticeRow[];
  punishments: PracticeRow[];
  alarms: PracticeRow[];
  ceremonies: Array<{ id: string; unitId: string; step: string; check: 'words' | 'number'; label: string }>;
  handovers: PracticeRow[];
  denial: string[];
  service: string[];
  threats: string[];
}

const SUMMARY_MAX = TUNING.practice.summaryMax;
const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX);
const ASKS_PERMISSION = 'permission';

/** A rule of hers that asks for permission (a denial): by the template's `asks` field, never by id. */
function hasPermissionRule(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (state.practices?.permission?.holderId === unitId) return true;
  return (state.bonds?.rules ?? []).some((r) => r.unitId === unitId && r.status === 'active' && (reg.relationshipRuleTemplates.get(r.templateId) as { asks?: unknown } | undefined)?.asks === ASKS_PERMISSION);
}

/** Is the commander doing one of the services she asked for right now (a `scope: dynamic` activity of the commander's in the open scene)? */
function serviceNow(state: CampaignState, reg: Registries): boolean {
  const activity = state.scene?.blocking?.[COMMANDER]?.activity;
  const entry = activity === undefined ? undefined : reg.blockingActivities.get(activity);
  return entry !== undefined && entry.actor === 'commander' && entry.scope === 'dynamic';
}

/**
 * The offer for the units in `participants` (named, living, live holders). `{}` while nobody holds, nobody who holds is among them or nothing is offered. A DM
 * has no scene: the service type is for scenes only, and the open tasks a report can settle are offered in both. Sealed tasks are never named, and the commander's
 * words about one that is not open yet are not read. Reads only; draws nothing.
 */
export function practiceIntentInput(state: CampaignState, reg: Registries, participants: readonly string[], channel: 'scene' | 'dm'): { practice?: PracticeOffer } {
  if (!practicesOn(state, reg)) return {};
  const present = participants.filter((id) => {
    const unit = state.squad.find((u) => u.id === id);
    return unit !== undefined && unit.kind === 'named' && isLiving(unit) && practiceLive(state, reg, id);
  });
  if (present.length === 0) return {};
  const p = state.practices;
  const row = (t: { id: string; holderId: string; summary: string }): PracticeRow => ({ id: t.id, unitId: t.holderId, summary: oneLine(t.summary) });
  const mine = (holderId: string): boolean => present.includes(holderId);
  // open tasks the commander's word settles, and ones kept by that word lately (the talk may show one was not done: a false report found)
  const tasks = (p?.tasks ?? []).filter((t) => mine(t.holderId) && t.kind === 'task' && ((t.status === 'open' && (t.check === 'model' || t.check === 'dm_report')) || keptByWordRecently(state, t)))
    .map((t) => (t.status === 'kept' ? { ...row(t), summary: `${row(t).summary} (reported done)` } : row(t)));
  const offered = (p?.tasks ?? []).filter((t) => mine(t.holderId) && t.kind === 'task' && t.status === 'offered' && t.sealed !== true);
  const accepts = offered.filter((t) => t.acceptForm === 'words' || t.acceptForm === 'signed').map(row);
  const talks = offered.map(row);
  const punishments = (p?.punishments ?? []).filter((x) => mine(x.holderId) && (x.status === 'offered' || x.status === 'negotiating') && x.sealed !== true).map(row);
  const alarms = p?.alarm !== undefined && mine(p.alarm.holderId) && p.alarm.answer === undefined ? [{ id: p.alarm.id, unitId: p.alarm.holderId, summary: '' }] : [];
  const ceremonies = (p?.punishments ?? []).flatMap((x) => {
    if (!mine(x.holderId) || x.status !== 'accepted' || x.ceremony === undefined) return [];
    const step = x.ceremony.steps.find((id) => !x.ceremony!.done.includes(id));
    const entry = step === undefined ? undefined : (reg.ceremonySteps.get(step) as { check?: string; label?: unknown } | undefined);
    const check: 'words' | 'number' | undefined = entry?.check === 'words' ? 'words' : entry?.check === 'number' ? 'number' : undefined;
    return step !== undefined && check !== undefined ? [{ id: x.id, unitId: x.holderId, step, check, label: oneLine(String(entry?.label ?? step)) }] : [];
  });
  const denial = present.filter((id) => hasPermissionRule(state, reg, id));
  const view = (id: string) => practiceOf(state, reg, id)?.categories[TUNING.offer.serviceCategory];
  const service = channel === 'scene' && serviceNow(state, reg) ? present.filter((id) => (view(id)?.as ?? 'none') !== 'none') : [];
  const threats = [...present];
  const types = [
    ...(tasks.length > 0 ? ['task_kept', 'task_broken'] : []), ...(accepts.length > 0 ? ['practice_accepted'] : []),
    ...(talks.length > 0 || punishments.length > 0 || alarms.length > 0 ? ['compromise_reached'] : []), ...(ceremonies.length > 0 ? ['ceremony_step'] : []),
    ...(denial.length > 0 ? ['denial_broken'] : []), ...(service.length > 0 ? ['service_rated'] : []), ...(threats.length > 0 ? ['threat_voiced'] : []),
  ];
  if (types.length === 0) return {};
  return { practice: { types, tasks, accepts, talks, punishments, alarms, ceremonies, handovers: [], denial, service, threats } };
}

/** What a built handler does with one validated report about one unit; it returns the engine events (it may also write the relation rows through the landing hooks). */
export type PracticeHandler = (draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, ev: EventIntent, batch: readonly EngineEvent[]) => EngineEvent[];

/**
 * The handlers of the reported types, keyed by `ev.type`. Each task of the package that builds one fills its entry (`settleTask` for `task_kept` / `task_broken`,
 * `acceptByWords` for `practice_accepted`, `rateService`, `denialBroken`, `voiceThreat`, `ceremonyStep`, and the compromise's own); a type with no entry yet is
 * dropped: the report passes validation and does nothing.
 */
export const PRACTICE_HANDLERS: Partial<Record<string, PracticeHandler>> = {
  task_kept: (draft, ctx, unitId, ev) => fromIntent(draft, ctx, unitId, ev),
  task_broken: (draft, ctx, unitId, ev) => fromIntent(draft, ctx, unitId, ev),
  practice_accepted: (draft, ctx, unitId, ev) => (ev.handoverId !== undefined ? [] : acceptByWords(draft, ctx, unitId, ev)), // a handover's words are built with the handover
  compromise_reached: (draft, ctx, unitId, ev) => (ev.taskId !== undefined ? compromiseTask(draft, ctx, unitId, ev) : []), // a punishment's and an alarm's own compromise are built with them
};

/** Routes one validated report to its handler. A type whose handler is not built yet changes nothing. */
export function applyPracticeIntent(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, ev: EventIntent, batch: readonly EngineEvent[] = []): EngineEvent[] {
  if (!practicesOn(draft, ctx.registries)) return [];
  return PRACTICE_HANDLERS[ev.type]?.(draft, ctx, unitId, ev, batch) ?? [];
}
