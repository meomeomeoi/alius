/**
 * A local measure of how alike two texts are (P16b, Task 20; P17g §2.1 extends it): the Jaccard of their word sets, 0 to 1. No model, no network, no draw. Words are runs of letters and digits of any
 * alphabet, lower-cased. A leaf: it imports nothing.
 */

/** The words of a text, lower-cased, each once. */
export const wordsOf = (text: string): Set<string> => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** The Jaccard of two word lists (shared words over all words either has): 0 when either is empty. */
export function similarityOfWords(a: Iterable<string>, b: Iterable<string>): number {
  const x = new Set(a);
  const y = new Set(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** How alike two texts are, 0 to 1 (equal words 1, no word in common 0). */
export const similarity = (a: string, b: string): number => similarityOfWords(wordsOf(a), wordsOf(b));
