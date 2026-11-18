import { beforeAll, describe, expect, it } from 'vitest';
import { RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import { deviceAccess } from '../../src/engine/personal/access';
import { removeFromService } from '../../src/engine/leash/use';
import { endDay } from '../helpers/loyalty';
import { notesFor, unreadNotes, writeDoorNote } from '../../src/engine/notes';
import { notesDayStep } from '../../src/engine/notes/dayStep';
import { Rng } from '../../src/engine/rng';
import type { CampaignState, HandNote } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import '../../src/engine/actions/immersion';
import '../../src/engine/actions/personal';
import { errors, loadCore, ofType, run, stubExpedition } from '../helpers/world';
import { ANN, BEA, partner, plain } from '../helpers/personal';

let core: Registries;
beforeAll(async () => {
  core = await loadCore();
});

/** The core pack with every handNotes chance set (1 = the hash always passes). */
function withChance(chance: number): Registries {
  const r = structuredClone(core);
  for (const e of r.handNotes.values()) e.chance = chance;
  return r;
}

/** Ann: an assertive lover with an imported bond, so she has device access (≥ 2). */
function lover(): CampaignState {
  const s = partner(plain(core), ANN, { lead: 'assertive', stateId: 'lover' });
  s.day = 5;
  return s;
}
const step = (s: CampaignState, reg: Registries = withChance(1)) => {
  const d = structuredClone(s);
  const events = notesDayStep(d, { registries: reg, rng: new Rng(d.rng) });
  return { state: d, events };
};
const note = (over: Partial<HandNote> = {}): HandNote => ({ id: 'hn1', unitId: ANN, noteId: 'x', where: 'quarters', text: 'T', day: 5, ...over });
const withNotes = (s: CampaignState, ...list: HandNote[]): CampaignState => {
  s.notes = { seq: list.length, list };
  return s;
};

describe('the world of the notes', () => {
  it('the fixture lover has device access of 2 or more', () => {
    expect(deviceAccess(lover(), core, ANN)).toBeGreaterThanOrEqual(2);
  });

  it('the reserved events are reserved', () => {
    for (const t of ['note_left', 'note_read', 'notes_expired']) expect(RESERVED_EVENT_TYPES).toContain(t);
  });
});

describe('notesDayStep: daily notes', () => {
  it('writes nothing for a squad without an imported bond: ten day ends, notes absent, rng untouched', () => {
    let s = plain(core);
    s.day = 3;
    for (let i = 0; i < 10; i++) {
      const r = step(s);
      expect(r.events).toEqual([]);
      s = r.state;
      s.day++;
    }
    expect(s.notes).toBeUndefined();
    const d = structuredClone(s);
    const rng = new Rng(d.rng);
    notesDayStep(d, { registries: withChance(1), rng });
    expect(d.rng).toEqual(s.rng);
  });

  it('a daily quarters note for access ≥ 2, at most one per unit per day, with {name} filled and no marker', () => {
    const r = step(lover());
    const list = r.state.notes!.list;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ unitId: ANN, day: 5 });
    expect(list[0].text).not.toContain('{name}');
    expect(list[0].text).not.toMatch(/AUTHOR TO WRITE/);
    expect(list[0].text).toContain('Ann');
    expect(ofType(r.events, 'note_left')).toEqual([{ type: 'note_left', unitId: ANN, noteId: list[0].noteId, where: list[0].where }]);
    const again = step(r.state); // the same day, she still has an unread note of that place
    expect(again.state.notes!.list.length).toBeLessThanOrEqual(2);
    expect(again.state.notes!.list.filter((n) => n.unitId === ANN && n.day === 5)).toHaveLength(Math.min(again.state.notes!.list.length, 1));
  });

  it('none while she has an unread note of the same place; reading it frees the place', () => {
    const s = withNotes(lover(), note({ where: 'quarters', day: 4 }));
    const r = step(s);
    expect(r.state.notes!.list.filter((n) => n.where === 'quarters')).toHaveLength(1); // nothing new in the quarters
    s.notes!.list[0].read = true;
    const freed = step(s);
    expect(freed.state.notes!.list.length).toBe(2);
  });

  it('a gear note needs the close or romantic tier; a friend gets quarters notes only if her access allows', () => {
    const friend = partner(plain(core), ANN, { lead: 'assertive', stateId: 'friend' });
    friend.day = 5;
    expect(step(friend).state.notes?.list.every((n) => n.where !== 'gear') ?? true).toBe(true);
    const s = step(lover());
    expect(s.state.notes!.list[0].where).toBe('quarters'); // the first entry whose condition holds
  });

  it('a unit without access gets no quarters note (access 0)', () => {
    const s = partner(plain(core), ANN, { lead: 'balanced', stateId: 'stranger' });
    expect(deviceAccess(s, core, ANN)).toBeLessThan(2);
    expect(step(s).state.notes?.list.filter((n) => n.where === 'quarters') ?? []).toEqual([]);
  });

  it('the chance is a hash of day, unit and note: chance 0 never, and the same day gives the same answer', () => {
    expect(step(lover(), withChance(0)).state.notes).toBeUndefined();
    const reg = withChance(0.5);
    const a = step(lover(), reg).state.notes?.list.length ?? 0;
    const b = step(lover(), reg).state.notes?.list.length ?? 0;
    expect(a).toBe(b);
    const seen = new Set<number>();
    for (let day = 1; day <= 40; day++) {
      const s = lover();
      s.day = day;
      seen.add(step(s, reg).state.notes?.list.length ?? 0);
    }
    expect(seen).toEqual(new Set([0, 1]));
  });

  it('a unit who is not living loses her notes at the day end', () => {
    const s = withNotes(lover(), note({ unitId: BEA }), note({ id: 'hn2' }));
    s.squad.find((u) => u.id === BEA)!.status = 'dead';
    const r = step(s, withChance(0));
    expect(r.state.notes!.list.map((n) => n.unitId)).toEqual([ANN]);
  });
});

