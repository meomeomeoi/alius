// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { updateSettings } from '../src/settings';
import { FakeStAdapter } from '../src/st/fake';
import { h } from '../src/ui/dom';
import type { ShellDeps } from '../src/ui/shell/shell';

const SOLO = { chatId: 'solo', isGroup: false };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const RHEA = 'unit_rhea';

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

async function boot() {
  const st = new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }];
  st.cards.set('rhea.png', { avatar: 'rhea.png', name: 'Rhea', description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  const toasts: Array<{ kind: string; text: string }> = [];
  const screens: string[] = [];
  const badges = new Map<string, number>();
  const answers = new Map<string, string | null>([['Start a conversation', 'ok'], ['Linger at the table?', 'yes']]);
  const modalTitles: string[] = [];
  const screenRenderers = new Map<string, (host: HTMLElement) => void>();
  const tabRenderers = new Map<string, (host: HTMLElement) => void>();
  let deps!: ShellDeps;
  const shell = {
    opened: 0,
    open() { shell.opened++; }, close() {}, isOpen: () => false,
    showScreen(id: string) { screens.push(id); }, showTab() {},
    registerTab(id: string, r: (host: HTMLElement) => void) { tabRenderers.set(id, r); },
    registerScreen(id: string, r: (host: HTMLElement) => void) { screenRenderers.set(id, r); },
    setTabBadge(id: string, n: number) { badges.set(id, n); },
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal(o: { title: string; body: Node | string }) {
      modalTitles.push(o.title);
      return answers.has(o.title) ? answers.get(o.title)! : null;
    },
    setPalette() {}, refresh() {}, destroy() {},
  };
  const app = createApp(st, { loadContent: async () => content, shellFactory: (d) => { deps = d; return shell as never; } });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  toasts.length = 0;
  screens.length = 0;
  st.calls.length = 0;
  const state = (): CampaignState => app.current().state!;
  const setState = (fn: (s: CampaignState) => void) => {
    const next = structuredClone(state());
    fn(next);
    app.replaceState(next);
  };
  const renderScreen = (id: string) => {
    const host = h('div');
    document.body.append(host);
    screenRenderers.get(id)!(host);
    return host;
  };
  return { st, app, state, setState, toasts, screens, badges, answers, modalTitles, shell, renderScreen, deps: () => deps, tabRenderers };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('scenes in the app', () => {
  it('talk opens the location picker and starts a scene', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'talk', companionId: RHEA });
    expect(t.modalTitles).toEqual(['Start a conversation']);
    expect(t.state().scene).toMatchObject({ participants: [RHEA], origin: 'activity', locationId: 'quarters_commander', consumesSlot: true });
    expect(t.state().slot).toBe('morning');
    expect(t.screens.at(-1)).toBe('scene');
    expect(t.shell.opened).toBeGreaterThan(0);
    expect(t.toasts.some((x) => /not available yet/i.test(x.text))).toBe(false);
    expect(t.st.members.filter((m) => m.active).map((m) => m.avatar)).toEqual(['rhea.png']);
  });

  it('cancelling the picker releases the slot', async () => {
    const t = await boot();
    t.answers.set('Start a conversation', null);
    await t.app.performActivity({ activityId: 'talk', companionId: RHEA });
    expect(t.state().scene).toBeUndefined();
    expect(t.state().calendar.pendingScene).toBeUndefined();
    expect(t.state().slot).toBe('morning');
    await t.app.performActivity({ activityId: 'rest' });
    expect(t.state().slot).toBe('afternoon');
  });

  it('a scene that cannot start (engine refuses) also releases the slot', async () => {
    const t = await boot();
    t.st.setMembersActive = async () => { throw new Error('nope'); };
    await t.app.performActivity({ activityId: 'talk', companionId: RHEA });
    expect(t.state().scene).toBeUndefined();
    expect(t.state().calendar.pendingScene).toBeUndefined();
    expect(t.toasts.some((x) => x.kind === 'error')).toBe(true);
  });

  it('mess offers a free group scene', async () => {
    const t = await boot();
    t.setState((s) => { s.slot = 'afternoon'; s.resources.supplies = 20; });
    await t.app.performActivity({ activityId: 'mess' });
    expect(t.modalTitles).toEqual(['Linger at the table?']);
    expect(t.state().scene).toMatchObject({ origin: 'mess', locationId: 'mess_hall', consumesSlot: false, participants: [RHEA] });
    // the meal took the slot; the scene itself takes none
    expect(t.state().slot).toBe('evening');
    await t.app.scene.end();
    expect(t.state().slot).toBe('evening');
  });

  it('declining the group scene starts nothing', async () => {
    const t = await boot();
    t.answers.set('Linger at the table?', 'no');
    t.setState((s) => { s.slot = 'afternoon'; s.resources.supplies = 20; });
    await t.app.performActivity({ activityId: 'mess' });
    expect(t.state().scene).toBeUndefined();
  });

  it('night_started shows the knock; ignore rolls the day', async () => {
    const t = await boot();
    t.setState((s) => {
      s.slot = 'evening';
      s.calendar.nightEventsQueue = [{ id: 'n1', unitId: RHEA, kind: 'visit', priority: 30, framing: 'Rhea knocks on your door, late.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 }];
    });
    await t.app.performActivity({ activityId: 'rest' });
    await flush();
    expect(t.state().slot).toBe('night');
    expect(t.screens.at(-1)).toBe('scene');
    const host = t.renderScreen('scene');
    expect(host.querySelector('.alius-knock')!.textContent).toContain('Rhea knocks on your door, late.');
    host.querySelector<HTMLButtonElement>('button[data-action="ignore"]')!.click();
    await flush();
    expect(t.state().day).toBe(2);
    expect(t.state().slot).toBe('morning');
    expect(t.screens.at(-1)).toBe('pda');
  });

  it('opening the knock starts a night scene', async () => {
    const t = await boot();
    t.setState((s) => {
      s.slot = 'evening';
      s.calendar.nightEventsQueue = [{ id: 'n1', unitId: RHEA, kind: 'visit', priority: 30, framing: 'Rhea knocks.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 }];
    });
    await t.app.performActivity({ activityId: 'rest' });
    await flush();
    t.renderScreen('scene').querySelector<HTMLButtonElement>('button[data-action="open"]')!.click();
    await vi.waitFor(() => expect(t.state().scene).toMatchObject({ origin: 'night', participants: [RHEA] }));
    expect(t.screens.at(-1)).toBe('scene');
    expect(t.renderScreen('scene').querySelector('.alius-scene')).not.toBeNull();
  });

  it('a unit-initiated DM after an activity updates the COMMS badge', async () => {
    const t = await boot();
    const stranger = content.registries.relationshipStates.get('stranger')!;
    const old = stranger.dmChance;
    stranger.dmChance = 1;
    try {
      t.st.mainReplies = ['Hey you.'];
      await t.app.performActivity({ activityId: 'rest' });
      await vi.waitFor(() => expect(t.badges.get('comms')).toBe(1));
      expect(t.state().dms[RHEA][0]).toMatchObject({ text: 'Hey you.', initiated: true, read: false });
    } finally {
      stranger.dmChance = old;
    }
  });

  it('the COMMS tab sends, reads and answers through the app', async () => {
    const t = await boot();
    const host = h('div');
    document.body.append(host);
    t.tabRenderers.get('comms')!(host);
    host.querySelector<HTMLButtonElement>(`button[data-unit="${RHEA}"]`)!.click();
    t.st.mainReplies = ['Mm.'];
    const input = host.querySelector<HTMLInputElement>('input[name="dm"]')!;
    input.value = 'hello';
    host.querySelector<HTMLButtonElement>('button[data-action="send"]')!.click();
    await vi.waitFor(() => expect(t.state().dms[RHEA]).toHaveLength(2));
    expect(t.badges.get('comms')).toBe(1);
    const logHost = h('div');
    t.tabRenderers.get('log')!(logHost);
    expect(logHost.textContent).toMatch(/CCP INCIDENT LOG/);
  });

  it('romance toggle in SYS dispatches set_intimacy', async () => {
    const t = await boot();
    expect(t.state().settings.intimacy).toBeUndefined();
    updateSettings(t.st, { romance: false });
    t.deps().onSettingsChanged!();
    expect(t.state().settings.intimacy).toEqual({ romance: false, initiative: 'med' });
    updateSettings(t.st, { romance: true, romanticInitiative: 'high' });
    t.deps().onSettingsChanged!();
    expect(t.state().settings.intimacy).toEqual({ romance: true, initiative: 'high' });
  });

  it('reload with an open scene shows the scene screen', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'talk', companionId: RHEA });
    expect(t.state().scene).toBeDefined();
    t.app.replaceState(t.state()); // flush to metadata
    t.screens.length = 0;
    t.st.members.forEach((m) => { m.active = true; });
    t.st.switchChat(t.st.getActiveChat()!);
    expect(t.state().scene).toBeDefined();
    expect(t.screens.at(-1)).toBe('scene');
    expect(t.st.members.filter((m) => m.active).map((m) => m.avatar)).toEqual(['rhea.png']);
  });

  it('switching to a chat without a scene leaves the scene screen', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'talk', companionId: RHEA });
    t.screens.length = 0;
    t.st.switchChat({ chatId: 'elsewhere', isGroup: true, groupId: 'gx' });
    expect(t.screens.at(-1)).toBe('pda');
  });

  it('day_started runs compaction', async () => {
    const t = await boot();
    t.setState((s) => {
      s.slot = 'evening';
      s.memory.chronicle = [{ id: 'c1', kind: 'scene', day: 1, slot: 'morning', text: 'Rhea and the commander talked.' }, { id: 'c2', kind: 'scene', day: 1, slot: 'evening', text: 'Rhea held the line.' }];
    });
    await t.app.performActivity({ activityId: 'rest' });
    await vi.waitFor(() => expect(t.state().memory.chronicle.map((e) => e.kind)).toEqual(['day']));
    expect(t.state().memory.chronicle[0].text).toBe('Rhea and the commander talked. Rhea held the line.');
  });

  it('restoreSnapshot replaces the state only while it is the expected one', async () => {
    const t = await boot();
    const before = t.state();
    t.app.dispatch({ type: 'dm/send', payload: { unitId: RHEA, text: 'x' } });
    const after = t.state();
    expect(after).not.toBe(before);
    expect(t.app.restoreSnapshot(before, before)).toBe(false);
    expect(t.state()).toBe(after);
    expect(t.app.restoreSnapshot(before, after)).toBe(true);
    expect(t.state()).toBe(before);
  });

  it('message_swiped and message_deleted reach the scene controller without a scene', async () => {
    const t = await boot();
    expect(() => { t.st.emit('message_swiped', 3); t.st.emit('message_deleted', 3); }).not.toThrow();
  });

  it('commander_injured asks for visits', async () => {
    const t = await boot();
    t.setState((s) => { s.relations[RHEA].stateId = 'lover'; });
    t.app.dispatch({ type: 'commander/injure', payload: { days: 2 } });
    await flush();
    expect(t.state().calendar.nightEventsQueue).toMatchObject([{ unitId: RHEA, kind: 'visit', priority: 80 }]);
  });
});
