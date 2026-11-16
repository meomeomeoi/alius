import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge, resetKnowledgeRules } from '../../../src/analysis/knowledge';
import { registerMemoryProviders } from '../../../src/analysis/providers/memory';
import type { Registries } from '../../../src/content/types';
import { addFact } from '../../../src/engine/memory';
import { factLine, visibleToAll } from '../../../src/engine/memory/audience';
import type { CampaignState, Fact } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetKnowledgeRules());
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const COMMANDER_PRONOUN = /\b(he|him|his|himself|he's)\b/i;
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 10;
  return s;
};
const make = (s: CampaignState, over: Partial<Omit<Fact, 'id'>> = {}): Fact =>
  addFact(s, { about: [ANN], text: 'Ann keeps a letter.', tags: [], importance: 3, day: 10, knownBy: [ANN, BEA], ...over });

describe('visibleToAll', () => {
  it('a fact is visible only if all viewers know it', () => {
    expect(visibleToAll([ANN, BEA], [ANN])).toBe(true);
    expect(visibleToAll([ANN, BEA], [ANN, BEA])).toBe(true);
    expect(visibleToAll([ANN, BEA], [ANN, CAT])).toBe(false);
    expect(visibleToAll(['*'], [ANN, CAT])).toBe(true);
    expect(visibleToAll('*', [ANN, CAT])).toBe(true);
    expect(visibleToAll([ANN], [])).toBe(true);
  });
  it('an audience that was never recorded is LOG-only: nobody sees it', () => {
    expect(visibleToAll(undefined, [ANN])).toBe(false);
    expect(visibleToAll(undefined, [])).toBe(false);
  });
});

describe('factLine', () => {
  it('a heard fact is worded as a rumor; a seen one is plain', () => {
    const s = fresh();
    const f = make(s, { knownBy: [ANN, BEA, CAT] });
    expect(factLine(s, f, [ANN, BEA])).toBe('- Ann keeps a letter.');
    f.heard = { [BEA]: 11 };
    expect(factLine(s, f, [ANN])).toBe('- Ann keeps a letter.'); // she saw it
    expect(factLine(s, f, [ANN, BEA])).toBe('- (heard as a rumor) Ann keeps a letter.'); // one of them only heard it
    expect(factLine(s, f, [BEA])).toBe('- (heard as a rumor) Ann keeps a letter.');
  });

  it('the model retelling replaces the text for hearers only', () => {
    const s = fresh();
    const f = make(s, { knownBy: [ANN, BEA], rumor: { text: 'They say Ann writes letters at night.' } });
    f.heard = { [BEA]: 11 };
    expect(factLine(s, f, [ANN])).toBe('- Ann keeps a letter.');
    expect(factLine(s, f, [BEA])).toBe('- (heard as a rumor) They say Ann writes letters at night.');
    expect(factLine(s, f, [ANN, BEA])).toBe('- (heard as a rumor) They say Ann writes letters at night.');
  });

  it('a hidden fact is worded as unknown to the commander', () => {
    const s = fresh();
    const f = make(s, { knownBy: [ANN, BEA], hiddenFromCommander: true });
    expect(factLine(s, f, [ANN, BEA])).toBe('- Ann and Bea know (the commander does not): Ann keeps a letter; they do not tell the commander.');
    expect(factLine(s, f, [ANN])).toBe('- Ann knows (the commander does not): Ann keeps a letter; she does not tell the commander.');
    expect(factLine(s, f, [])).toBe('- Ann and Bea know (the commander does not): Ann keeps a letter; they do not tell the commander.'); // out of a scene: whoever knows it
  });

  it('no commander pronoun in the wording', () => {
    const s = fresh();
    const hidden = make(s, { knownBy: [ANN, BEA], hiddenFromCommander: true });
    const heard = make(s, { text: 'Bea sold her ration.', knownBy: [ANN, BEA] });
    heard.heard = { [BEA]: 11 };
    for (const line of [factLine(s, hidden, [ANN, BEA]), factLine(s, hidden, [ANN]), factLine(s, heard, [BEA])]) expect(line).not.toMatch(COMMANDER_PRONOUN);
  });
});

describe('the knowledge rule', () => {
  it('a hidden fact is never shown by Knowledge, and an ordinary one is', () => {
    registerMemoryProviders();
    const s = fresh();
    const hidden = make(s, { text: 'Ann knows a way out.', hiddenFromCommander: true });
    const open = make(s, { text: 'Bea won a bet.', about: [BEA] });
    const k = buildKnowledge(s, DEFAULT_SETTINGS);
    expect(k.factVisible(hidden)).toBe(false);
    expect(k.factVisible(open)).toBe(true);
    expect(k.facts().map((f) => f.id)).toEqual([open.id]);
  });
});
