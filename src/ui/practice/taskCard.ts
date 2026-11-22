import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { practiceOf } from '../../engine/dynamic/profile';
import { dynamicOn } from '../../engine/dynamic/gate';
import { practiceLive } from '../../engine/practice/gate';
import type { Proof, Stake, Task } from '../../engine/practice/state';
import { taskCost } from '../../engine/practice/tasks';
import { deadlineShown } from '../../engine/practice/view';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';
import type { GenerationUi } from '../generation/surface';
import { drawPracticeChips, drawPracticeReroll } from './generation';
import { renderSignature } from './signature';

export type TaskAnswer = 'accept' | 'refuse' | 'talk';

export interface TaskCardCtx {
  state: CampaignState;
  reg: Registries;
  task: Task;
  onAnswer: (answer: TaskAnswer) => void;
  onSign: () => void;
  /** ACCEPT on a task that is accepted in words: focuses the scene input or the thread's (nothing is dispatched). */
  focusInput: () => void;
  /** P14: draws `[ REROLL ]` of her words while the task is offered. Absent = the card draws none. */
  generation?: GenerationUi;
}

/** What a sealed card says of its weight (the stakes as a band, never a number). */
const WEIGHT_WORDS: Readonly<Record<Stake, string>> = { trivial: 'slight', minor: 'light', major: 'heavy', severe: 'grave' };
/** What the proof of a task is, as words. */
const PROOF_WORDS: Readonly<Record<Proof, string>> = { none: '', dm_report: 'a report to her', in_person: 'in person', witness: 'before a witness' };
/** What a handover gives up, as words. */
const HANDOVER_WORDS: Readonly<Record<string, string>> = { device: 'the device', key: 'the key to the quarters', calendar: 'the calendar' };
/** Styles whose sealed envelope says nothing else. */
const SPARE_STYLES: readonly string[] = ['cruel', 'vindictive'];

const slotsWord = (n: number): string => `${n} slot${n === 1 ? '' : 's'}`;

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'] as const;
const SLOT_WORDS: Readonly<Record<string, string>> = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' };

/** When a task is due, in words (never a number): "today", "tomorrow evening", "in two days, in the morning". A deadline already past is "today": all that is left of it. */
function dueWords(task: Pick<Task, 'deadline'>, today: number): string | null {
  if (task.deadline === undefined) return null;
  const days = Math.max(0, task.deadline.day - today);
  const slot = task.deadline.slot === undefined ? undefined : SLOT_WORDS[task.deadline.slot];
  if (days <= 1) return `${days === 0 ? 'today' : 'tomorrow'}${slot !== undefined && days === 1 ? ` ${slot}` : ''}${slot !== undefined && days === 0 ? `, ${slot}` : ''}`;
  const count = days <= 7 ? NUMBER_WORDS[days] : 'several';
  return `in ${count} days${slot !== undefined ? `, in the ${slot}` : ''}`;
}

/** What a signed task closes or hands over: a handover says what is handed, any other says what the task is. */
function closesOf(task: Task): string {
  if (task.handover !== undefined) return `Hands over: ${HANDOVER_WORDS[task.handover] ?? task.handover}.`;
  return `Closes: ${plainDraft(task.summary).replace(/[.\s]+$/, '')}.`;
}

/**
 * The offered task as a card in her voice (P16, plan R6, R24): her words (a sealed one is an envelope: its text and summary are not in the card), what it costs in bands before
 * the buttons (a `minor` task), who will know (words and signature), what a signed one closes, and the answers. ACCEPT presses at once on a button task, only focuses the input on one
 * accepted in words, and a signed task shows `[ SIGN ]` (press and hold) only after the words were said. REFUSE and TALK (not on an envelope) answer as asked. It shows no number but the
 * slots a task takes and no pronoun for the commander. Every part is addressed by the glossary.
 */
