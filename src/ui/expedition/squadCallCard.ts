import type { Registries } from '../../content/types';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';

/**
 * The notice of what the squad decided at an event node of a run without the commander (P16, plan R12; P9e's her-call card is the pattern): the node's title, the option the squad took (the
 * first one that asks nothing of the commander) and [ACKNOWLEDGE], which closes the node. It offers no choice. Built from state alone (`pending.squadCall`), so a reload shows the same card.
 * `null` when no squad call waits.
 */
export function renderSquadCallCard(state: CampaignState, reg: Registries, onAck: () => void): HTMLElement | null {
  const exp = state.expedition;
  const pending = exp?.pending;
  if (!exp || pending?.kind !== 'event' || !pending.squadCall) return null;
  const fixed = reg.dilemmaTemplates.get(pending.templateId)?.fixed as { title?: string; options?: Array<{ label?: string }> } | undefined;
  const title = fixed?.title ?? 'A decision in the field';
  const label = fixed?.options?.[pending.squadCall.index]?.label;
  const ctx = { nodeId: pending.nodeId };
  const body = h('div', {},
    h('p', {}, label ? `The squad decided without the commander: ${label}.` : 'The squad decided without the commander.'),
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-ack-squad-call': '', ...analyzeNative('glossary:squad_call', ctx), onclick: onAck }, '[ ACKNOWLEDGE ]'),
  );
  const card = renderVoiceCard({ voice: VOICE_OF.practice, title, body, level: 3 });
  card.setAttribute('data-squad-call', pending.nodeId);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:squad_call', ctx))) card.setAttribute(k, v);
  return card;
}
