import { ADDITION_WORDS, genericWord } from '../../blocking/momentDirectives';
import type { Registries } from '../../content/types';
import { blockingLive } from '../../engine/blocking';
import type { Action } from '../../engine/dispatch';
import { momentsOf } from '../../engine/moments/state';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface MomentCardCtx {
  state: CampaignState | null;
  registries: Registries;
  /** The `momentChips` setting: chips, or `immersive` (no chips: one dim line; free text is read as the answer). */
  chips: 'chips' | 'immersive';
  /** A chip's action (the scene controller's `stage`: it adds the chat index and rebases the swipe). */
  onStage: (action: Action) => void;
}

/**
 * The moment card of the scene screen (P15a): the open moment's options as chips. The generic words show first and the model's labels take
 * their place when they arrive; the additions (`lock`, `look`, `ally`) have words of their own. A chip dispatches `moment/answer` through
 * `onStage`. The card never shows which answer she expects and never a number; each option carries `data-analyze` (the static text and the
 * kind of answer it is). Immersive mode draws no chips, only a dim line. Drawn only while the blocking is live and a moment is open.
 */
export function renderMomentCard(host: HTMLElement, ctx: MomentCardCtx): void {
  const { state, registries: reg } = ctx;
  const open = state?.scene && blockingLive(state, reg) ? momentsOf(state.scene).open : undefined;
  if (!state || !open) {
    host.replaceChildren();
    return;
  }
  if (ctx.chips === 'immersive') {
    host.replaceChildren(h('p', { class: 'alius-moment-dim alius-dim', role: 'note', 'data-moment': open.id, ...analyzeAttrs('glossary:moment') }, 'Something is at stake.'));
    return;
  }
  const wording = (key: string): string => {
    const i = ['0', '1', '2'].indexOf(key);
    return i >= 0 ? open.labels?.[i] ?? genericWord(reg, open.sourceId, key) : ADDITION_WORDS[key] ?? key;
  };
  const options = open.options.map((o) =>
    h('button', {
      type: 'button', class: 'alius-btn alius-option alius-moment-option', 'data-action': 'moment-answer', 'data-key': o.key, 'data-moment': open.id,
      ...analyzeNative(`momentSources:${open.sourceId}`, { key: o.key }),
      onclick: () => ctx.onStage({ type: 'moment/answer', payload: { momentId: open.id, key: o.key } }),
    }, `[ ${wording(o.key).toUpperCase()} ]`));
  host.replaceChildren(h('div', { class: 'alius-moment', role: 'group', 'aria-label': 'A moment', 'data-moment': open.id, 'data-source': open.sourceId, ...analyzeAttrs('glossary:moment_card') },
    h('div', { class: 'alius-moment-title' }, '[ A MOMENT ]'),
    ...(open.exposing !== undefined ? [h('p', { class: 'alius-moment-exposing alius-dim' }, `${open.exposing} could give the commander away.`)] : []),
    h('div', { class: 'alius-moment-options' }, ...options),
    h('p', { class: 'alius-moment-hint alius-dim' }, 'Or answer in your own words.')));
}
