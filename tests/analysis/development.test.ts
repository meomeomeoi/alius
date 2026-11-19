import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { buildPanelModel } from '../../src/analysis/model';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { ensureDevelopment } from '../../src/engine/development/state';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';
import { analyze } from '../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => resetKnowledgeRules());

const ANN = 'unit_ann';
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
function world(): CampaignState {
  const s = campaign(reg, 2);
  s.settings.characterDevelopment = 'normal';
  const u = s.squad.find((x) => x.id === ANN)!;
  u.values.mercy = 1;
  const dev = ensureDevelopment(u);
  dev.drift = { mercy: 1, autonomy: 1 };
  dev.moments = [
    { id: 'dm0', axis: 'value:mercy', from: '1', to: '2', reason: 'Weeks of small kindnesses.', day: 3, sceneId: 's1', shownDay: 4 },
    { id: 'dm1', axis: 'value:autonomy', from: '0', to: '1', reason: 'SENTINEL-UNSHOWN-MOMENT', day: 5 },
  ];
  dev.facts = [{ id: 'df0', text: 'She saves a seat.', kind: 'attitude', day: 3, source: 'review', sceneId: 's1', shownDay: 4 }, { id: 'df1', text: 'SENTINEL-UNSHOWN-FACT', kind: 'memory', day: 5, source: 'review' }];
  dev.acc = { 'value:mercy': 4.37 };
  return s;
}

describe('the development readings', () => {
  it('the axis reading shows words and the reason once shown, nothing before', () => {
    const lines = analyze('developmentAxes:value:mercy', env(world()), { unitId: ANN, axis: 'value:mercy' });
    expect(lines).toEqual(['Ann is more merciful than her file says.', 'Why: Weeks of small kindnesses.', 'It showed on day 4.']);
    expect(analyze('developmentAxes:value:autonomy', env(world()), { unitId: ANN, axis: 'value:autonomy' })).toEqual(['Nothing has changed here yet.']);
    expect(analyze('developmentAxes:value:mercy', env(world()), { unitId: ANN })).toEqual(['Ann: more merciful than her file says.']);
  });

  it('a held axis says so', () => {
    const s = world();
    s.squad[0].development!.held = ['value:mercy'];
    expect(analyze('developmentAxes:value:mercy', env(s), { unitId: ANN, axis: 'value:mercy' })).toContain('Held: it takes no further change.');
    expect(analyze('glossary:development_hold', env(s), { unitId: ANN })).toEqual(['Held: more merciful than her file says.']);
  });

  it('the panel resolves for a registry axis, a wildcard and the glossary', () => {
    for (const [address, ctx] of [['developmentAxes:value:mercy', { unitId: ANN, axis: 'value:mercy' }], ['developmentAxes:like:.any', { unitId: ANN, axis: 'like:tea' }], ['glossary:development_fact', { unitId: ANN }], ['glossary:habit', { unitId: ANN }]] as const) {
      const subject = parseSubject(address, JSON.stringify(ctx))!;
      expect(buildPanelModel(subject, env(world())).missing, address).toBe(false);
    }
  });

  it('the mode reading says "off" for an old save, and counts the soldiers who changed', () => {
    const old = campaign(reg, 2);
    expect(analyze('glossary:character_development', env(old))).toEqual(['Character development is off (this campaign never turned it on).', '0 soldiers have shown a change.']);
    expect(analyze('glossary:character_development', env(world()))).toEqual(['Character development is normal.', '1 soldier has shown a change.']);
  });

  it('the line and habit readings count what is shown', () => {
    expect(analyze('glossary:development_fact', env(world()), { unitId: ANN })).toEqual(['1 line of hers is shown.']);
    expect(analyze('glossary:habit', env(world()), { unitId: ANN })).toEqual(['No habit yet.']);
  });

  it('without a campaign there is no reading, and an unknown soldier has nothing', () => {
    expect(analyze('glossary:character_development', env(null))).toEqual(['No campaign loaded.']);
    expect(analyze('developmentAxes:value:mercy', env(world()), { unitId: 'nobody', axis: 'value:mercy' })).toEqual(['Nothing has changed here yet.']);
  });

  it('never shows an unshown line or an accumulator, with raw values on or off', () => {
    for (const raw of [false, true]) {
      const text = [
        ...analyze('developmentAxes:value:autonomy', env(world(), raw), { unitId: ANN, axis: 'value:autonomy' }),
        ...analyze('developmentAxes:value:mercy', env(world(), raw), { unitId: ANN }),
        ...analyze('glossary:development_fact', env(world(), raw), { unitId: ANN }),
      ].join('\n');
      expect(text).not.toContain('SENTINEL');
      expect(text).not.toContain('4.37');
    }
  });
});
