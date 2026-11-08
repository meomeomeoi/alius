import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, type AliusApp } from '../src/app';
import { FakeStAdapter } from '../src/st/fake';
import { emptyRegistries, type ContentError } from '../src/content/types';
import { METADATA_KEY } from '../src/st/persistence';
import { createCampaign } from '../src/engine/state/create';
import type { ShellApi, ShellDeps } from '../src/ui/shell/shell';

const A = { chatId: 'chat-a', isGroup: true, groupId: 'g1' };
const B = { chatId: 'chat-b', isGroup: true, groupId: 'g2' };
const SOLO = { chatId: 'solo', isGroup: false };

function fakeShell() {
  const toasts: Array<{ kind: string; text: string }> = [];
  let deps!: ShellDeps;
  const shell = {
    opened: 0,
    refreshes: 0,
    toasts,
    open() { shell.opened++; },
    close() {},
    isOpen: () => false,
    showScreen() {},
    showTab() {},
    registerTab() {},
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    modal: async () => null,
    setPalette() {},
    refresh() { shell.refreshes++; },
    destroy() {},
  };
  return { shell: shell as typeof shell & ShellApi, factory: (d: ShellDeps) => { deps = d; return shell as unknown as ShellApi; }, deps: () => deps };
}

const okContent = async () => ({ registries: emptyRegistries(), errors: [] as ContentError[] });

