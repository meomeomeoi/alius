import type { Registries } from '../../content/types';
import { contentAllowed, type ContentHolder } from '../../engine/bonds/content';
import { ATTITUDES, BODY_FEELINGS, HAIR, HOLDS_UNTIL, HYGIENE, MEANINGS, type ExpectationProfile } from '../../engine/dynamic/expectations';
import { practiceCategories } from '../../engine/dynamic/profile';
import { mannerShortWord, mannerWord } from '../../engine/dynamic/manner';
import {
  AUDIENCE, DRAWN_BY, DRIVE, FAIRNESS, HINT_STYLE, INCLINATION, MANNER_AXES, PRACTICE_AS, PROFILE_STYLES, QUIRK_WHEN, WITNESS,
  type DrawnBy, type MannerAxis, type Practice, type PracticeCategory, type Quirk,
} from '../../engine/dynamic/types';
import { TUNING } from '../../engine/tuning';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { control, option, title } from '../life/profileBlocks';

/**
 * The editors of her dynamic profile (P15): PRACTICE (what she does as the one who leads, her style pair and her inclination) and EXPECTATIONS
 * (what she expects and wants to see). The wizard's calibration and the squad dossier draw the same blocks; each one takes `editable` and
 * callbacks and never touches the state. With `editable` false every control stays on screen, `aria-disabled` and still analyzable. A field she
 * has locked (`locks`) is drawn `aria-disabled` too: unlock it first. No number is rendered but the strength of a moment (1 to 3) and the
 * weights of her build; no text here names the commander by a pronoun.
 */

export interface DynamicBlockUnit { id: string; displayName: string }

/**
 * What the two blocks draw for a campaign (or a wizard's world choices): the practice categories that are on, the worship targets and the
 * moment sources the content gate lets through (with her own limits when `unitId` is given). Empty `categories` = the dynamic has no practice
 * here and neither block is drawn.
 */
export function dynamicBlockData(reg: Registries, holder: ContentHolder, unitId?: string): {
  categories: Array<{ id: string; label: string }>; targets: Array<{ id: string; label: string }>; sources: ExpectationSource[];
} {
  const on = holder.content?.enabled ?? [];
  const categories = practiceCategories(reg).filter((c) => on.includes(c)).map((id) => ({ id, label: String(reg.contentCategories.get(id)?.label ?? id) }));
  if (categories.length === 0) return { categories, targets: [], sources: [] };
  return {
    categories,
    targets: [...reg.worshipTargets.values()].filter((t) => contentAllowed(holder, reg, t, unitId)).map((t) => ({ id: t.id, label: String(t.label ?? t.id) })),
    sources: [...reg.momentSources.values()].filter((s) => contentAllowed(holder, reg, s, unitId)).map((s) => ({
      id: s.id, label: title(s.id.replace(/_/g, ' ')), types: ((s.frame as Array<{ type: string }> | undefined) ?? []).map((o) => o.type),
    })),
  };
}

// --- practice

/** One change at a time: `categories` holds only the category and field that changed; `style` is the whole pair; any other field replaces. */
export interface PracticePatch {
  categories?: Record<string, Partial<PracticeCategory>>;
  style?: Practice['style'];
  audience?: Practice['audience'];
  inclination?: Practice['inclination'];
  fairness?: Practice['fairness'];
  hintStyle?: Practice['hintStyle'];
  drive?: Practice['drive'];
  /** P15b: the axes that changed (merged per axis); `null` fields below drop the field. */
  manner?: Partial<Record<MannerAxis, number>>;
  drawnBy?: DrawnBy[] | null;
  everyday?: string | null;
  quirks?: Quirk[] | null;
}

