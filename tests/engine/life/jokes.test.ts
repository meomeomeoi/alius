import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { developmentOf } from '../../../src/engine/development/state';
import { countJoke } from '../../../src/engine/development/habits';
import { addFact } from '../../../src/engine/memory';
import { jokeCandidates, pickJoke, returnJoke, runningJokes } from '../../../src/engine/life/jokes';
import { lifeIntentInput } from '../../../src/engine/life/intents';
import { newLife } from '../../../src/engine/life/state';
import type { CampaignState, Fact, Temperament } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { lifeDirectives } from '../../../src/life/directives';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const mine = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!;
const humor = (s: CampaignState, h: Temperament['humor']) => { mine(s).temperament = { talkativeness: 'terse', volatility: 'steady', humor: h }; };

function fact(s: CampaignState, text: string, day: number, over: Partial<Omit<Fact, 'id' | 'text' | 'day'>> = {}): Fact {
  return addFact(s, { about: [ANN], text, tags: [], importance: 2, day, knownBy: [ANN], ...over });
}

/** Today is day 40; a private scene with Ann is open. */
function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  return s;
}
function inScene(s: CampaignState, participants = [ANN]): CampaignState {
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants, origin: 'event', startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
}

describe('what may come back', () => {
  it('offers the newest five facts about her that she knows, are not hidden, not untold and are at least three days old', () => {
    const s = world();
    const old = Array.from({ length: 7 }, (_, i) => fact(s, `She told a story ${i}.`, 20 + i)); // days 20..26
    fact(s, 'Too new.', 38);
    fact(s, 'Just old enough.', 37);
    fact(s, 'A secret she keeps.', 30, { hiddenFromCommander: true });
    fact(s, 'Not told yet.', 31, { tags: ['life', 'untold'] });
    fact(s, 'About Bea.', 32, { about: [BEA], knownBy: [BEA] });
    fact(s, 'She does not know this.', 33, { knownBy: [BEA] });
    const got = jokeCandidates(s, ANN, 40);
    expect(got).toHaveLength(5);
    expect(got.map((c) => c.text)).toEqual(['Just old enough.', 'She told a story 6.', 'She told a story 5.', 'She told a story 4.', 'She told a story 3.']);
    expect(got[0].id).toBe(s.memory.facts.find((f) => f.text === 'Just old enough.')!.id);
    expect(old).toHaveLength(7);
    expect(TUNING.life.joke.offerMax).toBe(5);
  });

  it('nothing for a unit that is not named, and nothing from a fact that is gone', () => {
    const s = world();
    expect(jokeCandidates(s, 'nobody', 40)).toEqual([]);
    expect(jokeCandidates(s, ANN, 40)).toEqual([]);
  });

  it('is offered only in a private scene, never in a DM or a group scene', () => {
    const s = world();
    fact(s, 'She mended a boot with wire.', 20);
    const solo = inScene(s);
    expect(lifeIntentInput(solo, reg, [ANN], solo.scene!, 'scene').life!.jokes).toHaveLength(1);
    expect(lifeIntentInput(solo, reg, [ANN], null, 'dm').life?.jokes ?? []).toEqual([]);
    const group = inScene(s, [ANN, BEA]);
    expect(lifeIntentInput(group, reg, [ANN, BEA], group.scene!, 'scene').life?.jokes ?? []).toEqual([]);
  });
});

