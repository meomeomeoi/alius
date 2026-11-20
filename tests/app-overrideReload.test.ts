// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { FakeStAdapter } from '../src/st/fake';

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});

const unitOf = (name: string) => ({
  cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId: 'assault',
  signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
  values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 },
});
const setupResult = (): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
  units: [unitOf('Rhea'), unitOf('Bea'), unitOf('Cat')],
  mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
} as SetupResult);

/** A shell whose modals behave like the real host: a new modal cancels the open one, closeModal cancels it. */
async function boot() {
  const st = new FakeStAdapter({ chatId: 'solo', isGroup: false });
  for (const n of ['Rhea', 'Bea', 'Cat']) {
    const avatar = `${n.toLowerCase()}.png`;
    st.characters.push({ avatar, name: n });
    st.cards.set(avatar, { avatar, name: n, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  }
  const log: string[] = [];
  let current: { title: string; resolve: (v: string | null) => void } | null = null;
  const cancel = () => {
    if (!current) return;
    const c = current;
    current = null;
    log.push(`closed:${c.title}`);
    c.resolve(null);
  };
  const shell = {
    open() {}, close() {}, isOpen: () => true,
    showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {},
    setTabLocked() {}, setTabBadge() {}, toast() {},
    modal(o: { title: string }) {
      cancel();
      log.push(`open:${o.title}`);
      return new Promise<string | null>((resolve) => { current = { title: o.title, resolve }; });
    },
    closeModal() { cancel(); },
    setPalette() {}, refresh() {}, destroy() {},
  };
  const app = createApp(st, { loadContent: async () => content, shellFactory: () => shell as never });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  cancel();
  return { app, st, log, openTitle: () => current?.title ?? null };
}

describe('a waiting WARDEN OVERRIDE after a reload (0.1 audit)', () => {
  it('comes back: the closed modal of the previous load does not block it', async () => {
    const t = await boot();
    const next = structuredClone(t.app.current().state!);
    const w = next.leashswap!.warden!;
    w.override = { id: 'ov1', order: { kind: 'activity', activityId: 'work' } as never, expectationId: '', weight: 0.5, alternative: null, altLabel: 'hold', day: next.day, slot: next.slot, context: 'base' };
    t.app.replaceState(next);
    t.st.switchChat(t.st.getActiveChat()!); // the first load: the override modal opens
    await Promise.resolve();
    expect(t.openTitle()).toBe('WARDEN OVERRIDE');
    t.log.length = 0;
    t.st.switchChat(t.st.getActiveChat()!); // a second load while it is open
    await Promise.resolve();
    await Promise.resolve();
    expect(t.openTitle()).toBe('WARDEN OVERRIDE');
    expect(t.log).toContain('open:WARDEN OVERRIDE');
  });
});
