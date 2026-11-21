import type { Registries } from '../../content/types';
import { blockingLive, blockingOf, checkChange, COMMANDER, WORN_SLOTS, type BlockingChange } from '../../engine/blocking';
import { blockingVocabulary } from '../../engine/blocking/vocabulary';
import type { Action } from '../../engine/dispatch';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface BlockingStripCtx {
  state: CampaignState | null;
  registries: Registries;
  /** A chip's action (the scene controller's `stage`: it adds the chat index and rebases the swipe). */
  onStage: (action: Action) => void;
}

/** The commander's movement chips: what they do, as base postures. */
const MOVES = [
  { move: 'kneel', text: '[ KNEEL ]', posture: 'kneeling_upright' },
  { move: 'sit', text: '[ SIT ]', posture: 'sitting' },
  { move: 'stand', text: '[ STAND ]', posture: 'standing' },
  { move: 'crawl', text: '[ CRAWL ]', posture: 'all_fours' },
  { move: 'lie', text: '[ LIE DOWN ]', posture: 'lying_back' },
] as const;

const set = (change: BlockingChange): Action => ({ type: 'blocking/set', payload: { ...change } });

/**
 * The BLOCKING strip of the scene screen (P15a): one row per person with the fields that are set as chips (each can be analyzed, an item or
 * a contact can be removed with ×), the commander's movement chips, and a `[ + ]` menu of the places, contacts and items the scene allows
 * right now (the same filter the reading is offered). A chip a gate refuses is `aria-disabled` and says why; every action goes through
 * `onStage`. Drawn only while the blocking is live. Nothing animates.
 */
