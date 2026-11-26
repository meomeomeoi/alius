import type { ArtSidecar } from '../scene/art';
import { activityMarker } from './fit/activity';
import type { Lookup } from './fit/panel';
import { shoeMarker } from './fit/shoe';
import { panelOf } from './fit';
import { SLOT_INFO, type SlotKey } from './slots';

/**
 * P10e-f: the zone marker of the prototypes, on a slot's picture in its editor frame. The marker itself is ported in each panel's
 * module (her_activity.html's for `sole_close`, shoe.html's for the shoe slots: `fit/activity.ts`, `fit/shoe.ts`); this is its wiring,
 * the prototypes' page listeners: the left button on the canvas is `markDown`, the pointer's moves and its release over the document
 * `markMove` / `markUp`, the wheel on the canvas turns the ellipse. The zones are drawn only while marking. Setup only: no rng.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Zones = NonNullable<ArtSidecar['zones']>;

interface Marker {
  names(): string[];
  start(rect: () => Rect | null): void;
  down(x: number, y: number): void;
  move(x: number, y: number, circle: boolean): void;
  up(): void;
  wheel(e: WheelEvent): void;
  draw(mx: CanvasRenderingContext2D, r: Rect): void;
  on(): boolean;
  dragging(): boolean;
  abort(): void;
  result(): unknown;
  lookup(): Lookup;
  setLookup(l: Lookup): void;
}

/** The marker of a slot's prototype; null for a slot without zones. */
function markerOf(key: SlotKey): Marker | null {
  if (!SLOT_INFO[key].zones) return null;
  return SLOT_INFO[key].prototype === 'shoe.html' ? shoeMarker : activityMarker;
}

/** The picture drawn whole in the canvas (`object-fit: contain`), in the canvas's own pixels; null until it has loaded. */
export function pictureRect(canvas: HTMLCanvasElement, picture: HTMLImageElement): Rect | null {
  const iw = picture.naturalWidth, ih = picture.naturalHeight, cw = canvas.width, ch = canvas.height;
  if (!(iw > 0 && ih > 0 && cw > 0 && ch > 0)) return null;
  const k = Math.min(cw / iw, ch / ih), w = iw * k, h = ih * k;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

/** The zones a slot's picture is marked with (the prototype's names), with its sidecar's feet; empty for a slot without zones. */
export function zoneNames(key: SlotKey, sidecar: ArtSidecar): string[] {
  const marker = markerOf(key);
  if (marker === null) return [];
  panelOf(key).load(key, sidecar);
  return marker.names();
}

/** The marker running now (one at a time). */
let running: (() => void) | null = null;

/**
 * Marks the zones of slot `key` on `picture`, drawn in `canvas` (which lies over it): the prototype's prompt (`[data-proto="markPrompt"]`
 * beside the canvas) names the zone asked for. When the last one is placed, a click ends it and `onChange` gets the zones (one set, or
 * `{ right, left }` for two feet in one picture). The returned function stops it without keeping anything.
 */
export function markZones(canvas: HTMLCanvasElement, picture: HTMLImageElement, key: SlotKey, sidecar: ArtSidecar, onChange: (zones: Zones) => void): () => void {
  running?.();
  const marker = markerOf(key);
  if (marker === null) return () => {};
  panelOf(key).load(key, sidecar);
  const host = canvas.parentElement ?? canvas;
  let prompt = host.querySelector<HTMLElement>('[data-proto="markPrompt"]');
  if (prompt === null) {
    prompt = document.createElement('div');
    prompt.className = 'alius-stage-zone-prompt';
    prompt.dataset.proto = 'markPrompt';
    prompt.setAttribute('role', 'status');
    host.append(prompt);
  }
  prompt.hidden = false;
  const before = marker.lookup();
  const promptEl = prompt;
  marker.setLookup((sel) => (sel === '#markPrompt' ? promptEl : before(sel)));
  if (canvas.clientWidth > 0 && canvas.clientHeight > 0) { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; }
  const rect = (): Rect | null => pictureRect(canvas, picture);
  /** An event's point in the canvas's pixels. */
  const local = (e: MouseEvent): [number, number] => {
    const b = canvas.getBoundingClientRect();
    const sx = b.width > 0 ? canvas.width / b.width : 1, sy = b.height > 0 ? canvas.height / b.height : 1;
    return [(e.clientX - b.left) * sx, (e.clientY - b.top) * sy];
  };
  const draw = (): void => {
    const mx = canvas.getContext('2d');
    if (!mx) return;
    mx.clearRect(0, 0, canvas.width, canvas.height);
    const r = rect();
    if (r && marker.on()) marker.draw(mx, r);
  };
  let done = false;
  const end = (): void => {
    if (done) return;
    done = true;
    canvas.removeEventListener('mousedown', onDown);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContext);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (marker.on()) marker.abort();
    marker.setLookup(before);
    promptEl.style.display = 'none';
    promptEl.hidden = true;
    delete canvas.dataset.marking;
    draw();
    if (running === end) running = null;
  };
  const after = (): void => {
    draw();
    if (!marker.on() && !done) {
      const zones = marker.result() as Zones | null | undefined;
      end();
      if (zones) onChange(structuredClone(zones));
    }
  };
  const onDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const [x, y] = local(e);
    marker.down(x, y);
    after();
  };
  const onMove = (e: MouseEvent): void => {
    if (!marker.dragging()) return;
    const [x, y] = local(e);
    marker.move(x, y, e.shiftKey);
    draw();
  };
  const onUp = (e: MouseEvent): void => {
    if (e.button !== 0 || !marker.dragging()) return;
    marker.up();
    after();
  };
  const onWheel = (e: WheelEvent): void => { marker.wheel(e); draw(); };
  const onContext = (e: Event): void => e.preventDefault();
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContext);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  canvas.dataset.marking = '';
  marker.start(rect);
  draw();
  running = end;
  return end;
}

/** Stops the marker running now, if any (the editor closes, the chat changed). */
export function stopMarking(): void {
  running?.();
}
