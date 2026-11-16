import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { disciplineOf } from '../../../src/engine/discipline';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { offeredStakes, playWager, rollChallenges, stakeOffered } from '../../../src/engine/personal/wagers';
import { personalOf } from '../../../src/engine/personal/state';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState, Wager } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ANN, atImpunity, BEA, ctxFrom, enable, errors, loadCore, ofType, partner, plain, run, seeded, setRelation, withBond } from '../../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** An rng that returns the given floats in order (then 0.5) and counts its draws. */
class Scripted extends Rng {
  draws = 0;
  private vals: number[];
  constructor(vals: number[]) { super(seedRng(1)); this.vals = [...vals]; }
  override float(): number { this.draws++; return this.vals.shift() ?? 0.5; }
}
const history = (s: CampaignState, id: string) => s.relations[id].history.filter((h) => h.kind === 'event');
const wager = (over: Partial<Wager> = {}): Wager => ({ id: 'wg_1', unitId: ANN, by: 'unit', gameId: 'coin', stakeId: 'privilege', day: 5, status: 'accepted', ...over });
const stakeOf = (effect: string): string => [...reg.wagerStakes.values()].find((x) => x.effect === effect)!.id as string;

/** Ann: a balanced friend with Affinity 40 passes the wager gate; day 5. */
function fresh(over: { affinity?: number; lead?: 'yielding' | 'balanced' | 'assertive' | 'dominant' } = {}): CampaignState {
  const s = partner(plain(reg), ANN, { lead: over.lead ?? 'balanced', stateId: 'friend', affinity: over.affinity ?? 40 });
  s.day = 5;
  return s;
}
function open(s: CampaignState, ...w: Wager[]): CampaignState {
  personalOf(s).wagers = { open: w, log: [] };
  return s;
}
/** Plays one accepted wager with the scripted draws; returns the state and events. */
function play(s: CampaignState, vals: number[], w = wager(), pick?: string) {
  const d = structuredClone(open(s, w));
  const rng = new Scripted(vals);
  const r = playWager(d, { registries: reg, rng }, w.id, pick);
  return { d, rng, events: r };
}

describe('the content', () => {
  it('five games, seven stakes; only the mark stake is tagged, with body_modification', () => {
    expect([...reg.wagerGames.values()].map((g) => g.kind)).toEqual(['coin', 'rps', 'high_card', 'sparring', 'expedition_bet']);
    expect([...reg.wagerStakes.values()].map((x) => x.effect).sort()).toEqual(['drop_demand', 'mark', 'obedience', 'privilege', 'question', 'slot', 'token']);
    const tagged = [...reg.wagerStakes.values()].filter((x) => x.contentTags !== undefined);
    expect(tagged.map((x) => [x.effect, x.contentTags])).toEqual([['mark', ['body_modification']]]);
  });
});

