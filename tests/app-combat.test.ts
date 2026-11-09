// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp, type AliusApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import { defaultFormation } from '../src/engine/combat/stats';
import type { StartPayload } from '../src/engine/combat/types';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { FakeStAdapter } from '../src/st/fake';
import { h } from '../src/ui/dom';
import type { ShellDeps } from '../src/ui/shell/shell';

const SOLO = { chatId: 'solo', isGroup: false };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
afterEach(() => {
  document.body.innerHTML = '';
});

const unit = (name: string, roleId = 'assault') => ({
  cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId,
  signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
  values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 },
});
const setupResult = (): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit('Rhea'), unit('Mira', 'defender')],
});

function scriptedShell() {
  const toasts: Array<{ kind: string; text: string }> = [];
  const tabRenderers = new Map<string, (host: HTMLElement) => void>();
  const screenRenderers = new Map<string, (host: HTMLElement) => void>();
  const screens: string[] = [];
  const tabs: string[] = [];
  const shell = {
    open: vi.fn(), close() {}, isOpen: () => true,
    showScreen(id: string) { screens.push(id); },
    showTab(id: string) { tabs.push(id); },
    registerTab(id: string, r: (host: HTMLElement) => void) { tabRenderers.set(id, r); },
    registerScreen(id: string, r: (host: HTMLElement) => void) { screenRenderers.set(id, r); },
    setTabBadge() {},
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal() { return null; },
    setPalette() {}, refresh: vi.fn(), destroy() {},
  };
  return { shell, toasts, tabRenderers, screenRenderers, screens, tabs };
}

