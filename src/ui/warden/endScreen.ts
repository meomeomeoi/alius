import type { CampaignState } from '../../engine/state/types';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { drawGenerationChips, drawSiteReroll, type GenerationUi } from '../generation/surface';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';

export interface EndScreenDeps {
  /** Downloads the campaign file (the existing export). */
  onExport(): void;
  /** P14: the epilogue's failure chip (the joined lines stand meanwhile) and its REROLL. Absent = none drawn. */
  generation?: GenerationUi;
}

/** How the story ended, in the corporate voice. No pronoun for the commander. */
const CAUSE: Record<string, string> = {
  terminated: 'The controller was triggered.',
  executed: 'The investigation ended with an execution order.',
};

/**
 * The END screen (P13 §1): it replaces the hub once the campaign is closed. The corporate voice, `CAMPAIGN CLOSED`, the day and the
 * cause, the epilogue (as text, never markup) and EXPORT; nothing else can be pressed. Draws nothing for a running campaign.
 */
export function renderEndScreen(host: HTMLElement, state: CampaignState, deps: EndScreenDeps): void {
  host.replaceChildren();
  const ended = state.ended;
  if (!ended) return;
  const gen = h('div', { class: 'alius-generation-chips' });
  if (deps.generation) {
    const failed = drawGenerationChips(gen, deps.generation, state, 'world', (r) => r.key === 'epilogue');
    if (failed === 0 && ended.epilogue !== undefined) drawSiteReroll(gen, deps.generation, 'warden.epilogue', 'epilogue');
  }
  const body = h('div', { class: 'alius-end-body' },
    h('p', { class: 'alius-end-cause' }, [`Day ${ended.day}.`, CAUSE[ended.cause], 'The commander is dead.'].filter((x): x is string => Boolean(x)).join(' ')),
    ended.epilogue !== undefined
      ? h('div', { class: 'alius-end-epilogue' }, ...ended.epilogue.split(/\n{2,}/).map((p) => h('p', {}, p)))
      : h('p', { class: 'alius-dim', role: 'status' }, 'The epilogue is being written.'),
    gen.childElementCount > 0 ? gen : null,
    h('div', { class: 'alius-row' }, h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-action': 'export', ...analyzeNative('glossary:death_rule'), onclick: deps.onExport,
    }, '[ EXPORT ]')));
  const card = renderVoiceCard({ voice: VOICE_OF.warden_reveal, title: 'CAMPAIGN CLOSED', meta: 'OVERSIGHT', body });
  card.classList.add('alius-end', 'alius-stat');
  card.setAttribute('data-analyze', 'glossary:death_rule');
  host.append(h('div', { class: 'alius-end-screen' }, card));
}