describe('who challenges, with what', () => {
  it('her challenge comes only through the wager gate and picks only offered stakes (acceptance 6, 7)', () => {
    const s = fresh();
    const stakes = offeredStakes(s, reg, ANN).map((x) => String(x.id));
    expect(stakes.length).toBeGreaterThan(0);
    let hits = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const t = seeded(s, seed);
      const events = rollChallenges(t, ctxFrom(t, reg));
      for (const e of ofType(events, 'wager_offered')) {
        hits++;
        expect(stakes).toContain(String(e.stakeId));
        expect(t.personal!.wagers!.open).toEqual([expect.objectContaining({ unitId: ANN, by: 'unit', status: 'offered', gameId: e.gameId, stakeId: e.stakeId })]);
        expect(t.dms[ANN].at(-1)).toMatchObject({ from: ANN, read: false, initiated: true });
      }
    }
    expect(hits).toBeGreaterThan(0);
    // no bond, a yielding unit, no Affinity and no Impunity: nothing, and nothing drawn
    const nobond = plain(reg);
    setRelation(nobond, ANN, { affinity: 90 });
    for (const x of [nobond, fresh({ lead: 'yielding' }), fresh({ affinity: 10 })]) {
      const t = seeded(x, 3);
      expect(rollChallenges(t, ctxFrom(t, reg))).toEqual([]);
      expect(t.rng).toEqual(seeded(x, 3).rng);
    }
  });

  it('a unit with an open wager does not challenge again', () => {
    const s = open(fresh(), wager({ status: 'offered' }));
    for (let seed = 1; seed <= 100; seed++) {
      const t = seeded(s, seed);
      expect(rollChallenges(t, ctxFrom(t, reg))).toEqual([]);
    }
  });

  it('stakes never include a disabled category: her_mark appears only with body_modification on and not among her limits (50 seeds)', () => {
    const mark = stakeOf('mark');
    const seen = (s: CampaignState) => {
      const out = new Set<string>();
      for (let seed = 1; seed <= 50; seed++) {
        const t = seeded(s, seed);
        for (const e of ofType(rollChallenges(t, ctxFrom(t, reg)), 'wager_offered')) out.add(String(e.stakeId));
      }
      return out;
    };
    expect(offeredStakes(fresh(), reg, ANN).map((x) => x.id)).not.toContain(mark);
    expect(seen(fresh()).has(mark)).toBe(false);
    const on = enable(fresh(), 'body_modification');
    expect(offeredStakes(on, reg, ANN).map((x) => x.id)).toContain(mark);
    const limited = enable(fresh(), 'body_modification');
    withBond(limited, ANN, { leadStyle: 'balanced', ownLimits: { categories: ['body_modification'] } });
    expect(offeredStakes(limited, reg, ANN).map((x) => x.id)).not.toContain(mark);
    expect(seen(limited).has(mark)).toBe(false);
  });

  it('drop_demand needs an open demand of hers that can be paid; token needs one she could give or has given; slot needs her booking gate', () => {
    const drop = reg.wagerStakes.get(stakeOf('drop_demand'))!;
    const s = fresh();
    expect(stakeOffered(s, reg, ANN, drop)).toBe(false);
    const d = disciplineOf(s);
    d.demands.push({ id: 'd1', unitId: ANN, templateId: 'double_ration', text: 'x', day: 5, expiresDay: 9, status: 'open', impunityDriven: false });
    s.resources.supplies = 5;
    expect(stakeOffered(s, reg, ANN, drop)).toBe(true);
    s.resources.supplies = 0;
    expect(stakeOffered(s, reg, ANN, drop)).toBe(false); // drop_demand is not offered when the grant cannot be paid
    const token = reg.wagerStakes.get(stakeOf('token'))!;
    expect(stakeOffered(fresh(), reg, ANN, token)).toBe(false); // a friend does not pass the token gate
    expect(stakeOffered(partner(plain(reg), ANN, { lead: 'balanced', stateId: 'confidant', affinity: 60 }), reg, ANN, token)).toBe(true);
    const slot = reg.wagerStakes.get(stakeOf('slot'))!;
    expect(stakeOffered(fresh(), reg, ANN, slot)).toBe(false);
    expect(stakeOffered(atImpunity(fresh(), reg, ANN, 60), reg, ANN, slot)).toBe(true); // level 3 through Impunity
  });
});

