import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildKnowledge, resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerSpecialProviders } from '../../src/analysis/providers/special';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import type { Intercepted } from '../../src/engine/special/state';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createSpecial, type SpecialDeps } from '../../src/special/controller';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { VOICE_OF } from '../../src/ui/voice/sources';
import { loadCore } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import { ANN, BEA, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => resetKnowledgeRules());

const x = (over: Partial<Intercepted> = {}): Intercepted => ({ id: 'fq1', unitId: ANN, day: 1, kind: 'stance', value: 'fearful', true: true, partial: false, text: 'SENTINEL_FREQ_TRUE', ...over });
const envOf = (state: CampaignState | null, showRawValues = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues } });
const read = (address: string, state: CampaignState | null, raw = false) => readingFor(parseSubject(address)!, envOf(state, raw));
const withLog = (log: Intercepted[]): CampaignState => {
  const s = specialCampaign(reg, 'secret_frequency');
  s.day = 3;
  s.special!.frequency!.intercepts = log;
  s.special!.frequency!.suspicion = { [ANN]: 71 };
  return s;
};

describe('the frequency readings', () => {
  it('the intercept reading shows counts, never truth, text or suspicion', () => {
    registerSpecialProviders();
    const s = withLog([x({ id: 'fq1', day: 3 }), x({ id: 'fq2', day: 3 }), x({ id: 'fq3', day: 1 })]);
    for (const raw of [false, true]) {
      const lines = read('glossary:frequency_intercept', s, raw)!.lines.join('\n');
      expect(lines).toMatch(/2 fragments today/);
      expect(lines).toMatch(/3 this week/);
      expect(lines).not.toMatch(/SENTINEL|\b71\b|\btrue\b|\bfalse\b|\breal\b/i);
    }
  });

  it('reads the same for all-true and all-false intercepts', () => {
    registerSpecialProviders();
    const real = withLog([x({ id: 'fq1', day: 3, true: true }), x({ id: 'fq2', day: 3, true: true })]);
    const fake = withLog([x({ id: 'fq1', day: 3, true: false }), x({ id: 'fq2', day: 3, true: false })]);
    expect(read('glossary:frequency_intercept', real)).toEqual(read('glossary:frequency_intercept', fake));
  });

  it('has no reading without the frequency state or without a campaign', () => {
    registerSpecialProviders();
    expect(read('glossary:frequency_intercept', specialCampaign(reg))).toBeNull();
    expect(read('glossary:frequency_intercept', null)).toEqual({ lines: ['No campaign loaded.'] }); // the registry's own answer, nothing of ours
  });

  it('a burned implant says so', () => {
    registerSpecialProviders();
    const s = withLog([]);
    s.special!.frequency!.burnedDay = 2;
    expect(read('glossary:frequency_intercept', s)!.lines.join(' ')).toMatch(/burned out/i);
    expect(read('glossary:burn_implant', s)!.lines.join(' ')).toMatch(/already burned/i);
    expect(read('glossary:burn_implant', withLog([]))!.lines.join(' ')).not.toMatch(/already burned/i);
  });

  it('the suspicion reading is the same whoever is suspicious: an unseen threat', () => {
    registerSpecialProviders();
    const a = read('glossary:frequency_suspicion', withLog([]));
    const quiet = withLog([]);
    quiet.special!.frequency!.suspicion = {};
    expect(read('glossary:frequency_suspicion', quiet)).toEqual(a);
    expect(a!.lines.join(' ')).toMatch(/An unseen threat/);
    expect(a!.lines.join(' ')).not.toMatch(/\d/);
  });
});

describe('the knowledge rule', () => {
  it('knows_frequency stays hidden until frequency_discovered has named her; the hidden fact never shows', () => {
    registerSpecialProviders();
    const s = withLog([]);
    s.relations[ANN].flags.push('knows_frequency');
    s.memory.facts.push({ id: 'ff1', about: [ANN], text: 'SENTINEL_FREQ_FACT', tags: ['frequency'], importance: 5, day: 3, knownBy: [ANN], hiddenFromCommander: true });
    s.special!.frequency!.factId = 'ff1';
    const k = () => buildKnowledge(s, DEFAULT_SETTINGS);
    expect(k().flagVisible('knows_frequency')).toBe(false);
    expect(k().flagVisible('trust')).toBe(true);
    expect(k().facts().map((f) => f.id)).not.toContain('ff1');
    s.special!.frequency!.discovered = [ANN];
    expect(k().flagVisible('knows_frequency')).toBe(true);
    expect(k().facts().map((f) => f.id)).not.toContain('ff1'); // the fact stays hidden: it waits for the trait
  });

  it('a unit who knows but is not yet announced keeps the flag hidden even when another was announced', () => {
    registerSpecialProviders();
    const s = withLog([]);
    s.relations[ANN].flags.push('knows_frequency');
    s.relations[BEA].flags.push('knows_frequency');
    s.special!.frequency!.discovered = [ANN];
    expect(buildKnowledge(s, DEFAULT_SETTINGS).flagVisible('knows_frequency')).toBe(false);
  });
});

describe('toasts', () => {
  function rig() {
    const s = specialCampaign(reg, 'secret_frequency');
    const h = worldHarness(reg, s);
    const notices: Array<{ kind: string; text: string; title: string }> = [];
    const cuts: string[] = [];
    const deps: SpecialDeps = {
      ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn(),
      notice: (kind, text, title) => { notices.push({ kind, text, title }); },
      cutIn: (text) => { cuts.push(text); },
    };
    return { special: createSpecial(deps), notices, cuts };
  }

  it('frequency_discovered: a toast and a cut-in that name her and nothing about truth', () => {
    const r = rig();
    r.special.onEvents([{ type: 'frequency_discovered', unitId: ANN }]);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toMatchObject({ kind: 'warn', title: 'FREQUENCY' });
    expect(r.notices[0].text).toContain('Ann');
    expect(r.notices[0].text).not.toMatch(/\b(he|him|his)\b/i);
    expect(r.cuts).toHaveLength(1);
  });

  it('implant_burned: a toast, no cut-in', () => {
    const r = rig();
    r.special.onEvents([{ type: 'implant_burned' }]);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].text).toMatch(/burned/i);
    expect(r.cuts).toEqual([]);
  });

  it('a unit that is gone is not named', () => {
    const r = rig();
    r.special.onEvents([{ type: 'frequency_discovered', unitId: 'unit_ghost' }]);
    expect(r.notices[0].text).not.toContain('unit_ghost');
  });

  it('the frequency speaks in the terminal voice', () => {
    expect(VOICE_OF.frequency).toBe('terminal');
  });
});
