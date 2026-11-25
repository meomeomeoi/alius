import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import { practiceLive } from '../../engine/practice/gate';
import { canUndoPractice } from '../../engine/practice/punish';
import { nextCeremonyStep } from '../../engine/practice/punish';
import { severityWord, type OpenPunishment } from '../../engine/practice/state';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';
import type { GenerationUi } from '../generation/surface';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';
import { drawPracticeReroll } from './generation';
import { practiceOf } from '../../engine/dynamic/profile';
import { voiceLine, type VoiceKind } from '../scene/cards/voice';
import { gistOf } from '../scene/cards/gist';
import { conditionEls, herLook, pillWord, scenePill, sceneCard, type SceneCondition } from '../scene/cards/sceneCard';
import type { CardLook } from './taskCard';

export type PunishmentAnswer = 'accept' | 'negotiate' | 'refuse';
export type TakeInsteadAnswer = 'do_it' | 'take_it' | 'refuse';

export interface PunishmentCardCtx {
  state: CampaignState;
  reg: Registries;
  punishment: OpenPunishment;
  onAnswer: (answer: PunishmentAnswer) => void;
  /** P14: draws `[ REROLL ]` of her words while the punishment is offered. Absent = the card draws none. */
  generation?: GenerationUi;
}

export interface TakeInsteadCardCtx {
  state: CampaignState;
  reg: Registries;
  punishment: OpenPunishment;
  onAnswer: (answer: TakeInsteadAnswer) => void;
}

/** What the card says of a punishment's weight: a word, never the number (R8). */
const WEIGHT_WORDS = { light: 'light', heavy: 'heavy', harsh: 'harsh' } as const;

const labelOf = (reg: Registries, p: Pick<OpenPunishment, 'entryId'>): string => String(reg.holderPunishments.get(p.entryId)?.label ?? reg.punishments.get(p.entryId)?.label ?? '');
const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/**
 * Her discipline as a card in her voice (P16, plan R8, R24): her words (a sealed one is the envelope), what it is called and how heavy it is as a word (never a number), and the
 * answers: ACCEPT, NEGOTIATE and REFUSE. Every part is addressed by the glossary; the text goes through `plainDraft`; no pronoun for the commander.
 */
