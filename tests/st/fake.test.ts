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

  it('openGroup switches chat and fires chat_changed', async () => {
    const st = new FakeStAdapter(B);
    const id = await st.createGroupChat({ name: 'G', members: ['a.png'] });
    let fired = 0;
    st.on('chat_changed', () => fired++);
    expect(await st.openGroup(id)).toBe(true);
    expect(st.getActiveChat()).toEqual({ chatId: 'chat-' + id, isGroup: true, groupId: id });
    expect(fired).toBe(1);
  });

  it('openGroup failure does not switch', async () => {
    const st = new FakeStAdapter(B);
    const id = await st.createGroupChat({ name: 'G', members: [] });
    st.failOpenGroup = true;
    expect(await st.openGroup(id)).toBe(false);
    expect(await st.openGroup('nope')).toBe(false);
    expect(st.getActiveChat()).toEqual(B);
  });

  it('createGroupChat stores members and returns a new id', async () => {
    const st = new FakeStAdapter(B);
    const a = await st.createGroupChat({ name: 'One', members: ['a.png', 'b.png'] });
    const b = await st.createGroupChat({ name: 'Two', members: [] });
    expect(a).not.toBe(b);
    expect(st.groups.get(a)).toEqual({ name: 'One', members: ['a.png', 'b.png'] });
    st.failCreateGroup = true;
    await expect(st.createGroupChat({ name: 'X', members: [] })).rejects.toThrow();
  });

  it('setChatLorebook writes world_info metadata', () => {
    const st = new FakeStAdapter(A);
    st.setChatLorebook('Alius Core Lore');
    expect(st.readMetadata('world_info')).toBe('Alius Core Lore');
  });

  it('addGroupMembers skips avatars already present', async () => {
    const st = new FakeStAdapter(A);
    st.members = [{ avatar: 'a.png', name: 'A', active: true }];
    await st.addGroupMembers(['a.png', 'b.png']);
    expect(st.members.map((m) => m.avatar)).toEqual(['a.png', 'b.png']);
  });
});

describe('FakeStAdapter chat (P3)', () => {
  const make = () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.personaName = 'Vale';
    return st;
  };
  const reply = (name: string, text: string) => ({ avatar: `${name.toLowerCase()}.png`, name, text });

  it('sendUserMessage appends user then replies in order and fires events', async () => {
    const st = make();
    st.groupReplies = [[reply('Ann', 'Hi.'), reply('Bea', 'Hey.')]];
    const seen: string[] = [];
    for (const e of ['message_sent', 'message_received', 'group_wrapper_finished'] as const) st.on(e, (i) => seen.push(`${e}:${String(i ?? '')}`));
    await st.sendUserMessage('Hello');
    expect(st.getChatMessages()).toEqual([
      { index: 0, isUser: true, name: 'Vale', text: 'Hello', swipeId: 0 },
      { index: 1, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'Hi.', swipeId: 0 },
      { index: 2, isUser: false, name: 'Bea', avatar: 'bea.png', text: 'Hey.', swipeId: 0 },
    ]);
    expect(st.chatLength()).toBe(3);
    expect(seen).toEqual(['message_sent:0', 'message_received:1', 'message_received:2', 'group_wrapper_finished:']);
  });

  it('failSend rejects without changing the chat', async () => {
    const st = make();
    st.failSend = true;
    st.groupReplies = [[reply('Ann', 'x')]];
    await expect(st.sendUserMessage('Hello')).rejects.toThrow(/send failed/i);
    expect(st.chatLength()).toBe(0);
    expect(st.groupReplies).toHaveLength(1);
  });

  it('swipe replaces the last reply and fires message_swiped', async () => {
    const st = make();
    st.groupReplies = [[reply('Ann', 'first')]];
    st.swipeReplies = [reply('Ann', 'second')];
    await st.sendUserMessage('Hello');
    const swiped: unknown[] = [];
    st.on('message_swiped', (i) => swiped.push(i));
    await st.swipeLast('right');
    expect(st.getChatMessages().at(-1)).toMatchObject({ text: 'second', swipeId: 1 });
    expect(swiped).toEqual([1]);
    await st.swipeLast('left');
    expect(st.getChatMessages().at(-1)).toMatchObject({ swipeId: 0 });
    expect(st.chatLength()).toBe(2);
  });

  it('regenerateLast also replaces the last reply', async () => {
    const st = make();
    st.groupReplies = [[reply('Ann', 'first')]];
    st.swipeReplies = [reply('Ann', 'again')];
    await st.sendUserMessage('Hello');
    await st.regenerateLast();
    expect(st.getChatMessages().at(-1)!.text).toBe('again');
  });

  it('getChatMessages(from) slices', async () => {
    const st = make();
    st.groupReplies = [[reply('Ann', 'a'), reply('Bea', 'b')]];
    await st.sendUserMessage('Hello');
    expect(st.getChatMessages(1).map((m) => m.text)).toEqual(['a', 'b']);
    expect(st.getChatMessages(5)).toEqual([]);
  });

  it('getLastExpression returns the scripted label, stopGeneration is counted', async () => {
    const st = make();
    st.expressionsByName.set('ann.png', 'joy');
    expect(await st.getLastExpression('ann.png')).toBe('joy');
    expect(await st.getLastExpression('bea.png')).toBeNull();
    st.stopGeneration();
    expect(st.stopped).toBe(1);
  });
});


describe('FakeStAdapter editing (P3)', () => {
  it('editMessage changes the text, keeps the rest and fires message_edited', async () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.groupReplies = [[{ avatar: 'ann.png', name: 'Ann', text: 'first' }]];
    await st.sendUserMessage('Hello');
    const edited: unknown[] = [];
    st.on('message_edited', (i) => edited.push(i));
    await st.editMessage(1, 'changed');
    expect(st.getChatMessages().map((m) => m.text)).toEqual(['Hello', 'changed']);
    expect(st.getChatMessages()[1]).toMatchObject({ name: 'Ann', avatar: 'ann.png' });
    expect(edited).toEqual([1]);
    await expect(st.editMessage(9, 'x')).rejects.toThrow(/no such message/i);
  });
});
