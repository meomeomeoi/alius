/**
 * The body map (P15, plan R20, spec §15.9): a corporate medical schematic of her, front and back, with a zone for each worship target the campaign allows. Ported from the
 * draft generators `docs/drafts/bodymap/gen.js` and `builds.js` as pure functions: a Catmull-Rom outline through the points of the right half of one base silhouette, scaled
 * by a width curve for each of three builds (`slim`, `athletic`, `curvy`: a blend is the weighted mean of the curves) and four hair variants. A zone is a grey "?" until a fact
 * has shown the commander what she thinks of it, then it takes the colour of her attitude; it carries the mastery dots, rings for the scent she has now, and the icon of what it means
 * to her. Hovering or focusing a zone opens its analysis (`worshipTargets:<id>`, with her as the context). Below the figures a list names each zone once with its notes (the facts
 * that showed it); readable mode draws only the list.
 *
 * What is drawn is what the commander has been shown: an attitude, a meaning and a note only from a fact the commander has (`Knowledge`), and the xp of mastery never (the level, as dots).
 * Colours are CSS (`css/19-dynamic.css`, palette variables) and every state is also a word in the list, so nothing is shown by colour alone. The SVG holds geometry, classes and glyphs; it
 * loads nothing (no `url(`, no image, no network) and does not animate.
 */
import type { Knowledge } from '../../analysis/knowledge';
import type { Registries } from '../../content/types';
import { contentAllowed } from '../../engine/bonds/content';
import { type Attitude, expectationsOf, type Meaning } from '../../engine/dynamic/expectations';
import { masteryLevel } from '../../engine/dynamic/mastery';
import { zoneFacts } from '../../engine/dynamic/zones';
import { BAND_INDEX, scentBand } from '../../engine/physics/scent';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { svgEl } from '../hub/plan/svg';

type Pt = [number, number];
export type Side = 'front' | 'back';
/** The weights of the three builds; only their proportions count. */
export interface Build { slim: number; athletic: number; curvy: number }
export type HairKind = 'short' | 'bob' | 'long' | 'tail';

// ---------------------------------------------------------------------------------------------
// Geometry (the draft's coordinates: x across from the middle, y down from the top of the head, about 500 tall)

const f1 = (n: number): string => n.toFixed(1);

/** A Catmull-Rom spline through `pts` as a cubic Bezier path (tension 0.5), closed or open. The draft's `cr`. */
function catmull(pts: Pt[], closed: boolean): string {
  const n = pts.length;
  const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

/** The right half of the body from the neck down to the crotch. */
const RIGHT: readonly Pt[] = [[9, 60], [10, 80], [16, 92], [30, 96], [40, 100], [45, 114], [45, 132], [47, 150], [43, 170], [34, 192], [31, 208], [36, 228], [47, 250], [50, 272], [47, 300], [42, 335], [37, 370], [34, 392], [36, 420], [33, 448], [24, 470], [26, 484], [22, 494], [12, 495], [9, 484], [10, 468], [11, 440], [10, 410], [11, 388], [9, 360], [6, 325], [3, 300], [0, 292]];
/** The right arm (mirrored for the left). */
const ARM: readonly Pt[] = [[34, 97], [48, 100], [57, 108], [61, 128], [62, 165], [63, 200], [66, 240], [69, 272], [73, 292], [72, 310], [66, 322], [60, 318], [58, 300], [57, 276], [54, 245], [51, 208], [49, 172], [46, 145], [40, 124], [36, 108]];

/** Piecewise-linear value of a curve of `[y, factor]` keys at `y`. */
function lerp(keys: ReadonlyArray<readonly [number, number]>, y: number): number {
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, m] = keys[i];
    const [b, n] = keys[i + 1];
    if (y <= b) return m + (n - m) * Math.max(0, (y - a) / (b - a));
  }
  return keys[keys.length - 1][1];
}