export function renderPunishmentCard(host: HTMLElement, ctx: PunishmentCardCtx, opts: CardLook = {}): void {
  const { state, reg, punishment: p } = ctx;
  const unit = state.squad.find((u) => u.id === p.holderId);
  if (unit === undefined) return;
  const live = { unitId: unit.id };
  if (opts.look === 'scene') {
    // P10e-e Task 7 (cards.html `bodyOf`, case `punishment`): her words, then `{Label}.` and the weight as her lines; talked over and no length after them
    const style = styleOf(state, reg, unit.id);
    const conditions: SceneCondition[] = [];
    const cond = (kind: VoiceKind, vals: Record<string, string>, dry: string, analyze: string): void => { conditions.push({ runs: voiceLine(reg, kind, style, p.id, vals), dry, analyze, ctx: live }); };
    const label = labelOf(reg, p);
    const weight = WEIGHT_WORDS[severityWord(p.severity)];
    if (p.sealed !== true) {
      cond('punishLabel', { label }, `${label}.`, 'glossary:holder_punishment');
      cond('weight', { weight }, `Weight: ${weight}.`, 'glossary:holder_punishment');
    }
    if (p.status === 'negotiating') cond('talked', {}, 'It is being talked over.', 'glossary:punishment_card');
    if (p.hiddenCount === true && p.sealed !== true) cond('noLength', {}, 'She has not said how long.', 'glossary:no_duration'); // no count, no end shown (R16)
    const pill = (kind: PunishmentAnswer, text: string): HTMLElement => scenePill(text, () => ctx.onAnswer(kind), { 'data-punishment-answer': kind, 'data-punishment': p.id, ...analyzeNative('glossary:punishment_card', live) });
    const reroll = p.status === 'offered' ? drawPracticeReroll(h('span', { class: 'alius-punishment-reroll' }), ctx.generation, 'punishment', p.requestId) : null;
    const card = sceneCard({
      her: herLook(state, reg, unit.id), kind: p.sealed === true ? 'sealed' : 'punishment', conditions, ...(p.sealed === true ? { seal: true as const } : {}),
      words: p.sealed === true ? voiceLine(reg, 'sealed', style, p.id, {}) : plainDraft(p.text),
      answers: [pill('accept', 'accept'), pill('negotiate', 'negotiate'), pill('refuse', 'refuse'), ...(reroll !== null ? [reroll] : [])],
      gist: (p.sealed === true ? gistOf({ kind: 'sealed' }) : gistOf({ kind: 'punishment', label, weight })) ?? '',
    });
    finish(card, ['alius-punishment'], p.id, `${unit.displayName} punishes the commander`, 'glossary:holder_punishment', live);
    host.append(card);
    return;
  }
  const button = (kind: PunishmentAnswer, text: string, address: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-punishment-answer': kind, 'data-punishment': p.id, ...analyzeNative(address, live), onclick: () => ctx.onAnswer(kind),
  }, text);
  const label = labelOf(reg, p);
  const parts: Child[] = [
    h('p', { class: 'alius-punishment-text' }, plainDraft(p.sealed === true ? TUNING.practice.sealedLine : p.text)),
    ...(p.sealed === true ? [] : [h('p', { class: 'alius-punishment-weight', ...analyzeAttrs('glossary:holder_punishment', live) }, `${label}. Weight: ${WEIGHT_WORDS[severityWord(p.severity)]}.`)]),
    ...(p.status === 'negotiating' ? [h('p', { class: 'alius-punishment-hint' }, 'It is being talked over.')] : []),
    ...(p.hiddenCount === true && p.sealed !== true ? [h('p', { class: 'alius-punishment-open-ended', ...analyzeAttrs('glossary:no_duration', live) }, 'She has not said how long.')] : []), // no count, no end shown (R16)
    h('div', { class: 'alius-punishment-answers' }, button('accept', '[ ACCEPT ]', 'glossary:punishment_card'), button('negotiate', '[ NEGOTIATE ]', 'glossary:punishment_card'), button('refuse', '[ REFUSE ]', 'glossary:punishment_card'),
      p.status === 'offered' ? drawPracticeReroll(h('span', { class: 'alius-punishment-reroll' }), ctx.generation, 'punishment', p.requestId) : null),
  ];
  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body: h('div', { class: 'alius-punishment-body' }, ...parts), accent: unitAccent(unit.id) });
  card.classList.add('alius-punishment');
  card.setAttribute('data-punishment', p.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} punishes the commander`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:holder_punishment', live))) card.setAttribute(k, v);
  host.append(card);
}

/**
 * Her order to punish a soldier, as a card (P16, plan R8, TAKE IT INSTEAD): it names the soldier and what she wants done, and the answers: DO IT (the discipline of P9 on the soldier),
 * TAKE IT INSTEAD (the soldier is spared and the commander takes a punishment of the same weight) and REFUSE (a refusal of her order).
 */
export function renderTakeInsteadCard(host: HTMLElement, ctx: TakeInsteadCardCtx, opts: CardLook = {}): void {
  const { state, reg, punishment: p } = ctx;
  const unit = state.squad.find((u) => u.id === p.holderId);
  const soldier = p.forUnitId === undefined ? undefined : state.squad.find((u) => u.id === p.forUnitId);
  if (unit === undefined || soldier === undefined) return;
  const live = { unitId: unit.id };
  if (opts.look === 'scene') {
    // P10e-e Task 7 (cards.html `bodyOf`, case `order`): her words, then `{Soldier}: {label}.` as her line
    const label = labelOf(reg, p);
    const conditions: SceneCondition[] = [{
      runs: voiceLine(reg, 'order', styleOf(state, reg, unit.id), p.id, { soldier: soldier.displayName, label: label.toLowerCase() }), dry: `For ${soldier.displayName}: ${label}.`,
      analyze: 'glossary:take_it_instead', ctx: live, attrs: { 'data-for-unit': soldier.id },
    }];
    const pill = (kind: TakeInsteadAnswer, text: string): HTMLElement => scenePill(text, () => ctx.onAnswer(kind), { 'data-take-answer': kind, 'data-punishment': p.id, ...analyzeNative('glossary:take_it_instead', live) });
    const card = sceneCard({
      her: herLook(state, reg, unit.id), kind: 'order', words: plainDraft(p.text), conditions,
      answers: [pill('do_it', 'do it'), pill('take_it', 'take it instead'), pill('refuse', 'refuse')],
      gist: gistOf({ kind: 'order', soldier: soldier.displayName, label }) ?? '',
    });
    finish(card, ['alius-punishment', 'alius-take-instead'], p.id, `${unit.displayName} wants ${soldier.displayName} punished`, 'glossary:take_it_instead', live);
    host.append(card);
    return;
  }
  const button = (kind: TakeInsteadAnswer, text: string, address: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-take-answer': kind, 'data-punishment': p.id, ...analyzeNative(address, live), onclick: () => ctx.onAnswer(kind),
  }, text);
  const parts: Child[] = [
    h('p', { class: 'alius-punishment-text' }, plainDraft(p.text)),
    h('p', { class: 'alius-punishment-weight', 'data-for-unit': soldier.id, ...analyzeAttrs('glossary:take_it_instead', live) }, `For ${soldier.displayName}: ${labelOf(reg, p)}.`),
    h('div', { class: 'alius-punishment-answers' }, button('do_it', '[ DO IT ]', 'glossary:take_it_instead'), button('take_it', '[ TAKE IT INSTEAD ]', 'glossary:take_it_instead'), button('refuse', '[ REFUSE ]', 'glossary:take_it_instead')),
  ];
  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body: h('div', { class: 'alius-punishment-body' }, ...parts), accent: unitAccent(unit.id) });
  card.classList.add('alius-punishment', 'alius-take-instead');
  card.setAttribute('data-punishment', p.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} wants ${soldier.displayName} punished`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:take_it_instead', live))) card.setAttribute(k, v);
  host.append(card);
}

