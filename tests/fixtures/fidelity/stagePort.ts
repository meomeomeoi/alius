/** A fixture for the stage setup's gate (P10e-f): an edited port of weight.html's "copy the fit" and of its sliders. */
type Any = any;
const S: Any = { overH: 1.04, overX: 0.5, overSink: 0 };
// the port's copyOver with a key renamed (an undeclared difference)
export function copyOver(): string { const j = JSON.stringify({ slot: 'over', fit: { height: S.overH, left: S.overX, sink: S.overSink } }); return j; }
// weight.html's sliders, `overSink`'s maximum changed
export const WEIGHT_CONTROLS = {
  overH: { label: 'over height', type: 'range', min: 0.6, max: 1.8, step: 0.01, value: 1.04 },
  overX: { label: 'over x', type: 'range', min: 0.3, max: 0.7, step: 0.01, value: 0.5 },
  overSink: { label: 'over sink', type: 'range', min: 0, max: 0.5, step: 0.01, value: 0 },
};
