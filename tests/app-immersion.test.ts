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
import { loyaltyRecord } from '../src/engine/loyalty/state';
import { WANT_VISIT_KIND } from '../src/engine/bonds/scene';

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
    registerHub() {}, registerScreen(id: string, r: (host: HTMLElement) => void) { screenRenderers.set(id, r); },
    setTabLocked() {}, setTabBadge(id: string, n: number) { badges.set(id, n); },
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


/** The Night slot with the entry at the door, as the day end leaves it. */
async function nightWith(t: Awaited<ReturnType<typeof boot>>, entry: Record<string, unknown>) {
  t.setState((s) => {
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n1', unitId: RHEA, kind: 'visit', priority: 30, framing: 'Rhea knocks.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9, ...entry } as never;
  });
  await flush();
}

describe('the night door in the app (P10b)', () => {
  it('a want_visit knock renders the door, with the knock sound and the three options', async () => {
    const t = await boot();
    await nightWith(t, { kind: WANT_VISIT_KIND, framing: 'Rhea is at the door.' });
    const host = t.renderScreen('scene');
    expect(host.querySelector('.alius-door')).not.toBeNull();
    expect([...host.querySelectorAll('.alius-option')].map((b) => b.textContent)).toEqual(['[OPEN]', '[SAY SOMETHING THROUGH THE DOOR]', '[STAY SILENT]']);
  });

  it('a mutiny or desertion confrontation still renders its panel, not the door', async () => {
    const t = await boot();
    t.setState((s) => {
      s.slot = 'night';
      loyaltyRecord(s, RHEA).attempts = 1;
      s.calendar.nightEvent = { id: 'n_d', unitId: RHEA, kind: 'desertion', priority: 95, framing: 'Rhea is about to walk out.', ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: 9 } as never;
      s.disloyalty!.open = { kind: 'desertion', unitId: RHEA, day: s.day, at: 'night', nightEntryId: 'n_d' };
    });
    await flush();
    const host = t.renderScreen('scene');
    expect(host.querySelector('.alius-door')).toBeNull();
    expect(host.textContent).toContain('DESERTION');
  });

  it('staying silent takes the ignore consequence and rolls the day, like the old IGNORE', async () => {
    const t = await boot();
    await nightWith(t, {});
    const day = t.state().day;
    t.renderScreen('scene').querySelector<HTMLButtonElement>('button[data-action="ignore"]')!.click();
    await flush();
    expect(t.state().day).toBe(day + 1);
    expect(t.state().calendar.nightEvent).toBeUndefined();
    expect(t.screens.at(-1)).toBe('hub');
  });

  it('opening still starts the night scene', async () => {
    const t = await boot();
    await nightWith(t, {});
    t.renderScreen('scene').querySelector<HTMLButtonElement>('button[data-action="open"]')!.click();
    await vi.waitFor(() => expect(t.state().scene).toMatchObject({ origin: 'night', participants: [RHEA] }));
  });

  it('saying something through the door stores the exchange and the door shows both lines', async () => {
    const t = await boot();
    await nightWith(t, {});
    t.st.mainReplies = ['Not now.', JSON.stringify({ events: [], proposals: [], promises: [], facts: [] })];
    const host = t.renderScreen('scene');
    host.querySelector<HTMLButtonElement>('button[data-action="say"]')!.click();
    const input = host.querySelector<HTMLInputElement>('input.alius-door-input')!;
    input.value = 'Rhea? Open up.';
    host.querySelector<HTMLButtonElement>('button[data-action="send-door"]')!.click();
    await vi.waitFor(() => expect(t.state().calendar.nightEvent!.door).toEqual({ said: 'Rhea? Open up.', reply: 'Not now.' }));
    await vi.waitFor(() => expect(host.textContent).toContain('Not now.'));
    expect([...host.querySelectorAll('.alius-option')].map((b) => b.textContent)).toEqual(['[OPEN]', '[STAY SILENT]']);
    expect(t.state().slot).toBe('night');
  });

  it('a said door survives a reload of the screen', async () => {
    const t = await boot();
    await nightWith(t, { door: { said: 'Hello?', reply: 'Go away.' } });
    const host = t.renderScreen('scene');
    expect(host.textContent).toContain('Hello?');
    expect(host.textContent).toContain('Go away.');
    expect(host.querySelector('button[data-action="say"]')).toBeNull();
  });
});

describe('the HOME badge (P10b)', () => {
  it('counts the unread notes on show, and clears when they are read', async () => {
    const t = await boot();
    t.setState((s) => {
      s.notes = { seq: 2, list: [
        { id: 'hn1', unitId: RHEA, noteId: 'door_plain', where: 'door', text: 'A', day: s.day },
        { id: 'hn2', unitId: RHEA, noteId: 'desk_eat', where: 'quarters', text: 'B', day: s.day, read: true },
      ] };
    });
    expect(t.badges.get('home')).toBe(1);
    t.app.dispatch({ type: 'notes/read', payload: { id: 'hn1' } });
    t.setState(() => undefined);
    expect(t.badges.get('home') ?? 0).toBe(0);
  });

  it('is zero without notes', async () => {
    const t = await boot();
    t.setState(() => undefined);
    expect(t.badges.get('home') ?? 0).toBe(0);
  });
});