export interface CeremonyCardCtx {
  state: CampaignState;
  reg: Registries;
  punishment: OpenPunishment;
  /** A chip step, or the number of the number step (a whole number from 1 to 50). */
  onStep: (step: string, number?: number) => void;
}

/** The marks of a step in the list (no digit): done, the next one, the ones to come. */
const STEP_MARK = { done: '✓', next: '›', later: '·' } as const;

/**
 * Her ceremony as a card (P16, plan R21, spec §R.4): the steps in order with their labels, the ones done, the next one marked and what it asks: a chip step is a button, a words step says to say it in the
 * commander's own words (the intent does it), a number step has a field for 1 to 50 and a button, a posture step names the posture to take (the commander's posture does it). The count she keeps is never shown,
 * and no number but the one typed in the field. Every part is addressed by the glossary; no pronoun for the commander.
 */
export function renderCeremonyCard(host: HTMLElement, ctx: CeremonyCardCtx, opts: CardLook = {}): void {
  const { state, reg, punishment: p } = ctx;
  const unit = state.squad.find((u) => u.id === p.holderId);
  const ceremony = p.ceremony;
  if (unit === undefined || ceremony === undefined) return;
  const live = { unitId: unit.id };
  const next = nextCeremonyStep(p);
  const entryOf = (id: string): { label: string; check: string; posture?: string } => {
    const e = reg.ceremonySteps.get(id) as { label?: unknown; check?: unknown; posture?: unknown } | undefined;
    return { label: String(e?.label ?? id), check: String(e?.check ?? 'chip'), ...(typeof e?.posture === 'string' ? { posture: e.posture } : {}) };
  };
  if (opts.look === 'scene') {
    renderSceneCeremony(host, ctx, unit.displayName, live, next, entryOf);
    return;
  }
  const rows = ceremony.steps.map((id) => {
    const e = entryOf(id);
    const mode = ceremony.done.includes(id) ? 'done' : id === next ? 'next' : 'later';
    const extra: Child[] = [];
    if (mode === 'next') {
      if (e.check === 'chip') {
        extra.push(h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-ceremony-do': id, 'data-punishment': p.id, ...analyzeNative('glossary:ceremony', live), onclick: () => ctx.onStep(id, undefined) }, `[ ${e.label.toUpperCase()} ]`));
      } else if (e.check === 'words') {
        extra.push(h('p', { class: 'alius-ceremony-hint' }, 'Say it in your own words.'));
      } else if (e.check === 'number') {
        const input = h('input', { type: 'number', min: '1', max: '50', step: '1', 'data-ceremony-number': id, 'aria-label': 'The number', ...analyzeNative('glossary:ceremony', live) }) as HTMLInputElement;
        extra.push(input, h('button', {
          type: 'button', class: 'alius-btn alius-tagchip', 'data-ceremony-do': id, 'data-punishment': p.id, ...analyzeNative('glossary:ceremony', live),
          onclick: () => {
            const n = Number(input.value);
            if (input.value.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 50) ctx.onStep(id, n);
          },
        }, '[ NAME IT ]'));
      } else if (e.check === 'posture') {
        const posture = e.posture === undefined ? '' : String(reg.blockingPostures.get(e.posture)?.label ?? e.posture).toLowerCase();
        extra.push(h('p', { class: 'alius-ceremony-hint' }, `Take the posture${posture !== '' ? `: ${posture}` : ''}.`));
      }
    }
    return h('li', { class: 'alius-ceremony-step', 'data-ceremony-step': id, 'data-ceremony-state': mode },
      h('span', { class: 'alius-ceremony-mark', 'aria-hidden': 'true' }, STEP_MARK[mode]), h('span', { class: 'alius-ceremony-label' }, e.label), ...extra);
  });
  const card = renderVoiceCard({
    voice: VOICE_OF.practice, from: unit.displayName, accent: unitAccent(unit.id),
    body: h('div', { class: 'alius-ceremony-body' }, h('p', { class: 'alius-ceremony-title' }, `${labelOf(reg, p)}: a ceremony.`), h('ol', { class: 'alius-ceremony-steps' }, ...rows)),
  });
  card.classList.add('alius-ceremony');
  card.setAttribute('data-punishment', p.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} carries out her punishment as a ceremony`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:ceremony', live))) card.setAttribute(k, v);
  host.append(card);
}

/** Her style for her lines (`practiceOf`; none = the neutral lines). */
const styleOf = (state: CampaignState, reg: Registries, unitId: string): string | undefined => practiceOf(state, reg, unitId)?.style.primary;

/** The hooks every card of her discipline carries, the same in both looks. */
function finish(card: HTMLElement, classes: string[], punishmentId: string, label: string, analyze: string, live: Record<string, unknown>): void {
  card.classList.add(...classes);
  card.setAttribute('data-punishment', punishmentId);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', label);
  for (const [k, v] of Object.entries(analyzeAttrs(analyze, live))) card.setAttribute(k, v);
}

/**
 * P10e-e Task 7: her ceremony in the scene's look (cards.html `bodyOf`, case `ceremony`): her title line, the steps as a list in her hand (✓ done, › next,
 * · later), then the next step's own control: a chip step is a pill of its label in lower case, a words step and a number step say so in her line (the
 * number step with its field and `name it`), a posture step names the posture (the commander's posture does it). The count she keeps is never shown.
 */
function renderSceneCeremony(
  host: HTMLElement, ctx: CeremonyCardCtx, name: string, live: { unitId: string }, next: string | undefined,
  entryOf: (id: string) => { label: string; check: string; posture?: string },
): void {
  const { state, reg, punishment: p } = ctx;
  const ceremony = p.ceremony!;
  const style = styleOf(state, reg, p.holderId);
  const label = labelOf(reg, p);
  const steps = ceremony.steps.map((id) => {
    const e = entryOf(id);
    const mode = ceremony.done.includes(id) ? 'done' : id === next ? 'next' : 'later';
    return h('li', { class: mode === 'later' ? '' : mode, 'data-ceremony-step': id, 'data-ceremony-state': mode },
      h('span', { class: 'alius-scard-m', 'aria-hidden': 'true' }, STEP_MARK[mode]), h('span', { class: 'alius-ceremony-label' }, e.label));
  });
  const extra: Node[] = [h('ol', { class: 'alius-scard-steps' }, ...steps)];
  const answers: HTMLElement[] = [];
  if (next !== undefined) {
    const e = entryOf(next);
    const lines = (kind: VoiceKind, vals: Record<string, string>, dry: string): HTMLElement[] => conditionEls({ runs: voiceLine(reg, kind, style, p.id, vals), dry, analyze: 'glossary:ceremony', ctx: live });
    if (e.check === 'chip') {
      answers.push(scenePill(pillWord(e.label), () => ctx.onStep(next, undefined), { 'data-ceremony-do': next, 'data-punishment': p.id, ...analyzeNative('glossary:ceremony', live) }));
    } else if (e.check === 'words') {
      extra.push(...lines('cerWords', {}, 'Say it in your own words.'));
    } else if (e.check === 'number') {
      extra.push(...lines('cerNumber', {}, 'A number from 1 to 50.'));
      const input = h('input', { type: 'number', min: '1', max: '50', step: '1', class: 'alius-scard-num', 'data-ceremony-number': next, 'aria-label': 'The number', ...analyzeNative('glossary:ceremony', live) }) as HTMLInputElement;
      input.addEventListener('click', (ev) => ev.stopPropagation());
      answers.push(input, scenePill('name it', () => {
        const n = Number(input.value);
        if (input.value.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 50) ctx.onStep(next, n);
      }, { 'data-ceremony-do': next, 'data-punishment': p.id, ...analyzeNative('glossary:ceremony', live) }));
    } else if (e.check === 'posture') {
      const posture = e.posture === undefined ? '' : String(reg.blockingPostures.get(e.posture)?.label ?? e.posture).toLowerCase();
      extra.push(...lines('cerPosture', { posture }, `Take the posture${posture !== '' ? `: ${posture}` : ''}.`));
    }
  }
  const stepLabels = ceremony.steps.map((id) => [id, entryOf(id).label] as [string, string]);
  const card = sceneCard({
    her: herLook(state, reg, p.holderId), kind: 'ceremony', words: voiceLine(reg, 'cerTitle', style, p.id, { label }), conditions: [], extra, answers,
    gist: gistOf({ kind: 'ceremony', label, steps: stepLabels, done: next === undefined ? stepLabels.length : ceremony.steps.indexOf(next) }) ?? '',
  });
  finish(card, ['alius-ceremony'], p.id, `${name} carries out her punishment as a ceremony`, 'glossary:ceremony', live);
  host.append(card);
}

/** Handlers of the cards a surface draws: the punishment's id comes with each answer. */
export interface PunishmentCardHandlers {
  answer: (punishmentId: string, answer: PunishmentAnswer) => void;
  takeInstead: (punishmentId: string, answer: TakeInsteadAnswer) => void;
  undo: (punishmentId: string) => void;
  /** A step of her ceremony: a chip step, or the number of a number step. Absent = the ceremony card draws no buttons. */
  ceremony?: (punishmentId: string, step: string, number?: number) => void;
  /** P14: the surface's generation ui: the card draws REROLL. */
  generation?: GenerationUi;
}

/**
 * Draws her discipline of the units `pick` chooses (a scene's participants, one thread), replacing what `host` held: the punishments waiting for an answer, her orders about a soldier,
 * and, beside each answered one the engine would still take back, `[ UNDO — not what I meant ]` (as P9's). Nothing for a holder who is not live. Immersive mode keeps all of it (it
 * hides numbers, not what she asks).
 */
export function drawPunishmentCards(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, handlers: PunishmentCardHandlers, opts: CardLook = {}): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const p of state.practices?.punishments ?? []) {
    if (!pick({ unitId: p.holderId }) || !practiceLive(state, reg, p.holderId)) continue;
    const open = p.status === 'offered' || p.status === 'negotiating';
    if (open && p.forUnitId !== undefined) renderTakeInsteadCard(host, { state, reg, punishment: p, onAnswer: (a) => handlers.takeInstead(p.id, a) }, opts);
    else if (open) renderPunishmentCard(host, { state, reg, punishment: p, onAnswer: (a) => handlers.answer(p.id, a), generation: handlers.generation }, opts);
    else {
      // a ceremony she is holding: the steps (and, until a step is done, the way back)
      if (p.status === 'accepted' && p.forUnitId === undefined && nextCeremonyStep(p) !== undefined) renderCeremonyCard(host, { state, reg, punishment: p, onStep: (step, number) => handlers.ceremony?.(p.id, step, number) }, opts);
      if ((p.status === 'accepted' || p.status === 'refused') && p.forUnitId === undefined && canUndoPractice(state, p.id) === null && opts.look === 'scene') {
        // P10e-e Task 7: the answered punishment in the scene's look: her card with the answer as a chip and `undo, not what I meant`
        const live = { unitId: p.holderId };
        const label = labelOf(reg, p);
        const word = p.status === 'accepted' ? 'ACCEPTED' : 'REFUSED';
        const card = sceneCard({
          her: herLook(state, reg, p.holderId), kind: 'punishment', conditions: [],
          extra: [h('span', { class: 'alius-chip', 'data-chip-unit': p.holderId, ...analyzeAttrs('glossary:holder_punishment', live) }, `${word} — ${label}`)],
          answers: [scenePill('undo, not what I meant', () => handlers.undo(p.id), { 'data-undo-practice': p.id, ...analyzeNative('glossary:punishment_card', live) })],
          gist: `${label.toLowerCase()} · <b>${word.toLowerCase()}</b>`,
        });
        card.setAttribute('data-punishment-answered', p.id);
        host.append(card);
      } else if ((p.status === 'accepted' || p.status === 'refused') && p.forUnitId === undefined && canUndoPractice(state, p.id) === null) {
        host.append(h('div', { class: 'alius-chip-group', 'data-punishment-answered': p.id },
          h('span', { class: 'alius-chip', 'data-chip-unit': p.holderId, ...analyzeAttrs('glossary:holder_punishment', { unitId: p.holderId }) }, `${p.status === 'accepted' ? 'ACCEPTED' : 'REFUSED'} — ${labelOf(reg, p)} (${nameOf(state, p.holderId)})`),
          h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-undo-practice': p.id, ...analyzeNative('glossary:punishment_card', { unitId: p.holderId }), onclick: () => handlers.undo(p.id) }, '[ UNDO — not what I meant ]')));
      }
    }
  }
}