export interface PracticeBlockCtx {
  unit: DynamicBlockUnit;
  /** Absent = she has no section: only her primary style is offered (a first style creates it). */
  practice?: Practice;
  /** The practice categories that are switched on, in order. */
  categories: Array<{ id: string; label: string }>;
  /** `style`, `audience`, `inclination`, `fairness`, `hintStyle`, `drive` and `categories.<id>`. */
  locks: ReadonlyArray<string>;
  editable: boolean;
  /** P15b: the steps her manner has drifted since joining (`development.practice.manner`); absent in the wizard. */
  drift?: Partial<Record<MannerAxis, number>>;
  onSet: (patch: PracticePatch) => void;
  onLock: (field: string, on: boolean) => void;
}

const FIELDS = [
  ['audience', 'Before others', AUDIENCE, 'practice_audience'],
  ['inclination', 'Inclination', INCLINATION, 'inclination'],
  ['fairness', 'Fairness', FAIRNESS, 'fairness'],
  ['hintStyle', 'How she invites', HINT_STYLE, 'hint_style'],
  ['drive', 'Drive', DRIVE, 'drive'],
] as const;

const word = (id: string): string => id.replace(/_/g, ' ').toUpperCase();

export function renderPracticeBlock(host: HTMLElement, ctx: PracticeBlockCtx): void {
  const live = { unitId: ctx.unit.id };
  const { practice } = ctx;
  const locked = (field: string): boolean => ctx.locks.includes(field);
  const lock = (field: string, address: string): HTMLElement => control(locked(field) ? '[ LOCKED ]' : '[ LOCK ]', { 'data-lock': field }, address, live, ctx.editable, () => ctx.onLock(field, !locked(field)), locked(field));
  host.replaceChildren(h('p', { class: 'alius-stat', ...analyzeNative('glossary:practice_profile', live), tabindex: '0' }, 'PRACTICE'));

  // the style pair: a lock covers both
  const styleLocked = locked('style');
  const primary = practice?.style.primary;
  const secondary = practice?.style.secondary;
  host.append(h('div', { class: 'alius-dyn-row', 'data-practice-style': 'primary' },
    h('span', { class: 'alius-stat', 'data-analyze': 'glossary:practice_style', tabindex: '0' }, 'Leads as:'),
    ...PROFILE_STYLES.map((s) => control(word(s), { 'data-id': s }, `practiceStyles:${s}`, live, ctx.editable && !styleLocked,
      () => { if (primary !== s) ctx.onSet({ style: { primary: s, ...(secondary !== undefined && secondary !== s ? { secondary } : {}) } }); }, primary === s)),
    lock('style', 'glossary:practice_style')));
  if (practice === undefined || primary === undefined) {
    host.append(h('p', { class: 'alius-dim', 'data-empty': 'practice' }, 'Pick a style to give her a practice.'));
    return;
  }
  host.append(h('div', { class: 'alius-dyn-row', 'data-practice-style': 'secondary' },
    h('span', { class: 'alius-stat', 'data-analyze': 'glossary:practice_style', tabindex: '0' }, 'Then:'),
    control('NONE', { 'data-id': 'none' }, 'glossary:practice_style', live, ctx.editable && !styleLocked, () => { if (secondary !== undefined) ctx.onSet({ style: { primary } }); }, secondary === undefined),
    ...PROFILE_STYLES.filter((s) => s !== primary).map((s) => control(word(s), { 'data-id': s }, `practiceStyles:${s}`, live, ctx.editable && !styleLocked,
      () => { if (secondary !== s) ctx.onSet({ style: { primary, secondary: s } }); }, secondary === s))));

  // one row per enabled category: what she does herself (as) and how she feels seeing it done (witness)
  for (const c of ctx.categories) {
    const stored = practice.categories[c.id] ?? { as: 'none', witness: 'indifferent' };
    const off = !ctx.editable || locked(`categories.${c.id}`);
    host.append(h('div', { class: 'alius-dyn-row', 'data-practice-category': c.id },
      h('span', { class: 'alius-chip', ...analyzeNative(`contentCategories:${c.id}`), tabindex: '0' }, c.label),
      h('span', { class: 'alius-stat', 'data-analyze': 'glossary:practice_as', tabindex: '0' }, 'Does:'),
      ...PRACTICE_AS.map((v) => control(word(v), { 'data-practice-as': v }, 'glossary:practice_as', live, !off, () => { if (stored.as !== v) ctx.onSet({ categories: { [c.id]: { as: v } } }); }, stored.as === v)),
      h('span', { class: 'alius-stat', 'data-analyze': 'glossary:practice_witness', tabindex: '0' }, 'Sees:'),
      ...WITNESS.map((v) => control(word(v), { 'data-practice-witness': v }, 'glossary:practice_witness', live, !off, () => { if (stored.witness !== v) ctx.onSet({ categories: { [c.id]: { witness: v } } }); }, stored.witness === v)),
      lock(`categories.${c.id}`, 'glossary:practice_profile')));
  }

  for (const [field, label, values, glossary] of FIELDS) {
    host.append(h('div', { class: 'alius-dyn-row', 'data-practice-field': field },
      h('span', { class: 'alius-stat', 'data-analyze': `glossary:${glossary}`, tabindex: '0' }, `${label}:`),
      ...values.map((v) => control(word(v), { 'data-id': v }, `glossary:${glossary}`, live, ctx.editable && !locked(field),
        () => { if (practice[field] !== v) ctx.onSet({ [field]: v } as PracticePatch); }, practice[field] === v)),
      lock(field, `glossary:${glossary}`)));
  }

  renderManner(host, ctx, practice, lock);
}