describe('door notes', () => {
  it('an unanswered knock leaves a door note, with no hash gate, even at chance 0', () => {
    const s = lover();
    const events = writeDoorNote(s, withChance(0), ANN);
    expect(s.notes!.list).toHaveLength(1);
    expect(s.notes!.list[0]).toMatchObject({ unitId: ANN, where: 'door', day: 5 });
    expect(s.notes!.list[0].text).not.toContain('{name}');
    expect(ofType(events, 'note_left')).toHaveLength(1);
  });

  it('night/ignore (the timer, STAY SILENT, the old IGNORE) leaves it; night/open does not', () => {
    const knock = (): CampaignState => {
      const s = lover();
      s.slot = 'night';
      s.calendar.nightEvent = { id: 'n1', unitId: ANN, kind: 'visit', priority: 50, framing: 'A knock.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99 };
      return s;
    };
    const ignored = run(knock(), core, { type: 'night/ignore', payload: {} });
    expect(errors(ignored.events)).toEqual([]);
    expect(ignored.state.notes!.list.filter((n) => n.where === 'door' && n.unitId === ANN)).toHaveLength(1);
    expect(ofType(ignored.events, 'note_left')).toHaveLength(1);
    const opened = run(knock(), core, { type: 'night/open', payload: {} });
    expect(opened.state.notes).toBeUndefined();
  });

  it('an unanswered knock of a unit with no entry that fits leaves nothing', () => {
    const s = plain(core);
    const reg = structuredClone(core);
    for (const e of reg.handNotes.values()) if (e.where === 'door') (e.when as Record<string, unknown>) = { ...(e.when as object), states: ['no_such_state'] };
    expect(writeDoorNote(s, reg, ANN)).toEqual([]);
    expect(s.notes).toBeUndefined();
  });
});

describe('expiry, cap, reading, leaving service', () => {
  it('notes expire three days after their day, and the list caps at 12, oldest out first', () => {
    const s = withNotes(lover(), note({ id: 'hn1', day: 1 }), note({ id: 'hn2', day: 2 }), note({ id: 'hn3', day: 4 }));
    s.day = 5;
    const r = step(s, withChance(0));
    expect(r.state.notes!.list.map((n) => n.id)).toEqual(['hn2', 'hn3']); // day 1 + 3 < 5; day 2 + 3 = 5 stays
    expect(ofType(r.events, 'notes_expired')).toEqual([{ type: 'notes_expired', count: 1 }]);
    const many = lover();
    many.notes = { seq: 14, list: Array.from({ length: 14 }, (_, i) => note({ id: `hn${i + 1}`, unitId: BEA, day: 5, where: 'quarters' })) };
    const capped = step(many, withChance(0)).state;
    expect(capped.notes!.list).toHaveLength(TUNING.notes.max);
    expect(capped.notes!.list[0].id).toBe('hn3');
    expect(TUNING.notes).toMatchObject({ keepDays: 3, max: 12 });
  });

  it('notesFor lists the unexpired, newest first, by place; unreadNotes counts them', () => {
    const s = withNotes(lover(), note({ id: 'hn1', day: 4, where: 'quarters' }), note({ id: 'hn2', day: 5, where: 'door' }), note({ id: 'hn3', day: 5, where: 'quarters', read: true }), note({ id: 'hn4', day: 1, where: 'quarters' }));
    expect(notesFor(s).map((n) => n.id)).toEqual(['hn3', 'hn2', 'hn1']);
    expect(notesFor(s, 'quarters').map((n) => n.id)).toEqual(['hn3', 'hn1']);
    expect(notesFor(s, 'gear')).toEqual([]);
    expect(unreadNotes(s)).toBe(2);
    expect(notesFor(plain(core))).toEqual([]);
    expect(unreadNotes(plain(core))).toBe(0);
  });

  it('notes/read marks one read and emits note_read; an unknown id is rejected', () => {
    const s = withNotes(lover(), note({ id: 'hn1' }), note({ id: 'hn2' }));
    const r = run(s, core, { type: 'notes/read', payload: { id: 'hn1' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'note_read')).toEqual([{ type: 'note_read', id: 'hn1', unitId: ANN }]);
    expect(r.state.notes!.list.map((n) => n.read)).toEqual([true, undefined]);
    expect(unreadNotes(r.state)).toBe(1);
    const bad = run(s, core, { type: 'notes/read', payload: { id: 'nope' } });
    expect(errors(bad.events)).toHaveLength(1);
    expect(bad.state).toEqual(s);
    expect(run(s, core, { type: 'notes/read', payload: { id: 'hn1' } }).state.rng).toEqual(s.rng);
  });

  it('removeFromService forgets her notes and nobody else\'s', () => {
    const s = withNotes(lover(), note({ id: 'hn1', unitId: ANN }), note({ id: 'hn2', unitId: BEA }));
    removeFromService(s, ANN, 'deserted');
    expect(s.notes!.list.map((n) => n.unitId)).toEqual([BEA]);
    const only = withNotes(lover(), note({ unitId: ANN }));
    removeFromService(only, ANN, 'deserted');
    expect(only.notes!.list).toEqual([]);
  });
});

describe('the day end runs the notes step after the personal step', () => {
  it('a real day end leaves her note (registered on dm_rumors by actions/immersion)', () => {
    const s = lover();
    s.slot = 'evening';
    const reg = withChance(1);
    const after = endDay(s, reg);
    expect(after.notes?.list.some((n) => n.unitId === ANN)).toBe(true);
  });
});

describe('while an expedition is open (HOME is the default tab, the device may be up)', () => {
  it('reading a note and choosing a hand still work; the guard keeps refusing everything else', () => {
    const s = withNotes(lover(), note({ id: 'hn1' }));
    s.expedition = stubExpedition(s);
    const read = run(s, core, { type: 'notes/read', payload: { id: 'hn1' } });
    expect(errors(read.events)).toEqual([]);
    expect(read.state.notes!.list[0].read).toBe(true);
    const hand = run(s, core, { type: 'squad/set_hand', payload: { unitId: ANN, handId: 'kalam' } });
    expect(errors(hand.events)).toEqual([]);
    expect(hand.state.squad[0].hand).toBe('kalam');
    expect(errors(run(s, core, { type: 'night/door_say', payload: { text: 'x' } }).events).length).toBeGreaterThan(0);
  });
});
