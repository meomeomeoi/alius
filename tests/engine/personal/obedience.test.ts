import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { disciplineOf } from '../../../src/engine/discipline';
import { openDemand } from '../../../src/engine/discipline/demands';
import { rollCountermand } from '../../../src/engine/power/leader';
import { refusalChance } from '../../../src/engine/loyalty/refusal';
import { carryVote } from '../../../src/engine/power/votes';
import { offerProposal } from '../../../src/engine/relations/proposals';
import { herPick, herVote, commanderObeys, obedienceOf, unitObeys } from '../../../src/engine/personal/obedience';
import { rollBookings } from '../../../src/engine/personal/bookings';
import { rollClaims } from '../../../src/engine/personal/courtship';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { rollTokenOffer } from '../../../src/engine/personal/tokens';
import { rollChallenges } from '../../../src/engine/personal/wagers';
import { personalOf } from '../../../src/engine/personal/state';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState, Vote } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ANN, atImpunity, BEA, ctxFrom, errors, loadCore, ofType, partner, plain, run, seeded, setRelation, withLeader, withOptions } from '../../helpers/personal';
import type { Booking } from '../../../src/engine/state/types';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const overrides = (s: CampaignState, id = ANN) => s.relations[id].history.filter((h) => h.kind === 'event' && h.type === 'overrode_her');
const record = (s: CampaignState) => s.relations[ANN].impunityRecord ?? 0;

/** Day 5; Ann is a balanced partner (obeys the commander or is obeyed by the commander per `who`). */
function fresh(who: 'commander' | 'unit' | null = 'commander', lead: 'balanced' | 'dominant' = 'balanced'): CampaignState {
  const s = partner(plain(reg), ANN, { lead, stateId: 'friend', affinity: 60 });
  s.day = 5;
  s.slot = 'morning';
  if (who) personalOf(s).obedience = { unitId: ANN, day: 5, who };
  return s;
}
const demandFor = (s: CampaignState): string => {
  s.resources.supplies = 5;
  disciplineOf(s).demands.push({ id: 'd1', unitId: ANN, templateId: 'double_ration', text: 'x', day: 5, expiresDay: 9, status: 'open', impunityDriven: false });
  return 'd1';
};
const bk = (over: Partial<Booking> = {}): Booking => ({ id: 'bk_1', unitId: ANN, kindId: 'evening_with_me', day: 6, slot: 'evening', status: 'booked', source: 'roll', made: 5, ...over });

describe('the readers', () => {
  it('obedience is valid on its own day only; who obeys is read by field', () => {
    const s = fresh('commander');
    expect(obedienceOf(s)).toEqual({ unitId: ANN, who: 'commander' });
    expect(commanderObeys(s, ANN)).toBe(true);
    expect(unitObeys(s, ANN)).toBe(false);
    expect(commanderObeys(s, BEA)).toBe(false);
    const later = structuredClone(s);
    later.day = 6;
    expect(obedienceOf(later)).toBeNull();
    expect(commanderObeys(later, ANN)).toBe(false);
    const hers = fresh('unit');
    expect(unitObeys(hers, ANN)).toBe(true);
    expect(commanderObeys(hers, ANN)).toBe(false);
    expect(obedienceOf(fresh(null))).toBeNull();
  });

  it('obedience ends at day end', () => {
    const s = fresh('commander');
    personalDayStep(s, ctxFrom(s, reg));
    expect(s.personal!.obedience).toBeUndefined();
    // one of a past day is gone too
    const old = fresh('unit');
    old.personal!.obedience!.day = 3;
    personalDayStep(old, ctxFrom(old, reg));
    expect(old.personal!.obedience).toBeUndefined();
  });
});

