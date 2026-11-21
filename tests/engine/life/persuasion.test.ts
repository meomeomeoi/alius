import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { developmentOf } from '../../../src/engine/development/state';
import { agreeOpinion, challengeOpinion } from '../../../src/engine/life/opinions';
import { newLife } from '../../../src/engine/life/state';
import type { OpinionTopicEntry } from '../../../src/engine/life/types';
import type { CampaignState, Opinion } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const ANN = 'unit_ann';
const TOPIC = 'corporations';
const ids = (id = TOPIC) => (reg.opinionTopics.get(id) as unknown as OpinionTopicEntry).positions.map((p) => p.id);
const mine = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!;
const op = (s: CampaignState, topic = TOPIC): Opinion => mine(s).opinions![topic];

/** Ann holds a view on the corporations (position index `at` of 5) and has voiced it; a private scene with her is open. */
function world(at = 1, strength: Opinion['strength'] = 'held'): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  mine(s).opinions = { [TOPIC]: { position: ids()[at], strength, formedDay: 3, voicedDay: 20, text: 'A ladder, dirty rungs.' } };
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants: [ANN], origin: 'event', startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
}
const push = (s: CampaignState, n: number, weight: 1 | 2 = 1, positionId?: string, topic = TOPIC) => {
  const events = [];
  for (let i = 0; i < n; i++) events.push(...challengeOpinion(s, reg, ANN, topic, weight, positionId));
  return events;
};
const ev = (type: string, over: Record<string, unknown> = {}) => ({ type, actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'as said', confidence: 0.9, topicId: TOPIC, ...over });
const apply = (s: CampaignState, events: unknown[]) => run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events } } });

describe('a challenge moves her one step', () => {
  it('six minor challenges move one adjacent step toward the far end', () => {
    const s = world(1); // index 1 of 5: the far end is the last
    expect(push(s, 5)).toEqual([]);
    expect(op(s).push).toEqual({ toward: 'last', amount: 5 });
    expect(op(s).position).toBe(ids()[1]);
    const events = push(s, 1);
    expect(events).toEqual([{ type: 'opinion_changed', unitId: ANN, topicId: TOPIC, from: ids()[1], to: ids()[2] }]);
    expect(op(s).position).toBe(ids()[2]);
    expect(op(s).push).toBeUndefined();
    expect(op(s).history).toEqual([{ day: 40, from: ids()[1], to: ids()[2] }]);
    expect(op(s).strength).toBe('held');
  });

  it('three major challenges do the same, and the far end is the first from the upper half', () => {
    const s = world(3);
    expect(push(s, 2, 2)).toEqual([]);
    expect(push(s, 1, 2).map((e) => e.type)).toEqual(['opinion_changed']);
    expect(op(s).position).toBe(ids()[2]); // from index 3 toward the first
  });

  it('a tie (the middle) goes toward the first', () => {
    const s = world(2);
    push(s, 6);
    expect(op(s).position).toBe(ids()[1]);
  });

  it('a positionId sets the direction (when it is not her own position)', () => {
    const s = world(2);
    push(s, 6, 1, ids()[4]);
    expect(op(s).position).toBe(ids()[3]);
    const same = world(1);
    push(same, 6, 1, ids()[1]); // her own position: no direction of its own, the far end stands
    expect(op(same).position).toBe(ids()[2]);
    const unknown = world(1);
    push(unknown, 6, 1, 'not_a_position');
    expect(op(unknown).position).toBe(ids()[2]);
  });

  it('never a non-adjacent move: a position two steps away is still one step', () => {
    const s = world(0);
    push(s, 6, 1, ids()[4]);
    expect(op(s).position).toBe(ids()[1]);
    const t = world(4);
    push(t, 6, 1, ids()[0]);
    expect(op(t).position).toBe(ids()[3]);
  });

  it('an opposite challenge subtracts', () => {
    const s = world(2);
    push(s, 3, 1, ids()[4]);
    expect(op(s).push).toEqual({ toward: 'last', amount: 3 });
    push(s, 1, 1, ids()[0]);
    expect(op(s).push).toEqual({ toward: 'last', amount: 2 });
    push(s, 3, 1, ids()[0]);
    expect(op(s).push).toEqual({ toward: 'first', amount: 1 });
    push(s, 1, 1, ids()[0]);
    push(s, 1, 1, ids()[4]);
    expect(op(s).push).toEqual({ toward: 'first', amount: 1 });
    push(s, 1, 1, ids()[4]);
    expect(op(s).push).toBeUndefined(); // back to nothing
    expect(op(s).position).toBe(ids()[2]);
  });

  it('her old words no longer fit a moved position and are dropped; the voiced day stays', () => {
    const s = world(1);
    push(s, 6);
    expect(op(s).text).toBeUndefined();
    expect(op(s).voicedDay).toBe(20);
  });

  it('history keeps every move', () => {
    const s = world(0);
    push(s, 6);
    push(s, 6);
    expect(op(s).position).toBe(ids()[2]);
    expect(op(s).history).toEqual([{ day: 40, from: ids()[0], to: ids()[1] }, { day: 40, from: ids()[1], to: ids()[2] }]);
  });

  it('nothing for a topic she has no view on, an unknown topic or nobody', () => {
    const s = world();
    expect(challengeOpinion(s, reg, ANN, 'coffee', 2)).toEqual([]);
    expect(challengeOpinion(s, reg, ANN, 'nope', 2)).toEqual([]);
    expect(challengeOpinion(s, reg, 'nobody', TOPIC, 2)).toEqual([]);
    expect(mine(s).opinions!.coffee).toBeUndefined();
  });

  it('draws no rng', () => {
    const s = world(1, 'strong');
    const rng = structuredClone(s.rng);
    push(s, 12);
    expect(s.rng).toEqual(rng);
  });
});

