import '../../src/engine/actions/memory';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { openRecords } from '../../src/engine/generations';
import type { CampaignState, Fact } from '../../src/engine/state/types';
import { runCompaction } from '../../src/scene/chronicle';
import { createMemoryController } from '../../src/scene/memoryController';
import { ANN, BEA, harness, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const world = (over: Parameters<typeof harness>[1] = {}) => harness(reg, { ...over, settings: { autoRetry: 0, ...over.settings } });
const records = (h: Harness) => h.state().generations?.records ?? [];
const memoryOf = (h: Harness) => createMemoryController({
  st: h.st, registries: () => reg, settings: () => h.settings, generations: h.generations,
  app: { dispatch: (a: { type: string }) => h.dispatch(a as never), current: () => ({ load: { kind: 'none' }, state: h.state() }) } as never,
} as never);
const oldFacts = (s: CampaignState, unit: string, n: number): void => {
  for (let i = 0; i < n; i++) {
    s.memory.facts.push({ id: `f${s.memory.facts.length + 1}`, about: [unit], text: `${unit} fact ${i}.`, tags: [], importance: 3, day: s.day - 10, knownBy: [unit] });
  }
};
const aged = (s: CampaignState): void => {
  s.day = 20;
  oldFacts(s, ANN, 7);
  oldFacts(s, BEA, 7);
};
const withLines = (s: CampaignState) => {
  s.day = 3;
  s.memory.chronicle.push({ id: 'c1', kind: 'scene', day: 2, text: 'Ann argued with Bea.' }, { id: 'c2', kind: 'scene', day: 2, text: 'Vale fixed the generator.' });
};

describe('background sites', () => {
  it('compaction and fold fall back with no record', async () => {
    const c = world({ tweak: withLines });
    await runCompaction({ st: c.st, app: { dispatch: (a: never, o?: never) => c.dispatch(a), current: () => ({ state: c.state() }) } as never, settings: () => c.settings, generations: c.generations });
    expect(c.state().memory.chronicle[0]).toMatchObject({ kind: 'day', text: 'Ann argued with Bea. Vale fixed the generator.' }); // no reply queued: the model call failed
    expect(c.state().generations).toBeUndefined();
    expect(c.toasts).toEqual([]);

    const f = world({ tweak: aged });
    await memoryOf(f).run();
    expect(f.state().memory.dossiers?.[ANN]?.own ?? '').not.toBe('');
    expect(f.state().generations).toBeUndefined();
    expect(f.toasts).toEqual([]);
  });

  it('a failed rumor retelling is a quiet record and expires once told', async () => {
    const h = world({ tweak: (s) => {
      s.day = 12;
      s.memory.config = { preset: 'normal', rumorMode: 'model' };
      s.memory.facts.push({ id: 'fr1', about: [ANN], text: 'Ann broke down at the gate.', tags: [], importance: 3, day: 11, knownBy: [ANN, BEA], spread: 'slow' } as Fact);
    } });
    h.st.mainReplies = ['garbage with 3 numbers'];
    await memoryOf(h).run();
    expect(records(h)).toMatchObject([{ siteId: 'memory.rumor', key: 'fr1', quiet: true }]);
    expect(h.toasts).toEqual([]);
    // the fact is told by other means before the retry: the record says so
    const s = structuredClone(h.state());
    s.memory.facts[0].rumor = { text: 'They say Ann broke down.' };
    h.set(s);
    expect(await h.generations.retry('g1')).toEqual({ kind: 'expired', why: 'It is told as it was already.' });
    expect(records(h)[0]).toMatchObject({ status: 'expired' });
  });

  it('quiet records do not count for the badge or the hub', async () => {
    const h = world({ tweak: (s) => {
      s.day = 12;
      s.memory.config = { preset: 'normal', rumorMode: 'model' };
      s.memory.facts.push({ id: 'fr1', about: [ANN], text: 'Ann broke down at the gate.', tags: [], importance: 3, day: 11, knownBy: [ANN, BEA], spread: 'slow' } as Fact);
    } });
    h.st.mainReplies = ['garbage with 3 numbers'];
    await memoryOf(h).run();
    expect(openRecords(h.state())).toHaveLength(1);
    expect(openRecords(h.state()).filter((r) => r.quiet !== true)).toEqual([]);
  });
});
