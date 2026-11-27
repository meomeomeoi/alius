import { describe, expect, it } from 'vitest';
import { similarity, similarityOfWords, wordsOf } from '../../../src/engine/text/similarity';

describe('wordsOf', () => {
  it('lower-cases, drops the punctuation and keeps each word once', () => {
    expect([...wordsOf('Good, GOOD work; the work was good.')].sort()).toEqual(['good', 'the', 'was', 'work']);
  });
  it('reads words of any alphabet', () => {
    expect([...wordsOf('Отлично справились, café')].sort()).toEqual(['café', 'отлично', 'справились']);
  });
  it('is empty for nothing', () => {
    expect(wordsOf('  ...  ').size).toBe(0);
  });
});

describe('similarity', () => {
  it('equal texts are 1, whatever the case and the punctuation', () => {
    expect(similarity('You held well today.', 'you HELD well, today')).toBe(1);
  });
  it('disjoint texts are 0', () => {
    expect(similarity('You held well', 'The yard was cold')).toBe(0);
  });
  it('a near text is the share of the words they have in common', () => {
    // {you, held, well, today} vs {you, held, well, again}: 3 shared of 5 in all
    expect(similarity('You held well today', 'You held well again')).toBeCloseTo(0.6, 5);
  });
  it('an empty text is similar to nothing', () => {
    expect(similarity('', 'anything')).toBe(0);
    expect(similarity('', '')).toBe(0);
  });
  it('works on word lists too (what a log keeps)', () => {
    expect(similarityOfWords(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5, 5);
    expect(similarityOfWords([], ['a'])).toBe(0);
  });
});
