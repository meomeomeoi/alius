/**
 * Tasks and the consent ladder (P16, plan R6): the writer of a task from a card, how the commander accepts one by what it weighs (a button, a button that shows its
 * cost, words, words and a signature, one button for a sealed envelope), the answers ACCEPT, REFUSE and TALK, the agreed version a talk may reach, and the record
 * a signature leaves. The relation rows of a refusal go through the P9 path (`refuseLikeDemand`); P15's feed turns them into hold. Nothing here draws.
 * The engine never reads a task's `text`: the model's words only reach `text` and `summary` (cut and plain), the rest is the engine's.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { slotIndex, SLOT_ORDER } from '../calendar';
import { refuseLikeDemand } from '../discipline/demands';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { dynamicOf } from '../dynamic/state';
import { hasCommanderPronoun } from '../dynamic/pronoun';
import { isLiving } from '../economy';
import { hitHer } from '../personal/events';
import type { EventIntent } from '../relations/intents';
import { evaluateAutomatic } from '../relations/graph';
import type { CampaignState, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { noteOffence } from './offences';
import { stakeRank, STAKES, type AcceptForm, type PracticeRequest, type Stake, type Task, type ValidOutput } from './state';
import { plainText } from './validate';

/** What a writer is given: the request that is closing, the card (validated, or built from a seed), and whether it is the plain fallback. */
export type Writer = (draft: CampaignState, ctx: EngineCtx, request: PracticeRequest, output: ValidOutput, plain: boolean) => EngineEvent[];

/** How the commander accepts a task by what it weighs (R6, the consent ladder): a sealed one is one button, a trivial one a button, a minor one a button that shows its cost, a major one words, a severe one words and a signature. */
export function acceptFormOf(stakes: Stake, sealed: boolean | undefined): AcceptForm {
  if (sealed === true) return 'sealed';
  return (['button', 'button_cost', 'words', 'signed'] as const)[stakeRank(stakes)];
}

const ROSTER_CHECKS: readonly string[] = ['on_roster', 'not_on_roster'];

/** The third party a task involves: the request's (a confession), the card's, or the unit a roster or scene check watches. */
const targetOf = (request: PracticeRequest, out: ValidOutput): string | undefined =>
  request.targetUnitId ?? out.targetUnitId ?? (ROSTER_CHECKS.includes(out.check) || out.check === 'no_scene_with' ? out.checkArg : undefined);

/** A task of hers, from a card (R5, R6). `field` only with the roster checks, a deadline from the card's days (kept even when no duration is shown), the chain from the request. */
export const writeTask: Writer = (draft, _ctx, request, out, plain) => {
  const p = ensurePractices(draft);
  const id = nextPracticeId(draft, 'pt');
  const chainId = request.chainOf;
  const step = chainId === undefined ? undefined : p.tasks.filter((t) => t.chainId === chainId).reduce((m, t) => Math.max(m, t.step ?? 1), 1) + 1;
  const task: Task = {
    id, holderId: request.holderId, kind: 'task', ...(out.seedId !== undefined ? { seedId: out.seedId } : {}), tags: [...out.tags], track: out.track, tier: out.tier,
    stakes: out.stakes, check: out.check, ...(out.checkArg !== undefined ? { checkArg: out.checkArg } : {}), proof: out.proof,
    ...(out.deadline !== undefined ? { deadline: { day: draft.day + out.deadline.days, ...(out.deadline.slot !== undefined ? { slot: out.deadline.slot } : {}) } } : {}),
    ...(request.noDuration === true ? { noDuration: true as const } : {}), ...(out.audienceIds !== undefined && out.audienceIds.length > 0 ? { audienceIds: [...out.audienceIds] } : {}),
    text: out.text, summary: out.summary, ...(plain ? { plain: true as const } : {}), ...(chainId !== undefined ? { chainId, step } : {}), status: 'offered',
    ...(targetOf(request, out) !== undefined ? { targetUnitId: targetOf(request, out) } : {}), ...(ROSTER_CHECKS.includes(out.check) ? { field: true as const } : {}),
    ...(request.sealed === true ? { sealed: true as const } : {}), acceptForm: acceptFormOf(out.stakes, request.sealed), day: draft.day, requestId: request.id,
  };
  p.tasks.push(task);
  return [{ type: 'task_issued', taskId: id, holderId: request.holderId, kind: 'task', requestId: request.id, ...(plain ? { plain: true } : {}), ...(request.sealed === true ? { sealed: true } : {}) }];
};

