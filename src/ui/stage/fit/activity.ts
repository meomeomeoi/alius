/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ArtSidecar } from '../../scene/art';
import type { SlotKey } from '../slots';
import type { FitPanel, Lookup } from './panel';

/**
 * P10e-f: her_activity.html's panel: the legs under her desk (`legs_seated.rest` with the floor shadow, `legs_seated.foot_raised`), her
 * feet on the floor (`feet_floor`) and the sole's close-up (`sole_close`, foot service). Ported: the sliders (`ACTIVITY_CONTROLS`), the
 * prototype's `bindRange` and its call line (`bindFit`; the controls the editor does not show are detached stand-ins), "copy the fit"
 * (`copyLegs`, the button's `copyFit`: one JSON for the three legs pictures, split here into each picture's sidecar as the frame reads it: `frame.ts`) and the
 * sole's JSON (`copySole`, the line of the marker's `markFinish`).
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

let $: Lookup = () => null;
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