interface BuildCurve { w: ReadonlyArray<readonly [number, number]>; arm: number; armOut: ReadonlyArray<readonly [number, number]>; lines: readonly string[] }
const BUILDS: Readonly<Record<keyof Build, BuildCurve>> = {
  slim: { w: [[0, 1], [500, 1]], arm: 1, armOut: [[0, 1], [500, 1]], lines: [] },
  athletic: {
    w: [[60, 1], [92, 1.05], [104, 1.13], [130, 1.1], [150, 1.0], [205, 1.07], [250, 1.0], [300, 1.06], [340, 1.07], [392, 1.0], [420, 1.1], [470, 1.05], [500, 1]],
    arm: 1.25, armOut: [[90, 1.1], [200, 1.08], [320, 1.06]],
    lines: ['M-9,180 v10 M9,180 v10 M-9,198 v10 M9,198 v10 M-9,216 v8 M9,216 v8', 'M0,172 V236', 'M-46,104 C-56,112 -58,124 -55,134 M46,104 C56,112 58,124 55,134', 'M-30,300 C-28,320 -26,336 -24,350 M30,300 C28,320 26,336 24,350'],
  },
  curvy: {
    w: [[60, 1], [104, 1.02], [132, 1.08], [150, 1.18], [172, 1.12], [208, 1.05], [250, 1.2], [272, 1.22], [300, 1.2], [340, 1.15], [392, 1.06], [420, 1.08], [470, 1.05], [500, 1]],
    arm: 1.15, armOut: [[90, 1.03], [200, 1.05], [250, 1.12], [320, 1.12]],
    lines: ['M-26,236 C-14,244 14,244 26,236'],
  },
};
const BUILD_KEYS = ['slim', 'athletic', 'curvy'] as const;

