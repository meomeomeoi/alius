/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ArtSidecar } from '../../scene/art';
import { DEFAULT_ZONES } from '../../scene/instruments/activity/service';
import { clamp } from '../../scene/instruments/kit/math';
import type { SlotKey } from '../slots';
import type { FitPanel, Lookup } from './panel';

/**
 * P10e-f: her_activity.html's panel: the legs under her desk (`legs_seated.rest` with the floor shadow, `legs_seated.foot_raised`), her
 * feet on the floor (`feet_floor`) and the sole's close-up (`sole_close`, foot service). Ported: the sliders (`ACTIVITY_CONTROLS`), the
 * prototype's `bindRange` and its call line (`bindFit`; the controls the editor does not show are detached stand-ins), "copy the fit"
 * (`copyLegs`, the button's `copyFit`: one JSON for the three legs pictures, split here into each picture's sidecar as the frame reads it: `frame.ts`) and the
 * sole's JSON (`copySole`, the line of the marker's `markFinish`). The zone marker of foot service (Task 7): `MARK`, `markStart`,
 * `markDown`, `markMove`, `markUp`, `markFinish`, the wheel (`onWheel`), its drawing (`drawMarks`, the marker's lines of `svRender`) and
 * the zones (`zones`, `zoneRadii`, `inEllipse`, `zoneAt`). `soleRect` is the editor's: the picture as drawn in the slot's frame; `SV` is
 * the close-up the prototype zooms in while marking, which the editor has not (`svFresh` makes an empty one).
 */
type Any = any;

export const ACTIVITY_CONTROLS = {
  closeH: { label: 'close-up height', type: 'range', min: 0.35, max: 1, step: 0.01, value: 0.62 },
  closeY: { label: 'close-up y', type: 'range', min: 0.3, max: 0.7, step: 0.01, value: 0.47 },
  legsW: { label: 'art width', type: 'range', min: 0.3, max: 1.1, step: 0.01, value: 0.62 },
  legsB: { label: 'art bottom', type: 'range', min: 0.6, max: 1.2, step: 0.01, value: 0.9 },
  raisedW: { label: 'raised width', type: 'range', min: 0.3, max: 1.1, step: 0.01, value: 0.62 },
  raisedB: { label: 'raised bottom', type: 'range', min: 0.6, max: 1.2, step: 0.01, value: 0.9 },
  floorShade: { label: 'floor shadow', type: 'range', min: 0, max: 1, step: 0.05, value: 0.55 },
  feetW: { label: 'feet width', type: 'range', min: 0.2, max: 1.1, step: 0.01, value: 0.56 },
  feetB: { label: 'feet bottom', type: 'range', min: 0.6, max: 1.2, step: 0.01, value: 0.86 },
  feetTilt: { label: 'tilt (°)', type: 'range', min: 0, max: 25, step: 1, value: 6 },
} as const;
type Id = keyof typeof ACTIVITY_CONTROLS;

const stand = new Map<string, Any>();
/** The default `$`: detached stand-ins (the editor gives its own, `bind` / `setLookup`). */
const detached: Lookup = (sel) => { let el = stand.get(sel); if (!el) { el = document.createElement('div'); stand.set(sel, el); } return el; };
let $: Lookup = detached;
const defaults = (): Any => Object.fromEntries(Object.entries(ACTIVITY_CONTROLS).map(([k, c]) => [k, c.value]));
/** The prototype's `S`: the fit of the four pictures and the sole's zones (the marker writes them). */
export const S: Any = { ...defaults(), zones: null };
/** The prototype's presence note is the panel's; the editor has none. */
const updatePresenceNote = (): void => {};

const bindRange = (id: string, key: string) => { const el = $(`#${id}`); const sync = () => { S[key] = Number(el.value); const v = $(`#${id}V`); if (v) v.textContent = String(S[key]); updatePresenceNote(); }; el.oninput = sync; sync(); };
function bindFit() {
  bindRange('seed', 'seed'); bindRange('closeH', 'closeH'); bindRange('closeY', 'closeY'); bindRange('legsW', 'legsW'); bindRange('legsB', 'legsB'); bindRange('floorShade', 'floorShade'); bindRange('raisedW', 'raisedW'); bindRange('feetW', 'feetW'); bindRange('feetB', 'feetB'); bindRange('feetTilt', 'feetTilt'); bindRange('raisedB', 'raisedB'); bindRange('phases', 'phases'); bindRange('phaseLen', 'phaseLen'); bindRange('level', 'level'); bindRange('vol', 'vol');
}
function copyLegs() { const j = JSON.stringify({ slot: 'legs_seated', states: { rest: { width: S.legsW, bottom: S.legsB }, foot_raised: { width: S.raisedW, bottom: S.raisedB } }, floorShade: S.floorShade, feet_floor: { width: S.feetW, bottom: S.feetB, tilt: S.feetTilt } }); return j; }
function copySole() {
  const j = JSON.stringify({ slot: 'sole_close', fit: { height: S.closeH, y: S.closeY }, zones: S.zones }); return j;
}

