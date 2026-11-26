import type { Entry } from '../../content/types';
import { handFamily, handScale } from '../../engine/hand';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { UNIT_ACCENTS } from '../voice/voiceCard';
import type { StageSetup } from './load';

/**
 * P10e-f: her look on her page: how she stands (three sliders over a live view of her drawn with the stage's own classes), her face
 * point (a click on that view), her hand (every hand as a written sample at its measured size) and her accent (the palette or a colour
 * of the author's). It edits a draft `StageSetup` in place and calls `onChange` after each edit; nothing is saved here.
 */
export interface LookEditorOpts {
  /** Her sprite for the view (null: no sprite found, the view shows only its frame). */
  spriteUrl: string | null;
  name: string;
  /** The registry's hands, in registry order. */
  hands: Entry[];
  /** The campaign chose her hand itself (`unit.hand`): it wins over her card's in this campaign. */
  campaignHand?: string;
  onChange: () => void;
}

/** The ranges of the stand (`stageSetupSchema`). */
export const STAND_RANGE = { scale: { min: 0.5, max: 1.6, step: 0.01 }, x: { min: -0.5, max: 0.5, step: 0.01 }, y: { min: -0.5, max: 0.5, step: 0.01 } } as const;
const STAND_LABEL = { scale: 'Scale', x: 'Horizontal offset', y: 'Vertical offset' } as const;
const DEFAULT_STAND = { scale: 1, x: 0, y: 0 };
/** The size a hand sample is written at before her hand's factor (Caveat's 1). */
export const HAND_SAMPLE_PX = 26;
const SAMPLE_TEXT = 'Hold still. Wait for me.';

const round = (n: number): number => Math.round(n * 1000) / 1000;

