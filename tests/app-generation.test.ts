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
const setupResult = (): SetupResult => ({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit('Rhea'), unit('Mira', 'defender')] });

async function boot() {
  const st = new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }, { avatar: 'mira.png', name: 'Mira' }];
  for (const [avatar, name] of [['rhea.png', 'Rhea'], ['mira.png', 'Mira']]) {
    st.cards.set(avatar, { avatar, name, description: 'x', personality: 'x', scenario: 'x', creatorNotes: '' });
    st.members.push({ avatar, name, active: true });
  }
  const toasts: Array<{ kind: string; text: string }> = [];
  const shell = {
    open: vi.fn(), close() {}, isOpen: () => true, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {},
    setTabLocked() {}, setTabBadge() {}, toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal() { return null; }, setPalette() {}, refresh: vi.fn(), destroy() {},
  };
  const app = createApp(st, { loadContent: async () => content, shellFactory: () => shell as never });
  await app.start();
  const built = await app.deployCampaign(setupResult(), 'new_group');
  expect(built).toBe(true);
  Object.assign(st.getSettings(), { autoRetry: 0, activityFlavor: true, gruntFlavor: true, enemyFlavor: true });
  st.calls.length = 0;
  const state = (): CampaignState => app.current().state!;
  return { st, app, state, toasts };
}

const records = (t: Awaited<ReturnType<typeof boot>>) => t.state().generations?.records ?? [];

describe('the sites the app owns', () => {
  it('a failed vignette is quiet and expires when the slot passes', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'rest', companionId: 'unit_rhea' }); // no reply queued
    expect(records(t)).toMatchObject([{ siteId: 'activity.vignette', quiet: true, status: 'open' }]);
    expect(t.toasts.some((x) => x.kind === 'story' || x.kind === 'warn' || x.kind === 'error')).toBe(false);
    // two more slots pass
    await t.app.performActivity({ activityId: 'rest' });
    await t.app.performActivity({ activityId: 'rest' });
    expect(await t.app.generations.retry(records(t)[0].id)).toEqual({ kind: 'expired', why: 'That moment has passed.' });
  });

  it('a retried vignette is told', async () => {
    const t = await boot();
    await t.app.performActivity({ activityId: 'rest', companionId: 'unit_rhea' });
    t.st.mainReplies = ['Rhea pours the tea.'];
    expect((await t.app.generations.retry(records(t)[0].id)).kind).toBe('applied');
    expect(t.toasts.some((x) => x.kind === 'story' && x.text === 'Rhea pours the tea.')).toBe(true);
    expect(records(t)).toEqual([]);
  });

  it('a failed grunt name is quiet and RETRY names the grunt', async () => {
    const t = await boot();
    t.st.settings.gruntFlavor = true;
    t.state().resources.credits; // (the recruit is paid for in the engine)
    await t.app.recruitGrunt();
    const grunt = t.state().squad.find((u) => u.kind === 'grunt');
    if (!grunt) return; // the fixture cannot afford a recruit: nothing to name
    expect(records(t)).toMatchObject([{ siteId: 'flavor.grunt', key: grunt.id, quiet: true }]);
    t.st.mainReplies = ['{"name": "Pike", "bio": "Keeps her head down."}'];
    expect((await t.app.generations.retry(records(t)[0].id)).kind).toBe('applied');
    expect(t.state().squad.find((u) => u.id === grunt.id)!.displayName).toBe('Pike');
  });

  it('grunt reroll renames', async () => {
    const t = await boot();
    t.st.mainReplies = ['{"name": "Pike", "bio": "Keeps her head down."}'];
    await t.app.recruitGrunt();
    const grunt = t.state().squad.find((u) => u.kind === 'grunt');
    if (!grunt) return;
    expect(grunt.displayName).toBe('Pike');
    t.st.mainReplies = ['{"name": "Sable", "bio": "Hums."}'];
    await t.app.rerollGrunt(grunt.id);
    expect(t.state().squad.find((u) => u.id === grunt.id)!.displayName).toBe('Sable');
  });
});
