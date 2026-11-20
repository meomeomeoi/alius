import { describe, expect, it } from 'vitest';
import { createCampaign } from '../../src/engine/state/create';
import { DAY_START_KEY, readDayStart } from '../../src/st/persistence';
import { FakeStAdapter } from '../../src/st/fake';

// The day-start snapshot (LEASHSWAP rewind) becomes the live campaign: it is checked like a save (0.1 audit).
const st = (snap: unknown): FakeStAdapter => {
  const f = new FakeStAdapter({ chatId: 'c1', isGroup: true, groupId: 'g' });
  f.writeMetadata(DAY_START_KEY, snap);
  return f;
};
const good = () => JSON.parse(JSON.stringify(createCampaign({ seed: 1, commanderName: 'Vale' })));

describe('readDayStart runs the save checks', () => {
  it('a sound snapshot is read', () => {
    const snap = readDayStart(st({ chatId: 'c1', day: 1, chatLength: 3, state: good() }));
    expect(snap?.state.day).toBe(1);
  });

  it('a snapshot whose state fails migrate (no version, a prototype key, a future version) is ignored', () => {
    expect(readDayStart(st({ chatId: 'c1', day: 1, chatLength: 3, state: { day: 1 } }))).toBeNull();
    const proto = good();
    proto.squad = [{ id: '__proto__' }];
    expect(readDayStart(st({ chatId: 'c1', day: 1, chatLength: 3, state: proto }))).toBeNull();
    const future = good();
    future.version = 99;
    expect(readDayStart(st({ chatId: 'c1', day: 1, chatLength: 3, state: future }))).toBeNull();
  });

  it('malformed hidden runs are dropped as on load, and the chat length must be a whole number', () => {
    const s = good();
    s.memory.hidden = [['0 | /echo x', 1], [2, 3]];
    expect(readDayStart(st({ chatId: 'c1', day: 1, chatLength: 3, state: s }))?.state.memory.hidden).toEqual([[2, 3]]);
    expect(readDayStart(st({ chatId: 'c1', day: 1, chatLength: 2.5, state: good() }))).toBeNull();
    expect(readDayStart(st({ chatId: 'c1', day: 1, chatLength: -1, state: good() }))).toBeNull();
  });
});
