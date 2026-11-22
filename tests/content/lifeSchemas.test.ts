import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import { pastimeActivity } from '../../src/engine/life/types';
import { ALL_EVENT_TYPES, ENGINE_EVENT_TYPES, EVENT_TYPES, FIRST_KINDS, LIFE_EVENT_TYPES } from '../../src/engine/relations/vocab';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

type Files = Partial<Record<'lifeEvents' | 'hobbies' | 'opinionTopics' | 'pastimes' | 'activities' | 'habits', unknown[]>>;
/** Loads the core pack plus a test pack; returns the loader's error messages. */
async function loadWith(files: Files): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'alius-p14c-'));
  await mkdir(join(dir, 'p'));
  const manifest = Object.fromEntries(Object.keys(files).map((k) => [k, `${k}.json`]));
  await writeFile(join(dir, 'p', 'manifest.json'), JSON.stringify({ id: 'p14c_test', name: 'P14c test', version: '0.0.1', priority: 5, files: manifest }));
  for (const [k, v] of Object.entries(files)) await writeFile(join(dir, 'p', `${k}.json`), JSON.stringify(v));
  const r = await loadPacks(['content/core', join(dir, 'p')], async (p) => JSON.parse(await readFile(p, 'utf8')));
  return r.errors.map((e) => e.message);
}

const milestones = (n = 4) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, line: `Line ${i}.` }));
const hobby = (over: Record<string, unknown> = {}) => ({
  id: 't_hobby', label: 'testing', locations: ['mess_hall'], activityIds: [], teachable: true, milestones: milestones(), description: 'AUTHOR TO WRITE: a test hobby.', ...over,
});
const event = (over: Record<string, unknown> = {}) => ({
  id: 't_event', size: 'small', category: 'things', share: 'anyone', description: 'AUTHOR TO WRITE: a test event.', hub: 'She is testing.', lines: ['One.', 'Two.'], ...over,
});
const position = (id: string) => ({ id, description: `Position ${id}.`, lines: ['One.', 'Two.'] });
const topic = (over: Record<string, unknown> = {}) => ({
  id: 't_topic', label: 'testing', group: 'abstract', positions: [position('a'), position('b'), position('c')], triggers: { keywords: ['test'] }, description: 'AUTHOR TO WRITE: a test topic.', ...over,
});
const pastime = (over: Record<string, unknown> = {}) => ({
  id: 't_pastime', label: 'Test', locations: ['roof'], slots: ['evening'], talk: 'quiet', herActivity: 'idle', commanderActivity: 'idle', sensoryTag: 'rain', momentSources: [],
  description: 'AUTHOR TO WRITE: a test.', opening: 'It rains.', lines: ['One.', 'Two.'], ...over,
});

