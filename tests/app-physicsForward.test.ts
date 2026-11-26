// @vitest-environment jsdom
/**
 * P10e-e fix (found by P10e-f Task 8): the scene's `physics` forwards every method of the staging controller the instruments call
 * (`PhysicsPanelStaging`). The optional ones (relief, decide, service, spit, restart, getUp, found, woke, script) were dropped by the app,
 * so in play an instrument's `env.staging.getUp?.()`, `relief?.()`, `woke?.()` … did nothing.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { SceneScreenCtx } from '../src/ui/scene/sceneScreen';
import type { StagingController } from '../src/blocking/controller';

const captured: { ctx: SceneScreenCtx | null; staging: StagingController[] } = { ctx: null, staging: [] };
vi.mock('../src/ui/scene/sceneScreen', async (orig) => {
  const real = await orig<typeof import('../src/ui/scene/sceneScreen')>();
  return { ...real, renderSceneScreen: (host: HTMLElement, ctx: SceneScreenCtx) => { captured.ctx = ctx; return real.renderSceneScreen(host, ctx); } };
});
vi.mock('../src/blocking/controller', async (orig) => {
  const real = await orig<typeof import('../src/blocking/controller')>();
  return { ...real, createStaging: (...a: Parameters<typeof real.createStaging>) => { const s = real.createStaging(...a); captured.staging.push(s); return s; } };
});

import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import { FakeStAdapter } from '../src/st/fake';
import { h } from '../src/ui/dom';

const OPTIONAL_STAGING = ['relief', 'decide', 'service', 'spit', 'restart', 'getUp', 'found', 'woke', 'script'] as const;

const SOLO = { chatId: 'solo', isGroup: false };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const RHEA = 'unit_rhea';

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
});
afterEach(() => { document.body.innerHTML = ''; });

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

async function sceneCtx(): Promise<{ ctx: SceneScreenCtx; staging: StagingController }> {
  const st = new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }];
  st.cards.set('rhea.png', { avatar: 'rhea.png', name: 'Rhea', description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  const screens = new Map<string, (host: HTMLElement) => void>();
  const shell = {
    open() {}, close() {}, isOpen: () => false, showScreen() {}, showTab() {},
    registerTab() {}, registerHub() {}, registerScreen(id: string, r: (host: HTMLElement) => void) { screens.set(id, r); },
    setTabLocked() {}, setTabBadge() {}, toast() {},
    async modal(o: { title: string }) { return o.title === 'Start a conversation' ? 'ok' : null; },
    setPalette() {}, refresh() {}, destroy() {},
  };
  captured.staging.length = 0;
  const app = createApp(st, { loadContent: async () => content, shellFactory: () => shell as never });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  await app.performActivity({ activityId: 'talk', companionId: RHEA });
  captured.ctx = null;
  const host = h('div');
  document.body.append(host);
  screens.get('scene')!(host);
  expect(captured.ctx).not.toBeNull();
  expect(captured.staging).toHaveLength(1);
  return { ctx: captured.ctx!, staging: captured.staging[0]! };
}

describe('the scene\'s physics forwards every staging method (P10e-e)', () => {
  it('each optional method of PhysicsPanelStaging is there', async () => {
    const { ctx } = await sceneCtx();
    for (const m of OPTIONAL_STAGING) expect(typeof (ctx.physics as unknown as Record<string, unknown>)[m], m).toBe('function');
  });

  it('each one reaches the staging controller with its arguments', async () => {
    const { ctx, staging } = await sceneCtx();
    const p = ctx.physics as unknown as Record<string, (...a: unknown[]) => unknown>;
    const args: Record<(typeof OPTIONAL_STAGING)[number], unknown[]> = {
      relief: [{ involuntary: true }], decide: ['grant', 'r1'], service: ['run_1', 'pleased'], spit: [3, 'watching'],
      restart: [], getUp: [], found: ['unit_x'], woke: [], script: [2],
    };
    for (const m of OPTIONAL_STAGING) {
      const spy = vi.spyOn(staging, m as never);
      p[m]!(...args[m]);
      expect(spy, m).toHaveBeenCalledWith(...args[m]);
    }
  });
});
