import { beforeEach, describe, expect, it } from 'vitest';
import { pickEmotion } from '../../src/llm/calls/emotionPick';
import { llmLog } from '../../src/llm/log';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};

describe('emotion_pick', () => {
  it('known label', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"label": "joy"}'];
    expect(await pickEmotion({ unitName: 'Ann', text: 'That is wonderful news!' }, { st, settings })).toBe('joy');
    expect((st.calls[0] as { prompt: string }).prompt).toContain('wonderful news');
    expect((st.calls[0] as { system: string }).system).toContain('amusement');
  });
  it('unknown → null', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"label": "hangry"}'];
    expect(await pickEmotion({ unitName: 'Ann', text: 'x' }, { st, settings })).toBeNull();
    st.mainReplies = ['not json', 'still not'];
    expect(await pickEmotion({ unitName: 'Ann', text: 'x' }, { st, settings })).toBeNull();
  });
});
