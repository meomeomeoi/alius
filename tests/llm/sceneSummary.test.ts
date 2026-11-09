import { beforeEach, describe, expect, it } from 'vitest';
import { llmLog } from '../../src/llm/log';
import { summarizeScene, type SceneSummaryInput } from '../../src/llm/calls/sceneSummary';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};
const input = (over: Partial<SceneSummaryInput> = {}): SceneSummaryInput => ({
  location: 'Mess hall', participants: [{ id: 'unit_ann', name: 'Ann' }, { id: 'unit_bea', name: 'Bea' }],
  transcript: [{ speaker: 'Vale', text: 'Sit.' }, { speaker: 'Ann', text: 'No.' }], ...over,
});

describe('summarizeScene', () => {
  it('valid answer gives a chronicle and validated facts', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({
      chronicle: 'Ann refused to sit with the commander.',
      facts: [{ about: ['unit_ann'], text: 'Ann will not eat with him.', importance: 3, tags: ['meals'] }, { about: ['unit_zed'], text: 'ghost', importance: 3, tags: [] }],
    })];
    const r = await summarizeScene(input(), { st, settings });
    expect(r).toEqual({
      chronicle: 'Ann refused to sit with the commander.',
      facts: [{ about: ['unit_ann'], text: 'Ann will not eat with him.', importance: 3, tags: ['meals'] }],
    });
    const call = st.calls[0] as { prompt: string };
    expect(call.prompt).toContain('unit_ann');
    expect(call.prompt).toContain('Mess hall');
  });
  it('chronicle capped at 240 characters, newlines flattened', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ chronicle: `line one\n${'x'.repeat(400)}`, facts: [] })];
    const r = await summarizeScene(input(), { st, settings });
    expect(r!.chronicle.length).toBeLessThanOrEqual(240);
    expect(r!.chronicle).not.toContain('\n');
  });
  it('invalid → null (no chronicle, prose, or failed call)', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"facts": []}', '{"chronicle": ""}'];
    expect(await summarizeScene(input(), { st, settings })).toBeNull();
    st.mainReplies = ['they talked'];
    expect(await summarizeScene(input(), { st, settings })).toBeNull();
  });
  it('transcript is trimmed from the oldest side', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"chronicle": "ok", "facts": []}'];
    const transcript = Array.from({ length: 400 }, (_, i) => ({ speaker: 'Vale', text: `message ${String(i).padStart(3, '0')} ${'filler '.repeat(40)}` }));
    await summarizeScene(input({ transcript }), { st, settings });
    const { prompt } = st.calls[0] as { prompt: string };
    expect(prompt).toContain('message 399');
    expect(prompt).not.toContain('message 000');
    expect(prompt.length).toBeLessThan(20000);
  });
});
