/**
 * P10e-e Task 12: a scene frame for the slap instrument's tests (jsdom): the layers, the input line, the reply and a fake frame clock. The
 * frame clock (`now`, `raf`) and the timers (vi's fake timers) move together through `tick(ms)`.
 */
import { vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { h } from '../../src/ui/dom';
import type { ArtSlots } from '../../src/ui/scene/art';
import { say } from '../../src/ui/scene/instruments/kit/hand';
import type { InstrumentEnv } from '../../src/ui/scene/instruments/types';

export interface SlapEnvOpts {
  state: () => CampaignState;
  reg: Registries;
  settings?: Partial<AliusSettings>;
  reduced?: boolean;
  /** Her face now. */
  face?: string;
  /** The labels she has a sprite for (each answers `/sprites/<label>.png`). */
  labels?: string[];
  art?: Partial<ArtSlots>;
  /** Her sprite is drawn (a picture 400 × 1100 at (760, 30) in the frame); default none. */
  sprite?: boolean;
  /** The scene's sprite lookup takes this long (fake timers; default at once). */
  lookupMs?: number;
  /** Where the frame is drawn (default the document's body). */
  parent?: HTMLElement;
}

/** jsdom has no `HTMLImageElement.decode`: a decode that takes `decodeMs` (fake timers; default at once). */
export let decodeMs = 0;
export const setDecodeMs = (ms: number): void => { decodeMs = ms; };
const proto = HTMLImageElement.prototype as unknown as { decode?: () => Promise<void> };
if (typeof proto.decode !== 'function') proto.decode = () => new Promise<void>((r) => { if (decodeMs > 0) setTimeout(r, decodeMs); else r(); });

export function slapEnv(o: SlapEnvOpts) {
  let t = 1000;
  let next = 1;
  const queue = new Map<number, FrameRequestCallback>();
  const root = h('div', { class: 'alius-scene' });
  const layer = (n: string): HTMLElement => h('div', { class: `alius-layer alius-layer-${n}` });
  const layers = { backdrop: layer('backdrop'), frame: layer('frame'), pose: layer('pose'), sprites: layer('sprites'), effects: layer('effects'), moment: layer('moment') };
  const reply = h('div', { class: 'alius-stage-reply' });
  const input = h('input', { type: 'text', name: 'cmd', class: 'alius-input' }) as HTMLInputElement;
  const line = h('div', { class: 'alius-input-line' }, input);
  const stop = h('button', { type: 'button', class: 'alius-stop-pill', 'data-stop-word': '' }, 'STOP WORD');
  const dial = h('div', { class: 'alius-stage-dial' }, stop);
  const ui = h('div', { class: 'alius-layer alius-layer-ui' }, reply, line, dial);
  root.append(layers.backdrop, layers.frame, layers.pose, layers.sprites, layers.effects, ui, layers.moment);
  (o.parent ?? document.body).append(root);
  const setSprite = vi.fn();
  let spriteImg: HTMLImageElement | null = null;
  if (o.sprite) {
    spriteImg = h('img', { class: 'alius-sprite-img' }) as HTMLImageElement;
    Object.defineProperty(spriteImg, 'naturalWidth', { value: 400 });
    spriteImg.getBoundingClientRect = () => ({ left: 760, top: 30, width: 400, height: 1100, right: 1160, bottom: 1130, x: 760, y: 30, toJSON: () => ({}) }) as DOMRect;
    layers.sprites.append(spriteImg);
  }
  let face = o.face ?? 'neutral';
  const labels = new Set(o.labels ?? ['neutral', 'anger', 'amusement', 'disapproval', 'desire', 'pride', 'annoyance', 'love', 'caring', 'sadness', 'approval', 'curiosity', 'surprise', 'disappointment']);
  const env: InstrumentEnv = {
    root, layers, input, reply,
    gauge: { narrow() {}, tremble() {}, pulse() {}, window() {}, clear() {} },
    spriteOf: () => spriteImg,
    setSprite: (unitId: string, label: string, url?: string) => { face = label; setSprite(unitId, label, url); },
    faceOf: () => face,
    spriteUrl: async (_u: string, label: string) => {
      if (o.lookupMs) await new Promise((r) => setTimeout(r, o.lookupMs));
      return labels.has(label) ? `/sprites/${label}.png` : null;
    },
    state: o.state, registries: o.reg, settings: () => ({ ...DEFAULT_SETTINGS, ...o.settings }) as AliusSettings,
    staging: { input() {}, endSegment: () => [], stopWord: () => [], skip: () => [], stimulus: () => [], act: () => [], finishCounted: () => [], cue: () => null, beat: () => 0, clock: () => ({ startedAt: null, beatMs: 0, now: 0 }) },
    samples: null,
    art: { get: () => null, face: () => null, ...o.art } as ArtSlots,
    her: (unitId) => ({ unitId, name: 'Ann', accent: '#8cc8f0', hand: 'Caveat', handScale: 1, style: 'neutral' }),
    say: (host, text, opts) => say(host, text, opts),
    now: () => t,
    raf: (fn) => { const id = next++; queue.set(id, fn); return id; },
    cancelRaf: (id) => { queue.delete(id); },
    timeout: (fn, ms) => { const x = setTimeout(fn, ms); return () => clearTimeout(x); },
    listen: (target, type, fn, opts) => { target.addEventListener(type, fn, opts); return () => target.removeEventListener(type, fn, opts); },
    reduced: o.reduced === true,
    readable: false,
  };
  /** One frame: the clock and the timers move 16 ms, then the queued frames run. */
  const frame = (): void => {
    t += 16;
    vi.advanceTimersByTime(16);
    const due = [...queue.values()];
    queue.clear();
    for (const fn of due) fn(t);
  };
  return {
    env, root, layers, input, reply, stop, setSprite,
    /** Her face changes (a reply of hers read as `label`). */
    setFace: (label: string) => { face = label; },
    /** ms since the clock's start (1000). */
    now: () => t - 1000,
    frame,
    /** Runs frames until `ms` more have passed. */
    tick(ms: number): void { const end = t + ms; while (t < end) frame(); },
    /** Lets the promises settle (the slap's start waits for her face). */
    async settle(): Promise<void> { for (let i = 0; i < 6; i++) await Promise.resolve(); },
    pendingFrames: () => queue.size,
  };
}
