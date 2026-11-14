/** Procedural texture for chrome and cards: inline SVG only, no image and no request. */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Filter ids are unique per render, so two shells (or two renders) in one document never clash. */
let fxSeq = 0;

function svg(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** A layer of procedural noise: an inline SVG whose rect is painted by an `feTurbulence` filter (no image, no request). */
export function noise(cls: string, f: { frequency: string; octaves: number; seed?: number }): SVGElement {
  const id = `alius-fx-${++fxSeq}`;
  const layer = svg('svg', { class: `alius-fx ${cls}`, 'aria-hidden': 'true', width: '100%', height: '100%', preserveAspectRatio: 'none' });
  const filter = svg('filter', { id, x: '0', y: '0', width: '100%', height: '100%' });
  filter.append(svg('feTurbulence', {
    type: 'fractalNoise', baseFrequency: f.frequency, numOctaves: String(f.octaves), seed: String(f.seed ?? 1), stitchTiles: 'stitch',
  }));
  layer.append(filter, svg('rect', { width: '100%', height: '100%', filter: `url(#${id})` }));
  return layer;
}

/** A CSS `url("…")` for a path or URL, with quotes, backslashes and line breaks percent-encoded so it cannot end the string early. */
export function cssUrl(path: string): string {
  return `url("${path.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
}
