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

export const setBlocking = (change: BlockingChange): Action => ({ type: 'blocking/set', payload: { ...change } });
const set = setBlocking;

type PostureRegistry = 'blockingPostures' | 'blockingAnchors' | 'blockingContacts' | 'blockingItems' | 'blockingActivities';

/** One field that is set on a person: a chip (an item or a contact can be removed with ×). */
export interface BlockingChip {
  kind: 'posture' | 'anchor' | 'contact' | 'worn' | 'activity';
  registry: PostureRegistry;
  id: string;
  label: string;
  remove?: { person: string; id: string; label: string; change: BlockingChange; why: string | null };
}
export interface BlockingRow {
  person: string;
  name: string;
  chips: BlockingChip[];
}
/** A movement of the commander: what it does, as a base posture, and why a gate refuses it (null = allowed). */
export interface BlockingMove {
  move: string;
  text: string;
  posture: string;
  label: string;
  why: string | null;
  change: BlockingChange;
}
/** An entry of the [ + ] menu: a place, a contact or an item the scene allows now; `why` depends on whom it is with. */
export interface BlockingAdd {
  group: 'anchor' | 'contact' | 'worn';
  registry: 'blockingAnchors' | 'blockingContacts' | 'blockingItems';
  id: string;
  label: string;
  direction?: string;
  change(unit: string): BlockingChange;
  why(unit: string): string | null;
}
export interface BlockingChoices {
  units: string[];
  /** One row per person in the scene, then the commander. */
  rows: BlockingRow[];
  moves: BlockingMove[];
  add: BlockingAdd[];
  name(person: string): string;
  label(registry: PostureRegistry, id: string): string;
}

/**
 * P10e R5: what the BLOCKING strip and the posture dial's fan offer, as data: the rows of fields that are set, the commander's moves and
 * the entries of the [ + ] menu, each with the reason a gate refuses it today (the same `checkChange` and vocabulary as always).
 * Null while the blocking is not live.
 */
export function blockingChoices(state: CampaignState | null, reg: Registries): BlockingChoices | null {
  if (!state?.scene || !blockingLive(state, reg)) return null;
  const scene = state.scene;
  const units = scene.participants;
  const name = (id: string): string => (id === COMMANDER ? 'The commander' : state.squad.find((u) => u.id === id)?.displayName ?? id);
  const labelOf = (registry: PostureRegistry, id: string): string => String(reg[registry].get(id)?.label ?? id);

  const row = (person: string): BlockingRow => {
    const b = blockingOf(scene, person);
    const chips: BlockingChip[] = [];
    const remover = (id: string): NonNullable<BlockingChip['remove']> => {
      const change: BlockingChange = { person, field: 'removed', value: id };
      return { person, id, label: labelOf(id === b.contact?.id ? 'blockingContacts' : 'blockingItems', id), change, why: checkChange(state, reg, change) };
    };
    if (b.posture !== undefined) chips.push({ kind: 'posture', registry: 'blockingPostures', id: b.posture, label: labelOf('blockingPostures', b.posture) });
    if (b.anchor !== undefined) chips.push({ kind: 'anchor', registry: 'blockingAnchors', id: b.anchor.id, label: labelOf('blockingAnchors', b.anchor.id) });
    if (b.contact !== undefined) chips.push({ kind: 'contact', registry: 'blockingContacts', id: b.contact.id, label: labelOf('blockingContacts', b.contact.id), remove: remover(b.contact.id) });
    const seen = new Set<string>();
    for (const slot of WORN_SLOTS) {
      const w = b.worn?.[slot];
      if (!w || seen.has(w.id)) continue;
      seen.add(w.id);
      chips.push({ kind: 'worn', registry: 'blockingItems', id: w.id, label: labelOf('blockingItems', w.id), remove: remover(w.id) });
    }
    if (b.activity !== undefined) chips.push({ kind: 'activity', registry: 'blockingActivities', id: b.activity, label: labelOf('blockingActivities', b.activity) });
    return { person, name: name(person), chips };
  };

  const moves: BlockingMove[] = MOVES.map((m) => {
    const change: BlockingChange = { person: COMMANDER, field: 'posture', value: m.posture };
    return { move: m.move, text: m.text, posture: m.posture, label: labelOf('blockingPostures', m.posture), why: checkChange(state, reg, change), change };
  });

  const vocab = blockingVocabulary(state, reg);
  const entry = (group: BlockingAdd['group'], registry: BlockingAdd['registry'], id: string, text: string, change: (unit: string) => BlockingChange, direction?: string): BlockingAdd => ({
    group, registry, id, label: text, ...(direction !== undefined ? { direction } : {}), change, why: (unit) => checkChange(state, reg, change(unit)),
  });
  const add: BlockingAdd[] = [
    ...vocab.anchor.map((e) => entry('anchor', 'blockingAnchors', e.id, String(e.label), () => ({ person: COMMANDER, field: 'anchor', value: e.id }))),
    ...vocab.contact.flatMap((e) => (e.dir === 'either'
      ? [
        entry('contact', 'blockingContacts', e.id, `${String(e.label)} (from her)`, (unit) => ({ person: COMMANDER, field: 'contact', value: e.id, with: unit, direction: 'from' }), 'from'),
        entry('contact', 'blockingContacts', e.id, `${String(e.label)} (to her)`, (unit) => ({ person: COMMANDER, field: 'contact', value: e.id, with: unit, direction: 'to' }), 'to'),
      ]
      : [entry('contact', 'blockingContacts', e.id, String(e.label), (unit) => ({ person: COMMANDER, field: 'contact', value: e.id, with: unit }))])),
    ...vocab.item.map((e) => entry('worn', 'blockingItems', e.id, String(e.label), (unit) => ({ person: e.wornBy === 'her' ? unit : COMMANDER, field: 'worn', value: e.id }))),
  ];
  return { units, rows: [...units, COMMANDER].map(row), moves, add, name, label: labelOf };
}

