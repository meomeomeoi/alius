import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge, resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { recordRows } from '../../src/engine/craft/view';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, leaks } from '../helpers/analyze';
import { analyze } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => resetKnowledgeRules());

const ANN = 'unit_ann';
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });

describe('Knowledge.craft', () => {
  it('is empty without a campaign, and lists the disciplines as words without craft', () => {
    expect(buildKnowledge(null, DEFAULT_SETTINGS).craft(reg)).toEqual({ disciplines: [], pairs: [] });
    const v = buildKnowledge(campaign(reg, 3), DEFAULT_SETTINGS).craft(reg);
    expect(v.disciplines.map((d) => d.key)).toEqual(['stillness', 'posture', 'rhythm', 'memory', 'composure', 'speech', 'pain', 'endurance:breath', 'endurance:weight', 'endurance:saturation', 'endurance:jaw', 'endurance:gulp']);
    expect(v.disciplines.every((d) => d.word === 'untrained' && d.xp === undefined)).toBe(true);
    expect(v.pairs).toEqual([]);
  });

  it('holds no xp unless raw values are on, and never the pair\'s xp, the count, an unnamed signal or the point', () => {
    const { state } = hiddenFixture(reg);
    const off = buildKnowledge(state, DEFAULT_SETTINGS).craft(reg);
    expect(JSON.stringify(off)).not.toMatch(/183|271|119|211|\bxp\b|streak|slips|lesson|SENTINEL|stamp|answered/);
    expect(off.disciplines.find((d) => d.key === 'stillness')).toEqual({ key: 'stillness', word: 'steady' });
    const on = buildKnowledge(state, { ...DEFAULT_SETTINGS, showRawValues: true }).craft(reg);
    expect(on.disciplines.find((d) => d.key === 'stillness')).toEqual({ key: 'stillness', word: 'steady', xp: 183.5 });
    expect(JSON.stringify(on)).not.toMatch(/119|211|streak|slips|lesson|SENTINEL|stamp|answered/);
    const pair = off.pairs[0]!;
    expect(pair).toEqual({ unitId: state.squad[0].id, postures: ['kneeling_upright'], rhythm: 'practised', signals: ['tap2'], records: [{ key: 'weight', kind: 'noTap', seconds: 3600, day: 8 }, { key: 'weight', kind: 'clean', seconds: 1200, day: 8 }] });
  });

  it('a record: the kind that holds the longest time, and a lesser one only when it is lower and set', () => {
    expect(recordRows('weight', { longest: 600, clean: 600, noTap: 600, day: 3 })).toEqual([{ key: 'weight', kind: 'clean', seconds: 600, day: 3 }]);
    expect(recordRows('weight', { longest: 600, clean: 0, noTap: 600, day: 3 })).toEqual([{ key: 'weight', kind: 'noTap', seconds: 600, day: 3 }]);
    expect(recordRows('weight', { longest: 600, clean: 100, noTap: 200, day: 3 }).map((r) => [r.kind, r.seconds])).toEqual([['longest', 600], ['noTap', 200], ['clean', 100]]);
    expect(recordRows('weight', { longest: 0, clean: 0, noTap: 0, day: 3 })).toEqual([]);
  });

  it('a pair with nothing to show is not listed', () => {
    const s = campaign(reg, 3);
    s.relations[ANN].craft = { streak: { weight: 2 }, slips: [{ key: 'stillness', scene: 's1', day: 1 }] };
    expect(buildKnowledge(s, DEFAULT_SETTINGS).craft(reg).pairs).toEqual([]);
    s.relations[ANN].craft.signals = { stamp: { named: false, answered: 4, day: 1 } };
    expect(buildKnowledge(s, DEFAULT_SETTINGS).craft(reg).pairs).toEqual([]);
  });
});

describe('the craft readings', () => {
  it('glossary:craft gives each discipline as a word; the xp only with raw values', () => {
    const { state } = hiddenFixture(reg);
    const off = analyze('glossary:craft', env(state)).join(' ');
    expect(off).toContain('Stillness: steady.');
    expect(off).toContain('Posture: seasoned.');
    expect(off).toContain('Weight endurance: untrained.');
    expect(off).not.toMatch(/\d/);
    const on = analyze('glossary:craft', env(state, true)).join(' ');
    expect(on).toContain('Stillness: steady (183.5 xp).');
  });

  it('glossary:craft_<discipline> reads that discipline only, and a discipline nobody has trained says so', () => {
    const { state } = hiddenFixture(reg);
    expect(analyze('glossary:craft_stillness', env(state))).toEqual(['Stillness: steady.']);
    expect(analyze('glossary:craft_pain', env(state))).toEqual(['Pain: untrained.']);
    expect(analyze('glossary:craft_depth', env(state))).toEqual(['Depth: not practised yet.']);
    expect(analyze('glossary:craft_stillness', env(null))).toEqual(['No campaign loaded.']);
  });

  it('glossary:craft_record reads her records in fiction time, for the subject\'s unit or every pair', () => {
    const { state, unitId } = hiddenFixture(reg);
    const lines = analyze('glossary:craft_record', env(state), { unitId });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/day 8, 60 minutes weight, no taps\./);
    expect(lines[1]).toMatch(/day 8, 20 minutes weight, not a slip\./);
    expect(analyze('glossary:craft_record', env(state), { unitId: 'unit_nobody' })).toEqual(['No record yet.']);
    expect(analyze('glossary:craft_record', env(campaign(reg, 3)))).toEqual(['No record yet.']);
  });

  it('the endurance line of a hold reads through the same words', () => {
    const s = campaign(reg, 3);
    s.commander.endurance = { weight: { xp: 400, level: 5 } };
    expect(analyze('contactPhysics:weight', env(s)).join(' ')).toContain('Your endurance for this: masterful.');
  });

  it('no reading of the craft carries a sentinel, with raw values on or off', () => {
    for (const raw of [false, true]) {
      const { state, unitId, sentinels } = hiddenFixture(reg);
      const text = allReadings(env(state, raw), unitId);
      expect(leaks(text, { numbers: [], texts: sentinels.texts }), `raw ${raw}`).toEqual([]);
      if (!raw) expect(leaks(text, { numbers: [183.5, 271.3, 119.9, 211.7, 79, 89], texts: [] })).toEqual([]);
      else expect(leaks(text, { numbers: [119.9, 211.7, 79, 89], texts: [] })).toEqual([]);
      resetKnowledgeRules();
    }
  });

  it('no pronoun for the commander in a reading', () => {
    const { state, unitId } = hiddenFixture(reg);
    const text = ['glossary:craft', 'glossary:craft_record', 'glossary:craft_stillness'].flatMap((a) => analyze(a, env(state), { unitId })).join(' ');
    expect(text).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});
