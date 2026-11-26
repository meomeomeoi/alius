/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ArtSidecar } from '../../scene/art';
import type { SlotKey } from '../slots';
import type { FitPanel, Lookup } from './panel';

/**
 * P10e-f: throne.html's panel, her legs astride (`legs_astride`, and its two files `legs_astride.left` / `.right` as a pair: the fit is
 * the left file's, as the resolver reads it). Ported: "the picture is" and the four sliders (`THRONE_CONTROLS`), the prototype's
 * `bindRange`, its call line and the select's handler (`bindThrone`; the prototype's pictures are detached stand-ins) and "copy the fit"
 * (`astrideFit`).
 */
type Any = any;

export const THRONE_CONTROLS = {
  astrideFeet: {
    label: 'the picture is', type: 'select', value: 'left',
    options: [
      ['left', 'her left leg (the one on the left of the screen; mirrored for the right)'],
      ['right', 'her right leg (the one on the right of the screen; mirrored for the left)'],
      ['pair', 'two pictures: left and right (no mirror)'],
      ['two', 'both legs in one picture'],
    ],
  },
  aH: { label: 'art height', type: 'range', min: 0.4, max: 1.6, step: 0.01, value: 1 },
  aX: { label: 'art x (the leg\'s centre)', type: 'range', min: -0.1, max: 0.4, step: 0.005, value: 0.08 },
  aTop: { label: 'art top', type: 'range', min: -0.6, max: 0.4, step: 0.01, value: -0.1 },
  aTilt: { label: 'art tilt °', type: 'range', min: -30, max: 30, step: 1, value: 8 },
} as const;

let $: Lookup = () => null;
/** The prototype's `S`: the astride art's fit and how many legs the picture holds. */
const S: Any = { legsArt: null, legsArtR: null, legsFeet: 'left', aH: 1.0, aX: 0.08, aTop: -0.1, aTilt: 8 };
const updatePresenceNote = (): void => {};

const bindRange = (id: string, key: string) => { const el = $(`#${id}`); const sync = () => { S[key] = Number(el.value); const v = $(`#${id}V`); if (v) v.textContent = String(S[key]); updatePresenceNote(); }; el.oninput = sync; sync(); };
function bindThrone() {
  bindRange('frameDrain', 'frameDrain'); bindRange('aH', 'aH'); bindRange('aX', 'aX'); bindRange('aTop', 'aTop'); bindRange('aTilt', 'aTilt');
  $('#astrideFeet').onchange = (e: Any) => { S.legsFeet = e.target.value; $('#astrideR').src = S.legsFeet === 'pair' && S.legsArtR ? S.legsArtR : (S.legsArt ?? ''); };
}
function astrideFit() { const j = JSON.stringify({ slot: 'legs_astride', feet: S.legsFeet === 'two' ? 'two' : S.legsFeet === 'pair' ? 'pair' : 'one', ...(S.legsFeet === 'left' || S.legsFeet === 'right' ? { shown: S.legsFeet } : {}), fit: { height: S.aH, x: S.aX, top: S.aTop, tilt: S.aTilt } }); return j; }

export const thronePanel: FitPanel = {
  prototype: 'throne.html',
  ids: (key: SlotKey) => (key === 'legs_astride.right' ? [] : ['astrideFeet', 'aH', 'aX', 'aTop', 'aTilt']),
  controls: THRONE_CONTROLS,
  writes: { astrideFeet: ['feet', 'shown'], aH: ['fit.height'], aX: ['fit.x'], aTop: ['fit.top'], aTilt: ['fit.tilt'] },
  note: (key) => (key === 'legs_astride.right' ? 'The fit of the two pictures is the left one\'s.' : null),
  load(key, sc: ArtSidecar) {
    // the frame's reading (frame.ts): a pair, both legs in one, or the leg shown; the left file of a pair carries the pair's fit
    S.legsFeet = sc.feet === 'pair' || (sc.feet === undefined && key === 'legs_astride.left') ? 'pair' : sc.feet === 'two' ? 'two' : sc.shown === 'right' ? 'right' : 'left';
    const f = sc.fit ?? {};
    S.aH = f.height ?? THRONE_CONTROLS.aH.value; S.aX = f.x ?? THRONE_CONTROLS.aX.value; S.aTop = f.top ?? THRONE_CONTROLS.aTop.value; S.aTilt = f.tilt ?? THRONE_CONTROLS.aTilt.value;
  },
  value: (id) => (id === 'astrideFeet' ? S.legsFeet : S[id]),
  bind(lookup) { $ = lookup; bindThrone(); },
  copy: () => JSON.parse(astrideFit()),
};