/** The ids of the `#### ` headings of one section of the draft. */
async function draftIds(from: string, to: string | null): Promise<string[]> {
  const text = await readFile('docs/content/life.md', 'utf8');
  const start = text.indexOf(from);
  const end = to === null ? text.length : text.indexOf(to);
  return [...text.slice(start, end).matchAll(/^#### `([a-z0-9_]+)`/gm)].map((m) => m[1]);
}

describe('the core pack (P14c)', () => {
  it('loads the four registries', () => {
    expect(reg.lifeEvents.size).toBe(51);
    expect(reg.hobbies.size).toBe(27);
    expect(reg.opinionTopics.size).toBe(65);
    expect(reg.pastimes.size).toBe(18);
    expect([...reg.opinionTopics.values()].reduce((n, t) => n + (t.positions as unknown[]).length, 0)).toBe(302);
  });

  it('the registries are described and the texts are drafts', () => {
    for (const n of ['lifeEvents', 'hobbies', 'opinionTopics', 'pastimes'] as const) {
      expect(DESCRIBED_REGISTRIES).toContain(n);
      for (const e of reg[n].values()) expect(String(e.description).startsWith('AUTHOR TO WRITE:'), `${n}:${e.id}`).toBe(true);
    }
  });

  it('ids match the draft', async () => {
    const sets: Array<[keyof Registries, string[]]> = [
      ['opinionTopics', await draftIds('## 1. Opinion topics', '## 2. Life events')],
      ['lifeEvents', await draftIds('## 2. Life events', '## 3. Hobbies')],
      ['hobbies', await draftIds('## 3. Hobbies', '## 4. Pastimes')],
      ['pastimes', await draftIds('## 4. Pastimes', null)],
    ];
    for (const [name, ids] of sets) {
      expect(new Set(ids).size, `${name} draft ids are unique`).toBe(ids.length);
      expect([...reg[name].keys()].sort(), name).toEqual([...ids].sort());
    }
  });

  it('every hobby has four milestones, a hosted location and the text its traces need', () => {
    const hosted = new Set([...reg.hubRooms.values()].map((r) => r.sceneLocationId));
    for (const h of reg.hobbies.values()) {
      const ms = h.milestones as Array<{ id: string; trace?: string }>;
      expect(ms, String(h.id)).toHaveLength(4);
      expect(new Set(ms.map((m) => m.id)).size).toBe(4);
      expect((h.locations as string[]).some((l) => hosted.has(l)), String(h.id)).toBe(true);
      for (const m of ms) if (m.trace === 'note' || m.trace === 'prop') expect(h.traceText, String(h.id)).toBeDefined();
    }
  });

  it('every opinion topic has an ordered list of positions with unique ids and an axis with at least three', () => {
    for (const t of reg.opinionTopics.values()) {
      const ids = (t.positions as Array<{ id: string }>).map((p) => p.id);
      expect(new Set(ids).size, String(t.id)).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(3);
      expect(ids.length).toBeLessThanOrEqual(5);
      expect((t.triggers as { keywords?: string[] }).keywords?.length, String(t.id)).toBeGreaterThan(0);
    }
  });

  it('a topic names the life events that open it, and only those', () => {
    for (const t of reg.opinionTopics.values()) {
      const opening = [...reg.lifeEvents.values()].filter((e) => (e.becomes as { opinionTopic?: string } | undefined)?.opinionTopic === t.id).map((e) => e.id).sort();
      expect(((t.triggers as { lifeEvents?: string[] }).lifeEvents ?? []).slice().sort(), String(t.id)).toEqual(opening);
    }
  });

  it('one activity has pastime: true, and it is companion-required and starts a scene', () => {
    expect([...reg.activities.values()].filter((a) => a.pastime === true)).toHaveLength(1);
    const a = pastimeActivity(reg)!;
    expect(a.companion).toBe('required');
    expect(a.startsScene).toBe(true);
    expect(a.appraisalTags).toEqual(['pastime']);
    // the activity that opens an ordinary conversation is not it
    expect([...reg.activities.values()].find((x) => x.startsScene === true && x.companion === 'required' && x.pastime !== true)?.id).not.toBe(a.id);
  });

  it('the laundry is a scene location and its plan room points at it', () => {
    expect(reg.locations.get('laundry')?.slots).toEqual(['morning', 'afternoon', 'evening']);
    expect([...reg.planRooms.values()].filter((p) => p.sceneLocationId === 'laundry')).toHaveLength(1);
    expect([...reg.pastimes.values()].some((p) => (p.locations as string[]).includes('laundry'))).toBe(true);
  });

  it('every pastime location exists and her-hobby is the only one without a place', () => {
    for (const p of reg.pastimes.values()) {
      for (const l of p.locations as string[]) expect(reg.locations.has(l), `${String(p.id)}:${l}`).toBe(true);
      if (p.hobby === true) expect(p.locations).toEqual([]);
      else expect((p.locations as string[]).length).toBeGreaterThan(0);
    }
    expect([...reg.pastimes.values()].filter((p) => p.hobby === true)).toHaveLength(1);
  });

  it('the running joke habit counts jokes', () => {
    expect(reg.habits.get('running_joke')?.counter).toEqual({ kind: 'joke' });
    expect(reg.habits.get('running_joke')?.threshold).toBe(3);
    expect(reg.habits.get('running_joke')?.tags).toEqual(['respect']); // P15: disappointment lets it lapse
  });

  it('the glossary has the twelve entries', () => {
    for (const id of ['temperament', 'talkativeness', 'volatility', 'humor', 'life_events', 'news_queue', 'hobby_cycle', 'quiet_meeting', 'thoughts', 'running_joke', 'commander_hobby_skill', 'setting_life_events']) {
      expect(reg.glossary.has(id), id).toBe(true);
      expect(String(reg.glossary.get(id)?.long).startsWith('AUTHOR TO WRITE:'), id).toBe(true);
    }
  });
});

describe('the event vocabulary', () => {
  it('the eight event types have rows and journals', () => {
    const seven = ['news_told', 'hobby_praised', 'opinion_voiced', 'opinion_challenged', 'opinion_agreed', 'first_moment', 'joke_returned'];
    for (const t of seven) expect(EVENT_TYPES as readonly string[]).toContain(t);
    expect([...LIFE_EVENT_TYPES].sort()).toEqual([...seven].sort());
    expect(ENGINE_EVENT_TYPES as readonly string[]).toContain('time_together');
    for (const t of [...seven, 'time_together']) {
      expect(ALL_EVENT_TYPES as readonly string[]).toContain(t);
      expect(String(reg.eventDeltas.get(t)?.journal ?? ''), t).not.toBe('');
    }
    expect(reg.eventDeltas.get('time_together')?.rows).toMatchObject({ minor: { affinity: 2, stress: -5 } });
    expect(reg.eventDeltas.get('time_together')?.appraisal).toEqual(reg.eventDeltas.get('rest') ?? reg.activities.get('rest')?.appraisal);
    expect(reg.eventDeltas.get('first_moment')?.rows).toMatchObject({ minor: { affinity: 2 } });
    expect(reg.eventDeltas.get('opinion_agreed')?.rows).toMatchObject({ minor: { affinity: 1 } });
    expect(reg.eventDeltas.get('opinion_challenged')?.appraisal).toEqual({ wanted: 'no', initiator: 'actor', harm: 'none', outcome: 'bad' });
    for (const t of ['opinion_challenged', 'news_told', 'hobby_praised', 'opinion_voiced', 'joke_returned']) {
      for (const sev of ['minor', 'moderate', 'major', 'extreme'] as const) expect((reg.eventDeltas.get(t)?.rows as Record<string, object>)[sev], `${t}.${sev}`).toEqual({});
    }
  });

  it('the six kinds of a first moment', () => {
    expect([...FIRST_KINDS]).toEqual(['laughed', 'fell_asleep_beside', 'told_her_past', 'cried', 'taught', 'asked_about_commander']);
  });

  it('the engine events of her life are reserved', () => {
    for (const t of ['life_event', 'life_shared', 'life_noted', 'life_frequency_set', 'news_queued', 'news_delivered', 'news_stale', 'hobby_started', 'hobby_progress', 'hobby_plateau',
      'hobby_breakthrough', 'hobby_milestone', 'hobby_cooling', 'hobby_dropped', 'hobby_rekindled', 'hobby_mastered', 'hobby_taught', 'opinion_formed', 'opinion_changed',
      'opinion_hardened', 'first_moment_kept', 'joke_counted', 'pastime_set', 'temperament_set', 'hobbies_set', 'opinion_set']) {
      expect(RESERVED_EVENT_TYPES, t).toContain(t);
    }
  });

  it('the reserved engine events cannot be emitted by an activity', async () => {
    const act = (event: string) => ({
      id: 't_act', name: 'T', summary: 'T', slotRules: ['morning'], cost: {}, companion: 'none', effects: [{ type: 'emit_event', event }], companionEffects: [], flavor: 'none',
    });
    expect((await loadWith({ activities: [act('life_event')] })).join('\n')).toMatch(/belongs to the engine/);
    expect(await loadWith({ activities: [act('something_else')] })).toEqual([]);
  });
});

describe('content checks', () => {
  it('a well-formed entry of each registry loads', async () => {
    expect(await loadWith({
      hobbies: [hobby()], lifeEvents: [event({ requires: { hobby: 'any', location: ['roof'], stressMin: 10 }, becomes: { hobby: 'reading', milestone: true } })],
      opinionTopics: [topic()], pastimes: [pastime(), pastime({ id: 't_hobby_time', hobby: true, locations: [] })],
    })).toEqual([]);
  });

  it('every hobby has a hosted location', async () => {
    expect((await loadWith({ hobbies: [hobby({ locations: ['perimeter'] })] })).join('\n')).toMatch(/hosted by a hub room/);
    expect((await loadWith({ hobbies: [hobby({ locations: ['nowhere'] })] })).join('\n')).toMatch(/unknown location "nowhere"/);
    expect(await loadWith({ hobbies: [hobby({ locations: ['perimeter', 'mess_hall'] })] })).toEqual([]);
  });

  it('a milestone list of 3 is refused, and so are repeated milestone ids', async () => {
    expect((await loadWith({ hobbies: [hobby({ milestones: milestones(3) })] })).join('\n')).toMatch(/exactly 4 milestones/);
    expect((await loadWith({ hobbies: [hobby({ milestones: [...milestones(3), { id: 'm0', line: 'x' }] })] })).join('\n')).toMatch(/used twice/);
  });

  it('a trace needs its text, an opinion trace needs a topic', async () => {
    const withTrace = (trace: string) => milestones().map((m, i) => (i === 1 ? { ...m, trace } : m));
    expect((await loadWith({ hobbies: [hobby({ milestones: withTrace('note') })] })).join('\n')).toMatch(/needs the hobby's traceText/);
    expect(await loadWith({ hobbies: [hobby({ milestones: withTrace('prop'), traceText: 'A shelf.' })] })).toEqual([]);
    expect((await loadWith({ hobbies: [hobby({ milestones: withTrace('opinion') })] })).join('\n')).toMatch(/opinionTopic/);
    expect(await loadWith({ hobbies: [hobby({ milestones: withTrace('opinion'), opinionTopic: 'books' })] })).toEqual([]);
  });

  it('an unknown becomes hobby is a content error', async () => {
    expect((await loadWith({ lifeEvents: [event({ becomes: { hobby: 'nope' } })] })).join('\n')).toMatch(/unknown hobby "nope"/);
    expect((await loadWith({ lifeEvents: [event({ becomes: { opinionTopic: 'nope' } })] })).join('\n')).toMatch(/unknown opinion topic "nope"/);
  });

  it('a life event names real things', async () => {
    const bad = async (requires: Record<string, unknown>) => (await loadWith({ lifeEvents: [event({ requires })] })).join('\n');
    expect(await bad({ hobby: 'nope' })).toMatch(/unknown hobby "nope"/);
    expect(await bad({ location: ['nope'] })).toMatch(/unknown location "nope"/);
    expect(await bad({ activity: ['nope'] })).toMatch(/unknown activity "nope"/);
    expect(await bad({ defectCategory: 'nope' })).toMatch(/no defect has the category "nope"/);
    expect(await bad({ afterEvent: 'nope' })).toMatch(/unknown life event "nope"/);
    expect(await bad({ otherHadThisWeek: 'nope' })).toMatch(/unknown life event "nope"/);
    expect(await bad({ weather: 'rain' })).not.toBe('');
    expect(await bad({ afterEvent: 'bored', otherHadThisWeek: 'bored' })).toBe('');
  });

  it('keepsUnless belongs to a keeps event', async () => {
    expect((await loadWith({ lifeEvents: [event({ keepsUnless: { affinityMin: 60 } })] })).join('\n')).toMatch(/keepsUnless/);
    expect(await loadWith({ lifeEvents: [event({ share: 'keeps', keepsUnless: { affinityMin: 60, romantic: true } })] })).toEqual([]);
  });

  it('a topic position id is unique within its topic', async () => {
    expect((await loadWith({ opinionTopics: [topic({ positions: [position('a'), position('a'), position('c')] })] })).join('\n')).toMatch(/used twice in this topic/);
  });

  it('a topic with an axis needs at least three positions', async () => {
    expect((await loadWith({ opinionTopics: [topic({ axis: { id: 'mercy', sign: 1 }, positions: [position('a'), position('b')] })] })).join('\n')).toMatch(/at least 3 positions/);
    expect(await loadWith({ opinionTopics: [topic({ positions: [position('a'), position('b')] })] })).toEqual([]);
    expect((await loadWith({ opinionTopics: [topic({ axis: { id: 'greed', sign: 1 } })] })).length).toBeGreaterThan(0);
  });

  it('a topic trigger names real things', async () => {
    const bad = async (triggers: Record<string, unknown>) => (await loadWith({ opinionTopics: [topic({ triggers: { keywords: ['x'], ...triggers } })] })).join('\n');
    expect(await bad({ locations: ['nope'] })).toMatch(/unknown location "nope"/);
    expect(await bad({ activities: ['nope'] })).toMatch(/unknown activity "nope"/);
    expect(await bad({ lifeEvents: ['nope'] })).toMatch(/unknown life event "nope"/);
  });

  it('a pastime names real places and a real hobby', async () => {
    expect((await loadWith({ pastimes: [pastime({ locations: ['nope'] })] })).join('\n')).toMatch(/unknown location "nope"/);
    expect((await loadWith({ pastimes: [pastime({ requires: { hobby: 'nope' } })] })).join('\n')).toMatch(/unknown hobby "nope"/);
    expect((await loadWith({ pastimes: [pastime({ locations: [] })] })).join('\n')).toMatch(/needs a location/);
    expect(await loadWith({ pastimes: [pastime({ requires: { hobby: 'reading', afterRun: true, firstSlot: true } })] })).toEqual([]);
  });

  it('the joke habit takes no id', async () => {
    const h = (counter: Record<string, unknown>) => ({ id: 't_joke', counter, threshold: 3, fallback: 'AUTHOR TO WRITE: {name} jokes.', description: 'AUTHOR TO WRITE: x' });
    expect(await loadWith({ habits: [h({ kind: 'joke' })] })).toEqual([]);
    expect((await loadWith({ habits: [h({ kind: 'joke', id: 'x' })] })).join('\n')).toMatch(/names none/);
  });

  it('no entry names the weather', () => {
    for (const e of reg.lifeEvents.values()) {
      expect(Object.keys((e.requires as object | undefined) ?? {}), String(e.id)).not.toContain('weather');
      expect(JSON.stringify(e), String(e.id)).not.toMatch(/"weather"/);
    }
    for (const p of reg.pastimes.values()) expect(Object.keys(p), String(p.id)).not.toContain('weather');
    const rain = reg.pastimes.get('rain_on_the_roof')!;
    expect(rain.requires).toBeUndefined();
    expect(rain.locations).toEqual(['roof']);
  });
});
