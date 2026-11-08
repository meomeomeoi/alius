import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { FakeStAdapter } from '../../src/st/fake';
import {
  METADATA_KEY, loadCampaign, initCampaign, writeNewCampaign, createSaver, exportCampaign, importCampaign,
} from '../../src/st/persistence';
import { createCampaign } from '../../src/engine/state/create';

const GROUP_A = { chatId: 'chat-a', isGroup: true, groupId: 'g1' };
const GROUP_B = { chatId: 'chat-b', isGroup: true, groupId: 'g2' };
const SOLO = { chatId: 'solo', isGroup: false };
const opts = { seed: 11, commanderName: 'Vale' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('persistence', () => {
  it('init in solo chat refuses with not_group', () => {
    const st = new FakeStAdapter(SOLO);
    expect(initCampaign(st, opts)).toEqual({ ok: false, reason: 'not_group' });
    expect(st.readMetadata(METADATA_KEY)).toBeUndefined();
  });

  it('init without a chat refuses with no_chat', () => {
    expect(initCampaign(new FakeStAdapter(), opts)).toEqual({ ok: false, reason: 'no_chat' });
  });

  it('init then load returns ok and same state', () => {
    const st = new FakeStAdapter(GROUP_A);
    const r = initCampaign(st, opts);
    expect(r.ok).toBe(true);
    const loaded = loadCampaign(st);
    expect(loaded.kind).toBe('ok');
    if (r.ok && loaded.kind === 'ok') {
      expect(loaded.state).toEqual(r.state);
      expect(loaded.chatId).toBe('chat-a');
    }
    expect(st.metadataSaves).toBe(1);
  });

  it('init refuses when a campaign already exists', () => {
    const st = new FakeStAdapter(GROUP_A);
    initCampaign(st, opts);
    expect(initCampaign(st, opts)).toEqual({ ok: false, reason: 'exists' });
  });

  it('load on chat without key is none', () => {
    expect(loadCampaign(new FakeStAdapter(GROUP_A)).kind).toBe('none');
    expect(loadCampaign(new FakeStAdapter()).kind).toBe('none');
  });

  it('future version loads readonly', () => {
    const st = new FakeStAdapter(GROUP_A);
    st.writeMetadata(METADATA_KEY, { version: 99 });
    const r = loadCampaign(st);
    expect(r.kind).toBe('readonly');
    if (r.kind === 'readonly') expect(r.reason).toMatch(/99/);
  });

  it('corrupt metadata is never overwritten', async () => {
    const st = new FakeStAdapter(GROUP_A);
    st.writeMetadata(METADATA_KEY, 'garbage');
    expect(loadCampaign(st).kind).toBe('readonly');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saver = createSaver(st, 'chat-a');
    saver.save(createCampaign(opts));
    await saver.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(st.readMetadata(METADATA_KEY)).toBe('garbage');
    expect(st.metadataSaves).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it('debounce coalesces three saves into one saveMetadata call', async () => {
    const st = new FakeStAdapter(GROUP_A);
    const saver = createSaver(st, 'chat-a', 500);
    const s = createCampaign(opts);
    saver.save({ ...s, day: 2 });
    saver.save({ ...s, day: 3 });
    saver.save({ ...s, day: 4 });
    expect(st.metadataSaves).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(st.metadataSaves).toBe(1);
    expect((st.readMetadata(METADATA_KEY) as { day: number }).day).toBe(4);
  });

  it('flush writes immediately and dispose drops pending writes', async () => {
    const st = new FakeStAdapter(GROUP_A);
    const saver = createSaver(st, 'chat-a');
    saver.save(createCampaign(opts));
    await saver.flush();
    expect(st.metadataSaves).toBe(1);
    saver.save({ ...createCampaign(opts), day: 5 });
    saver.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(st.metadataSaves).toBe(1);
    expect((st.readMetadata(METADATA_KEY) as { day: number }).day).toBe(1);
  });

  it('saver drops pending write after chat change', async () => {
    const st = new FakeStAdapter(GROUP_A);
    const init = initCampaign(st, opts);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saver = createSaver(st, 'chat-a');
    saver.save({ ...createCampaign(opts), day: 7 });
    st.switchChat(GROUP_B);
    await vi.advanceTimersByTimeAsync(1000);
    expect(st.readMetadata(METADATA_KEY)).toBeUndefined();
    st.switchChat(GROUP_A);
    if (init.ok) expect(st.readMetadata(METADATA_KEY)).toEqual(init.state);
    expect(warn).toHaveBeenCalled();
  });

  it('export/import round trip', () => {
    const s = createCampaign(opts);
    const text = exportCampaign(s);
    expect(text).toContain('\n');
    const r = importCampaign(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toEqual(s);
  });

  it('import of non-JSON text is invalid', () => {
    const r = importCampaign('not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('writeNewCampaign awaits save and refuses chat_changed and exists', async () => {
    const st = new FakeStAdapter(GROUP_A);
    const state = createCampaign(opts);

    // it waits for the metadata save to finish
    let release!: () => void;
    st.saveMetadata = () => new Promise<void>((r) => (release = r));
    let done = false;
    const pending = writeNewCampaign(st, state, 'chat-a').then((r) => { done = true; return r; });
    await Promise.resolve();
    expect(st.readMetadata(METADATA_KEY)).toEqual(state);
    expect(done).toBe(false);
    release();
    expect(await pending).toEqual({ ok: true });

    // a second write into the same chat is refused and leaves the first state alone
    st.saveMetadata = async () => {};
    expect(await writeNewCampaign(st, createCampaign({ seed: 2, commanderName: 'Other' }), 'chat-a')).toEqual({ ok: false, reason: 'exists' });
    expect((st.readMetadata(METADATA_KEY) as { commander: { name: string } }).commander.name).toBe('Vale');

    // the open chat is not the expected one
    const st2 = new FakeStAdapter(GROUP_B);
    expect(await writeNewCampaign(st2, state, 'chat-a')).toEqual({ ok: false, reason: 'chat_changed' });
    expect(st2.readMetadata(METADATA_KEY)).toBeUndefined();
    expect(st2.metadataSaves).toBe(0);
  });

  it('writeNewCampaign refuses no chat and solo chats', async () => {
    expect(await writeNewCampaign(new FakeStAdapter(), createCampaign(opts), 'x')).toEqual({ ok: false, reason: 'no_chat' });
    const solo = new FakeStAdapter(SOLO);
    expect(await writeNewCampaign(solo, createCampaign(opts), 'solo')).toEqual({ ok: false, reason: 'not_group' });
    expect(solo.readMetadata(METADATA_KEY)).toBeUndefined();
  });

  it('writeNewCampaign removes the state again when saving fails', async () => {
    const st = new FakeStAdapter(GROUP_A);
    st.saveMetadata = async () => { throw new Error('disk full'); };
    await expect(writeNewCampaign(st, createCampaign(opts), 'chat-a')).rejects.toThrow('disk full');
    expect(st.readMetadata(METADATA_KEY)).toBeUndefined();
  });
});
