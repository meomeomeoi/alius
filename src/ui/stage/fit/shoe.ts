/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ArtSidecar } from '../../scene/art';
import { clamp } from '../../scene/instruments/kit/math';
import { FRONT, KINDS, SOLE_TWO } from '../../scene/instruments/shoe/shoe';
import type { SlotKey } from '../slots';
import type { FitPanel, Lookup } from './panel';

/**
 * P10e-f: shoe.html's panel, her footwear from above (`shoe_close.<kind>`) and its sole (`shoe_sole.<kind>`). Ported: the feet and
 * shown pickers and the six sliders (`SHOE_CONTROLS`), the picture's state (`S.feet`, `S.shown`, `S.fit` per picture with the sole's own
 * defaults: `reset`), the prototype's helpers (`view`, `slotKey`, `twoFeet`, `mirrored`, `footX`, `zonesNow`, `K`), its handlers
 * (`bindShoeFeet`, `bindShoeFit`, `syncFit`) and "copy the fit" (`copyFit`). The kind and the view are the slot key's (the prototype's
 * kind buttons and view picker are not shown); the play state `G` keeps what the handlers touch; `begin`, `ensureSurface` and `nextWant`
 * are the game's and never run here (`G.phase` is never `loop`). The zone marker (Task 7), foot service's carried over: `MARK`,
 * `markStart`, `markPrompt`, `markDown`, `markMove`, `markUp`, `markFinish` (two feet: the right foot's set, then the left's), the wheel
 * (`onWheel`), its drawing (`drawMarks`, the marker's lines of `render`) and the zones (`toPic`, `zoneRadii`, `inEllipse`, `zoneAtPic`).
 * `shoeRect` is the editor's: the whole picture as drawn in the slot's frame (the prototype frames one shoe and pans its camera).
 */
type Any = any;

export const SHOE_CONTROLS = {
  feetSel: { label: 'feet in this picture', type: 'select', options: [['one', 'one'], ['two', 'two']], value: 'one' },
  shownSel: { label: 'the foot shown (one)', type: 'select', options: [['right', 'her right'], ['left', 'her left']], value: 'right' },
  xr: { label: 'her right foot x', type: 'range', min: 0.1, max: 0.9, step: 0.01, value: 0.38 },
  xl: { label: 'her left foot x', type: 'range', min: 0.1, max: 0.9, step: 0.01, value: 0.62 },
  fitH: { label: 'height', type: 'range', min: 0.4, max: 3, step: 0.01, value: 0.68 },
  fitX: { label: 'x', type: 'range', min: -0.5, max: 0.5, step: 0.01, value: 0 },
  fitF: { label: 'top fade', type: 'range', min: 0, max: 0.8, step: 0.01, value: 0.25 },
  fitY: { label: 'y', type: 'range', min: -0.6, max: 0.9, step: 0.01, value: 0.48 },
} as const;

const stand = new Map<string, Any>();
/** The default `$`: detached stand-ins (the editor gives its own, `bind` / `setLookup`). */
const detached: Lookup = (sel) => { let el = stand.get(sel); if (!el) { el = document.createElement('div'); stand.set(sel, el); } return el; };
let $: Lookup = detached;
export const S: Any = { kind: 'boots', feet: {}, shown: {}, fit: {}, zones: {} };
export const G: Any = { phase: 'idle', surface: 'close', foot: 'right', camU: undefined, surfaces: {} };
const begin = (): void => {};
const ensureSurface = (): void => {};
const nextWant = (): void => {};

