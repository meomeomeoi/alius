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
import { cardWhen } from '../scene/cards/when';
import { voiceLine, type VoiceKind, type VoiceRun } from '../scene/cards/voice';
import { gistOf } from '../scene/cards/gist';
import { herLook, scenePill, sceneCard, type SceneCondition } from '../scene/cards/sceneCard';

/** P10e-e: how a card is drawn: `scene` is the scene's own look (`sceneCard`, her voice); absent = the device's (today's DOM). */
export interface CardLook {
  look?: 'scene';
}

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
export function dueWords(task: Pick<Task, 'deadline'>, today: number): string | null {
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
export function renderTaskCard(host: HTMLElement, ctx: TaskCardCtx, opts: CardLook = {}): void {
  if (opts.look === 'scene') {
    renderSceneTaskCard(host, ctx);
    return;
  }
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
    const due = task.kind === 'hold' ? null : dueWords({ deadline: deadlineShown(task) ?? undefined }, state.day); // a hold's deadline is when the card goes stale, not when the hold is due
    if (due !== null) parts.push(h('p', { class: 'alius-task-due', ...analyzeAttrs('glossary:practice_task', live) }, `Due: ${due}.`));
    if (task.noDuration === true) parts.push(h('p', { class: 'alius-task-open-ended', ...analyzeAttrs('glossary:no_duration', live) }, 'She has not said how long.')); // no timer, no deadline: the engine keeps the end, the card shows none (R16)
    if (task.acceptForm === 'button_cost') {
      const hiddenHold = task.kind === 'hold' && task.noDuration === true;
      const cost = taskCost(state, reg, task);
      const lines = [
        ...(cost.slots > 0 ? [hiddenHold ? "Takes the commander's time until she decides." : `Takes ${slotsWord(cost.slots)} of the commander's time.`] : []), // a hold with no duration: its slots are its hidden end (R16)
        // a hold with no duration names nothing it would push out: what lapses would tell its length (author ruling: the length stays truly hidden)
        ...(hiddenHold ? ['Whatever is booked meanwhile may lapse.'] : cost.lapses.map((l) => `Would lapse: ${l}.`)),
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
  // what the commander offered of the commander's own accord (R17) is taken back with CANCEL, and there is nothing to talk over
  answers.push(button('refuse', task.handover !== undefined ? '[ CANCEL ]' : '[ REFUSE ]', () => ctx.onAnswer('refuse'), task.handover !== undefined ? 'glossary:handover' : 'glossary:practice_task'));
  if (!sealed && task.handover === undefined) answers.push(button('talk', '[ TALK ]', () => ctx.onAnswer('talk'), 'glossary:practice_task'));
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

/** The slots a task takes as her card says them (card-voice.md `{slots}`: `one slot` · `two slots` …, never a digit). */
const slotWords = (n: number): string => `${n === 1 ? 'one' : NUMBER_WORDS[n] ?? String(n)} slot${n === 1 ? '' : 's'}`;

/** "Bea", "Bea and Cat", "Bea, Cat and Dee" (cards.html `names`). */
export const joinNames = (a: string[]): string => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/**
 * P10e-e Task 7: the offered task in the scene's look (cards.html `bodyOf`, case `task` / `sealed`): her words, then her conditions in the fixed
 * order (when → what it costs → who will know → the proof → what a signed one hands over → say it → no length), each her own line with the
 * engine's value; the answers as pills (accept · refuse · talk it over; cancel for a handover; sign held). A sealed one is the envelope: her
 * sealed line, the weight unless she is cruel or vindictive, the track for an affectionate holder; never its text or summary.
 */
function renderSceneTaskCard(host: HTMLElement, ctx: TaskCardCtx): void {
  const { state, reg, task } = ctx;
  const unit = state.squad.find((u) => u.id === task.holderId);
  if (unit === undefined) return;
  const live = { unitId: unit.id };
  const sealed = task.sealed === true;
  const style = practiceOf(state, reg, unit.id)?.style.primary;
  const line = (kind: VoiceKind, vals: Record<string, string>): VoiceRun[] => voiceLine(reg, kind, style, task.id, vals);
  const conditions: SceneCondition[] = [];
  const cond = (kind: VoiceKind, vals: Record<string, string>, dry: string, analyze: string, attrs?: Record<string, string>): void => {
    conditions.push({ runs: line(kind, vals), dry, analyze, ctx: live, ...(attrs ? { attrs } : {}) });
  };
  const ladder = task.acceptForm === 'words' ? 'glossary:accept_words' : task.acceptForm === 'signed' ? 'glossary:accept_signed' : sealed ? 'glossary:sealed' : 'glossary:consent_ladder';
  const pill = (kind: TaskAnswer, text: string, onclick: () => void, address: string): HTMLElement => scenePill(text, onclick, { 'data-task-answer': kind, 'data-task': task.id, ...analyzeNative(address, live) });
  const when = task.kind === 'hold' ? null : cardWhen(deadlineShown(task) ?? undefined, state.day); // a hold's deadline is when the card goes stale, not when the hold is due
  let words: VoiceRun[] | string = plainDraft(task.text);
  if (sealed) {
    words = line('sealed', {});
    const label = String(reg.dynamicTracks.get(task.track)?.label ?? '');
    if (!SPARE_STYLES.includes(String(style))) cond('weight', { weight: WEIGHT_WORDS[task.stakes] }, `Weight: ${WEIGHT_WORDS[task.stakes]}.`, 'glossary:sealed');
    if (style === 'affectionate' && label !== '') cond('sealedTrack', { track: label.toLowerCase() }, `About: ${label}.`, 'glossary:sealed');
  } else {
    if (when !== null) cond('when', { when }, `Due: ${when}.`, 'glossary:practice_task');
    if (task.acceptForm === 'button_cost') {
      const hiddenHold = task.kind === 'hold' && task.noDuration === true;
      const cost = taskCost(state, reg, task);
      if (hiddenHold) { // a hold with no duration: its slots are its hidden end, and what lapses would tell its length (R16)
        cond('costHold', {}, "Takes the commander's time until she decides.", 'glossary:consent_ladder');
        cond('lapseHidden', {}, 'Whatever is booked meanwhile may lapse.', 'glossary:consent_ladder');
      } else {
        if (cost.slots > 0) cond('cost', { slots: slotWords(cost.slots) }, `Takes ${slotWords(cost.slots)} of the commander's time.`, 'glossary:consent_ladder');
        for (const l of cost.lapses) cond('lapse', { booking: l.toLowerCase() }, `Would lapse: ${l}.`, 'glossary:consent_ladder');
        if (cost.slots === 0 && cost.lapses.length === 0) cond('free', {}, 'Costs nothing.', 'glossary:consent_ladder');
      }
    }
    if (task.acceptForm === 'words' || task.acceptForm === 'signed') {
      const names = (task.audienceIds ?? []).map((id) => state.squad.find((u) => u.id === id)?.displayName ?? id);
      if (names.length > 0) cond('who', { who: joinNames(names) }, `Who will know: ${joinNames(names)}.`, 'glossary:consent_ladder');
      else cond('onlyMe', {}, 'Who will know: only her.', 'glossary:consent_ladder');
      if (task.proof === 'in_person' || task.proof === 'witness' || task.proof === 'dm_report') {
        const kind: VoiceKind = task.proof === 'dm_report' ? 'proof.report' : task.proof === 'witness' ? 'proof.witness' : 'proof.in_person';
        cond(kind, {}, `Proof: ${PROOF_WORDS[task.proof]}.`, 'glossary:consent_ladder');
      }
    }
    if (task.acceptForm === 'signed') {
      if (task.handover !== undefined) {
        const handed = HANDOVER_WORDS[task.handover] ?? task.handover;
        cond('hands', { handed }, `Hands over: ${handed}.`, 'glossary:accept_signed');
      } else {
        const summary = plainDraft(task.summary).replace(/[.\s]+$/, '');
        cond('closes', { summary }, `Closes: ${summary}.`, 'glossary:accept_signed');
      }
    }
    if (task.acceptForm === 'words' || (task.acceptForm === 'signed' && task.said !== true)) cond('sayIt', {}, 'Say it in your own words.', 'glossary:accept_words');
    if (task.noDuration === true) cond('noLength', {}, 'She has not said how long.', 'glossary:no_duration'); // no timer, no deadline: the engine keeps the end, the card shows none (R16)
  }

  const answers: HTMLElement[] = [];
  if (task.acceptForm === 'signed' && task.said === true) answers.push(renderSignature({ onSign: ctx.onSign, analyze: 'glossary:accept_signed', ctx: live, look: 'scene' }));
  else if (task.acceptForm === 'words' || task.acceptForm === 'signed') answers.push(pill('accept', 'accept', () => ctx.focusInput(), ladder));
  else answers.push(pill('accept', 'accept', () => ctx.onAnswer('accept'), ladder));
  // what the commander offered of the commander's own accord (R17) is taken back with cancel, and there is nothing to talk over
  answers.push(pill('refuse', task.handover !== undefined ? 'cancel' : 'refuse', () => ctx.onAnswer('refuse'), task.handover !== undefined ? 'glossary:handover' : 'glossary:practice_task'));
  if (!sealed && task.handover === undefined) answers.push(pill('talk', 'talk it over', () => ctx.onAnswer('talk'), 'glossary:practice_task'));
  const reroll = drawPracticeReroll(h('span', { class: 'alius-task-reroll' }), ctx.generation, task.kind, task.requestId);
  if (reroll !== null) answers.push(reroll);

  const buttonForm = task.acceptForm === 'button' || task.acceptForm === 'button_cost';
  const card = sceneCard({
    her: herLook(state, reg, unit.id), kind: sealed ? 'sealed' : 'task', words, conditions, answers, ...(sealed ? { seal: true as const } : {}),
    gist: gistOf({ kind: sealed ? 'sealed' : 'task', summary: plainDraft(task.summary).replace(/[.\s]+$/, ''), form: buttonForm ? 'button' : task.acceptForm, hold: task.kind === 'hold', when }) ?? '',
  });
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
export function drawTaskCards(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, handlers: TaskCardHandlers, opts: CardLook = {}): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const task of state.practices?.tasks ?? []) {
    if ((task.kind !== 'task' && task.kind !== 'hold') || task.status !== 'offered' || !pick({ unitId: task.holderId }) || !practiceLive(state, reg, task.holderId)) continue;
    renderTaskCard(host, { state, reg, task, onAnswer: (a) => handlers.answer(task.id, a), onSign: () => handlers.sign(task.id), focusInput: handlers.focusInput, generation: handlers.generation }, opts);
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
