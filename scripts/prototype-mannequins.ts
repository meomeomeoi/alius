// P10e chunk (e): the dial's mannequins of the 13 base postures as SVG strings (JSON on stdout), for `npm run proto` (a prototype that names %%MANNEQUINS%%).
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>');
(globalThis as any).document = dom.window.document;
const { mannequinSvg } = await import('../src/ui/scene/dial/draw');
const { poseOf } = await import('../src/ui/scene/dial/points');
const ids = ['standing', 'standing_attention', 'sitting', 'sitting_floor', 'kneeling_upright', 'kneeling_sitting', 'bowing', 'all_fours', 'crouching', 'lying_back', 'lying_front', 'lying_side', 'curled'];
const out: Record<string, string> = {};
for (const id of ids) { const p = poseOf(id); if (p) out[id] = mannequinSvg(p).outerHTML; }
console.log(JSON.stringify(out));
