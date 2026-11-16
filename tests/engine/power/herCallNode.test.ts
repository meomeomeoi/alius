import { beforeAll, describe, expect, it } from 'vitest';
import type { HerCallSpec } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import { rollHerCall } from '../../../src/engine/power/herCall';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ableParty, eventOptions, eventPool } from '../../../src/engine/world/expedition';
import type { Mission } from '../../../src/engine/world/types';
import { withBond } from '../../helpers/bonds';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import '../../helpers/power';

let reg: Registries;
let base: CampaignState;
let withHc: Registries;
let onlyHc: Registries;
let without: Registries;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  withHc = regsOf(PLAIN, HC);
  onlyHc = regsOf(HC);
  without = regsOf(PLAIN);
});

const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const NODE = 'n0_0';
const option = (label: string, effects: unknown[]) => ({ label, effects });
const spec: HerCallSpec = {
  trigger: { minLeadRank: 2 },
  outcomes: [
    { id: 'good', lean: { pragmatism: 2 }, text: 'The route holds.', effects: [{ type: 'party_stress', amount: -5 }] },
    { id: 'bad', lean: { autonomy: 2 }, text: 'The route is a trap.', effects: [{ type: 'carried_supplies', amount: -2 }, { type: 'party_stress', amount: 10 }] },
  ],
};
const HC = {
  id: 'evt_hc_test', scale: 'minor', contexts: ['expedition_event'],
  fixed: { title: 'Her way', setup: 'S', options: [option('Hold', [{ type: 'party_stress', amount: 5 }]), option('Push', [{ type: 'carried_supplies', amount: -1 }])] },
  herCall: spec,
};
/** An ordinary minor event, so the pool is never empty. */
const PLAIN = {
  id: 'evt_plain_test', scale: 'minor', contexts: ['expedition_event'],
  fixed: { title: 'Plain', setup: 'S', options: [option('A', [{ type: 'party_stress', amount: 5 }]), option('B', [{ type: 'carried_supplies', amount: -1 }])] },
};
const regsOf = (...templates: unknown[]): Registries => ({ ...reg, dilemmaTemplates: new Map(templates.map((t) => [(t as { id: string }).id, t as never])) });

/** A run in quarantine_d7 with one node of the given type; the squad is yielding unless `assertive` names units. */
function runOf(regs: Registries, o: { assertive?: string[]; dominant?: string[]; mission?: Parameters<typeof withMission>[2] } = {}): CampaignState {
  const { state, mission } = withMission(reg, base, o.mission);
  for (const u of state.squad) {
    u.defects = [];
    withBond(state, u.id, { leadStyle: o.assertive?.includes(u.id) ? 'assertive' : o.dominant?.includes(u.id) ? 'dominant' : 'yielding' });
  }
  const s = structuredClone(depart(reg, state, mission.id, { supplies: 4 }));
  s.expedition!.map.nodes[NODE].type = 'event';
  void regs;
  return s;
}
const move = (s: CampaignState, regs: Registries, nodeId = NODE) => run(s, regs, { type: 'expedition/move', payload: { nodeId } });
const missionOf = (s: CampaignState): Mission => [...s.missions.active, ...s.missions.offered].find((m) => m.id === s.expedition!.missionId)!;
/** What the next move into an event node would do with this seed: whether the pool pick lands on the her-call template, then the roll. */
const dryRoll = (s: CampaignState, regs: Registries, seed: number) => {
  const probe = new Rng(seedRng(seed));
  const picked = probe.pick(eventPool(s, regs, s.expedition!.regionId));
  if (picked.id !== 'evt_hc_test') return undefined;
  return { call: rollHerCall(s, regs, probe, regs.dilemmaTemplates.get('evt_hc_test')!.herCall as HerCallSpec, ableParty(s)) };
};
/** Sets the rng so the next move into a her-call node ends as asked (`acts` false = the chance roll fails). */
function seeded(s: CampaignState, regs: Registries, want: { acts: false } | { acts: true; outcome?: 'good' | 'bad'; unitId?: string }): CampaignState {
  for (let seed = 1; seed < 5000; seed++) {
    const r = dryRoll(s, regs, seed);
    if (!r) continue;
    const { call } = r;
    const ok = !want.acts ? call === null : call !== null && (want.outcome === undefined || call.outcome === want.outcome) && (want.unitId === undefined || call.unitId === want.unitId);
    if (!ok) continue;
    const t = structuredClone(s);
    t.rng = seedRng(seed);
    return t;
  }
  throw new Error('test setup: no seed');
}