export function renderTaskCard(host: HTMLElement, ctx: TaskCardCtx): void {
  const { state, reg, task } = ctx;
  const unit = state.squad.find((u) => u.id === task.holderId);
  if (unit === undefined) return;
  const live = { unitId: unit.id };
  const sealed = task.sealed === true;
  const style = practiceOf(state, reg, unit.id)?.style.primary;
  const ladder = task.acceptForm === 'words' ? 'glossary:accept_words' : task.acceptForm === 'signed' ? 'glossary:accept_signed' : sealed ? 'glossary:sealed' : 'glossary:consent_ladder';
  const button = (kind: TaskAnswer, text: string, onclick: () => void, address: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-task-answer': kind, 'data-task': task.id, ...analyzeNative(address, live), onclick,
  }, text);

  const parts: Child[] = [];
  if (sealed) {
    const label = String(reg.dynamicTracks.get(task.track)?.label ?? '');
    const weight = SPARE_STYLES.includes(String(style)) ? '' : ` Weight: ${WEIGHT_WORDS[task.stakes]}.`;
    const hint = style === 'affectionate' && label !== '' ? ` About: ${label}.` : '';
    parts.push(h('p', { class: 'alius-task-envelope' }, `${plainDraft(TUNING.practice.sealedLine)}${weight}${hint}`));
  } else {
    parts.push(h('p', { class: 'alius-task-text' }, plainDraft(task.text)));
    const due = dueWords({ deadline: deadlineShown(task) ?? undefined }, state.day);
    if (due !== null) parts.push(h('p', { class: 'alius-task-due', ...analyzeAttrs('glossary:practice_task', live) }, `Due: ${due}.`));
    if (task.noDuration === true) parts.push(h('p', { class: 'alius-task-open-ended', ...analyzeAttrs('glossary:no_duration', live) }, 'She has not said how long.')); // no timer, no deadline: the engine keeps the end, the card shows none (R16)
    if (task.acceptForm === 'button_cost') {
      const cost = taskCost(state, reg, task);
      const lines = [
        ...(cost.slots > 0 ? [`Takes ${slotsWord(cost.slots)} of the commander's time.`] : []),
        ...cost.lapses.map((l) => `Would lapse: ${l}.`),
        ...Object.entries(cost.resources).map(([resource, band]) => `Uses ${band} ${resource}.`),
      ];
      parts.push(h('ul', { class: 'alius-task-cost', 'aria-label': 'What it costs', ...analyzeAttrs('glossary:consent_ladder', live) }, ...(lines.length === 0 ? ['Costs nothing.'] : lines).map((l) => h('li', {}, l))));
    }
    if (task.acceptForm === 'words' || task.acceptForm === 'signed') {
      const names = (task.audienceIds ?? []).map((id) => state.squad.find((u) => u.id === id)?.displayName ?? id);
      const proof = PROOF_WORDS[task.proof];
      parts.push(h('p', { class: 'alius-task-know', ...analyzeAttrs('glossary:consent_ladder', live) }, `Who will know: ${names.length > 0 ? names.join(', ') : 'only her'}${proof !== '' ? `; ${proof}` : ''}.`));
    }
    if (task.acceptForm === 'signed') parts.push(h('p', { class: 'alius-task-closes', ...analyzeAttrs('glossary:accept_signed', live) }, closesOf(task)));
    if (task.acceptForm === 'words' || (task.acceptForm === 'signed' && task.said !== true)) parts.push(h('p', { class: 'alius-task-hint' }, 'Say it in your own words.'));
  }

  const answers: Child[] = [];
  if (task.acceptForm === 'signed' && task.said === true) answers.push(renderSignature({ onSign: ctx.onSign, analyze: 'glossary:accept_signed', ctx: live }));
  else if (task.acceptForm === 'words' || task.acceptForm === 'signed') answers.push(button('accept', '[ ACCEPT ]', () => ctx.focusInput(), ladder));
  else answers.push(button('accept', '[ ACCEPT ]', () => ctx.onAnswer('accept'), ladder));
  answers.push(button('refuse', '[ REFUSE ]', () => ctx.onAnswer('refuse'), 'glossary:practice_task'));
  if (!sealed) answers.push(button('talk', '[ TALK ]', () => ctx.onAnswer('talk'), 'glossary:practice_task'));
  parts.push(h('div', { class: 'alius-task-answers' }, ...answers, drawPracticeReroll(h('span', { class: 'alius-task-reroll' }), ctx.generation, task.kind, task.requestId)));

  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body: h('div', { class: 'alius-task-body' }, ...parts), accent: unitAccent(unit.id) });
  card.classList.add('alius-task');
  card.setAttribute('data-task', task.id);
  card.setAttribute('data-task-form', task.acceptForm);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} asks something of the commander`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:task_card', live))) card.setAttribute(k, v);
  host.append(card);
}

/** Handlers of the cards a surface draws: the task's id comes with each answer. */
export interface TaskCardHandlers {
  answer: (taskId: string, answer: TaskAnswer) => void;
  sign: (taskId: string) => void;
  focusInput: () => void;
  /** P14: the surface's generation ui: the cards draw REROLL, and the practices whose words failed draw their chips (here, once). */
  generation?: GenerationUi;
}

/** Draws the offered tasks of the units `pick` chooses (a scene's participants, one thread), replacing what `host` held. Nothing for a holder who is not live. */
export function drawTaskCards(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, handlers: TaskCardHandlers): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const task of state.practices?.tasks ?? []) {
    if ((task.kind !== 'task' && task.kind !== 'hold') || task.status !== 'offered' || !pick({ unitId: task.holderId }) || !practiceLive(state, reg, task.holderId)) continue;
    renderTaskCard(host, { state, reg, task, onAnswer: (a) => handlers.answer(task.id, a), onSign: () => handlers.sign(task.id), focusInput: handlers.focusInput, generation: handlers.generation });
  }
  drawPracticeChips(host, handlers.generation, state, reg, pick);
}

/** How many of the record's lines the CMDR card shows. */
const RECORD_LINES = 5;

/**
 * What the commander has signed, as the CMDR card shows it (R6): the newest five lines of the record, each with her name. `null` while there is none. A sealed line is signed blank.
 * The text goes through `plainDraft`.
 */
export function renderRecordLines(state: CampaignState, reg: Registries): HTMLElement | null {
  const records = state.practices?.records ?? [];
  if (records.length === 0 || !dynamicOn(state, reg)) return null;
  const lines = records.slice(-RECORD_LINES).reverse();
  return h('div', { class: 'alius-practice-records', 'data-practice-records': '' },
    ...lines.map((r) => h('p', { 'data-practice-record': r.holderId, ...analyzeAttrs('glossary:practice_record', { unitId: r.holderId }) }, `${state.squad.find((u) => u.id === r.holderId)?.displayName ?? r.holderId}: ${plainDraft(r.line)}`)));
}
