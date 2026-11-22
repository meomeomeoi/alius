import type { AliusSettings } from '../settings';

const systemReduced = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;

/** The one answer to "may this move?": the SYS setting or the system preference. `media` is for tests. */
export function motionReduced(s: AliusSettings, media: () => boolean = systemReduced): boolean {
  return s.reducedMotion || media();
}

export interface VisualFlags {
  scanlines: boolean;
  flicker: boolean;
  glitch: boolean;
  dither: boolean;
  /** Slides, fades, the boot and typing may animate. */
  motion: boolean;
  /** P16: the commander's sight is taken (a sensory hold or a blindfold): the shell shows no portraits and no header and plays at a low volume. */
  sensory: boolean;
}

/**
 * What the shell may show. Readable mode turns scanlines, flicker, the tab glitch and dithering off (and leaves motion to
 * the reduced-motion rule); reduced motion also stops the glitch, which is an animation. `opts.sensory` (P16, from the engine's `sensoryNow`) is passed through: it is never read from the media query.
 */
export function visualFlags(s: AliusSettings, media?: () => boolean, opts: { sensory?: boolean } = {}): VisualFlags {
  const motion = !motionReduced(s, media);
  const plain = s.readableMode;
  return { scanlines: !plain && s.scanlines, flicker: !plain && s.flicker, glitch: !plain && motion, dither: !plain && s.ditheredPortraits, motion, sensory: opts.sensory === true };
}
