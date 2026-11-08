import { describe, it, expect } from 'vitest';
import { toStLorebook } from '../../src/st/lorebook';

const book = {
  name: 'Test',
  entries: [
    { key: ['a'], comment: 'first', content: 'one', constant: true },
    { key: ['b', 'c'], comment: 'second', content: 'two', constant: false, order: 5 },
  ],
};

describe('toStLorebook', () => {
  it('entries get sequential uids, template defaults and order 100', () => {
    const out = toStLorebook(book, { selective: true, position: 0 });
    expect(out.entries['1']).toEqual({
      uid: 1, selective: true, position: 0, key: ['b', 'c'], comment: 'second', content: 'two', constant: false, order: 5,
    });
    expect(out.entries['0']).toMatchObject({ uid: 0, order: 100, constant: true });
  });

  it('template object is not shared between entries', () => {
    const template = { nested: { x: 1 } };
    const out = toStLorebook(book, template);
    (out.entries['0'].nested as { x: number }).x = 99;
    expect((out.entries['1'].nested as { x: number }).x).toBe(1);
    expect(template.nested.x).toBe(1);
  });
});
