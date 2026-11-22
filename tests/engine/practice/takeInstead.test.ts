import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/discipline';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/power';
import '../../../src/engine/actions/practice';
import { deedsOf } from '../../../src/engine/discipline/deeds';
import { recordOf } from '../../../src/engine/discipline/record';
import { hasCapability } from '../../../src/engine/dynamic/capabilities';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { orderPunishment } from '../../../src/engine/practice/punish';
import { blankPractices, type OpenPunishment } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { withOptions } from '../../helpers/power';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

/** Ann holds the command (countermand) at rule; Bea has defied the commander and nobody has answered it. */
function ordering(defiant = true): CampaignState {
  const s = withService(world(reg, 'rule'));
  dynamicOf(s, ANN)!.domains = [{ id: 'command', since: s.day } as never];
  dynamicOf(s, ANN)!.hold = 75;
  if (defiant) s.discipline = { defiance: [{ unitId: BEA, severity: 'moderate', day: s.day, source: 'intent' }], threats: [], applications: [], restrictions: [], demands: [], demandLog: [] };
  return s;
}
const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const asked = (s: CampaignState): OpenPunishment[] => (s.practices?.punishments ?? []).filter((p) => p.forUnitId !== undefined);
const order = (s: CampaignState): { state: CampaignState; events: ReturnType<typeof orderPunishment> } => {
  const d = structuredClone(s);
  const events = orderPunishment(d, ctxOf(d), ANN, BEA);
  return { state: d, events };
};
const take = (s: CampaignState, answer: string, id = asked(s)[0]?.id ?? 'pp9') => run(s, reg, { type: 'practice/take_instead', payload: { punishmentId: id, answer } });

describe('she orders it', () => {
  it('only with countermand and a soldier who earned it', () => {
    expect(hasCapability(ordering(), reg, ANN, 'countermand')).toBe(true);
    const ok = order(ordering());
    expect(asked(ok.state)).toMatchObject([{ holderId: ANN, forUnitId: BEA, status: 'offered', severity: 1 }]);
    expect(reg.punishments.has(asked(ok.state)[0].entryId)).toBe(true);
    expect(ofType(ok.events, 'punishment_issued')).toMatchObject([{ holderId: ANN, forUnitId: BEA }]);
    // no pending defiance: none
    expect(asked(order(ordering(false)).state)).toEqual([]);
    // no capability: none
    const plain = ordering();
    dynamicOf(plain, ANN)!.domains = [];
    expect(asked(order(plain).state)).toEqual([]);
    // never her own defiance, never twice for the same soldier
    const self = ordering(false);
    self.discipline = { defiance: [{ unitId: ANN, severity: 'moderate', day: self.day, source: 'intent' }], threats: [], applications: [], restrictions: [], demands: [], demandLog: [] };
    expect(asked(order(self).state)).toEqual([]);
    const twice = structuredClone(ok.state);
    orderPunishment(twice, ctxOf(twice), ANN, BEA);
    expect(asked(twice)).toHaveLength(1);
  });

  it('the day step may order it instead of a request, deterministically and with no rng draw; never without a pending offence', () => {
    const base = ordering();
    base.settings = { ...base.settings } as never;
    let ordered = 0;
    for (let day = 20; day < 60; day++) {
      const s = structuredClone(base);
      s.day = day;
      const rng = structuredClone(s.rng);
      practiceDayStep(s, ctxOf(s));
      expect(s.rng).toEqual(rng);
      if (asked(s).length > 0) ordered++;
      const calm = structuredClone(ordering(false));
      calm.day = day;
      practiceDayStep(calm, ctxOf(calm));
      expect(asked(calm)).toEqual([]);
    }
    expect(ordered).toBeGreaterThan(0);
  });
});

describe('DO IT', () => {
  it('imposes the P9 punishment on the soldier (discipline_applied) as an application P9\'s UNDO can undo', () => {
    const s = order(ordering()).state;
    const entry = asked(s)[0].entryId;
    const r = take(s, 'do_it');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'discipline_applied')).toMatchObject([{ unitId: BEA, measure: entry }]);
    expect(r.state.practices!.punishments[0].status).toBe('done');
    expect(r.state.discipline!.defiance).toEqual([]); // enforcing it answers her held defiance
    const appId = ofType(r.events, 'discipline_applied')[0].applicationId as string;
    const undone = run(r.state, reg, { type: 'discipline/undo', payload: { id: appId } });
    expect(errors(undone.events)).toEqual([]);
    expect(ofType(undone.events, 'discipline_undone')).toHaveLength(1);
    expect(undone.state.discipline!.defiance).toHaveLength(1); // P9 puts the defiance back
  });
});