describe('while the commander obeys her', () => {
  it('refusing her demand applies overrode_her once, with the record', () => {
    const base = fresh(null);
    const id = demandFor(base);
    const obey = fresh('commander');
    demandFor(obey);
    const free = run(base, reg, { type: 'demand/answer', payload: { demandId: id, answer: 'refuse' } }).state;
    const r = run(obey, reg, { type: 'demand/answer', payload: { demandId: id, answer: 'refuse' } });
    expect(errors(r.events)).toEqual([]);
    expect(overrides(r.state)).toHaveLength(1);
    expect(overrides(free)).toHaveLength(0);
    expect(overrides(r.state)[0]).toMatchObject({ severity: 'moderate' });
    expect(record(r.state) - record(free)).toBe(TUNING.personal.overrideRecord);
  });

  it('an expired demand is not an override; granting is not either', () => {
    const s = fresh('commander');
    const id = demandFor(s);
    const granted = run(s, reg, { type: 'demand/answer', payload: { demandId: id, answer: 'grant' } });
    expect(overrides(granted.state)).toHaveLength(0);
    const lapsed = structuredClone(s);
    lapsed.day = 9;
    lapsed.personal!.obedience!.day = 9;
    disciplineOf(lapsed).demands[0].expiresDay = 9;
    const r = run(lapsed, reg, { type: 'calendar/consume_slot', payload: { slots: 3, reason: 'expedition' } });
    expect(overrides(r.state)).toHaveLength(0);
  });

  it('cancelling her booking applies overrode_her once', () => {
    const s = fresh('commander');
    personalOf(s).bookings = [bk()];
    const r = run(s, reg, { type: 'booking/cancel', payload: { bookingId: 'bk_1' } });
    expect(overrides(r.state)).toHaveLength(1);
    const plainCancel = fresh(null);
    personalOf(plainCancel).bookings = [bk()];
    expect(overrides(run(plainCancel, reg, { type: 'booking/cancel', payload: { bookingId: 'bk_1' } }).state)).toHaveLength(0);
  });

  it('declining (or putting off) her proposal applies overrode_her once; accepting does not', () => {
    const make = (who: 'commander' | null) => {
      const s = fresh(who, 'dominant');
      setRelation(s, ANN, { affinity: 40, trust: 40 });
      s.relations[ANN].attraction = 40;
      expect(offerProposal(s, reg, { unitId: ANN, kind: 'date', channel: 'dm' })).toHaveLength(1);
      return s;
    };
    for (const answer of ['decline', 'not_now', 'deflect']) {
      const s = make('commander');
      const r = run(s, reg, { type: 'proposal/answer', payload: { proposalId: s.proposals![0].id, answer } });
      expect(errors(r.events), answer).toEqual([]);
      expect(overrides(r.state), answer).toHaveLength(1);
    }
    const s = make('commander');
    expect(overrides(run(s, reg, { type: 'proposal/answer', payload: { proposalId: s.proposals![0].id, answer: 'accept' } }).state)).toHaveLength(0);
    const free = make(null);
    expect(overrides(run(free, reg, { type: 'proposal/answer', payload: { proposalId: free.proposals![0].id, answer: 'decline' } }).state)).toHaveLength(0);
  });

  /** A presented dilemma in the base: option 0 pleases Ann, option 1 insults her, option 2 touches nobody. */
  function dilemma(who: 'commander' | null = 'commander', options?: unknown[]): CampaignState {
    const s = fresh(who);
    s.dilemmas = {
      seq: 1,
      open: {
        id: 'dl_1', templateId: 't', scale: 'minor', context: 'base', day: 5, status: 'presented', attempts: 0, units: [ANN, BEA], beatId: 'b', title: 'T',
        options: (options ?? [
          { label: 'Praise', effects: [{ type: 'unit_event', event: 'praised', severity: 'moderate', targets: 'named' }], magnitudes: [] },
          { label: 'Insult', effects: [{ type: 'unit_event', event: 'insulted', severity: 'moderate', targets: 'named' }], magnitudes: [] },
          { label: 'Shrug', effects: [{ type: 'resource', resource: 'credits', amount: 1 }], magnitudes: [] },
        ]) as never,
      },
    };
    return s;
  }
  const choose = (s: CampaignState, index: number) => run(s, reg, { type: 'dilemma/choose', payload: { id: 'dl_1', index } });

  it('herPick is the option that pleases her most and null when no option touches her', () => {
    expect(herPick(dilemma(), reg, ANN)).toBe(0);
    const spite = dilemma('commander', [
      { label: 'Insult', effects: [{ type: 'unit_event', event: 'insulted', severity: 'major', targets: 'named' }], magnitudes: [] },
      { label: 'Snub', effects: [{ type: 'unit_event', event: 'insulted', severity: 'minor', targets: 'named' }], magnitudes: [] },
    ]);
    expect(herPick(spite, reg, ANN)).toBe(1); // the least bad
    const none = dilemma('commander', [{ label: 'A', effects: [{ type: 'resource', resource: 'credits', amount: 1 }], magnitudes: [] }, { label: 'B', effects: [], magnitudes: [] }]);
    expect(herPick(none, reg, ANN)).toBeNull();
    expect(herPick(plain(reg), reg, ANN)).toBeNull();
    // a unit not at the dilemma is not touched by its effects
    const away = dilemma();
    away.dilemmas!.open!.units = [BEA];
    expect(herPick(away, reg, ANN)).toBeNull();
    // a disabled option is never her pick
    const poor = dilemma('commander', [
      { label: 'Costly praise', effects: [{ type: 'resource', resource: 'credits', amount: -999 }, { type: 'unit_event', event: 'praised', severity: 'major', targets: 'named' }], magnitudes: [] },
      { label: 'Plain praise', effects: [{ type: 'unit_event', event: 'praised', severity: 'minor', targets: 'named' }], magnitudes: [] },
    ]);
    expect(herPick(poor, reg, ANN)).toBe(1);
  });

  it('choosing another dilemma option applies overrode_her once; following her pick applies nothing extra', () => {
    const other = choose(dilemma(), 1);
    expect(errors(other.events)).toEqual([]);
    expect(overrides(other.state)).toHaveLength(1);
    expect(overrides(choose(dilemma(), 2).state)).toHaveLength(1);
    expect(overrides(choose(dilemma(), 0).state)).toHaveLength(0);
    expect(overrides(choose(dilemma(null), 1).state)).toHaveLength(0);
    // no option touches her: nothing to override
    const none = dilemma('commander', [{ label: 'A', effects: [{ type: 'resource', resource: 'credits', amount: 1 }], magnitudes: [] }, { label: 'B', effects: [], magnitudes: [] }]);
    expect(overrides(choose(none, 1).state)).toHaveLength(0);
  });

  const vote = (ballot: 'for' | 'against' | 'abstain', status: Vote['status'] = 'passed'): Vote => ({
    id: 'v1', kind: 'mission', subject: 'm1', day: 5, commanderWeight: 1, forWeight: 2, againstWeight: 1, passed: true, status,
    ballots: [{ unitId: ANN, vote: ballot, weight: 1, score: ballot === 'for' ? 1 : -1, term: 'values' }],
  });
  const carry = (s: CampaignState, v: Vote) => {
    const d = structuredClone(s);
    d.power = { votes: { open: v, log: [], seq: 1 } };
    const events = carryVote(d, 'v1', ctxFrom(d, reg));
    return { d, events };
  };

  it('herVote reads her ballot; carrying a vote she voted against applies overrode_her once', () => {
    expect(herVote(carry(fresh(), vote('against')).d, reg, vote('against'))).toBe('against');
    expect(herVote(fresh(), reg, vote('for'))).toBe('for');
    expect(herVote(fresh(), reg, vote('abstain'))).toBeNull();
    expect(herVote(fresh(), reg, { ...vote('for'), ballots: [] })).toBeNull();
    const against = carry(fresh('commander'), vote('against'));
    expect(overrides(against.d)).toHaveLength(1);
    expect(overrides(carry(fresh('commander'), vote('for')).d)).toHaveLength(0);
    expect(overrides(carry(fresh(null), vote('against')).d)).toHaveLength(0);
    // an overruled vote has its own cost (P9b): no second one here
    expect(overrides(carry(fresh('commander'), vote('against', 'overruled')).d)).toHaveLength(0);
    // without a context the vote is just spent
    const d = structuredClone(fresh('commander'));
    d.power = { votes: { open: vote('against'), log: [], seq: 1 } };
    expect(ofType(carryVote(d, 'v1'), 'vote_carried')).toHaveLength(1);
  });

  it('activities, upgrades and expeditions are never affected', () => {
    const s = fresh('commander');
    const act = run(s, reg, { type: 'activity/do', payload: { activityId: 'rest' } });
    expect(errors(act.events)).toEqual([]);
    expect(overrides(act.state)).toHaveLength(0);
    const up = run(s, reg, { type: 'base/requisition', payload: { supplies: 1 } });
    expect(overrides(up.state)).toHaveLength(0);
  });
});