/* ---------- the zone marker (foot service's, Task 7) ---------- */
type Rect = { x: number; y: number; w: number; h: number };
let rectOf: () => Rect | null = () => null;
/** The picture's rect in the marker's canvas (the editor's frame; the prototype's is the close-up on screen). */
function soleRect(): Rect | null { return rectOf(); }
let SV: Any = null;
const svFresh = (): Any => ({});

const zones = () => S.zones ?? DEFAULT_ZONES;
function zoneRadii(r: Any) {
  const z = Object.entries(zones()) as Array<[string, number[]]>, out: Any = {};
  for (const [k, p] of z) {
    let dmin = 1e9;
    for (const [k2, q] of z) if (k2 !== k) dmin = Math.min(dmin, Math.hypot((p[0]! - q[0]!) * r.w, (p[1]! - q[1]!) * r.h));
    const auto = clamp(dmin / 2, r.h * 0.04, r.h * 0.12);
    out[k] = p[3] !== undefined ? { rx: p[2]! * r.h, ry: p[3] * r.h, rot: ((p[4] ?? 0) * Math.PI) / 180 } : p[2] !== undefined ? { rx: p[2] * r.h, ry: p[2] * r.h } : { rx: auto, ry: auto };
  }
  return out;
}
function inEllipse(dx: number, dy: number, z: Any) { const a = -(z.rot ?? 0), c = Math.cos(a), sn = Math.sin(a); return [(dx * c - dy * sn) / z.rx, (dx * sn + dy * c) / z.ry]; }
function zoneAt(x: number, y: number) {
  const r = soleRect(); if (!r) return null;
  const rad = zoneRadii(r);
  let best = null, bd = 1e9;
  for (const [k, p] of Object.entries(zones()) as Array<[string, number[]]>) { const [ex, ey] = inEllipse(x - (r.x + p[0]! * r.w), y - (r.y + p[1]! * r.h), rad[k]) as [number, number]; const d = Math.hypot(ex, ey); if (d < 1 && d < bd) { bd = d; best = k; } }
  return best;
}

const MARK: Any = { on: false, i: 0, names: ['toes', 'ball', 'arch', 'heel', 'edge'], pts: {} };
function markStart() { MARK.on = true; MARK.i = 0; MARK.pts = {}; if (!SV) SV = svFresh(); SV.closeTarget = 1; SV.closeK = 1; $('#markPrompt').style.display = 'block'; $('#markPrompt').textContent = `press on the centre of: ${MARK.names[0]} · drag toward a corner for its width and height, the wheel turns it (Shift: a circle; a click: automatic)`; }
function markDown(x: number, y: number) { if (MARK.i >= MARK.names.length) { markFinish(); return; } const r = soleRect(); if (!r) return; MARK.last = null; MARK.drag = { x, y, rad: 0, rot: 0 }; MARK.pts[MARK.names[MARK.i]] = [+((x - r.x) / r.w).toFixed(3), +((y - r.y) / r.h).toFixed(3)]; }
function markMove(x: number, y: number, circle: boolean) { const d = MARK.drag; if (!d) return; d.rad = Math.hypot(x - d.x, y - d.y); d.circle = circle; d.rx = circle ? d.rad : Math.max(6, Math.abs(x - d.x)); d.ry = circle ? d.rad : Math.max(6, Math.abs(y - d.y)); }
function markUp() {
  const d = MARK.drag; if (!d) return; MARK.drag = null;
  const r = soleRect(); if (!r) return;
  const name = MARK.names[MARK.i];
  if (d.rad > 8) MARK.pts[name] = d.circle ? [...MARK.pts[name].slice(0, 2), +Math.max(0.02, d.rad / r.h).toFixed(3)] : [...MARK.pts[name].slice(0, 2), +Math.max(0.015, d.rx / r.h).toFixed(3), +Math.max(0.015, d.ry / r.h).toFixed(3), d.rot ?? 0];
  if (MARK.pts[name].length >= 4) MARK.last = name; // the wheel turns it until the next zone is started
  MARK.i += 1;
  $('#markPrompt').textContent = MARK.i >= MARK.names.length
    ? 'the wheel turns the last ellipse (Shift: finer) · a click anywhere: done'
    : `press on the centre of: ${MARK.names[MARK.i]} · drag toward a corner for its width and height, the wheel turns it (Shift: a circle; a click: automatic)`;
}
function markFinish() {
  S.zones = { ...MARK.pts }; MARK.on = false; MARK.last = null; SV.closeTarget = 0; $('#markPrompt').style.display = 'none';
  const j = JSON.stringify({ slot: 'sole_close', fit: { height: S.closeH, y: S.closeY }, zones: S.zones }); $('#soleNote').textContent = j;
}
/* the wheel turns the ellipse being dragged, or the last one placed: 5° a notch, 1° with Shift */
function onWheel(e: WheelEvent) {
  if (!MARK.on) return;
  e.preventDefault();
  const step = (e.shiftKey ? 1 : 5) * Math.sign(e.deltaY || e.deltaX);
  if (MARK.drag && !MARK.drag.circle) MARK.drag.rot = ((MARK.drag.rot ?? 0) + step + 360) % 360;
  else if (MARK.last && MARK.pts[MARK.last]?.length >= 4) { const z = MARK.pts[MARK.last]; z[4] = ((z[4] ?? 0) + step + 360) % 360; }
}
/** The marker's lines of the prototype's `svRender` (only while marking). */
function drawMarks(mx: CanvasRenderingContext2D, r: Rect) {
  if (MARK.on) for (const [kz, p] of Object.entries(MARK.pts) as Array<[string, number[]]>) { const live = MARK.drag && kz === MARK.names[MARK.i]; const ex = live ? Math.max(6, MARK.drag.rx ?? 6) : p[2] !== undefined ? p[2] * r.h : 10, ey = live ? Math.max(6, MARK.drag.ry ?? 6) : p[3] !== undefined ? p[3] * r.h : ex, er = ((live ? MARK.drag.rot ?? 0 : p[4] ?? 0) * Math.PI) / 180; mx.strokeStyle = kz === MARK.last && !live ? 'rgba(255,214,150,.9)' : 'rgba(216,228,255,.8)'; mx.lineWidth = 1.5; mx.beginPath(); mx.ellipse(r.x + p[0]! * r.w, r.y + p[1]! * r.h, ex, ey, er, 0, Math.PI * 2); mx.stroke(); mx.fillStyle = 'rgba(216,228,255,.8)'; mx.font = '12px "IBM Plex Mono"'; mx.fillText(kz, r.x + p[0]! * r.w + 14, r.y + p[1]! * r.h + 4); }
}

