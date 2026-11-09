import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { Rng } from '../../../src/engine/rng';
import { evaluateAutomatic, evaluateEvent } from '../../../src/engine/relations/graph';
import {
  answerProposal, commanderProposal, offerProposal, rollDiscovery, romanticPartners,
} from '../../../src/engine/relations/proposals';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore, ofType } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

type Set = { state?: string; trust?: number; affinity?: number; attraction?: number; daysIn?: number };
function world(ann: Set = {}, bea: Set = {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 30;
  for (const u of s.squad) {
    u.defects = [];
    const r = s.relations[u.id];
    Object.assign(r, { stateId: 'comrade', trust: 40, affinity: 20, attraction: 0, stateSince: 1, flags: [], history: [] });
  }
  const put = (id: string, p: Set) => {
    const r = s.relations[id];
    if (p.state) r.stateId = p.state;
    if (p.trust !== undefined) r.trust = p.trust;
    if (p.affinity !== undefined) r.affinity = p.affinity;
    if (p.attraction !== undefined) r.attraction = p.attraction;
    if (p.daysIn !== undefined) r.stateSince = s.day - p.daysIn;
  };
  put(ANN, ann);
  put(BEA, bea);
  return s;
}
/** ANN is a friend who is ready for a date. */
const DATE_READY: Set = { state: 'friend', trust: 50, affinity: 30, attraction: 40 };
const LOVER: Set = { state: 'lover', trust: 70, affinity: 70, attraction: 70, daysIn: 20 };
const off = (s: CampaignState, kind: string, unitId = ANN) => offerProposal(s, reg, { unitId, kind, channel: 'scene' });
const cmd = (s: CampaignState, kind: string, unitId = ANN) => commanderProposal(s, reg, { unitId, kind, channel: 'scene' });
const clone = <T>(x: T): T => structuredClone(x);

describe('unit proposals', () => {
  it('a unit proposal with conditions met becomes pending', () => {
    const s = world(DATE_READY);
    const events = off(s, 'date');
    expect(s.proposals).toHaveLength(1);
    expect(s.proposals![0]).toMatchObject({ unitId: ANN, kind: 'date', from: 'unit', channel: 'scene', targetState: 'flirting', needsDisclosure: false, day: 30 });
    expect(ofType(events, 'proposal_offered')).toMatchObject([{ proposalId: s.proposals![0].id, unitId: ANN, kind: 'date', needsDisclosure: false }]);
  });
  it('a unit proposal with conditions unmet is dropped', () => {
    const s = world({ ...DATE_READY, attraction: 10 });
    expect(off(s, 'date')).toEqual([]);
    expect(s.proposals ?? []).toEqual([]);
  });
  it('a unit with an open proposal does not get a second one; grunts and the dead never propose', () => {
    const s = world(DATE_READY);
    off(s, 'date');
    expect(off(s, 'friendship_deepen')).toEqual([]);
    expect(s.proposals).toHaveLength(1);
    const g = world(DATE_READY);
    g.squad.find((u) => u.id === ANN)!.status = 'dead';
    expect(off(g, 'date')).toEqual([]);
  });
  it('no proposal-gated state is entered without accept', () => {
    const s = world({ state: 'flirting', trust: 60, affinity: 70, attraction: 70 });
    off(s, 'romance');
    evaluateAutomatic(s, reg, ANN);
    for (const t of ['praised', 'flirted', 'accepted_advance', 'physical_affection']) evaluateEvent(s, reg, ANN, t);
    expect(s.relations[ANN].stateId).toBe('flirting');
  });
  it('accept enters the state, records history and closes the proposal', () => {
    const s = world(DATE_READY);
    off(s, 'date');
    const events = answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[ANN].stateId).toBe('flirting');
    expect(s.proposals).toEqual([]);
    expect(ofType(events, 'relation_state_changed')).toMatchObject([{ unitId: ANN, from: 'friend', to: 'flirting', why: 'proposal:date' }]);
    expect(s.relations[ANN].history.some((h) => h.kind === 'proposal' && h.type === 'date')).toBe(true);
  });
  it('accept re-checks conditions that changed meanwhile', () => {
    const s = world(DATE_READY);
    off(s, 'date');
    s.relations[ANN].attraction = 5;
    const events = answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[ANN].stateId).toBe('friend');
    expect(ofType(events, 'proposal_resolved')).toMatchObject([{ receptive: false, reason: 'not_interested' }]);
    expect(s.proposals).toEqual([]);
  });
  it('decline applies rejected_advance and can enter unrequited', () => {
    const s = world({ ...DATE_READY, attraction: 60 });
    off(s, 'date');
    const before = clone(s.relations[ANN]);
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'decline' });
    const r = s.relations[ANN];
    expect(r.affinity).toBe(before.affinity - 5);
    expect(r.attraction).toBe(before.attraction - 6);
    expect(r.stateId).toBe('unrequited');
    expect(r.history.some((h) => h.type === 'rejected_advance' && h.severity === 'moderate')).toBe(true);
  });
  it('declining a friendly proposal is a dismissal, not a rejected advance', () => {
    const s = world({ state: 'comrade', trust: 40, affinity: 40 });
    off(s, 'friendship_deepen');
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'decline' });
    expect(s.relations[ANN].history.at(-1)).toMatchObject({ type: 'dismissed' });
    expect(s.relations[ANN].attraction).toBe(0);
  });
  it('not now changes nothing but closes it', () => {
    const s = world(DATE_READY);
    off(s, 'date');
    const before = clone(s.relations[ANN]);
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'not_now' });
    expect(s.relations[ANN]).toEqual(before);
    expect(s.proposals).toEqual([]);
  });
  it('confide sets shared_secret on accept', () => {
    const s = world({ state: 'friend', trust: 60, affinity: 60 });
    off(s, 'confide');
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[ANN].stateId).toBe('confidant');
    expect(s.relations[ANN].flags).toContain('shared_secret');
  });
  it('unknown proposals and impossible answers are rejected', () => {
    const s = world(DATE_READY);
    expect(() => answerProposal(s, reg, { proposalId: 'nope', answer: 'accept' })).toThrow(/no open proposal/);
    off(s, 'date');
    const id = s.proposals![0].id;
    expect(() => answerProposal(s, reg, { proposalId: id, answer: 'accept_secret' })).toThrow(/second romance/);
    expect(() => answerProposal(s, reg, { proposalId: id, answer: 'maybe' as never })).toThrow(/unknown answer/);
    expect(s.proposals).toHaveLength(1);
  });
});

