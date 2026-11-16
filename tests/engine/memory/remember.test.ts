import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dilemma';
import '../../../src/engine/actions/memory';
import { defaultFormation } from '../../../src/engine/combat';
import { registerAction, type EngineEvent } from '../../../src/engine/dispatch';
import { addFact } from '../../../src/engine/memory';
import { registerMemoryResolver } from '../../../src/engine/memory/resolvers';
import { openScapegoat, scapegoatOptionId } from '../../../src/engine/power/scapegoat';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState, Fact } from '../../../src/engine/state/types';
import { endExpedition } from '../../../src/engine/world/expedition';
import { depart, payload, withMission } from '../../helpers/expedition';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { ctxOf } from '../../helpers/world';
import { withOptions } from '../../helpers/power';
import { loyaltyRecord } from '../../../src/engine/loyalty/state';

// test-only actions: `test/emit` hands back the events it is given; `expedition/test_end` ends the open run (the expedition prefix
// lets it run while a run is open)
registerAction('test/emit', (_d, p) => (p as { events: EngineEvent[] }).events);
registerAction('expedition/test_emit', (_d, p) => (p as { events: EngineEvent[] }).events);
registerAction('expedition/test_end', (d, p, ctx) => endExpedition(d, ctx, (p as { outcome: 'success' | 'retreated' | 'failed' }).outcome));
registerMemoryResolver('test_boom', () => {
  throw new Error('boom');
}, { ids: ['subject'], vars: [] });

