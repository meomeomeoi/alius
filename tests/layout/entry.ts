/**
 * P10e: the browser entry of the layout test (`npm run test:layout`): renders the real scene screen into the page for one named
 * fixture (`?fixture=one|three|curtain|long|physics`). A knee-length placeholder sprite (tests/fixtures/layout/sprite.svg), never the
 * author's art; the content and the campaign states are fetched (the script serves the repo root); the model is never called.
 */
import { loadPacks } from '../../src/content/loader';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import type { ChatMessage } from '../../src/st/adapter';
import { renderSceneScreen } from '../../src/ui/scene/sceneScreen';

const params = new URLSearchParams(location.search);
const fixture = params.get('fixture') ?? 'one';
const states = (await (await fetch('/.superpowers/layout/states.json')).json()) as Record<string, never>;
const loaded = await loadPacks(['content/core'], (p: string) => fetch('/' + p).then((r) => r.json()));
const state = states[fixture === 'three' ? 'three' : fixture === 'physics' ? 'physics' : 'one'];

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
renderSceneScreen(view, {
  controller: controller as never, getState: () => state, registries: loaded.registries, st: st as never,
  settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded() {}, onClose() {}, assetUrl: (p: string) => '/' + p, onOrder: () => false,
  physics: { input: noop, endSegment: noop, stopWord: noop, skip: noop, stimulus: noop, act: noop, finishCounted: noop, cue: () => null, beat: () => 0, keystroke() {}, typed: () => null, onTap() {} } as never,
});
if (fixture === 'curtain') (root.querySelector('[data-action="history"]') as HTMLElement).click();
document.body.dataset.ready = 'true';