/**
 * The BLOCKING strip of the scene screen (P15a): one row per person with the fields that are set as chips (each can be analyzed, an item or
 * a contact can be removed with ×), the commander's movement chips, and a `[ + ]` menu of the places, contacts and items the scene allows
 * right now (the same filter the reading is offered). A chip a gate refuses is `aria-disabled` and says why; every action goes through
 * `onStage`. Drawn only while the blocking is live. Nothing animates. (P10e: the scene draws the posture dial instead; the strip reads the
 * same `blockingChoices` and stays for its tests and any other use.)
 */
export function renderBlockingStrip(host: HTMLElement, ctx: BlockingStripCtx): void {
  const wasOpen = host.querySelector<HTMLDetailsElement>('details.alius-blocking-add')?.open === true;
  const wasWith = host.querySelector<HTMLSelectElement>('select[name="blocking-with"]')?.value;
  const choices = blockingChoices(ctx.state, ctx.registries);
  if (choices === null) {
    host.replaceChildren();
    return;
  }
  const { units, name } = choices;

  /** A refused change is greyed out with its reason; it does nothing when pressed. */
  const guarded = (change: BlockingChange, why: string | null, attrs: Record<string, unknown>, text: string): HTMLElement =>
    h('button', {
      type: 'button', ...attrs, 'aria-disabled': why !== null ? 'true' : null, title: why ?? attrs.title ?? null,
      onclick: () => { if (why === null) ctx.onStage(set(change)); },
    }, text);

  const chipEl = (c: BlockingChip): HTMLElement => h('span', { class: 'alius-chip', 'data-kind': c.kind, ...analyzeAttrs(`${c.registry}:${c.id}`) }, c.label);
  const remover = (r: NonNullable<BlockingChip['remove']>): HTMLElement =>
    guarded(r.change, r.why, { class: 'alius-btn alius-blocking-x', 'data-action': 'remove', 'data-person': r.person, 'data-id': r.id, 'aria-label': `Remove ${r.label}` }, '×');

  const row = (r: BlockingRow): HTMLElement | null => {
    const chips = r.chips.flatMap((c) => [chipEl(c), ...(c.remove ? [remover(c.remove)] : [])]);
    const moves = r.person === COMMANDER
      ? choices.moves.map((m) => guarded(m.change, m.why, { class: 'alius-btn alius-option', 'data-move': m.move, title: m.label, ...analyzeNative(`blockingPostures:${m.posture}`) }, m.text))
      : [];
    if (chips.length === 0 && moves.length === 0) return null;
    return h('div', { class: 'alius-blocking-row', 'data-person': r.person }, h('span', { class: 'alius-blocking-name' }, r.name), ...chips, ...moves);
  };

  // the [ + ] menu: the entries the scene allows now (the reading's vocabulary), each greyed out with its reason when a gate refuses it today
  const who = units.length > 1
    ? (h('select', { name: 'blocking-with', class: 'alius-select', 'aria-label': 'With' }, ...units.map((u) => h('option', { value: u }, name(u)))) as HTMLSelectElement)
    : null;
  if (who !== null && wasWith !== undefined && units.includes(wasWith)) who.value = wasWith;
  const unit = (): string => who?.value || units[0]!;
  const entry = (e: BlockingAdd): HTMLElement => {
    const why = e.why(unit());
    return h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-group': e.group, 'data-id': e.id, ...(e.direction !== undefined ? { 'data-direction': e.direction } : {}),
      'aria-disabled': why !== null ? 'true' : null, title: why ?? null, ...analyzeNative(`${e.registry}:${e.id}`),
      onclick: () => { const c = e.change(unit()); if (checkChange(ctx.state!, ctx.registries, c) === null) ctx.onStage(set(c)); },
    }, e.label);
  };
  const group = (title: string, g: BlockingAdd['group']): HTMLElement | null => {
    const items = choices.add.filter((e) => e.group === g).map(entry);
    return items.length === 0 ? null : h('div', { class: 'alius-blocking-group' }, h('strong', { class: 'alius-dim' }, title), ...items);
  };
  const menu = h('details', { class: 'alius-blocking-add', ...(wasOpen ? { open: '' } : {}) },
    h('summary', { class: 'alius-btn alius-option', ...analyzeAttrs('glossary:blocking_strip') }, '[ + ]'),
    h('div', { class: 'alius-blocking-menu' }, who, group('PLACE', 'anchor'), group('CONTACT', 'contact'), group('WEARING', 'worn')));
  if (wasOpen) (menu as HTMLDetailsElement).open = true;

  host.replaceChildren(h('div', { class: 'alius-blocking', 'aria-label': 'Blocking' },
    h('span', { class: 'alius-stat alius-blocking-title', ...analyzeAttrs('glossary:blocking_strip') }, 'BLOCKING'),
    ...choices.rows.map(row).filter((r): r is HTMLElement => r !== null),
    menu));
}