function reset() {
  S.feet = { boots_close: 'one', boots_sole: 'one', heels_close: 'one', heels_sole: 'one' };
  S.shown = { boots_close: 'right', boots_sole: 'right', heels_close: 'right', heels_sole: 'right' };
  S.fit = { boots_close: { h: 0.68, y: 0.48, x: 0, fade: 0.25, xr: 0.38, xl: 0.62 }, boots_sole: { h: 0.78, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 }, heels_close: { h: 0.68, y: 0.48, x: 0, fade: 0.25, xr: 0.38, xl: 0.62 }, heels_sole: { h: 0.78, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 } }; S.zones = {};
}
const K = () => KINDS[S.kind];
export const view = () => (G.surface === 'sole' ? 'sole' : 'close');
export const slotKey = () => `${S.kind}_${view()}`;
export const twoFeet = () => S.feet[slotKey()] === 'two';
export const mirrored = () => !twoFeet() && G.foot !== S.shown[slotKey()]; // one foot in the picture: the other foot is it mirrored
const footX = () => S.fit[slotKey()][G.foot === 'right' ? 'xr' : 'xl'];
export function zonesNow() {
  if (twoFeet()) {
    const own = S.zones[slotKey()]?.[G.foot]; if (own) return own;
    const u0 = footX(), out = {} as Any, sgn = G.foot === 'right' ? -1 : 1;
    for (const [k, p] of Object.entries(view() === 'sole' ? SOLE_TWO : FRONT[S.kind]!) as Array<[string, number[]]>) out[k] = [+(u0 + p[0]! * sgn).toFixed(3), p[1], p[2], p[3], p[4]];
    return out;
  }
  const z = S.zones[slotKey()]; return z && !z.right ? z : (K() as Any)[view()];
}

function bindShoeFeet() {
  $('#feetSel').onchange = () => { S.feet[slotKey()] = $('#feetSel').value; delete S.zones[slotKey()]; G.surfaces = {}; G.camU = undefined; if (G.phase === 'loop') begin(); };
  $('#shownSel').onchange = () => { S.shown[slotKey()] = $('#shownSel').value; G.surfaces = {}; };
  for (const id of ['xr', 'xl']) $(`#${id}`).oninput = () => { const f = S.fit[slotKey()]; f[id] = Number($(`#${id}`).value); $(`#${id}V`).textContent = f[id].toFixed(2); G.surfaces = {}; if (G.phase === 'loop') ensureSurface(); };
  $('#footSel').onchange = () => { G.foot = $('#footSel').value; G.camU = undefined; if (G.phase === 'loop') { ensureSurface(); nextWant(); } };
  $('#viewSel').onchange = () => { const v = $('#viewSel').value; G.surface = v; G.camU = undefined; syncFit(); if (G.phase === 'loop') { ensureSurface(); nextWant(); } };
}
function syncFit() { const f = S.fit[slotKey()]; $('#feetSel').value = S.feet[slotKey()]; $('#shownSel').value = S.shown[slotKey()]; $('#fitX').value = f.x ?? 0; $('#fitXV').textContent = (f.x ?? 0).toFixed(2); $('#fitF').value = f.fade ?? 0; $('#fitFV').textContent = (f.fade ?? 0).toFixed(2);
  const cf = S.fit[slotKey()]; $('#xr').value = cf.xr; $('#xrV').textContent = cf.xr.toFixed(2); $('#xl').value = cf.xl; $('#xlV').textContent = cf.xl.toFixed(2); $('#fitH').value = f.h; $('#fitHV').textContent = f.h.toFixed(2); $('#fitY').value = f.y; $('#fitYV').textContent = f.y.toFixed(2); }
