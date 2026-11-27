/**
 * P10e: the browser entry of the layout test (`npm run test:layout`): renders the real scene screen into the page for one named
 * fixture (`?fixture=one|two|three|four|curtain|long|physics|chips|chipsmany|dialname|dialwide|call|callhold|slap|slaphold|breath|breathhold|weight|weightfoot|weightup|weighthold|scent|scenthold|jaw|jawring|jawhold|activity|activityhold|throne|thronehold|service|servicehold|provocation|shoe|shoeheels|shoehold|gulp|gulphold|posture|posturehold|posturecallb|posturecallc`). A knee-length placeholder sprite (tests/fixtures/layout/sprite.svg), never the
 * author's art; the content and the campaign states are fetched (the script serves the repo root); the model is never called.
 */
import { loadPacks } from '../../src/content/loader';
import { registerFrameReader } from '../../src/engine/blocking';
import { registerPhysicsStyle } from '../../src/engine/physics/style';
import { _breath } from '../../src/ui/scene/instruments/breath/breath';
import { _weight } from '../../src/ui/scene/instruments/weight/weight';
import { _scent } from '../../src/ui/scene/instruments/scent/scent';
import { _jaw } from '../../src/ui/scene/instruments/jaw/jaw';
import { _activity } from '../../src/ui/scene/instruments/activity/frame';
import * as throneHooks from '../../src/ui/scene/instruments/activity/throne';
import { _service } from '../../src/ui/scene/instruments/activity/service';
import { _provocation } from '../../src/ui/scene/instruments/activity/provocation';
import { _shoe } from '../../src/ui/scene/instruments/shoe/shoe';
import { _gulp } from '../../src/ui/scene/instruments/gulp/gulp';
import { _posture } from '../../src/ui/scene/instruments/posture/posture';
import type { ArtSlots } from '../../src/ui/scene/art';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import type { ChatMessage } from '../../src/st/adapter';
import { renderSceneScreen } from '../../src/ui/scene/sceneScreen';

registerFrameReader(() => 'play');
const params = new URLSearchParams(location.search);
const fixture = params.get('fixture') ?? 'one';
const states = (await (await fetch('/.superpowers/layout/states.json')).json()) as Record<string, never>;
const loaded = await loadPacks(['content/core'], (p: string) => fetch('/' + p).then((r) => r.json()));
const state = states[['two', 'three', 'four', 'physics', 'dialname', 'dialwide', 'call', 'callhold', 'slap', 'slaphold', 'breath', 'breathhold', 'weight', 'weightfoot', 'weightup', 'weighthold', 'scent', 'scenthold', 'jaw', 'jawring', 'jawhold', 'activity', 'activityhold', 'throne', 'thronehold', 'service', 'servicehold', 'provocation', 'shoe', 'shoeheels', 'shoehold', 'gulp', 'gulphold', 'posture', 'posturehold', 'posturecallb', 'posturecallc'].includes(fixture) ? fixture : 'one'];
// the breath instrument (P10e-e Task 14): `&style=<key>` is her physics style; `&quiet=1` clears the plan's openings (the shots open the windows
// themselves through `window.__breath`, as the prototype's through its hooks); the segment started as the page loaded; the stop word ends the hold (the run goes, the scene redraws), as the engine's does
// the weight instrument (P10e-e Task 16): the same, `&quiet=1` clearing the plan's shifts (the shots shift her through `window.__weight`)
const weighing = fixture.startsWith('weight');
// the scent instrument (P10e-e Task 18): the same; the shots drive her orders and her question through `window.__scent`
const scenting = fixture.startsWith('scent');
// the jaw instrument (P10e-e Task 20): the same; `&quiet=1` clears her planned moves (the shots move her through `window.__jaw`)
const jawing = fixture.startsWith('jaw');
// her frame (P10e-e Task 24): the shots drive her and the commander's attention through `window.__activity`
const framing = fixture.startsWith('activity') || fixture.startsWith('throne') || fixture.startsWith('service') || fixture.startsWith('provocation');
// shoe service (P10e-e Task 28): the layout fixture's sprite stands for her two pictures of her footwear (the author's art is never committed),
// one foot each, the prototype's default fit; the shots drive it through `window.__shoe`
const shoeing = fixture.startsWith('shoe');
// gulp (P10e-e Task 30): her sprite from below by default; `&art=<picture>` gives her the `over` slot (the layout fixture's sprite stands for the
// author's art); `&explicit=1` the `over_explicit` slot instead; the shots drive it through `window.__gulp`
const gulping = fixture.startsWith('gulp');
// the game of postures (P16b Tasks 23 and 24): the shots drive it through `window.__posture`; the stop word ends the hold (its run goes, the scene redraws)
const posturing = fixture.startsWith('posture');
const breathing = fixture === 'breath' || fixture === 'breathhold' || weighing || scenting || jawing || framing || shoeing || gulping;
if (breathing && params.get('style')) registerPhysicsStyle(() => ({ primary: params.get('style') as never }));
const run = (state as { scene?: { physics?: { segment: { plan?: { beats: Array<{ opening?: unknown; cue?: unknown; shift?: unknown; order?: unknown; orderMs?: unknown; ask?: unknown }> } } } } }).scene?.physics;
if (breathing && params.get('quiet') === '1') for (const b of (run?.segment.plan?.beats ?? []) as Array<Record<string, unknown>>) { delete b.opening; delete b.cue; delete b.shift; delete b.order; delete b.orderMs; delete b.ask; if (b.flow) b.flow = { level: (b.flow as { level: number }).level }; }
const startedAt = Date.now();


