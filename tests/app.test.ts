import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../src/content/loader';
import type { SetupResult, UnitSetup } from '../src/engine/setup';
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
    screens: [] as string[],
    tabs: [] as string[],
    screenRenderers: new Map<string, unknown>(),
    showScreen(id: string) { shell.screens.push(id); },
    showTab(id: string) { shell.tabs.push(id); },
    tabRenderers: new Map<string, unknown>(),
    registerTab(id: string, render: unknown) { shell.tabRenderers.set(id, render); },
    registerScreen(id: string, render: unknown) { shell.screenRenderers.set(id, render); },
    setTabBadge() {},
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
  it('registers the analysis readings and gives the shell its registries (P7a)', async () => {
    const { shell, deps } = await boot(A);
    void shell;
    const { analyzeProviders } = await import('../src/analysis/providers');
    expect([...analyzeProviders().keys()]).toEqual(expect.arrayContaining(['glossary:trust', 'glossary:stress']));
    expect(deps().analyze!.registries()).toBeDefined();
  });

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

// ---------------------------------------------------------------------------------------------
describe('SQUAD, OPS and BASE tabs', () => {
  it('app registers the squad, ops, map, base, comms, inv and log tabs and the scene, combat and expedition screens', async () => {
    const { shell } = await boot(A);
    expect([...shell.tabRenderers.keys()].sort()).toEqual(['base', 'comms', 'inv', 'log', 'map', 'ops', 'squad']);
    expect(shell.screenRenderers.has('scene')).toBe(true);
    expect(shell.screenRenderers.has('combat')).toBe(true);
    expect(shell.screenRenderers.has('expedition')).toBe(true);
  });
});

