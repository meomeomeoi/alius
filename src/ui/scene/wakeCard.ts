import type { Registries } from '../../content/types';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { renderVoiceCard } from '../voice/voiceCard';

const SLOT = { morning: 'the morning', afternoon: 'the afternoon', evening: 'the evening', night: 'the night' } as const;

/**
 * The wake-up card (P15a): shown once after a scene that a blackout cut. Where the commander came to, who is there and, when the model had
 * one, her first line. Absent while a scene is open or when nothing is kept. No pronoun for the commander (lore §0). A `null` result means
 * there is nothing to show.
 */
export function wakeCard(state: CampaignState | null, reg: Registries): HTMLElement | null {
  const wake = state?.lastWake;
  if (!state || !wake || state.scene) return null;
  const her = state.squad.find((u) => u.id === wake.unitId)?.displayName ?? 'Someone';
  const body = h('div', { class: 'alius-wake', ...analyzeAttrs('glossary:wake_up') },
    h('p', {}, `Day ${wake.day}, ${SLOT[wake.slot]}. The commander comes to, and ${her} is there.`),
    wake.line !== undefined && wake.line !== '' ? h('p', { class: 'alius-wake-line' }, `"${wake.line}"`) : null,
    h('p', { class: 'alius-dim' }, `${String(reg.commanderConditions.get('dizzy')?.label ?? 'Dizzy')} until the day ends.`));
  return renderVoiceCard({ voice: 'terminal', title: 'YOU COME TO', body });
}