const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const msg = (index: number, over: Partial<ChatMessage>): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: '', swipeId: 0, swipeCount: 2, ...over });
const messages: ChatMessage[] = [msg(0, { isUser: true, name: 'Vale', avatar: undefined, swipeCount: undefined, text: 'Close the door and sit down. We need to talk about the patrol.' })];
messages.push(msg(1, { text: fixture === 'long' ? `*She stretches on her bed.* "${words(150)}" she says.` : '*She stretches on her bed, and does not hurry.* "Close the door yourself," she says, and a small smile tugs at the corner of her mouth. "Then we talk. The patrol went badly, and you know it."' }));
if (fixture === 'three') messages.push(msg(2, { name: 'Bea', avatar: 'bea.png', text: '"Leave her alone." *Bea leans on the wall.*' }));

const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }) as unknown as FakeStAdapter & { getSpriteUrl: () => Promise<string> };
st.getSpriteUrl = async () => '/tests/fixtures/layout/sprite.svg';
const controller = {
  send: async () => true, propose() {}, answer() {}, end: async () => {}, edit: async () => {}, stop() {}, onEdited() {}, transcript: () => messages, onSwipe() {},
  resume() {}, idle() {}, dispose() {}, start() {}, replyPending: () => false, rerollState: () => ({ enabled: false, reason: 'Nothing was read yet.' }), stage: () => [],
};
const root = document.createElement('div');
root.id = 'alius-shell';
root.dataset.screen = 'scene';
root.innerHTML = '<div class="alius-frame"><div class="alius-view"></div></div>';
document.body.append(root);
const view = root.querySelector('.alius-view') as HTMLElement;
const SPRITE = params.get('art') ?? '/tests/fixtures/layout/sprite.svg';
const art: ArtSlots | undefined = shoeing ? {
  get: (_unitId, slot) => (/^shoe_(close|sole)\./.test(slot) ? { url: SPRITE, sidecar: { feet: 'one', shown: 'right' } } : null),
  face: () => null,
} : gulping && params.get('art') ? {
  get: (_unitId, slot, gate) => (slot === 'over' || (slot === 'over_explicit' && gate?.explicit === true && params.get('explicit') === '1') ? { url: SPRITE, sidecar: {} } : null),
  face: () => null,
} : undefined;
if (gulping && params.get('explicit') === '1') { const c = (state as { content?: { enabled: string[] } }).content; if (c) c.enabled = [...c.enabled, 'explicit_scenes']; }
const noop = (): [] => [];
const screen = renderSceneScreen(view, {
  controller: controller as never, getState: () => state, registries: loaded.registries, st: st as never,
  settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded() {}, onClose() {}, assetUrl: (p: string) => '/' + p, onOrder: () => false,
  ...(art ? { art } : {}),
  onSlap() {}, // P10e-e Task 12: the slap draws (its answer is not applied: the page's state is static)
  physics: {
    input: noop, endSegment: noop, skip: noop, stimulus: noop, act: noop, finishCounted: noop, beat: () => 0, keystroke() {}, typed: () => null, onTap() {},
    stopWord: () => {
      if (breathing && run) { delete (state as { scene: { physics?: unknown } }).scene.physics; screen.refresh(); }
      if (posturing) { delete (state as { practices?: { postureRun?: unknown } }).practices?.postureRun; screen.refresh(); }
      return [];
    },
    cue: () => 'Her breath comes short.', // the cue pool's narration: the card's (her hand on breath writes her own lines, card-voice.md §7)
    clock: () => (breathing ? { startedAt, beatMs: 1500, now: Date.now() } : { startedAt: null, beatMs: 1500, now: 0 }),
  } as never,
});
// review I3: ordinary chips (they fit) or too many (some really overflow); added to a slot of the row, which a redraw leaves alone
if (fixture === 'chips' || fixture === 'chipsmany') {
  const slot = document.querySelector('.alius-chip-slot[data-slot="freq"]') as HTMLElement;
  for (let i = 0; i < (fixture === 'chips' ? 4 : 40); i++) slot.append(Object.assign(document.createElement('button'), { type: 'button', className: 'alius-btn alius-chip alius-test-chip', textContent: `chip ${i + 1}` }));
  screen.refresh();
}
if (fixture === 'curtain') (root.querySelector('[data-action="history"]') as HTMLElement).click();
// the shots (scripts/instrument-moments.mjs): `&deferCall=1` holds her call back until `window.__callNow()`, so the port's call starts when the
// prototype's does (the page's own load time would put the port a second ahead)
if (params.get('deferCall') === '1') {
  const pr = (state as { practices?: { call?: unknown } }).practices;
  const held = pr?.call;
  if (pr) delete pr.call;
  screen.refresh();
  (window as unknown as { __callNow: () => void }).__callNow = () => { if (pr) pr.call = held; screen.refresh(); };
}
// the slap (P10e-e Task 12): `&feints=N` gives her slap N feints; `&deferSlap=1` holds it back until `window.__slapNow()` (the shots start it when the
// prototype's starts; the layout test measures the scene first)
const sp = (state as { practices?: { slap?: { feints: number } } }).practices;
if (sp?.slap && params.get('feints') !== null) sp.slap.feints = Number(params.get('feints'));
if (params.get('deferSlap') === '1' && sp?.slap) {
  const held = sp.slap;
  delete sp.slap;
  screen.refresh();
  (window as unknown as { __slapNow: () => void }).__slapNow = () => { sp.slap = held; screen.refresh(); };
}
if (scenting) (window as unknown as { __scent: typeof _scent }).__scent = _scent;
if (jawing) (window as unknown as { __jaw: typeof _jaw }).__jaw = _jaw;
if (shoeing) (window as unknown as { __shoe: typeof _shoe }).__shoe = _shoe;
if (gulping) (window as unknown as { __gulp: typeof _gulp }).__gulp = _gulp;
if (posturing) (window as unknown as { __posture: typeof _posture }).__posture = _posture;
if (framing) Object.assign(window as unknown as Record<string, unknown>, { __activity: _activity, __throne: throneHooks, __weight: _weight, __service: _service, __provocation: _provocation });
if (breathing && !weighing && !scenting && !jawing && !framing && !shoeing && !gulping) (window as unknown as { __breath: typeof _breath }).__breath = _breath;
if (weighing) (window as unknown as { __weight: typeof _weight }).__weight = _weight;
document.body.dataset.ready = 'true';