describe('campaign setup deployment (P1)', () => {
  let content: Awaited<ReturnType<typeof loadPacks>>;
  beforeAll(async () => {
    content = await loadPacks(['content/core'], async (path) => JSON.parse(await readFile(path, 'utf8')));
    expect(content.errors).toEqual([]);
  });
  const realContent = async () => content;

  const CHARS = ['rhea', 'kay', 'mo', 'ilse'].map((n) => ({ avatar: `${n}.png`, name: n[0].toUpperCase() + n.slice(1) }));
  const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  const unit = (c: { avatar: string; name: string }, over: Partial<UnitSetup> = {}): UnitSetup => ({
    cardRef: c.avatar, displayName: c.name, roleId: 'assault',
    signature: { templateId: 'sig_last_stand', name: 'Last Stand', description: 'She holds.' },
    defects: [{ id: 'echo_bleed', origin: 'Heard things.' }],
    values: { ...ZERO }, likes: [], dislikes: [], triggers: [], baseline: { trust: 20, affinity: 0, attraction: 0 }, ...over,
  });
  const result = (n = 4, over: Partial<SetupResult> = {}): SetupResult => ({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: CHARS.slice(0, n).map((c) => unit(c)), ...over,
  });

  async function bootReal(chat: typeof A | typeof SOLO | null = SOLO) {
    const st = new FakeStAdapter(chat);
    st.characters = CHARS;
    for (const c of CHARS) {
      st.cards.set(c.avatar, { avatar: c.avatar, name: c.name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
    }
    const fs = fakeShell();
    const app = createApp(st, { loadContent: realContent, shellFactory: fs.factory as never });
    await app.start();
    return { st, app, ...fs };
  }
  const anyCampaignWritten = (st: FakeStAdapter) => [...st.metadataByChat.values()].some((m) => m[METADATA_KEY] !== undefined);

  it('deploy to new group creates the group with the cards, opens it, writes state and lands on Day 1 Morning', async () => {
    const { st, app, shell } = await bootReal();
    expect(await app.deployCampaign(result(4), 'new_group')).toBe(true);
    expect(st.groups.size).toBe(1);
    const [id, group] = [...st.groups][0];
    expect(group).toEqual({ name: 'Alius: Vale', members: CHARS.map((c) => c.avatar) });
    expect(st.getActiveChat()).toEqual({ chatId: `chat-${id}`, isGroup: true, groupId: id });
    expect(st.getActiveChat()!.chatId).toBe('chat-g1');
    const { state, load } = app.current();
    expect(load.kind).toBe('ok');
    expect([state!.day, state!.slot, state!.squad.length]).toEqual([1, 'morning', 4]);
    expect(state!.world.startId).toBe('start_vesper');
    expect(st.members.map((m) => [m.avatar, m.active])).toEqual(CHARS.map((c) => [c.avatar, true]));
    expect(shell.screens.at(-1)).toBe('pda');
    expect(shell.tabs.at(-1)).toBe('squad');
    expect(shell.toasts.at(-1)).toEqual({ kind: 'info', text: 'Deployment confirmed. Day 1, Morning.' });
    expect(st.readMetadata('world_info')).toBe('Alius Core Lore');
    expect(st.lorebooks.get('Alius Core Lore')!.entries.length).toBe(21);
    expect(st.metadataSaves).toBeGreaterThan(0);
  });

  it('deploy with 2 and with 0 cards works', async () => {
    for (const n of [2, 0]) {
      const { st, app } = await bootReal();
      expect(await app.deployCampaign(result(n), 'new_group')).toBe(true);
      expect(app.current().state!.squad).toHaveLength(n);
      expect([...st.groups.values()][0].members).toHaveLength(n);
    }
  });

  it('reload keeps the campaign', async () => {
    const { st, app } = await bootReal();
    await app.deployCampaign(result(4), 'new_group');
    const squad = app.current().state!.squad.map((u) => u.id);
    const app2 = createApp(st, { loadContent: realContent, shellFactory: fakeShell().factory as never });
    await app2.start();
    expect(app2.current().load.kind).toBe('ok');
    expect(app2.current().state!.squad.map((u) => u.id)).toEqual(squad);
  });

  it('deploy into current group adds missing members and binds', async () => {
    const { st, app } = await bootReal(A);
    st.members = [
      { avatar: 'rhea.png', name: 'Rhea', active: true },
      { avatar: 'ilse.png', name: 'Ilse', active: true },
    ];
    app.openSetup();
    expect(await app.deployCampaign(result(2), 'current_group')).toBe(true);
    expect(st.groups.size).toBe(0); // no new group
    expect(st.getActiveChat()!.chatId).toBe('chat-a');
    expect(st.members.map((m) => [m.avatar, m.active])).toEqual([['rhea.png', true], ['ilse.png', false], ['kay.png', true]]);
    expect(app.current().state!.squad.map((u) => u.cardRef)).toEqual(['rhea.png', 'kay.png']);
    expect((st.readMetadata(METADATA_KEY) as { version: number }).version).toBe(1);
    expect(st.readMetadata('world_info')).toBe('Alius Core Lore');
  });

  it('bind target that gained a campaign is refused, nothing written', async () => {
    const { st, app, shell } = await bootReal(A);
    app.openSetup();
    await app.initCampaign(); // the chat gets its own campaign while the wizard is open
    const before = structuredClone(st.readMetadata(METADATA_KEY));
    expect(await app.deployCampaign(result(2), 'current_group')).toBe(false);
    expect(st.readMetadata(METADATA_KEY)).toEqual(before);
    expect(st.members).toEqual([]);
    expect(st.readMetadata('world_info')).toBeUndefined();
    expect(shell.toasts.at(-1)).toEqual({ kind: 'error', text: 'This chat already has an Alius campaign.' });
  });

  it('bind target is refused when the open chat is no longer the one the wizard was opened in', async () => {
    const { st, app } = await bootReal(A);
    app.openSetup();
    st.switchChat(B);
    expect(await app.deployCampaign(result(2), 'current_group')).toBe(false);
    expect(anyCampaignWritten(st)).toBe(false);
    expect(st.members).toEqual([]);
  });

  it('group open failure writes nothing and keeps the wizard', async () => {
    const { st, app, shell } = await bootReal();
    app.openSetup();
    st.failOpenGroup = true;
    const screensBefore = shell.screens.length;
    expect(await app.deployCampaign(result(2), 'new_group')).toBe(false);
    expect(anyCampaignWritten(st)).toBe(false);
    expect(st.getActiveChat()).toEqual(SOLO);
    expect(shell.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringMatching(/^Could not open the new group chat:/) });
    expect(shell.screens).toHaveLength(screensBefore); // the wizard screen stays up
    expect(app.setupState()).not.toBeNull();
    // the player can retry
    st.failOpenGroup = false;
    expect(await app.deployCampaign(result(2), 'new_group')).toBe(true);
  });

  it('create group failure writes nothing', async () => {
    const { st, app, shell } = await bootReal();
    st.failCreateGroup = true;
    expect(await app.deployCampaign(result(2), 'new_group')).toBe(false);
    expect(st.groups.size).toBe(0);
    expect(anyCampaignWritten(st)).toBe(false);
    expect(shell.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringContaining('Could not open the new group chat') });
  });

  it('existing lorebook is bound, not overwritten', async () => {
    const { st, app } = await bootReal();
    const edited = { name: 'Alius Core Lore', entries: [{ key: ['x'], comment: 'mine', content: 'player edit', constant: true }] };
    st.lorebooks.set(edited.name, structuredClone(edited));
    expect(await app.deployCampaign(result(1), 'new_group')).toBe(true);
    expect(st.lorebooks.get(edited.name)).toEqual(edited);
    expect(st.readMetadata('world_info')).toBe(edited.name);
  });

  it('lorebook failure still deploys', async () => {
    const { st, app, shell } = await bootReal();
    st.saveLorebook = async () => { throw new Error('disk full'); };
    expect(await app.deployCampaign(result(1), 'new_group')).toBe(true);
    expect(app.current().load.kind).toBe('ok');
    expect(shell.toasts.some((t) => t.kind === 'warn' && t.text === 'Lorebook not installed: disk full')).toBe(true);
    expect(st.readMetadata('world_info')).toBeUndefined();
  });

  it('invalid setup result is refused before touching ST', async () => {
    const { st, app, shell } = await bootReal();
    const bad = result(2);
    bad.units[0].roleId = 'berserker';
    expect(await app.deployCampaign(bad, 'new_group')).toBe(false);
    expect(st.groups.size).toBe(0);
    expect(st.lorebooks.size).toBe(0);
    expect(shell.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringContaining('berserker') });
  });

  it('a failing metadata save reports the error and leaves no campaign behind', async () => {
    const { st, app, shell } = await bootReal();
    st.saveMetadata = async () => { throw new Error('quota'); };
    expect(await app.deployCampaign(result(1), 'new_group')).toBe(false);
    expect(anyCampaignWritten(st)).toBe(false);
    expect(shell.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringContaining('quota') });
  });

  it('openSetup is refused in a read-only campaign chat', async () => {
    const st = new FakeStAdapter(A);
    st.writeMetadata(METADATA_KEY, { version: 99 });
    const fs = fakeShell();
    const app = createApp(st, { loadContent: realContent, shellFactory: fs.factory as never });
    await app.start();
    fs.shell.toasts.length = 0;
    app.openSetup();
    expect(fs.shell.opened).toBe(0);
    expect(app.setupState()).toBeNull();
    expect(fs.shell.toasts).toEqual([{ kind: 'error', text: expect.stringMatching(/read-only/i) }]);
  });

  it('openSetup offers binding only in a group chat without a campaign', async () => {
    const solo = await bootReal(SOLO);
    solo.app.openSetup();
    expect(solo.app.setupState()).toMatchObject({ canBindCurrent: false, step: 'dossier' });
    expect(solo.shell.opened).toBe(1);
    expect(solo.shell.screens.at(-1)).toBe('setup');
    expect(solo.shell.screenRenderers.has('setup')).toBe(true);

    const group = await bootReal(A);
    group.app.openSetup();
    expect(group.app.setupState()!.canBindCurrent).toBe(true);

    const withCampaign = await bootReal(A);
    await withCampaign.app.initCampaign();
    withCampaign.app.openSetup();
    expect(withCampaign.app.setupState()!.canBindCurrent).toBe(false);
  });

  it('openSetup defaults the commander name to the persona', async () => {
    const { st, app } = await bootReal();
    st.personaName = 'Rook';
    app.openSetup();
    expect(app.setupState()!.commanderName).toBe('Rook');
  });

  it('openSetup refuses to start when content failed to load', async () => {
    const st = new FakeStAdapter(SOLO);
    const fs = fakeShell();
    const app = createApp(st, { loadContent: okContent, shellFactory: fs.factory as never });
    await app.start();
    app.openSetup();
    expect(fs.shell.opened).toBe(0);
    expect(fs.shell.toasts.at(-1)).toMatchObject({ kind: 'error' });
  });

  it('a successful deploy ends the setup session', async () => {
    const { app } = await bootReal();
    app.openSetup();
    await app.deployCampaign(result(1), 'new_group');
    expect(app.setupState()).toBeNull();
  });

  it('a second deployment while one is running is refused (no second group, no second campaign)', async () => {
    const { st, app, shell } = await bootReal();
    const first = app.deployCampaign(result(2), 'new_group');
    const second = app.deployCampaign(result(2), 'new_group');
    expect(await second).toBe(false);
    expect(await first).toBe(true);
    expect(st.groups.size).toBe(1);
    expect(shell.toasts.some((t) => /already running/i.test(t.text))).toBe(true);
    // the guard is released afterwards
    expect(await app.deployCampaign(result(1), 'new_group')).toBe(true);
    expect(st.groups.size).toBe(2);
  });

  it('the guard is also released after a failed deployment', async () => {
    const { st, app } = await bootReal();
    st.failCreateGroup = true;
    expect(await app.deployCampaign(result(1), 'new_group')).toBe(false);
    st.failCreateGroup = false;
    expect(await app.deployCampaign(result(1), 'new_group')).toBe(true);
  });

  it('the lorebook is never bound to a chat other than the target when the chat is switched mid-deployment', async () => {
    const { st, app } = await bootReal(A);
    app.openSetup();
    st.saveLorebook = async () => { st.switchChat(B); }; // the player switches chats while the lorebook is saved
    expect(await app.deployCampaign(result(2), 'current_group')).toBe(false);
    expect(st.readMetadata('world_info')).toBeUndefined(); // chat B untouched
    st.switchChat(A);
    expect(st.readMetadata('world_info')).toBeUndefined();
    expect(st.readMetadata(METADATA_KEY)).toBeUndefined();
  });

  it('a failed campaign write restores the chat\'s previous lorebook binding', async () => {
    const { st, app } = await bootReal(A);
    st.writeMetadata('world_info', 'Player Lore');
    app.openSetup();
    st.saveMetadata = async () => { throw new Error('quota'); };
    expect(await app.deployCampaign(result(1), 'current_group')).toBe(false);
    expect(st.readMetadata('world_info')).toBe('Player Lore');
    expect(st.readMetadata(METADATA_KEY)).toBeUndefined();
  });

  const bondResult = (): SetupResult => {
    const r = result(1);
    r.units[0].defects = [{ id: 'imprint_hunger', origin: 'x' }];
    return r;
  };

  it('the Desire/Bond setting is pinned when the wizard opens: turning it on later does not change the rules mid-form', async () => {
    const { st, app, shell } = await bootReal();
    st.settings.desireBondDefects = false;
    app.openSetup();
    st.settings.desireBondDefects = true; // flipped in SYS while the form is open
    expect(await app.deployCampaign(bondResult(), 'new_group')).toBe(false);
    expect(shell.toasts.at(-1)!.text).toMatch(/Desire\/Bond/);
    expect(st.groups.size).toBe(0);
  });

  it('...and turning it off later does not reject a form that was filled in with it on', async () => {
    const { st, app } = await bootReal();
    st.settings.desireBondDefects = true;
    app.openSetup();
    st.settings.desireBondDefects = false;
    expect(await app.deployCampaign(bondResult(), 'new_group')).toBe(true);
    expect(app.current().state!.settings.desireBondDefects).toBe(true);
  });

  it('a retry after a failed open reuses the group that was already created', async () => {
    const { st, app } = await bootReal();
    app.openSetup();
    st.failOpenGroup = true;
    expect(await app.deployCampaign(result(2), 'new_group')).toBe(false);
    expect(st.groups.size).toBe(1);
    st.failOpenGroup = false;
    expect(await app.deployCampaign(result(3), 'new_group')).toBe(true); // the player added a third card meanwhile
    expect(st.groups.size).toBe(1);
    expect(st.members.map((m) => m.avatar)).toEqual(CHARS.slice(0, 3).map((c) => c.avatar));
    expect(app.current().state!.squad).toHaveLength(3);
  });

  it('a failed deployment into the current group restores which members were active', async () => {
    const { st, app } = await bootReal(A);
    st.members = [
      { avatar: 'rhea.png', name: 'Rhea', active: true },
      { avatar: 'ilse.png', name: 'Ilse', active: true },
    ];
    app.openSetup();
    st.saveMetadata = async () => { throw new Error('quota'); };
    expect(await app.deployCampaign(result(2), 'current_group')).toBe(false);
    const active = Object.fromEntries(st.members.map((m) => [m.avatar, m.active]));
    expect(active['rhea.png']).toBe(true);
    expect(active['ilse.png']).toBe(true); // was muted by the deployment, is active again
    expect(active['kay.png']).toBe(false); // added by the deployment, stays out of play
  });
});