let reg: Registries;
let noRules: Registries;
beforeAll(async () => {
  reg = await loadCore();
  noRules = { ...reg, memoryRules: new Map() };
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const remembered = (s: CampaignState): Fact[] => s.memory.facts.filter((f) => f.id.startsWith('fr'));
const emit = (s: CampaignState, events: EngineEvent[], r: Registries = reg) => run(s, r, { type: 'test/emit', payload: { events } });
const base = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 10;
  return s;
};
const rule = (over: Record<string, unknown>) => ({ id: 'custom', event: 'demand_resolved', text: '{name} asked.', importance: 2, about: 'subject', audience: 'subject', spread: 'none', tags: [], ...over });
const withRules = (rules: Array<Record<string, unknown>>): Registries => ({ ...reg, memoryRules: new Map(rules.map((r) => [String(r.id), r as never])) });

/** The squad is out on a run with one wounded and one dead; the run ends through the engine's own `endExpedition`. */
function endRun(outcome: 'success' | 'retreated' | 'failed', r: Registries = reg) {
  const { state, mission } = withMission(reg, campaign(reg, 4));
  const d = depart(reg, state, mission.id);
  d.expedition!.party = [ANN, BEA, CAT];
  d.expedition!.log.push({ kind: 'combat', data: { injuries: [BEA], deaths: [CAT] } } as never);
  d.squad.find((u) => u.id === CAT)!.status = 'dead';
  return run(d, r, { type: 'expedition/test_end', payload: { outcome } });
}

describe('runs', () => {
  it('a failed run writes the run fact for the party and the death fact for the squad', () => {
    const r = endRun('failed');
    expect(errors(r.events)).toEqual([]);
    const facts = remembered(r.state);
    const run_ = facts.find((f) => /failed/.test(f.text))!;
    expect(run_).toMatchObject({ about: [ANN, BEA, CAT], importance: 4, spread: 'fast', day: r.state.day });
    expect(run_.knownBy.sort()).toEqual([ANN, BEA, CAT]);
    expect(run_.text).toContain('Quarantine');
    const death = facts.find((f) => /did not come back/.test(f.text))!;
    expect(death).toMatchObject({ about: [CAT], importance: 5 });
    expect(death.text).toContain('Cat');
    expect(death.spread).toBeUndefined();
    expect(death.knownBy.sort()).toEqual([ANN, BEA, DEE]); // every living named unit; Cat is dead
    const hurt = facts.find((f) => /wounded/.test(f.text))!;
    expect(hurt).toMatchObject({ about: [BEA], importance: 3, spread: 'fast' });
    expect(hurt.knownBy.sort()).toEqual([ANN, BEA, CAT]);
    expect(facts).toHaveLength(3);
  });

  it('each outcome has its own run fact', () => {
    expect(remembered(endRun('success').state).some((f) => /succeeded/.test(f.text) && f.importance === 3)).toBe(true);
    expect(remembered(endRun('retreated').state).some((f) => /retreat|pulled back/.test(f.text) && f.importance === 3)).toBe(true);
  });
});

describe('power', () => {
  const ballot = (): CampaignState => {
    const s = campaign(reg, 4);
    s.commander.socialStats.authority = 1;
    s.leash.authorizationsLeft = 3;
    for (const u of s.squad) {
      u.values = { ...ZERO };
      setRelation(s, u.id, { trust: 50 });
    }
    withOptions(s, { voting: 'on' });
    const set = (id: string, autonomy: number) => { s.squad.find((u) => u.id === id)!.values = { ...ZERO, autonomy }; };
    set(ANN, 3); set(BEA, 2); set(CAT, 2); set(DEE, 3);
    s.squad.find((u) => u.id === DEE)!.status = 'reserve';
    s.roster.activeIds = [ANN, BEA, CAT];
    const { state, mission } = withMission(reg, s, { templateId: 'tpl_sweep' });
    return Object.assign(state, { _mission: mission.id }) as CampaignState;
  };

  it('an overruled vote writes a fact naming the dissenters, known to the squad', () => {
    const s = ballot();
    const missionId = (s as unknown as { _mission: string })._mission;
    const opened = run(s, reg, { type: 'vote/open', payload: { kind: 'mission', subject: missionId } }).state;
    expect(remembered(opened)).toEqual([]); // opening a vote is not remembered
    const r = run(opened, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'order' } });
    expect(errors(r.events)).toEqual([]);
    const facts = remembered(r.state);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ importance: 3, about: [ANN, BEA, CAT] });
    expect(facts[0].text).toContain('overruled');
    expect(facts[0].text).toContain('Ann, Bea and Cat');
    expect(facts[0].knownBy.sort()).toEqual([ANN, BEA, CAT, DEE]); // every living named unit, the reserve one included
    // carrying out the overruled action is not a second, "carried" fact
    const ran = run(r.state, reg, { type: 'expedition/start', payload: { ...payload(r.state, missionId, { unitIds: [ANN, BEA, CAT] }), voteId: 'v1' } });
    expect(errors(ran.events)).toEqual([]);
    expect(ofType(ran.events, 'vote_carried')[0]).toMatchObject({ overruled: true });
    expect(remembered(ran.state)).toHaveLength(1);
  });

  it('a vote that passes writes the carried fact', () => {
    const s = ballot();
    for (const u of s.squad) u.values = { ...ZERO };
    const missionId = (s as unknown as { _mission: string })._mission;
    const opened = run(s, reg, { type: 'vote/open', payload: { kind: 'mission', subject: missionId } }).state;
    const ran = run(opened, reg, { type: 'expedition/start', payload: { ...payload(opened, missionId, { unitIds: [ANN, BEA, CAT] }), voteId: 'v1' } });
    expect(errors(ran.events)).toEqual([]);
    const carried = remembered(ran.state).filter((f) => /voted/.test(f.text));
    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({ about: ['world'], importance: 2 });
  });

  it('a scapegoat take and shift each write their fact', () => {
    const answer = (which: 'take_blame' | 'shift_blame') => {
      const s = campaign(reg, 4);
      s.leash.authorizationsLeft = 3;
      openScapegoat(s, ctxOf(s, reg), { missionId: 'm1', unitId: ANN, witnessIds: [BEA, CAT] });
      const open = s.dilemmas!.open!;
      const index = open.options!.findIndex((o) => scapegoatOptionId(o) === which);
      const r = run(s, reg, { type: 'dilemma/choose', payload: { id: open.id, index } });
      expect(errors(r.events)).toEqual([]);
      return remembered(r.state);
    };
    const take = answer('take_blame');
    expect(take).toHaveLength(1);
    expect(take[0]).toMatchObject({ importance: 4, about: [ANN] });
    expect(take[0].text).toMatch(/took the blame/);
    expect(take[0].knownBy.sort()).toEqual([ANN, BEA, CAT, DEE]);
    const shift = answer('shift_blame');
    expect(shift).toHaveLength(1);
    expect(shift[0].text).toMatch(/put the blame/);
    expect(shift[0].text).toContain('Ann');
  });

  it('an ordinary dilemma writes the decision for those who were there', () => {
    const s = base();
    s.dilemmas = {
      seq: 1,
      open: {
        id: 'dl1', templateId: 'x', scale: 'minor', context: 'base', day: 10, status: 'presented', attempts: 0, units: [ANN, BEA], beatId: 'open', title: 'The Gate', setup: 'S', source: 'fallback',
        options: [{ label: 'Hold the line', effects: [], magnitudes: [] }],
      },
    } as never;
    const r = run(s, reg, { type: 'dilemma/choose', payload: { id: 'dl1', index: 0 } });
    const facts = remembered(r.state);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ importance: 3, spread: 'slow', about: [ANN, BEA] });
    expect(facts[0].text).toContain('The Gate');
    expect(facts[0].text).toContain('Hold the line');
    expect(facts[0].knownBy.sort()).toEqual([ANN, BEA]);
  });
});

