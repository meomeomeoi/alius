import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { getRelation, getSynergies, loyaltyBand } from '../../../src/engine/relations';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

function inScene(participants = [ANN], tweak: (s: CampaignState) => void = () => {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  for (const u of s.squad) {
    u.defects = [];
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
    Object.assign(s.relations[u.id], { stateId: 'comrade', trust: 40, affinity: 20, attraction: 0, stateSince: 1, loyaltyBand: 'steady' });
  }
  tweak(s);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const ev = (over: Record<string, unknown> = {}) => ({
  type: 'praised', actor: 'commander', targets: [ANN], severity: 'major', evidence: 'you did well', confidence: 1, ...over,
});
const apply = (s: CampaignState, intents: unknown, extra: Record<string, unknown> = {}) =>
  run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents, ...extra } });

describe('intents/apply', () => {
  it('a full exchange moves axes, stress, history and state (praised + comforted → comrade)', () => {
    const s = inScene([ANN], (w) => {
      Object.assign(w.relations[ANN], { stateId: 'stranger', trust: 17, affinity: 0 });
      w.squad.find((u) => u.id === ANN)!.stress = 20;
    });
    const r = apply(s, { events: [ev(), ev({ type: 'comforted' })] });
    const rel = r.state.relations[ANN];
    expect(rel.trust).toBe(17 + 2 + 2); // second gain is diminished 3 → 2
    expect(rel.affinity).toBe(4 + 3); // 4, then 5/(1+4/6)=3
    expect(rel.stateId).toBe('comrade');
    expect(r.state.squad.find((u) => u.id === ANN)!.stress).toBe(20 - 10);
    expect(rel.history.filter((h) => h.kind === 'event').map((h) => h.type)).toEqual(['praised', 'comforted']);
    expect(ofType(r.events, 'relation_changed').length).toBeGreaterThanOrEqual(3);
    expect(ofType(r.events, 'relation_state_changed')).toMatchObject([{ unitId: ANN, from: 'stranger', to: 'comrade' }]);
    expect(ofType(r.events, 'intents_applied')).toMatchObject([{ channel: 'scene', counts: { events: 2 } }]);
  });

  it('gains diminish within a day and reset the next day; losses do not', () => {
    let s = inScene();
    const gains: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = s.relations[ANN].affinity;
      s = apply(s, { events: [ev()] }).state;
      gains.push(s.relations[ANN].affinity - before);
    }
    expect(gains).toEqual([4, 2, 2]);
    const loss = apply(s, { events: [ev({ type: 'insulted' })] }).state;
    expect(loss.relations[ANN].affinity).toBe(s.relations[ANN].affinity - 10);
    // next day: the scene ends, the evening is spent, the day rolls over
    let n = run(loss, reg, { type: 'scene/end', payload: {} }).state;
    n.slot = 'evening';
    n = run(n, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } }).state;
    expect(n.day).toBe(6);
    expect(n.relations[ANN].dailyGain).toEqual({ trust: 0, affinity: 0, attraction: 0 });
    n = run(n, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const before = n.relations[ANN].affinity;
    n = apply(n, { events: [ev()] }).state;
    expect(n.relations[ANN].affinity - before).toBe(4);
  });

  it('facts are known by the participants only', () => {
    const s = inScene([ANN, BEA]);
    const r = apply(s, { facts: [{ about: [ANN], text: 'Ann hides a scar.', importance: 3, tags: ['Scar'] }] });
    expect(r.state.memory.facts).toMatchObject([{ about: [ANN], text: 'Ann hides a scar.', tags: ['scar'], knownBy: [ANN, BEA], sceneId: r.state.scene!.id, day: 5 }]);
    expect(ofType(r.events, 'intents_applied')[0]).toMatchObject({ counts: { facts: 1 } });
  });

  it('a world fact keeps its subject as a string and facts per call are capped', () => {
    const s = inScene();
    const facts = Array.from({ length: 12 }, (_, i) => ({ about: 'world', text: `fact ${i}`, importance: 2, tags: [] }));
    const r = apply(s, { facts });
    expect(r.state.memory.facts).toHaveLength(8);
    expect(r.state.memory.facts[0].about).toEqual(['world']);
  });

  it('a crime-tagged fact reveals the crime to the knowers', () => {
    const s = inScene([ANN, BEA], (w) => {
      for (const id of [ANN, BEA]) w.relations[id].flags = [];
      w.squad.find((u) => u.id === ANN)!.values.autonomy = 3; // mutiny: autonomy+ reacts
    });
    const r = apply(s, { facts: [{ about: 'commander', text: 'He led a mutiny.', importance: 5, tags: ['crime'] }] });
    expect(r.state.relations[ANN].flags).toEqual(expect.arrayContaining(['knows_crime', 'crime_reaction_done']));
    expect(r.state.relations[BEA].flags).toContain('knows_crime');
    expect(r.state.relations[ANN].trust).toBeGreaterThan(40);
    expect(ofType(r.events, 'crime_known')).toHaveLength(2);
    expect(r.state.relations[CAT].flags).not.toContain('knows_crime');
  });

  it('a crime_revealed event reveals the crime to its targets', () => {
    const s = inScene([ANN], (w) => { w.relations[ANN].flags = []; });
    const r = apply(s, { events: [ev({ type: 'crime_revealed' })] });
    expect(r.state.relations[ANN].flags).toContain('knows_crime');
  });

  it('shared_secret sets the flag on the unit who shared', () => {
    const s = inScene();
    const r = apply(s, { events: [ev({ type: 'shared_secret', actor: ANN, targets: [], severity: 'moderate' })] });
    expect(r.state.relations[ANN].flags).toContain('shared_secret');
    expect(r.state.relations[ANN].trust).toBe(43);
  });

  it('promises: made opens, kept closes and moves trust once', () => {
    let s = inScene();
    s = apply(s, { promises: [{ by: 'commander', to: ANN, text: 'I will bring the medicine', kind: 'made' }] }).state;
    expect(s.memory.promises).toHaveLength(1);
    const kept = apply(s, { promises: [{ by: 'commander', to: ANN, text: 'I did bring the medicine', kind: 'kept' }] });
    expect(kept.state.memory.promises![0].status).toBe('kept');
    expect(kept.state.relations[ANN].trust).toBe(43);
    // the same intent list already carries kept_promise: no double count
    const both = apply(s, { events: [ev({ type: 'kept_promise', severity: 'moderate' })], promises: [{ by: 'commander', to: ANN, text: 'I did bring the medicine', kind: 'kept' }] });
    expect(both.state.relations[ANN].trust).toBe(43);
    expect(both.state.memory.promises![0].status).toBe('kept');
  });

  it('stress hints change stress within bounds', () => {
    const s = inScene([ANN], (w) => { w.squad.find((u) => u.id === ANN)!.stress = 95; });
    const r = apply(s, { stressHints: [{ unitId: ANN, direction: 1, severity: 'extreme' }] });
    expect(r.state.squad.find((u) => u.id === ANN)!.stress).toBe(100);
    const calm = apply(r.state, { stressHints: [{ unitId: ANN, direction: -1, severity: 'major' }] });
    expect(calm.state.squad.find((u) => u.id === ANN)!.stress).toBe(90);
  });

  it('a unit proposal becomes pending, a commander proposal resolves', () => {
    const s = inScene([ANN], (w) => { Object.assign(w.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 }); });
    const a = apply(s, { proposals: [{ from: ANN, to: 'commander', kind: 'date', evidence: 'she asks him out' }] });
    expect(a.state.proposals).toHaveLength(1);
    expect(ofType(a.events, 'proposal_offered')).toHaveLength(1);
    const b = apply(s, { proposals: [{ from: 'commander', to: ANN, kind: 'date', evidence: 'he asks her out' }] });
    expect(ofType(b.events, 'proposal_resolved')).toMatchObject([{ unitId: ANN, receptive: true }]);
    expect(b.state.relations[ANN].stateId).toBe('flirting');
  });

  it('a hostile proposal batch cannot break the exchange (two proposals to one unit)', () => {
    const s = inScene([ANN], (w) => { Object.assign(w.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 }); });
    const two = { from: ANN, to: 'commander', kind: 'date', evidence: 'x' };
    const r = apply(s, { events: [ev()], proposals: [two, two] });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.proposals).toHaveLength(1);
  });

  it('loyalty band is recomputed after trust drops', () => {
    const s = inScene([ANN], (w) => { Object.assign(w.relations[ANN], { trust: 30, loyaltyBand: 'steady' }); });
    const r = apply(s, { events: [ev({ type: 'insulted' }), ev({ type: 'insulted', severity: 'extreme' })] });
    expect(r.state.relations[ANN].trust).toBe(30 - 4 - 8);
    expect(r.state.relations[ANN].loyaltyBand).toBe('wavering');
    expect(loyaltyBand(r.state, ANN)).toBe('wavering');
    expect(ofType(r.events, 'loyalty_band_changed')).toHaveLength(1);
  });

  it('invalid intents change nothing but still emit intents_applied with zero counts', () => {
    const s = inScene();
    for (const junk of [null, 'prose', { events: [{ type: 'hugged' }] }, { events: [ev({ targets: [CAT] })] }, { events: [ev({ evidence: '' })] }]) {
      const r = apply(s, junk);
      expect(r.state).toEqual(s);
      expect(ofType(r.events, 'intents_applied')).toMatchObject([{ counts: { events: 0, facts: 0, proposals: 0, promises: 0, stressHints: 0 } }]);
    }
  });

  it('is rejected without an open scene, and for dm without a named unit', () => {
    const none = campaign(reg, 4);
    expect(errors(run(none, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {} } }).events)).toHaveLength(1);
    expect(errors(run(none, reg, { type: 'intents/apply', payload: { channel: 'dm', intents: {} } }).events)).toHaveLength(1);
    expect(errors(run(none, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: 'ghost', intents: {} } }).events)).toHaveLength(1);
    expect(errors(run(none, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: {} } }).events)).toHaveLength(0);
  });

  it('a dm exchange moves the relation of that unit only', () => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: BEA, intents: { events: [ev({ targets: [BEA] }), ev({ targets: [ANN] })] } } });
    expect(r.state.relations[BEA].affinity).toBeGreaterThan(s.relations[BEA].affinity);
    expect(r.state.relations[ANN]).toEqual(s.relations[ANN]);
  });

  it('events for units outside the scene are ignored', () => {
    const s = inScene([ANN]);
    const r = apply(s, { events: [ev({ targets: [BEA] })] });
    expect(r.state.relations[BEA]).toEqual(s.relations[BEA]);
  });
});

describe('hooks', () => {
  it('getRelation, loyaltyBand and getSynergies read the current states', () => {
    const s = campaign(reg, 4);
    s.relations[ANN].stateId = 'lover';
    s.relations[BEA].stateId = 'trusted';
    // new units start at Trust 20, which is `wavering` (P6 adds the band synergy): this test is about the state synergies
    for (const id of [ANN, BEA, CAT]) s.relations[id].loyaltyBand = 'steady';
    expect(getRelation(s, ANN)).toBe(s.relations[ANN]);
    expect(getRelation(s, 'ghost')).toBeUndefined();
    expect(getSynergies(s, reg, [ANN, BEA, CAT])).toEqual([
      { unitId: ANN, synergyId: 'lover_link' }, { unitId: ANN, synergyId: 'friend_assist' }, { unitId: BEA, synergyId: 'trusted_cover' },
    ]);
  });
});
