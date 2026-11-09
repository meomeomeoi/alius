import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { addChronicle, compactionDue } from '../../src/engine/memory';
import { pushHistory, stateForProposal } from '../../src/engine/relations/graph';
import { answerProposal, commanderProposal, offerProposal, rollDiscovery } from '../../src/engine/relations/proposals';
import type { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const always = { chance: () => true } as unknown as Rng;
const world = (tweak: (s: CampaignState) => void = () => {}): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 30;
  for (const u of s.squad) {
    u.defects = [];
    Object.assign(s.relations[u.id], { stateId: 'comrade', trust: 40, affinity: 20, attraction: 0, stateSince: 1, flags: [], history: [] });
  }
  tweak(s);
  return s;
};
const dateReady = (s: CampaignState, id = ANN) => Object.assign(s.relations[id], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 });

describe('minor: a dead devoted partner does not block romance', () => {
  it.each(['dead', 'deserted', 'terminated'] as const)('%s', (status) => {
    const s = world((w) => { dateReady(w); w.relations[BEA].stateId = 'devoted'; });
    expect(stateForProposal(s, reg, ANN, 'date')).toEqual({ fail: 'committed' });
    s.squad.find((u) => u.id === BEA)!.status = status;
    expect(stateForProposal(s, reg, ANN, 'date')).toEqual({ stateId: 'flirting' });
  });
});

describe('minor: discovery edge cases', () => {
  const affair = (tweak: (s: CampaignState) => void = () => {}) => {
    const s = world((w) => {
      dateReady(w);
      Object.assign(w.relations[BEA], { stateId: 'lover', trust: 70, affinity: 70, attraction: 70 });
      tweak(w);
    });
    offerProposal(s, reg, { unitId: ANN, kind: 'date', channel: 'scene' });
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept_secret' });
    return s;
  };
  it('an affair whose hidden partners all left romance is closed quietly', () => {
    const s = affair();
    s.relations[BEA].stateId = 'comrade';
    const events = rollDiscovery(s, reg, always, [CAT]);
    expect(s.relations[ANN].affair).toBeUndefined();
    expect(s.relations[ANN].stateId).toBe('flirting');
    expect(ofType(events, 'affair_ended')).toMatchObject([{ unitId: ANN }]);
    expect(ofType(events, 'affair_discovered')).toEqual([]);
  });
  it('with romance off a discovery reveals the affair but moves nobody into a romantic state', () => {
    const s = affair();
    s.settings.intimacy = { romance: false, initiative: 'med' };
    const events = rollDiscovery(s, reg, always, [ANN, BEA]);
    expect(ofType(events, 'affair_discovered')).toHaveLength(1);
    expect(s.relations[ANN].affair).toBeUndefined();
    expect(s.relations[ANN].stateId).toBe('secret_affair');
  });
});

describe('minor: disclosure is re-checked when she accepts', () => {
  it('a partner who appeared after the offer turns an accept into an OPENLY/SECRETLY question', () => {
    const s = world((w) => dateReady(w));
    offerProposal(s, reg, { unitId: ANN, kind: 'date', channel: 'scene' });
    expect(s.proposals![0].needsDisclosure).toBe(false);
    Object.assign(s.relations[BEA], { stateId: 'lover', trust: 70, affinity: 70, attraction: 70 });
    const before = structuredClone(s.relations[BEA]);
    const events = answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[ANN].stateId).toBe('friend');
    expect(s.relations[BEA]).toEqual(before);
    expect(s.proposals).toHaveLength(1);
    expect(s.proposals![0].needsDisclosure).toBe(true);
    expect(ofType(events, 'proposal_offered')).toMatchObject([{ needsDisclosure: true }]);
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[ANN].stateId).toBe('flirting');
    expect(s.relations[BEA].history.at(-1)).toMatchObject({ type: 'broke_promise', severity: 'extreme' });
  });
  it('a commander proposal that no longer needs disclosure just goes through', () => {
    const s = world((w) => { dateReady(w); Object.assign(w.relations[BEA], { stateId: 'lover', trust: 70, affinity: 70, attraction: 70 }); });
    commanderProposal(s, reg, { unitId: ANN, kind: 'date', channel: 'scene' });
    s.relations[BEA].stateId = 'comrade';
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[ANN].stateId).toBe('flirting');
  });
});

describe('minor: week compaction does not need seven day entries', () => {
  it('a fully past week with a few day entries is compacted', () => {
    const s = world((w) => { w.day = 20; });
    for (const d of [2, 4, 5]) addChronicle(s, { kind: 'day', day: d, text: `day ${d}` });
    const due = compactionDue(s)!;
    expect(due).toMatchObject({ kind: 'week', day: 1, toDay: 7 });
    expect(due.entries).toHaveLength(3);
  });
  it('the current week is never compacted, and scene lines still go first', () => {
    const s = world((w) => { w.day = 6; });
    addChronicle(s, { kind: 'day', day: 3, text: 'x' });
    expect(compactionDue(s)).toBeNull();
    s.day = 20;
    addChronicle(s, { kind: 'scene', day: 9, text: 'late line' });
    expect(compactionDue(s)).toMatchObject({ kind: 'day', day: 9 });
  });
});

describe('minor: counted history marks survive a chatty scene', () => {
  it('stress_high and sided_against outlive 100 praises', () => {
    const s = world();
    for (let i = 0; i < 3; i++) pushHistory(s, ANN, { day: 1, kind: 'event', type: 'stress_high' });
    pushHistory(s, ANN, { day: 1, kind: 'event', type: 'sided_against' });
    for (let i = 0; i < 100; i++) pushHistory(s, ANN, { day: 2, kind: 'event', type: 'praised' });
    const h = s.relations[ANN].history;
    expect(h).toHaveLength(TUNING.relations.historyMax);
    expect(h.filter((e) => e.type === 'stress_high')).toHaveLength(3);
    expect(h.filter((e) => e.type === 'sided_against')).toHaveLength(1);
  });
  it('every eventCount type the core content uses is protected (or internal)', () => {
    const used = new Set<string>();
    const walk = (c: { eventCount?: { type: string }; anyOf?: unknown[] } | undefined): void => {
      if (!c) return;
      if (c.eventCount) used.add(c.eventCount.type);
      for (const a of c.anyOf ?? []) walk(a as never);
    };
    for (const st of reg.relationshipStates.values()) {
      walk((st.entry as { when?: never }).when);
      for (const x of st.exit as Array<{ when: never }>) walk(x.when);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const t of used) expect(TUNING.relations.historyKeep, t).toContain(t);
  });
  it('when only protected entries remain the oldest of them goes', () => {
    const s = world();
    for (let i = 0; i < TUNING.relations.historyMax + 5; i++) pushHistory(s, ANN, { day: i, kind: 'event', type: 'stress_high' });
    expect(s.relations[ANN].history).toHaveLength(TUNING.relations.historyMax);
    expect(s.relations[ANN].history[0].day).toBe(5);
  });
});

describe('minor: the read pointer survives a reload', () => {
  it('scene/start sets readIndex to startIndex and intents/apply moves it', () => {
    let s = world();
    s = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 7 } }).state;
    expect(s.scene!.readIndex).toBe(7);
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {}, readIndex: 12 } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.readIndex).toBe(12);
    for (const bad of [-1, 1.5, 'x']) {
      expect(run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {}, readIndex: bad } }).state.scene!.readIndex).toBe(7);
    }
  });
});
