import type { ChatMessage } from './adapter';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Maps SillyTavern's `chat` array. Indices stay the true chat indices; system messages and non-objects are skipped. */
export function mapChatMessages(chat: unknown, from = 0): ChatMessage[] {
  if (!Array.isArray(chat)) return [];
  const out: ChatMessage[] = [];
  for (let index = Math.max(0, from); index < chat.length; index++) {
    const m: unknown = chat[index];
    if (!isObj(m) || m.is_system === true) continue;
    const avatar = typeof m.original_avatar === 'string' && m.original_avatar !== '' ? m.original_avatar : undefined;
    out.push({
      index, isUser: m.is_user === true, name: String(m.name ?? ''), ...(avatar ? { avatar } : {}),
      text: typeof m.mes === 'string' ? m.mes : '', swipeId: typeof m.swipe_id === 'number' ? m.swipe_id : 0,
    });
  }
  return out;
}

/** Avatar of the speaker of the last character (non-user, non-system) message, if the chat records one. */
export function lastCharacterAvatar(chat: unknown): string | undefined {
  if (!Array.isArray(chat)) return undefined;
  for (let i = chat.length - 1; i >= 0; i--) {
    const m: unknown = chat[i];
    if (isObj(m) && m.is_user !== true && m.is_system !== true) {
      return typeof m.original_avatar === 'string' && m.original_avatar !== '' ? m.original_avatar : undefined;
    }
  }
  return undefined;
}
