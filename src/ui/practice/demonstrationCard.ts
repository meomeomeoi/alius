import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import { practiceLive } from '../../engine/practice/gate';
import type { OpenDemonstration } from '../../engine/practice/state';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';
import type { GenerationUi } from '../generation/surface';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';
import { drawPracticeReroll } from './generation';

export type DemonstrationAnswer = 'go' | 'refuse';

export interface DemonstrationCardCtx {
  state: CampaignState;
  reg: Registries;
  demonstration: OpenDemonstration;
  onAnswer: (answer: DemonstrationAnswer) => void;
  /** P14: draws `[ REROLL ]` of her words while the card is offered. Absent = the card draws none. */
  generation?: GenerationUi;
}

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** "Ann", "Ann and Bea", "Ann, Bea and Cat". */
const joinNames = (names: string[]): string => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * Her demonstration as a card in her voice (P16, plan R9, R24): her words, who watches (the units on the card by name, and "others" when more are narrated; never a number), where and at
 * which slot, that it takes the slot, and the answers: GO (opens the group scene with her and exactly the units on the card) and REFUSE (a refusal at its stakes). A GO whose scene did not open
 * shows a hint and may be pressed again. Every part is addressed by the glossary; her words go through `plainDraft`; no pronoun for the commander.
 */
export function renderDemonstrationCard(host: HTMLElement, ctx: DemonstrationCardCtx): void {
  const { state, reg, demonstration: d } = ctx;
  const unit = state.squad.find((u) => u.id === d.holderId);
  if (unit === undefined) return;
  const live = { unitId: unit.id };
  const button = (kind: DemonstrationAnswer, text: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-demonstration-answer': kind, 'data-demonstration': d.id, ...analyzeNative('glossary:demonstration', live), onclick: () => ctx.onAnswer(kind),
  }, text);
  const place = String(reg.locations.get(d.stage)?.name ?? d.stage);
  const slot = d.slot ?? 'evening';
  const names = d.audienceIds.map((id) => nameOf(state, id));
  const others = (d.narrated ?? []).length > 0;
  const before = names.length === 0 ? 'others' : others ? `${joinNames(names)} and others` : joinNames(names);
  const parts: Child[] = [
    h('p', { class: 'alius-demonstration-text' }, plainDraft(d.text)),
    h('p', { class: 'alius-demonstration-watch', 'data-demonstration-audience': '', ...analyzeAttrs('glossary:demonstration', live) }, `Before: ${before}.`),
    h('p', { class: 'alius-demonstration-place', 'data-demonstration-place': d.stage, ...analyzeAttrs('glossary:demonstration', live) }, `${place}, ${slot}. It takes the slot.`),
    ...(d.status === 'open' ? [h('p', { class: 'alius-demonstration-hint' }, 'The scene did not open. Press GO again.')] : []),
    h('div', { class: 'alius-demonstration-answers' }, button('go', '[ GO ]'), button('refuse', '[ REFUSE ]'),
      d.status === 'offered' ? drawPracticeReroll(h('span', { class: 'alius-demonstration-reroll' }), ctx.generation, 'demonstration', d.requestId) : null),
  ];
  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body: h('div', { class: 'alius-demonstration-body' }, ...parts), accent: unitAccent(unit.id) });
  card.classList.add('alius-demonstration');
  card.setAttribute('data-demonstration', d.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} wants to show the commander's service before others`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:demonstration', live))) card.setAttribute(k, v);
  host.append(card);
}

/** Handlers of the cards a surface draws: the demonstration's id comes with each answer. */
export interface DemonstrationCardHandlers {
  answer: (demonstrationId: string, answer: DemonstrationAnswer) => void;
  /** P14: the surface's generation ui: the card draws REROLL. */
  generation?: GenerationUi;
}

/**
 * Draws the demonstrations of the units `pick` chooses that wait for the commander (offered, or open with no scene yet), replacing what `host` held. Nothing for a holder who is not live, or
 * while the dynamic is off. Immersive mode keeps it (it hides numbers, not what she asks).
 */
export function drawDemonstrationCards(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, handlers: DemonstrationCardHandlers): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const d of state.practices?.demonstrations ?? []) {
    const waiting = d.status === 'offered' || (d.status === 'open' && d.sceneId === undefined);
    if (!waiting || !pick({ unitId: d.holderId }) || !practiceLive(state, reg, d.holderId)) continue;
    renderDemonstrationCard(host, { state, reg, demonstration: d, onAnswer: (a) => handlers.answer(d.id, a), generation: handlers.generation });
  }
}
