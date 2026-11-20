// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { FakeStAdapter } from '../src/st/fake';

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const RHEA = 'unit_rhea';

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
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

/** A shell whose modals behave like the real host: a new modal cancels the open one, closeModal cancels it. */
async function boot() {
  const st = new FakeStAdapter({ chatId: 'solo', isGroup: false });
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }];
  st.cards.set('rhea.png', { avatar: 'rhea.png', name: 'Rhea', description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
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

const found = (s: CampaignState) => {
  s.personal = { seq: 1, secrets: [{ id: 'secret_1', kindId: 'hidden_injury', text: 'Rhea hides a wound.', subjectId: RHEA, knownBy: [RHEA], reason: 'hidden_injury' as never, day: 1, status: 'found', foundRoute: 'insight', foundDay: 1 }] };
};

describe('a found, unanswered squad secret after a load (P9c)', () => {
  it('asks again and stays open', async () => {
    const t = await boot();
    const next = structuredClone(t.app.current().state!);
    found(next);
    t.app.replaceState(next);
    t.log.length = 0;
    t.st.switchChat(t.st.getActiveChat()!);
    await Promise.resolve();
    expect(t.openTitle()).toBe('SQUAD SECRET');
    expect(t.log).not.toContain('closed:SQUAD SECRET');
  });
});
