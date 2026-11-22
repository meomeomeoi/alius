import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dilemma';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/power';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { herBallot, herChooser, herOptionPick, preselects } from '../../../src/engine/practice/askHer';
import { blankPractices } from '../../../src/engine/practice/state';
import { personalOf } from '../../../src/engine/personal/state';
import type { CampaignState, Vote } from '../../../src/engine/state/types';
import { stubExpedition } from '../../helpers/world';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { ANN, BEA, unitOf, withBea, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const overrides = (s: CampaignState, id = ANN) => s.relations[id].history.filter((h) => h.kind === 'event' && h.type === 'overrode_her');
const praise = { label: 'Praise', effects: [{ type: 'unit_event', event: 'praised', severity: 'moderate', targets: 'named' }], magnitudes: [] };
const insult = { label: 'Insult', effects: [{ type: 'unit_event', event: 'insulted', severity: 'moderate', targets: 'named' }], magnitudes: [] };
const shrug = { label: 'Shrug', effects: [{ type: 'resource', resource: 'credits', amount: 1 }], magnitudes: [] };

/** Ann holds at `frame`; a presented dilemma is open: option 0 pleases her, 1 insults her, 2 touches nobody. */
function dilemma(frame: 'play' | 'role' | 'rule' = 'role', options: unknown[] = [praise, insult, shrug]): CampaignState {
  const s = withService(world(reg, frame));
  dynamicOf(s, ANN)!.hold = { play: 30, role: 60, rule: 75 }[frame];
  s.dilemmas = { seq: 1, open: { id: 'dl_1', templateId: 't', scale: 'minor', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [ANN, BEA], beatId: 'b', title: 'T', options: options as never } };
  return s;
}
const ask = (s: CampaignState, context = 'dilemma', ref = 'dl_1') => run(s, reg, { type: 'practice/ask_her', payload: { context, ref } });
const choose = (s: CampaignState, index: number, extra: Record<string, unknown> = {}) => run(s, reg, { type: 'dilemma/choose', payload: { id: 'dl_1', index, ...extra } });
const countermand = (s: CampaignState): CampaignState => {
  dynamicOf(s, ANN)!.domains = [{ id: 'command', since: s.day }];
  return s;
};

describe('her pick comes back', () => {
  it('a dilemma: the option that pleases her most, kept on practices.asked, with her_asked', () => {
    const r = ask(dilemma());
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.asked).toEqual({ context: 'dilemma', ref: 'dl_1', index: 0, holderId: ANN });
    expect(ofType(r.events, 'her_asked')).toMatchObject([{ holderId: ANN, unitId: ANN, context: 'dilemma', ref: 'dl_1', index: 0 }]);
    const spite = ask(dilemma('role', [{ ...insult, effects: [{ ...insult.effects[0], severity: 'major' }] }, { ...insult, effects: [{ ...insult.effects[0], severity: 'minor' }] }]));
    expect(spite.state.practices!.asked!.index).toBe(1); // the least bad
  });

  it('nothing touches her: "She leaves it to the commander" is index null; asking again answers the same; no draw', () => {
    const none = dilemma('role', [shrug, { label: 'Wait', effects: [], magnitudes: [] }]);
    const rng = JSON.stringify(none.rng);
    const r = ask(none);
    expect(r.state.practices!.asked).toMatchObject({ index: null, holderId: ANN });
    expect(JSON.stringify(r.state.rng)).toBe(rng);
    expect(ask(r.state).state.practices!.asked).toEqual(r.state.practices!.asked);
  });

  it('a vote: her ballot, or for when she has none or abstained', () => {
    const vote = (ballot: 'for' | 'against' | 'abstain' | null): Vote => ({
      id: 'v1', kind: 'mission', subject: 'm1', day: 20, commanderWeight: 1, forWeight: 2, againstWeight: 1, passed: true, status: 'passed',
      ballots: ballot === null ? [] : [{ unitId: ANN, vote: ballot, weight: 1, score: 1, term: 'values' }],
    });
    const open = (v: Vote): CampaignState => { const s = withService(world(reg, 'role')); s.power = { votes: { open: v, log: [], seq: 1 } }; return s; };
    expect(ask(open(vote('against')), 'vote', 'v1').state.practices!.asked).toMatchObject({ context: 'vote', ref: 'v1', index: 'against' });
    expect(ask(open(vote('for')), 'vote', 'v1').state.practices!.asked!.index).toBe('for');
    expect(ask(open(vote('abstain')), 'vote', 'v1').state.practices!.asked!.index).toBe('for');
    expect(ask(open(vote(null)), 'vote', 'v1').state.practices!.asked!.index).toBe('for');
    expect(herBallot(open(vote('against')), reg, ANN, vote('against'))).toBe('against');
  });

  it('an expedition event: the open option whose effects on her score highest, counting only a party she is in; none touches her: null', () => {
    const fixed = { title: 'Ruin', setup: 'x', options: [{ label: 'Insult', effects: [{ type: 'unit_event', event: 'insulted', severity: 'moderate', targets: 'named' }] }, { label: 'Praise', effects: [{ type: 'unit_event', event: 'praised', severity: 'moderate', targets: 'named' }] }, { label: 'Walk on', effects: [] }] };
    const own: Registries = { ...reg, dilemmaTemplates: new Map([...reg.dilemmaTemplates, ['t_ruin', { id: 't_ruin', fixed }]]) } as never;
    const s = withService(world(reg, 'role'));
    s.expedition = stubExpedition(s, { party: [ANN, BEA], phase: 'event', pending: { kind: 'event', nodeId: 'n1', templateId: 't_ruin' } } as never);
    expect(herOptionPick(s, own, ANN)).toBe(1);
    const away = structuredClone(s);
    away.expedition!.party = [BEA];
    expect(herOptionPick(away, own, ANN)).toBeNull();
    const none = structuredClone(s);
    ((own.dilemmaTemplates.get('t_ruin') as unknown) as { fixed: { options: unknown[] } }).fixed.options = [{ label: 'Walk on', effects: [] }];
    expect(herOptionPick(none, own, ANN)).toBeNull();
  });

  it('nothing without a live holder, and nothing that is not open; the one who holds most is asked', () => {
    const none = dilemma();
    none.relations[ANN].dynamic!.frame = 'equal';
    expect(herChooser(none, reg)).toBeNull();
    expect(errors(ask(none).events)[0]?.message).toMatch(/nobody holds/i);
    expect(errors(ask(dilemma(), 'dilemma', 'dl_9').events)[0]?.message).toMatch(/nothing open/i);
    expect(errors(ask(dilemma(), 'trip', 'dl_1').events)).toHaveLength(1);
    const two = withBea(dilemma(), 'role');
    dynamicOf(two, BEA)!.hold = 80;
    unitOf(two, BEA).bond!.practice!.categories.service = { as: 'enjoys', witness: 'indifferent' };
    expect(herChooser(two, reg)).toBe(BEA);
  });
});

