import { describe, it, expect } from 'vitest';
import { FakeStAdapter } from '../../src/st/fake';

const A = { chatId: 'chat-a', isGroup: true, groupId: 'g1' };
const B = { chatId: 'chat-b', isGroup: false };

describe('FakeStAdapter', () => {
  it('metadata is per chat', () => {
    const st = new FakeStAdapter(A);
    st.writeMetadata('alius', { x: 1 });
    st.switchChat(B);
    expect(st.readMetadata('alius')).toBeUndefined();
    st.switchChat(A);
    expect(st.readMetadata('alius')).toEqual({ x: 1 });
  });

  it('setInjection with empty text clears', () => {
    const st = new FakeStAdapter(A);
    st.setInjection('ctx', 'hello', 'in_prompt', 0);
    expect(st.injections.get('ctx')).toEqual({ text: 'hello', position: 'in_prompt', depth: 0 });
    st.setInjection('ctx', '', 'in_prompt', 0);
    expect(st.injections.has('ctx')).toBe(false);
  });

  it('profile reply queue returns in order and records maxTokens', async () => {
    const st = new FakeStAdapter(A);
    st.profileReplies.push('one', 'two');
    const req = { profileId: 'p', prompt: 'q', maxTokens: 123, think: 'min' as const };
    expect(await st.generateWithProfile(req)).toBe('one');
    expect(await st.generateWithProfile({ ...req, maxTokens: 456 })).toBe('two');
    expect(st.calls.map((c) => [c.kind, c.maxTokens, c.think])).toEqual([
      ['profile', 123, 'min'],
      ['profile', 456, 'min'],
    ]);
  });

  it('queued Error is thrown', async () => {
    const st = new FakeStAdapter(A);
    st.profileReplies.push(new Error('network down'));
    await expect(
      st.generateWithProfile({ profileId: 'p', prompt: 'q', maxTokens: 10, think: 'auto' }),
    ).rejects.toThrow('network down');
    expect(st.calls).toHaveLength(1);
  });

  it('main model replies are queued and recorded', async () => {
    const st = new FakeStAdapter(A);
    st.mainReplies.push('hi');
    expect(await st.generateMain({ prompt: 'p', maxTokens: 50 })).toBe('hi');
    expect(st.calls[0]).toMatchObject({ kind: 'main', maxTokens: 50 });
  });

  it('getActiveChat returns null when no chat', () => {
    const st = new FakeStAdapter();
    expect(st.getActiveChat()).toBeNull();
    expect(st.readMetadata('alius')).toBeUndefined();
    st.switchChat(A);
    expect(st.getActiveChat()).toEqual(A);
  });

  it('emit calls handlers and switchChat emits chat_changed', () => {
    const st = new FakeStAdapter(A);
    const seen: unknown[][] = [];
    st.on('chat_changed', (...a) => seen.push(a));
    st.switchChat(B);
    st.emit('chat_changed', 'manual');
    expect(seen).toEqual([[], ['manual']]);
  });
});