describe('what only some know', () => {
  it('a refused demand, a peeled decor, a removed token, a cancelled booking and a kept edit each write one fact with their audience', () => {
    const cases: Array<[EngineEvent, string[], Fact['spread']]> = [
      [{ type: 'demand_resolved', demandId: 'd1', unitId: ANN, answer: 'refuse' }, [ANN], 'slow'],
      [{ type: 'decor_removed_by_commander', unitId: BEA, part: 'poster' }, [BEA], undefined],
      [{ type: 'token_taken_off', tokenId: 't1', giverId: CAT }, [CAT], 'slow'],
      [{ type: 'booking_cancelled', bookingId: 'b1', unitId: DEE }, [DEE], undefined],
      [{ type: 'intercept_resolved', id: 'i1', unitId: ANN, channel: 'dm', keep: true }, [ANN], undefined],
    ];
    for (const [event, audience, spread] of cases) {
      const facts = remembered(emit(base(), [event]).state);
      expect(facts, event.type).toHaveLength(1);
      expect(facts[0].knownBy, event.type).toEqual(audience);
      expect(facts[0].spread, event.type).toBe(spread);
    }
  });

  it('the kept-edit fact is known only to the editor; a reverted edit writes nothing', () => {
    const kept = remembered(emit(base(), [{ type: 'intercept_resolved', id: 'i1', unitId: BEA, channel: 'dm', keep: true }]).state);
    expect(kept[0].knownBy).toEqual([BEA]);
    expect(kept[0].text).toContain('Bea');
    expect(kept[0].importance).toBe(3);
    expect(remembered(emit(base(), [{ type: 'intercept_resolved', id: 'i1', unitId: BEA, channel: 'dm', keep: false }]).state)).toEqual([]);
  });

  it('the Leash, a wager, a booking lost and a companion activity are remembered; a void wager and a denied request are not', () => {
    const one = (e: EngineEvent) => remembered(emit(base(), [e]).state);
    expect(one({ type: 'leash_used', kind: 'compel', unitId: ANN, no: 1, outcome: 'done' })).toHaveLength(1);
    expect(one({ type: 'leash_used', kind: 'suppress', unitId: ANN, no: 1, outcome: 'done' })).toHaveLength(1);
    expect(one({ type: 'leash_used', kind: 'compel', unitId: ANN, no: 1, outcome: 'denied' })).toEqual([]);
    expect(one({ type: 'leash_used', kind: 'terminate', unitId: ANN, no: 1, outcome: 'done' })).toEqual([]); // the termination has its own fact
    expect(one({ type: 'wager_resolved', wagerId: 'w', unitId: ANN, gameId: 'coin', stakeId: 'slot', winner: 'unit' })[0].text).toMatch(/won/);
    expect(one({ type: 'wager_resolved', wagerId: 'w', unitId: ANN, gameId: 'coin', stakeId: 'her_mark', winner: 'commander' })[0].text).not.toMatch(/mark/i);
    expect(one({ type: 'wager_resolved', wagerId: 'w', unitId: ANN, gameId: 'coin', stakeId: 'slot', winner: 'void' })).toEqual([]);
    expect(one({ type: 'activity_done', activityId: 'train', companionId: BEA, vignette: false, slot: 'morning' })).toHaveLength(1);
    expect(one({ type: 'activity_done', activityId: 'train', vignette: false, slot: 'morning' })).toEqual([]); // alone: nobody to remember
    expect(one({ type: 'rations_set', mode: 'fighters_first' })).toHaveLength(1);
    expect(one({ type: 'rations_set', mode: 'equal' })).toEqual([]);
    expect(one({ type: 'countermanded', leaderId: ANN, unitId: BEA, activityId: 'train' })[0].knownBy.sort()).toEqual([ANN, BEA]);
  });

  it('a breakdown or a refused order is the party\'s', () => {
    const s = base();
    s.expedition = { party: [ANN, BEA], regionId: 'ashway' } as never;
    const facts = remembered(run(s, reg, { type: 'expedition/test_emit', payload: { events: [{ type: 'breakdown', unitId: BEA, cid: 's2', defectId: 'x' }, { type: 'order_refused', orderId: 'o', cid: 's1', unitId: ANN }] } }).state);
    expect(facts).toHaveLength(2);
    for (const f of facts) {
      expect(f.knownBy.sort()).toEqual([ANN, BEA]);
      expect(f.spread).toBe('slow');
    }
  });

  it('a desertion during a day end is remembered', () => {
    const s = structuredClone(base());
    for (const u of s.squad) setRelation(s, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' });
    s.leash.authorizationsLeft = 3;
    s.rng = seedRng(1);
    s.calendar.nightEvent = { id: 'n_d', unitId: ANN, kind: 'desertion', priority: 95, framing: 'f', ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: s.day + 2 } as never;
    s.slot = 'evening'; // spending the Evening runs the day-end pipeline, where the loyalty step lets her go
    s.disloyalty = { units: {}, open: { kind: 'desertion', unitId: ANN, day: s.day, at: 'night', nightEntryId: 'n_d' } } as never;
    loyaltyRecord(s, ANN).attempts = 1;
    delete s.calendar.nightEvent; // the night passes without an answer: let go
    const r = run(s, reg, { type: 'calendar/consume_slot' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'unit_deserted')).toHaveLength(1);
    const facts = remembered(r.state).filter((f) => /deserted/.test(f.text));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ importance: 4, about: [ANN] });
    expect(facts[0].knownBy).not.toContain(ANN); // she left: every living named unit
  });
});

