// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type AliusApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { FakeStAdapter } from '../src/st/fake';
import { h } from '../src/ui/dom';
import type { ModalOpts } from '../src/ui/shell/modal';

const SOLO = { chatId: 'solo', isGroup: false };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
afterEach(() => {
  document.body.innerHTML = '';
});

const IMPORT_REPLY = JSON.stringify({
  roleCandidates: [{ roleId: 'defender', reason: 'Protective.' }],
  values: { pragmatism: 1, autonomy: -1, ingroup: 3, mercy: -2, corporate: 0, sacrifice: 2 },
  likes: ['rain'], dislikes: ['smoke'], triggers: ['fire'],
  signatureCandidates: [{ templateId: 'sig_shared_pain', name: 'Carry It', description: 'She takes the blow.' }],
  defectCandidates: [{ defectId: 'echo_bleed', origin: 'Heard things.' }],
  notes: 'ok',
});
const unit = (name: string, roleId = 'assault') => ({
  cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId,
  signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
  values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 },
});
const setupResult = (): SetupResult => ({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit('Rhea'), unit('Mira', 'defender')] });

function scriptedShell() {
  type Script = (opts: ModalOpts) => Promise<string | null>;
  const script: Script[] = [];
  const modals: ModalOpts[] = [];
  const toasts: Array<{ kind: string; text: string }> = [];
  const tabRenderers = new Map<string, (host: HTMLElement) => void>();
  const screenRenderers = new Map<string, (host: HTMLElement) => void>();
  const screens: string[] = [];
  const badges = new Map<string, number>();
  const shell = {
    open: vi.fn(), close() {}, isOpen: () => true,
    showScreen(id: string) { screens.push(id); },
    showTab() {},
    registerTab(id: string, r: (host: HTMLElement) => void) { tabRenderers.set(id, r); },
    registerHub() {}, registerScreen(id: string, r: (host: HTMLElement) => void) { screenRenderers.set(id, r); },
    setTabLocked() {}, setTabBadge(id: string, n: number) { badges.set(id, n); },
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal(opts: ModalOpts) {
      modals.push(opts);
      const next = script.shift();
      return next ? next(opts) : null;
    },
    setPalette() {}, refresh: vi.fn(), destroy() {},
  };
  return { shell, script, modals, toasts, tabRenderers, screenRenderers, screens, badges };
}

