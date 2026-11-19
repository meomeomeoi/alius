import { buildKnowledge } from '../../analysis/knowledge';
import type { Registries } from '../../content/types';
import { recapCommitted } from '../../engine/headStart/recap';
import { momentTag } from '../../engine/headStart/tag';
import type { CampaignState } from '../../engine/state/types';
import { DEFAULT_SETTINGS } from '../../settings';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { drawGenerationChips, drawSiteReroll, type GenerationUi } from '../generation/surface';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';

/** The status header's chip on day 1 of a head start. AUTHOR TO WRITE. */
export const OPERATIONS_LABEL = 'DAY 1 OF OPERATIONS';
const SITE = 'setup.head_start_recap';

export interface RecapCardCtx {
  state: CampaignState;
  registries: Registries;
  generation?: GenerationUi;
  onReroll(): Promise<void>;
  /** Whether REROLL is allowed and why not (the controller's: it knows the first scene started). */
  rerollState?(): { enabled: boolean; reason?: string };
}

/**
 * THE FIRST WEEKS (P11b §4): the squad's paragraph and each soldier's remembered moments, on the hub until the first scene starts (then
 * they live in the LOG and in each soldier's MEMORY view). The texts are read from the state through `Knowledge`, never from a cache:
 * the fact of each of her moments is found by the moment's own tag. Draws nothing without a head start or once the
 * recap can no longer be replaced.
 */
export function renderRecapCard(host: HTMLElement, ctx: RecapCardCtx): void {
  host.replaceChildren();
  const { state } = ctx;
  const hs = state.headStart;
  if (!hs || recapCommitted(state) !== null) return;
  const title = h('div', { class: 'alius-card-label alius-stat alius-head-start-title', ...analyzeAttrs('glossary:head_start_recap') }, 'THE FIRST WEEKS');
  const body = h('div', { class: 'alius-head-start-body' }, title);
  if (hs.recap === undefined) {
    body.append(h('p', { class: 'alius-dim' }, 'The first weeks are being written.'));
  } else {
    const chronicle = state.memory.chronicle.find((c) => c.id === hs.recap!.chronicleId);
    if (chronicle) body.append(h('p', { class: 'alius-head-start-paragraph' }, chronicle.text));
    const facts = buildKnowledge(state, DEFAULT_SETTINGS).facts().filter((f) => f.tags.includes('head_start'));
    for (const u of hs.units) {
      const mine = facts.filter((f) => f.about.length === 1 && f.about[0] === u.unitId);
      const lines = u.moments.map((kind) => ({ kind, text: mine.find((f) => f.tags.includes(momentTag(kind)))?.text })).filter((m): m is { kind: string; text: string } => m.text !== undefined);
      if (lines.length === 0) continue;
      body.append(h('div', { class: 'alius-head-start-unit' },
        h('h3', {}, state.squad.find((x) => x.id === u.unitId)?.displayName ?? u.unitId),
        h('ul', {}, ...lines.map((m) => h('li', { class: 'alius-head-start-moment alius-stat', ...analyzeAttrs(`headStartMoments:${m.kind}`), tabindex: '0' }, m.text)))));
    }
  }
  const actions = h('div', { class: 'alius-row alius-head-start-actions' });
  const chips = drawGenerationChips(actions, ctx.generation, state, 'world', (r) => r.siteId === SITE);
  if (chips === 0 && hs.recap !== undefined) drawSiteReroll(actions, ctx.generation, SITE, 'recap', ctx.onReroll, ctx.rerollState?.());
  if (actions.childElementCount > 0) body.append(actions);
  host.append(renderVoiceCard({ voice: VOICE_OF.head_start, body }));
}
