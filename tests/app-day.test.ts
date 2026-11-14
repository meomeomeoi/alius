// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { FakeStAdapter } from '../src/st/fake';
import { h } from '../src/ui/dom';

const SOLO = { chatId: 'solo', isGroup: false };
const OTHER = { chatId: 'chat-other', isGroup: true, groupId: 'gx' };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
afterEach(() => {
  document.body.innerHTML = '';
});

const setupResult = (): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
  units: [{
    cardRef: 'rhea.png', displayName: 'Rhea', roleId: 'assault',
    signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
    defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
    values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
    baseline: { trust: 20, affinity: 0, attraction: 0 },
  }],
});

function scriptedShell() {
  const toasts: Array<{ kind: string; text: string }> = [];
  const tabRenderers = new Map<string, (host: HTMLElement) => void>();
  const refresh = vi.fn();
  const shell = {
    open() {}, close() {}, isOpen: () => false, showScreen() {}, showTab() {},
    registerTab(id: string, r: (host: HTMLElement) => void) { tabRenderers.set(id, r); },
    registerScreen() {}, setTabBadge() {},
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal() { return null; },
    setPalette() {}, refresh, destroy() {},
  };
  return { shell, toasts, tabRenderers, refresh };
}

async function boot() {
  const st = new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }];
  st.cards.set('rhea.png', { avatar: 'rhea.png', name: 'Rhea', description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  st.settings.unitDms = false; // the campaign seed is random: a spontaneous unit DM on a slot change would make the call counts below flaky
  const sh = scriptedShell();
  const app = createApp(st, { loadContent: async () => content, shellFactory: () => sh.shell as never });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  sh.toasts.length = 0;
  sh.refresh.mockClear();
  st.calls.length = 0;
  const state = (): CampaignState => app.current().state!;
  const render = (tab: string) => {
    const host = h('div');
    document.body.append(host);
    sh.tabRenderers.get(tab)!(host);
    return host;
  };
  return { st, app, state, render, ...sh };
}

describe('day flow in the app', () => {
  it('performActivity consumes a slot and refreshes the shell', async () => {
    const t = await boot();
    const events = await t.app.performActivity({ activityId: 'rest' });
    expect(events.some((e) => e.type === 'activity_done')).toBe(true);
    expect(t.state().slot).toBe('afternoon');
    expect(t.refresh).toHaveBeenCalled();
  });

  it('a rejected activity shows an error toast and changes nothing', async () => {
    const t = await boot();
    const before = t.state();
    const events = await t.app.performActivity({ activityId: 'talk' });
    expect(events[0]).toMatchObject({ type: 'error' });
    expect(t.state()).toBe(before);
    expect(t.toasts.at(-1)).toMatchObject({ kind: 'error' });
    expect(t.toasts.at(-1)!.text).toMatch(/companion/i);
  });

  it('a vignette appears after a companion activity with flavor short', async () => {
    const t = await boot();
    t.st.mainReplies = ['"Rhea pours the tea.\nIt is terrible. She drinks it anyway."'];
    await t.app.performActivity({ activityId: 'rest', companionId: 'unit_rhea' });
    expect(t.toasts.some((x) => x.kind === 'story' && x.text === 'Rhea pours the tea.\nIt is terrible. She drinks it anyway.')).toBe(true);
    const prompt = (t.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('Rest');
    expect(prompt).toContain('Rhea');
    expect(prompt).toContain('Vale');
    expect(prompt).toContain('tea');
  });

  it('no vignette without a companion, and none when activityFlavor is off', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'rest' });
    expect(t.st.calls).toHaveLength(0);
    t.st.settings.activityFlavor = false;
    t.st.mainReplies = ['should not be asked'];
    await t.app.performActivity({ activityId: 'rest', companionId: 'unit_rhea' });
    expect(t.st.calls).toHaveLength(0);
    expect(t.toasts.some((x) => x.kind === 'story')).toBe(false);
  });

  it('a failed vignette call changes nothing and shows nothing', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'rest', companionId: 'unit_rhea' }); // no reply queued: the fake throws
    expect(t.toasts.some((x) => x.kind === 'story' || x.kind === 'error')).toBe(false);
    expect(t.state().slot).toBe('afternoon');
    expect(t.state().relations.unit_rhea.affinity).toBe(2);
  });

  it('a vignette that arrives after a chat switch is dropped', async () => {
    const t = await boot();
    t.st.mainReplies = ['A moment.'];
    const pending = t.app.performActivity({ activityId: 'rest', companionId: 'unit_rhea' });
    t.st.switchChat(OTHER);
    await pending;
    expect(t.toasts.some((x) => x.kind === 'story')).toBe(false);
  });

  it('talk with a cancelled location picker keeps the slot and does not lock the day', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'talk', companionId: 'unit_rhea' }); // the scripted modal answers null: cancelled
    expect(t.state().slot).toBe('morning');
    expect(t.toasts.some((x) => /not available yet/i.test(x.text))).toBe(false);
    expect(t.state().scene).toBeUndefined();
    expect(t.state().calendar.pendingScene).toBeUndefined();
    await t.app.performActivity({ activityId: 'rest' });
    expect(t.state().slot).toBe('afternoon');
  });

  it('recruit then flavor renames the grunt, the designation stays', async () => {
    const t = await boot();
    t.st.mainReplies = ['{"name": "Mara", "bio": "Counts exits."}'];
    const events = await t.app.recruitGrunt();
    expect(events.some((e) => e.type === 'grunt_recruited')).toBe(true);
    const g = t.state().squad.at(-1)!;
    expect(g).toMatchObject({ kind: 'grunt', displayName: 'Mara', bio: 'Counts exits.' });
    expect(g.designation).toMatch(/^[A-Z]-\d{3}$/);
    expect((t.st.calls[0] as { prompt: string }).prompt).toContain(g.designation!);
  });

  it('recruit works when flavor fails or is off', async () => {
    const t = await boot();
    t.app.replaceState({ ...t.state(), resources: { credits: 500, supplies: 50, plyx: 0 } });
    await t.app.recruitGrunt(); // no reply queued
    expect(t.state().squad.at(-1)!.displayName).toBe(t.state().squad.at(-1)!.designation);
    t.st.settings.gruntFlavor = false;
    t.st.mainReplies = ['unused'];
    t.st.calls.length = 0;
    await t.app.recruitGrunt();
    expect(t.state().squad).toHaveLength(3);
    expect(t.st.calls).toHaveLength(0);
  });

  it('a chat switch drops a late grunt flavor', async () => {
    const t = await boot();
    const home = t.st.getActiveChat()!;
    t.st.mainReplies = ['{"name": "Mara", "bio": "x"}'];
    const pending = t.app.recruitGrunt();
    t.st.switchChat(OTHER);
    await pending;
    expect(t.toasts.some((x) => x.kind === 'error' || /goes by/.test(x.text))).toBe(false);
    t.st.switchChat(home);
    expect(JSON.stringify(t.app.current().state)).not.toContain('Mara');
  });

  it('the autosave event flushes the saver at day end', async () => {
    const t = await boot();
    for (let i = 0; i < 3; i++) t.app.dispatch({ type: 'calendar/consume_slot', payload: { reason: 'test' } });
    expect((t.st.readMetadata('alius') as CampaignState).day).toBe(2); // saved without waiting for the debounce
  });

  it('a supply shortage at day end shows a warning toast', async () => {
    const t = await boot();
    t.app.replaceState({ ...t.state(), resources: { credits: 0, supplies: 0, plyx: 0 } });
    t.toasts.length = 0;
    for (let i = 0; i < 3; i++) t.app.dispatch({ type: 'calendar/consume_slot', payload: { reason: 'test' } });
    expect(t.toasts.some((x) => x.kind === 'warn' && /shortage/i.test(x.text))).toBe(true);
  });

  it('the shortage toast does not claim suffering when nobody was hit', async () => {
    const t = await boot();
    const s = t.state();
    t.app.replaceState({ ...s, resources: { credits: 0, supplies: 0, plyx: 0 }, squad: s.squad.map((u) => ({ ...u, status: 'dead' as const })) });
    t.toasts.length = 0;
    for (let i = 0; i < 3; i++) t.app.dispatch({ type: 'calendar/consume_slot', payload: { reason: 'test' } });
    const toast = t.toasts.find((x) => x.kind === 'warn' && /shortage/i.test(x.text))!;
    expect(toast.text).not.toMatch(/stress/i);
  });

  it('a finished facility upgrade shows an info toast', async () => {
    const t = await boot();
    t.app.replaceState({ ...t.state(), resources: { credits: 500, supplies: 99, plyx: 50 } });
    t.app.upgradeFacility('barracks');
    t.toasts.length = 0;
    for (let i = 0; i < 6; i++) t.app.dispatch({ type: 'calendar/consume_slot', payload: { reason: 'test' } });
    expect(t.toasts.some((x) => x.kind === 'info' && /Barracks.*level 2/i.test(x.text))).toBe(true);
    expect(t.state().roster.capacity).toBe(7);
  });

  it('requisition and roster go through the engine and report errors', async () => {
    const t = await boot();
    t.app.requisition(2);
    expect(t.state().resources.supplies).toBe(30 + 2);
    t.app.requisition(10_000);
    expect(t.toasts.at(-1)).toMatchObject({ kind: 'error' });
    t.app.setRoster([]);
    expect(t.toasts.at(-1)).toMatchObject({ kind: 'error' });
    expect(t.state().roster.activeIds).toEqual(['unit_rhea']);
    t.app.setRoster(['ghost']);
    expect(t.toasts.at(-1)).toMatchObject({ kind: 'error' });
  });
});

describe('OPS and BASE tabs in the app', () => {
  it('OPS renders the day and does an activity on click', async () => {
    const t = await boot();
    const host = t.render('ops');
    expect(host.textContent).toContain('DAY 001 // MORNING');
    host.querySelector<HTMLButtonElement>('button[data-do="rest"]')!.click();
    expect(t.state().slot).toBe('afternoon');
  });

  it('BASE renders the schematic and recruits on click', async () => {
    const t = await boot();
    const host = t.render('base');
    expect(host.querySelector('.alius-schematic')!.textContent).toContain('BARRACKS');
    host.querySelector<HTMLButtonElement>('button[data-recruit]')!.click();
    await vi.waitFor(() => expect(t.state().squad).toHaveLength(2));
  });

  it('the tabs show a message when there is no campaign', async () => {
    const st = new FakeStAdapter(SOLO);
    const sh = scriptedShell();
    const app = createApp(st, { loadContent: async () => content, shellFactory: () => sh.shell as never });
    await app.start();
    for (const tab of ['ops', 'base']) {
      const host = h('div');
      sh.tabRenderers.get(tab)!(host);
      expect(host.textContent).toContain('NO ACTIVE CAMPAIGN');
    }
  });
});
