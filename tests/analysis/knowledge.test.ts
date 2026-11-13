import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge, registerKnowledgeRule, resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetKnowledgeRules());

const off = DEFAULT_SETTINGS;
const on = { ...DEFAULT_SETTINGS, showRawValues: true };

describe('knowledge filter', () => {
  it('raw is null with raw values off', () => {
    const { state } = hiddenFixture(reg);
    const k = buildKnowledge(state, off);
    expect(k.showRaw).toBe(false);
    expect(k.raw(37)).toBeNull();
    const raw = buildKnowledge(state, on);
    expect(raw.showRaw).toBe(true);
    expect(raw.raw(37)).toBe('37');
    expect(raw.raw(-4)).toBe('-4');
  });

  it('a hidden clock is not visible', () => {
    const { state } = hiddenFixture(reg);
    state.world.clocks.push({ id: 'open_clock', label: 'Open', segments: 6, filled: 1, visibleToPlayer: true });
    const k = buildKnowledge(state, off);
    expect(k.clockVisible('secret_plan')).toBe(false);
    expect(k.clockVisible('open_clock')).toBe(true);
    expect(k.clockVisible('no_such_clock')).toBe(false);
  });

  it('a rule hides a fact from facts()', () => {
    const { state } = hiddenFixture(reg); // registers the rule that hides tag "sentinel"
    state.memory.facts.push({ id: 'f2', about: [], text: 'Plain fact.', tags: [], importance: 1, day: 8, knownBy: [] });
    const k = buildKnowledge(state, off);
    expect(k.facts().map((f) => f.text)).toEqual(['Plain fact.']);
    expect(k.factVisible(state.memory.facts[0])).toBe(false);
  });

  it('flags are visible unless a rule hides them', () => {
    const { state } = hiddenFixture(reg);
    expect(buildKnowledge(state, off).flagVisible('secret_flag')).toBe(true);
    registerKnowledgeRule({ flag: (id) => id !== 'secret_flag' });
    const k = buildKnowledge(state, off);
    expect(k.flagVisible('secret_flag')).toBe(false);
    expect(k.flagVisible('other')).toBe(true);
  });

  it('with no rules everything the commander knows is visible', () => {
    const { state } = hiddenFixture(reg);
    resetKnowledgeRules();
    expect(buildKnowledge(state, off).facts()).toHaveLength(state.memory.facts.length);
  });

  it('reset removes rules', () => {
    const { state } = hiddenFixture(reg);
    expect(buildKnowledge(state, off).facts().some((f) => f.tags.includes('sentinel'))).toBe(false);
    resetKnowledgeRules();
    expect(buildKnowledge(state, off).facts().some((f) => f.tags.includes('sentinel'))).toBe(true);
  });

  it('a rule that throws hides nothing and breaks nothing', () => {
    const { state } = hiddenFixture(reg);
    resetKnowledgeRules();
    registerKnowledgeRule({ fact: () => { throw new Error('boom'); } });
    expect(() => buildKnowledge(state, off).facts()).not.toThrow();
  });
});