export function renderBlockingStrip(host: HTMLElement, ctx: BlockingStripCtx): void {
  const { state, registries: reg } = ctx;
  const wasOpen = host.querySelector<HTMLDetailsElement>('details.alius-blocking-add')?.open === true;
  const wasWith = host.querySelector<HTMLSelectElement>('select[name="blocking-with"]')?.value;
  if (!state?.scene || !blockingLive(state, reg)) {
    host.replaceChildren();
    return;
  }
  const scene = state.scene;
  const units = scene.participants;
  const name = (id: string): string => (id === COMMANDER ? 'The commander' : state.squad.find((u) => u.id === id)?.displayName ?? id);

  /** A refused change is greyed out with its reason; it does nothing when pressed. */
  const guarded = (change: BlockingChange, tag: 'button', attrs: Record<string, unknown>, text: string): HTMLElement => {
    const why = checkChange(state, reg, change);
    return h(tag, {
      type: 'button', ...attrs, 'aria-disabled': why !== null ? 'true' : null, title: why ?? attrs.title ?? null,
      onclick: () => { if (why === null) ctx.onStage(set(change)); },
    }, text);
  };

  const chip = (registry: string, id: string, label: string, kind: string): HTMLElement =>
    h('span', { class: 'alius-chip', 'data-kind': kind, ...analyzeAttrs(`${registry}:${id}`) }, label);
  const labelOf = (registry: 'blockingPostures' | 'blockingAnchors' | 'blockingContacts' | 'blockingItems' | 'blockingActivities', id: string): string => String(reg[registry].get(id)?.label ?? id);
  const remover = (person: string, id: string, label: string): HTMLElement => {
    const change: BlockingChange = { person, field: 'removed', value: id };
    return guarded(change, 'button', { class: 'alius-btn alius-blocking-x', 'data-action': 'remove', 'data-person': person, 'data-id': id, 'aria-label': `Remove ${label}` }, '×');
  };

  const row = (person: string): HTMLElement | null => {
    const b = blockingOf(scene, person);
    const chips: HTMLElement[] = [];
    if (b.posture !== undefined) chips.push(chip('blockingPostures', b.posture, labelOf('blockingPostures', b.posture), 'posture'));
    if (b.anchor !== undefined) chips.push(chip('blockingAnchors', b.anchor.id, labelOf('blockingAnchors', b.anchor.id), 'anchor'));
    if (b.contact !== undefined) chips.push(chip('blockingContacts', b.contact.id, labelOf('blockingContacts', b.contact.id), 'contact'), remover(person, b.contact.id, labelOf('blockingContacts', b.contact.id)));
    const seen = new Set<string>();
    for (const slot of WORN_SLOTS) {
      const w = b.worn?.[slot];
      if (!w || seen.has(w.id)) continue;
      seen.add(w.id);
      chips.push(chip('blockingItems', w.id, labelOf('blockingItems', w.id), 'worn'), remover(person, w.id, labelOf('blockingItems', w.id)));
    }
    if (b.activity !== undefined) chips.push(chip('blockingActivities', b.activity, labelOf('blockingActivities', b.activity), 'activity'));
    const moves = person === COMMANDER
      ? MOVES.map((m) => guarded({ person: COMMANDER, field: 'posture', value: m.posture }, 'button',
        { class: 'alius-btn alius-option', 'data-move': m.move, title: labelOf('blockingPostures', m.posture), ...analyzeNative(`blockingPostures:${m.posture}`) }, m.text))
      : [];
    if (chips.length === 0 && moves.length === 0) return null;
    return h('div', { class: 'alius-blocking-row', 'data-person': person }, h('span', { class: 'alius-blocking-name' }, name(person)), ...chips, ...moves);
  };

  // the [ + ] menu: the entries the scene allows now (the reading's vocabulary), each greyed out with its reason when a gate refuses it today
  const vocab = blockingVocabulary(state, reg);
  const who = units.length > 1
    ? (h('select', { name: 'blocking-with', class: 'alius-select', 'aria-label': 'With' }, ...units.map((u) => h('option', { value: u }, name(u)))) as HTMLSelectElement)
    : null;
  if (who !== null && wasWith !== undefined && units.includes(wasWith)) who.value = wasWith;
  const unit = (): string => who?.value || units[0]!;
  const entry = (group: 'anchor' | 'contact' | 'worn', registry: 'blockingAnchors' | 'blockingContacts' | 'blockingItems', id: string, text: string, change: () => BlockingChange, direction?: string): HTMLElement => {
    const why = checkChange(state, reg, change());
    return h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-group': group, 'data-id': id, ...(direction !== undefined ? { 'data-direction': direction } : {}),
      'aria-disabled': why !== null ? 'true' : null, title: why ?? null, ...analyzeNative(`${registry}:${id}`),
      onclick: () => { const c = change(); if (checkChange(state, reg, c) === null) ctx.onStage(set(c)); },
    }, text);
  };
  const group = (title: string, items: HTMLElement[]): HTMLElement | null =>
    items.length === 0 ? null : h('div', { class: 'alius-blocking-group' }, h('strong', { class: 'alius-dim' }, title), ...items);
  const anchors = vocab.anchor.map((e) => entry('anchor', 'blockingAnchors', e.id, String(e.label), () => ({ person: COMMANDER, field: 'anchor', value: e.id })));
  const contacts = vocab.contact.flatMap((e) => (e.dir === 'either'
    ? [
      entry('contact', 'blockingContacts', e.id, `${String(e.label)} (from her)`, () => ({ person: COMMANDER, field: 'contact', value: e.id, with: unit(), direction: 'from' }), 'from'),
      entry('contact', 'blockingContacts', e.id, `${String(e.label)} (to her)`, () => ({ person: COMMANDER, field: 'contact', value: e.id, with: unit(), direction: 'to' }), 'to'),
    ]
    : [entry('contact', 'blockingContacts', e.id, String(e.label), () => ({ person: COMMANDER, field: 'contact', value: e.id, with: unit() }))]));
  const items = vocab.item.map((e) => entry('worn', 'blockingItems', e.id, String(e.label), () => ({ person: e.wornBy === 'her' ? unit() : COMMANDER, field: 'worn', value: e.id })));
  const menu = h('details', { class: 'alius-blocking-add', ...(wasOpen ? { open: '' } : {}) },
    h('summary', { class: 'alius-btn alius-option', ...analyzeAttrs('glossary:blocking_strip') }, '[ + ]'),
    h('div', { class: 'alius-blocking-menu' }, who, group('PLACE', anchors), group('CONTACT', contacts), group('WEARING', items)));
  if (wasOpen) (menu as HTMLDetailsElement).open = true;

  host.replaceChildren(h('div', { class: 'alius-blocking', 'aria-label': 'Blocking' },
    h('span', { class: 'alius-stat alius-blocking-title', ...analyzeAttrs('glossary:blocking_strip') }, 'BLOCKING'),
    ...[...units, COMMANDER].map(row).filter((r): r is HTMLElement => r !== null),
    menu));
}
