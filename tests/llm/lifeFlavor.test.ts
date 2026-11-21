import { describe, expect, it } from 'vitest';
import { sanitizeLifeShare, sanitizeLifeTrace } from '../../src/llm/calls/flavor';

describe('sanitizeLifeShare', () => {
  it('takes the text of the object, plain', () => {
    expect(sanitizeLifeShare({ text: 'Found a coin in the vents.' })).toBe('Found a coin in the vents.');
  });

  it('strips markdown, markup, control characters, a label and wrapping quotes', () => {
    expect(sanitizeLifeShare({ text: '**Message:** _I_ found `a` coin.\n\nIt was <b>old</b>.' })).toBe('I found a coin. It was old.');
    expect(sanitizeLifeShare({ text: '"Text: Quiet day."' })).toBe('Quiet day.');
    expect(sanitizeLifeShare({ text: 'DM: all quiet' })).toBe('all quiet');
  });

  it('cuts at 300 characters', () => {
    const text = sanitizeLifeShare({ text: 'a '.repeat(400) })!;
    expect(text.length).toBeLessThanOrEqual(300);
    expect(text.length).toBeGreaterThan(250);
    expect(text.endsWith(' ')).toBe(false);
  });

  it('refuses an empty or non-text answer and a pronoun for the commander', () => {
    for (const bad of [null, undefined, 'text', 4, [], {}, { text: '' }, { text: '   ' }, { text: 4 }, { text: '**' }, { text: 'I told him.' }, { text: 'His boots.' }]) expect(sanitizeLifeShare(bad), String(JSON.stringify(bad))).toBeNull();
  });
});

describe('sanitizeLifeTrace', () => {
  it('is the same, cut at 400', () => {
    expect(sanitizeLifeTrace({ text: 'Note: A pencil sketch, signed.' })).toBe('A pencil sketch, signed.');
    const text = sanitizeLifeTrace({ text: 'b '.repeat(500) })!;
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text.length).toBeGreaterThan(350);
    expect(sanitizeLifeTrace({ text: '' })).toBeNull();
    expect(sanitizeLifeTrace({ text: 'He signed it.' })).toBeNull();
  });
});