type Boot = Awaited<ReturnType<typeof boot>>;
async function boot(opts: { st?: FakeStAdapter; deploy?: boolean } = {}) {
  const st = opts.st ?? new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }, { avatar: 'mira.png', name: 'Mira' }, { avatar: 'zed.png', name: 'Zed' }];
  for (const [avatar, name] of [['rhea.png', 'Rhea'], ['mira.png', 'Mira'], ['zed.png', 'Zed']]) {
    st.cards.set(avatar, { avatar, name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  }
  st.settings.unitDms = false; // no unit DMs: they would eat the queued model replies
  st.settings.chronicleCompaction = false;
  const sh = scriptedShell();
  let shellDeps: { onSettingsChanged?: () => void } = {};
  const app: AliusApp = createApp(st, { loadContent: async () => content, shellFactory: (d) => { shellDeps = d as never; return sh.shell as never; }, assetUrl: (p) => `/${p}` });
  await app.start();
  if (opts.deploy !== false) {
    expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
    await settle();
  }
  const initialScreens = [...sh.screens];
  sh.toasts.length = 0;
  sh.screens.length = 0;
  st.calls.length = 0;
  const state = (): CampaignState => app.current().state!;
  const edit = (f: (s: CampaignState) => void): void => {
    const s = structuredClone(state());
    f(s);
    app.replaceState(s);
  };
  const mount = (screen: string): HTMLElement => {
    const host = h('div');
    document.body.append(host);
    sh.screenRenderers.get(screen)!(host);
    return host;
  };
  const tab = (id: string): HTMLElement => {
    const host = h('div');
    document.body.append(host);
    sh.tabRenderers.get(id)!(host);
    return host;
  };
  const endDay = async () => {
    app.dispatch({ type: 'calendar/consume_slot', payload: { slots: 3, reason: 'test' } });
    await settle();
  };
  return { st, app, sh, state, edit, mount, tab, endDay, initialScreens, settingsChanged: () => shellDeps.onSettingsChanged?.() };
}

import { closeNews, enqueue, writeLifeFact } from '../src/engine/life';
import { newLife } from '../src/engine/life/state';

const RHEA = 'unit_rhea';

/** Rhea has something to tell: an item of the queue (the fact is hidden), delivered as a DM or as a news directive. */
function tell(t: Boot, channel: 'dm' | 'directive'): string {
  let itemId = '';
  t.edit((s) => {
    s.settings.lifeEvents = 'normal';
    s.life = newLife(7);
    const fact = writeLifeFact(s, RHEA, 'Rhea: She mended a boot with wire.', ['life'], 1);
    enqueue(s, { unitId: RHEA, kind: 'event', ref: 'broke_favourite_thing', what: 'event', factId: fact.id, category: 'things', day: s.day });
    itemId = s.life.queue[0].id;
    if (channel === 'dm') s.life.outbox.push({ itemId, unitId: RHEA, channel: 'dm', day: s.day });
    else s.life.news.push({ itemId, unitId: RHEA, until: s.day + 3 });
  });
  return itemId;
}

describe('her life in the app (P14c)', () => {
  it('a waiting DM is worded by the model after the next settled dispatch', async () => {
    const t = await boot();
    const itemId = tell(t, 'dm');
    t.st.mainReplies = [JSON.stringify({ text: 'I fixed my boot with wire.' })];
    t.app.dispatch({ type: 'dm/read', payload: { unitId: RHEA } }); // anything that settles
    await settle();
    expect(t.state().dms[RHEA].map((m) => m.text)).toEqual(['I fixed my boot with wire.']);
    expect(t.state().life!.outbox).toEqual([]);
    expect(t.state().life!.queue.some((q) => q.id === itemId)).toBe(false);
    expect(t.state().memory.facts.find((f) => f.text.startsWith('Rhea: She mended'))!.hiddenFromCommander).toBeUndefined();
    expect(t.sh.toasts).toEqual([]);
  });

  it('with life off nothing is asked and the outbox waits', async () => {
    const t = await boot();
    tell(t, 'dm');
    t.edit((s) => { s.settings.lifeEvents = 'off'; });
    t.st.mainReplies = [JSON.stringify({ text: 'never' })];
    t.app.dispatch({ type: 'dm/read', payload: { unitId: RHEA } });
    await settle();
    expect(t.st.calls).toHaveLength(0);
    expect(t.state().life!.outbox).toHaveLength(1);
  });

  it('the news directive is in the next prompt while the scene is open, and gone once the news is told', async () => {
    const t = await boot();
    const itemId = tell(t, 'directive');
    const events = t.app.dispatch({ type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [RHEA], origin: 'event', startIndex: 0 } });
    expect(events.some((e) => e.type === 'error')).toBe(false);
    t.app.refreshContext();
    const built = () => t.app.context.build(t.state(), 5000).directives;
    expect(built()).toContain('She mended a boot with wire.');
    expect(built()).toContain('If it fits');
    // told (the intent route is Task 11's): the engine closes the item and the next refresh drops the directive
    t.edit((s) => { closeNews(s, itemId); });
    expect(built()).not.toContain('She mended a boot with wire.');
  });

  it('a news directive is not there with no scene open', async () => {
    const t = await boot();
    tell(t, 'directive');
    t.app.refreshContext();
    expect(t.app.context.build(t.state(), 5000).directives).not.toContain('mended a boot');
  });
});
