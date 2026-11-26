/**
 * P10e-e Task 7: her cards in the scene's language (`docs/prototypes/cards.html`, normative). A card is glass with her accent's stripe on the
 * left; the head line is her name in her hand and the kind in small caps; the body is her words in her hand, a thin rule, then the conditions,
 * each a line of her own (`voiceLine`) with the engine's value in her stronger ink (`span.alius-scard-v`), and under each its dry line (shown in
 * readable mode only). The moment and the fallback hold are not hers: a neutral stripe, the kind only, one line of prose. The commander's answers
 * are plain pills (`scenePill`), lower case, no brackets. The draw functions of the other packages build their card with `sceneCard` when they
 * are given `look: 'scene'`; without it their DOM is today's.
 */
import type { Entry, Registries } from '../../../content/types';
import { herHand } from '../../stage/look';
import type { CampaignState } from '../../../engine/state/types';
import { analyzeAttrs } from '../../analyze/mark';
import { h, type Child } from '../../dom';
import { setHand } from '../../notes/note';
import { unitAccent } from '../../voice/voiceCard';
import type { VoiceRun } from './voice';

/** Who speaks on a card: her name, her accent and her hand (absent = a neutral card: the moment, the fallback hold). */
export interface HerLook {
  unitId: string;
  name: string;
  accent: string;
  hand: Entry | null;
}

/** Her look on a card: her display name, `unitAccent` and her hand (`herHand`). */
export function herLook(state: CampaignState, reg: Registries, unitId: string): HerLook {
  const unit = state.squad.find((u) => u.id === unitId);
  return { unitId, name: unit?.displayName ?? unitId, accent: unitAccent(unitId), hand: herHand(state, reg, unitId) };
}

/** One condition: her line (runs), its dry wording (readable mode) and the analysis address of the line. */
export interface SceneCondition {
  runs: VoiceRun[];
  dry: string;
  analyze: string;
  ctx?: Record<string, unknown>;
  /** Extra attributes of the line (a draw function's own `data-*` hooks). */
  attrs?: Record<string, string>;
}

export interface SceneCardOpts {
  her?: HerLook;
  /** The small-caps word of the head line (`task`, `sealed`, `punishment`, `order`, `a moment`, …). */
  kind: string;
  /** `data-scard-kind` when it is not the word itself (`moment` for `a moment`, `physics` for `a hold`, `return` for `begin again`). */
  kindId?: string;
  /** Her words (the model's text, or her static words), in her hand. */
  words?: VoiceRun[] | string;
  conditions: SceneCondition[];
  /** One line of prose (the moment's, the fallback hold's cue): not her hand. */
  prose?: string;
  answers: HTMLElement[];
  /** A sealed envelope: the wax seal in the head line. */
  seal?: true;
  /** Anything else the card holds, after the conditions (the ceremony's steps, a field, a hint). */
  extra?: Node[];
  /** The gist of the collapsed card (`gistOf`). */
  gist?: string;
}

/** Runs as nodes: her frame as text, each value a `span.alius-scard-v`. */
export function runsOf(runs: VoiceRun[] | string): Child[] {
  if (typeof runs === 'string') return [runs];
  return runs.map((r) => (r.value ? h('span', { class: 'alius-scard-v' }, r.text) : r.text));
}

/** The text of runs. */
export const runsText = (runs: VoiceRun[]): string => runs.map((r) => r.text).join('');

/** One condition as cards.html's `line('cond', …, dry)`: her line, then its dry line (shown in readable mode only). */
export function conditionEls(c: SceneCondition): HTMLElement[] {
  const els = [h('div', { class: 'alius-scard-cond', ...(c.attrs ?? {}), ...analyzeAttrs(c.analyze, c.ctx) }, ...runsOf(c.runs))];
  if (c.dry !== '') els.push(h('div', { class: 'alius-scard-dry' }, c.dry));
  return els;
}

/**
 * A card of the scene (cards.html `.card`, `.head`, `bodyOf`): `article.alius-scard[data-scard-kind]`. The caller adds its own `data-*` hooks,
 * role, label and `data-analyze` to the returned element.
 */
export function sceneCard(o: SceneCardOpts): HTMLElement {
  const head = h('div', { class: 'alius-scard-head' },
    o.her ? h('span', { class: 'alius-scard-who' }, o.her.name) : null,
    h('span', { class: 'alius-scard-kind' }, o.kind));
  const body = h('div', { class: 'alius-scard-body' });
  if (o.words !== undefined && (typeof o.words === 'string' ? o.words !== '' : o.words.length > 0)) body.append(h('div', { class: 'alius-scard-words' }, ...runsOf(o.words)));
  if (o.prose !== undefined) body.append(h('div', { class: 'alius-scard-prose' }, o.prose));
  if (o.conditions.length > 0) body.append(h('div', { class: 'alius-scard-rule' }));
  for (const c of o.conditions) body.append(...conditionEls(c));
  for (const n of o.extra ?? []) body.append(n);
  if (o.answers.length > 0) body.append(h('div', { class: 'alius-scard-answers' }, ...o.answers));
  const card = h('article', {
    class: `alius-scard${o.her ? '' : ' alius-scard-neutral'}${o.seal ? ' alius-scard-sealed' : ''}`, 'data-scard-kind': o.kindId ?? o.kind,
    ...(o.gist !== undefined ? { 'data-gist': o.gist } : {}),
  }, head, o.seal ? h('div', { class: 'alius-scard-seal', 'aria-hidden': 'true' }) : null, body);
  if (o.her) {
    card.style.setProperty('--alius-her', o.her.accent);
    setHand(card, o.her.hand);
  }
  return card;
}

/** cards.html `pill`: a plain answer of the commander (`button.alius-pill`), its word in a span; a soft-disabled one does nothing. */
export function scenePill(text: string, onclick: (() => void) | undefined, attrs: Record<string, unknown> = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'alius-pill', ...attrs }, h('span', {}, text)) as HTMLButtonElement;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.getAttribute('aria-disabled') !== 'true') onclick?.();
  });
  return b;
}

/** A label the old cards draw as `[ WORD ]`, as a pill's word: no brackets, lower case. */
export const pillWord = (text: string): string => text.replace(/\[\s*|\s*\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
