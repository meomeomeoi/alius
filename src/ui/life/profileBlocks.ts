import type { Registries } from '../../content/types';
import { TEMPERAMENT_FIELDS, TEMPERAMENT_VALUES } from '../../engine/life/state';
import type { HobbyEntry, OpinionTopicEntry } from '../../engine/life/types';
import type { HobbyState, Temperament } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/**
 * The editors of her inner profile (P14c): TEMPERAMENT, HOBBIES and OPINIONS. The wizard's calibration (always editable: nothing has
 * happened yet) and the squad dossier (editable only with the mechanics edit lock off) draw the same blocks; each one takes `editable` and
 * callbacks, and never touches the state. With `editable` false every control stays on screen, `aria-disabled` and still analyzable, and does
 * nothing. No number is rendered: a hobby shows the milestones she has passed, an opinion her position in words.
 */

export interface LifeBlockUnit { id: string; displayName: string }

/** A button that does nothing while disabled (`aria-disabled`, kept focusable and analyzable). */
export function control(label: string, attrs: Record<string, string>, address: string, ctx: Record<string, unknown>, enabled: boolean, run: () => void, pressed?: boolean): HTMLElement {
  return h('button', {
    type: 'button', class: 'alius-btn alius-option', 'aria-disabled': enabled ? null : 'true',
    ...(pressed !== undefined ? { 'aria-pressed': String(pressed) } : {}), ...attrs, ...analyzeNative(address, ctx), onclick: () => { if (enabled) run(); },
  }, label);
}

/** A select that does nothing while disabled: the change is undone. */
function picker(label: string, attrs: Record<string, string>, enabled: boolean, options: Array<HTMLElement>, onPick: (value: string) => void): HTMLSelectElement {
  const el = h('select', { class: 'alius-input', 'aria-label': label, 'aria-disabled': enabled ? null : 'true', ...attrs }, ...options) as HTMLSelectElement;
  el.addEventListener('change', () => {
    const value = el.value;
    el.value = '';
    if (enabled && value !== '') onPick(value);
  });
  return el;
}

export const option = (value: string, text: string, selected = false): HTMLElement => h('option', { value, selected }, text);
export const title = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

// --- temperament

export interface TemperamentBlockCtx {
  unit: LifeBlockUnit;
  temperament: Temperament;
  /** Fields she has locked: a re-sync and any drift keep them, and so does this block (unlock first). */
  locks: ReadonlyArray<keyof Temperament>;
  editable: boolean;
  /** One changed field at a time: `profile/set_temperament` refuses a whole patch that holds a locked field. */
  onSet: (field: keyof Temperament, value: string) => void;
  onLock: (field: keyof Temperament, on: boolean) => void;
}

export function renderTemperamentBlock(host: HTMLElement, ctx: TemperamentBlockCtx): void {
  const live = { unitId: ctx.unit.id };
  const { temperament: current } = ctx; // her words as the caller read them (through `temperamentOf`)
  host.replaceChildren(h('p', { class: 'alius-stat', ...analyzeAttrs('glossary:temperament', live) }, 'TEMPERAMENT'));
  for (const field of TEMPERAMENT_FIELDS) {
    const locked = ctx.locks.includes(field);
    const words = TEMPERAMENT_VALUES[field];
    host.append(h('div', { class: 'alius-life-row', 'data-temperament': field },
      h('span', { class: 'alius-stat', ...analyzeAttrs(`glossary:${field}`, live) }, `${title(field)}:`),
      ...words.map((word) => control(word.toUpperCase(), { 'data-temperament': field, 'data-id': word }, `glossary:${field}`, live, ctx.editable && !locked,
        () => { if (current[field] !== word) ctx.onSet(field, word); }, current[field] === word)),
      control(locked ? '[ LOCKED ]' : '[ LOCK ]', { 'data-lock': field }, 'glossary:temperament', live, ctx.editable, () => ctx.onLock(field, !locked), locked)));
  }
}

// --- hobbies

/** One hobby of the list: the dossier knows its state and milestones; the calibration only knows the id. */
export interface HobbyRow { id: string; state?: HobbyState['state']; milestones?: number }

