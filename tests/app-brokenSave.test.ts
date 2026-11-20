// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import { createCampaign } from '../src/engine/state/create';
import { FakeStAdapter } from '../src/st/fake';

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
});

const shell = () => ({
  open() {}, close() {}, isOpen: () => false, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {},
  setTabLocked() {}, setTabBadge() {}, toast() {}, modal: async () => null, closeModal() {}, setPalette() {}, refresh() {}, destroy() {},
});

describe('a save that passes migrate but breaks the load (0.1 audit)', () => {
  it('opens read-only instead of throwing, and the next chat opens normally', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const st = new FakeStAdapter({ chatId: 'bad', isGroup: true, groupId: 'g' });
    const broken = JSON.parse(JSON.stringify(createCampaign({ seed: 1, commanderName: 'Vale' })));
    broken.scene = { id: 's1', participants: null, startIndex: 0 }; // an open scene with no participant list throws on resume
    st.writeMetadata('alius', broken);
    const app = createApp(st, { loadContent: async () => content, shellFactory: () => shell() as never });
    await expect(app.start()).resolves.toBeUndefined();
    expect(app.current().load.kind).toBe('readonly');
    expect(app.current().state).toBeNull();
    expect(st.readMetadata('alius')).toEqual(broken); // nothing was overwritten
    st.switchChat({ chatId: 'fresh', isGroup: true, groupId: 'g2' });
    expect(app.current().load.kind).toBe('none');
  });
});
