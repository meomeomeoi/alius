import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge, resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, leaks } from '../helpers/analyze';
import { analyze } from '../helpers/analyzeCoverage';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => resetKnowledgeRules());

const envOf = (state: AnalyzeEnv['state'], showRawValues = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues } });

describe('the warden readings', () => {
  it('satisfaction and defiance read as bands; numbers only with raw values on', () => {
    const { state } = hiddenFixture(reg);
    const quiet = analyze('glossary:warden_satisfaction', envOf(state)).join(' ');
    expect(quiet).toMatch(/wary/);
    expect(quiet).not.toContain('43');
    expect(analyze('glossary:warden_satisfaction', envOf(state, true)).join(' ')).toContain('43');
    const def = analyze('glossary:warden_defiance', envOf(state)).join(' ');
    expect(def).toMatch(/is low/);
    expect(def).not.toContain('47');
    expect(analyze('glossary:warden_defiance', envOf(state, true)).join(' ')).toContain('47');
  });

  it('an expectation reads only once it is known', () => {
    const { state } = hiddenFixture(reg);
    // x2 (meet_quota) is unknown, x3 (protect_squad) is known
    expect(analyze('wardenExpectations:warden_meet_quota', envOf(state))).toEqual([]);
    expect(analyze('wardenExpectations:warden_protect_squad', envOf(state)).join(' ')).toMatch(/low/);
  });

  it('no reading carries the unknown expectation, the suspicion or any sentinel', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    for (const raw of [false, true]) expect(leaks(allReadings(envOf(state, raw), unitId), { numbers: [], texts: sentinels.texts }), `raw ${raw}`).toEqual([]);
    expect(leaks(allReadings(envOf(state), unitId), { numbers: sentinels.numbers, texts: [] })).toEqual([]);
  });

  it('the knowledge rule hides a kompromat fact the commander has not found, and shows it once a dig reveals it', () => {
    const { state } = hiddenFixture(reg);
    const hidden = state.memory.facts.find((f) => f.id === 'fact_komp')!;
    const k = buildKnowledge(state, DEFAULT_SETTINGS);
    expect(k.factVisible(hidden)).toBe(false);
    delete hidden.hiddenFromCommander;
    expect(buildKnowledge(state, DEFAULT_SETTINGS).factVisible(hidden)).toBe(true);
  });

  it('the knowledge rule hides what the warden knows about an ally', () => {
    const { state } = hiddenFixture(reg);
    const k = buildKnowledge(state, DEFAULT_SETTINGS);
    expect(k.flagVisible('warden_knows_ally')).toBe(false);
    expect(k.flagVisible('warden_ally')).toBe(true);
  });

  it('no readings without a warden', () => {
    const { state } = hiddenFixture(reg);
    delete state.leashswap;
    expect(analyze('glossary:warden_satisfaction', envOf(state))).toEqual([]);
  });
});

describe('the intrigue and investigation readings', () => {
  it('intrigue says only that there is an unseen threat, whatever the suspicion', () => {
    const { state } = hiddenFixture(reg);
    const a = analyze('glossary:intrigue', envOf(state)).join(' ');
    expect(a).toContain('An unseen threat.');
    state.leashswap!.intrigue.suspicion = 3;
    expect(analyze('glossary:intrigue', envOf(state)).join(' ')).toBe(a); // the same words at 3 and at 67
    expect(a).not.toContain('67');
    expect(a).not.toMatch(/suspic/i);
  });

  it('kompromat counts only what the commander knows, and never a hidden fact', () => {
    const { state } = hiddenFixture(reg);
    const text = analyze('glossary:kompromat', envOf(state)).join(' ');
    expect(text).toContain('0 of 3 pieces');
    expect(text).not.toContain('SENTINEL_KOMPROMAT');
  });

  it('the hack reads its step and what is missing', () => {
    const { state } = hiddenFixture(reg);
    const text = analyze('glossary:implant_hack', envOf(state)).join(' ');
    expect(text).toContain('Step 0 of 3.');
    expect(text).toMatch(/The hack needs/);
  });

  it('the investigation reads as a band and an unseen threat; segments only with raw values on', async () => {
    const { startRemoval } = await import('../../src/engine/warden');
    const { Rng, seedRng } = await import('../../src/engine/rng');
    const { state } = hiddenFixture(reg);
    expect(analyze('glossary:investigation', envOf(state))).toEqual([]); // nobody is being investigated
    startRemoval(state, { registries: reg, rng: new Rng(seedRng(1)) }, 'hack');
    state.world.clocks.find((c) => c.id === 'investigation')!.filled = 6;
    const quiet = analyze('glossary:investigation', envOf(state)).join(' ');
    expect(quiet).toContain('An unseen threat.');
    expect(quiet).toContain('under way');
    expect(quiet).not.toMatch(/\b(6|10)\b/);
    expect(analyze('glossary:investigation', envOf(state, true)).join(' ')).toContain('Segments filled: 6.');
  });

  it('no verdict chance, report chance or co-sign chance reaches a warden reading, with raw values on or off', async () => {
    const { verdictChance, reportChance, cosignChance } = await import('../../src/engine/warden');
    const { state } = hiddenFixture(reg);
    const chances = [verdictChance(state, reg), reportChance(state, reg), cosignChance(state, reg, state.squad[0].id)];
    const keys = ['intrigue', 'kompromat', 'implant_hack', 'investigation', 'verdict', 'remote_control', 'leash_cosign', 'commander_leash', 'warden_satisfaction', 'warden_defiance', 'warden_override'];
    for (const raw of [false, true]) {
      const text = keys.flatMap((k) => analyze(`glossary:${k}`, envOf(state, raw))).join(' ');
      for (const c of chances) {
        expect(text, `raw ${raw}`).not.toContain(c.toFixed(2));
        expect(text, `raw ${raw}`).not.toMatch(new RegExp(`\\b${Math.round(c * 100)}\\s*%`));
      }
    }
  });
});