describe('a strong opinion', () => {
  it('needs twice as much', () => {
    const s = world(1, 'strong');
    expect(TUNING.life.opinion.persuadeAt * TUNING.life.opinion.strongMult).toBe(12);
    expect(push(s, 11)).toEqual([]);
    expect(op(s).push).toEqual({ toward: 'last', amount: 11 });
    expect(push(s, 1).map((e) => e.type)).toHaveLength(1);
  });

  it('may harden instead: over 50 hashed topics about half harden (fact, reset push, position kept), the rest move', () => {
    const topics = [...reg.opinionTopics.keys()].slice(0, 50);
    const s = campaign(reg, 4);
    s.day = 40;
    s.settings.lifeEvents = 'normal';
    s.life = newLife(7);
    for (const t of topics) (mine(s).opinions ??= {})[t] = { position: ids(t)[1], strength: 'strong', formedDay: 1, voicedDay: 5 };
    let hardened = 0;
    let moved = 0;
    for (const t of topics) {
      const events = push(s, 6, 2, undefined, t);
      expect(events).toHaveLength(1);
      if (events[0].type === 'opinion_hardened') {
        hardened++;
        expect(events[0]).toEqual({ type: 'opinion_hardened', unitId: ANN, topicId: t });
        expect(op(s, t).position).toBe(ids(t)[1]);
        expect(op(s, t).push).toBeUndefined();
        expect(op(s, t).history).toBeUndefined();
        const label = String((reg.opinionTopics.get(t) as unknown as OpinionTopicEntry).label);
        const fact = s.memory.facts.find((f) => f.tags.includes('hardened') && f.tags.includes(t))!;
        expect(fact.text).toBe(`Ann will not change her mind about ${label}.`);
        expect(fact).toMatchObject({ about: [ANN], knownBy: [ANN] });
        expect(fact.hiddenFromCommander).toBeUndefined();
      } else {
        moved++;
        expect(events[0].type).toBe('opinion_changed');
        expect(op(s, t).position).not.toBe(ids(t)[1]);
      }
    }
    expect(hardened + moved).toBe(50);
    expect(hardened).toBeGreaterThanOrEqual(15);
    expect(hardened).toBeLessThanOrEqual(35);
  });

  it('the hardening roll is a hash of her, the topic and the day: the same state gives the same answer', () => {
    const a = world(1, 'strong');
    const b = world(1, 'strong');
    push(a, 6, 2);
    push(b, 6, 2);
    expect(op(a)).toEqual(op(b));
    expect(a.memory.facts).toEqual(b.memory.facts);
  });

  it('a held opinion never hardens', () => {
    for (const strength of ['held', 'loose'] as const) {
      const s = world(1, strength);
      expect(push(s, 6).map((e) => e.type)).toEqual(['opinion_changed']);
    }
  });
});