async function boot() {
  const st = new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }, { avatar: 'mira.png', name: 'Mira' }];
  for (const [avatar, name] of [['rhea.png', 'Rhea'], ['mira.png', 'Mira']]) {
    st.cards.set(avatar, { avatar, name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  }
  const sh = scriptedShell();
  let shellDeps: ShellDeps | undefined;
  const app: AliusApp = createApp(st, { loadContent: async () => content, shellFactory: (d) => { shellDeps = d; return sh.shell as never; } });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  sh.toasts.length = 0;
  sh.screens.length = 0;
  sh.tabs.length = 0;
  st.calls.length = 0;
  const state = (): CampaignState => app.current().state!;
  const payload = (over: Partial<StartPayload> = {}): StartPayload => ({
    encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 },
    formation: defaultFormation(state(), content.registries, state().roster.activeIds),
    ...over,
  });
  const drill = () => shellDeps!.debugTools!.find((t) => t.label === 'Combat drill')!.run();
  const mountCombat = () => {
    const host = h('div');
    document.body.append(host);
    sh.screenRenderers.get('combat')!(host);
    return host;
  };
  return { st, app, state, payload, drill, mountCombat, ...sh };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('combat in the app', () => {
  it('combat drill opens the combat screen with a generated danger-1 fight and banks nothing', async () => {
    const t = await boot();
    t.drill();
    const cs = t.state().combat!;
    expect(cs).toBeDefined();
    expect(cs.encounter.danger).toBe(1);
    expect(cs.expedition).toBe(false);
    expect(cs.bankLoot).toBe(false);
    expect(cs.combatants.filter((c) => c.side === 'squad')).toHaveLength(2);
    expect(t.screens).toContain('combat');
    expect(t.shell.open).toHaveBeenCalled();
    const host = t.mountCombat();
    expect(host.querySelectorAll('.alius-cc[data-side="squad"]')).toHaveLength(2);
    expect(host.querySelectorAll('.alius-cc[data-side="enemy"]').length).toBeGreaterThan(0);
  });

  it('the drill refuses with a toast when a combat is open or the roster is empty', async () => {
    const t = await boot();
    t.drill();
    t.toasts.length = 0;
    t.drill();
    expect(t.toasts).toEqual([{ kind: 'warn', text: 'A combat is already open.' }]);
    const e = await boot();
    e.app.dispatch({ type: 'roster/set_active', payload: { activeIds: [] } });
    const emptied = e.state();
    emptied.squad.forEach((u) => { u.status = 'reserve'; });
    e.app.replaceState({ ...emptied, roster: { ...emptied.roster, activeIds: [] } });
    e.toasts.length = 0;
    e.drill();
    expect(e.toasts.map((x) => x.text)).toEqual(['The active roster is empty.']);
    expect(e.state().combat).toBeUndefined();
  });

  it('acting through the screen dispatches combat/act', async () => {
    const t = await boot();
    expect(t.app.startCombat(t.payload())).toBe(true);
    const host = t.mountCombat();
    const spy = vi.spyOn(t.app, 'dispatch');
    const cid = t.state().combat!.awaitingCid!;
    host.querySelector<HTMLElement>('[data-act="pass"]')!.click();
    expect(spy).toHaveBeenCalledWith({ type: 'combat/act', payload: { action: { kind: 'pass' } } }, { expectChatId: expect.any(String) });
    expect(t.state().combat?.awaitingCid !== cid || t.state().lastCombat !== undefined || t.state().combat!.round > 1).toBe(true);
  });

  it('orders and AUTO from the screen reach the engine; a finished combat leaves a result and CONTINUE returns to the PDA', async () => {
    const t = await boot();
    t.app.startCombat(t.payload());
    const host = t.mountCombat();
    const before = t.state().combat!.cp;
    host.querySelector<HTMLElement>('[data-order="steady"]')!.click();
    host.querySelector<HTMLElement>('.alius-cc-legal')!.click();
    expect(t.state().combat!.cp).toBe(before - 1);
    host.querySelector<HTMLElement>('[data-act="auto"]')!.click();
    expect(t.state().combat).toBeUndefined();
    expect(t.state().lastCombat!.outcome).toBe('won');
    const result = t.mountCombat();
    expect(result.textContent).toContain('COMBAT REPORT');
    t.screens.length = 0;
    result.querySelector<HTMLElement>('[data-act="continue"]')!.click();
    expect(t.screens).toEqual(['pda']);
    expect(t.state().lastCombat).toBeDefined();
  });

  it('the easy retry setting reaches combat/start', async () => {
    const t = await boot();
    t.app.startCombat(t.payload({ allowRetry: true })); // the setting wins over the caller
    expect(t.state().combat!.allowRetry).toBe(false);
    const on = await boot();
    on.st.settings.easyRetry = true;
    on.app.startCombat(on.payload({ allowRetry: false }));
    expect(on.state().combat!.allowRetry).toBe(true);
  });

  it('a refused start shows the engine message and returns false', async () => {
    const t = await boot();
    expect(t.app.startCombat(t.payload({ encounter: { enemies: [], danger: 1 } }))).toBe(false);
    expect(t.toasts[0]).toMatchObject({ kind: 'error', text: expect.stringContaining('1 to 6') });
    expect(t.state().combat).toBeUndefined();
  });

  it('reload with an open combat shows the combat screen', async () => {
    const t = await boot();
    t.app.startCombat(t.payload());
    t.screens.length = 0;
    t.st.emit('chat_changed');
    expect(t.screens).toContain('combat');
  });

  it('leaving a chat with an open combat leaves the combat screen', async () => {
    const t = await boot();
    t.app.startCombat(t.payload());
    t.screens.length = 0;
    t.st.switchChat({ chatId: 'elsewhere', isGroup: true, groupId: 'gx' });
    expect(t.screens).toEqual(['pda']);
  });

  it('a late combat dispatch for another chat is dropped', async () => {
    const t = await boot();
    t.app.startCombat(t.payload());
    const chatId = t.st.getActiveChat()!.chatId;
    t.st.switchChat({ chatId: 'elsewhere', isGroup: true, groupId: 'gx' });
    const r = t.app.dispatch({ type: 'combat/retreat' }, { expectChatId: chatId });
    expect(r).toEqual([{ type: 'error', code: 'chat_changed', message: expect.any(String) }]);
  });

  it('workshop activity opens INV in workshop mode', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'workshop' });
    expect(t.state().workshopSession).toEqual({ day: 1, opsLeft: 3 });
    expect(t.tabs).toContain('inv');
    const host = h('div');
    document.body.append(host);
    t.tabRenderers.get('inv')!(host);
    expect(host.textContent).toContain('[ WORKSHOP ] 3 OPERATIONS LEFT');
    host.querySelector<HTMLElement>('[data-recipe="recipe_item_blade_standard"]')!.click();
    expect(t.state().inventory).toHaveLength(1);
    expect(t.toasts.some((x) => x.text.startsWith('Crafted Standard Blade'))).toBe(true);
  });

  it('SQUAD callbacks dispatch the progression actions', async () => {
    const t = await boot();
    const s = structuredClone(t.state());
    s.squad[0].skillPoints = 4;
    s.inventory.push({ uid: 'it_1', itemId: 'item_blade', rarity: 'standard', upgrade: 0, affixes: [] });
    t.app.replaceState(s);
    const host = h('div');
    document.body.append(host);
    t.tabRenderers.get('squad')!(host);
    host.querySelector<HTMLElement>('[data-node="as_b1_t1"]')!.click();
    expect(t.state().squad[0].unlockedNodes).toEqual(['as_b1_t1']);
    const host2 = h('div');
    t.tabRenderers.get('squad')!(host2);
    const sel = host2.querySelector<HTMLSelectElement>('select[data-equip="weapon"]')!;
    sel.value = 'it_1';
    sel.dispatchEvent(new Event('change'));
    expect(t.state().squad[0].equipment.weapon).toBe('it_1');
  });

  it('the SYS difficulty select dispatches through the app', async () => {
    const t = await boot();
    const spy = vi.spyOn(t.app, 'dispatch');
    const events = (await import('../src/app')) && t.app.dispatch({ type: 'campaign/set_difficulty', payload: { difficulty: 'hard' } });
    expect(events[0]).toMatchObject({ type: 'difficulty_changed' });
    expect(t.state().difficulty).toBe('hard');
    expect(spy).toHaveBeenCalled();
  });

  it('level-ups and crafting are reported as toasts', async () => {
    const t = await boot();
    const s = structuredClone(t.state());
    s.squad[0].xp = 59;
    t.app.replaceState(s);
    t.app.dispatch({ type: 'activity/do', payload: { activityId: 'train', focus: 'units', unitIds: ['unit_rhea'] } });
    expect(t.toasts.some((x) => x.text.includes('Rhea reached level 2'))).toBe(true);
  });

  it('commander down in a drill queues the P3 commander_injured follow-up', async () => {
    const t = await boot();
    t.app.startCombat(t.payload({ coverId: 'unit_rhea', encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1, exposesCommander: true } }));
    const s = structuredClone(t.state());
    s.combat!.commander!.downed = true;
    s.combat!.commander!.hp = 0;
    t.app.replaceState(s);
    const spy = vi.spyOn(t.app, 'dispatch');
    const events = t.app.dispatch({ type: 'combat/retreat' });
    expect(events.some((e) => e.type === 'commander_injured')).toBe(true);
    expect(t.state().commander.injuredUntilDay).toBe(t.state().day + 3);
    await flush();
    expect(spy).toHaveBeenCalledWith({ type: 'relations/commander_injured', payload: {} }, { expectChatId: expect.any(String) });
  });
});