const STEPS = [-2, -1, 0, 1, 2] as const;
const QUIRK_LABEL: Record<Quirk['when'], string> = { switch: 'stepping in', during: 'while it runs', after: 'at the end', address: 'naming the commander' };

/**
 * P15b: her face in the dynamic (the six axes as five steps, what draws her, her quirks) and her everyday face (one line), with the contrast as a
 * word. A step's control carries its short word (none at 0) and the full words as its title; the imported step is pressed, and where she has
 * drifted since joining the step she is at now carries the since-joining mark. No number is rendered.
 */
function renderManner(host: HTMLElement, ctx: PracticeBlockCtx, practice: Practice, lock: (field: string, address: string) => HTMLElement): void {
  const live = { unitId: ctx.unit.id };
  const on = (field: string): boolean => ctx.editable && !ctx.locks.includes(field);
  const manner = practice.manner;
  host.append(h('p', { class: 'alius-stat', 'data-face': 'dynamic', ...analyzeNative('glossary:face_dynamic', live), tabindex: '0' }, 'IN THE DYNAMIC'));
  MANNER_AXES.forEach((axis, i) => {
    const A = `glossary:manner_${axis}`;
    const stored = manner?.[axis];
    const drift = ctx.drift?.[axis] ?? 0;
    const now = stored === undefined || drift === 0 ? undefined : Math.max(-2, Math.min(2, stored + drift));
    const words = TUNING.manner.words[axis];
    const buttons = STEPS.map((step) => {
      const b = control(step === 0 ? '·' : mannerShortWord(axis, step).toUpperCase(), { 'data-step': String(step), title: step === 0 ? 'as her style' : mannerWord(axis, step) }, A, live, on('manner'),
        () => { if (stored !== step || manner === undefined) ctx.onSet({ manner: { [axis]: step } }); }, stored === step);
      if (now !== undefined && now !== stored && now === step) { b.setAttribute('data-since-joining', 'true'); b.classList.add('alius-since-joining-step'); }
      return b;
    });
    host.append(h('div', { class: 'alius-dyn-row alius-dyn-manner', 'data-manner-axis': axis },
      h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, `${words.label} (${words.low} … ${words.high}):`),
      ...buttons,
      ...(now !== undefined && now !== stored ? [h('span', { class: 'alius-chip alius-since-joining', ...analyzeNative('glossary:character_development', live), tabindex: '0' }, 'SINCE JOINING')] : []),
      ...(i === 0 ? [lock('manner', 'glossary:manner_intensity')] : [])));
  });

  // what draws her: one or two, the main one first (a third replaces the second)
  const drawn = practice.drawnBy ?? [];
  host.append(h('div', { class: 'alius-dyn-row', 'data-practice-field': 'drawnBy' },
    h('span', { class: 'alius-stat', 'data-analyze': 'glossary:drawn_by', tabindex: '0' }, 'Drawn by:'),
    ...DRAWN_BY.map((d) => control(word(d), { 'data-drawn-by': d, ...(drawn.indexOf(d) >= 0 ? { 'data-rank': String(drawn.indexOf(d) + 1) } : {}) }, 'glossary:drawn_by', live, on('drawnBy'), () => {
      const next = drawn.includes(d) ? drawn.filter((x) => x !== d) : drawn.length < TUNING.manner.text.drawnByMax ? [...drawn, d] : [drawn[0], d];
      ctx.onSet({ drawnBy: next.length > 0 ? next : null });
    }, drawn.includes(d))),
    lock('drawnBy', 'glossary:drawn_by')));

  // her quirks: the ones she has, then an empty one while there is room
  const quirks = practice.quirks ?? [];
  const setQuirks = (next: Quirk[]): void => ctx.onSet({ quirks: next.length > 0 ? next : null });
  const quirkRow = (q: Quirk | undefined, index: number | 'new'): HTMLElement => {
    const enabled = on('quirks');
    const when = h('select', { class: 'alius-input alius-option', 'aria-label': 'When it shows', 'data-quirk-when': '', 'aria-disabled': enabled ? null : 'true', ...analyzeNative('glossary:quirks', live) },
      ...QUIRK_WHEN.map((w) => option(w, QUIRK_LABEL[w]))) as HTMLSelectElement;
    when.value = q?.when ?? 'switch';
    const text = h('input', { type: 'text', class: 'alius-input alius-option', 'aria-label': 'Her quirk', 'data-quirk-text': '', maxlength: String(TUNING.manner.text.quirkMax), 'aria-disabled': enabled ? null : 'true', value: q?.text ?? '', ...analyzeNative('glossary:quirks', live) }) as HTMLInputElement;
    const commit = (): void => {
      const w = when.value as Quirk['when'];
      const t = text.value.trim();
      when.value = q?.when ?? 'switch';
      text.value = q?.text ?? '';
      if (!enabled) return;
      if (index === 'new') { if (t !== '') setQuirks([...quirks, { when: w, text: t }]); return; }
      if (t === '') return setQuirks(quirks.filter((_, j) => j !== index));
      if (t !== q!.text || w !== q!.when) setQuirks(quirks.map((x, j) => (j === index ? { when: w, text: t } : x)));
    };
    if (index !== 'new') when.addEventListener('change', commit);
    text.addEventListener('change', commit);
    return h('div', { class: 'alius-dyn-row', 'data-quirk': String(index) },
      h('span', { class: 'alius-stat', 'data-analyze': 'glossary:quirks', tabindex: '0' }, index === 'new' ? 'New quirk:' : 'Quirk:'),
      when, text,
      ...(index !== 'new' ? [control('[ REMOVE ]', { 'data-remove-quirk': '' }, 'glossary:quirks', live, enabled, () => setQuirks(quirks.filter((_, j) => j !== index)))] : []),
      ...(index === 0 || (index === 'new' && quirks.length === 0) ? [lock('quirks', 'glossary:quirks')] : []));
  };
  quirks.forEach((q, i) => host.append(quirkRow(q, i)));
  if (quirks.length < TUNING.manner.text.quirksMax) host.append(quirkRow(undefined, 'new'));

  // her everyday face, and how far the two are apart
  const everydayOn = on('everyday');
  const everyday = h('input', { type: 'text', class: 'alius-input alius-option', 'aria-label': 'How she is outside the dynamic', 'data-everyday': '', maxlength: String(TUNING.manner.text.everydayMax), 'aria-disabled': everydayOn ? null : 'true', value: practice.everyday ?? '', ...analyzeNative('glossary:face_everyday', live) }) as HTMLInputElement;
  everyday.addEventListener('change', () => {
    const v = everyday.value.trim();
    everyday.value = practice.everyday ?? '';
    if (everydayOn && v !== (practice.everyday ?? '')) ctx.onSet({ everyday: v === '' ? null : v });
  });
  host.append(h('div', { class: 'alius-dyn-row', 'data-face': 'everyday' },
    h('span', { class: 'alius-stat', 'data-analyze': 'glossary:face_everyday', tabindex: '0' }, 'EVERYDAY:'), everyday, lock('everyday', 'glossary:face_everyday')));
  if (practice.contrast !== undefined) {
    host.append(h('div', { class: 'alius-dyn-row', 'data-practice-field': 'contrast' },
      h('span', { class: 'alius-stat', 'data-analyze': 'glossary:contrast', tabindex: '0' }, 'Contrast:'),
      h('span', { class: 'alius-chip', 'data-contrast': practice.contrast, ...analyzeNative('glossary:contrast', live), tabindex: '0' }, word(practice.contrast))));
  }
}