function bindShoeFit() {
  $('#fitH').oninput = () => { S.fit[slotKey()].h = Number($('#fitH').value); $('#fitHV').textContent = S.fit[slotKey()].h.toFixed(2); };
  $('#fitX').oninput = () => { S.fit[slotKey()].x = Number($('#fitX').value); $('#fitXV').textContent = S.fit[slotKey()].x.toFixed(2); };
  $('#fitF').oninput = () => { S.fit[slotKey()].fade = Number($('#fitF').value); $('#fitFV').textContent = S.fit[slotKey()].fade.toFixed(2); };
  $('#fitY').oninput = () => { S.fit[slotKey()].y = Number($('#fitY').value); $('#fitYV').textContent = S.fit[slotKey()].y.toFixed(2); };
}
export function copyFit() { const f = S.fit[slotKey()]; const j = JSON.stringify({ slot: `shoe_${view() === 'sole' ? 'sole' : 'close'}`, kind: S.kind, feet: S.feet[slotKey()], ...(twoFeet() ? {} : { shown: S.shown[slotKey()] }), fit: { height: f.h, y: f.y, x: f.x ?? 0, fade: f.fade ?? 0, ...(twoFeet() ? { xr: f.xr, xl: f.xl } : {}) }, zones: S.zones[slotKey()] }); $('#sideNote').textContent = j; return j; }

/* ---------- the zone marker (foot service's, per picture, Task 7) ---------- */
type Rect = { x: number; y: number; w: number; h: number };
let rectOf: () => Rect | null = () => null;
/** The picture's rect in the marker's canvas (the editor's frame). */
function shoeRect(): Rect | null { return rectOf(); }
/* a point on screen → the picture's own coordinates (0–1), undoing the mirror */
function toPic(x: number, y: number) { const r = shoeRect(); if (!r) return null; let u = (x - r.x) / r.w; const v = (y - r.y) / r.h; if (mirrored()) u = 1 - u; return [u, v, r] as [number, number, Rect]; }
/* the zones as ellipses in px (from foot service: `zoneRadii`, `inEllipse`, `zoneAt`) */
function zoneRadii(r: Any) {
  const z = Object.entries(zonesNow()) as Array<[string, number[]]>, out: Any = {};
  for (const [k, p] of z) {
    let dmin = 1e9;
    for (const [k2, q] of z) if (k2 !== k) dmin = Math.min(dmin, Math.hypot((p[0]! - q[0]!) * r.w, (p[1]! - q[1]!) * r.h));
    const auto = clamp(dmin / 2, r.h * 0.04, r.h * 0.12);
    out[k] = p[3] !== undefined ? { rx: p[2]! * r.h, ry: p[3] * r.h, rot: ((p[4] ?? 0) * Math.PI) / 180 } : p[2] !== undefined ? { rx: p[2] * r.h, ry: p[2] * r.h } : { rx: auto, ry: auto };
  }
  return out;
}
function inEllipse(dx: number, dy: number, z: Any) { const a = -(z.rot ?? 0), c = Math.cos(a), sn = Math.sin(a); return [(dx * c - dy * sn) / z.rx, (dx * sn + dy * c) / z.ry]; }
function zoneAtPic(u: number, v: number, r: Any) {
  const rad = zoneRadii(r); let best = null, bd = 1e9;
  for (const [k, p] of Object.entries(zonesNow()) as Array<[string, number[]]>) { const [ex, ey] = inEllipse((u - p[0]!) * r.w, (v - p[1]!) * r.h, rad[k]) as [number, number]; const d = Math.hypot(ex, ey); if (d < 1 && d < bd) { bd = d; best = k; } }
  return best;
}