/** Which of the commander's slots it takes and which bookings of someone else's lapse for it, in bands (R6): a hold's span (from the slot now), or the slot a check names. */
export function taskCost(state: CampaignState, reg: Registries, task: Task): { slots: number; lapses: string[]; resources: Record<string, 'little' | 'some' | 'much'> } {
  const takesSlot = task.kind === 'hold' || task.check === 'slot_with_her' || task.check === 'booking_kept';
  const slots = task.slots ?? (takesSlot ? 1 : 0);
  const start = task.kind === 'hold' ? { day: state.day, slot: state.slot } : task.deadline?.slot !== undefined ? { day: task.deadline.day, slot: task.deadline.slot } : undefined;
  const lapses: string[] = [];
  if (slots > 0 && start !== undefined) {
    const first = slotIndex(start.day, start.slot);
    const span = new Set(Array.from({ length: slots }, (_, i) => first + i));
    for (const b of state.personal?.bookings ?? []) {
      if (b.status !== 'booked' || b.unitId === task.holderId || !span.has(slotIndex(b.day, b.slot)) || !SLOT_ORDER.includes(b.slot)) continue;
      const label = String(reg.bookingKinds.get(b.kindId)?.label ?? b.kindId);
      if (!lapses.includes(label)) lapses.push(label);
    }
  }
  return { slots, lapses, resources: {} };
}

const cap = (s: string): string => (s === '' ? s : s[0].toUpperCase() + s.slice(1));

/** The line a signed accept leaves on the record (R6): the summary, capitalised, and the day; a sealed one is signed blank. Read through `plainDraft` by whoever shows it. */
export function recordLine(task: Pick<Task, 'summary' | 'sealed' | 'answeredDay' | 'day'>): string {
  const day = task.answeredDay ?? task.day;
  if (task.sealed === true) return TUNING.practice.sealedRecord.replaceAll('{day}', String(day));
  return `${cap(task.summary.replace(/[.!?\s]+$/, ''))}. Day ${day}.`;
}

function taskOf(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, taskId: string): Task {
  const task = draft.practices?.tasks.find((t) => t.id === taskId);
  if (task === undefined || task.kind !== 'task') throw new Error('That task is gone.');
  if (!practiceLive(draft, ctx.registries, task.holderId)) throw new Error('She is not holding now.');
  if (task.status !== 'offered') throw new Error('That task has been answered.');
  return task;
}

/** The commander's next booking with her that a `booking_kept` task will judge (none: any booking of hers played counts). */
function attachBooking(draft: CampaignState, task: Task): void {
  if (task.check !== 'booking_kept' || task.bookingId !== undefined) return;
  const next = (draft.personal?.bookings ?? [])
    .filter((b) => b.unitId === task.holderId && b.status === 'booked' && slotIndex(b.day, b.slot) >= slotIndex(draft.day, draft.slot))
    .sort((a, b) => slotIndex(a.day, a.slot) - slotIndex(b.day, b.slot))[0];
  if (next !== undefined) task.bookingId = next.id;
}

/** The task becomes open: the commander said yes. A signed or sealed one leaves its line on the record (`practice_signed`); a sealed one is opened (its words come out). */
function openTask(draft: CampaignState, task: Task, via: 'button' | 'words' | 'signed'): EngineEvent[] {
  const events: EngineEvent[] = [];
  task.status = 'open';
  task.answeredDay = draft.day;
  delete task.said;
  attachBooking(draft, task);
  events.push({ type: 'task_answered', taskId: task.id, holderId: task.holderId, answer: 'accept', via });
  if (task.sealed === true) events.push({ type: 'practice_opened', taskId: task.id, holderId: task.holderId });
  if (task.acceptForm === 'signed' || task.sealed === true) {
    ensurePractices(draft).records.push({ day: draft.day, holderId: task.holderId, line: recordLine(task) });
    events.push({ type: 'practice_signed', taskId: task.id, unitId: task.holderId, holderId: task.holderId, summary: task.summary, ...(task.sealed === true ? { sealed: true } : {}) });
  }
  return events;
}

/** The severity of refusing it, by what it weighs: a major task is refused as a major thing, a severe one as an extreme one, a sealed envelope as a major one; the rest as the P9 default. */
function refusalSeverity(task: Pick<Task, 'sealed' | 'stakes'>): Severity | undefined {
  if (task.sealed === true) return 'major';
  return task.stakes === 'severe' ? 'extreme' : task.stakes === 'major' ? 'major' : undefined;
}

/**
 * The commander answers an offered task. ACCEPT opens a `button` / `button_cost` / `sealed` one; on `words` and `signed` it throws ("Say it in your own words."): only the
 * intent `practice_accepted` (and, for `signed`, `practice/sign` after it) opens it. REFUSE is the P9 path at its stakes (`refuseLikeDemand`, which P15's feed turns into hold)
 * and, at `role` or beyond, an offence. TALK changes nothing here: the scene is opened by the caller, and a `compromise_reached` settles it. Throws for a task that is gone, answered
 * or hers while she is not holding.
 */
