import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { readingFor } from '../../src/analysis/providers';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { addFact } from '../../src/engine/memory';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
const ANN = 'unit_ann';
const env = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS } });
const read = (address: string, state: CampaignState | null, ctx?: object): string[] =>
  readingFor(parseSubject(address, ctx ? JSON.stringify(ctx) : undefined)!, env(state))?.lines ?? [];

const world = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 12;
  for (let i = 0; i < 4; i++) addFact(s, { about: [ANN], text: `fact ${i}`, tags: [], importance: 3, day: 12, knownBy: [ANN] });
  s.memory.facts[0].pinned = true;
  addFact(s, { about: [ANN], text: 'hidden from the commander', tags: [], importance: 3, day: 12, knownBy: [ANN], hiddenFromCommander: true, spread: 'slow' });
  addFact(s, { about: [ANN], text: 'spreading', tags: [], importance: 3, day: 12, knownBy: [ANN], spread: 'fast' });
  s.memory.dossiers = { [ANN]: { own: 'a', shared: 'b', day: 11, folded: 6 } };
  return s;
};

describe('memory readings (P3b)', () => {
  it('the preset reading names the preset and its numbers', () => {
    expect(read('glossary:memory_preset', world()).join('\n')).toMatch(/Preset: normal/);
    expect(read('glossary:memory_preset', world()).join('\n')).toMatch(/160 facts/);
    const s = world();
    s.memory.config = { preset: 'long' };
    expect(read('glossary:memory_preset', s).join('\n')).toMatch(/Preset: long/);
    expect(read('glossary:memory_preset', null)).toEqual(['No campaign loaded.']); // the panel's own line: no provider runs without a campaign
  });

  it('the fill reading counts facts through Knowledge: a hidden fact is not there', () => {
    const text = read('glossary:memory_fill', world(), { part: 'facts' }).join('\n');
    expect(text).toMatch(/5 facts/); // 4 + the spreading one; the hidden one is not counted
    expect(text).toMatch(/1 pinned/);
    expect(text).not.toMatch(/6 facts/);
    expect(read('glossary:memory_fill', world(), { part: 'dossiers' }).join('\n')).toMatch(/1 dossier/);
    expect(read('glossary:memory_fill', world()).join('\n')).toMatch(/Facts kept/);
  });

  it('the budget reading compares the share with the cap', () => {
    const lines = read('glossary:memory_budget', world()).join('\n');
    expect(lines).toMatch(/550/);
    expect(lines).toMatch(/1600/);
  });

  it('the dossier reading is hers when asked for a unit, and says nothing was folded when so', () => {
    const lines = read('glossary:dossier', world(), { unitId: ANN }).join('\n');
    expect(lines).toMatch(/6 facts folded/);
    expect(read('glossary:dossier', world(), { unitId: 'unit_bea' }).join('\n')).toMatch(/nothing folded/i);
  });

  it('the rumor reading counts the rumors still spreading that the commander knows of', () => {
    const lines = read('glossary:squad_rumor', world()).join('\n');
    expect(lines).toMatch(/Rumor mode: told as it was/);
    expect(lines).toMatch(/1 rumor/); // the hidden one is not counted
  });

  it('the pinned and hidden-scenes readings', () => {
    expect(read('glossary:pinned_fact', world()).join('\n')).toMatch(/1 pinned/);
    const s = world();
    expect(read('glossary:hidden_scenes', s).join('\n')).toMatch(/off/i);
    s.memory.config = { preset: 'normal', hideScenesAfter: 2 };
    s.memory.hidden = [[0, 4], [6, 9]];
    expect(read('glossary:hidden_scenes', s).join('\n')).toMatch(/last 2/);
    expect(read('glossary:hidden_scenes', s).join('\n')).toMatch(/2 stretches|2 ranges/);
  });
});