describe('commander proposals', () => {
  it('receptive: the state is entered at once and the result says so', () => {
    const s = world(DATE_READY);
    const events = cmd(s, 'date');
    expect(ofType(events, 'proposal_resolved')).toMatchObject([{ unitId: ANN, kind: 'date', receptive: true }]);
    expect(s.relations[ANN].stateId).toBe('flirting');
    expect(s.proposals ?? []).toEqual([]);
  });
  it.each([
    ['too_soon', () => world({ state: 'comrade' }), 'romance'],
    ['no_trust', () => world({ state: 'flirting', trust: 20, affinity: 60, attraction: 60 }), 'romance'],
    ['not_interested', () => world({ state: 'friend', trust: 50, affinity: 50, attraction: 5 }), 'date'],
    ['committed', () => world(DATE_READY, { state: 'devoted', trust: 90, affinity: 90, attraction: 90 }), 'date'],
    ['unavailable', () => { const s = world(DATE_READY); s.settings.intimacy = { romance: false, initiative: 'med' }; return s; }, 'date'],
  ] as const)('declining reports %s', (reason, make, kind) => {
    const s = make();
    const before = clone(s.relations[ANN]);
    const events = cmd(s, kind);
    expect(ofType(events, 'proposal_resolved')).toMatchObject([{ receptive: false, reason }]);
    expect(s.relations[ANN]).toEqual(before);
  });
  it('romance off: date is unavailable', () => {
    const s = world(DATE_READY);
    s.settings.intimacy = { romance: false, initiative: 'med' };
    expect(off(s, 'date')).toEqual([]);
    expect(ofType(cmd(s, 'date'), 'proposal_resolved')[0]).toMatchObject({ receptive: false, reason: 'unavailable' });
  });
  it('a second romance waits for OPENLY or SECRETLY', () => {
    const s = world(DATE_READY, LOVER);
    const events = cmd(s, 'date');
    expect(ofType(events, 'proposal_resolved')[0]).toMatchObject({ receptive: true, pending: true });
    expect(s.relations[ANN].stateId).toBe('friend');
    expect(s.proposals![0]).toMatchObject({ from: 'commander', needsDisclosure: true });
    expect(() => answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'decline' })).toThrow();
  });
  it('the secret_affair proposal is hidden by definition', () => {
    const s = world({ state: 'friend', trust: 50, affinity: 40, attraction: 50 }, LOVER);
    cmd(s, 'secret_affair');
    expect(s.relations[ANN].stateId).toBe('secret_affair');
    expect(s.relations[ANN].affair).toEqual({ as: 'flirting', hiddenFrom: [BEA], since: 30 });
  });
  it('a proposal to a unit with an open one is refused', () => {
    const s = world(DATE_READY, LOVER);
    cmd(s, 'date');
    expect(() => cmd(s, 'date')).toThrow(/open proposal/);
  });
});