export interface HobbiesEditorCtx {
  unit: LifeBlockUnit;
  registries: Registries;
  hobbies: ReadonlyArray<HobbyRow>;
  aptitudes: { high: readonly string[]; low: readonly string[] };
  editable: boolean;
  /** The whole list she should have and her aptitudes after the change. */
  onSet: (hobbies: string[], aptitudes: { high: string[]; low: string[] }) => void;
}

const STATE_WORD: Record<HobbyState['state'], string> = { active: '', cooling: 'COOLING', dropped: 'PUT AWAY' };
const MILESTONES = 4;

export function renderHobbiesEditor(host: HTMLElement, ctx: HobbiesEditorCtx): void {
  const { unit, registries: reg } = ctx;
  const live = { unitId: unit.id };
  const label = (id: string): string => String((reg.hobbies.get(id) as HobbyEntry | undefined)?.label ?? id);
  const ids = ctx.hobbies.map((x) => x.id);
  const apt = { high: [...ctx.aptitudes.high], low: [...ctx.aptitudes.low] };
  const active = ctx.hobbies.filter((x) => (x.state ?? 'active') === 'active').length;
  const rated = new Set([...apt.high, ...apt.low]);
  const send = (hobbies: string[], aptitudes = apt): void => ctx.onSet(hobbies, { high: [...aptitudes.high], low: [...aptitudes.low] });

  host.replaceChildren(h('p', { class: 'alius-stat', ...analyzeAttrs('glossary:hobby_cycle', live) }, 'HOBBIES'));
  if (ctx.hobbies.length === 0) host.append(h('p', { class: 'alius-dim', 'data-empty': 'hobbies' }, 'No hobby yet.'));
  for (const row of ctx.hobbies) {
    const dots = row.milestones === undefined ? null
      : h('span', { class: 'alius-stat alius-life-dots', 'data-milestones': String(row.milestones), ...analyzeAttrs('glossary:hobby_cycle', live) },
        `${'◆'.repeat(Math.min(MILESTONES, row.milestones))}${'◇'.repeat(Math.max(0, MILESTONES - row.milestones))}`);
    const word = STATE_WORD[row.state ?? 'active'];
    host.append(h('div', { class: 'alius-life-row', 'data-hobby': row.id },
      h('span', { class: 'alius-chip', ...analyzeAttrs(`hobbies:${row.id}`, live) }, label(row.id)),
      dots,
      word ? h('span', { class: 'alius-stat', ...analyzeAttrs('glossary:hobby_cycle', live) }, word) : null,
      control('[ REMOVE ]', { 'data-remove-hobby': row.id }, `hobbies:${row.id}`, live, ctx.editable, () => send(ids.filter((x) => x !== row.id)))));
  }
  const addable = [...reg.hobbies.values()].filter((e) => !ids.includes(e.id));
  host.append(h('div', { class: 'alius-life-row', 'data-add': 'hobby' },
    picker('Take up a hobby', { 'data-add-hobby': unit.id }, ctx.editable && active < TUNING.life.maxActive && addable.length > 0,
      [option('', '(add a hobby)'), ...addable.map((e) => option(e.id, label(e.id)))], (id) => send([...ids, id]))));

  // her aptitudes are hidden information: they are drawn only while the edit lock is off
  if (!ctx.editable) return;
  for (const [key, text] of [['high', 'Gifted at'], ['low', 'Hopeless at']] as const) {
    const free = [...reg.hobbies.values()].filter((e) => !rated.has(e.id));
    host.append(h('div', { class: 'alius-life-row', 'data-aptitude': key },
      h('span', { class: 'alius-stat', ...analyzeAttrs('glossary:hobby_cycle', live) }, `${text}:`),
      ...apt[key].map((id) => control(`${label(id)} ✕`, { 'data-aptitude': key, 'data-id': id }, `hobbies:${id}`, live, true, () => send(ids, { ...apt, [key]: apt[key].filter((x) => x !== id) }))),
      picker(text, { 'data-add-aptitude': key }, apt[key].length < 3 && free.length > 0,
        [option('', '(add)'), ...free.map((e) => option(e.id, label(e.id)))], (id) => send(ids, { ...apt, [key]: [...apt[key], id] }))));
  }
}