/** The marker as `zones.ts` drives it. */
export const activityMarker = {
  names: (): string[] => [...MARK.names],
  start(rect: () => Rect | null): void { rectOf = rect; markStart(); },
  down: (x: number, y: number) => markDown(x, y),
  move: (x: number, y: number, circle: boolean) => markMove(x, y, circle),
  up: () => markUp(),
  wheel: (e: WheelEvent) => onWheel(e),
  draw: (mx: CanvasRenderingContext2D, r: Rect) => drawMarks(mx, r),
  on: (): boolean => MARK.on,
  dragging: (): boolean => !!MARK.drag,
  /** Ends the marking without keeping it. */
  abort(): void { MARK.on = false; MARK.drag = null; MARK.last = null; },
  result: () => S.zones,
  lookup: (): Lookup => $,
  setLookup(l: Lookup): void { $ = l; },
};
/** Tests' hook. */
export const _activityMarker = { S, MARK, zoneRadii, zoneAt, inEllipse };

const IDS: Partial<Record<SlotKey, Id[]>> = {
  'legs_seated.rest': ['legsW', 'legsB', 'floorShade'],
  'legs_seated.foot_raised': ['raisedW', 'raisedB'],
  feet_floor: ['feetW', 'feetB', 'feetTilt'],
  sole_close: ['closeH', 'closeY'],
};

export const activityPanel: FitPanel = {
  prototype: 'her_activity.html',
  ids: (key) => IDS[key] ?? [],
  controls: ACTIVITY_CONTROLS,
  writes: {
    closeH: ['fit.height'], closeY: ['fit.y'], legsW: ['fit.width'], legsB: ['fit.bottom'], raisedW: ['fit.width'], raisedB: ['fit.bottom'],
    floorShade: ['fit.floorShade'], feetW: ['fit.width'], feetB: ['fit.bottom'], feetTilt: ['fit.tilt'],
  },
  note: () => null,
  load(key, sc: ArtSidecar) {
    // the frame's reading (frame.ts `img`, service.ts): each picture's own `fit`; a value the sidecar lacks is the panel's default
    Object.assign(S, defaults(), { zones: null });
    const f = sc.fit ?? {};
    if (key === 'legs_seated.rest') { S.legsW = f.width ?? S.legsW; S.legsB = f.bottom ?? S.legsB; S.floorShade = f.floorShade ?? S.floorShade; }
    if (key === 'legs_seated.foot_raised') { S.raisedW = f.width ?? S.raisedW; S.raisedB = f.bottom ?? S.raisedB; }
    if (key === 'feet_floor') { S.feetW = f.width ?? S.feetW; S.feetB = f.bottom ?? S.feetB; S.feetTilt = f.tilt ?? S.feetTilt; }
    if (key === 'sole_close') { S.closeH = f.height ?? S.closeH; S.closeY = f.y ?? S.closeY; S.zones = sc.zones && !('right' in sc.zones) && Object.keys(sc.zones).length ? structuredClone(sc.zones) : null; }
  },
  value: (id) => S[id],
  bind(lookup) { $ = lookup; bindFit(); },
  copy(key) {
    if (key === 'sole_close') return JSON.parse(copySole());
    const j = JSON.parse(copyLegs());
    if (key === 'legs_seated.rest') return { fit: { ...j.states.rest, floorShade: j.floorShade } };
    if (key === 'legs_seated.foot_raised') return { fit: j.states.foot_raised };
    return { fit: j.feet_floor };
  },
};