describe('second romances', () => {
  it('romanticPartners lists romantic states except unrequited, among the living', () => {
    const s = world({}, LOVER);
    s.relations[CAT].stateId = 'unrequited';
    s.relations['unit_dee'].stateId = 'fwb';
    s.squad.find((u) => u.id === 'unit_dee')!.status = 'dead';
    expect(romanticPartners(s, reg, ANN)).toEqual([BEA]);
    expect(romanticPartners(s, reg, BEA)).toEqual([]);
  });
  it('a unit proposal while a partner exists asks for disclosure', () => {
    const s = world(DATE_READY, LOVER);
    off(s, 'date');
    expect(s.proposals![0].needsDisclosure).toBe(true);
  });
  it('an open second romance makes the lover react at extreme', () => {
    const s = world(DATE_READY, LOVER);
    off(s, 'date');
    const before = clone(s.relations[BEA]);
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[ANN].stateId).toBe('flirting');
    expect(s.relations[BEA].trust).toBe(before.trust - 15);
    expect(s.relations[BEA].affinity).toBe(before.affinity - 12);
    expect(s.relations[BEA].history.at(-1)).toMatchObject({ type: 'broke_promise', severity: 'extreme' });
  });
  it('a partner who is not yet a lover feels sided against', () => {
    const s = world(DATE_READY, { state: 'flirting', trust: 50, affinity: 40, attraction: 40 });
    off(s, 'date');
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[BEA].history.at(-1)).toMatchObject({ type: 'sided_against', severity: 'extreme' });
  });
  it('a secret second romance enters secret_affair and stores affair', () => {
    const s = world(DATE_READY, LOVER);
    off(s, 'date');
    const before = clone(s.relations[BEA]);
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept_secret' });
    expect(s.relations[ANN].stateId).toBe('secret_affair');
    expect(s.relations[ANN].affair).toEqual({ as: 'flirting', hiddenFrom: [BEA], since: 30 });
    expect(s.relations[BEA]).toEqual(before);
  });
});

describe('discovery', () => {
  const affair = (): CampaignState => {
    const s = world(DATE_READY, LOVER);
    off(s, 'date');
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept_secret' });
    return s;
  };
  const always = { chance: () => true } as unknown as Rng;
  const never = { chance: () => false } as unknown as Rng;

  it('discovery with the partner present at chance 1 moves the unit to its real state and the partner reacts', () => {
    const s = affair();
    const before = clone(s.relations[BEA]);
    const events = rollDiscovery(s, reg, always, [ANN, BEA]);
    expect(s.relations[ANN].stateId).toBe('flirting');
    expect(s.relations[ANN].affair).toBeUndefined();
    expect(ofType(events, 'affair_discovered')).toEqual([{ type: 'affair_discovered', unitId: ANN, by: [BEA] }]);
    expect(s.relations[BEA].trust).toBe(before.trust - 15);
    expect(s.relations[BEA].history.at(-1)).toMatchObject({ type: 'broke_promise', severity: 'extreme' });
  });
  it('no roll means no discovery; an absent unit is not rolled', () => {
    const s = affair();
    expect(rollDiscovery(s, reg, never, [ANN, BEA])).toEqual([]);
    expect(s.relations[ANN].stateId).toBe('secret_affair');
    expect(rollDiscovery(s, reg, always, [CAT])).toEqual([]);
    expect(s.relations[ANN].stateId).toBe('secret_affair');
  });
  it('the chance grows with company and with the partner in the room', () => {
    const s = affair();
    const seen: number[] = [];
    const spy = { chance: (p: number) => { seen.push(p); return false; } } as unknown as Rng;
    rollDiscovery(s, reg, spy, [ANN]);
    rollDiscovery(s, reg, spy, [ANN, CAT]);
    rollDiscovery(s, reg, spy, [ANN, BEA]);
    expect(seen[0]).toBeCloseTo(0.04);
    expect(seen[1]).toBeCloseTo(0.08);
    expect(seen[2]).toBeCloseTo(0.04 + 0.04 + 0.15);
  });
  it('a fact tagged affair known by the partner forces discovery', () => {
    const s = affair();
    s.memory.facts.push({ id: 'f1', about: [ANN], text: 'Ann and the commander were seen.', tags: ['affair'], importance: 4, day: 30, knownBy: [BEA] });
    const events = rollDiscovery(s, reg, never, [CAT]);
    expect(ofType(events, 'affair_discovered')).toHaveLength(1);
    expect(s.relations[ANN].stateId).toBe('flirting');
  });
  it('a fact the partner does not know changes nothing', () => {
    const s = affair();
    s.memory.facts.push({ id: 'f1', about: [ANN], text: 'x', tags: ['affair'], importance: 4, day: 30, knownBy: [CAT] });
    expect(rollDiscovery(s, reg, never, [ANN])).toEqual([]);
  });
  it('an affair whose hidden partner is no longer romantic is never discovered, it is closed quietly', () => {
    const s = affair();
    s.relations[BEA].stateId = 'comrade';
    const events = rollDiscovery(s, reg, always, [ANN, BEA]);
    expect(ofType(events, 'affair_discovered')).toEqual([]);
    expect(ofType(events, 'affair_ended')).toHaveLength(1);
    expect(s.relations[ANN].affair).toBeUndefined();
  });
  it('discovery uses the campaign rng deterministically', () => {
    const a = affair();
    const b = clone(a);
    const run = (s: CampaignState) => {
      const rng = new Rng(s.rng);
      const out: unknown[] = [];
      for (let i = 0; i < 40; i++) out.push(rollDiscovery(s, reg, rng, [ANN, BEA]).length);
      return { out, rng: rng.state, state: s.relations[ANN].stateId };
    };
    expect(run(a)).toEqual(run(b));
  });
  it('leaving secret_affair clears the affair', () => {
    const s = affair();
    s.relations[ANN].affinity = -40;
    evaluateAutomatic(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('estranged');
    expect(s.relations[ANN].affair).toBeUndefined();
  });
});