describe('while she obeys the commander', () => {
  it('refusal chance is 0 for her only', () => {
    const s = fresh('unit');
    setRelation(s, ANN, { trust: 5 });
    setRelation(s, BEA, { trust: 5 });
    const free = structuredClone(s);
    delete free.personal;
    expect(refusalChance(free, reg, ANN)).toBeGreaterThan(0);
    expect(refusalChance(s, reg, ANN)).toBe(0);
    expect(refusalChance(s, reg, BEA)).toBe(refusalChance(free, reg, BEA));
  });

  it('she opens no demand', () => {
    const s = atImpunity(fresh('unit'), reg, ANN, 70);
    for (let seed = 1; seed <= 100; seed++) {
      const t = seeded(s, seed);
      expect(openDemand(t, ctxFrom(t, reg), ANN)).toBeNull();
    }
    const free = atImpunity(fresh(null), reg, ANN, 70);
    let opened = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const t = seeded(free, seed);
      if (openDemand(t, ctxFrom(t, reg), ANN)) opened++;
    }
    expect(opened).toBeGreaterThan(0);
  });

  it('she does not book, claim, offer a token, challenge or countermand', () => {
    const eager = (who: 'unit' | null): CampaignState => {
      const s = withOptions(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover', affinity: 95, want: 90 }), { squad_assertiveness: 'high' });
      s.day = 5;
      atImpunity(s, reg, ANN, 70);
      if (who) personalOf(s).obedience = { unitId: ANN, day: 5, who };
      return s;
    };
    const count = (s: CampaignState, f: (t: CampaignState) => unknown[]): number => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) n += f(seeded(s, seed)).length;
      return n;
    };
    const rolls: Array<[string, (t: CampaignState) => unknown[]]> = [
      ['book', (t) => rollBookings(t, ctxFrom(t, reg))],
      ['claim', (t) => rollClaims(t, ctxFrom(t, reg))],
      ['token', (t) => rollTokenOffer(t, ctxFrom(t, reg))],
      ['challenge', (t) => rollChallenges(t, ctxFrom(t, reg))],
    ];
    for (const [name, f] of rolls) {
      expect(count(eager(null), f), `${name} is possible`).toBeGreaterThan(0);
      const obeying = eager('unit');
      expect(count(obeying, f), name).toBe(0);
      const t = seeded(obeying, 5);
      f(t);
      expect(t.rng, `${name} draws nothing`).toEqual(seeded(obeying, 5).rng);
    }
  });

  it('the squad leader who obeys does not countermand', () => {
    const s = withLeader(fresh('unit'), ANN);
    withOptions(s, { squad_assertiveness: 'high' });
    const req = { activityId: 'train', companionId: BEA };
    const countermandable = [...reg.activities.values()].find((a) => a.countermandable === true);
    expect(countermandable).toBeDefined();
    const ask = { activityId: String(countermandable!.id), companionId: BEA };
    let hit = false;
    const free = withLeader(fresh(null), ANN);
    withOptions(free, { squad_assertiveness: 'high' });
    for (let seed = 1; seed <= 200 && !hit; seed++) {
      const t = seeded(free, seed);
      hit = rollCountermand(t, ctxFrom(t, reg), ask) !== null;
    }
    expect(hit).toBe(true);
    for (let seed = 1; seed <= 200; seed++) {
      const t = seeded(s, seed);
      expect(rollCountermand(t, ctxFrom(t, reg), ask)).toBeNull();
      expect(t.rng).toEqual(seeded(s, seed).rng);
    }
    void req;
  });

  it('the day step rolls skip her that day, and obedience then ends', () => {
    const s = fresh('unit', 'dominant');
    const t = structuredClone(s);
    personalDayStep(t, ctxFrom(t, reg));
    expect(t.personal!.obedience).toBeUndefined();
  });
});

void Rng;
void seedRng;