const MARK: Any = { on: false, i: 0, names: [], pts: {} };
function markStart() {
  MARK.on = true; MARK.i = 0; MARK.pts = {}; MARK.names = Object.keys(twoFeet() ? (view() === 'sole' ? SOLE_TWO : FRONT[S.kind]!) : (K() as Any)[view()]);
  MARK.done = {};
  if (twoFeet()) { G.foot = 'right'; G.camU = undefined; } else G.foot = S.shown[slotKey()]; // mark on the picture as it is (not mirrored)
  if (G.phase === 'idle' || G.phase === 'done') { G.phase = 'mark'; }
  $('#markPrompt').style.display = 'block'; markPrompt();
}
function markPrompt() { const who = twoFeet() ? `her ${G.foot} foot · ` : ''; $('#markPrompt').textContent = MARK.i >= MARK.names.length ? `${who}the wheel turns the last ellipse (Shift: finer) · a click anywhere: ${twoFeet() && G.foot === 'right' ? 'next, her left foot' : 'done'}` : `${who}press on the centre of: ${MARK.names[MARK.i]} · drag for its width and height, the wheel turns it (Shift: a circle; a click: automatic)`; }
function markDown(x: number, y: number) { if (MARK.i >= MARK.names.length) { markFinish(); return; } const q = toPic(x, y); if (!q) return; MARK.last = null; MARK.drag = { x, y, rad: 0, rot: 0 }; MARK.pts[MARK.names[MARK.i]] = [+q[0].toFixed(3), +q[1].toFixed(3)]; }
function markMove(x: number, y: number, circle: boolean) { const d = MARK.drag; if (!d) return; d.rad = Math.hypot(x - d.x, y - d.y); d.circle = circle; d.rx = circle ? d.rad : Math.max(6, Math.abs(x - d.x)); d.ry = circle ? d.rad : Math.max(6, Math.abs(y - d.y)); }
function markUp() {
  const d = MARK.drag; if (!d) return; MARK.drag = null; const r = shoeRect(); if (!r) return; const name = MARK.names[MARK.i];
  if (d.rad > 8) MARK.pts[name] = d.circle ? [...MARK.pts[name].slice(0, 2), +Math.max(0.02, d.rad / r.h).toFixed(3)] : [...MARK.pts[name].slice(0, 2), +Math.max(0.015, d.rx / r.h).toFixed(3), +Math.max(0.015, d.ry / r.h).toFixed(3), d.rot ?? 0];
  if (MARK.pts[name].length >= 4) MARK.last = name;
  MARK.i += 1; markPrompt();
}
function markFinish() {
  if (twoFeet()) {
    MARK.done[G.foot] = { ...MARK.pts };
    if (G.foot === 'right') { G.foot = 'left'; G.camU = undefined; MARK.i = 0; MARK.pts = {}; MARK.last = null; markPrompt(); return; } // both shoes are marked
    S.zones[slotKey()] = { right: MARK.done.right, left: MARK.done.left };
  } else S.zones[slotKey()] = { ...MARK.pts };
  MARK.on = false; MARK.last = null; $('#markPrompt').style.display = 'none';
  if (G.phase === 'mark') G.phase = 'idle';
  G.surfaces = {}; copyFit();
}
function onWheel(e: WheelEvent) {
  if (!MARK.on) return; e.preventDefault();
  const step = (e.shiftKey ? 1 : 5) * Math.sign(e.deltaY || e.deltaX);
  if (MARK.drag && !MARK.drag.circle) MARK.drag.rot = ((MARK.drag.rot ?? 0) + step + 360) % 360;
  else if (MARK.last && MARK.pts[MARK.last]?.length >= 4) { const z = MARK.pts[MARK.last]; z[4] = ((z[4] ?? 0) + step + 360) % 360; }
}
/** The marker's lines of the prototype's `render` (only while marking: `S.debug` is the prototype's readout, never on here). */
function drawMarks(mx: CanvasRenderingContext2D, r: Rect) {
  if (r && (S.debug || MARK.on)) {
    const rad = zoneRadii(r), zz = MARK.on ? MARK.pts : zonesNow();
    for (const [k, p] of Object.entries(zz) as Array<[string, number[]]>) {
      const live = MARK.on && MARK.drag && k === MARK.names[MARK.i];
      const ex = live ? Math.max(6, MARK.drag.rx ?? 6) : p[2] !== undefined ? p[2] * r.h : (rad[k]?.rx ?? 10), ey = live ? Math.max(6, MARK.drag.ry ?? 6) : p[3] !== undefined ? p[3] * r.h : ex;
      const er = ((live ? MARK.drag.rot ?? 0 : p[4] ?? 0) * Math.PI) / 180 * (mirrored() ? -1 : 1);
      const cxp = r.x + (mirrored() ? 1 - p[0]! : p[0]!) * r.w, cyp = r.y + p[1]! * r.h;
      mx.strokeStyle = k === G.want ? 'rgba(140,255,170,.8)' : 'rgba(216,228,255,.55)'; mx.lineWidth = k === G.want ? 2 : 1; mx.beginPath(); mx.ellipse(cxp, cyp, ex, ey, er, 0, Math.PI * 2); mx.stroke();
      mx.fillStyle = 'rgba(216,228,255,.8)'; mx.font = '12px "IBM Plex Mono"'; mx.fillText(k, cxp + 10, cyp + 4);
    }
  }
}

