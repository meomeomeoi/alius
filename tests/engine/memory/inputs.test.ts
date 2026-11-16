import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { addFact } from '../../../src/engine/memory';
import { herDossier, herFacts, herJournal, publicRecent, vignetteMemory, worldDossier } from '../../../src/engine/memory/inputs';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 12;
  s.memory.dossiers = {
    [ANN]: { own: 'Ann keeps a letter.', shared: 'Ann is the squad sniper.', day: 11, folded: 6 },
    [BEA]: { own: 'BEA-OWN', shared: 'BEA-SHARED', day: 11, folded: 6 },
    '*': { own: 'WORLD-OWN', shared: 'The base was nearly lost.', day: 11, folded: 6 },
  };
  s.relations[ANN].history = [{ day: 11, kind: 'event', type: 'broke_promise', severity: 'major', detail: 'the medicine' }];
  return s;
};

describe('memory inputs for the calls outside a scene', () => {
  it('herDossier is her own and shared parts, and nothing of anybody else\'s', () => {
    const s = fresh();
    expect(herDossier(s, ANN)).toBe('Ann keeps a letter. Ann is the squad sniper.');
    expect(herDossier(s, ANN)).not.toContain('BEA');
    expect(herDossier(s, 'unit_cat')).toBe('');
    s.memory.dossiers![ANN].own = '';
    expect(herDossier(s, ANN)).toBe('Ann is the squad sniper.');
  });

  it('herJournal follows journalLines of the config, with evidence when asked', () => {
    const s = fresh();
    expect(herJournal(s, reg, ANN, true)).toEqual(["the commander broke a promise to her (day 11): 'the medicine'"]);
    expect(herJournal(s, reg, ANN, false)).toEqual(['the commander broke a promise to her (day 11)']);
    s.memory.config = { preset: 'custom', journalLines: 0 };
    expect(herJournal(s, reg, ANN, true)).toEqual([]);
  });

  it('herFacts asks for ceil(retrievalK / 2) of the facts she knows, and only those', () => {
    const s = fresh();
    for (let i = 0; i < 12; i++) addFact(s, { about: [ANN], text: `she knows ${i}`, tags: [], importance: 3, day: 12, knownBy: [ANN] });
    addFact(s, { about: [ANN], text: 'only Bea knows this', tags: [], importance: 5, day: 12, knownBy: [BEA] });
    const tags: string[] = [];
    expect(herFacts(s, ANN, tags)).toHaveLength(3); // normal: retrievalK 6
    expect(herFacts(s, ANN, tags).map((f) => f.text)).not.toContain('only Bea knows this');
    s.memory.config = { preset: 'short' };
    expect(herFacts(s, ANN, tags)).toHaveLength(3); // 5 → 3
    s.memory.config = { preset: 'long' };
    expect(herFacts(s, ANN, tags)).toHaveLength(4); // 8 → 4
  });

  it('the vignette gets two facts about her and her journal', () => {
    const s = fresh();
    for (let i = 0; i < 5; i++) addFact(s, { about: [ANN], text: `about Ann ${i}`, tags: [], importance: 3, day: 12, knownBy: [ANN] });
    addFact(s, { about: [BEA], text: 'about Bea only', tags: [], importance: 5, day: 12, knownBy: [BEA] });
    const lines = vignetteMemory(s, reg, ANN, []);
    expect(lines).toHaveLength(3);
    expect(lines.slice(0, 2).every((l) => l.startsWith('about Ann'))).toBe(true);
    expect(lines[2]).toBe('the commander broke a promise to her (day 11)'); // no evidence in a line the player reads
    expect(lines.join('\n')).not.toContain('Bea');
  });

  it('the director digest carries only public recent lines and the shared world dossier', () => {
    const s = fresh();
    s.memory.chronicle.push(
      { id: 'c1', kind: 'scene', day: 12, text: 'PRIVATE-LINE', audience: [ANN] },
      { id: 'c2', kind: 'scene', day: 12, text: 'old line without audience' },
      { id: 'c3', kind: 'day', day: 11, text: 'public line', audience: '*' },
    );
    expect(publicRecent(s)).toEqual(['Day 11: public line']);
    expect(worldDossier(s)).toBe('The base was nearly lost.');
    expect(worldDossier(campaign(reg, 4))).toBe('');
    expect(publicRecent(campaign(reg, 4))).toEqual([]);
  });
});
