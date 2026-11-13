import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { readingFor } from '../../src/analysis/providers';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => resetKnowledgeRules());

const UNCERTAIN = 'What it changes stays uncertain until you choose.';

describe('decision option readings', () => {
  const read = (data: unknown) => {
    const { state } = hiddenFixture(reg);
    state.commander.socialStats.empathy = 4;
    const env: AnalyzeEnv = { registries: reg, state, settings: DEFAULT_SETTINGS };
    return readingFor(parseSubject('glossary:decision_option', JSON.stringify(data))!, env)?.lines ?? null;
  };

  it('explains requires and check, never effects', () => {
    const lines = read({ scale: 'major', requires: { stat: 'empathy', rank: 2 }, check: { stat: 'cunning', rank: 3 } })!;
    expect(lines).toEqual([
      'Requires [[empathy]] rank 2 (yours: 4)',
      'Check: [[cunning]] rank 3 — rolled when you choose; if it fails, only the costs remain.',
      '[[decision_major]]',
      UNCERTAIN,
    ]);
    const text = lines.join('\n');
    expect(text).not.toContain('SENTINEL_OPTION_EFFECT'); // the label of the open option in the fixture
    expect(text).not.toMatch(/\b77\b/); // its faction amount
    expect(text).not.toContain('party_stress');
  });

  it('an untagged option still says its effects are uncertain', () => {
    expect(read({})).toEqual([UNCERTAIN]);
    expect(read({ scale: 'minor' })).toEqual(['[[decision_minor]]', UNCERTAIN]);
  });

  it('malformed tags are ignored', () => {
    expect(read({ scale: 'huge', requires: { stat: 'nonsense', rank: 2 }, check: { stat: 'cunning' } })).toEqual([UNCERTAIN]);
  });

  it('is the same without a campaign? no reading, like every provider', () => {
    const env: AnalyzeEnv = { registries: reg, state: null, settings: DEFAULT_SETTINGS };
    expect(readingFor(parseSubject('glossary:decision_option', '{}')!, env)).toBeNull();
  });
});
