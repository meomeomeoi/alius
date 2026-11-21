import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { lifeIntentInput } from '../../../src/engine/life/intents';
import {
  defaultPosition, formOpinion, heardOpinions, recentEventTopics, topicsAt, topicsInText, triggerTopics, unformedTopics, voiceOpinion,
} from '../../../src/engine/life/opinions';
import { lifeHash, newLife } from '../../../src/engine/life/state';
import type { OpinionTopicEntry } from '../../../src/engine/life/types';
import type { CampaignState, Opinion } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { lifeDirectives } from '../../../src/life/directives';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const topic = (id: string) => reg.opinionTopics.get(id) as unknown as OpinionTopicEntry;
const mine = (s: CampaignState, id = ANN) => s.squad.find((u) => u.id === id)!;
const held = (position: string, over: Partial<Opinion> = {}): Opinion => ({ position, strength: 'held', formedDay: 3, ...over });

function world(over: { participants?: string[]; location?: string; mode?: 'normal' | 'off'; start?: boolean } = {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.world.clocks = [];
  s.settings.lifeEvents = over.mode ?? 'normal';
  if ((over.mode ?? 'normal') !== 'off') s.life = newLife(7);
  if (over.start === false) return s;
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: over.location ?? 'quarters_unit', participants: over.participants ?? [ANN], origin: 'event', startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
}

describe('the default position', () => {
  const positions = (id: string) => topic(id).positions.map((p) => p.id);

  it('follows the axis: a positive value the first position, a negative one the last, zero the middle', () => {
    const s = world({ start: false });
    mine(s).values.corporate = 2;
    expect(defaultPosition(s, reg, ANN, 'corporations')).toBe(positions('corporations')[0]);
    mine(s).values.corporate = -1;
    expect(defaultPosition(s, reg, ANN, 'corporations')).toBe(positions('corporations').at(-1));
    mine(s).values.corporate = 0;
    expect(defaultPosition(s, reg, ANN, 'corporations')).toBe(positions('corporations')[Math.floor(positions('corporations').length / 2)]);
  });

  it('a topic of sign -1 is reversed', () => {
    const s = world({ start: false });
    expect(topic('the_leash').axis).toEqual({ id: 'autonomy', sign: -1 });
    mine(s).values.autonomy = 2;
    expect(defaultPosition(s, reg, ANN, 'the_leash')).toBe(positions('the_leash').at(-1));
    mine(s).values.autonomy = -3;
    expect(defaultPosition(s, reg, ANN, 'the_leash')).toBe(positions('the_leash')[0]);
  });

  it('with no axis, and for a four-position topic, the middle (floor(n / 2))', () => {
    const s = world({ start: false });
    expect(topic('coffee').axis).toBeUndefined();
    expect(defaultPosition(s, reg, ANN, 'coffee')).toBe(positions('coffee')[Math.floor(positions('coffee').length / 2)]);
    mine(s).values.ingroup = 0;
    expect(positions('cowardice')).toHaveLength(4);
    expect(defaultPosition(s, reg, ANN, 'cowardice')).toBe(positions('cowardice')[2]);
  });

  it('reads her drifted values, not the imported ones', () => {
    const s = world({ start: false });
    mine(s).values.corporate = 0;
    mine(s).development = { drift: { corporate: 2 } } as never;
    expect(defaultPosition(s, reg, ANN, 'corporations')).toBe(positions('corporations')[0]);
  });
});

describe('forming an opinion', () => {
  const form = (s: CampaignState, over: Record<string, unknown> = {}) =>
    run(s, reg, { type: 'life/opinion_formed', payload: { unitId: ANN, topicId: 'coffee', position: topic('coffee').positions[0].id, text: 'Black, no sugar.', strength: 'held', source: 'model', ...over } });

  it('writes the opinion once, and its event shows neither the position nor the words', () => {
    const s = world();
    const out = form(s);
    expect(errors(out.events)).toEqual([]);
    expect(mine(out.state).opinions!.coffee).toEqual({ position: topic('coffee').positions[0].id, strength: 'held', text: 'Black, no sugar.', formedDay: 40 });
    const events = ofType(out.events, 'opinion_formed');
    expect(events).toEqual([{ type: 'opinion_formed', unitId: ANN, topicId: 'coffee', source: 'model' }]);
    expect(JSON.stringify(out.events)).not.toContain('Black, no sugar');
  });

  it('a second one for the same topic, an unknown topic or position, and a strong strength are refused', () => {
    const s = form(world()).state;
    expect(errors(form(s, { position: topic('coffee').positions[1].id }).events)).toHaveLength(1);
    expect(mine(form(s, { position: topic('coffee').positions[1].id }).state).opinions!.coffee.position).toBe(topic('coffee').positions[0].id);
    const fresh = world();
    expect(errors(form(fresh, { position: 'nope' }).events)).toHaveLength(1);
    expect(errors(form(fresh, { topicId: 'nope' }).events)).toHaveLength(1);
    expect(errors(form(fresh, { strength: 'strong' }).events)).toHaveLength(1);
    expect(errors(form(fresh, { source: 'dream' }).events)).toHaveLength(1);
    expect(errors(form(fresh, { unitId: 'nobody' }).events)).toHaveLength(1);
    expect(mine(fresh).opinions).toBeUndefined();
  });

  it('cuts the text to 200 characters (and trims it)', () => {
    const out = form(world(), { text: `  ${'x'.repeat(250)}  ` });
    expect(mine(out.state).opinions!.coffee.text).toHaveLength(TUNING.life.opinion.textMax);
    expect(mine(out.state).opinions!.coffee.text).toHaveLength(200);
    expect(mine(form(world(), { text: '' }).state).opinions!.coffee.text).toBeUndefined();
  });

  it('opens nothing for a topic that was pending: the pending entry is taken out', () => {
    const s = world();
    s.life!.units[ANN].pendingTopics = ['coffee', 'books'];
    const out = form(s);
    expect(out.state.life!.units[ANN].pendingTopics).toEqual(['books']);
  });

  it('draws no rng', () => {
    const s = world();
    expect(form(s).state.rng).toEqual(s.rng);
  });
});

describe('what brings a topic up', () => {
  it('keywords are whole words, case-insensitive', () => {
    expect(topicsInText(reg, 'Coffee?')).toContain('coffee');
    expect(topicsInText(reg, 'I could use some COFFEE, honestly.')).toContain('coffee');
    expect(topicsInText(reg, 'The coffeemaker is broken.')).not.toContain('coffee');
    expect(topicsInText(reg, 'decaffeinated')).toEqual([]);
    expect(topicsInText(reg, 'nothing of note here')).toEqual([]);
    expect(topicsInText(reg, 'What do you think of the corporations and the leash?')).toEqual(['corporations', 'the_leash']);
  });

  it('a place and an activity open their topics, in registry order', () => {
    expect(topicsAt(reg, { locationId: 'mess_hall' })).toContain('coffee');
    expect(topicsAt(reg, { locationId: 'mess_hall' })).toContain('food');
    expect(topicsAt(reg, { locationId: 'mess_hall' })).not.toContain('weapons');
    expect(topicsAt(reg, { locationId: 'training_yard', activityId: 'study' })).toEqual(expect.arrayContaining(['weapons', 'books']));
    expect(topicsAt(reg, { locationId: 'nowhere' })).toEqual([]);
    const order = [...reg.opinionTopics.keys()];
    const got = topicsAt(reg, { locationId: 'mess_hall' });
    expect(got).toEqual([...got].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('a life event of the last seven days opens its topics', () => {
    const s = world({ start: false });
    s.life!.units[ANN] = { last: { finished_book: 36, bloom_sighting: 20 } };
    expect(recentEventTopics(s, reg, ANN, 40)).toEqual(['books']); // the bloom sighting is three weeks old
    expect(recentEventTopics(s, reg, BEA, 40)).toEqual([]);
  });

  it('scene/start records the place, the activity and her recent events; scene/end and scene/abort clear them', () => {
    const s = world({ start: false });
    s.life!.units[ANN] = { last: { finished_book: 38 }, scene: { sceneId: 's-old', topics: ['stale'], topic: 'stale' } };
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    const sceneId = started.state.scene!.id;
    expect(started.state.life!.units[ANN].scene).toMatchObject({ sceneId });
    expect(started.state.life!.units[ANN].scene!.topics).toEqual(expect.arrayContaining(['coffee', 'food', 'books']));
    expect(started.state.life!.units[ANN].scene!.topics).not.toContain('stale');
    expect(started.state.life!.units[BEA].scene!.topics).toContain('coffee');
    expect(started.state.life!.units[BEA].scene!.topics).not.toContain('books');
    const ended = run(started.state, reg, { type: 'scene/end', payload: {} });
    expect(ended.state.life!.units[ANN].scene).toBeUndefined();
    expect(ended.state.life!.units[BEA].scene).toBeUndefined();
    const aborted = run(started.state, reg, { type: 'scene/abort', payload: {} });
    expect(aborted.state.life!.units[ANN].scene).toBeUndefined();
  });

  it('with life off a scene leaves the state exactly as before', () => {
    const s = world({ mode: 'off', start: false });
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(started.state.life).toBeUndefined();
    const cleared = run(started.state, reg, { type: 'scene/end', payload: {} });
    expect(cleared.state.life).toBeUndefined();
  });

  it('a trigger in a scene is stored for everyone present, only for topics of the registry', () => {
    const s = world({ participants: [ANN, BEA] });
    const out = run(s, reg, { type: 'life/topics_triggered', payload: { topicIds: ['music', 'not_a_topic', 'music'] } });
    expect(errors(out.events)).toEqual([]);
    for (const id of [ANN, BEA]) expect(out.state.life!.units[id].scene!.topics.filter((t) => t === 'music')).toHaveLength(1);
    expect(out.state.life!.units[ANN].scene!.topics).not.toContain('not_a_topic');
    expect(errors(run(world({ start: false }), reg, { type: 'life/topics_triggered', payload: { topicIds: ['music'] } }).events)).toHaveLength(1); // no scene is open
  });

  it('unformedTopics lists what was triggered or is pending and has no opinion yet', () => {
    const s = world();
    s.life!.units[ANN].scene!.topics = ['music', 'coffee'];
    s.life!.units[ANN].pendingTopics = ['books', 'music'];
    mine(s).opinions = { coffee: held('x') };
    expect(unformedTopics(s, ANN)).toEqual(['music', 'books']);
    expect(unformedTopics(s, BEA)).toEqual([]);
  });
});

describe('the one topic of a scene', () => {
  const pickIn = (s: CampaignState, topics: string[], sceneId = 'sc1'): string | undefined => {
    const draft = structuredClone(s);
    draft.scene = { ...draft.scene!, id: sceneId };
    draft.life!.units[ANN] = { last: {}, scene: { sceneId, topics: [] } };
    triggerTopics(draft, reg, [ANN], topics, sceneId);
    return draft.life!.units[ANN].scene!.topic;
  };

  it('is a hash of the scene, stable, and only among topics she has an opinion on', () => {
    const s = world();
    mine(s).opinions = { coffee: held('x'), music: held('y'), books: held('z') };
    const a = pickIn(s, ['coffee', 'music', 'books', 'sleep']);
    expect(['coffee', 'music', 'books']).toContain(a);
    expect(pickIn(s, ['coffee', 'music', 'books', 'sleep'])).toBe(a);
    const order = ['coffee', 'music', 'books'];
    expect(a).toBe(order[lifeHash(s.life!, `sc1|${ANN}`) % 3]);
    // an unformed topic is never picked, and no opinion means no pick
    expect(pickIn(s, ['sleep'])).toBeUndefined();
    mine(s).opinions = {};
    expect(pickIn(s, ['coffee'])).toBeUndefined();
  });

  it('varies with the scene id', () => {
    const s = world();
    mine(s).opinions = { coffee: held('x'), music: held('y'), books: held('z'), sleep: held('w') };
    const picks = new Set(Array.from({ length: 30 }, (_, i) => pickIn(s, ['coffee', 'music', 'books', 'sleep'], `s${i}`)));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('a topic within its 21-day cooldown is never picked', () => {
    const s = world();
    mine(s).opinions = { coffee: held('x', { voicedDay: 40 - 20 }), music: held('y', { voicedDay: 40 - 21 }) };
    for (let i = 0; i < 20; i++) expect(pickIn(s, ['coffee', 'music'], `s${i}`)).toBe('music');
    mine(s).opinions = { coffee: held('x', { voicedDay: 30 }) };
    expect(pickIn(s, ['coffee'])).toBeUndefined();
  });

  it('is picked once per scene: a later trigger or a voiced topic leaves no second one', () => {
    const s = world();
    mine(s).opinions = { coffee: held('x'), music: held('y') };
    const draft = structuredClone(s);
    const sceneId = draft.scene!.id;
    triggerTopics(draft, reg, [ANN], ['coffee'], sceneId);
    expect(draft.life!.units[ANN].scene!.topic).toBe('coffee');
    triggerTopics(draft, reg, [ANN], ['music'], sceneId);
    expect(draft.life!.units[ANN].scene!.topic).toBe('coffee');
    voiceOpinion(draft, reg, ANN, 'coffee');
    expect(draft.life!.units[ANN].scene!.topic).toBeUndefined();
    triggerTopics(draft, reg, [ANN], ['music'], sceneId);
    expect(draft.life!.units[ANN].scene!.topic).toBeUndefined(); // she has spoken for this scene
  });

  it('an opinion formed after the trigger is picked at once (the lazy path)', () => {
    const s = world();
    const triggered = run(s, reg, { type: 'life/topics_triggered', payload: { topicIds: ['coffee'] } }).state;
    expect(triggered.life!.units[ANN].scene!.topic).toBeUndefined();
    const formed = run(triggered, reg, { type: 'life/opinion_formed', payload: { unitId: ANN, topicId: 'coffee', position: topic('coffee').positions[0].id, text: 'Black.', strength: 'held', source: 'model' } });
    expect(formed.state.life!.units[ANN].scene!.topic).toBe('coffee');
    expect(ofType(formed.events, 'topic_picked')).toEqual([{ type: 'topic_picked', unitId: ANN }]); // which topic is not in the event
    // an opinion on a topic nothing triggered is not picked
    const other = run(triggered, reg, { type: 'life/opinion_formed', payload: { unitId: ANN, topicId: 'music', position: topic('music').positions[0].id, text: '', strength: 'loose', source: 'fallback' } });
    expect(other.state.life!.units[ANN].scene!.topic).toBeUndefined();
  });

  it('an untriggered opinion is never offered or voiced', () => {
    const s = world();
    mine(s).opinions = { coffee: held('x'), music: held('y') };
    expect(lifeDirectives(s, reg, [ANN]).filter((d) => d.id.startsWith('life:opinion:'))).toEqual([]);
    expect(lifeIntentInput(s, reg, [ANN], s.scene!, 'scene').life?.topics ?? []).toEqual([]);
    expect(voiceOpinion(s, reg, ANN, 'coffee')).toEqual([]);
    expect(mine(s).opinions!.coffee.voicedDay).toBeUndefined();
  });
});

describe('voicing', () => {
  function picked(): CampaignState {
    const s = world();
    mine(s).opinions = { coffee: held(topic('coffee').positions[1].id, { text: 'Black, no sugar.' }) };
    return run(s, reg, { type: 'life/topics_triggered', payload: { topicIds: ['coffee'] } }).state;
  }

  it('opinion directive gone after voiced', () => {
    const s = picked();
    const before = lifeDirectives(s, reg, [ANN]).filter((d) => d.id.startsWith('life:opinion:'));
    expect(before.map((d) => d.id)).toEqual([`life:opinion:${ANN}`]);
    expect(before[0].expiresAfter).toBe('scene');
    expect(before[0].text).toMatch(/^If it fits, Ann/);
    expect(before[0].text).toContain(topic('coffee').label);
    expect(before[0].text).toContain('Black, no sugar.');
    expect(before[0].text).toMatch(/once/i);
    expect(before[0].text).not.toMatch(/\b(he|him|his)\b/i);
    const out = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'opinion_voiced', actor: ANN, targets: [], severity: 'minor', evidence: 'Black, no sugar.', confidence: 0.9, topicId: 'coffee' }] } } });
    expect(errors(out.events)).toEqual([]);
    expect(lifeDirectives(out.state, reg, [ANN]).filter((d) => d.id.startsWith('life:opinion:'))).toEqual([]);
    expect(out.state.life!.units[ANN].scene!.topic).toBeUndefined();
    // a second report of the same topic is no longer offered, so it changes nothing
    const again = run(out.state, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'opinion_voiced', actor: ANN, targets: [], severity: 'minor', evidence: 'Black again.', confidence: 0.9, topicId: 'coffee' }] } } });
    expect(mine(again.state).opinions!.coffee.voicedDay).toBe(40);
    expect(again.state.memory.facts.filter((f) => f.tags.includes('opinion'))).toHaveLength(1);
  });

  it('sets voicedDay, writes the fact the commander knows, and lists it in THOUGHTS', () => {
    const s = picked();
    const events = voiceOpinion(s, reg, ANN, 'coffee');
    expect(ofType(events, 'life_noted')).toEqual([{ type: 'life_noted', unitId: ANN, topicId: 'coffee' }]);
    expect(mine(s).opinions!.coffee.voicedDay).toBe(40);
    const fact = s.memory.facts.find((f) => f.tags.includes('opinion'))!;
    expect(fact.text).toBe(`Ann's view on ${topic('coffee').label}: Black, no sugar.`);
    expect(fact).toMatchObject({ about: [ANN], knownBy: [ANN] });
    expect(fact.hiddenFromCommander).toBeUndefined();
    expect(fact.tags).toEqual(expect.arrayContaining(['opinion', 'coffee']));
    expect(fact.tags).not.toContain('untold');
    expect(heardOpinions(s, ANN)).toEqual([{ topicId: 'coffee', position: topic('coffee').positions[1].id, text: 'Black, no sugar.', voicedDay: 40 }]);
    expect(heardOpinions(s, BEA)).toEqual([]);
  });

  it('without words the fact carries the position description', () => {
    const s = world();
    mine(s).opinions = { coffee: held(topic('coffee').positions[2].id) };
    run(s, reg, { type: 'life/topics_triggered', payload: { topicIds: ['coffee'] } });
    triggerTopics(s, reg, [ANN], ['coffee'], s.scene!.id);
    voiceOpinion(s, reg, ANN, 'coffee');
    expect(s.memory.facts.find((f) => f.tags.includes('opinion'))!.text).toContain(topic('coffee').positions[2].description);
  });

  it('only the picked topic can be voiced', () => {
    const s = picked();
    mine(s).opinions!.music = held('y');
    expect(voiceOpinion(s, reg, ANN, 'music')).toEqual([]);
    expect(mine(s).opinions!.music.voicedDay).toBeUndefined();
    expect(heardOpinions(s, ANN)).toEqual([]);
  });

  it('an unvoiced opinion is not in THOUGHTS', () => {
    const s = world();
    mine(s).opinions = { coffee: held('x', { text: 'secret words' }) };
    expect(heardOpinions(s, ANN)).toEqual([]);
  });

  it('draws no rng', () => {
    const s = picked();
    const rng = structuredClone(s.rng);
    voiceOpinion(s, reg, ANN, 'coffee');
    expect(s.rng).toEqual(rng);
  });
});
