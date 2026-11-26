/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ArtSidecar } from '../../scene/art';
import type { FitPanel, Lookup } from './panel';

/**
 * P10e-f: weight.html's panel, the over slot (`over`, and `over_explicit` with the same sidecar: gulp.html reads it as weight's). Ported:
 * the three sliders (`WEIGHT_CONTROLS`), their binding (`bindOver`) and "copy the fit" (`copyOver`). The prototype's `S` holds only the
 * over fit here; `$` is the editor's.
 */
type Any = any;

export const WEIGHT_CONTROLS = {
  overH: { label: 'over height', type: 'range', min: 0.6, max: 1.8, step: 0.01, value: 1.04 },
  overX: { label: 'over x', type: 'range', min: 0.3, max: 0.7, step: 0.01, value: 0.5 },
  overSink: { label: 'over sink', type: 'range', min: 0, max: 0.3, step: 0.01, value: 0 },
} as const;

let $: Lookup = () => null;
const S: Any = { overH: WEIGHT_CONTROLS.overH.value, overX: WEIGHT_CONTROLS.overX.value, overSink: WEIGHT_CONTROLS.overSink.value };

function bindOver() {
  for (const [id, key] of [['overH', 'overH'], ['overX', 'overX'], ['overSink', 'overSink']]) { const el = $(`#${id}`); el.oninput = () => { S[key] = Number(el.value); $(`#${id}V`).textContent = el.value; }; }
}
function copyOver() { const j = JSON.stringify({ slot: 'over', fit: { height: S.overH, x: S.overX, sink: S.overSink } }); return j; }

export const weightPanel: FitPanel = {
  prototype: 'weight.html',
  ids: () => ['overH', 'overX', 'overSink'],
  controls: WEIGHT_CONTROLS,
  writes: { overH: ['fit.height'], overX: ['fit.x'], overSink: ['fit.sink'] },
  note: () => null,
  load(_key, sc: ArtSidecar) {
    // the instrument's reading (weight.ts, gulp.ts): a fit the sidecar lacks is the panel's default
    const f = sc.fit ?? {};
    S.overH = f.height ?? WEIGHT_CONTROLS.overH.value; S.overX = f.x ?? WEIGHT_CONTROLS.overX.value; S.overSink = f.sink ?? WEIGHT_CONTROLS.overSink.value;
  },
  value: (id) => S[id],
  bind(lookup) { $ = lookup; bindOver(); },
  copy: () => JSON.parse(copyOver()),
};