/** The marker as `zones.ts` drives it (the slot's kind, view, feet and shown come from `load`). */
export const shoeMarker = {
  names(): string[] { return Object.keys(twoFeet() ? (view() === 'sole' ? SOLE_TWO : FRONT[S.kind]!) : (K() as Any)[view()]); },
  start(rect: () => Rect | null): void { rectOf = rect; markStart(); },
  down: (x: number, y: number) => markDown(x, y),
  move: (x: number, y: number, circle: boolean) => markMove(x, y, circle),
  up: () => markUp(),
  wheel: (e: WheelEvent) => onWheel(e),
  draw: (mx: CanvasRenderingContext2D, r: Rect) => drawMarks(mx, r),
  on: (): boolean => MARK.on,
  dragging: (): boolean => !!MARK.drag,
  abort(): void { MARK.on = false; MARK.drag = null; MARK.last = null; if (G.phase === 'mark') G.phase = 'idle'; },
  result: () => S.zones[slotKey()],
  lookup: (): Lookup => $,
  setLookup(l: Lookup): void { $ = l; },
};
/** Tests' hook. */
export const _shoeMarker = { S, G, MARK, zoneRadii, zoneAtPic, toPic };

/** `shoe_close.boots` → the kind and the view of the prototype. */
export function selectSlot(key: SlotKey): void {
  const [slot, kind] = key.split('.') as [string, string];
  S.kind = kind; G.surface = slot === 'shoe_sole' ? 'sole' : 'close'; G.camU = undefined; G.surfaces = {};
}

export const shoePanel: FitPanel = {
  prototype: 'shoe.html',
  ids: () => ['feetSel', 'shownSel', 'xr', 'xl', 'fitH', 'fitX', 'fitF', 'fitY'],
  controls: SHOE_CONTROLS,
  writes: { feetSel: ['feet'], shownSel: ['shown'], xr: ['fit.xr'], xl: ['fit.xl'], fitH: ['fit.height'], fitX: ['fit.x'], fitF: ['fit.fade'], fitY: ['fit.y'] },
  note: () => null,
  load(key, sc: ArtSidecar) {
    // the instrument's reading (shoe.ts `fitFrom`): feet, the foot shown, the fit (`height` → `h`), the zones
    reset();
    selectSlot(key);
    const k = slotKey();
    if (sc.feet === 'one' || sc.feet === 'two') S.feet[k] = sc.feet;
    if (sc.shown === 'left' || sc.shown === 'right') S.shown[k] = sc.shown;
    const f = sc.fit ?? {}, was = S.fit[k];
    S.fit[k] = { h: f.height ?? was.h, y: f.y ?? was.y, x: f.x ?? was.x, fade: f.fade ?? was.fade, xr: f.xr ?? was.xr, xl: f.xl ?? was.xl };
    if (sc.zones) S.zones[k] = structuredClone(sc.zones);
  },
  value(id) {
    const k = slotKey(), f = S.fit[k];
    return ({ feetSel: S.feet[k], shownSel: S.shown[k], xr: f.xr, xl: f.xl, fitH: f.h, fitX: f.x, fitF: f.fade, fitY: f.y } as Any)[id];
  },
  bind(lookup) { $ = lookup; bindShoeFeet(); bindShoeFit(); syncFit(); },
  copy: () => JSON.parse(copyFit()),
};