describe('choosing her pick is free; another costs overrideHer', () => {
  it('her pick: nothing charged; another option: overrode_her (moderate) once, the hold falls and her record rises; the pick is spent', () => {
    const asked = ask(dilemma()).state;
    const free = choose(asked, 0);
    expect(errors(free.events)).toEqual([]);
    expect(overrides(free.state)).toHaveLength(0);
    expect(free.state.practices!.asked).toBeUndefined();

    const before = dynamicOf(asked, ANN)!.hold;
    const against = choose(asked, 1, { againstHer: true });
    expect(errors(against.events)).toEqual([]);
    expect(overrides(against.state)).toMatchObject([{ severity: 'moderate' }]);
    expect(dynamicOf(against.state, ANN)!.hold).toBeLessThan(before);
    expect(against.state.relations[ANN].impunityRecord ?? 0).toBeGreaterThan(0);
    expect(against.state.practices!.asked).toBeUndefined();
    // the engine reads it from the state: the flag is only the client's word
    expect(overrides(choose(asked, 2).state)).toHaveLength(1);
  });

  it('without being asked nothing is charged; a card she left to the commander is free; one choice is charged once', () => {
    expect(overrides(choose(dilemma(), 1).state)).toHaveLength(0);
    const none = ask(dilemma('role', [shrug, { label: 'Wait', effects: [], magnitudes: [] }])).state;
    expect(overrides(choose(none, 1).state)).toHaveLength(0);
    const asked = ask(dilemma()).state;
    const once = choose(asked, 1).state;
    expect(overrides(once)).toHaveLength(1);
  });

  it('a vote: carrying what she voted against, or dropping what she voted for, is against her; the other is free', () => {
    const open = (ballot: 'for' | 'against', status: Vote['status']): CampaignState => {
      const s = withService(world(reg, 'role'));
      s.power = { votes: { open: { id: 'v1', kind: 'mission', subject: 'm1', day: 20, commanderWeight: 1, forWeight: 2, againstWeight: 1, passed: status === 'passed', status, ballots: [{ unitId: ANN, vote: ballot, weight: 1, score: 1, term: 'values' }] }, log: [], seq: 1 } };
      return ask(s, 'vote', 'v1').state;
    };
    const drop = (s: CampaignState) => run(s, reg, { type: 'vote/drop', payload: { voteId: 'v1' } });
    expect(overrides(drop(open('for', 'passed')).state)).toHaveLength(1);
    expect(overrides(drop(open('against', 'passed')).state)).toHaveLength(0);
    expect(drop(open('for', 'passed')).state.practices!.asked).toBeUndefined();
  });

  it('the day step drops a pick whose card is gone, and keeps one whose card is still open', () => {
    const s = ask(dilemma()).state;
    const kept = structuredClone(s);
    practiceDayStep(kept, ctxOf(kept, reg));
    expect(kept.practices!.asked).toBeDefined();
    const gone = structuredClone(s);
    delete gone.dilemmas!.open;
    practiceDayStep(gone, ctxOf(gone, reg));
    expect(gone.practices!.asked).toBeUndefined();
  });
});