describe('no double facts', () => {
  it('no double fact for a punishment, a good her call, a leader change or a Leash termination', () => {
    const events: EngineEvent[] = [
      { type: 'discipline_applied', applicationId: 'a1', unitId: ANN, measure: 'verbal' },
      { type: 'her_call', unitId: ANN, outcome: 'good' },
      { type: 'leader_changed', leaderId: BEA },
      { type: 'leash_used', kind: 'terminate', unitId: CAT, no: 1, outcome: 'done' },
      { type: 'discipline_undone', id: 'a1' },
    ];
    expect(remembered(emit(base(), events).state)).toEqual([]);
  });

  it('an error event writes nothing', () => {
    const r = emit(base(), [{ type: 'error', code: 'x', unitId: ANN, answer: 'refuse' }]);
    expect(remembered(r.state)).toEqual([]);
    // an action that is refused changes nothing at all
    const refused = run(base(), reg, { type: 'memory/forget', payload: { factId: 'nope' } });
    expect(errors(refused.events)).toHaveLength(1);
    expect(refused.state.memory.nextRememberId).toBeUndefined();
  });

  it('the same event twice is one fact (the addFact dedupe)', () => {
    const e: EngineEvent = { type: 'decor_removed_by_commander', unitId: BEA, part: 'poster' };
    expect(remembered(emit(base(), [e, e]).state)).toHaveLength(1);
  });

  it('a throwing resolver writes nothing and the action still succeeds', () => {
    const r2 = withRules([
      rule({ id: 'boom', event: 'test_boom', about: 'subject', audience: 'squad', text: 'never' }),
      rule({ id: 'rations', event: 'rations_set', about: 'world', audience: 'squad', text: 'Rations: {mode}.' }),
    ]);
    const r = emit(base(), [{ type: 'test_boom', unitId: ANN }, { type: 'rations_set', mode: 'fighters_first' }], r2);
    expect(errors(r.events)).toEqual([]);
    expect(remembered(r.state).map((f) => f.text)).toEqual(['Rations: fighters_first.']); // the healthy rule still wrote
  });
});