// --- expectations

/** A moment source she may have an expectation about, and the answers the moment offers. */
export interface ExpectationSource { id: string; label: string; types: string[] }

export interface ExpectationsBlockCtx {
  unit: DynamicBlockUnit;
  expectations?: ExpectationProfile;
  /** The worship targets this campaign allows (worship, body and scent rows are drawn for these only). */
  targets: Array<{ id: string; label: string }>;
  /** The moment sources this campaign allows. */
  sources: ExpectationSource[];
  /** A top-level field, `worship.<targetId>` or `moments.<sourceId>`; a lock on a whole field covers every id under it. */
  locks: ReadonlyArray<string>;
  editable: boolean;
  /** A patch of `profile/set_expectation`: `worship` and `moments` per id (`null` removes one), every other field replaced (`null` removes it). */
  onSet: (patch: Record<string, unknown>) => void;
  onLock: (field: string, on: boolean) => void;
}

const STRENGTHS = [1, 2, 3] as const;
const OFFSET_STEPS = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];
const BUILD_STEPS = [0, 0.5, 1];

/** A select that shows what is stored and puts it back when the control is not live. */
function valueSelect(label: string, attrs: Record<string, string>, address: string, ctx: Record<string, unknown>, enabled: boolean, current: string, options: HTMLElement[], onPick: (v: string) => void): HTMLSelectElement {
  const el = h('select', { class: 'alius-input alius-option', 'aria-label': label, 'aria-disabled': enabled ? null : 'true', ...attrs, ...analyzeNative(address, ctx) }, ...options) as HTMLSelectElement;
  el.value = current;
  el.addEventListener('change', () => {
    const value = el.value;
    el.value = current;
    if (enabled && value !== current) onPick(value);
  });
  return el;
}

