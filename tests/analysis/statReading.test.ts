import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { readingFor } from '../../src/analysis/providers';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { unitStats } from '../../src/engine/combat/stats';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
let local: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
  const defects = new Map(reg.defects);
  defects.set('test_def', {
    id: 'test_def', name: 'Test', combat: {
      upside: [
        { type: 'stat', stat: 'atk', pct: 20, trigger: 'onStressThreshold', threshold: 50 },
        { type: 'stat', stat: 'all', pct: 5 },
        { type: 'outgoing', pct: 10 },
        { type: 'cp', amount: 1 },
      ],
      downside: [{ type: 'incoming', pct: 15, downside: true }, { type: 'stat', stat: 'spd', pct: -10, downside: true }],
    },
  });
  local = { ...reg, defects } as Registries;
});
afterEach(() => resetKnowledgeRules());

function geared(): CampaignState {
  const state = campaign(reg, 4);
  const unit = state.squad[0];
  unit.level = 4;
  unit.injuries = ['wound_a'];
  state.inventory.push(
    { uid: 'it_1', itemId: 'item_blade', rarity: 'standard', upgrade: 0, affixes: ['keen'] },
    { uid: 'it_2', itemId: 'upper_medium', rarity: 'standard', upgrade: 0, affixes: [] },
  );
  Object.assign(unit.equipment, { weapon: 'it_1', upper: 'it_2' });
  unit.defects.push({ id: 'test_def' });
  return state;
}

const read = (stat: string, state: CampaignState, unitId: string | null = 'unit_ann'): string[] | null => {
  const env: AnalyzeEnv = { registries: local, state, settings: DEFAULT_SETTINGS };
  const subject = parseSubject(`glossary:stat_${stat}`, unitId === null ? undefined : JSON.stringify({ unitId }));
  return readingFor(subject!, env)?.lines ?? null;
};

describe('stat readings', () => {
  it('lists base, level, gear and injury', () => {
    const state = geared();
    const lines = read('atk', state)!;
    const total = unitStats(state, local, state.squad[0]).atk;
    expect(lines[0]).toBe(`Ann: ATK ${total}`);
    expect(lines).toContain('Role base 24');
    expect(lines).toContain('Level 4 → 28');
    expect(lines.some((l) => l.startsWith('[[items:item_blade]] → '))).toBe(true);
    expect(lines).toContain(`Injuries ×1 → ${total}`);
    // the SPD reading lists the armor weight
    expect(read('spd', state)!.some((l) => l.startsWith('Armor weight → '))).toBe(true);
  });

  it("a defect's +20% ATK at Stress ≥ 50 is listed under In combat with its link", () => {
    const lines = read('atk', geared())!;
    const at = lines.indexOf('In combat:');
    expect(at).toBeGreaterThan(0);
    const combat = lines.slice(at + 1);
    expect(combat).toContain('+20% ATK at Stress ≥ 50 ([[defects:test_def]])');
    expect(combat).toContain('+5% all stats ([[defects:test_def]])');
    expect(combat).toContain('+10% damage dealt ([[defects:test_def]])');
    expect(combat.join('\n')).not.toContain('CP'); // a cp effect is not a stat effect
    expect(combat.join('\n')).not.toContain('damage taken'); // incoming belongs to DEF
  });

  it('other stats list only the effects that touch them', () => {
    const state = geared();
    const def = read('def', state)!.join('\n');
    expect(def).toContain('Downside: +15% damage taken ([[defects:test_def]])');
    expect(def).toContain('+5% all stats');
    expect(def).not.toContain('+20% ATK');
    const spd = read('spd', state)!.join('\n');
    expect(spd).toContain('Downside: −10% SPD ([[defects:test_def]])');
    // an affix effect carries its own link
    const crit = read('crit', state)!.join('\n');
    expect(crit).toContain('[[affixes:keen]]');
    expect(read('hp', state)!.join('\n')).toContain('+5% all stats');
  });

  it('no In combat block when nothing applies', () => {
    const state = campaign(reg, 4);
    expect(read('atk', state)!).not.toContain('In combat:');
  });

  it('an unknown unit or no unit id gives no reading', () => {
    const state = geared();
    expect(read('atk', state, 'unit_nobody')).toBeNull();
    expect(read('atk', state, null)).toBeNull();
  });
});
