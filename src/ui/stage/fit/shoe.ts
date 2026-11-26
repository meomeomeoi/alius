/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ArtSidecar } from '../../scene/art';
import { FRONT, KINDS, SOLE_TWO } from '../../scene/instruments/shoe/shoe';
import type { SlotKey } from '../slots';
import type { FitPanel, Lookup } from './panel';

/**
 * P10e-f: shoe.html's panel, her footwear from above (`shoe_close.<kind>`) and its sole (`shoe_sole.<kind>`). Ported: the feet and
 * shown pickers and the six sliders (`SHOE_CONTROLS`), the picture's state (`S.feet`, `S.shown`, `S.fit` per picture with the sole's own
 * defaults: `reset`), the prototype's helpers (`view`, `slotKey`, `twoFeet`, `mirrored`, `footX`, `zonesNow`, `K`), its handlers
 * (`bindShoeFeet`, `bindShoeFit`, `syncFit`) and "copy the fit" (`copyFit`). The kind and the view are the slot key's (the prototype's
 * kind buttons and view picker are not shown); the play state `G` keeps what the handlers touch; `begin`, `ensureSurface` and `nextWant`
 * are the game's and never run here (`G.phase` is never `loop`).
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

let $: Lookup = () => null;
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