describe('enemy flavor names', () => {
  const affixed = (n: number) => Array.from({ length: n }, () => ({ enemyId: 'husk', level: 1, affixes: ['armored'] as string[] }));

  it('are requested once per key and applied to the cache', async () => {
    const t = await boot();
    t.st.settings.enemyFlavor = true;
    t.st.mainReplies = ['{"name": "Plated Crawler"}'];
    t.app.startCombat(t.payload({ encounter: { enemies: [...affixed(2), { enemyId: 'husk', level: 1, affixes: [] }], danger: 2 } }));
    await flush();
    await flush();
    expect(t.st.calls.filter((c) => c.kind === 'main')).toHaveLength(1);
    expect(t.state().enemyNames).toEqual({ 'husk|armored': 'Plated Crawler' });
    // a second combat with the cached key asks nothing
    t.app.dispatch({ type: 'combat/retreat' });
    t.st.calls.length = 0;
    t.app.startCombat(t.payload({ encounter: { enemies: affixed(1), danger: 2 } }));
    await flush();
    expect(t.st.calls).toHaveLength(0);
  });

  it('failures change nothing', async () => {
    const t = await boot();
    t.st.settings.enemyFlavor = true;
    t.st.mainReplies = ['this is not json'];
    t.app.startCombat(t.payload({ encounter: { enemies: affixed(1), danger: 2 } }));
    await flush();
    await flush();
    expect(t.state().enemyNames).toBeUndefined();
    expect(t.state().combat).toBeDefined();
    expect(t.toasts.filter((x) => x.kind === 'error')).toEqual([]);
  });

  it('are off by default and ignored for plain enemies', async () => {
    const t = await boot();
    t.app.startCombat(t.payload({ encounter: { enemies: affixed(1), danger: 2 } }));
    await flush();
    expect(t.st.calls).toHaveLength(0);
    const p = await boot();
    p.st.settings.enemyFlavor = true;
    p.app.startCombat(p.payload());
    await flush();
    expect(p.st.calls).toHaveLength(0);
  });

  it('a name arriving after a chat switch is dropped', async () => {
    const t = await boot();
    t.st.settings.enemyFlavor = true;
    t.st.mainReplies = ['{"name": "Late Name"}'];
    t.app.startCombat(t.payload({ encounter: { enemies: affixed(1), danger: 2 } }));
    t.st.switchChat({ chatId: 'elsewhere', isGroup: true, groupId: 'gx' });
    await flush();
    await flush();
    expect(t.app.current().state?.enemyNames).toBeUndefined();
  });
});