describe('agreement', () => {
  it('gives Affinity only on a strong opinion, through the same row and diminishing', () => {
    const strong = world(1, 'strong');
    strong.relations[ANN].affinity = 10;
    const out = apply(strong, [ev('opinion_agreed')]);
    expect(errors(out.events)).toEqual([]);
    expect(ofType(out.events, 'relation_changed')).toEqual([{ type: 'relation_changed', unitId: ANN, axis: 'affinity', delta: 1, applied: 1 }]);
    expect(out.state.relations[ANN].affinity).toBe(11);
    const held = world(1, 'held');
    held.relations[ANN].affinity = 10;
    const none = apply(held, [ev('opinion_agreed')]);
    expect(ofType(none.events, 'relation_changed')).toEqual([]);
    expect(none.state.relations[ANN].affinity).toBe(10);
  });

  it('repeats the same day are worth less (the day\'s gains shrink)', () => {
    let s = world(1, 'strong');
    s.relations[ANN].affinity = 0;
    s.relations[ANN].dailyGain.affinity = 30;
    const before = s.relations[ANN].affinity;
    for (let i = 0; i < 5; i++) s = apply(s, [ev('opinion_agreed', { evidence: `agreed ${i}` })]).state;
    expect(s.relations[ANN].affinity - before).toBeLessThan(5);
  });

  it('agreeOpinion is the engine half (the same row, once)', () => {
    const s = world(1, 'strong');
    const ctx = ctxOf(s, reg);
    const events = agreeOpinion(s, ctx, ANN, TOPIC);
    expect(ofType(events, 'relation_changed')).toHaveLength(1);
    const held = world(1, 'held');
    expect(agreeOpinion(held, ctxOf(held, reg), ANN, TOPIC)).toEqual([]);
  });
});

describe('a challenge through intents/apply', () => {
  it('severity decides the weight: minor and moderate count 1, major and extreme count 2', () => {
    for (const [severity, weight] of [['minor', 1], ['moderate', 1], ['major', 2], ['extreme', 2]] as const) {
      const out = apply(world(1), [ev('opinion_challenged', { severity })]);
      expect(errors(out.events)).toEqual([]);
      expect(op(out.state).push, severity).toEqual({ toward: 'last', amount: weight });
    }
  });

  it('a positionId of the topic sets the direction', () => {
    const out = apply(world(2), [ev('opinion_challenged', { positionId: ids()[4] })]);
    expect(op(out.state).push).toEqual({ toward: 'last', amount: 1 });
  });

  it('a topic she has not voiced, or one that is not hers, is not offered and changes nothing', () => {
    const s = world(1);
    delete op(s).voicedDay;
    const out = apply(s, [ev('opinion_challenged', { severity: 'extreme' })]);
    expect(op(out.state).push).toBeUndefined();
    expect(ofType(out.events, 'relation_changed')).toEqual([]);
  });

  it('a challenge is remembered when it moves her: a fr fact about her, known to her, and the id counter is not shifted', () => {
    let s = world(1);
    const before = s.memory.nextId;
    let events: ReturnType<typeof apply>['events'] = [];
    for (let i = 0; i < 3; i++) {
      const out = apply(s, [ev('opinion_challenged', { severity: 'major', evidence: `argued ${i}` })]);
      s = out.state;
      events = out.events;
    }
    expect(ofType(events, 'opinion_changed')).toEqual([{ type: 'opinion_changed', unitId: ANN, topicId: TOPIC, from: ids()[1], to: ids()[2] }]);
    const facts = s.memory.facts.filter((f) => f.tags.includes('persuaded'));
    expect(facts).toHaveLength(1);
    expect(facts[0].id).toMatch(/^fr/);
    expect(facts[0]).toMatchObject({ about: [ANN], knownBy: [ANN] });
    expect(facts[0].text).toContain('Ann');
    expect(facts[0].text).toContain(String((reg.opinionTopics.get(TOPIC) as unknown as OpinionTopicEntry).label));
    expect(facts[0].text).not.toMatch(/\b(he|him|his)\b/i);
    expect(s.memory.nextId).toBe(before);
  });

  it('is a pending appraisal with development on, and nothing with it off', () => {
    const off = apply(world(1), [ev('opinion_challenged')]);
    expect(mine(off.state).development).toBeUndefined();
    const s = world(1);
    s.settings.characterDevelopment = 'normal';
    const on = apply(s, [ev('opinion_challenged')]);
    expect(developmentOf(mine(on.state)).pending[0]).toMatchObject({ kind: 'opinion_challenged', role: 'subject', wanted: 'no', initiator: 'actor', harm: 'none', outcome: 'bad' });
    // the row itself moves nothing
    expect(on.state.relations[ANN].affinity).toBe(s.relations[ANN].affinity);
  });

  it('a moody woman loses 1 Affinity on a major challenge, a steady one does not, and a minor one costs nobody', () => {
    const run1 = (moody: boolean, severity: string) => {
      const s = world(1);
      s.relations[ANN].affinity = 10;
      if (moody) mine(s).temperament = { talkativeness: 'terse', volatility: 'moody', humor: 'dry' };
      return apply(s, [ev('opinion_challenged', { severity })]).state.relations[ANN].affinity;
    };
    expect(run1(true, 'major')).toBe(9);
    expect(run1(true, 'extreme')).toBe(9);
    expect(run1(true, 'minor')).toBe(10);
    expect(run1(false, 'major')).toBe(10);
  });
});
