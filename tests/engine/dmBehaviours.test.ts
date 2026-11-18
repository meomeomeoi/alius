import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { hesitates, passes, receiptOf, replyModeFor, slotIndex, stampBehaviours, whenHolds } from '../../src/engine/dmBehaviours';
import { dispatch } from '../../src/engine/dispatch';
import type { CampaignState, DmMessage } from '../../src/engine/state/types';
import { campaign, loadCore } from '../helpers/world';
import { partner, plain } from '../helpers/personal';
import { setRelation } from '../helpers/loyalty';

let core: Registries;
beforeAll(async () => {
  core = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

/** The core pack with every chance set (1 = the entry always passes its hash, 0 = never). */
function withChance(chance: number, only?: string[]): Registries {
  const r = structuredClone(core);
  for (const e of r.dmBehaviours.values()) if (only === undefined || only.includes(String(e.id))) e.chance = chance;
  return r;
}
const msg = (over: Partial<Pick<DmMessage, 'id' | 'initiated' | 'slot'>> = {}) => ({ id: 'm7', slot: 'evening' as const, ...over });

/** Ann wants the commander: a lover with Want 50. */
function wanting(): CampaignState {
  const s = partner(plain(core), ANN, { stateId: 'lover', want: 50 });
  s.day = 5;
  s.slot = 'evening';
  return s;
}
const receive = (s: CampaignState, reg: Registries, payload: Record<string, unknown> = {}) =>
  dispatch(s, { type: 'dm/receive', payload: { unitId: ANN, text: 'Hello.', ...payload } }, reg);

describe('passes (the hash that replaces a roll)', () => {
  it('is a pure function of the key; chance 0 never, chance 1 always', () => {
    expect(passes('m1|x', 0.5)).toBe(passes('m1|x', 0.5));
    expect(Array.from({ length: 50 }, (_, i) => passes(`m${i}|x`, 0)).some(Boolean)).toBe(false);
    expect(Array.from({ length: 50 }, (_, i) => passes(`m${i}|x`, 1)).every(Boolean)).toBe(true);
    const half = Array.from({ length: 200 }, (_, i) => passes(`m${i}|x`, 0.5));
    expect(half.some(Boolean) && half.some((b) => !b)).toBe(true);
  });
});

describe('stampBehaviours', () => {
  it('is a pure function of the message id and the state: the same input gives the same ids, a different id can differ', () => {
    const s = wanting();
    const reg = withChance(0.5);
    const a = stampBehaviours(s, reg, ANN, msg({ id: 'm7' }));
    expect(stampBehaviours(s, reg, ANN, msg({ id: 'm7' }))).toEqual(a);
    const seen = new Set(Array.from({ length: 40 }, (_, i) => stampBehaviours(s, reg, ANN, msg({ id: `m${i}` })).join(',')));
    expect(seen.size).toBeGreaterThan(1);
    expect(structuredClone(s)).toEqual(s);
  });

  it('at most one entry per kind, the first in registry order', () => {
    const reg = withChance(1);
    reg.dmBehaviours.set('burst_second', { id: 'burst_second', name: 'B', description: 'D', kind: 'burst', chance: 1 });
    const ids = stampBehaviours(wanting(), reg, ANN, msg());
    expect(ids.filter((id) => reg.dmBehaviours.get(id)!.kind === 'burst')).toEqual(['burst_wanting']);
    const kinds = ids.map((id) => reg.dmBehaviours.get(id)!.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('never stamps a hesitation (it is live) and never a curt reply unless asked', () => {
    const reg = withChance(1);
    const s = wanting();
    setRelation(s, ANN, { stateId: 'resentful' });
    const kinds = stampBehaviours(s, reg, ANN, msg()).map((id) => reg.dmBehaviours.get(id)!.kind);
    expect(kinds).not.toContain('hesitate');
    expect(kinds).not.toContain('curt');
  });

  it('late needs a message she started herself and the evening or the night', () => {
    const reg = withChance(1, ['late_wanting']);
    const s = wanting();
    expect(stampBehaviours(s, reg, ANN, msg({ initiated: true }))).toEqual(['late_wanting']);
    expect(stampBehaviours(s, reg, ANN, msg({ initiated: false }))).toEqual([]);
    s.slot = 'morning';
    expect(stampBehaviours(s, reg, ANN, msg({ initiated: true, slot: 'morning' }))).toEqual([]);
    s.slot = 'night';
    expect(stampBehaviours(s, reg, ANN, msg({ initiated: true, slot: 'night' }))).toEqual(['late_wanting']);
    const calm = plain(core);
    calm.slot = 'evening';
    expect(stampBehaviours(calm, reg, ANN, msg({ initiated: true }))).toEqual([]);
  });

  it('returns nothing for a grunt, a dead unit or a unit that does not exist', () => {
    const s = wanting();
    expect(stampBehaviours(s, withChance(1), 'nobody', msg())).toEqual([]);
    s.squad[0].status = 'dead';
    expect(stampBehaviours(s, withChance(1), ANN, msg())).toEqual([]);
  });
});

describe('whenHolds', () => {
  it('every condition is checked and all must hold', () => {
    const s = wanting();
    const ctx = { initiated: false };
    expect(whenHolds(s, core, ANN, {}, ctx)).toBe(true);
    expect(whenHolds(s, core, ANN, { minWant: 40 }, ctx)).toBe(true);
    expect(whenHolds(s, core, ANN, { minWant: 60 }, ctx)).toBe(false);
    expect(whenHolds(s, core, ANN, { wantBands: ['restless'] }, ctx)).toBe(true);
    expect(whenHolds(s, core, ANN, { wantBands: ['aching'] }, ctx)).toBe(false);
    expect(whenHolds(s, core, ANN, { stateGroups: ['romantic'] }, ctx)).toBe(true);
    expect(whenHolds(s, core, ANN, { stateGroups: ['negative'] }, ctx)).toBe(false);
    expect(whenHolds(s, core, ANN, { states: ['lover', 'fwb'] }, ctx)).toBe(true);
    expect(whenHolds(s, core, ANN, { states: ['friend'] }, ctx)).toBe(false);
    expect(whenHolds(s, core, ANN, { attachment: ['steady'] }, ctx)).toBe(true);
    expect(whenHolds(s, core, ANN, { attachment: ['avoidant'] }, ctx)).toBe(false);
    expect(whenHolds(s, core, ANN, { slots: ['evening'] }, ctx)).toBe(true);
    expect(whenHolds(s, core, ANN, { slots: ['morning'] }, ctx)).toBe(false);
    expect(whenHolds(s, core, ANN, { initiated: true }, ctx)).toBe(false);
    expect(whenHolds(s, core, ANN, { initiated: true }, { initiated: true })).toBe(true);
    expect(whenHolds(s, core, ANN, { minWant: 40, slots: ['morning'] }, ctx)).toBe(false);
  });

  it('a unit with no bond profile counts as steady (P9d\'s modest profile); no Want with romance off', () => {
    const s = plain(core);
    expect(whenHolds(s, core, ANN, { attachment: ['steady'] }, { initiated: false })).toBe(true);
    expect(whenHolds(s, core, ANN, { attachment: ['avoidant'] }, { initiated: false })).toBe(false);
    const w = wanting();
    w.settings.intimacy = { romance: false, initiative: 'med' } as never;
    expect(whenHolds(w, core, ANN, { minWant: 1 }, { initiated: false })).toBe(false);
  });

  it('afterConflictSlots: a trust or affinity drop of 3 within N slots; affinityDrop sums today\'s losses', () => {
    const s = plain(core);
    s.day = 5;
    s.slot = 'evening';
    const none = { initiated: false };
    expect(whenHolds(s, core, ANN, { afterConflictSlots: 2 }, none)).toBe(false);
    s.ledger = [{ day: 5, slot: 'morning', action: 'scene/exchange', key: `axis:${ANN}:trust`, delta: -3 }];
    expect(whenHolds(s, core, ANN, { afterConflictSlots: 2 }, none)).toBe(true); // two slots ago
    expect(whenHolds(s, core, ANN, { afterConflictSlots: 1 }, none)).toBe(false);
    s.ledger = [{ day: 5, slot: 'morning', action: 'scene/exchange', key: `axis:${ANN}:trust`, delta: -2 }];
    expect(whenHolds(s, core, ANN, { afterConflictSlots: 2 }, none)).toBe(false);
    s.ledger = [
      { day: 5, slot: 'morning', action: 'a', key: `axis:${ANN}:affinity`, delta: -2 },
      { day: 5, slot: 'afternoon', action: 'a', key: `axis:${ANN}:affinity`, delta: -3 },
      { day: 4, slot: 'evening', action: 'a', key: `axis:${ANN}:affinity`, delta: -9 },
      { day: 5, slot: 'afternoon', action: 'a', key: `axis:${ANN}:affinity`, delta: 4 },
      { day: 5, slot: 'afternoon', action: 'a', key: `axis:${BEA}:affinity`, delta: -9 },
    ];
    expect(whenHolds(s, core, ANN, { affinityDrop: 5 }, none)).toBe(true);
    expect(whenHolds(s, core, ANN, { affinityDrop: 6 }, none)).toBe(false);
  });
});

describe('dm/receive', () => {
  it('stamps the behaviours once and they survive a state change', () => {
    const reg = withChance(1, ['burst_wanting']);
    const s = wanting();
    const after = receive(s, reg).state;
    const stored = after.dms[ANN].at(-1)!;
    expect(stored.behaviours).toEqual(['burst_wanting']);
    const calmer = structuredClone(after);
    calmer.relations[ANN].want = 0;
    expect(calmer.dms[ANN].at(-1)!.behaviours).toEqual(['burst_wanting']);
    // a later message reads the new state, the old one is never rewritten
    const next = receive(calmer, reg).state;
    expect(next.dms[ANN].at(-2)!.behaviours).toEqual(['burst_wanting']);
    expect(next.dms[ANN].at(-1)!.behaviours).toBeUndefined();
  });

  it('no behaviours field at all when nothing holds (an ordinary message stays what it was)', () => {
    const msgs = receive(plain(core), core).state.dms[ANN];
    expect('behaviours' in msgs.at(-1)!).toBe(false);
  });

  it('draws no rng', () => {
    const s = wanting();
    const r = receive(s, withChance(1));
    expect(r.state.rng).toEqual(s.rng);
    expect(r.events.some((e) => e.type === 'error')).toBe(false);
  });

  it('mode curt stamps the curt entry that decided it; without the mode no curt is stamped', () => {
    const reg = withChance(1);
    const s = plain(core);
    setRelation(s, ANN, { stateId: 'resentful' });
    expect(receive(s, reg, { mode: 'curt' }).state.dms[ANN].at(-1)!.behaviours).toContain('curt_resentful');
    expect(receive(s, reg).state.dms[ANN].at(-1)!.behaviours ?? []).not.toContain('curt_resentful');
  });

  it('a payload mode other than curt is refused and changes nothing', () => {
    const s = plain(core);
    const r = receive(s, core, { mode: 'door' });
    expect(r.events.some((e) => e.type === 'error')).toBe(true);
    expect(r.state).toEqual(s);
  });
});

describe('replyModeFor', () => {
  it('curt only replaces reply, never snap', () => {
    const s = plain(core);
    setRelation(s, ANN, { stateId: 'resentful' });
    expect(replyModeFor(s, core, ANN, 'reply')).toBe('curt');
    expect(replyModeFor(s, core, ANN, 'snap')).toBe('snap');
  });

  it('stays reply when no curt entry holds or its hash fails; keyed by the next message id', () => {
    const s = plain(core);
    expect(replyModeFor(s, core, ANN, 'reply')).toBe('reply');
    setRelation(s, ANN, { stateId: 'resentful' });
    expect(replyModeFor(s, withChance(0), ANN, 'reply')).toBe('reply');
    const half = withChance(0.5, ['curt_resentful']);
    const modes = new Set<string>();
    for (let n = 0; n < 40; n++) {
      const t = structuredClone(s);
      t.memory.nextId = n;
      modes.add(replyModeFor(t, half, ANN, 'reply'));
    }
    expect(modes).toEqual(new Set(['reply', 'curt']));
  });

  it('a curt decision matches the message that is then received', () => {
    const half = withChance(0.5, ['curt_resentful']);
    for (let n = 0; n < 12; n++) {
      const s = plain(core);
      setRelation(s, ANN, { stateId: 'resentful' });
      s.memory.nextId = n;
      const mode = replyModeFor(s, half, ANN, 'reply');
      const stored = receive(s, half, mode === 'curt' ? { mode: 'curt' } : {}).state.dms[ANN].at(-1)!;
      expect(stored.behaviours?.includes('curt_resentful') ?? false).toBe(mode === 'curt');
    }
  });
});

describe('hesitates', () => {
  const sent = (s: CampaignState, from: 'commander' | string, id: string) => {
    (s.dms[ANN] ??= []).push({ id, from, text: 'x', day: s.day, slot: s.slot, read: true });
  };

  it('is keyed by the last commander message: only while the thread ends with it', () => {
    const reg = withChance(1, ['hesitate_avoidant']);
    const s = partner(plain(core), ANN, { attachment: 'avoidant', stateId: 'friend' });
    expect(hesitates(s, reg, ANN)).toBe(false); // empty thread
    sent(s, 'commander', 'm3');
    expect(hesitates(s, reg, ANN)).toBe(true);
    sent(s, ANN, 'm4');
    expect(hesitates(s, reg, ANN)).toBe(false);
  });

  it('needs an entry whose condition holds, and its hash for that message', () => {
    const s = partner(plain(core), ANN, { attachment: 'steady', stateId: 'friend' });
    sent(s, 'commander', 'm3');
    expect(hesitates(s, withChance(1), ANN, )).toBe(false); // steady, no recent conflict
    const avoidant = partner(plain(core), ANN, { attachment: 'avoidant', stateId: 'friend' });
    sent(avoidant, 'commander', 'm3');
    expect(hesitates(avoidant, withChance(0), ANN)).toBe(false);
    const half = withChance(0.5, ['hesitate_avoidant']);
    const answers = new Set(Array.from({ length: 40 }, (_, i) => {
      const t = structuredClone(avoidant);
      t.dms[ANN][0].id = `m${i}`;
      return hesitates(t, half, ANN);
    }));
    expect(answers).toEqual(new Set([true, false]));
  });

  it('a recent quarrel is enough, whatever her attachment', () => {
    const reg = withChance(1, ['hesitate_after_conflict']);
    const s = plain(core);
    s.day = 5;
    s.ledger = [{ day: 5, slot: s.slot, action: 'scene/exchange', key: `axis:${ANN}:trust`, delta: -4 }];
    sent(s, 'commander', 'm9');
    expect(hesitates(s, reg, ANN)).toBe(true);
  });
});

describe('receiptOf', () => {
  const thread = (s: CampaignState, items: Array<Partial<DmMessage> & { id: string }>) => {
    s.dms[ANN] = items.map((m) => ({ from: 'commander', text: 'x', day: s.day, slot: s.slot, read: true, ...m }));
    return s.dms[ANN];
  };

  it('slotIndex counts four slots a day', () => {
    expect(slotIndex(2, 'morning') - slotIndex(1, 'morning')).toBe(4);
    expect(slotIndex(1, 'night') - slotIndex(1, 'morning')).toBe(3);
  });

  it('delivered in the slot it was sent', () => {
    const s = plain(core);
    s.day = 5;
    s.slot = 'afternoon';
    const [m] = thread(s, [{ id: 'm1', day: 5, slot: 'afternoon' }]);
    expect(receiptOf(s, ANN, m)).toEqual({ status: 'delivered' });
  });

  it('read once a later message of hers exists, with the slots since', () => {
    const s = plain(core);
    s.day = 5;
    s.slot = 'evening';
    const [m] = thread(s, [{ id: 'm1', day: 5, slot: 'morning' }, { id: 'm2', from: ANN, day: 5, slot: 'afternoon' }]);
    expect(receiptOf(s, ANN, m)).toEqual({ status: 'read', slotsAgo: 1 });
    const [same] = thread(s, [{ id: 'm1', day: 5, slot: 'evening' }, { id: 'm2', from: ANN, day: 5, slot: 'evening' }]);
    expect(receiptOf(s, ANN, same)).toEqual({ status: 'read', slotsAgo: 0 });
  });

  it('left on read 2 slots ago when nothing came back', () => {
    const s = plain(core);
    s.day = 5;
    s.slot = 'evening';
    const [m] = thread(s, [{ id: 'm1', day: 5, slot: 'morning' }]);
    expect(receiptOf(s, ANN, m)).toEqual({ status: 'left_on_read', slotsAgo: 2 });
  });

  it('an earlier message of hers does not count as an answer', () => {
    const s = plain(core);
    s.day = 5;
    s.slot = 'evening';
    const items = thread(s, [{ id: 'm1', from: ANN, day: 5, slot: 'morning' }, { id: 'm2', day: 5, slot: 'morning' }]);
    expect(receiptOf(s, ANN, items[1]).status).toBe('left_on_read');
  });
});

describe('campaign() unchanged', () => {
  it('a plain campaign has no behaviour anywhere', () => {
    expect(JSON.stringify(campaign(core, 4).dms)).not.toContain('behaviours');
  });
});
