// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { updateSettings } from '../src/settings';
import { FakeStAdapter } from '../src/st/fake';
import { h } from '../src/ui/dom';
import { renderSysTab } from '../src/ui/shell/sysTab';
import type { ShellDeps } from '../src/ui/shell/shell';

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

const setupResult = (over: Partial<SetupResult> = {}): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
  units: [{
    cardRef: 'rhea.png', displayName: 'Rhea', roleId: 'assault',
    signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
    defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
    values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
    baseline: { trust: 20, affinity: 0, attraction: 0 },
  }],
  ...over,
});

async function boot(opts: { explicitContent?: boolean; result?: SetupResult } = {}) {
  const st = new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }];
  st.cards.set('rhea.png', { avatar: 'rhea.png', name: 'Rhea', description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  if (opts.explicitContent !== undefined) updateSettings(st, { explicitContent: opts.explicitContent });
  let deps!: ShellDeps;
  const shell = {
    open() {}, close() {}, isOpen: () => false, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {},
    setTabLocked() {}, setTabBadge() {}, toast() {}, async modal() { return null; }, setPalette() {}, refresh() {}, destroy() {},
  };
  const app = createApp(st, { loadContent: async () => content, shellFactory: (d) => { deps = d; return shell as never; } });
  await app.start();
  expect(await app.deployCampaign(opts.result ?? setupResult(), 'new_group')).toBe(true);
  const startChat = st.getActiveChat()!;
  const state = (): CampaignState => app.current().state!;
  const directives = (): string => app.context.build(state(), 3000).directives;
  /** A reload like switching to another chat and back: the app reads the saved campaign again (after the save debounce). */
  const reload = async () => {
    await new Promise((r) => setTimeout(r, 650));
    st.switchChat(OTHER);
    st.switchChat(startChat);
  };
  const sys = () => {
    const host = h('div');
    document.body.append(host);
    renderSysTab(host, {
      st, getState: () => app.current().state, getLoad: () => ({ kind: 'none' }), getRegistries: deps.analyze!.registries,
      dispatch: (a) => deps.dispatch!(a), toast: () => {}, modal: async () => null, onSettingsChanged: () => {},
    });
    return host;
  };
  return { st, app, state, directives, reload, sys, deps: () => deps };
}

describe('the explicit-scenes carry-over (Review Focus 1)', () => {
  it('a campaign built without a content choice gets explicit_scenes once when the old switch is on', async () => {
    const t = await boot({ explicitContent: true });
    expect(t.state().content).toEqual({ enabled: ['explicit_scenes'] });
    expect(t.directives()).toContain('Explicit intimate scenes are allowed');
  });

  it('with the old switch off the campaign gets an empty choice', async () => {
    const t = await boot({ explicitContent: false });
    expect(t.state().content).toEqual({ enabled: [] });
    expect(t.directives()).toContain('Fade out intimate moments.');
  });

  it('carry-over happens once: turning explicit_scenes off survives a reload while the old switch is still on', async () => {
    const t = await boot({ explicitContent: true });
    t.deps().dispatch!({ type: 'content/set_categories', payload: { enabled: [] } });
    expect(t.state().content).toEqual({ enabled: [] });
    await t.reload();
    await t.reload();
    expect(t.state().content).toEqual({ enabled: [] });
    expect(t.directives()).toContain('Fade out intimate moments.');
  });

  it('the switch is never read again once a choice exists: turning it on later does not enable anything', async () => {
    const t = await boot({ explicitContent: false });
    updateSettings(t.st, { explicitContent: true });
    await t.reload();
    expect(t.state().content).toEqual({ enabled: [] });
  });

  it('an old save without a content key (an import) is carried over too', async () => {
    const t = await boot({ explicitContent: false });
    updateSettings(t.st, { explicitContent: true });
    const old = structuredClone(t.state());
    delete old.content;
    t.app.replaceState(old);
    expect(t.state().content).toEqual({ enabled: ['explicit_scenes'] });
  });

  it('a campaign set up with a choice keeps it, whatever the old switch says', async () => {
    const t = await boot({ explicitContent: true, result: setupResult({ content: { enabled: ['restraint'] } }) });
    expect(t.state().content).toEqual({ enabled: ['restraint'] });
  });
});

describe('SYS › Content changes the next generation', () => {
  it('a toggle in SYS dispatches the action and the next applyContext changes the directive', async () => {
    const t = await boot({ explicitContent: false });
    expect(t.directives()).toContain('Restraint');
    const sys = t.sys();
    sys.querySelector<HTMLButtonElement>('button[data-category="restraint"]')!.click();
    expect(t.state().content).toEqual({ enabled: ['restraint'] });
    const d = t.directives();
    expect(d).not.toContain('Restraint');
    expect(d).toContain('Humiliation');
    t.sys().querySelector<HTMLButtonElement>('button[data-category="explicit_scenes"]')!.click();
    expect(t.directives()).toContain('Explicit intimate scenes are allowed when the story leads there.');
  });

  it('disabling a category withdraws what is open under it, and the content line follows', async () => {
    const t = await boot({ explicitContent: true });
    t.deps().dispatch!({ type: 'content/set_categories', payload: { enabled: ['explicit_scenes', 'humiliation'] } });
    expect(t.directives()).not.toContain('Humiliation');
    t.deps().dispatch!({ type: 'content/set_categories', payload: { enabled: ['explicit_scenes'] } });
    expect(t.directives()).toContain('Humiliation');
  });
});
