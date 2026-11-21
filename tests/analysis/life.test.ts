import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge, resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { analyzeProviders } from '../../src/analysis/providers';
import type { Registries } from '../../src/content/types';
import { applyLifeEvent } from '../../src/engine/life/events';
import { plainText, revealFact, writeLifeFact } from '../../src/engine/life/facts';
import { newLife } from '../../src/engine/life/state';
import type { HobbyEntry, LifeEventEntry, OpinionTopicEntry, PastimeEntry } from '../../src/engine/life/types';
import type { CampaignState, HobbyState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { analyze } from '../helpers/analyzeCoverage';
import '../../src/engine/actions/life';
import '../../src/engine/actions/memory';
import '../../src/engine/actions/scene';
import { endDay } from '../helpers/loyalty';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => resetKnowledgeRules());

const ANN = 'unit_ann';
const mine = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!;
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const take = (id: string, over: Partial<HobbyState> = {}): HobbyState => ({ id, skill: 47.31, interest: 63.17, state: 'active', since: 1, milestones: [], ...over });
const hobby = (id: string) => reg.hobbies.get(id) as unknown as HobbyEntry;
const topic = (id: string) => reg.opinionTopics.get(id) as unknown as OpinionTopicEntry;
const event = (pick: (e: LifeEventEntry) => boolean) => [...reg.lifeEvents.values()].find((e) => pick(e as unknown as LifeEventEntry)) as unknown as LifeEventEntry;

function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  return s;
}
const read = (s: CampaignState, address: string, ctx: Record<string, unknown> = { unitId: ANN }, raw = false) => analyze(address, env(s, raw), ctx).join('\n');

describe('a reading shows only what was told or voiced', () => {
  it('Knowledge.life is built from told and voiced items', () => {
    const s = world();
    const [p0, p1] = topic('corporations').positions.map((p) => p.id);
    mine(s).opinions = {
      corporations: { position: p1, strength: 'held', formedDay: 3, voicedDay: 20, history: [{ day: 30, from: p0, to: p1 }] },
      books: { position: topic('books').positions[0].id, strength: 'strong', formedDay: 3, text: 'SENTINEL-UNVOICED' },
    };
    const k = buildKnowledge(s, { ...DEFAULT_SETTINGS }).life(ANN, reg);
    expect(k.opinions.map((o) => o.topicId)).toEqual(['corporations']);
    expect(k.opinions[0].history).toEqual([plainText(topic('corporations').positions[0].description)]);
    expect(JSON.stringify(k)).not.toContain('SENTINEL-UNVOICED');
    expect(k.temperWords).toEqual({ talkativeness: 'terse', volatility: 'steady', humor: 'dry' });
    expect(k.mode).toBe('normal');
  });

  it('opinionTopics: her view when voiced, one neutral line when not (the same for "none" and "unvoiced")', () => {
    const s = world();
    mine(s).opinions = {
      corporations: { position: topic('corporations').positions[1].id, strength: 'held', formedDay: 3, voicedDay: 20, text: 'A ladder, dirty rungs.' },
      books: { position: topic('books').positions[0].id, strength: 'strong', formedDay: 3, text: 'SENTINEL-UNVOICED' },
    };
    expect(read(s, 'opinionTopics:corporations')).toContain('A ladder, dirty rungs.');
    const unvoiced = read(s, 'opinionTopics:books');
    expect(unvoiced).not.toContain('SENTINEL-UNVOICED');
    expect(unvoiced).toBe(read(s, 'opinionTopics:weapons')); // no opinion at all: the same line
  });

  it('hobbies: the told milestones and a word for how keen she is, no number, nothing untold', () => {
    const s = world();
    const ms = hobby('reading').milestones;
    mine(s).hobbies = [take('reading', { milestones: [ms[0].id, ms[1].id] })];
    const told = writeLifeFact(s, ANN, 'Ann read the first.', ['hobby', 'reading', ms[0].id], 1);
    revealFact(s, told.id);
    writeLifeFact(s, ANN, 'SENTINEL-UNTOLD-MILESTONE', ['hobby', 'reading', ms[1].id], 1);
    const text = read(s, 'hobbies:reading', { unitId: ANN }, true);
    expect(text).toContain('STEADY');
    expect(text).toContain(plainText(ms[0].line));
    expect(text).not.toContain(plainText(ms[1].line));
    expect(text).not.toContain('SENTINEL-UNTOLD-MILESTONE');
    expect(text).not.toMatch(/47|63/);
    expect(read(s, 'hobbies:chess')).toBe('Nothing she has shown yet.');
  });

  it('lifeEvents: the hub line only, for the event that stands, and nothing for what she keeps', () => {
    const s = world();
    const anyone = event((e) => e.share === 'anyone' && e.becomes === undefined);
    const keeps = event((e) => e.share === 'keeps' && e.keepsUnless === undefined && e.becomes === undefined);
    applyLifeEvent(s, reg, ANN, anyone, 40);
    applyLifeEvent(s, reg, ANN, keeps, 40);
    expect(read(s, `lifeEvents:${anyone.id}`)).toBe(plainText(anyone.hub));
    expect(read(s, `lifeEvents:${keeps.id}`)).toBe('');
    expect(read(s, `lifeEvents:${keeps.id}`)).not.toContain(plainText(keeps.description));
    expect(read(s, `lifeEvents:${anyone.id}`)).not.toContain(plainText(anyone.description));
    const later = { ...s, day: 44 };
    expect(read(later, `lifeEvents:${anyone.id}`)).toBe(''); // past the two days
  });

  it('pastimes: what it needs, from the entry (no state of hers)', () => {
    const s = world();
    const p = reg.pastimes.get('patch_each_other') as unknown as PastimeEntry;
    const text = read(s, 'pastimes:patch_each_other');
    expect(text).toContain('after a run');
    expect(text.toLowerCase()).toContain(p.slots[0]);
  });

  it('glossary:temperament shows her three words, through temperamentOf', () => {
    const s = world();
    mine(s).temperament = { talkativeness: 'silent', volatility: 'moody', humor: 'warm' };
    const text = read(s, 'glossary:temperament');
    expect(text).toContain('silent');
    expect(text).toContain('moody');
    expect(text).toContain('warm');
    expect(read(world(), 'glossary:temperament')).toContain('terse'); // the defaults
  });

  it('glossary:commander_hobby_skill shows words, for one hobby when asked', () => {
    const s = world();
    s.commander.hobbySkill = { tinkering: 35, reading: 70 };
    const all = read(s, 'glossary:commander_hobby_skill', {});
    expect(all).toContain('getting there');
    expect(all).toContain('good at it');
    expect(all).not.toMatch(/\b(35|70)\b/);
    expect(read(s, 'glossary:commander_hobby_skill', { hobbyId: 'reading' })).not.toContain('getting there');
    expect(read(world(), 'glossary:commander_hobby_skill', {})).toContain('Nothing yet');
  });

  it('the told news lists only what was told', () => {
    const s = world();
    const a = writeLifeFact(s, ANN, 'Ann: found a coin.', ['found_something'], 1);
    writeLifeFact(s, ANN, 'SENTINEL-UNTOLD', ['wrote_journal'], 1);
    revealFact(s, a.id);
    const text = read(s, 'glossary:life_events');
    expect(text).toContain('found a coin');
    expect(text).not.toContain('SENTINEL-UNTOLD');
  });
});

