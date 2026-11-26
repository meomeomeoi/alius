// @vitest-environment jsdom
/**
 * P10e-f fix wave: the app's stage load (`loadStage` in `src/app.ts`). A woman who joins during play gets her folder's look without a chat
 * reopen.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import { FakeStAdapter } from '../src/st/fake';
import { stageLookOf } from '../src/ui/stage/look';

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const json = (v: unknown) => new Blob([JSON.stringify(v)], { type: 'application/json' });

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});

const unit = (cardRef: string, displayName: string): SetupResult['units'][number] => ({
  cardRef, displayName, roleId: 'assault',
  signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
  values: { ...ZERO, mercy: 2 }, likes: ['tea'], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 },
});
const setupResult = (): SetupResult => ({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit('rhea.png', 'Rhea')] });

const shell = () => {
  const s = {
    open() {}, close() {}, isOpen: () => false, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {},
    setTabLocked() {}, setTabBadge() {}, toast() {}, async modal() { return null; }, setPalette() {}, refresh() {}, destroy() {},
  };
  return () => s as never;
};

async function boot() {
  const st = new FakeStAdapter({ chatId: 'solo', isGroup: false });
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }, { avatar: 'zed.png', name: 'Zed' }];
  for (const [avatar, name] of [['rhea.png', 'Rhea'], ['zed.png', 'Zed']] as const) {
    st.cards.set(avatar, { avatar, name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  }
  st.stageFiles.set('rhea.png', new Map([['stage.json', json({ accent: '#111111' })]]));
  st.stageFiles.set('zed.png', new Map([['stage.json', json({ accent: '#222222' })]]));
  const app = createApp(st, { loadContent: async () => content, shellFactory: shell() });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  await flush();
  const rhea = app.current().state!.squad.find((u) => u.cardRef === 'rhea.png')!;
  expect(stageLookOf(rhea.id)?.accent).toBe('#111111');
  return { st, app, rhea };
}

describe('the app\'s stage load (P10e-f fix wave)', () => {
  it('a woman who joins by a dispatch gets her folder\'s look without a chat reopen; a dispatch that adds no card reads nothing', async () => {
    const { st, app } = await boot();
    const s = structuredClone(app.current().state!);
    s.world.incomingUnits = 1;
    app.replaceState(s); // the same squad: nothing is read again
    await flush();
    let lists = 0;
    const list = st.listStageFiles.bind(st);
    st.listStageFiles = async (avatar) => { lists += 1; return list(avatar); };
    app.dispatch({ type: 'debug/noop', payload: {} });
    await flush();
    expect(lists).toBe(0); // the cards did not change: no reload
    const events = app.dispatch({ type: 'squad/add_named', payload: { unit: unit('zed.png', 'Zed') } });
    expect(events.some((e) => e.type === 'error')).toBe(false);
    await flush();
    const zed = app.current().state!.squad.find((u) => u.cardRef === 'zed.png')!;
    expect(stageLookOf(zed.id)?.accent).toBe('#222222');
    expect(lists).toBeGreaterThan(0);
  });
});