export function renderExpectationsBlock(host: HTMLElement, ctx: ExpectationsBlockCtx): void {
  const live = { unitId: ctx.unit.id };
  const e = ctx.expectations ?? {};
  const locked = (field: string): boolean => ctx.locks.includes(field) || ctx.locks.includes(field.split('.')[0]);
  const lock = (field: string, address: string): HTMLElement => control(locked(field) ? '[ LOCKED ]' : '[ LOCK ]', { 'data-lock': field }, address, live, ctx.editable, () => ctx.onLock(field, !locked(field)), locked(field));
  const live1 = (field: string): boolean => ctx.editable && !locked(field);
  const A = 'glossary:expectation_profile';
  host.replaceChildren(h('p', { class: 'alius-stat', ...analyzeNative(A, live), tabindex: '0' }, 'EXPECTATIONS'));

  // how far she holds
  host.append(h('div', { class: 'alius-dyn-row', 'data-holds-until': '' },
    h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, 'Holds until:'),
    ...HOLDS_UNTIL.map((v) => control(word(v), { 'data-id': v }, A, live, live1('holdsUntil'), () => { if (e.holdsUntil !== v) ctx.onSet({ holdsUntil: v }); }, e.holdsUntil === v)),
    lock('holdsUntil', A)));

  // what she wants to see, per allowed target
  for (const t of ctx.targets) {
    const w = e.worship?.[t.id];
    const field = `worship.${t.id}`;
    host.append(h('div', { class: 'alius-dyn-row', 'data-worship': t.id },
      h('span', { class: 'alius-chip', ...analyzeNative(`worshipTargets:${t.id}`), tabindex: '0' }, t.label),
      ...ATTITUDES.map((a) => control(word(a), { 'data-attitude': a }, A, live, live1(field),
        () => ctx.onSet({ worship: { [t.id]: w?.attitude === a ? null : { ...w, attitude: a } } }), w?.attitude === a)),
      w === undefined ? null : valueSelect('What it means to her', { 'data-meaning': t.id }, A, live, live1(field), w.meaning ?? '',
        [option('', '(meaning)'), ...MEANINGS.map((m) => option(m, title(m)))], (v) => ctx.onSet({ worship: { [t.id]: { ...w, meaning: v } } })),
      h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, 'Body:'),
      ...BODY_FEELINGS.map((f) => control(word(f), { 'data-body': f }, A, live, live1('body'), () => ctx.onSet({ body: { ...e.body, [t.id]: f } }), e.body?.[t.id] === f)),
      valueSelect('Scent', { 'data-scent': t.id }, A, live, live1('scent'), String(e.scent?.base?.[t.id] ?? ''),
        [option('', '(scent)'), ...[1, 2, 3, 4, 5].map((n) => option(String(n), String(n)))], (v) => ctx.onSet({ scent: { ...e.scent, base: { ...e.scent?.base, [t.id]: Number(v) } } })),
      lock(field, A)));
  }

  // the answers she expects at a moment: the ones set are rows, the rest come from the picker
  const sourceOf = (id: string): ExpectationSource | undefined => ctx.sources.find((s) => s.id === id);
  for (const [id, m] of Object.entries(e.moments ?? {})) {
    const src = sourceOf(id);
    if (src === undefined) continue; // a source this campaign does not allow is not drawn (nothing is rewritten)
    const field = `moments.${id}`;
    host.append(h('div', { class: 'alius-dyn-row', 'data-moment': id },
      h('span', { class: 'alius-chip', ...analyzeNative(`momentSources:${id}`), tabindex: '0' }, src.label),
      ...src.types.map((type) => control(word(type), { 'data-type': type }, A, live, live1(field), () => { if (m.type !== type) ctx.onSet({ moments: { [id]: { ...m, type } } }); }, m.type === type)),
      ...STRENGTHS.map((n) => control(String(n), { 'data-strength': String(n) }, A, live, live1(field), () => { if (m.strength !== n) ctx.onSet({ moments: { [id]: { ...m, strength: n } } }); }, m.strength === n)),
      control('[ REMOVE ]', { 'data-remove-moment': id }, A, live, live1(field), () => ctx.onSet({ moments: { [id]: null } })),
      lock(field, A)));
  }
  const addable = ctx.sources.filter((s) => e.moments?.[s.id] === undefined);
  host.append(h('div', { class: 'alius-dyn-row', 'data-add': 'moment' },
    valueSelect('Add a moment', { 'data-add-moment': ctx.unit.id }, A, live, ctx.editable && addable.length > 0 && !locked('moments'), '',
      [option('', '(add a moment)'), ...addable.map((s) => option(s.id, s.label))],
      (id) => ctx.onSet({ moments: { [id]: { type: sourceOf(id)?.types[0] ?? 'yielded', strength: 2 } } }))));

  // tells, offset, build, hair, scent, traits
  for (const k of ['irritation', 'pleasure'] as const) {
    const input = h('input', { type: 'text', class: 'alius-input alius-option', 'aria-label': `How her ${k} shows`, 'aria-disabled': live1('tells') ? null : 'true', maxlength: String(TUNING.dynamic.profile.tellMax), 'data-tell': k, value: e.tells?.[k] ?? '', ...analyzeNative(A, live) }) as HTMLInputElement;
    input.addEventListener('change', () => {
      const v = input.value;
      input.value = e.tells?.[k] ?? '';
      if (live1('tells') && v !== (e.tells?.[k] ?? '')) ctx.onSet({ tells: { ...e.tells, [k]: v } });
    });
    host.append(h('div', { class: 'alius-dyn-row', 'data-tells': k }, h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, `${title(k)} shows as:`), input, ...(k === 'pleasure' ? [lock('tells', A)] : [])));
  }
  host.append(h('div', { class: 'alius-dyn-row', 'data-offset': '' },
    h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, 'Wants the commander:'),
    ...(['r', 'f'] as const).map((axis) => valueSelect(axis === 'r' ? 'More yielding or less' : 'Smoother or more provoking', { 'data-offset-axis': axis }, A, live, live1('offset'), String(e.offset?.[axis] ?? 0),
      OFFSET_STEPS.map((n) => option(String(n), n > 0 ? `+${n}` : String(n))), (v) => ctx.onSet({ offset: { r: e.offset?.r ?? 0, f: e.offset?.f ?? 0, [axis]: Number(v) } }))),
    lock('offset', A)));
  host.append(h('div', { class: 'alius-dyn-row', 'data-build': '' },
    h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, 'Build:'),
    ...(['slim', 'athletic', 'curvy'] as const).map((k) => valueSelect(title(k), { 'data-build-weight': k }, A, live, live1('build'), String(e.build?.[k] ?? 0),
      BUILD_STEPS.map((n) => option(String(n), `${title(k)} ${n}`)), (v) => ctx.onSet({ build: { slim: e.build?.slim ?? 0, athletic: e.build?.athletic ?? 0, curvy: e.build?.curvy ?? 0, [k]: Number(v) } }))),
    lock('build', A)));
  host.append(h('div', { class: 'alius-dyn-row', 'data-hair': '' },
    h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, 'Hair:'),
    ...HAIR.map((v) => control(word(v), { 'data-id': v }, A, live, live1('hair'), () => { if (e.hair !== v) ctx.onSet({ hair: v }); }, e.hair === v)),
    lock('hair', A)));
  host.append(h('div', { class: 'alius-dyn-row', 'data-hygiene': '' },
    h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, 'Hygiene:'),
    ...HYGIENE.map((v) => control(word(v), { 'data-id': v }, A, live, live1('scent'), () => { if (e.scent?.hygiene !== v) ctx.onSet({ scent: { ...e.scent, hygiene: v } }); }, e.scent?.hygiene === v)),
    lock('scent', A)));
  const traits = h('input', { type: 'text', class: 'alius-input alius-option', 'aria-label': 'Traits, separated by commas', 'aria-disabled': live1('traits') ? null : 'true', 'data-traits': '', value: (e.traits ?? []).join(', '), ...analyzeNative(A, live) }) as HTMLInputElement;
  traits.addEventListener('change', () => {
    const v = traits.value;
    traits.value = (e.traits ?? []).join(', ');
    if (live1('traits')) ctx.onSet({ traits: v.split(',').map((x) => x.trim()).filter((x) => x !== '') });
  });
  host.append(h('div', { class: 'alius-dyn-row', 'data-traits-row': '' }, h('span', { class: 'alius-stat', 'data-analyze': A, tabindex: '0' }, 'Traits:'), traits, lock('traits', A)));
}