export function answerTask(draft: CampaignState, ctx: EngineCtx, taskId: string, answer: 'accept' | 'refuse' | 'talk'): EngineEvent[] {
  const reg = ctx.registries;
  const task = taskOf(draft, ctx, taskId);
  if (answer === 'talk') return [{ type: 'task_answered', taskId, holderId: task.holderId, answer: 'talk' }];
  if (answer === 'accept') {
    if (task.acceptForm === 'words' || task.acceptForm === 'signed') throw new Error('Say it in your own words.');
    return openTask(draft, task, 'button');
  }
  if (answer !== 'refuse') throw new Error('Unknown answer.');
  task.status = 'refused';
  task.answeredDay = draft.day;
  const events: EngineEvent[] = [{ type: 'task_answered', taskId, holderId: task.holderId, answer: 'refuse' }];
  events.push(...refusePractice(draft, ctx, task.holderId, { ref: task.id, stakes: task.stakes, ...(task.sealed === true ? { sealed: true as const } : {}), summary: task.summary }));
  return events;
}

/**
 * What a refusal of a practice of hers does (the same for a task and a demonstration): the P9 path at its stakes (`refuseLikeDemand`, which P15's feed turns into hold), her automatic
 * relation state, and at `role` or beyond an offence of the stakes. A sealed one is refused at `major` and named only as a sealed task: the weight never hints at what was inside.
 */
export function refusePractice(draft: CampaignState, ctx: EngineCtx, holderId: string, what: { ref: string; stakes: Stake; sealed?: true; summary: string }): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === holderId);
  if (unit === undefined || !isLiving(unit)) return [];
  const severity = refusalSeverity(what);
  const evidence = what.sealed === true ? 'a sealed task was refused' : what.summary;
  const events: EngineEvent[] = [];
  events.push(...refuseLikeDemand(draft, ctx, holderId, { evidence, ...(severity !== undefined ? { severity } : {}) }));
  events.push(...evaluateAutomatic(draft, ctx.registries, holderId));
  const frame = dynamicOf(draft, holderId)?.frame;
  if (frame !== undefined && frameRank(frame) >= frameRank('role')) events.push(...noteOffence(draft, ctx, holderId, { kind: 'refusal', ref: what.ref, stakes: what.sealed === true ? 'major' : what.stakes, day: draft.day }));
  return events;
}

/**
 * The model reported that the commander said yes in words (`practice_accepted { taskId }`, offered only for a `words` or `signed` task of hers in the room). A `words` task opens; a `signed`
 * one is now only waiting for the signature (`said`). Anything else (a button task, a stale id, another woman's, an answered one) does nothing. The relation row is zero: the history
 * line is what the journal reads.
 */
export function acceptByWords(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, ev: Pick<EventIntent, 'taskId'>): EngineEvent[] {
  const task = ev.taskId === undefined ? undefined : draft.practices?.tasks.find((t) => t.id === ev.taskId && t.holderId === holderId && t.kind === 'task' && t.status === 'offered');
  if (task === undefined || (task.acceptForm !== 'words' && task.acceptForm !== 'signed') || !practiceLive(draft, ctx.registries, holderId)) return [];
  const events = hitHer(draft, ctx.registries, holderId, 'practice_accepted', 'minor', 'said yes to her task');
  if (task.acceptForm === 'signed') {
    task.said = true;
    events.push({ type: 'task_answered', taskId: task.id, holderId, answer: 'accept', via: 'words', pending: 'sign' });
    return events;
  }
  events.push(...openTask(draft, task, 'words'));
  return events;
}

/** The signature of a `signed` task whose words were said (`practice/sign`): it opens, and the line is on the record. Throws before the words, and for a task that is not `signed`. */
export function signTask(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, taskId: string): EngineEvent[] {
  const task = taskOf(draft, ctx, taskId);
  if (task.acceptForm !== 'signed') throw new Error('That task is not signed.');
  if (task.said !== true) throw new Error('Say it in your own words first.');
  return openTask(draft, task, 'signed');
}

/**
 * A talk reached an agreed version (`compromise_reached { taskId, text }`, offered only for an offered task of hers): the stakes fall by one, the words are the agreed ones (cut; a
 * text with a pronoun for the commander is not taken: the old words stay), the card is no longer sealed and the form follows the new stakes.
 */
export function compromiseTask(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, ev: Pick<EventIntent, 'taskId' | 'text'>): EngineEvent[] {
  const task = ev.taskId === undefined ? undefined : draft.practices?.tasks.find((t) => t.id === ev.taskId && t.holderId === holderId && t.kind === 'task' && t.status === 'offered');
  if (task === undefined || !practiceLive(draft, ctx.registries, holderId)) return [];
  const text = plainText(ev.text, TUNING.practice.textMax);
  if (text !== '' && !hasCommanderPronoun(text)) {
    task.text = text;
    task.summary = plainText(ev.text, TUNING.practice.summaryMax);
    delete task.plain;
  }
  task.stakes = STAKES[Math.max(0, stakeRank(task.stakes) - 1)];
  delete task.sealed;
  delete task.said;
  task.acceptForm = acceptFormOf(task.stakes, undefined);
  return [{ type: 'task_answered', taskId: task.id, holderId, answer: 'compromise', via: 'words' }];
}
