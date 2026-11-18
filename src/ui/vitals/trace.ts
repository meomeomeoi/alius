import { fnv1a } from '../../engine/hub';
import type { VitalsPattern } from '../../engine/vitals';

/**
 * The trace behind VITALS (P10b §1): a deterministic line per pattern, never a measurement. A point is `fnv1a(seed + i)` shaped
 * by the pattern, so the same state draws the same line on every redraw and nothing is stored or rolled.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const POINTS = 48;

const unit = (seed: string, i: number): number => (fnv1a(`${seed}${i}`) % 1000) / 1000;
const clamp = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/** `n` values from 0 to 1. A flat line sits at 0.5; with `flicker` it carries one blip. */
export function tracePoints(pattern: VitalsPattern, seed: string, n: number = POINTS, flicker = false): number[] {
  const out: number[] = [];
  const blip = fnv1a(seed) % n;
  for (let i = 0; i < n; i++) {
    const noise = unit(seed, i) - 0.5;
    let v: number;
    switch (pattern) {
      case 'steady': v = i % 12 === 3 ? 0.8 : i % 12 === 4 ? 0.25 : 0.5 + noise * 0.06; break;
      case 'elevated': v = i % 8 === 2 ? 0.88 : i % 8 === 3 ? 0.18 : 0.5 + noise * 0.12; break;
      case 'spiking': v = i % 6 === 1 ? 1 : i % 6 === 2 ? 0 : 0.5 + noise * 0.2; break;
      case 'erratic': v = 0.5 + noise * 2; break;
      case 'flat': v = flicker && i === blip ? 0.9 : 0.5; break;
    }
    out.push(clamp(v));
  }
  return out;
}

/** The trace as an inline SVG polyline (attributes only, no innerHTML). The sweep is a class that only exists while motion is on. */
export function renderTrace(pattern: VitalsPattern, seed: string, opts: { motion: boolean; flicker?: boolean; label?: string }): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${POINTS * 2} 24`);
  svg.setAttribute('class', `alius-trace${opts.motion ? ' is-sweeping' : ''}`);
  svg.setAttribute('data-pattern', pattern);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', opts.label ?? `Vitals trace: ${pattern}`);
  const line = document.createElementNS(SVG_NS, 'polyline');
  const points = tracePoints(pattern, seed, POINTS, opts.flicker === true).map((v, i) => `${i * 2},${(22 - v * 20).toFixed(1)}`);
  line.setAttribute('points', points.join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.2');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(line);
  return svg;
}