describe('the setting reading', () => {
  it('says the mode, and off for an old save', () => {
    const s = world();
    expect(read(s, 'glossary:setting_life_events', {})).toContain('normal');
    s.settings.lifeEvents = 'often';
    expect(read(s, 'glossary:setting_life_events', {})).toContain('often');
    const old = campaign(reg, 4);
    expect(read(old, 'glossary:setting_life_events', {})).toContain('off');
    expect(read(old, 'glossary:setting_life_events', {})).toContain('never turned them on');
  });

  it('every provider of her life is registered', () => {
    for (const key of ['opinionTopics', 'hobbies', 'lifeEvents', 'pastimes', 'glossary:temperament', 'glossary:setting_life_events', 'glossary:commander_hobby_skill']) {
      expect(analyzeProviders().has(key), key).toBe(true);
    }
  });
});

describe('what she has not told is never rendered', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

  it('no UI, toast, log, controller or provider code reads life_event or life_shared (their event ids name an event she has not told or keeps)', () => {
    const readers = files('src').filter((f) => !f.startsWith(join('src', 'engine', 'life')) && !f.endsWith(join('content', 'schemas.ts')));
    const found = readers.filter((f) => /['"]life_(event|shared)['"]/.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });

  it('a month of days off-screen writes no chronicle line, no ledger entry and nothing of an event into the player-facing log', () => {
    let s = campaign(reg, 4);
    s.world.clocks = [];
    s.settings.lifeEvents = 'often';
    s.life = newLife(13);
    for (let day = 0; day < 30; day++) s = endDay(s, reg);
    const events = [...reg.lifeEvents.values()] as unknown as LifeEventEntry[];
    const lifeFacts = s.memory.facts.filter((f) => f.tags.includes('life'));
    expect(lifeFacts.length).toBeGreaterThan(3); // the run did something
    const logged = s.memory.chronicle.map((e) => e.text).join('\n');
    for (const e of events) expect(logged, e.id).not.toContain(plainText(e.description));
    expect((s.ledger ?? []).map((l) => l.key).filter((k) => /life|hobby|news/.test(k))).toEqual([]);
    // what is written is hidden until told: not one of the untold facts is visible to a panel
    const k = buildKnowledge(s, { ...DEFAULT_SETTINGS }).life(ANN, reg);
    for (const f of lifeFacts.filter((x) => x.about.includes(ANN) && x.tags.includes('untold'))) expect(k.told).not.toContain(f.text);
  });
});
