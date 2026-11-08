import type { Lorebook } from './adapter';

/** Converts the compact pack lorebook into SillyTavern's `{ entries }` format. */
export function toStLorebook(
  book: Lorebook,
  template: Record<string, unknown>,
): { entries: Record<string, Record<string, unknown>> } {
  const entries: Record<string, Record<string, unknown>> = {};
  book.entries.forEach((e, i) => {
    entries[String(i)] = {
      uid: i,
      ...structuredClone(template),
      key: [...e.key],
      comment: e.comment,
      content: e.content,
      constant: e.constant,
      order: e.order ?? 100,
    };
  });
  return { entries };
}