describe('the commander challenges', () => {
  const ask = (s: CampaignState, stakeId = stakeOf('privilege'), gameId = 'coin') => run(s, reg, { type: 'wager/challenge', payload: { unitId: ANN, gameId, stakeId } });

  it('is refused below Affinity 0 and Impunity 40, with nothing else', () => {
    const cold = fresh({ affinity: -10 });
    atImpunity(cold, reg, ANN, 30);
    const r = ask(cold);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'wager_refused')).toEqual([{ type: 'wager_refused', unitId: ANN }]);
    expect(r.state.personal?.wagers?.open ?? []).toEqual([]);
    expect(r.state.rng).toEqual(cold.rng);
    expect(r.state.relations[ANN]).toEqual(cold.relations[ANN]);
    // warm enough, or brazen enough: accepted
    const warm = ask(fresh({ affinity: 0 }));
    expect(ofType(warm.events, 'wager_accepted')).toHaveLength(1);
    expect(warm.state.personal!.wagers!.open[0]).toMatchObject({ unitId: ANN, by: 'commander', gameId: 'coin', status: 'accepted' });
    const bold = fresh({ affinity: -10 });
    atImpunity(bold, reg, ANN, 40);
    expect(ofType(ask(bold).events, 'wager_accepted')).toHaveLength(1);
  });

  it('needs an imported profile and a lead style; an unknown game or a stake she is not offered is refused', () => {
    expect(errors(run(plain(reg), reg, { type: 'wager/challenge', payload: { unitId: ANN, gameId: 'coin', stakeId: stakeOf('privilege') } }).events)).toHaveLength(1);
    expect(errors(ask(fresh({ lead: 'yielding' })).events)).toHaveLength(1);
    expect(errors(ask(fresh(), stakeOf('privilege'), 'nope').events)).toHaveLength(1);
    expect(errors(ask(fresh(), stakeOf('mark')).events)).toHaveLength(1); // category off
    const r = ask(open(fresh(), wager({ status: 'accepted' })));
    expect(errors(r.events)).toHaveLength(1); // one open wager at a time
  });
});

describe('her challenge', () => {
  const answer = (s: CampaignState, accept: boolean) => run(s, reg, { type: 'wager/answer', payload: { wagerId: 'wg_1', accept } });

  it('declining applies dismissed minor; accepting makes it playable', () => {
    const s = open(fresh(), wager({ status: 'offered' }));
    const no = answer(s, false);
    expect(errors(no.events)).toEqual([]);
    expect(no.state.personal!.wagers!.open).toEqual([]);
    expect(history(no.state, ANN).at(-1)).toMatchObject({ type: 'dismissed', severity: 'minor' });
    expect(ofType(no.events, 'wager_declined')).toHaveLength(1);
    const yes = answer(s, true);
    expect(yes.state.personal!.wagers!.open[0].status).toBe('accepted');
    expect(ofType(yes.events, 'wager_accepted')).toHaveLength(1);
    expect(errors(answer(yes.state, true).events)).toHaveLength(1); // already accepted
  });

  it('an offer expires after 3 days as declined', () => {
    const s = open(fresh(), wager({ status: 'offered', day: 5 }));
    const early = structuredClone(s);
    early.day = 5 + TUNING.personal.wager.offerDays - 1;
    personalDayStep(early, ctxFrom(early, reg));
    expect(early.personal!.wagers!.open).toHaveLength(1);
    const late = structuredClone(s);
    late.day = 5 + TUNING.personal.wager.offerDays;
    const events = personalDayStep(late, ctxFrom(late, reg));
    expect(late.personal!.wagers!.open).toEqual([]);
    expect(ofType(events, 'wager_declined')).toEqual([expect.objectContaining({ expired: true })]);
    expect(history(late, ANN).at(-1)).toMatchObject({ type: 'dismissed', severity: 'minor' });
  });
});

