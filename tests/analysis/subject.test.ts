import { describe, it, expect } from 'vitest';
import { parseSubject, resolveTarget } from '../../src/analysis/subject';

describe('analysis subjects', () => {
  it('parses source, id and ctx', () => {
    expect(parseSubject('items:item_blade')).toEqual({ address: 'items:item_blade', source: 'items', id: 'item_blade', data: {} });
    expect(parseSubject('glossary:trust', '{"unitId":"u1"}')).toEqual({
      address: 'glossary:trust', source: 'glossary', id: 'trust', data: { unitId: 'u1' },
    });
    // only the first colon splits: ids may contain colons
    expect(parseSubject('flags:thread:t1:slug')).toMatchObject({ source: 'flags', id: 'thread:t1:slug' });
  });

  it('a malformed address is null', () => {
    expect(parseSubject('items:')).toBeNull();
    expect(parseSubject('trust')).toBeNull();
    expect(parseSubject(':x')).toBeNull();
    expect(parseSubject('')).toBeNull();
  });

  it('bad ctx JSON gives empty data', () => {
    expect(parseSubject('items:a', '{nope')!.data).toEqual({});
    expect(parseSubject('items:a', '[1,2]')!.data).toEqual({});
    expect(parseSubject('items:a', '"str"')!.data).toEqual({});
    expect(parseSubject('items:a', 'null')!.data).toEqual({});
    expect(parseSubject('items:a', '')!.data).toEqual({});
    expect(parseSubject('items:a', null)!.data).toEqual({});
  });

  it('a bare target resolves to glossary', () => {
    expect(resolveTarget('trust')).toBe('glossary:trust');
    expect(resolveTarget('items:item_blade')).toBe('items:item_blade');
    expect(resolveTarget('glossary:cp')).toBe('glossary:cp');
  });
});
