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

function newStore(): FakeStAdapter {
  const st = new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }];
  st.cards.set('rhea.png', { avatar: 'rhea.png', name: 'Rhea', description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  st.settings.unitDms = false; // a spontaneous unit DM on a slot change would make the counts below flaky
  return st;
}

async function boot() {
  const st = newStore();
  const toasts: Array<{ kind: string; text: string }> = [];
  const screens: string[] = [];
  const modalTitles: string[] = [];
  const answers = new Map<string, string | null>([['Start a conversation', 'ok']]);
  const screenRenderers = new Map<string, (host: HTMLElement) => void>();
  let hubRender: ((host: HTMLElement, device: HTMLElement) => void) | null = null;
  const shell = {
    opened: 0,
    open() { shell.opened++; }, close() {}, isOpen: () => false,
    showScreen(id: string) { screens.push(id); }, showTab() {},
    registerTab() {}, registerHub(r: (host: HTMLElement, device: HTMLElement) => void) { hubRender = r; },
    registerScreen(id: string, r: (host: HTMLElement) => void) { screenRenderers.set(id, r); },
    setTabBadge() {}, isDeviceUp: () => false, setDevice() {},
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal(o: { title: string; body: Node | string; actions: Array<{ label: string; value: string }> }) {
      modalTitles.push(o.title);
      modalActions.push(o.actions.map((a) => a.label));
      return answers.has(o.title) ? answers.get(o.title)! : null;
    },
    setPalette() {}, refresh() {}, destroy() {},
  };
  const modalActions: string[][] = [];
  const app = createApp(st, { loadContent: async () => content, shellFactory: () => shell as never });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  toasts.length = 0;
  screens.length = 0;
  modalTitles.length = 0;
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
  return { st, app, state, setState, toasts, screens, answers, modalTitles, modalActions, renderScreen, shell, hub: () => hubRender };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('hub actions in the app', () => {
  it('registers the hub renderer, which draws the hub of the open campaign', async () => {
    const t = await boot();
    expect(t.hub()).not.toBeNull();
    const host = h('div');
    document.body.append(host);
    t.hub()!(host, h('div'));
    expect(host.querySelectorAll('.alius-room[data-room]')).toHaveLength(8);
    expect(host.querySelector('.alius-marker')).not.toBeNull();
  });

  it('talkAt starts the talk activity and opens the scene at the room location without the picker', async () => {
    const t = await boot();
    expect(await t.app.talkAt(RHEA, 'mess_hall')).toBe(true);
    expect(t.modalTitles).not.toContain('Start a conversation');
    expect(t.state().scene).toMatchObject({ participants: [RHEA], origin: 'activity', locationId: 'mess_hall', consumesSlot: true });
    expect(t.screens.at(-1)).toBe('scene');
  });

  it('a talkAt after a normal talk still asks for the location (the preset is used once)', async () => {
    const t = await boot();
    await t.app.talkAt(RHEA, 'mess_hall');
    await t.app.scene.end();
    t.modalTitles.length = 0;
    await t.app.performActivity({ activityId: 'talk', companionId: RHEA });
    expect(t.modalTitles).toEqual(['Start a conversation']);
  });

  it('talkAt on a confined unit toasts the reason and spends nothing', async () => {
    const t = await boot();
    t.setState((s) => {
      s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: RHEA, kind: 'confined', untilDay: s.day + 3 }], demands: [], demandLog: [] };
    });
    expect(await t.app.talkAt(RHEA, 'mess_hall')).toBe(false);
    expect(t.toasts.some((x) => /brig/.test(x.text))).toBe(true);
    expect(t.state().scene).toBeUndefined();
    expect(t.state().calendar.pendingScene).toBeUndefined();
    expect(t.state().slot).toBe('morning');
  });

  it('talkAt for a unit that does not exist does nothing', async () => {
    const t = await boot();
    expect(await t.app.talkAt('unit_nobody', 'mess_hall')).toBe(false);
    expect(t.state().calendar.pendingScene).toBeUndefined();
  });

  it('talkAt at a closed location releases the slot', async () => {
    const t = await boot();
    t.setState((s) => { s.slot = 'morning'; });
    // the roof is closed in the morning: the scene cannot start, so the talk must not hold the slot
    expect(await t.app.talkAt(RHEA, 'roof')).toBe(false);
    expect(t.state().calendar.pendingScene).toBeUndefined();
    expect(t.state().scene).toBeUndefined();
    expect(t.state().slot).toBe('morning');
  });

  it('endSlot confirms, then spends one slot', async () => {
    const t = await boot();
    t.answers.set('End the morning?', 'end');
    await t.app.endSlot();
    expect(t.modalTitles).toEqual(['End the morning?']);
    expect(t.modalActions.at(-1)).toEqual(['[ END MORNING ]', 'Cancel']);
    expect(t.state().slot).toBe('afternoon');
    expect(t.state().day).toBe(1);
  });

  it('cancel spends nothing', async () => {
    const t = await boot();
    t.answers.set('End the morning?', 'cancel');
    await t.app.endSlot();
    expect(t.state().slot).toBe('morning');
    t.answers.set('End the morning?', null);
    await t.app.endSlot();
    expect(t.state().slot).toBe('morning');
  });

  it('endSlot in a quiet night sleeps', async () => {
    const t = await boot();
    t.setState((s) => { s.slot = 'night'; });
    const spy = vi.spyOn(t.app, 'dispatch');
    t.answers.set('End the night?', 'end');
    await t.app.endSlot();
    const types = spy.mock.calls.map(([a]) => a.type);
    expect(types[0]).toBe('calendar/sleep');
    expect(types).not.toContain('calendar/consume_slot');
    expect(t.state().day).toBe(2);
    expect(t.state().slot).toBe('morning');
  });

  it('endSlot while a conversation is open toasts the reason and asks nothing', async () => {
    const t = await boot();
    await t.app.talkAt(RHEA, 'mess_hall');
    t.modalTitles.length = 0;
    await t.app.endSlot();
    expect(t.modalTitles).toEqual([]);
    expect(t.toasts.at(-1)).toEqual({ kind: 'warn', text: 'A conversation is open.' });
  });

  it('ending a scene returns to the hub', async () => {
    const t = await boot();
    await t.app.talkAt(RHEA, 'mess_hall');
    const host = t.renderScreen('scene');
    t.screens.length = 0;
    host.querySelector<HTMLButtonElement>('button[data-action="end"]')!.click();
    await vi.waitFor(() => expect(t.screens.at(-1)).toBe('hub'));
    expect(t.state().scene).toBeUndefined();
  });
});

describe('the real shell opens on the hub', () => {
  it('opening the shell after a reload shows the hub with the device down', async () => {
    const st = newStore();
    const first = createApp(st, { loadContent: async () => content, shellFactory: () => ({ open() {}, close() {}, isOpen: () => false, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {}, setTabBadge() {}, toast() {}, async modal() { return null; }, setPalette() {}, refresh() {}, destroy() {} }) as never });
    await first.start();
    expect(await first.deployCampaign(setupResult(), 'new_group')).toBe(true);

    const second = createApp(st, { loadContent: async () => content });
    await second.start();
    second.shell.open();
    try {
      const root = document.getElementById('alius-shell')!;
      expect(root.querySelector('.alius-hub')).not.toBeNull();
      expect(root.querySelectorAll('.alius-room[data-room]')).toHaveLength(8);
      expect(root.querySelector<HTMLElement>('.alius-device')!.dataset.up).toBe('false');
      expect(second.shell.isDeviceUp()).toBe(false);
      second.shell.showTab('comms');
      expect(second.shell.isDeviceUp()).toBe(true);
    } finally {
      second.shell.destroy();
    }
  });
});
