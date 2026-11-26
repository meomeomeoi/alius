import type { FitPanel } from './panel';

/**
 * P10e-f: slap.html's panel for `face_close`: a loader alone ("face art", drawn `object-fit: cover` over the whole frame). The prototype
 * fits nothing; her face point is her look's (`stage.json`, her page).
 */
export const slapPanel: FitPanel = {
  prototype: 'slap.html',
  ids: () => [],
  controls: {},
  writes: {},
  note: () => 'Her face close, filling the frame. Nothing to fit: the slap\'s camera covers the frame with it.',
  load: () => {},
  value: () => 0,
  bind: () => {},
  copy: () => ({}),
};