/** For a pinned node (no pool pick): a seed on which she acts and it goes badly. */
function seeded2(s: CampaignState, regs: Registries): CampaignState {
  for (let seed = 1; seed < 5000; seed++) {
    const call = rollHerCall(s, regs, new Rng(seedRng(seed)), regs.dilemmaTemplates.get('evt_hc_test')!.herCall as HerCallSpec, ableParty(s));
    if (call?.outcome === 'bad') {
      const t = structuredClone(s);
      t.rng = seedRng(seed);
      return t;
    }
  }
  throw new Error('test setup: no seed');
}

describe('the pool', () => {
  it('acceptance 5: with no eligible unit the pool equals the pool without her-call templates', () => {
    const s = runOf(withHc);
    expect(eventPool(s, withHc, 'quarantine_d7').map((t) => t.id)).toEqual(['evt_plain_test']);
    expect(eventPool(s, without, 'quarantine_d7').map((t) => t.id)).toEqual(['evt_plain_test']);
  });

  it('acceptance 5: a scripted run draws and logs exactly as the run without the her-call templates', () => {
    const play = (regs: Registries): CampaignState => {
      let s = runOf(regs);
      for (const node of Object.values(s.expedition!.map.nodes)) if (node.id !== s.expedition!.map.objectiveId) node.type = 'event';
      for (let guard = 0; guard < 12 && s.expedition; guard++) {
        const exp = s.expedition;
        if (exp.phase === 'event') {
          const r = run(s, regs, { type: 'expedition/choose', payload: { option: eventOptions(s, regs).find((o) => o.disabled === null)!.index } });
          expect(errors(r.events)).toEqual([]);
          s = r.state;
          continue;
        }
        if (exp.objectiveDone) { s = run(s, regs, { type: 'expedition/return', payload: {} }).state; continue; }
        const next = exp.at === null ? exp.map.layers[0][0] : exp.map.nodes[exp.at].edges[0];
        const r = move(s, regs, next);
        expect(errors(r.events)).toEqual([]);
        s = r.state;
        if (s.expedition?.phase === 'combat') break;
      }
      return s;
    };
    const a = play(withHc);
    const b = play(without);
    expect(a.rng).toEqual(b.rng);
    expect(a.lastExpedition?.log ?? a.expedition?.log).toEqual(b.lastExpedition?.log ?? b.expedition?.log);
    expect(a.expedition?.herCalls ?? a.lastExpedition?.herCalls).toBeUndefined();
  });

  it('a tutorial run never offers a her-call template', () => {
    const s = runOf(withHc, { assertive: [ANN] });
    expect(eventPool(s, withHc, 'quarantine_d7').map((t) => t.id)).toEqual(['evt_plain_test', 'evt_hc_test']);
    const tutorial: Registries = { ...withHc, missionTemplates: new Map([...withHc.missionTemplates].map(([id, t]) => [id, { ...t, tutorial: true }])) };
    expect(eventPool(s, tutorial, 'quarantine_d7').map((t) => t.id)).toEqual(['evt_plain_test']);
  });

  it('without a run no her-call template is offered, however eligible the squad', () => {
    const s = structuredClone(base);
    withBond(s, ANN, { leadStyle: 'dominant' });
    expect(eventPool(s, withHc, 'quarantine_d7').map((t) => t.id)).toEqual(['evt_plain_test']);
  });
});