export function renderLookEditor(host: HTMLElement, draft: StageSetup, opts: LookEditorOpts): void {
  // --- how she stands, and her face point
  const img = h('img', { class: 'alius-stage-figure-img', alt: opts.name, draggable: 'false' }) as HTMLImageElement;
  if (opts.spriteUrl !== null) img.src = opts.spriteUrl;
  const dot = h('span', { class: 'alius-stage-face-dot', 'aria-hidden': 'true' });
  // the figure carries the stage's own class: the stand's transform of `.alius-sprite.alius-has-stand .alius-sprite-img` is the scene's
  const figure = h('span', { class: 'alius-sprite-img alius-stage-figure', role: 'button', 'aria-label': 'Set her face point', ...analyzeAttrs('glossary:stage_face') }, img, dot);
  const sprite = h('div', { class: 'alius-sprite pos-center alius-has-stand' }, figure);
  const view = h('div', { class: 'alius-stage-look-view', 'data-sprite': opts.spriteUrl === null ? 'none' : 'found' }, sprite);

  const placeDot = (): void => {
    const f = draft.face;
    dot.hidden = f === undefined;
    if (f !== undefined) { dot.style.left = `${f.x * 100}%`; dot.style.top = `${f.y * 100}%`; }
  };
  const placeSprite = (): void => {
    const s = draft.stand ?? DEFAULT_STAND;
    sprite.style.setProperty('--alius-sprite-scale', String(s.scale));
    sprite.style.setProperty('--alius-sprite-dx', String(s.x));
    sprite.style.setProperty('--alius-sprite-dy', String(s.y));
  };
  figure.addEventListener('click', (e) => {
    const r = figure.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    draft.face = { x: round(clamp((e.clientX - r.left) / r.width)), y: round(clamp((e.clientY - r.top) / r.height)) };
    placeDot();
    opts.onChange();
  });

  const sliders = (['scale', 'x', 'y'] as const).map((key) => {
    const range = STAND_RANGE[key];
    const value = (draft.stand ?? DEFAULT_STAND)[key];
    const out = h('span', { class: 'alius-stage-value' }, String(value));
    const input = h('input', { type: 'range', name: `stand.${key}`, min: String(range.min), max: String(range.max), step: String(range.step), value: String(value) }) as HTMLInputElement;
    input.value = String(value);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      draft.stand = { ...(draft.stand ?? DEFAULT_STAND), [key]: round(Math.min(range.max, Math.max(range.min, n))) };
      out.textContent = String(draft.stand[key]);
      placeSprite();
      opts.onChange();
    });
    return h('label', { class: 'alius-field alius-option', ...analyzeNative('glossary:stage_stand') }, h('span', { class: 'alius-field-label' }, STAND_LABEL[key]), input, out);
  });
  placeSprite();
  placeDot();

  const stand = h(
    'section',
    { class: 'alius-stage-block alius-stage-stand' },
    h('h3', {}, 'How she stands'),
    h('p', { class: 'alius-dim' }, 'One set for every expression. A click on her face sets the point the slap\'s camera goes to.'),
    h('div', { class: 'alius-stage-stand-row' }, view, h('div', { class: 'alius-stage-sliders' }, ...sliders)),
  );

  // --- her hand
  const handButtons = opts.hands.map((entry) => {
    const b = h('button', { type: 'button', class: 'alius-btn alius-option alius-stage-hand', 'data-hand': entry.id, title: String(entry.name ?? entry.id), ...analyzeNative('glossary:stage_hand') }, SAMPLE_TEXT);
    b.style.fontFamily = `"${handFamily(entry)}", var(--alius-font-type)`;
    b.style.fontSize = `${Math.round(HAND_SAMPLE_PX * handScale(entry) * 100) / 100}px`;
    b.addEventListener('click', () => { draft.hand = entry.id; markHand(); opts.onChange(); });
    return b;
  });
  const handHash = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-hand': '', ...analyzeNative('glossary:stage_hand') }, '[ FROM THE HASH ]');
  handHash.addEventListener('click', () => { delete draft.hand; markHand(); opts.onChange(); });
  const markHand = (): void => {
    for (const b of [...handButtons, handHash]) b.setAttribute('aria-pressed', String((b.dataset.hand || undefined) === draft.hand));
  };
  markHand();
  const hand = h(
    'section',
    { class: 'alius-stage-block alius-stage-hands' },
    h('h3', {}, 'Her hand'),
    opts.campaignHand !== undefined ? h('p', { class: 'alius-dim' }, 'This campaign chose her hand itself; the hand set here is used by the campaigns that did not.') : null,
    h('div', { class: 'alius-stage-hand-grid' }, ...handButtons),
    handHash,
  );

  // --- her accent
  const swatches = UNIT_ACCENTS.map((c) => {
    const b = h('button', { type: 'button', class: 'alius-btn alius-option alius-stage-swatch', 'data-accent': c, 'aria-label': `Accent ${c}`, ...analyzeNative('glossary:stage_accent') });
    b.style.setProperty('--alius-stage-swatch', c);
    b.addEventListener('click', () => { draft.accent = c; markAccent(); opts.onChange(); });
    return b;
  });
  const picker = h('input', { type: 'color', name: 'accent', value: draft.accent ?? '#ffffff' }) as HTMLInputElement;
  picker.addEventListener('input', () => { draft.accent = picker.value.toLowerCase(); markAccent(); opts.onChange(); });
  const accentHash = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-accent': '', ...analyzeNative('glossary:stage_accent') }, '[ FROM THE HASH ]');
  accentHash.addEventListener('click', () => { delete draft.accent; markAccent(); opts.onChange(); });
  const markAccent = (): void => {
    for (const b of [...swatches, accentHash]) b.setAttribute('aria-pressed', String((b.dataset.accent || undefined) === draft.accent));
  };
  markAccent();
  const accent = h(
    'section',
    { class: 'alius-stage-block alius-stage-accent' },
    h('h3', {}, 'Her accent'),
    h('div', { class: 'alius-stage-swatches' }, ...swatches, h('label', { class: 'alius-field alius-option', ...analyzeNative('glossary:stage_accent') }, h('span', { class: 'alius-field-label' }, 'Own color'), picker), accentHash),
  );

  host.replaceChildren(stand, hand, accent);
}
