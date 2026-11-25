import { ADDITION_WORDS, genericWord } from '../../blocking/momentDirectives';
import type { Registries } from '../../content/types';
import { blockingLive } from '../../engine/blocking';
import type { Action } from '../../engine/dispatch';
import { momentsOf } from '../../engine/moments/state';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import type { CardLook } from '../practice/taskCard';
import { voiceLine } from './cards/voice';
import { gistOf } from './cards/gist';
import { pillWord, runsOf, scenePill, sceneCard } from './cards/sceneCard';

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
export function renderMomentCard(host: HTMLElement, ctx: MomentCardCtx, opts: CardLook = {}): void {
  const { state, registries: reg } = ctx;
  const open = state?.scene && blockingLive(state, reg) ? momentsOf(state.scene).open : undefined;
  if (!state || !open) {
    host.replaceChildren();
    return;
  }
  if (opts.look === 'scene') {
    renderSceneMoment(host, ctx, open);
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

/**
 * P10e-e Task 7: the moment in the scene's look (cards.html `bodyOf`, case `moment`): not her voice. A neutral stripe, the kind only (`a moment`), one
 * line of prose (card-voice.md §3, by a hash of the moment), the one who could give the commander away (§3 `exposing`), the options as pills in lower
 * case and "Or answer in your own words." Immersive mode draws the prose alone (no pills: free text is the answer).
 */
function renderSceneMoment(host: HTMLElement, ctx: MomentCardCtx, open: NonNullable<ReturnType<typeof momentsOf>['open']>): void {
  const reg = ctx.registries;
  const prose = voiceLine(reg, 'moment', undefined, open.id, {}).map((r) => r.text).join('');
  const wording = (key: string): string => {
    const i = ['0', '1', '2'].indexOf(key);
    return i >= 0 ? open.labels?.[i] ?? genericWord(reg, open.sourceId, key) : ADDITION_WORDS[key] ?? key;
  };
  const immersive = ctx.chips === 'immersive';
  const answers = immersive ? [] : open.options.map((o) => scenePill(pillWord(wording(o.key)), () => ctx.onStage({ type: 'moment/answer', payload: { momentId: open.id, key: o.key } }), {
    class: 'alius-pill alius-option alius-moment-option', 'data-action': 'moment-answer', 'data-key': o.key, 'data-moment': open.id, ...analyzeNative(`momentSources:${open.sourceId}`, { key: o.key }),
  }));
  const extra = [
    ...(open.exposing !== undefined ? [h('p', { class: 'alius-scard-prose alius-moment-exposing' }, ...runsOf(voiceLine(reg, 'exposing', undefined, open.id, { name: open.exposing })))] : []),
  ];
  const card = sceneCard({ kind: 'a moment', kindId: 'moment', prose, conditions: [], extra, answers, gist: gistOf({ kind: 'moment', gist: prose.replace(/[.\s]+$/, '').toLowerCase() }) ?? '' });
  if (!immersive) card.querySelector('.alius-scard-body')!.append(h('p', { class: 'alius-scard-hint' }, 'Or answer in your own words.'));
  card.classList.add('alius-moment');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', 'A moment');
  card.setAttribute('data-moment', open.id);
  card.setAttribute('data-source', open.sourceId);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:moment_card'))) card.setAttribute(k, v);
  host.replaceChildren(card);
}