describe('the node', () => {
  it('acceptance 2: a squad of yielding units never meets a her-call and draws only the pool pick', () => {
    const s = runOf(withHc);
    const r = move(s, withHc);
    expect(ofType(r.events, 'her_call')).toEqual([]);
    expect(ofType(r.events, 'expedition_event')).toEqual([{ type: 'expedition_event', nodeId: NODE, templateId: 'evt_plain_test' }]);
    const probe = new Rng(s.rng);
    probe.float();
    expect(r.state.rng).toEqual(probe.state);
  });

  it('acceptance 1: when she acts the node asks nothing', () => {
    const s = seeded(runOf(withHc, { assertive: [ANN] }), withHc, { acts: true });
    const r = move(s, withHc);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'expedition_event')).toEqual([]);
    const [e] = ofType(r.events, 'her_call');
    expect(e).toMatchObject({ type: 'her_call', nodeId: NODE, templateId: 'evt_hc_test', unitId: ANN });
    const exp = r.state.expedition!;
    expect(exp.phase).toBe('event');
    expect(exp.pending).toEqual({ kind: 'event', nodeId: NODE, templateId: 'evt_hc_test', herCall: { unitId: ANN, outcome: e.outcome } });
    expect(eventOptions(r.state, withHc)).toHaveLength(2);
    const choose = run(r.state, withHc, { type: 'expedition/choose', payload: { option: 0 } });
    expect(String(errors(choose.events)[0]?.message)).toContain('She has already decided: acknowledge it.');
    expect(choose.state).toEqual(r.state);
    // and the node cannot be left by moving on
    expect(errors(move(r.state, withHc, r.state.expedition!.map.nodes[NODE].edges[0]).events)).toHaveLength(1);
  });

  it('a failed chance roll plays the fixed block as an ordinary event', () => {
    const s = seeded(runOf(withHc, { assertive: [ANN] }), onlyHc, { acts: false });
    const r = move(s, onlyHc);
    expect(ofType(r.events, 'her_call')).toEqual([]);
    expect(ofType(r.events, 'expedition_event')).toEqual([{ type: 'expedition_event', nodeId: NODE, templateId: 'evt_hc_test' }]);
    expect(r.state.expedition!.pending).toEqual({ kind: 'event', nodeId: NODE, templateId: 'evt_hc_test' });
    const picked = run(r.state, onlyHc, { type: 'expedition/choose', payload: { option: 0 } });
    expect(errors(picked.events)).toEqual([]);
    expect(picked.state.expedition!.phase).toBe('travel');
  });

  it('a pinned her-call template with nobody eligible plays its fixed block and draws nothing', () => {
    const s = runOf(withHc);
    s.expedition!.map.nodes[NODE].eventId = 'evt_hc_test';
    const r = move(s, withHc);
    expect(ofType(r.events, 'expedition_event')).toEqual([{ type: 'expedition_event', nodeId: NODE, templateId: 'evt_hc_test' }]);
    expect(r.state.expedition!.pending).toEqual({ kind: 'event', nodeId: NODE, templateId: 'evt_hc_test' });
    expect(r.state.rng).toEqual(s.rng);
  });
});

