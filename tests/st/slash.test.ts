import { describe, expect, it } from 'vitest';
import { escapeSlashText, sendCommand } from '../../src/st/slash';
import { lastCharacterAvatar, mapChatMessages } from '../../src/st/chat';

describe('slash text escaping', () => {
  it('pipes and macros are escaped', () => {
    expect(escapeSlashText('a | b')).toBe('a \\| b');
    expect(escapeSlashText('a || b')).toBe('a \\|\\| b');
    const macro = escapeSlashText('hi {{user}} and {{getvar::x}}');
    expect(macro).not.toContain('{{');
    expect(macro).not.toContain('}}');
    expect(macro.replace(/​/g, '')).toBe('hi {{user}} and {{getvar::x}}');
  });
  it('a backslash before a pipe stays a literal backslash', () => {
    expect(escapeSlashText('a\\|b')).toBe('a\\\\\\|b');
    expect(escapeSlashText('path\\to')).toBe('path\\to');
  });
  it('a leading slash is neutralized', () => {
    const t = escapeSlashText('/echo hi');
    expect(t.startsWith('/')).toBe(false);
    expect(t.replace(/​/g, '')).toBe('/echo hi');
    expect(escapeSlashText('not /leading')).toBe('not /leading');
  });
  it('multi-line text survives', () => {
    expect(escapeSlashText('line one\nline two\n\nline four')).toBe('line one\nline two\n\nline four');
  });
  it('sendCommand is send then trigger with await', () => {
    expect(sendCommand('Hello | there')).toBe('/send Hello \\| there | /trigger await=true');
  });
});

describe('chat mapping', () => {
  const raw = [
    { name: 'Vale', is_user: true, mes: 'Hello', swipe_id: 0 },
    { name: 'Ann', is_user: false, mes: 'Hi.', swipe_id: 2, original_avatar: 'ann.png' },
    { name: 'System', is_system: true, mes: 'hidden', is_user: false },
    { name: 'Bea', is_user: false, mes: 'Hey.', original_avatar: 'bea.png' },
    null,
    { name: 'Odd', mes: 7 },
  ];
  it('maps fields and keeps true indices; system messages and junk are skipped', () => {
    const out = mapChatMessages(raw);
    expect(out).toEqual([
      { index: 0, isUser: true, name: 'Vale', text: 'Hello', swipeId: 0 },
      { index: 1, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'Hi.', swipeId: 2 },
      { index: 3, isUser: false, name: 'Bea', avatar: 'bea.png', text: 'Hey.', swipeId: 0 },
      { index: 5, isUser: false, name: 'Odd', text: '', swipeId: 0 },
    ]);
  });
  it('slices from an index', () => {
    expect(mapChatMessages(raw, 3).map((m) => m.index)).toEqual([3, 5]);
    expect(mapChatMessages(raw, 99)).toEqual([]);
    expect(mapChatMessages(raw, -4).map((m) => m.index)).toEqual([0, 1, 3, 5]);
  });
  it('finds the avatar of the last character message', () => {
    expect(lastCharacterAvatar(raw.slice(0, 4))).toBe('bea.png');
    expect(lastCharacterAvatar(raw)).toBeUndefined(); // the last character message records no avatar
    expect(lastCharacterAvatar([{ is_user: true, mes: 'x' }])).toBeUndefined();
    expect(lastCharacterAvatar('nope')).toBeUndefined();
  });
});
