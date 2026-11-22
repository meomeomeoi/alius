// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import { FakeStAdapter } from '../src/st/fake';

const resetSpy = vi.hoisted(() => vi.fn());
vi.mock('../src/ui/dynamic/section', async (orig) => {
  const actual = await orig<typeof import('../src/ui/dynamic/section')>();
  return { ...actual, resetDynamicSection: () => { resetSpy(); actual.resetDynamicSection(); } };
});

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('P15 M19: the exit card an open dossier kept belongs to one chat', () => {
  it('a chat switch closes the open exit cards', async () => {
    const st = new FakeStAdapter({ chatId: 'a', isGroup: false });
    const sh = { open() {}, close() {}, isOpen: () => true, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {}, setTabLocked() {}, setTabBadge() {}, toast() {}, async modal() { return null; }, setPalette() {}, refresh() {}, destroy() {} };
    const app = createApp(st, { loadContent: async () => content, shellFactory: () => sh as never });
    await app.start();
    resetSpy.mockClear();
    st.switchChat({ chatId: 'b', isGroup: false });
    expect(resetSpy).toHaveBeenCalled();
  });
});