describe('consequences', () => {
  it('good: effects apply, merit +6 for her, record +4, a fact about her known by the party, no mark', () => {
    let s = runOf(withHc, { assertive: [ANN] });
    for (const u of s.squad) u.stress = 20;
    s = seeded(s, withHc, { acts: true, outcome: 'good' });
    const r = move(s, withHc);
    const [e] = ofType(r.events, 'her_call');
    expect(e).toMatchObject({ outcome: 'good', unitId: ANN, marked: false, missionId: s.expedition!.missionId });
    const after = r.state;
    for (const id of after.expedition!.party) expect(after.squad.find((u) => u.id === id)!.stress, id).toBe(15);
    expect(after.power!.merit).toEqual([{ day: s.day, unitId: ANN, points: TUNING.herCall.meritGood }]);
    expect(TUNING.herCall.meritGood).toBe(6);
    expect(after.relations[ANN].impunityRecord).toBe((s.relations[ANN].impunityRecord ?? 0) + TUNING.herCall.recordGood);
    const fact = after.memory.facts.find((f) => f.tags.includes('her_call'))!;
    expect(fact).toMatchObject({
      text: 'Ann took a decision in the field herself, and it went well: The route holds.', about: [ANN], importance: 2, knownBy: after.expedition!.party,
    });
    expect(missionOf(after).decidedBy).toBeUndefined();
    expect(after.expedition!.herCalls).toEqual([{ nodeId: NODE, unitId: ANN, outcome: 'good', templateId: 'evt_hc_test', odds: 0.5, marked: false }]);
    expect(after.expedition!.log.at(-1)).toMatchObject({ kind: 'event', nodeId: NODE, text: 'Ann took the decision herself: The route holds.' });
    expect(after.expedition!.supplies).toBe(4);
  });

  it('bad on a command mission: effects apply, record +4, decidedBy marks her with the others as witnesses', () => {
    const s = seeded(runOf(withHc, { assertive: [ANN] }), withHc, { acts: true, outcome: 'bad' });
    const r = move(s, withHc);
    const [e] = ofType(r.events, 'her_call');
    expect(e).toMatchObject({ outcome: 'bad', unitId: ANN, marked: true });
    const after = r.state;
    expect(after.expedition!.supplies).toBe(2);
    for (const id of after.expedition!.party) expect(after.squad.find((u) => u.id === id)!.stress, id).toBe((s.squad.find((u) => u.id === id)!.stress) + 10);
    expect(after.relations[ANN].impunityRecord).toBe((s.relations[ANN].impunityRecord ?? 0) + TUNING.herCall.recordBad);
    expect(after.power?.merit).toBeUndefined();
    expect(after.memory.facts.some((f) => f.tags.includes('her_call'))).toBe(false);
    expect(missionOf(after).decidedBy).toEqual({ source: 'her_call', unitId: ANN, nodeId: NODE, witnessIds: [BEA, CAT, DEE] });
  });

  it('the witnesses are the other named living party members only', () => {
    const s = runOf(withHc, { assertive: [ANN] });
    s.squad.find((u) => u.id === CAT)!.status = 'dead';
    const t = seeded(s, withHc, { acts: true, outcome: 'bad' });
    const after = move(t, withHc).state;
    expect(missionOf(after).decidedBy).toMatchObject({ unitId: ANN, witnessIds: [BEA, DEE] });
  });

  it('bad on a side run: no mark, marked false', () => {
    const s = seeded(runOf(withHc, { assertive: [ANN], mission: { source: 'side' } }), withHc, { acts: true, outcome: 'bad' });
    const r = move(s, withHc);
    expect(ofType(r.events, 'her_call')[0]).toMatchObject({ outcome: 'bad', marked: false });
    expect(missionOf(r.state).decidedBy).toBeUndefined();
    expect(r.state.relations[ANN].impunityRecord).toBe((s.relations[ANN].impunityRecord ?? 0) + TUNING.herCall.recordBad);
  });

  it('bad on a poi run: no mark', () => {
    const s = runOf(withHc, { assertive: [ANN] });
    missionOf(s).source = 'side';
    missionOf(s).poiId = 'some_poi';
    const t = seeded(s, withHc, { acts: true, outcome: 'bad' });
    const r = move(t, withHc);
    expect(ofType(r.events, 'her_call')[0]).toMatchObject({ marked: false });
    expect(missionOf(r.state).decidedBy).toBeUndefined();
  });

  it('a pinned her-call event on a tutorial run plays its fixed block, draws nothing and marks nothing', () => {
    const tutorial: Registries = { ...withHc, missionTemplates: new Map([...withHc.missionTemplates].map(([id, t]) => [id, { ...t, tutorial: true }])) };
    const s = runOf(withHc, { assertive: [ANN] });
    s.expedition!.map.nodes[NODE].eventId = 'evt_hc_test';
    // a seed on which she would act (and badly) on an ordinary run, so only the tutorial rule stops it
    const t = seeded2(s, withHc);
    const ordinary = move(t, withHc);
    expect(ofType(ordinary.events, 'her_call')[0]).toMatchObject({ outcome: 'bad', marked: true });
    const r = move(t, tutorial);
    expect(ofType(r.events, 'her_call')).toEqual([]);
    expect(ofType(r.events, 'expedition_event')).toEqual([{ type: 'expedition_event', nodeId: NODE, templateId: 'evt_hc_test' }]);
    expect(r.state.expedition!.pending).toEqual({ kind: 'event', nodeId: NODE, templateId: 'evt_hc_test' });
    expect(r.state.expedition!.herCalls).toBeUndefined();
    expect(r.state.rng).toEqual(t.rng);
    expect(missionOf(r.state).decidedBy).toBeUndefined();
  });

  it('a second bad call never overwrites the first mark; a vote mark is kept', () => {
    // two her-call nodes in one run: the first mark wins
    let s = runOf(withHc, { assertive: [ANN, BEA] });
    for (const node of Object.values(s.expedition!.map.nodes)) if (node.id !== s.expedition!.map.objectiveId) node.type = 'event';
    s = seeded(s, withHc, { acts: true, outcome: 'bad', unitId: ANN });
    const first = move(s, withHc);
    expect(ofType(first.events, 'her_call')[0]).toMatchObject({ marked: true, unitId: ANN });
    const acked = run(first.state, withHc, { type: 'expedition/ack_her_call', payload: {} }).state;
    const second = seeded(acked, withHc, { acts: true, outcome: 'bad', unitId: BEA });
    const next = second.expedition!.map.nodes[NODE].edges[0];
    const r = move(second, withHc, next);
    expect(ofType(r.events, 'her_call')[0]).toMatchObject({ outcome: 'bad', unitId: BEA, marked: false });
    expect(missionOf(r.state).decidedBy).toMatchObject({ source: 'her_call', unitId: ANN, nodeId: NODE });
    expect(r.state.expedition!.herCalls!.map((c) => [c.unitId, c.outcome, c.marked])).toEqual([[ANN, 'bad', true], [BEA, 'bad', false]]);
    // a squad vote's mark is kept
    const voted = runOf(withHc, { assertive: [ANN] });
    missionOf(voted).decidedBy = { voteId: 'v1', unitId: DEE, witnessIds: [CAT] };
    const vr = move(seeded(voted, withHc, { acts: true, outcome: 'bad' }), withHc);
    expect(ofType(vr.events, 'her_call')[0]).toMatchObject({ outcome: 'bad', marked: false });
    expect(missionOf(vr.state).decidedBy).toEqual({ voteId: 'v1', unitId: DEE, witnessIds: [CAT] });
  });
});

