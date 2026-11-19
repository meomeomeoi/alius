import type { Registries } from '../../content/types';
import type { CampaignState } from '../../engine/state/types';
import { revealPending, wardenOf } from '../../engine/warden';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';

/**
 * The one-time WARDEN ASSIGNED notice (P13 §1), in the corporate voice: who holds the controller. Drawn nothing unless the reveal is
 * due (`revealPending`); `onAck` dispatches `warden/revealed`.
 */
export function renderRevealCard(host: HTMLElement, state: CampaignState, reg: Registries, onAck: () => void): void {
  if (!revealPending(state, reg)) return;
  const warden = wardenOf(state);
  const unit = state.squad.find((u) => u.id === warden?.unitId);
  if (!warden || !unit) return;
  const body = h('div', { class: 'alius-warden-reveal-body' },
    h('p', {}, `By order of oversight, ${unit.displayName} holds the controller of the commander's implant.`),
    h('p', { class: 'alius-dim' }, warden.assignedBy === 'player' ? 'Assigned at the request of the commander.' : 'Assigned by oversight: the unit most loyal to the corporation.'),
    h('div', { class: 'alius-row' }, h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-action': 'ack-reveal', ...analyzeNative('glossary:warden'), onclick: onAck,
    }, '[ ACKNOWLEDGE ]')));
  const card = renderVoiceCard({ voice: VOICE_OF.warden_reveal, title: 'WARDEN ASSIGNED', meta: 'OVERSIGHT', level: 3, body });
  card.classList.add('alius-warden-reveal', 'alius-stat');
  card.setAttribute('data-analyze', 'glossary:warden');
  host.append(card);
}
