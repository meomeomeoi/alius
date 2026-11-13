import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import {
  availableStates, enterState, evaluateAutomatic, evaluateEvent, meets, pushHistory, stateForProposal,
} from '../../../src/engine/relations/graph';
import type { CampaignState, HistoryEntry, Relation } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, loadCore, ofType } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';
const BEA = 'unit_bea';

type Patch = Partial<Pick<Relation, 'trust' | 'affinity' | 'attraction' | 'stateId'>> & {
  daysIn?: number; flags?: string[]; defects?: string[]; stress?: number; history?: HistoryEntry[]; leash?: Array<{ unitId: string }>;
};
/** A fresh world with ANN set to `patch` (everything else neutral). */
function world(patch: Patch = {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 30;
  const u = s.squad.find((x) => x.id === ANN)!;
  u.defects = (patch.defects ?? []).map((id) => ({ id }));
  u.stress = patch.stress ?? 0;
  const r = s.relations[ANN];
  Object.assign(r, { trust: 20, affinity: 0, attraction: 0, stateId: 'comrade', flags: patch.flags ?? [], history: patch.history ?? [] });
  for (const k of ['trust', 'affinity', 'attraction', 'stateId'] as const) if (patch[k] !== undefined) (r as unknown as Record<string, unknown>)[k] = patch[k];
  r.stateSince = s.day - (patch.daysIn ?? 20);
  s.leash.log = patch.leash ?? [];
  return s;
}
const ev = (type: string, n: number, day = 29): HistoryEntry[] => Array.from({ length: n }, () => ({ day, kind: 'event', type }));
const clone = (s: CampaignState) => structuredClone(s);
const autoState = (s: CampaignState): string => {
  const d = clone(s);
  evaluateAutomatic(d, reg, ANN);
  return d.relations[ANN].stateId;
};
const eventState = (s: CampaignState, type: string): string => {
  const d = clone(s);
  evaluateEvent(d, reg, ANN, type);
  return d.relations[ANN].stateId;
};
const proposal = (s: CampaignState, kind: string) => stateForProposal(s, reg, ANN, kind);

interface Case {
  id: string;
  via: 'auto' | 'event' | 'proposal';
  kind?: string;
  ok: Patch;
  /** One condition removed. */
  bad: Patch;
}
const FRIEND: Patch = { stateId: 'friend', trust: 50, affinity: 50 };
const cases: Case[] = [
  { id: 'comrade', via: 'proposal', kind: 'reconcile', ok: { stateId: 'estranged', trust: 30, affinity: -20 }, bad: { stateId: 'estranged', trust: 29, affinity: -20 } },
  { id: 'trusted', via: 'auto', ok: { trust: 45, daysIn: 3 }, bad: { trust: 45, daysIn: 2 } },
  { id: 'friend', via: 'proposal', kind: 'friendship_deepen', ok: { trust: 30, affinity: 30 }, bad: { trust: 30, affinity: 29 } },
  { id: 'confidant', via: 'proposal', kind: 'confide', ok: { stateId: 'friend', trust: 50, affinity: 55 }, bad: { stateId: 'friend', trust: 50, affinity: 54 } },
  { id: 'kindred', via: 'auto', ok: { stateId: 'confidant', trust: 60, affinity: 80, attraction: 29 }, bad: { stateId: 'confidant', trust: 60, affinity: 79, attraction: 29 } },
  { id: 'flirting', via: 'proposal', kind: 'date', ok: { ...FRIEND, affinity: 15, attraction: 25 }, bad: { ...FRIEND, affinity: 15, attraction: 24 } },
  { id: 'flirting', via: 'event', kind: 'accepted_advance', ok: { ...FRIEND, affinity: 15, attraction: 25 }, bad: { ...FRIEND, affinity: 14, attraction: 25 } },
  { id: 'fwb', via: 'proposal', kind: 'fwb', ok: { ...FRIEND, affinity: 55, attraction: 45 }, bad: { ...FRIEND, affinity: 56, attraction: 45 } },
  { id: 'lover', via: 'proposal', kind: 'romance', ok: { stateId: 'flirting', trust: 35, affinity: 55, attraction: 50 }, bad: { stateId: 'flirting', trust: 34, affinity: 55, attraction: 50 } },
  { id: 'devoted', via: 'proposal', kind: 'exclusive', ok: { stateId: 'lover', trust: 60, affinity: 85, attraction: 60, daysIn: 10 }, bad: { stateId: 'lover', trust: 60, affinity: 85, attraction: 60, daysIn: 9 } },
  { id: 'secret_affair', via: 'proposal', kind: 'secret_affair', ok: { ...FRIEND, affinity: 30, attraction: 45 }, bad: { ...FRIEND, affinity: 30, attraction: 44 } },
  { id: 'obsessed', via: 'auto', ok: { affinity: 60, trust: 24 }, bad: { affinity: 60, trust: 25 } },
  { id: 'obsessed', via: 'auto', ok: { affinity: 60, trust: 40, defects: ['possessive_protocol'] }, bad: { affinity: 59, trust: 40, defects: ['possessive_protocol'] } },
  { id: 'obsessed', via: 'auto', ok: { affinity: 60, trust: 40, history: ev('stress_high', 3) }, bad: { affinity: 60, trust: 40, history: ev('stress_high', 2) } },
  { id: 'dependent', via: 'auto', ok: { affinity: 40, trust: 40, flags: ['need_controlled'], defects: ['imprint_hunger'] }, bad: { affinity: 40, trust: 40, defects: ['imprint_hunger'] } },
  { id: 'rival', via: 'event', kind: 'sided_against', ok: { trust: 30, affinity: 0, history: ev('sided_against', 2) }, bad: { trust: 30, affinity: 0, history: ev('sided_against', 1) } },
  { id: 'rival', via: 'proposal', kind: 'rivalry', ok: { trust: 30, affinity: 0, history: ev('sided_against', 2) }, bad: { trust: 29, affinity: 0, history: ev('sided_against', 2) } },
  { id: 'rival_romance', via: 'proposal', kind: 'romance', ok: { stateId: 'rival', trust: 40, affinity: 10, attraction: 45 }, bad: { stateId: 'rival', trust: 40, affinity: 10, attraction: 44 } },
  { id: 'unrequited', via: 'event', kind: 'rejected_advance', ok: { ...FRIEND, affinity: 20, attraction: 50 }, bad: { ...FRIEND, affinity: 20, attraction: 49 } },
  { id: 'resentful', via: 'auto', ok: { trust: 29, leash: [{ unitId: ANN }] }, bad: { trust: 29, leash: [{ unitId: BEA }] } },
  { id: 'estranged', via: 'auto', ok: { affinity: -30, trust: 30 }, bad: { affinity: -29, trust: 30 } },
  { id: 'despises', via: 'auto', ok: { affinity: -60, trust: 14 }, bad: { affinity: -60, trust: 15 } },
];

describe('entry conditions, state by state', () => {
  it.each(cases)('$id via $via ($kind): entered when its entry holds', (c) => {
    const s = world(c.ok);
    if (c.via === 'auto') expect(autoState(s)).toBe(c.id);
    else if (c.via === 'event') expect(eventState(s, c.kind!)).toBe(c.id);
    else expect(proposal(s, c.kind!)).toEqual({ stateId: c.id });
  });
  it.each(cases)('$id via $via ($kind): not entered when one condition is missing', (c) => {
    const s = world(c.bad);
    if (c.via === 'auto') expect(autoState(s)).not.toBe(c.id);
    else if (c.via === 'event') expect(eventState(s, c.kind!)).not.toBe(c.id);
    else expect(proposal(s, c.kind!)).not.toEqual({ stateId: c.id });
  });
  it('every core state except the start state is covered by a case', () => {
    const covered = new Set(cases.map((c) => c.id));
    // a state that needs a commander trait (sworn) cannot be entered in this world: it is covered by vow.test.ts
    for (const id of reg.relationshipStates.keys()) if (id !== 'stranger' && reg.relationshipStates.get(id)!.requiresTrait === undefined) expect(covered.has(id), id).toBe(true);
  });
  it('stranger is a start state: no condition ever enters it', () => {
    for (const from of reg.relationshipStates.keys()) {
      if (from === 'stranger') continue;
      expect(autoState(world({ stateId: from, trust: 50, affinity: 50 })), from).not.toBe('stranger');
    }
  });
});

describe('exit rules', () => {
  const exits: Array<[string, string, Patch]> = [
    ['stranger', 'comrade', { trust: 20 }],
    ['estranged', 'comrade', { affinity: -19, trust: 30 }],
    ['despises', 'estranged', { affinity: -49, trust: 15 }],
    ['resentful', 'comrade', { trust: 40, leash: [{ unitId: ANN }] }],
    ['obsessed', 'comrade', { affinity: 39, trust: 40 }],
    ['kindred', 'confidant', { affinity: 85, attraction: 30, trust: 60 }],
    ['unrequited', 'comrade', { attraction: 29, affinity: 10, trust: 40 }],
    ...(['flirting', 'fwb', 'lover', 'devoted', 'secret_affair', 'rival_romance'] as const).map((st): [string, string, Patch] => [st, 'estranged', { affinity: -30, trust: 30, attraction: 40 }]),
  ];
  it.each(exits)('%s exits to %s', (from, to, patch) => {
    expect(autoState(world({ ...patch, stateId: from }))).toBe(to);
  });
  it('every exit rule of the content is exercised', () => {
    const rules = [...reg.relationshipStates.values()].flatMap((s) => (s.exit as Array<{ to: string }>).map((e) => `${s.id}>${e.to}`));
    for (const r of rules) expect(exits.some(([f, t]) => `${f}>${t}` === r), r).toBe(true);
  });
  it('an exit stays closed while its condition does not hold', () => {
    expect(autoState(world({ stateId: 'estranged', affinity: -25, trust: 30 }))).toBe('estranged');
    expect(autoState(world({ stateId: 'despises', affinity: -55, trust: 10 }))).toBe('despises');
  });
});

describe('automatic transitions', () => {
  it('stranger becomes comrade at trust 20 automatically', () => {
    const d = clone(world({ stateId: 'stranger', trust: 19 }));
    expect(evaluateAutomatic(d, reg, ANN)).toEqual([]);
    d.relations[ANN].trust = 20;
    const events = evaluateAutomatic(d, reg, ANN);
    expect(d.relations[ANN].stateId).toBe('comrade');
    expect(d.relations[ANN].stateSince).toBe(d.day);
    expect(ofType(events, 'relation_state_changed')).toEqual([{ type: 'relation_state_changed', unitId: ANN, from: 'stranger', to: 'comrade', why: 'exit' }]);
  });
  it('trusted needs three days as comrade', () => {
    expect(autoState(world({ trust: 60, daysIn: 2 }))).toBe('comrade');
    expect(autoState(world({ trust: 60, daysIn: 3 }))).toBe('trusted');
  });
  it('friend is never entered from numbers alone', () => {
    expect(autoState(world({ trust: 80, affinity: 80 }))).not.toBe('friend');
    expect(eventState(world({ trust: 80, affinity: 80 }), 'praised')).not.toBe('friend');
  });
  it('resentful counts leash log entries for this unit only', () => {
    expect(autoState(world({ trust: 10, leash: [{ unitId: BEA }, { unitId: BEA }] }))).toBe('comrade');
    expect(autoState(world({ trust: 10, leash: [{ unitId: BEA }, { unitId: ANN }] }))).toBe('resentful');
  });
  it('romance off hides lover even when every number fits', () => {
    const s = world({ stateId: 'flirting', trust: 50, affinity: 60, attraction: 60 });
    expect(proposal(s, 'romance')).toEqual({ stateId: 'lover' });
    s.settings.intimacy = { romance: false, initiative: 'med' };
    expect(proposal(s, 'romance')).toEqual({ fail: 'unavailable' });
    expect(availableStates(s, reg).some((e) => e.romance === true)).toBe(false);
  });
  it('romance off keeps an existing romantic state', () => {
    const s = world({ stateId: 'lover', trust: 60, affinity: 70, attraction: 70 });
    s.settings.intimacy = { romance: false, initiative: 'med' };
    expect(autoState(s)).toBe('lover');
  });
  it('a grunt never leaves the base group', () => {
    const s = world({ trust: 90, affinity: 90, daysIn: 10 });
    s.squad.find((u) => u.id === ANN)!.kind = 'grunt';
    expect(autoState(s)).toBe('trusted'); // trusted is allowed for grunts
    const d = clone(s);
    d.relations[ANN].stateId = 'trusted';
    d.relations[ANN].affinity = -80;
    d.relations[ANN].trust = 5;
    evaluateAutomatic(d, reg, ANN);
    expect(d.relations[ANN].stateId).toBe('trusted');
    for (const e of availableStates(s, reg, ANN)) expect(e.grunts).toBe(true);
  });
  it('one transition per evaluation, and the unit settles instead of flapping', () => {
    const d = clone(world({ stateId: 'stranger', trust: 10, affinity: -70 }));
    evaluateAutomatic(d, reg, ANN);
    expect(d.relations[ANN].stateId).toBe('despises');
    for (let i = 0; i < 5; i++) evaluateAutomatic(d, reg, ANN);
    expect(d.relations[ANN].stateId).toBe('despises');
  });
  it('the highest priority wins when several entries hold', () => {
    expect(autoState(world({ trust: 10, affinity: -70 }))).toBe('despises');
    expect(autoState(world({ trust: 40, affinity: 70, defects: ['possessive_protocol'], flags: ['need_controlled'] }))).toBe('obsessed');
  });
});

describe('loyalty band', () => {
  it('is recomputed with hysteresis and reported once', () => {
    const d = clone(world({ trust: 30 }));
    d.relations[ANN].loyaltyBand = 'steady';
    d.relations[ANN].trust = 24;
    expect(ofType(evaluateAutomatic(d, reg, ANN), 'loyalty_band_changed')).toEqual([{ type: 'loyalty_band_changed', unitId: ANN, from: 'steady', to: 'wavering' }]);
    expect(ofType(evaluateAutomatic(d, reg, ANN), 'loyalty_band_changed')).toEqual([]);
    d.relations[ANN].trust = 34;
    evaluateAutomatic(d, reg, ANN);
    expect(d.relations[ANN].loyaltyBand).toBe('wavering');
  });
});

describe('enterState and history', () => {
  it('sets state, since-day and a history entry', () => {
    const d = clone(world());
    const e = enterState(d, ANN, 'friend', 'proposal:friendship_deepen');
    expect(e).toEqual({ type: 'relation_state_changed', unitId: ANN, from: 'comrade', to: 'friend', why: 'proposal:friendship_deepen' });
    expect(d.relations[ANN]).toMatchObject({ stateId: 'friend', stateSince: d.day });
    expect(d.relations[ANN].history.at(-1)).toEqual({ day: d.day, kind: 'state', type: 'friend', detail: 'proposal:friendship_deepen' });
  });
  it('trims history to the last 60 entries', () => {
    const d = clone(world());
    for (let i = 0; i < 80; i++) pushHistory(d, ANN, { day: i, kind: 'event', type: 'praised' });
    expect(d.relations[ANN].history).toHaveLength(TUNING.relations.historyMax);
    expect(d.relations[ANN].history.at(-1)!.day).toBe(79);
    expect(d.relations[ANN].history[0].day).toBe(20);
  });
});

describe('meets', () => {
  const m = (s: CampaignState, c: Parameters<typeof meets>[3]) => meets(s, reg, ANN, c);
  it('empty conditions hold, an empty anyOf never does', () => {
    expect(m(world(), {})).toBe(true);
    expect(m(world(), { anyOf: [] })).toBe(false);
  });
  it('axes are inclusive ranges', () => {
    const s = world({ trust: 30 });
    expect(m(s, { axes: { trust: [30, 40] } })).toBe(true);
    expect(m(s, { axes: { trust: [31, 40] } })).toBe(false);
  });
  it('stress, flags, defects, states', () => {
    const s = world({ stress: 50, flags: ['a'], defects: ['echo_bleed'] });
    expect(m(s, { stressMin: 50 })).toBe(true);
    expect(m(s, { stressMin: 51 })).toBe(false);
    expect(m(s, { flagsAll: ['a'], flagsNone: ['b'] })).toBe(true);
    expect(m(s, { flagsNone: ['a'] })).toBe(false);
    expect(m(s, { defectsAny: ['x', 'echo_bleed'] })).toBe(true);
    expect(m(s, { inStates: ['friend', 'comrade'] })).toBe(true);
    expect(m(s, { inStates: ['friend'] })).toBe(false);
  });
  it('eventCount counts events only, and respects withinDays', () => {
    const s = world({ history: [...ev('praised', 2, 10), ...ev('praised', 1, 29), { day: 29, kind: 'state', type: 'praised' }] });
    expect(m(s, { eventCount: { type: 'praised', min: 3 } })).toBe(true);
    expect(m(s, { eventCount: { type: 'praised', min: 3, withinDays: 5 } })).toBe(false);
    expect(m(s, { eventCount: { type: 'praised', min: 1, withinDays: 5 } })).toBe(true);
  });
  it('nested anyOf', () => {
    const s = world({ trust: 30 });
    expect(m(s, { anyOf: [{ stressMin: 99 }, { anyOf: [{ axes: { trust: [30, 30] } }] }] })).toBe(true);
    expect(m(s, { axes: { trust: [0, 5] }, anyOf: [{}] })).toBe(false);
  });
});

describe('stateForProposal reasons', () => {
  it('too_soon: wrong state, too few days, missing history', () => {
    expect(proposal(world({ stateId: 'comrade' }), 'romance')).toEqual({ fail: 'too_soon' });
    expect(proposal(world({ stateId: 'lover', trust: 60, affinity: 90, daysIn: 3 }), 'exclusive')).toEqual({ fail: 'too_soon' });
    expect(proposal(world({ trust: 40, affinity: 0 }), 'rivalry')).toEqual({ fail: 'too_soon' });
  });
  it('no_trust beats not_interested', () => {
    expect(proposal(world({ stateId: 'flirting', trust: 20, affinity: 10, attraction: 20 }), 'romance')).toEqual({ fail: 'no_trust' });
  });
  it('not_interested: affinity or attraction too low', () => {
    expect(proposal(world({ stateId: 'friend', trust: 50, affinity: 50, attraction: 5 }), 'date')).toEqual({ fail: 'not_interested' });
    expect(proposal(world({ stateId: 'friend', trust: 50, affinity: 10, attraction: 30 }), 'date')).toEqual({ fail: 'not_interested' });
  });
  it('committed: another unit is devoted', () => {
    const s = world({ ...FRIEND, affinity: 20, attraction: 30 });
    expect(proposal(s, 'date')).toEqual({ stateId: 'flirting' });
    s.relations[BEA].stateId = 'devoted';
    expect(proposal(s, 'date')).toEqual({ fail: 'committed' });
    expect(proposal(s, 'friendship_deepen')).not.toEqual({ fail: 'committed' });
  });
  it('unavailable: romance off, or nothing lists that kind for a grunt', () => {
    const s = world({ ...FRIEND, attraction: 30 });
    s.settings.intimacy = { romance: false, initiative: 'med' };
    expect(proposal(s, 'date')).toEqual({ fail: 'unavailable' });
    const g = world({ trust: 60, affinity: 60 });
    g.squad.find((u) => u.id === ANN)!.kind = 'grunt';
    expect(proposal(g, 'friendship_deepen')).toEqual({ fail: 'unavailable' });
    expect(stateForProposal(world(), reg, 'ghost', 'date')).toEqual({ fail: 'unavailable' });
  });
  it('reconcile needs trust, break_up works from a romantic state', () => {
    expect(proposal(world({ stateId: 'lover', affinity: 60, attraction: 60 }), 'break_up')).toEqual({ stateId: 'comrade' });
    expect(proposal(world({ stateId: 'comrade' }), 'break_up')).toEqual({ fail: 'too_soon' });
  });
});
