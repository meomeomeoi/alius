import { describe, it, expect, vi } from 'vitest';

// real.ts imports two SillyTavern-only modules; the build rewrites them, tests stub them.
vi.mock('st:group-chats', () => ({ editGroup: async () => {}, openGroupById: async () => true }));
vi.mock('st:world-info', () => ({ newWorldInfoEntryTemplate: {} }));

import { finishReasonOf } from '../../src/st/real';
import { FakeStAdapter } from '../../src/st/fake';

describe('finishReasonOf', () => {
  it('maps provider shapes', () => {
    expect(finishReasonOf({ choices: [{ finish_reason: 'length' }] })).toBe('length');
    expect(finishReasonOf({ stop_reason: 'max_tokens' })).toBe('length');
    expect(finishReasonOf({ candidates: [{ finishReason: 'MAX_TOKENS' }] })).toBe('length');
    expect(finishReasonOf({ choices: [{ finish_reason: 'stop' }] })).toBe('stop');
    expect(finishReasonOf({ stop_reason: 'end_turn' })).toBe('stop');
    expect(finishReasonOf('plain')).toBeUndefined();
    expect(finishReasonOf({ choices: [{ message: { content: 'x' } }] })).toBeUndefined();
  });
});

describe('FakeStAdapter answers', () => {
  const profileReq = (signal?: AbortSignal) => ({ profileId: 'p', prompt: 'x', maxTokens: 10, think: 'min' as const, signal });

  it('queueAnswer carries a finish reason for main and profile calls', async () => {
    const st = new FakeStAdapter();
    st.queueAnswer({ text: 'cut', finishReason: 'length' });
    st.queueAnswer({ text: 'p', finishReason: 'stop' }, true);
    expect(await st.generateMain({ prompt: 'x', maxTokens: 10 })).toEqual({ text: 'cut', finishReason: 'length' });
    expect(await st.generateWithProfile(profileReq())).toEqual({ text: 'p', finishReason: 'stop' });
  });

  it('plain strings in the queues still work', async () => {
    const st = new FakeStAdapter();
    st.mainReplies.push('hello');
    st.profileReplies.push('there');
    expect(await st.generateMain({ prompt: 'x', maxTokens: 10 })).toEqual({ text: 'hello' });
    expect(await st.generateWithProfile(profileReq())).toEqual({ text: 'there' });
  });

  it('hangNext resolves only on abort', async () => {
    const st = new FakeStAdapter();
    st.hangNext(true);
    await expect(st.generateWithProfile(profileReq(AbortSignal.timeout(10)))).rejects.toMatchObject({ name: 'AbortError' });
    st.hangNext();
    await expect(st.generateMain({ prompt: 'x', maxTokens: 10, signal: AbortSignal.timeout(10) })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