/** The weights as shares of 1; a build with no (or no usable) weight reads as slim. */
function shares(build: Build): Record<keyof Build, number> {
  const w = BUILD_KEYS.map((k) => (Number.isFinite(build[k]) && build[k] > 0 ? build[k] : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  return sum > 0 ? { slim: w[0] / sum, athletic: w[1] / sum, curvy: w[2] / sum } : { slim: 1, athletic: 0, curvy: 0 };
}

/** The blended width factor of the body at `y`, the blended arm thickness and the blended outward push of the arms at `y`. */
function blend(build: Build): { width: (y: number) => number; arm: number; armOut: (y: number) => number } {
  const s = shares(build);
  const sum = (f: (c: BuildCurve) => number): number => BUILD_KEYS.reduce((acc, k) => acc + s[k] * f(BUILDS[k]), 0);
  return { width: (y) => sum((c) => lerp(c.w, y)), arm: sum((c) => c.arm), armOut: (y) => sum((c) => lerp(c.armOut, y)) };
}

/** Where the arms hang by `y` (the draft's `armCenter`). */
const armCenter = (y: number): number => lerp([[100, 44], [200, 57], [300, 65], [320, 64]], y);

/**
 * The silhouette of the body (torso, hips and legs) for a build: the right half scaled by the blended width curve and mirrored. The same for both sides; `side` is kept so that
 * a later back-only detail has a place. Pure: the same build gives the same path.
 */
export function outlinePath(build: Build, _side: Side): string {
  const { width } = blend(build);
  const right: Pt[] = RIGHT.map(([x, y]) => [x * width(y), y]);
  const left: Pt[] = right.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
  return catmull([...right, ...left], true);
}

/** The two arms of a build, right then left. */
export function armPaths(build: Build): [string, string] {
  const { arm, armOut } = blend(build);
  const one = (sign: 1 | -1): string => catmull(ARM.map(([x, y]) => [(armCenter(y) + (x - armCenter(y)) * arm) * armOut(y) * sign, y] as Pt), true);
  return [one(1), one(-1)];
}

/** The head: an ellipse as a path. */
export const HEAD_PATH = 'M-22,38 a22,29 0 1,0 44,0 a22,29 0 1,0 -44,0Z';

const HAIR_CAP: Pt[] = [[-24, 38], [-25, 18], [-14, 6], [0, 3], [14, 6], [25, 18], [24, 38], [16, 22], [0, 16], [-16, 22]];
const HAIR: Readonly<Record<HairKind, Pt[]>> = {
  short: HAIR_CAP,
  bob: [[-24, 40], [-25, 18], [-14, 6], [0, 3], [14, 6], [25, 18], [24, 40], [26, 56], [20, 61], [-20, 61], [-26, 56]],
  long: [[-24, 40], [-25, 18], [-14, 6], [0, 3], [14, 6], [25, 18], [24, 40], [26, 62], [20, 76], [-20, 76], [-26, 62]],
  tail: HAIR_CAP,
};
/** A tail hangs down the back; seen from the front only a tuft shows at the side of the head. */
const TAIL_BACK: Pt[] = [[-6, 24], [-9, 50], [-6, 92], [0, 128], [6, 92], [9, 50], [6, 24]];
const TAIL_FRONT: Pt[] = [[22, 24], [32, 34], [34, 56], [28, 66], [24, 48]];
const FRINGE: Pt[] = [[-22, 30], [-20, 14], [-8, 8], [4, 9], [16, 13], [22, 26], [12, 20], [0, 19], [-12, 22]];

/** The hair of a variant: from the front, what is seen behind the head; from the back, what covers it. */
export function hairPath(hair: HairKind, side: Side): string {
  const base = catmull(HAIR[hair], true);
  if (hair !== 'tail') return base;
  return `${base} ${catmull(side === 'back' ? TAIL_BACK : TAIL_FRONT, true)}`;
}
const fringePath = (): string => catmull(FRINGE, true);

/** The lines drawn on the body (the draft's details), with the build's own lines when it weighs at least a third. */
function detailPaths(build: Build, side: Side): string[] {
  const { width } = blend(build);
  const bw = width(150);
  const out = side === 'back'
    ? ['M0,96 C1,140 -1,190 0,232', 'M-30,118 C-24,132 -14,138 -8,136 M30,118 C24,132 14,138 8,136', 'M-30,268 C-18,286 -6,284 0,272 C6,284 18,286 30,268', 'M-24,40 C-22,60 -16,72 -12,76 M24,40 C22,60 16,72 12,76']
    : [
      'M-30,100 C-18,106 -8,104 -3,101 M30,100 C18,106 8,104 3,101',
      `M${f1(-38 * bw)},150 C${f1(-30 * bw)},${f1(166 + (bw - 1) * 20)} ${f1(-14 * bw)},${f1(166 + (bw - 1) * 20)} -6,152 M${f1(38 * bw)},150 C${f1(30 * bw)},${f1(166 + (bw - 1) * 20)} ${f1(14 * bw)},${f1(166 + (bw - 1) * 20)} 6,152`,
      `M${f1(-30 * width(250))},250 C-20,262 -12,270 -6,276 M${f1(30 * width(250))},250 C20,262 12,270 6,276`,
      'M-22,388 q4,6 8,0 M22,388 q-4,6 -8,0',
    ];
  const s = shares(build);
  for (const k of BUILD_KEYS) if (s[k] >= 1 / 3) out.push(...BUILDS[k].lines);
  return out;
}

// ---------------------------------------------------------------------------------------------
// What the map shows

export interface BodyMapZone {
  targetId: string;
  label: string;
  side: Side;
  /** The registry's coordinates, 0 to 100 across and down. */
  x: number;
  y: number;
  r: number;
  /** A fact the commander has shows what she thinks of it. */
  known: boolean;
  attitude?: Attitude;
  meaning?: Meaning;
  /** The level of the commander's mastery of this target with her, 0 to 5 (never the xp). */
  mastery: number;
  /** The scent band she has now at this part, 0 (faint) to 3 (overwhelming). */
  scent?: number;
  /** What showed it: the facts the commander has about this zone, as plain text. */
  sources: string[];
  explicit?: true;
}

export interface BodyMapCtx {
  unitId: string;
  zones: BodyMapZone[];
  build: Build;
  hair: HairKind;
  /** Readable mode draws only the list. */
  readable: boolean;
}

/** The text of a fact as a note (the placeholder mark of authored texts is not part of it). */
const plain = (text: string): string => text.replace(/^\s*AUTHOR TO WRITE:\s*/, '').trim();

/**
 * The zones of the map for her: every worship target the campaign allows (the category on and none of her own limits; the explicit ones only with `explicit_scenes`), once for each side it
 * has a place on. A zone is `known` only when a fact the commander has (`Knowledge`) shows it; then it carries her attitude and the meaning she gives it, and the facts as its sources. Mastery is the level, the scent
 * the band now. Reads only; draws nothing.
 */
export function bodyMapZones(state: CampaignState, reg: Registries, knowledge: Knowledge, unitId: string): BodyMapZone[] {
  const profile = expectationsOf(state, reg, unitId);
  const facts = knowledge.facts();
  const out: BodyMapZone[] = [];
  for (const t of reg.worshipTargets.values()) {
    if (!contentAllowed(state, reg, t, unitId)) continue;
    const shown = zoneFacts(facts, unitId, t.id);
    const entry = profile.worship?.[t.id];
    const explicit = Array.isArray(t.contentTags) && (t.contentTags as unknown[]).includes('explicit_scenes');
    const zone = t.zone as Partial<Record<Side, { x: number; y: number; r: number }>>;
    for (const side of ['front', 'back'] as const) {
      const at = zone[side];
      if (at === undefined) continue;
      out.push({
        targetId: t.id, label: String(t.label), side, x: at.x, y: at.y, r: at.r, known: shown.length > 0,
        ...(shown.length > 0 ? { attitude: entry?.attitude ?? 'indifferent', ...(entry?.meaning !== undefined ? { meaning: entry.meaning } : {}) } : {}),
        mastery: masteryLevel(state, unitId, t.id), scent: BAND_INDEX[scentBand(state, reg, unitId, t.id)], sources: shown.map((f) => plain(f.text)),
        ...(explicit ? { explicit: true as const } : {}),
      });
    }
  }
  return out;
}

/** The whole input of the map for her: her zones, her build and hair (what the commander sees of her; slim and long when her card says nothing). */
export function bodyMapFor(state: CampaignState, reg: Registries, knowledge: Knowledge, unitId: string, readable: boolean): BodyMapCtx {
  const profile = expectationsOf(state, reg, unitId);
  return { unitId, zones: bodyMapZones(state, reg, knowledge, unitId), build: profile.build ?? { slim: 1, athletic: 0, curvy: 0 }, hair: profile.hair ?? 'long', readable };
}

// ---------------------------------------------------------------------------------------------
// Drawing

const ATTITUDE_WORD: Readonly<Record<Attitude, string>> = { craves: 'CRAVES', enjoys: 'ENJOYS', indifferent: 'INDIFFERENT', dislikes: 'DISLIKES' };
const MEANING_ICON: Readonly<Record<Meaning, string>> = { reward: '★', duty: '■', humiliation: '▼', intimacy: '♥', play: '✦', comfort: '☾' };
const SCENT_WORD = ['FAINT', 'NOTICEABLE', 'STRONG', 'OVERWHELMING'] as const;
const LEVEL_WORD = ['no', 'one', 'two', 'three', 'four', 'five'] as const;
const MAX_LEVEL = 5;

const dotsOf = (n: number): string => Array.from({ length: MAX_LEVEL }, (_, i) => (i < n ? '●' : '○')).join('');
const stateOf = (z: Pick<BodyMapZone, 'known' | 'attitude'>): string => (z.known && z.attitude !== undefined ? z.attitude : 'unknown');
const wordOf = (z: BodyMapZone): string => (z.known && z.attitude !== undefined ? ATTITUDE_WORD[z.attitude] : 'NOT YET KNOWN');

/** The figure of one side: shapes, hair, lines, then the zones on it. Coordinates are the draft's; the zone's registry coordinates are mapped onto them. */
function figure(ctx: BodyMapCtx, side: Side, cx: number, oy: number): SVGElement {
  const g = svgEl('g', { class: 'alius-bm-figure', 'data-side': side, transform: `translate(${cx},${oy})` });
  const shapes = svgEl('g', { class: 'alius-bm-outline' });
  for (const d of [outlinePath(ctx.build, side), ...armPaths(ctx.build), HEAD_PATH]) shapes.append(svgEl('path', { d }));
  const hair = svgEl('path', { d: hairPath(ctx.hair, side), class: 'alius-bm-hair' });
  if (side === 'front') g.append(hair, shapes, svgEl('path', { d: fringePath(), class: 'alius-bm-hair' }));
  else g.append(shapes, hair);
  for (const d of detailPaths(ctx.build, side)) g.append(svgEl('path', { d, class: 'alius-bm-ln' }));
  for (const z of ctx.zones.filter((zone) => zone.side === side)) g.append(zoneEl(ctx, z));
  return g;
}

/** One zone of the map: a ring, "?" until shown, the scent as rings inside, the meaning's icon, the mastery dots. */
function zoneEl(ctx: BodyMapCtx, z: BodyMapZone): SVGElement {
  const X = (z.x - 50) * 2.5;
  const Y = z.y * 5;
  const R = Math.max(6, z.r * 2);
  const word = z.known && z.attitude !== undefined ? z.attitude : 'not known yet';
  const g = svgEl('g', {
    class: `alius-bm-zone is-${stateOf(z)}`, 'data-target': z.targetId, 'data-side': z.side, 'data-known': String(z.known), 'data-analyze': `worshipTargets:${z.targetId}`,
    'data-analyze-ctx': JSON.stringify({ unitId: ctx.unitId }), tabindex: '0', role: 'img', 'aria-label': `${z.label}: ${word}`,
    ...(z.known && z.attitude !== undefined ? { 'data-attitude': z.attitude } : {}),
  });
  g.append(svgEl('circle', { cx: X, cy: Y, r: R, class: 'alius-bm-ring' }));
  const rings = z.scent !== undefined ? z.scent : 0;
  for (let i = 1; i <= rings; i++) g.append(svgEl('circle', { cx: X, cy: Y, r: (R * i) / (rings + 1), class: 'alius-bm-scent' }));
  const mark = (cls: string, x: number, y: number, text: string): void => {
    const t = svgEl('text', { x, y, class: cls, 'text-anchor': 'middle' });
    t.textContent = text;
    g.append(t);
  };
  if (!z.known) mark('alius-bm-q', X, Y + 4, '?');
  else if (z.meaning !== undefined) mark('alius-bm-meaning', X, Y + 4, MEANING_ICON[z.meaning]);
  if (z.explicit === true) mark('alius-bm-explicit', X - R, Y - R + 4, '◇');
  if (z.mastery > 0) mark('alius-bm-dots', X, Y + R + 9, dotsOf(z.mastery));
  return g;
}

/** One line of the list for a target: its label, what the commander knows, the dots, the meaning and the scent in words, and the notes that showed it. */
function row(ctx: BodyMapCtx, z: BodyMapZone, label: string): HTMLElement {
  const dots = z.mastery > 0 ? h('span', { class: 'alius-bm-dots', 'aria-label': `Mastery: ${LEVEL_WORD[Math.min(MAX_LEVEL, z.mastery)]} of five` }, dotsOf(z.mastery)) : null;
  const scent = z.scent !== undefined && z.scent >= 1 ? h('span', { class: 'alius-bm-scent-word' }, `SCENT: ${SCENT_WORD[Math.min(3, z.scent)]}`) : null;
  return h('li', { class: `alius-bm-row is-${stateOf(z)}`, 'data-target': z.targetId, ...analyzeAttrs(`worshipTargets:${z.targetId}`, { unitId: ctx.unitId }) },
    h('span', { class: 'alius-bm-label' }, label, z.explicit === true ? h('span', { class: 'alius-bm-explicit', 'aria-label': 'explicit' }, ' ◇') : null),
    ' ', h('span', { class: 'alius-bm-state' }, wordOf(z)),
    z.known && z.meaning !== undefined ? h('span', { class: 'alius-bm-meaning-word' }, ` ${z.meaning}`) : null,
    dots ? h('span', {}, ' ', dots) : null, scent ? h('span', {}, ' ', scent) : null,
    ...z.sources.map((note) => h('p', { class: 'alius-bm-note' }, note)));
}

/**
 * Draws the map into `host` (replacing what it held): the two figures with their zones, a one-line caption of the marks, and below them the list, one line for each target.
 * Readable mode draws the list alone. With no zone (the worship category off, or closed by her limits) it says so. No number, no id and no pronoun for the commander reach the text.
 */
export function renderBodyMap(host: HTMLElement, ctx: BodyMapCtx): void {
  const seen = new Set<string>();
  const rows: HTMLElement[] = [];
  for (const z of ctx.zones) {
    if (seen.has(z.targetId)) continue;
    seen.add(z.targetId);
    const both = ctx.zones.filter((o) => o.targetId === z.targetId);
    // a target on both sides is one line: what one side shows the other does (the facts and the dots are the target's)
    rows.push(row(ctx, both.find((o) => o.known) ?? z, z.label));
  }
  const list = h('ul', { class: 'alius-bm-list', role: 'list', 'aria-label': 'Somatic response map, by zone' }, ...rows);
  if (ctx.zones.length === 0) {
    host.replaceChildren(h('div', { class: 'alius-bodymap', ...analyzeAttrs('glossary:body_map', { unitId: ctx.unitId }) }, h('p', { class: 'alius-dim alius-bm-empty' }, 'Nothing is on the form.')));
    return;
  }
  if (ctx.readable) {
    host.replaceChildren(h('div', { class: 'alius-bodymap is-readable', ...analyzeAttrs('glossary:body_map', { unitId: ctx.unitId }) }, list));
    return;
  }
  const svg = svgEl('svg', { class: 'alius-bm-svg', viewBox: '0 0 440 520', role: 'group', 'aria-label': 'Somatic response map, front and back' });
  svg.append(figure(ctx, 'front', 110, 10), figure(ctx, 'back', 330, 10));
  host.replaceChildren(h('div', { class: 'alius-bodymap', ...analyzeAttrs('glossary:body_map', { unitId: ctx.unitId }) },
    svg,
    h('p', { class: 'alius-dim alius-bm-caption' }, '? not known yet · dots: mastery · rings: scent now · ◇ explicit'),
    list));
}