describe('the games', () => {
  const winner = (events: ReturnType<typeof play>['events']) => ofType(events, 'wager_resolved')[0].winner;

  it('coin draws once', () => {
    const win = play(fresh(), [0.1]);
    expect(win.rng.draws).toBe(1);
    expect(winner(win.events)).toBe('commander');
    expect(winner(play(fresh(), [0.9]).events)).toBe('unit');
  });

  it('rps draws her hand once and once more on a tie; a second tie voids', () => {
    const w = wager({ gameId: 'rps' });
    // her hand: 0 rock, 1 paper, 2 scissors (floor(float × 3))
    const win = play(fresh(), [0.0], w, 'paper'); // paper beats rock
    expect(win.rng.draws).toBe(1);
    expect(winner(win.events)).toBe('commander');
    const lose = play(fresh(), [0.0], w, 'scissors');
    expect(winner(lose.events)).toBe('unit');
    const tie = play(fresh(), [0.0, 0.4], w, 'rock'); // tie, then paper beats rock
    expect(tie.rng.draws).toBe(2);
    expect(winner(tie.events)).toBe('unit');
    const voided = play(fresh(), [0.0, 0.0], w, 'rock');
    expect(voided.rng.draws).toBe(2);
    expect(winner(voided.events)).toBe('void');
    // the hand is the commander's pick: it must be one of the three
    const d = structuredClone(open(fresh(), w));
    expect(() => playWager(d, { registries: reg, rng: new Scripted([]) }, 'wg_1', 'lizard')).toThrow();
    expect(() => playWager(d, { registries: reg, rng: new Scripted([]) }, 'wg_1')).toThrow();
  });

  it('high_card draws two cards 1-13 and voids on a tie', () => {
    const w = wager({ gameId: 'high_card' });
    const win = play(fresh(), [12 / 13 + 0.001, 0.0], w);
    expect(win.rng.draws).toBe(2);
    expect(winner(win.events)).toBe('commander');
    expect(winner(play(fresh(), [0.0, 12 / 13 + 0.001], w).events)).toBe('unit');
    const tie = play(fresh(), [0.5, 0.5], w);
    expect(winner(tie.events)).toBe('void');
    expect(ofType(tie.events, 'wager_resolved')[0]).toMatchObject({ commanderCard: 7, herCard: 7 });
  });

  it('a void game applies no stake; every game is logged and closes the wager', () => {
    const s = fresh();
    const v = play(s, [0.5, 0.5], wager({ gameId: 'high_card', stakeId: stakeOf('privilege') }));
    expect(v.d.personal!.wagers!.open).toEqual([]);
    expect(v.d.personal!.wagers!.log).toEqual([{ id: 'wg_1', unitId: ANN, gameId: 'high_card', stakeId: stakeOf('privilege'), day: 5, winner: 'void' }]);
    expect(v.d.relations[ANN].impunityRecord ?? 0).toBe(0);
  });

  it('only an accepted wager of a game that exists can be played', () => {
    const s = open(fresh(), wager({ status: 'offered' }));
    const r = run(s, reg, { type: 'wager/play', payload: { wagerId: 'wg_1' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(s);
    expect(errors(run(s, reg, { type: 'wager/play', payload: { wagerId: 'nope' } }).events)).toHaveLength(1);
  });

  it('the action plays it with the campaign rng and logs the result', () => {
    const s = open(fresh(), wager());
    const r = run(s, reg, { type: 'wager/play', payload: { wagerId: 'wg_1' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'wager_resolved')).toHaveLength(1);
    expect(r.state.rng).not.toEqual(s.rng);
  });
});

describe('the stakes, both winners', () => {
  const COMMANDER = [0.1];
  const UNIT = [0.9];
  const stake = (effect: string, vals: number[], s = fresh(), extra: Partial<Wager> = {}) => play(s, vals, wager({ stakeId: stakeOf(effect), ...extra }));

  it('obedience: the loser follows the winner for that day', () => {
    expect(stake('obedience', UNIT).d.personal!.obedience).toEqual({ unitId: ANN, day: 5, who: 'commander' });
    expect(stake('obedience', COMMANDER).d.personal!.obedience).toEqual({ unitId: ANN, day: 5, who: 'unit' });
  });

  it('slot: she wins a booking for tomorrow; the commander wins and she cannot book for 7 days', () => {
    const s = atImpunity(fresh(), reg, ANN, 60); // level 3
    const won = stake('slot', UNIT, s);
    expect(won.d.personal!.bookings).toEqual([expect.objectContaining({ unitId: ANN, day: 6, status: 'booked', source: 'wager', made: 5 })]);
    expect(ofType(won.events, 'booking_made')).toHaveLength(1);
    const lost = stake('slot', COMMANDER, s);
    expect(lost.d.personal!.noBookUntil).toEqual({ [ANN]: 5 + TUNING.personal.wager.noBookDays });
    expect(lost.d.personal!.bookings ?? []).toEqual([]);
  });

  it('privilege: ±6 record', () => {
    const before = fresh().relations[ANN].impunityRecord ?? 0;
    expect(stake('privilege', UNIT).d.relations[ANN].impunityRecord).toBe(before + 6);
    expect(stake('privilege', COMMANDER).d.relations[ANN].impunityRecord).toBe(before - 6);
  });

  it('drop_demand: she wins and it is granted (costs paid); the commander wins and it closes with no refusal deltas', () => {
    const base = fresh();
    base.resources.supplies = 5;
    disciplineOf(base).demands.push({ id: 'd1', unitId: ANN, templateId: 'double_ration', text: 'x', day: 5, expiresDay: 9, status: 'open', impunityDriven: false });
    const won = stake('drop_demand', UNIT, base);
    expect(won.d.discipline!.demands).toEqual([]);
    expect(won.d.resources.supplies).toBe(3);
    expect(ofType(won.events, 'demand_resolved')).toEqual([expect.objectContaining({ answer: 'grant' })]);
    const lost = stake('drop_demand', COMMANDER, base);
    expect(lost.d.discipline!.demands).toEqual([]);
    expect(lost.d.resources.supplies).toBe(5);
    expect(history(lost.d, ANN).map((h) => h.type)).not.toContain('refused_demand');
    expect(lost.d.relations[ANN].trust).toBe(base.relations[ANN].trust);
    // the demand became unpayable between the offer and the play: it closes quietly instead of failing
    const broke = structuredClone(base);
    broke.resources.supplies = 0;
    const quiet = stake('drop_demand', UNIT, broke);
    expect(quiet.d.discipline!.demands).toEqual([]);
    expect(quiet.d.resources.supplies).toBe(0);
  });

  it('token: she wins and it is worn and locked for 7 days; the commander wins and she gives one now', () => {
    const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'confidant', affinity: 60 });
    s.day = 5;
    const won = stake('token', UNIT, s);
    const t = won.d.personal!.tokens!.owned;
    expect(t).toEqual([expect.objectContaining({ giverId: ANN, worn: true, lockedUntil: 5 + TUNING.personal.token.lockDays })]);
    expect(ofType(won.events, 'token_worn')).toHaveLength(1);
    const lost = stake('token', COMMANDER, s);
    expect(lost.d.personal!.tokens!.owned).toEqual([expect.objectContaining({ giverId: ANN, worn: false })]);
    expect(lost.d.personal!.tokens!.given).toEqual([ANN]);
    // she had already given one: the same token is worn and locked
    const had = structuredClone(s);
    personalOf(had).tokens = { owned: [{ id: 'tk_9', giverId: ANN, kindId: 'patch', label: "Ann's patch", day: 1, worn: false }], given: [ANN] };
    const again = stake('token', UNIT, had);
    expect(again.d.personal!.tokens!.owned).toHaveLength(1);
    expect(again.d.personal!.tokens!.owned[0]).toMatchObject({ id: 'tk_9', worn: true, lockedUntil: 12 });
  });

  it('question: she wins and the commander answers, which becomes a fact known by her', () => {
    const won = stake('question', UNIT);
    expect(won.d.personal!.pendingQuestion).toEqual({ wagerId: 'wg_1', unitId: ANN, winner: 'unit' });
    expect(ofType(won.events, 'wager_resolved')[0]).toMatchObject({ question: 'commander_answers' });
    const r = run(won.d, reg, { type: 'wager/answer_question', payload: { wagerId: 'wg_1', text: '  I was afraid of the Leash.  ' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.personal!.pendingQuestion).toBeUndefined();
    const fact = r.state.memory.facts.at(-1)!;
    expect(fact).toMatchObject({ about: [ANN, 'commander'], knownBy: [ANN] });
    expect(fact.text).toContain('I was afraid of the Leash.');
    expect(fact.text).toContain('Ann');
    // bounds: 1 to 200 characters; nothing pending is refused
    for (const text of ['', '   ', 'x'.repeat(201)]) {
      const bad = run(won.d, reg, { type: 'wager/answer_question', payload: { wagerId: 'wg_1', text } });
      expect(errors(bad.events), text.slice(0, 5)).toHaveLength(1);
      expect(bad.state).toBe(won.d);
    }
    expect(errors(run(r.state, reg, { type: 'wager/answer_question', payload: { wagerId: 'wg_1', text: 'again' } }).events)).toHaveLength(1);
  });

  it('question: the commander wins and asks; her first reply becomes a fact and ends the truth order', () => {
    const won = stake('question', COMMANDER);
    expect(won.d.personal!.pendingQuestion).toEqual({ wagerId: 'wg_1', unitId: ANN, winner: 'commander' });
    const asked = run(won.d, reg, { type: 'wager/answer_question', payload: { wagerId: 'wg_1', text: 'Who did you serve before?' } });
    expect(errors(asked.events)).toEqual([]);
    expect(asked.state.personal!.truth).toEqual({ unitId: ANN, wagerId: 'wg_1', question: 'Who did you serve before?' });
    expect(asked.state.personal!.pendingQuestion).toBeUndefined();
    const told = run(asked.state, reg, { type: 'wager/record_answer', payload: { unitId: ANN, text: 'Aurum security, six years.' } });
    expect(errors(told.events)).toEqual([]);
    expect(told.state.personal!.truth).toBeUndefined();
    const fact = told.state.memory.facts.at(-1)!;
    expect(fact).toMatchObject({ about: [ANN], knownBy: [ANN] });
    expect(fact.text).toContain('Aurum security, six years.');
    // the first reply only
    expect(errors(run(told.state, reg, { type: 'wager/record_answer', payload: { unitId: ANN, text: 'again' } }).events)).toHaveLength(1);
  });

  it('mark: she wins and the commander bears her mark for 3 days; the commander wins and she only takes stress 3', () => {
    const s = enable(fresh(), 'body_modification');
    const won = stake('mark', UNIT, s);
    expect(won.d.personal!.mark).toEqual({ unitId: ANN, untilDay: 5 + TUNING.personal.wager.markDays });
    expect(ofType(won.events, 'mark_set')).toHaveLength(1);
    const lost = stake('mark', COMMANDER, s);
    expect(lost.d.personal!.mark).toBeUndefined();
    expect(lost.d.squad.find((u) => u.id === ANN)!.stress).toBe(Math.min(100, s.squad.find((u) => u.id === ANN)!.stress + TUNING.personal.wager.markLoseStress));
    // a mark ends by itself
    const ended = structuredClone(won.d);
    ended.day = 5 + TUNING.personal.wager.markDays + 1;
    expect(ofType(personalDayStep(ended, ctxFrom(ended, reg)), 'mark_ended')).toHaveLength(1);
    expect(ended.personal!.mark).toBeUndefined();
  });

  it('switching body_modification off withdraws the mark stake and ends a mark', () => {
    const s = enable(fresh(), 'body_modification');
    open(s, wager({ id: 'wg_1', stakeId: stakeOf('mark'), status: 'offered' }), wager({ id: 'wg_2', stakeId: stakeOf('privilege'), status: 'accepted' }));
    s.personal!.mark = { unitId: ANN, untilDay: 8 };
    const before = structuredClone(s.relations);
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: [] } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.personal!.wagers!.open.map((w) => w.id)).toEqual(['wg_2']);
    expect(r.state.personal!.mark).toBeUndefined();
    expect(r.state.relations).toEqual(before);
  });

  it('every stake of every winner is deterministic: the same draws give the same state', () => {
    for (const effect of ['obedience', 'privilege']) {
      expect(stake(effect, UNIT).d).toEqual(stake(effect, UNIT).d);
    }
  });
});

void BEA;