// --- opinions

/** One opinion of the list; `voiced` is whether she has said it to the commander (an unvoiced one is shown only while editing). */
export interface OpinionRow { position: string; text?: string; voiced?: boolean }

export interface OpinionsEditorCtx {
  unit: LifeBlockUnit;
  registries: Registries;
  opinions: Readonly<Record<string, OpinionRow>>;
  editable: boolean;
  /** At most this many opinions (the import's cap; absent = no cap). */
  max?: number;
  /** A new or changed opinion: the topic and her position (and her words when they changed). */
  onSet: (topicId: string, patch: { position: string; text?: string }) => void;
  /** Absent = an opinion cannot be taken away (the dossier: there is no action for it). */
  onRemove?: (topicId: string) => void;
}

export function renderOpinionsEditor(host: HTMLElement, ctx: OpinionsEditorCtx): void {
  const { unit, registries: reg } = ctx;
  const live = { unitId: unit.id };
  const topic = (id: string): OpinionTopicEntry | undefined => reg.opinionTopics.get(id) as OpinionTopicEntry | undefined;
  const shown = Object.entries(ctx.opinions).filter(([id, o]) => topic(id) !== undefined && (ctx.editable || o.voiced === true));
  host.replaceChildren(h('p', { class: 'alius-stat', ...analyzeAttrs('glossary:thoughts', live) }, 'OPINIONS'));
  if (shown.length === 0) host.append(h('p', { class: 'alius-dim', 'data-empty': 'opinions' }, ctx.editable ? 'No opinion yet.' : 'Nothing she has said yet.'));
  for (const [topicId, op] of shown) {
    const t = topic(topicId) as OpinionTopicEntry;
    const select = h('select', {
      class: 'alius-input', 'aria-label': `${String(t.label)}: her position`, 'aria-disabled': ctx.editable ? null : 'true', 'data-opinion-position': topicId,
    }, ...t.positions.map((p) => option(p.id, p.description, p.id === op.position))) as HTMLSelectElement;
    select.value = op.position;
    select.addEventListener('change', () => {
      if (!ctx.editable) { select.value = op.position; return; }
      if (select.value !== op.position) ctx.onSet(topicId, { position: select.value });
    });
    const input = h('input', {
      type: 'text', class: 'alius-input', maxlength: String(TUNING.life.opinion.textMax), 'aria-label': `${String(t.label)}: her words`,
      'aria-disabled': ctx.editable ? null : 'true', 'data-opinion-text': topicId,
    }) as HTMLInputElement;
    input.value = op.text ?? '';
    input.readOnly = !ctx.editable;
    input.addEventListener('change', () => {
      if (ctx.editable && input.value !== (op.text ?? '')) ctx.onSet(topicId, { position: op.position, text: input.value });
    });
    host.append(h('div', { class: 'alius-life-row', 'data-opinion': topicId },
      h('span', { class: 'alius-chip', ...analyzeAttrs(`opinionTopics:${topicId}`, live) }, String(t.label)),
      select, input,
      ctx.onRemove ? control('[ REMOVE ]', { 'data-remove-opinion': topicId }, `opinionTopics:${topicId}`, live, ctx.editable, () => ctx.onRemove!(topicId)) : null));
  }
  // the picker lists every topic she holds no opinion on: drawn only while editing, or it would tell which topics hold an unvoiced one
  if (!ctx.editable) return;
  const free = [...reg.opinionTopics.values()].filter((e) => !(e.id in ctx.opinions));
  const full = ctx.max !== undefined && Object.keys(ctx.opinions).length >= ctx.max;
  host.append(h('div', { class: 'alius-life-row', 'data-add': 'opinion' },
    picker('Add an opinion', { 'data-add-opinion': unit.id }, !full && free.length > 0,
      [option('', '(add an opinion)'), ...free.map((e) => option(e.id, String(e.label)))],
      (id) => {
        const t = topic(id) as OpinionTopicEntry;
        ctx.onSet(id, { position: t.positions[Math.floor(t.positions.length / 2)].id });
      })));
}