describe('how a rule is applied', () => {
  it('public is known to everyone and never spreads', () => {
    const r2 = withRules([rule({ audience: 'public', spread: 'fast' })]);
    const f = remembered(emit(base(), [{ type: 'demand_resolved', demandId: 'd', unitId: ANN, answer: 'refuse' }], r2).state);
    expect(f[0].knownBy).toEqual(['*']);
    expect(f[0].spread).toBeUndefined();
  });

  it('present is the open scene, else the rule\'s about ids', () => {
    const r2 = withRules([rule({ audience: 'present' })]);
    const ev: EngineEvent = { type: 'demand_resolved', demandId: 'd', unitId: ANN, answer: 'refuse' };
    expect(remembered(emit(base(), [ev], r2).state)[0].knownBy).toEqual([ANN]);
    const inScene = base();
    inScene.scene = { id: 's1', participants: [BEA, CAT], mode: 'group' } as never;
    expect(remembered(emit(inScene, [ev], r2).state)[0].knownBy).toEqual([BEA, CAT]);
  });

  it('an audience list is the union of its parts', () => {
    const r2 = withRules([rule({ event: 'countermanded', text: '{leader} countermanded {name}.', about: 'subject', audience: ['subject', 'leader'] })]);
    const f = remembered(emit(base(), [{ type: 'countermanded', leaderId: ANN, unitId: BEA, activityId: 'train' }], r2).state);
    expect(f[0].knownBy.sort()).toEqual([ANN, BEA]);
    expect(f[0].text).toBe('Ann countermanded Bea.');
  });

  it('when: true / false match non-empty / empty, a string matches exactly', () => {
    const r2 = withRules([
      rule({ id: 'a', text: 'expired', when: { expired: true } }),
      rule({ id: 'b', text: 'not expired', when: { expired: false } }),
      rule({ id: 'c', text: 'refused', when: { answer: 'refuse' } }),
      rule({ id: 'd', text: 'granted', when: { answer: 'grant' } }),
    ]);
    const texts = (extra: object) => remembered(emit(base(), [{ type: 'demand_resolved', demandId: 'd', unitId: ANN, answer: 'refuse', ...extra }], r2).state).map((f) => f.text).sort();
    expect(texts({})).toEqual(['not expired', 'refused']);
    expect(texts({ expired: true })).toEqual(['expired', 'refused']);
  });

  it('a rule about an empty group writes nothing', () => {
    const r2 = withRules([rule({ event: 'activity_done', text: 'with someone', about: 'subject', audience: 'squad' })]);
    expect(remembered(emit(base(), [{ type: 'activity_done', activityId: 'train', vignette: false, slot: 'morning' }], r2).state)).toEqual([]);
  });

  it('a hidden-from-commander rule carries the flag; the text is cut to factTextMax', () => {
    const r2 = withRules([rule({ hiddenFromCommander: true, text: 'x'.repeat(300) })]);
    const f = remembered(emit(base(), [{ type: 'demand_resolved', demandId: 'd', unitId: ANN, answer: 'refuse' }], r2).state);
    expect(f[0].hiddenFromCommander).toBe(true);
    expect(f[0].text).toHaveLength(200);
  });

  it('a remembered fact is written to the same facts list and does not disturb an existing fact', () => {
    const s = base();
    addFact(s, { about: [ANN], text: 'She keeps a photo.', tags: [], importance: 3, day: 10, knownBy: [ANN] });
    const r = emit(s, [{ type: 'decor_removed_by_commander', unitId: BEA, part: 'poster' }]);
    expect(r.state.memory.facts.map((f) => f.id)).toEqual(['f1', 'fr1']);
    expect(r.state.memory.nextId).toBe(1);
  });
});

describe('what memory never changes', () => {
  /** A scenario run with every v1 rule and with none: the rng and the campaign id counter must match. */
  function same(scenario: (r: Registries) => CampaignState): void {
    const a = scenario(reg);
    const b = scenario(noRules);
    expect(a.rng).toEqual(b.rng);
    expect(a.memory.nextId).toEqual(b.memory.nextId);
    expect(a.memory.facts.filter((f) => !f.id.startsWith('fr'))).toEqual(b.memory.facts);
  }

  it('no rng draw: a combat round, an expedition end and a day end', () => {
    same((r) => {
      const s = structuredClone(base());
      s.rng = seedRng(7);
      const started = run(s, r, { type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: defaultFormation(s, r, s.roster.activeIds) } });
      return run(started.state, r, { type: 'combat/auto', payload: { on: true } }).state;
    });
    same((r) => endRun('failed', r).state);
    same((r) => {
      const s = structuredClone(base());
      s.rng = seedRng(3);
      return endDay(s, r);
    });
  });

  it('no id shift: memory.nextId is equal with and without rules', () => {
    const withRule = endRun('failed').state;
    const without = endRun('failed', noRules).state;
    expect(remembered(withRule).length).toBeGreaterThan(0);
    expect(withRule.memory.nextId).toBe(without.memory.nextId);
    expect(remembered(without)).toEqual([]);
  });
});
