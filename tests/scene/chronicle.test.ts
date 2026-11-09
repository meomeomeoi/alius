import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { runCompaction } from '../../src/scene/chronicle';
import { harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const withLines = (s: import('../../src/engine/state/types').CampaignState) => {
  s.day = 3;
  s.memory.chronicle.push({ id: 'c1', kind: 'scene', day: 2, text: 'Ann argued with Bea.' }, { id: 'c2', kind: 'scene', day: 2, text: 'Vale fixed the generator.' }, { id: 'c3', kind: 'scene', day: 3, text: 'Today.' });
};
const runReal = (h: ReturnType<typeof harness>) => runCompaction({ st: h.st, app: { dispatch: (a: { type: string }, o?: { expectChatId?: string }) => {
  if (o?.expectChatId !== undefined && h.st.getActiveChat()?.chatId !== o.expectChatId) return [{ type: 'error', code: 'chat_changed' }];
  return h.dispatch(a);
}, current: () => ({ load: { kind: 'none' }, state: h.state() }) } as never, settings: () => h.settings });

describe('chronicle compaction', () => {
  it('compacts yesterday with the model', async () => {
    const h = harness(reg, { tweak: withLines });
    h.st.mainReplies = ['Day 2: Ann and Bea argued; the generator was fixed.'];
    await runReal(h);
    expect(h.state().memory.chronicle.map((e) => [e.kind, e.day, e.text])).toEqual([
      ['day', 2, 'Day 2: Ann and Bea argued; the generator was fixed.'], ['scene', 3, 'Today.'],
    ]);
    expect((h.st.calls[0] as { prompt: string }).prompt).toContain('Ann argued with Bea.');
  });

  it('uses the fallback without a profile or an answer', async () => {
    const h = harness(reg, { tweak: withLines });
    await runReal(h);
    expect(h.state().memory.chronicle[0]).toMatchObject({ kind: 'day', day: 2, text: 'Ann argued with Bea. Vale fixed the generator.' });
  });

  it('uses the fallback when the setting is off, without calling the model', async () => {
    const h = harness(reg, { tweak: withLines, settings: { chronicleCompaction: false } });
    h.st.mainReplies = ['should not be used'];
    await runReal(h);
    expect(h.st.calls).toHaveLength(0);
    expect(h.state().memory.chronicle[0].text).toBe('Ann argued with Bea. Vale fixed the generator.');
  });

  it('drops the result after a chat switch', async () => {
    const h = harness(reg, { tweak: withLines });
    h.st.mainReplies = ['A summary.'];
    const real = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.st.switchChat({ chatId: 'chat-2', isGroup: true, groupId: 'g2' });
      return real(req);
    };
    const before = structuredClone(h.state().memory.chronicle);
    await runReal(h);
    expect(h.state().memory.chronicle).toEqual(before);
  });

  it('runs day entries and then a week entry in one go', async () => {
    const h = harness(reg, {
      tweak: (s) => {
        s.day = 30;
        for (let d = 1; d <= 7; d++) s.memory.chronicle.push({ id: `c${d}`, kind: 'scene', day: d, text: `line ${d}` });
      },
      settings: { chronicleCompaction: false },
    });
    await runReal(h);
    expect(h.state().memory.chronicle.map((e) => e.kind)).toEqual(['week']);
  });

  it('does nothing when nothing is due', async () => {
    const h = harness(reg);
    await runReal(h);
    expect(h.actions).toEqual([]);
  });
});
