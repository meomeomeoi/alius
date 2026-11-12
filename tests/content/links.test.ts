import { describe, it, expect } from 'vitest';
import { linkTargets, parseLinks, stripLinks } from '../../src/content/links';

describe('drill-down link syntax', () => {
  it('parses a bare and a labelled link', () => {
    expect(parseLinks('See [[trust]] and [[items:medkit|the kit]] now.')).toEqual([
      'See ',
      { target: 'trust' },
      ' and ',
      { target: 'items:medkit', label: 'the kit' },
      ' now.',
    ]);
    expect(linkTargets('[[a]] [[b:c|d]]')).toEqual(['a', 'b:c']);
  });

  it('an unclosed bracket stays text', () => {
    expect(parseLinks('broken [[trust and more')).toEqual(['broken [[trust and more']);
    expect(parseLinks('empty [[]] stays')).toEqual(['empty [[]] stays']);
    expect(linkTargets('broken [[trust')).toEqual([]);
  });

  it('strip keeps labels and the id part', () => {
    expect(stripLinks('A [[trust]] B [[items:medkit]] C [[defects:x|the flaw]].')).toBe('A trust B medkit C the flaw.');
  });
});
