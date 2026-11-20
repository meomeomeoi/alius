/**
 * P10d: a tiny SVG builder. Elements are made with `createElementNS`, carry geometry and classes only (colours and
 * stroke widths are CSS, `css/15-hub.css`), and never hold text: every label on the plan is HTML.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

const fmt = (v: number | string): string => (typeof v === 'number' ? String(Math.round(v * 10) / 10) : v);

export function svgEl(tag: string, attrs: Record<string, number | string | undefined> = {}): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, fmt(v));
  return el;
}

/** Appends drawing primitives to one group. */
export class Pen {
  constructor(readonly g: SVGElement) {}

  static group(cls: string): Pen {
    return new Pen(svgEl('g', { class: cls }));
  }

  private add(el: SVGElement): SVGElement {
    this.g.append(el);
    return el;
  }

  rect(x: number, y: number, w: number, h: number, cls: string): SVGElement {
    return this.add(svgEl('rect', { x, y, width: Math.max(0, w), height: Math.max(0, h), class: cls }));
  }

  line(x1: number, y1: number, x2: number, y2: number, cls: string): SVGElement {
    return this.add(svgEl('line', { x1, y1, x2, y2, class: cls }));
  }

  circle(cx: number, cy: number, r: number, cls: string): SVGElement {
    return this.add(svgEl('circle', { cx, cy, r, class: cls }));
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, cls: string): SVGElement {
    return this.add(svgEl('ellipse', { cx, cy, rx, ry, class: cls }));
  }

  path(d: string, cls: string): SVGElement {
    return this.add(svgEl('path', { d, class: cls }));
  }

  polygon(points: Array<[number, number]>, cls: string): SVGElement {
    return this.add(svgEl('polygon', { points: points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' '), class: cls }));
  }

  child(cls: string): Pen {
    const pen = Pen.group(cls);
    this.g.append(pen.g);
    return pen;
  }
}

/** A deterministic sequence in [0, 1) for decorative scatter (never the campaign RNG). */
export function scatter(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