describe('acknowledging', () => {
  it('ACKNOWLEDGE closes the node and the run travels on', () => {
    const s = seeded(runOf(withHc, { assertive: [ANN] }), withHc, { acts: true });
    const waiting = move(s, withHc).state;
    const r = run(waiting, withHc, { type: 'expedition/ack_her_call', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'her_call_acknowledged')).toEqual([{ type: 'her_call_acknowledged', nodeId: NODE }]);
    expect(r.state.expedition!.pending).toBeUndefined();
    expect(r.state.expedition!.phase).toBe('travel');
    expect(r.state.expedition!.objectiveDone).toBe(false);
    // nothing is left to acknowledge
    expect(String(errors(run(r.state, withHc, { type: 'expedition/ack_her_call', payload: {} }).events)[0]?.message)).toContain('There is no decision to acknowledge.');
  });

  it('on the objective node the objective counts as done', () => {
    const s = runOf(withHc, { assertive: [ANN] });
    missionOf(s).objective = { node: 'event', condition: 'reach' };
    const t = seeded(s, withHc, { acts: true });
    // reach the objective node in two moves
    const obj = t.expedition!.map.objectiveId;
    t.expedition!.map.nodes[NODE].edges = [obj];
    t.expedition!.map.nodes[NODE].type = 'cache';
    const mid = move(t, withHc).state;
    const atObj = move(seeded(mid, withHc, { acts: true }), withHc, obj).state;
    expect(atObj.expedition!.pending).toMatchObject({ nodeId: obj, herCall: { unitId: ANN } });
    expect(atObj.expedition!.objectiveDone).toBe(false);
    const done = run(atObj, withHc, { type: 'expedition/ack_her_call', payload: {} }).state;
    expect(done.expedition!.objectiveDone).toBe(true);
    expect(done.expedition!.phase).toBe('travel');
  });

  it('retreat at the notice keeps the effects and the mark; no scapegoat opens', () => {
    const s = seeded(runOf(withHc, { assertive: [ANN] }), withHc, { acts: true, outcome: 'bad' });
    const waiting = move(s, withHc).state;
    const r = run(waiting, withHc, { type: 'expedition/retreat', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition).toBeUndefined();
    expect(r.state.dilemmas?.open).toBeUndefined();
    const back = r.state.missions.offered.find((m) => m.id === waiting.expedition!.missionId)!;
    expect(back.decidedBy).toMatchObject({ source: 'her_call', unitId: ANN, nodeId: NODE });
    // the effects were applied once, at entry: the party's stress is the +10 of the bad outcome, not 20
    expect(r.state.resources.supplies).toBe(waiting.resources.supplies + 2);
    expect(r.state.relations[ANN].impunityRecord).toBe(waiting.relations[ANN].impunityRecord);
  });

  it('a P6 dilemma request for a her-call node is refused', () => {
    const s = seeded(runOf(withHc, { assertive: [ANN] }), withHc, { acts: true });
    const waiting = move(s, withHc).state;
    // an authored her-call template has nothing to generate
    const r = run(waiting, withHc, { type: 'dilemma/request', payload: { templateId: 'evt_hc_test', context: 'expedition_event' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state.dilemmas?.open).toBeUndefined();
    // and were one to carry a generate block, the node is still not waiting on the map
    const generating = regsOf(PLAIN, { ...HC, generate: { brief: 'A brief.' } });
    const g = run(waiting, generating, { type: 'dilemma/request', payload: { templateId: 'evt_hc_test', context: 'expedition_event' } });
    expect(String(errors(g.events)[0]?.message)).toContain('That event is not waiting on the map.');
  });

  it('the report copies herCalls', () => {
    const s = seeded(runOf(withHc, { assertive: [ANN] }), withHc, { acts: true, outcome: 'good' });
    const waiting = move(s, withHc).state;
    const r = run(waiting, withHc, { type: 'expedition/retreat', payload: {} });
    expect(r.state.lastExpedition!.herCalls).toEqual([{ nodeId: NODE, unitId: ANN, outcome: 'good', templateId: 'evt_hc_test', odds: 0.5, marked: false }]);
    // a run with no her-call has no field
    const plain = run(structuredClone(runOf(withHc)), withHc, { type: 'expedition/retreat', payload: {} });
    expect(plain.state.lastExpedition!.herCalls).toBeUndefined();
  });
});
