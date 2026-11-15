import type { Registries } from '../../content/types';
import { herCallSpecOf } from '../../engine/power/herCall';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

/**
 * The notice of a decision a soldier took on her own at an event node (P9e): her name, what she did and, for a bad call that
 * marked the run, a line that oversight will want a name if it fails. It offers no choice: [ACKNOWLEDGE] closes the node.
 * Built from state alone (`pending.herCall`), so a reload shows the same card. `null` when no her-call waits.
 */
export function renderHerCallCard(state: CampaignState, reg: Registries, onAck: () => void): HTMLElement | null {
  const exp = state.expedition;
  const pending = exp?.pending;
  if (!exp || pending?.kind !== 'event' || !pending.herCall) return null;
  const { unitId, outcome } = pending.herCall;
  const template = reg.dilemmaTemplates.get(pending.templateId);
  const title = (template?.fixed as { title?: string } | undefined)?.title ?? 'A decision in the field';
  const said = herCallSpecOf(template)?.outcomes.find((o) => o.id === outcome)?.text;
  const name = state.squad.find((u) => u.id === unitId)?.displayName ?? unitId;
  const mission = state.missions.active.find((m) => m.id === exp.missionId);
  const marked = outcome === 'bad' && mission?.decidedBy?.source === 'her_call' && mission.decidedBy.nodeId === pending.nodeId;
  const ctx = { unitId, nodeId: pending.nodeId, missionId: exp.missionId };

  const body = h('div', {},
    h('p', {}, said ? `${name} took the decision herself: ${said}` : `${name} took the decision herself.`),
    marked ? h('p', { class: 'alius-banner' }, 'Oversight will want a name if this run fails.') : null,
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-ack-her-call': '', ...analyzeNative('glossary:her_call', ctx), onclick: onAck }, '[ ACKNOWLEDGE ]'),
  );
  const card = renderVoiceCard({ voice: VOICE_OF.her_call, title, body, accent: unitAccent(unitId), level: 3 });
  card.setAttribute('data-her-call', pending.nodeId);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:her_call', ctx))) card.setAttribute(k, v);
  return card;
}
