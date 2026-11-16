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

/**
 * The runs (inclusive index pairs) of messages in `from…to` that ST's `/hide` may hide: inside the chat and not system messages
 * already. Alius records exactly these, because `/unhide` clears `is_system` on a whole range and would show a narrator line or a
 * deserter notice that was never Alius' to hide.
 */
export function hideRuns(length: number, from: number, to: number, isSystem: (index: number) => boolean): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start: number | null = null;
  const end = Math.min(to, length - 1);
  for (let i = Math.max(0, from); i <= end; i++) {
    if (isSystem(i)) {
      if (start !== null) runs.push([start, i - 1]);
      start = null;
    } else if (start === null) start = i;
  }
  if (start !== null) runs.push([start, end]);
  return runs;
}

/** ST's slash command for a run: `/hide 2-7` or `/unhide 5`. */
export const hideCommand = (unhide: boolean, [a, b]: [number, number]): string => `/${unhide ? 'unhide' : 'hide'} ${a === b ? a : `${a}-${b}`}`;

/** Whether ST marked the message as a system message (`is_system`): hidden from the model, and from every Alius read of the chat. */
export const isSystemMessage = (chat: unknown, index: number): boolean => {
  const m = Array.isArray(chat) ? (chat[index] as unknown) : undefined;
  return !isObj(m) || m.is_system === true;
};
