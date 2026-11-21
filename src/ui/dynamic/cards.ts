import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import type { OpenMilestone } from '../../engine/dynamic/state';
import type { DynamicMilestoneEntry } from '../../engine/dynamic/types';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

export interface MilestoneCardCtx {
  state: CampaignState;
  reg: Registries;
  milestone: OpenMilestone;
  onAnswer: (answer: 'accept' | 'refuse') => void;
}

/**
 * Her milestone as a card in her voice (P15, plan R11): what she asks, in her words (the milestone's text), and `[ ACCEPT ]` / `[ REFUSE ]`.
 * Appends one card to `host`. It shows no number and no frame name, and nothing about what the commander feels: the card says what SHE asks.
 * The card is addressed by its milestone (the vow by the glossary's vow); both buttons are addressed by the glossary's milestone. The same
 * answer can be given in words in the scene or the thread; the card is the other way to give it.
 */
export function renderMilestoneCard(host: HTMLElement, ctx: MilestoneCardCtx): void {
  const { state, reg, milestone } = ctx;
  const entry = reg.dynamicMilestones.get(milestone.milestoneId) as unknown as DynamicMilestoneEntry | undefined;
  const unit = state.squad.find((u) => u.id === milestone.unitId);
  if (entry === undefined || unit === undefined) return;
  const button = (kind: 'accept' | 'refuse', text: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-milestone-answer': kind, 'data-milestone': milestone.id,
    ...analyzeNative('glossary:milestone', { unitId: unit.id }),
    onclick: () => ctx.onAnswer(kind),
  }, text);
  const body = h('div', { class: 'alius-milestone-body' },
    h('p', { class: 'alius-milestone-text' }, entry.text.replaceAll('{name}', unit.displayName)),
    h('div', { class: 'alius-milestone-answers' }, button('accept', '[ ACCEPT ]'), button('refuse', '[ REFUSE ]')));
  const card = renderVoiceCard({ voice: VOICE_OF.dynamic, from: unit.displayName, body, accent: unitAccent(unit.id) });
  card.classList.add('alius-milestone');
  card.setAttribute('data-milestone', milestone.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} asks something of the commander`);
  for (const [k, v] of Object.entries(analyzeAttrs(entry.sworn === true ? 'glossary:vow' : `dynamicMilestones:${entry.id}`, { unitId: unit.id }))) card.setAttribute(k, v);
  host.append(card);
}

/** Draws the open milestones of the units `pick` chooses (a scene's participants, one thread), replacing what `host` held. */
export function drawMilestoneCards(
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, onAnswer: (milestoneId: string, answer: 'accept' | 'refuse') => void,
): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const milestone of state.dynamic?.open.milestones ?? []) {
    if (pick({ unitId: milestone.unitId })) renderMilestoneCard(host, { state, reg, milestone, onAnswer: (a) => onAnswer(milestone.id, a) });
  }
}
