import { beforeAll, describe, expect, it } from 'vitest';
import { buildPanelModel, type AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { commanderProfile } from '../../src/engine/commander/profile';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';
import { noPresence, setRecord, withStance } from '../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
  registerCoreProviders();
});

const A = 'unit_ann';
const B = 'unit_bea';
const env = (state: CampaignState | null, raw = false, r: Registries = reg): AnalyzeEnv => ({ registries: r, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const read = (s: CampaignState, address: string, raw = false, unitId = A, r: Registries = reg): string[] =>
  readingFor(parseSubject(address, JSON.stringify({ unitId }))!, env(s, raw, r))?.lines ?? [];
const impunity = (s: CampaignState, raw = false, unitId = A, r: Registries = reg) => read(s, 'glossary:impunity', raw, unitId, r);
/** Day 8: a week has passed, so a Leash nobody has used reads as a bluff (+8). */
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 8;
  return s;
};

describe('the impunity reading without raw values', () => {
  it('names the stance and the band, and has no digit anywhere', () => {
    const s = withStance(fresh(), reg, A, 'defiant_loyal');
    const lines = impunity(s);
    expect(lines[0]).toBe('Stance: Defiant-loyal');
    expect(lines[1]).toBe('Impunity: brazen');
    expect(lines.join('\n')).not.toMatch(/\d/);
  });

  it('the band follows the value: cowed, low, high, brazen', () => {
    const at = (record: number) => impunity(setRecord(fresh(), A, record))[1];
    expect(at(-30)).toBe('Impunity: cowed'); // 43 − 30 = 13
    expect(at(0)).toBe('Impunity: low'); // 43
    expect(at(10)).toBe('Impunity: high'); // 53
    expect(at(20)).toBe('Impunity: brazen'); // 63
  });

  it('one line per non-zero term, in words', () => {
    const s = fresh();
    s.squad[0].dispositionOffset = 1; // base 45: raises it
    setRecord(s, A, 12);
    s.leash.authorizationsLeft = 0; // 0 left and never used: an empty threat
    s.relations[A].stateId = 'dependent';
    setRecord(s, B, 40);
    const text = impunity(s).join('\n');
    expect(text).toContain('Disposition: raises it');
    expect(text).toContain('Record: she has been getting away with things');
    expect(text).toContain('The Leash: looks like an empty threat');
    expect(text).toContain('Dependency: she needs the commander');
    expect(text).toContain('Squad mood: the others are getting bolder');
    expect(text).not.toContain('Presence');
    expect(text).not.toContain('Leverage');
  });

  it('and the opposite words', () => {
    const s = fresh();
    s.squad[0].dispositionOffset = -1; // base 25
    setRecord(s, A, -9);
    s.leash.log.push({ no: 1, unitId: B, kind: 'compel', day: s.day, context: 'scene', outcome: 'done' });
    setRecord(s, B, -40);
    const text = impunity(s).join('\n');
    expect(text).toContain('Disposition: lowers it');
    expect(text).toContain('Record: she has been brought to heel');
    expect(text).toContain('The Leash: was used recently');
    expect(text).toContain('Squad mood: the others are careful');
    expect(text).not.toMatch(/\d/);
  });

  it("presence holds her back or invites it, by the commander's presence", () => {
    const s = fresh();
    s.relations[A].metDay = s.day;
    const withP = (n: number): Registries => ({ ...reg, presence: new Map([['p', { id: 'p', factor: 'archetype', key: commanderProfile(s).archetype, presence: n }]]) });
    expect(impunity(s, false, A, withP(10)).join('\n')).toContain("Presence: the commander's presence holds her back");
    expect(impunity(s, false, A, withP(-6)).join('\n')).toContain('Presence: the commander\'s presence invites it');
  });

  it('leverage: she holds something over the commander', () => {
    const s = fresh();
    s.relations[A].flags.push('knows_crime');
    expect(impunity(s).join('\n')).toContain('Leverage: she holds something over the commander');
  });

  it('a unit with nothing special says nothing about terms she does not have', () => {
    const lines = impunity(fresh());
    expect(lines.filter((l) => /^(Record|Dependency|Presence|Squad mood|Leverage|Disposition)/.test(l))).toEqual([]);
  });
});

describe('the impunity reading with raw values', () => {
  it('shows the value and each term with its number', () => {
    const s = setRecord(fresh(), A, 12);
    s.leash.authorizationsLeft = 0;
    const lines = impunity(s, true);
    expect(lines[0]).toBe('Stance: Open defiance'); // Trust 20, Impunity 35 + 12 + 18 = 65
    expect(lines[1]).toBe('Impunity: 65');
    expect(lines.join('\n')).toContain('Record: she has been getting away with things (+12)');
    expect(lines.join('\n')).toContain('The Leash: looks like an empty threat (+18)');
  });
});

describe('who has a reading', () => {
  it('a grunt has none, a dead unit and an unknown id neither, and no campaign says so', () => {
    const s = fresh();
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = structuredClone(s.relations[A]);
    expect(impunity(s, false, 'grunt_1')).toEqual([]);
    s.squad[1].status = 'dead';
    expect(impunity(s, false, B)).toEqual([]);
    expect(impunity(s, false, 'nobody')).toEqual([]);
    expect(readingFor(parseSubject('glossary:impunity', JSON.stringify({ unitId: A }))!, env(null))?.lines).toEqual(['No campaign loaded.']);
    expect(readingFor(parseSubject('glossary:impunity')!, env(s))).toBeNull(); // no unit given: nothing to read
  });

  it('the panel of the glossary entry carries the reading and the long text', () => {
    const s = fresh();
    const m = buildPanelModel(parseSubject('glossary:impunity', JSON.stringify({ unitId: A }))!, env(s));
    expect(m.missing).toBe(false);
    expect(m.reading?.lines[0]).toMatch(/^Stance: /);
    expect(typeof m.long).toBe('string');
  });
});

describe('the command stance panel', () => {
  it('a stance chip reads her stance and where Trust and Impunity put her, in words', () => {
    const s = withStance(fresh(), reg, A, 'fearful');
    const lines = read(s, 'commandStances:fearful');
    expect(lines.join('\n')).toContain('Her stance now: Fearful');
    expect(lines.join('\n')).toContain('Trust: low');
    expect(lines.join('\n')).toContain('Impunity: cowed');
    expect(lines.join('\n')).not.toMatch(/\d/);
  });

  it('with raw values the numbers appear', () => {
    const s = withStance(fresh(), reg, A, 'fearful');
    expect(read(s, 'commandStances:fearful', true).join('\n')).toContain('Impunity: 20');
  });

  it('the registry entry resolves with its description, and a link without a unit shows no reading', () => {
    const s = fresh();
    const m = buildPanelModel(parseSubject('commandStances:fearful')!, env(s));
    expect(m.missing).toBe(false);
    expect(m.text).toMatch(/Low Trust, low Impunity/);
    expect(m.reading).toBeNull();
  });

  it('a grunt has no reading here either', () => {
    const s = fresh();
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = structuredClone(s.relations[A]);
    expect(read(s, 'commandStances:fearful', false, 'grunt_1')).toEqual([]);
  });
});
