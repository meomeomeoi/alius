import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/loyalty';
import { analyze } from '../helpers/analyzeCoverage';
import '../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const PRONOUN = /\b(he|him|his|himself)\b/i;

/** A run under way with one her-call logged; `marked` writes the mark on its mission. */
function underway(o: { outcome: 'good' | 'bad'; marked?: boolean; odds?: number }): CampaignState {
  const s = campaign(reg, 4);
  s.missions.active = [{
    id: 'm1', source: 'command', templateId: 'tpl_sweep', title: 'Sweep', brief: '', regionId: 'quarantine_d7', danger: 1, objective: { node: 'objective', condition: 'reach' },
    offeredDay: 1, rewardsTier: 'tier_1', failureEffects: [], status: 'active',
    ...(o.marked ? { decidedBy: { source: 'her_call' as const, unitId: ANN, nodeId: 'n0_0', witnessIds: [BEA] } } : {}),
  }];
  s.expedition = {
    id: 'exp1', missionId: 'm1', regionId: 'quarantine_d7', day: s.day, slots: 2, party: [ANN, BEA], formation: { front: [ANN], back: [BEA] }, supplies: 4,
    map: { layers: [], objectiveId: 'obj', nodes: {} }, at: 'n0_0', path: ['n0_0'], phase: 'travel', loot: [], log: [], hints: [], objectiveDone: false, reveal: 1,
    herCalls: [{ nodeId: 'n0_0', unitId: ANN, outcome: o.outcome, templateId: 'evt_hc_route', odds: o.odds ?? 0.65 }],
  };
  return s;
}

describe('glossary:her_call', () => {
  it('without raw values: who, what she did, how it went and what the mark means', () => {
    const lines = analyze('glossary:her_call', env(underway({ outcome: 'bad', marked: true })), { unitId: ANN, nodeId: 'n0_0', missionId: 'm1' }).join('\n');
    expect(lines).toContain('Ann');
    expect(lines).toMatch(/took the decision herself/);
    expect(lines).toMatch(/badly/);
    expect(lines).toMatch(/marked/i);
    expect(lines).toMatch(/oversight/i);
    expect(lines).not.toMatch(/Odds/);
    expect(lines).not.toMatch(/65/);
    expect(lines).not.toMatch(PRONOUN);
  });

  it('a good call is hers and marks nothing', () => {
    const lines = analyze('glossary:her_call', env(underway({ outcome: 'good' })), { unitId: ANN, nodeId: 'n0_0' }).join('\n');
    expect(lines).toMatch(/well/);
    expect(lines).not.toMatch(/marked/i);
    expect(lines).toMatch(/blames nobody|not blamed|no one is blamed/i);
  });

  it('with raw values on it adds the stored odds', () => {
    const lines = analyze('glossary:her_call', env(underway({ outcome: 'bad', marked: true, odds: 0.65 }), true), { unitId: ANN, nodeId: 'n0_0', missionId: 'm1' });
    expect(lines).toContain('Odds it would go well: 65%.');
  });

  it('reads the last report when no run is open, and nothing when nothing happened', () => {
    const s = underway({ outcome: 'bad' });
    s.lastExpedition = {
      id: 'rep_1', missionId: 'm1', missionTitle: 'Sweep', regionId: 'quarantine_d7', day: s.day, outcome: 'failed', party: [ANN], nodes: [], log: [], loot: [], injuries: [],
      deaths: [], breakdowns: [], acknowledged: false, debriefed: false, herCalls: s.expedition!.herCalls,
    };
    delete s.expedition;
    expect(analyze('glossary:her_call', env(s), { unitId: ANN, nodeId: 'n0_0' }).join('\n')).toMatch(/badly/);
    expect(analyze('glossary:her_call', env(campaign(reg, 4)), { unitId: ANN })).toEqual([]);
    expect(analyze('glossary:her_call', env(null), { unitId: ANN })).toEqual(['No campaign loaded.']);
  });
});

describe('glossary:ask_first', () => {
  it('says whether the order holds and since which day, and what it costs', () => {
    const s = campaign(reg, 4);
    s.power = { votes: { log: [], seq: 0 }, askFirst: { [ANN]: 3 } };
    const lines = analyze('glossary:ask_first', env(s), { unitId: ANN }).join('\n');
    expect(lines).toContain('Ann');
    expect(lines).toMatch(/since day 3/i);
    expect(lines).toMatch(/costs? (her )?Trust/i);
    expect(lines).toMatch(/lifting it is free/i);
    expect(lines).not.toMatch(PRONOUN);
    const none = analyze('glossary:ask_first', env(campaign(reg, 4)), { unitId: ANN }).join('\n');
    expect(none).toMatch(/no such order|not under|decides/i);
    expect(analyze('glossary:ask_first', env(null), { unitId: ANN })).toEqual(['No campaign loaded.']);
  });
});

describe('the scapegoat reading by source', () => {
  const withCase = (source?: 'her_call'): CampaignState => {
    const s = campaign(reg, 4);
    s.dilemmas = {
      seq: 1, open: {
        id: 'dl1', templateId: 'scapegoat_mission', scale: 'major', context: 'scapegoat', day: s.day, status: 'presented', attempts: 0, units: [ANN, BEA], beatId: 'b',
        subjectId: ANN, witnessIds: [BEA], ...(source ? { scapegoatSource: source } : {}),
      },
    };
    return s;
  };
  it('says "made the call herself in the field" for a her-call case and keeps the vote wording otherwise', () => {
    const her = analyze('glossary:scapegoat', env(withCase('her_call'))).join('\n');
    expect(her).toContain('Ann made the call herself in the field');
    expect(her).not.toContain("carried the squad's vote");
    const vote = analyze('glossary:scapegoat', env(withCase())).join('\n');
    expect(vote).toContain("Ann carried the squad's vote");
    expect(vote).not.toContain('herself');
  });
});
