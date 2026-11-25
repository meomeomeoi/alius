/**
 * P10e: the browser entry of the layout test (`npm run test:layout`): renders the real scene screen into the page for one named
 * fixture (`?fixture=one|two|three|four|curtain|long|physics|chips|chipsmany|dialname|dialwide|call|callhold`). A knee-length placeholder sprite (tests/fixtures/layout/sprite.svg), never the
 * author's art; the content and the campaign states are fetched (the script serves the repo root); the model is never called.
 */
import { loadPacks } from '../../src/content/loader';
import { registerFrameReader } from '../../src/engine/blocking';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import type { ChatMessage } from '../../src/st/adapter';
import { renderSceneScreen } from '../../src/ui/scene/sceneScreen';

registerFrameReader(() => 'play');
const params = new URLSearchParams(location.search);
const fixture = params.get('fixture') ?? 'one';
const states = (await (await fetch('/.superpowers/layout/states.json')).json()) as Record<string, never>;
const loaded = await loadPacks(['content/core'], (p: string) => fetch('/' + p).then((r) => r.json()));
const state = states[['two', 'three', 'four', 'physics', 'dialname', 'dialwide', 'call', 'callhold'].includes(fixture) ? fixture : 'one'];

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
const noop = (): [] => [];
const screen = renderSceneScreen(view, {
  controller: controller as never, getState: () => state, registries: loaded.registries, st: st as never,
  settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded() {}, onClose() {}, assetUrl: (p: string) => '/' + p, onOrder: () => false,
  physics: { input: noop, endSegment: noop, stopWord: noop, skip: noop, stimulus: noop, act: noop, finishCounted: noop, cue: () => 'Her breath comes short.', beat: () => 0, clock: () => ({ startedAt: null, beatMs: 1500, now: 0 }), keystroke() {}, typed: () => null, onTap() {} } as never,
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
document.body.dataset.ready = 'true';
