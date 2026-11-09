import { beforeEach, describe, expect, it } from 'vitest';
import { compactChronicle } from '../../src/llm/calls/chronicleCompact';
import { llmLog } from '../../src/llm/log';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};

describe('chronicle_compact', () => {
  it('joins to one paragraph ≤ 400', async () => {
    const { st, settings } = setup();
    st.mainReplies = [`Day 3.\n\n**Ann** argued with Bea. ${'x'.repeat(600)}`];
    const out = await compactChronicle({ kind: 'day', lines: ['Ann argued with Bea.', 'Vale fixed the generator.'] }, { st, settings });
    expect(out!.length).toBeLessThanOrEqual(400);
    expect(out).not.toMatch(/\n|\*/);
    const call = st.calls[0] as { prompt: string };
    expect(call.prompt).toContain('Ann argued with Bea.');
    expect(call.prompt).toContain('Vale fixed the generator.');
  });
  it('failure → null', async () => {
    const { st, settings } = setup();
    st.mainReplies = [];
    expect(await compactChronicle({ kind: 'week', lines: ['a'] }, { st, settings })).toBeNull();
    st.mainReplies = ['   ', '   '];
    expect(await compactChronicle({ kind: 'week', lines: ['a'] }, { st, settings })).toBeNull();
  });
  it('an empty input makes no call', async () => {
    const { st, settings } = setup();
    expect(await compactChronicle({ kind: 'day', lines: [] }, { st, settings })).toBeNull();
    expect(st.calls).toHaveLength(0);
  });
});
