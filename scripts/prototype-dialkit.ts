// P16b (gate G1): the dial's own drawing code for a prototype that names %%DIALKIT%%, bundled for the browser at build time so
// the prototype never carries a stale copy: `window.DialKit = { mannequinSvg, pose, poseOf, BASE_POINTS, PRESETS }`.
import { mannequinSvg } from '../src/ui/scene/dial/draw';
import { pose } from '../src/ui/scene/dial/mannequin';
import { BASE_POINTS, poseOf } from '../src/ui/scene/dial/points';
import { PRESETS } from '../tests/fixtures/dial/presets';

(globalThis as unknown as { DialKit: unknown }).DialKit = { mannequinSvg, pose, poseOf, BASE_POINTS, PRESETS };