describe('a running joke', () => {
  it('three returns in 30 days make it running', () => {
    const s = world();
    const f = fact(s, 'The boot she mended with wire.', 5);
    const count = () => mine(s) && s.life!.units[ANN].jokes![f.id].count;
    expect(returnJoke(s, reg, ANN, f.id, 10)).toEqual([{ type: 'joke_counted', unitId: ANN }]);
    expect(runningJokes(s, ANN, 10)).toEqual([]);
    returnJoke(s, reg, ANN, f.id, 20);
    expect(runningJokes(s, ANN, 20)).toEqual([]);
    returnJoke(s, reg, ANN, f.id, 30);
    expect(count()).toBe(3);
    expect(s.life!.units[ANN].jokes![f.id]).toEqual({ count: 3, last: 30 });
    expect(runningJokes(s, ANN, 30)).toEqual([f.id]);
    expect(runningJokes(s, ANN, 60)).toEqual([f.id]); // 30 days since the last return: still theirs
    expect(runningJokes(s, ANN, 61)).toEqual([]); // 31: it has gone cold
  });

  it('a gap of 31 days resets the count; a gap of 30 does not', () => {
    const s = world();
    const f = fact(s, 'The boot.', 5);
    returnJoke(s, reg, ANN, f.id, 10);
    returnJoke(s, reg, ANN, f.id, 40);
    expect(s.life!.units[ANN].jokes![f.id]).toEqual({ count: 2, last: 40 });
    returnJoke(s, reg, ANN, f.id, 71);
    expect(s.life!.units[ANN].jokes![f.id]).toEqual({ count: 1, last: 71 });
  });

  it('the newest running joke comes first', () => {
    const s = world();
    const a = fact(s, 'Joke A.', 1);
    const b = fact(s, 'Joke B.', 2);
    for (const d of [10, 11, 12]) returnJoke(s, reg, ANN, a.id, d);
    for (const d of [15, 16, 17]) returnJoke(s, reg, ANN, b.id, d);
    expect(runningJokes(s, ANN, 20)).toEqual([b.id, a.id]);
  });

  it('returning one sets the day she last brought one back and draws no rng', () => {
    const s = world();
    const f = fact(s, 'The boot.', 5);
    const rng = structuredClone(s.rng);
    returnJoke(s, reg, ANN, f.id, 12);
    expect(s.life!.units[ANN].jokeDay).toBe(12);
    expect(s.rng).toEqual(rng);
  });

  it('nothing for a unit that is gone or an unknown fact', () => {
    const s = world();
    expect(returnJoke(s, reg, 'nobody', 'f1', 10)).toEqual([]);
    expect(returnJoke(s, reg, ANN, 'f_none', 10)).toEqual([]);
    expect(s.life!.units[ANN]?.jokes).toBeUndefined();
  });
});