describe('DO IT and the squad vote (I3)', () => {
  const voting = (): CampaignState => withOptions(order(ordering()).state, { voting: 'on' });

  it('with voting on it is refused for a vote first: nothing is imposed and the order stays open', () => {
    const s = voting();
    const r = take(s, 'do_it');
    expect(errors(r.events)).toMatchObject([{ code: 'vote_needed', kind: 'punish', subject: BEA }]);
    expect(r.state).toEqual(s);
    expect(ofType(r.events, 'discipline_applied')).toEqual([]);
  });

  it('a passed vote lets it run once, and the vote is spent', () => {
    const s = voting();
    const opened = run(s, reg, { type: 'vote/open', payload: { kind: 'punish', subject: BEA } });
    expect(errors(opened.events)).toEqual([]);
    const state = opened.state;
    state.power!.votes.open!.status = 'passed';
    const id = state.power!.votes.open!.id;
    const r = run(state, reg, { type: 'practice/take_instead', payload: { punishmentId: asked(state)[0].id, answer: 'do_it', voteId: id } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'discipline_applied')).toMatchObject([{ unitId: BEA }]);
    expect(r.state.practices!.punishments[0].status).toBe('done');
    expect(r.state.power!.votes.open).toBeUndefined();
  });

  it('a vote for another soldier does not count', () => {
    const s = voting();
    const opened = run(s, reg, { type: 'vote/open', payload: { kind: 'punish', subject: CAT } }).state;
    opened.power!.votes.open!.status = 'passed';
    const r = run(opened, reg, { type: 'practice/take_instead', payload: { punishmentId: asked(opened)[0].id, answer: 'do_it', voteId: opened.power!.votes.open!.id } });
    expect(errors(r.events)).toMatchObject([{ code: 'vote_needed' }]);
  });

  it('TAKE IT INSTEAD and REFUSE are not votes, and voting off changes nothing', () => {
    const s = voting();
    expect(errors(take(s, 'take_it').events)).toEqual([]);
    expect(errors(take(s, 'refuse').events)).toEqual([]);
    expect(errors(take(withOptions(structuredClone(s), { voting: 'off' }), 'do_it').events)).toEqual([]);
  });
});

describe('TAKE IT INSTEAD', () => {
  it('spares the soldier (Trust +5), counts the deed, gives the commander her punishment of the same severity, raises each named unit at base by +2 and writes the fact', () => {
    const s = order(ordering()).state;
    const sev = asked(s)[0].severity;
    const trust = s.relations[BEA].trust;
    const records = { [ANN]: recordOf(s, ANN), [BEA]: recordOf(s, BEA), [CAT]: recordOf(s, CAT) };
    const protectedBefore = deedsOf(s).protected;
    const r = take(s, 'take_it');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[BEA].trust).toBe(trust + 5);
    expect(r.state.relations[BEA].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'spared_for' });
    expect(deedsOf(r.state).protected).toBe(protectedBefore + 1);
    const list = r.state.practices!.punishments;
    expect(list[0].status).toBe('done');
    const mine = list.find((p) => p.forUnitId === undefined)!;
    expect(mine).toMatchObject({ holderId: ANN, status: 'offered', severity: reg.holderPunishments.get(mine.entryId)!.severity });
    expect(mine.severity).toBeLessThanOrEqual(sev);
    expect(ofType(r.events, 'punishment_issued')).toMatchObject([{ holderId: ANN, severity: mine.severity }]);
    for (const id of [ANN, BEA, CAT]) expect(recordOf(r.state, id), id).toBe(records[id] + 2);
    expect(ofType(r.events, 'punishment_taken_for')).toMatchObject([{ unitId: ANN, sparedId: BEA, present: expect.arrayContaining([ANN, BEA]) }]);
    expect(r.state.discipline!.defiance).toHaveLength(1); // nobody was punished: her defiance stays for the commander's own answer
    // the fact: those present and the spared soldier know, spread slowly
    const facts = structuredClone(r.state);
    rememberEvents(facts, r.events as never, reg);
    const fact = facts.memory.facts.find((f) => f.tags.includes('punishment_taken_for'))!;
    expect(fact).toBeDefined();
    expect(fact.knownBy).toContain(BEA);
    expect(fact.text).not.toMatch(/AUTHOR TO WRITE/);
  });
});

describe('REFUSE', () => {
  it('is a refusal of her order: overrode_her (minor) on the holder, and the soldier is not punished', () => {
    const s = order(ordering()).state;
    const holdBefore = dynamicOf(s, ANN)!.hold;
    const r = take(s, 'refuse');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.punishments[0].status).toBe('refused');
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'overrode_her', severity: 'minor' });
    expect(dynamicOf(r.state, ANN)!.hold).toBeLessThan(holdBefore);
    expect(ofType(r.events, 'discipline_applied')).toEqual([]);
  });

  it('a punishment that is not an order, is answered or is hers while she is not holding throws', () => {
    const s = order(ordering()).state;
    expect(errors(take(s, 'refuse', 'pp9').events)).toHaveLength(1);
    expect(errors(take(take(s, 'do_it').state, 'refuse').events)).toHaveLength(1);
    const own = structuredClone(s);
    own.practices!.punishments[0].forUnitId = undefined;
    delete own.practices!.punishments[0].forUnitId;
    expect(errors(take(own, 'do_it').events)).toHaveLength(1); // her discipline of the commander is answered by answer_punishment
    const noOrders = withService(world(reg, 'rule'));
    noOrders.practices = blankPractices();
    expect(errors(take(noOrders, 'do_it').events)).toHaveLength(1);
  });
});