async function boot(chat: typeof A | typeof SOLO | null, loadContent = okContent) {
  const st = new FakeStAdapter(chat);
  const fs = fakeShell();
  const app: AliusApp = createApp(st, { loadContent, shellFactory: fs.factory as never });
  await app.start();
  return { st, app, ...fs };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('app', () => {
  it('start with no campaign gives load none and clears injections', async () => {
    const st = new FakeStAdapter(A);
    st.setInjection('ctx', 'stale', 'in_prompt', 0);
    st.setInjection('dir', 'stale', 'in_chat', 1);
    const app = createApp(st, { loadContent: okContent, shellFactory: fakeShell().factory as never });
    await app.start();
    expect(app.current()).toEqual({ load: { kind: 'none' }, state: null });
    expect(st.injections.size).toBe(0);
  });

  it('initCampaign in group chat creates state, saves, injects header', async () => {
    const { st, app, shell } = await boot(A);
    await app.initCampaign();
    const { state, load } = app.current();
    expect(load.kind).toBe('ok');
    expect(state!.version).toBe(1);
    expect((st.readMetadata(METADATA_KEY) as { version: number }).version).toBe(1);
    expect(st.metadataSaves).toBeGreaterThan(0);
    expect(st.injections.get('ctx')!.text).toContain('Day 1, Morning.');
    expect(shell.refreshes).toBeGreaterThan(0);
    expect(shell.toasts.some((t) => t.kind === 'info')).toBe(true);
  });

  it('initCampaign in solo chat toasts and creates nothing', async () => {
    const { st, app, shell } = await boot(SOLO);
    await app.initCampaign();
    expect(st.readMetadata(METADATA_KEY)).toBeUndefined();
    expect(app.current().state).toBeNull();
    expect(shell.toasts).toEqual([{ kind: 'warn', text: expect.stringMatching(/group chat/i) }]);
  });

  it('initCampaign twice tells the user the campaign exists', async () => {
    const { app, shell } = await boot(A);
    await app.initCampaign();
    shell.toasts.length = 0;
    await app.initCampaign();
    expect(shell.toasts).toEqual([{ kind: 'info', text: expect.stringMatching(/already/i) }]);
  });

  it('chat switch reloads the other chat\'s campaign', async () => {
    const { st, app } = await boot(A);
    await app.initCampaign();
    st.switchChat(B);
    expect(app.current()).toEqual({ load: { kind: 'none' }, state: null });
    expect(st.injections.size).toBe(0);
    st.switchChat(A);
    expect(app.current().load.kind).toBe('ok');
    expect(app.current().state!.commander.name).toBeDefined();
    expect(st.injections.get('ctx')!.text).toContain('Day 1');
  });

  it('dispatch rolls, saves after the debounce and re-injects', async () => {
    const { st, app, shell } = await boot(A);
    await app.initCampaign();
    const savesBefore = st.metadataSaves;
    const refreshesBefore = shell.refreshes;
    const before = app.current().state!;
    const events = app.dispatch({ type: 'debug/roll', payload: { sides: 6 } });
    expect(events[0]).toMatchObject({ type: 'rolled' });
    expect(app.current().state!.rng).not.toEqual(before.rng);
    expect(shell.refreshes).toBe(refreshesBefore + 1);
    await vi.advanceTimersByTimeAsync(600);
    expect(st.metadataSaves).toBe(savesBefore + 1);
    expect((st.readMetadata(METADATA_KEY) as { rng: unknown }).rng).toEqual(app.current().state!.rng);
  });

  it('dispatch in readonly campaign does not save', async () => {
    const st = new FakeStAdapter(A);
    st.writeMetadata(METADATA_KEY, 'garbage');
    const fs = fakeShell();
    const app = createApp(st, { loadContent: okContent, shellFactory: fs.factory as never });
    await app.start();
    expect(app.current().load.kind).toBe('readonly');
    const events = app.dispatch({ type: 'debug/roll', payload: { sides: 6 } });
    expect(events).toEqual([{ type: 'error', code: 'read_only', message: expect.any(String) }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(st.metadataSaves).toBe(0);
    expect(st.readMetadata(METADATA_KEY)).toBe('garbage');
    expect(fs.shell.toasts.some((t) => t.kind === 'warn' && /read-only/i.test(t.text))).toBe(true);
  });

  it('dispatch without a campaign returns an error event', async () => {
    const { app } = await boot(A);
    expect(app.dispatch({ type: 'debug/noop' })).toEqual([{ type: 'error', code: 'no_campaign', message: expect.any(String) }]);
  });

  it('content errors produce one toast', async () => {
    const errors: ContentError[] = [1, 2, 3].map((i) => ({ pack: 'p', file: 'f.json', path: `[${i}]`, message: 'bad' }));
    const { shell, deps } = await boot(A, async () => ({ registries: emptyRegistries(), errors }));
    expect(shell.toasts).toEqual([{ kind: 'warn', text: 'Content: 3 error(s) — see SYS › debug' }]);
    expect(deps().getContentErrors!()).toEqual(errors);
  });

  it('a content loader that throws still lets the app start', async () => {
    const { app, shell } = await boot(A, async () => { throw new Error('offline'); });
    expect(shell.toasts).toHaveLength(1);
    expect(shell.toasts[0].text).toContain('Content');
    expect(app.current().load.kind).toBe('none');
  });

  it('message_received drops next_reply directives from the injection', async () => {
    const { st, app } = await boot(A);
    await app.initCampaign();
    app.context.setDirective({ id: 'once', text: 'ONLY ONCE', expiresAfter: 'next_reply' });
    app.refreshContext();
    expect(st.injections.get('dir')!.text).toContain('ONLY ONCE');
    st.emit('message_received');
    expect(st.injections.has('dir')).toBe(false);
  });

  it('replaceState swaps the campaign and saves it; readonly refuses', async () => {
    const { st, app, shell } = await boot(A);
    await app.initCampaign();
    const s = createCampaign({ seed: 3, commanderName: 'Imported' });
    s.day = 8;
    app.replaceState(s);
    expect(app.current().state!.day).toBe(8);
    await vi.advanceTimersByTimeAsync(600);
    expect((st.readMetadata(METADATA_KEY) as { day: number }).day).toBe(8);
    expect(st.injections.get('ctx')!.text).toContain('Day 8');

    const st2 = new FakeStAdapter(A);
    st2.writeMetadata(METADATA_KEY, 'garbage');
    const fs2 = fakeShell();
    const app2 = createApp(st2, { loadContent: okContent, shellFactory: fs2.factory as never });
    await app2.start();
    fs2.shell.toasts.length = 0;
    app2.replaceState(s);
    await vi.advanceTimersByTimeAsync(1000);
    expect(st2.readMetadata(METADATA_KEY)).toBe('garbage');
    expect(fs2.shell.toasts[0].kind).toBe('error');
    expect(shell.toasts.length).toBeGreaterThan(0);
  });

  it('debug tools set and clear a test directive in the injection', async () => {
    const { st, app, deps } = await boot(A);
    await app.initCampaign();
    const tools = deps().debugTools!;
    const byLabel = (l: string) => tools.find((t) => t.label === l)!;
    byLabel('Set test directive').run();
    expect(st.injections.get('dir')!.text).toContain('TEST DIRECTIVE');
    byLabel('Clear test directive').run();
    expect(st.injections.has('dir')).toBe(false);
    expect(st.injections.has('ctx')).toBe(true);
    byLabel('Clear all injections').run();
    expect(st.injections.size).toBe(0);
  });

  it('ping success and failure toast texts', async () => {
    const { st, app, shell } = await boot(A);
    st.profiles = [{ id: 'mech', name: 'M', api: 'openrouter', model: 'm' }];
    st.settings.mechanicProfileId = 'mech';
    st.profileReplies = ['{"pong": true, "echo": "alius"}'];
    const ok = await app.pingMechanic();
    expect(ok.ok).toBe(true);
    expect(shell.toasts.at(-1)).toEqual({ kind: 'info', text: 'pong: alius' });

    st.settings.mechanicProfileId = '';
    st.settings.mechanicFallbackToMain = false;
    const bad = await app.pingMechanic();
    expect(bad.ok).toBe(false);
    expect(shell.toasts.at(-1)!.kind).toBe('error');
    expect(shell.toasts.at(-1)!.text).toMatch(/^Ping failed: no_profile/);
  });

  it('a dispatch bound to another chat is dropped (in-flight result after a chat switch)', async () => {
    const { st, app } = await boot(A);
    await app.initCampaign();
    const chatA = app.current().load.kind === 'ok' ? (app.current().load as { chatId: string }).chatId : '';
    st.switchChat(B);
    await app.initCampaign();
    const before = structuredClone(app.current().state!);
    const events = app.dispatch({ type: 'debug/roll', payload: { sides: 6 } }, { expectChatId: chatA });
    expect(events).toEqual([{ type: 'error', code: 'chat_changed', message: expect.any(String) }]);
    expect(app.current().state).toEqual(before);
    await vi.advanceTimersByTimeAsync(1000);
    expect((st.readMetadata(METADATA_KEY) as { rng: unknown }).rng).toEqual(before.rng);
    // bound to the chat that is actually open: applied
    expect(app.dispatch({ type: 'debug/roll', payload: { sides: 6 } }, { expectChatId: 'chat-b' })[0]).toMatchObject({ type: 'rolled' });
  });
});