describe('bringing one back in a scene', () => {
  /** A scene id on which the hash lets her bring the joke back (a search over scene ids for the given humor). */
  const picks = (s: CampaignState, factIds: string[], n = 200): number => {
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const d = structuredClone(s);
      d.life!.units[ANN] = { ...(d.life!.units[ANN] ?? { last: {} }), scene: { sceneId: `s${i}`, topics: [] } };
      if (pickJoke(d, ANN, `s${i}`, 40) !== null) {
        hits++;
        expect(factIds).toContain(d.life!.units[ANN].scene!.joke);
      }
    }
    return hits;
  };
  function withJoke(h: Temperament['humor']): { s: CampaignState; id: string } {
    const s = world();
    humor(s, h);
    const f = fact(s, 'The boot she mended with wire.', 5);
    for (const d of [30, 31, 32]) returnJoke(s, reg, ANN, f.id, d);
    delete s.life!.units[ANN].jokeDay;
    return { s, id: f.id };
  }

  it('humor none never brings it back; warm more often than dry; the share is about 0.3 x the humor weight', () => {
    const none = withJoke('none');
    expect(picks(none.s, [none.id])).toBe(0);
    const warm = picks(withJoke('warm').s, [withJoke('warm').id]);
    const dry = picks(withJoke('dry').s, [withJoke('dry').id]);
    const mocking = picks(withJoke('mocking').s, [withJoke('mocking').id]);
    expect(warm).toBeGreaterThan(dry);
    expect(dry).toBeGreaterThan(10);
    expect(warm).toBeGreaterThan(40);
    expect(warm).toBeLessThan(85); // 0.3 of 200 = 60
    expect(mocking).toBeGreaterThan(dry);
  });

  it('never within five days of the last time', () => {
    const { s, id } = withJoke('warm');
    s.life!.units[ANN].jokeDay = 36;
    expect(picks(s, [id])).toBe(0);
    s.life!.units[ANN].jokeDay = 35;
    expect(picks(s, [id])).toBeGreaterThan(0);
  });

  it('only a running joke, and only the newest', () => {
    const s = world();
    humor(s, 'warm');
    const f = fact(s, 'Not running yet.', 5);
    returnJoke(s, reg, ANN, f.id, 30);
    returnJoke(s, reg, ANN, f.id, 31);
    expect(picks(s, [f.id])).toBe(0);
  });

  it('a scene start picks one in a private scene only (the scene id is a hash input)', () => {
    const { s } = withJoke('warm');
    let solo = 0;
    let group = 0;
    for (let i = 0; i < 60; i++) {
      const a = structuredClone(s);
      a.memory.nextId = i * 7; // the scene ids differ
      const one = run(a, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants: [ANN], origin: 'event', startIndex: 0 } });
      if (one.state.life!.units[ANN].scene!.joke !== undefined) solo++;
      const b = structuredClone(s);
      b.memory.nextId = i * 7;
      const two = run(b, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants: [ANN, BEA], origin: 'event', startIndex: 0 } });
      if (two.state.life!.units[ANN].scene!.joke !== undefined) group++;
    }
    expect(solo).toBeGreaterThan(5);
    expect(group).toBe(0);
  });

  it('joke directive gone after joke_returned', () => {
    const { s, id } = withJoke('warm');
    const open = inScene(s);
    open.life!.units[ANN].scene!.joke = id;
    const before = lifeDirectives(open, reg, [ANN]).filter((d) => d.id.startsWith('life:joke:'));
    expect(before.map((d) => d.id)).toEqual([`life:joke:${ANN}`]);
    expect(before[0].expiresAfter).toBe('scene');
    expect(before[0].text).toMatch(/^If it fits, Ann/);
    expect(before[0].text).toContain('The boot she mended with wire.');
    expect(before[0].text).toMatch(/once/i);
    expect(before[0].text).not.toMatch(/\b(he|him|his)\b/i);
    const out = run(open, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'joke_returned', actor: ANN, targets: [], severity: 'minor', evidence: 'the boot again', confidence: 0.9, factId: id }] } } });
    expect(errors(out.events)).toEqual([]);
    expect(ofType(out.events, 'joke_counted')).toHaveLength(1);
    expect(lifeDirectives(out.state, reg, [ANN]).filter((d) => d.id.startsWith('life:joke:'))).toEqual([]);
    expect(out.state.life!.units[ANN].scene!.joke).toBeUndefined();
    expect(out.state.life!.units[ANN].jokes![id].count).toBe(4);
    expect(out.state.life!.units[ANN].jokeDay).toBe(40);
  });

  it('a joke whose fact is gone says nothing', () => {
    const { s, id } = withJoke('warm');
    const open = inScene(s);
    open.life!.units[ANN].scene!.joke = id;
    open.memory.facts = [];
    expect(lifeDirectives(open, reg, [ANN]).filter((d) => d.id.startsWith('life:joke:'))).toEqual([]);
  });
});

describe('the habit', () => {
  const returns = (s: CampaignState, id: string, n = 3) => {
    const events = [];
    for (let i = 0; i < n; i++) events.push(...returnJoke(s, reg, ANN, id, 10 + i));
    return events;
  };

  it('forms with development on (running_joke, habit_formed)', () => {
    const s = world();
    s.settings.characterDevelopment = 'normal';
    const f = fact(s, 'The boot.', 5);
    const events = returns(s, f.id);
    expect(ofType(events, 'habit_formed')).toEqual([expect.objectContaining({ type: 'habit_formed', unitId: ANN, habitId: 'running_joke' })]);
    expect(developmentOf(mine(s)).habits).toEqual(['running_joke']);
    expect(developmentOf(mine(s)).counters[`joke:${f.id}`]).toBe(3);
    expect(developmentOf(mine(s)).facts.some((x) => x.habitId === 'running_joke' && x.text.includes('running joke'))).toBe(true);
  });

  it('forms nothing with development off, and leaves no development state', () => {
    const s = world();
    const f = fact(s, 'The boot.', 5);
    const events = returns(s, f.id, 5);
    expect(ofType(events, 'habit_formed')).toEqual([]);
    expect(mine(s).development).toBeUndefined();
    expect(countJoke(s, reg, ANN, f.id)).toEqual([]);
  });

  it('forms once', () => {
    const s = world();
    s.settings.characterDevelopment = 'normal';
    const f = fact(s, 'The boot.', 5);
    returns(s, f.id, 3);
    expect(ofType(returns(s, f.id, 3), 'habit_formed')).toEqual([]);
    expect(developmentOf(mine(s)).habits).toEqual(['running_joke']);
  });
});