describe('pre-selected at rule with countermand', () => {
  it('she pre-selects only at rule and only with the command; the asked record carries it', () => {
    expect(preselects(countermand(dilemma('rule')), reg, ANN)).toBe(true);
    expect(preselects(dilemma('rule'), reg, ANN)).toBe(false);
    expect(preselects(countermand(dilemma('role')), reg, ANN)).toBe(false);
    expect(ask(countermand(dilemma('rule'))).state.practices!.asked).toMatchObject({ index: 0, preselected: true });
    expect(ask(dilemma('rule')).state.practices!.asked).not.toHaveProperty('preselected');
  });

  it('defying her costs overrideHer and an offence countermand_overruled; confirming her pick costs nothing', () => {
    const asked = ask(countermand(dilemma('rule'))).state;
    const defy = choose(asked, 1, { againstHer: true });
    expect(errors(defy.events)).toEqual([]);
    expect(overrides(defy.state)).toHaveLength(1);
    expect(defy.state.practices!.offences[ANN]).toHaveLength(1);
    const confirm = choose(asked, 0);
    expect(overrides(confirm.state)).toHaveLength(0);
    expect(confirm.state.practices!.offences[ANN] ?? []).toHaveLength(0);
    // not pre-selected: no offence, only the override
    const plain = choose(ask(dilemma('role')).state, 1);
    expect(overrides(plain.state)).toHaveLength(1);
    expect(plain.state.practices?.offences[ANN] ?? []).toHaveLength(0);
  });
});

describe('a day of obedience is charged once', () => {
  it('when P9c already charges the same choice, ASK HER adds nothing', () => {
    const s = ask(dilemma()).state;
    personalOf(s).obedience = { unitId: ANN, day: s.day, who: 'commander' };
    const r = choose(s, 1);
    expect(overrides(r.state)).toHaveLength(1);
    expect(blankPractices().tasks).toEqual([]);
  });
});
