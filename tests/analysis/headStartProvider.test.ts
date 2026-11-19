import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });

const build = (headStart?: { days: 7 | 14 | 30; newArrivals: string[] }): CampaignState => {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: ['Ann', 'Bea', 'Rhea'].map((n) => unitSetup(n)), ...(headStart ? { headStart } : {}),
  }, reg, { desireBondDefects: false, seed: 7 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};
const reading = (state: CampaignState | null): string[] => {
  const env: AnalyzeEnv = { registries: reg, state, settings: { ...DEFAULT_SETTINGS } };
  return readingFor(parseSubject('glossary:head_start')!, env)?.lines ?? [];
};

describe('the head start reading', () => {
  it('names the days and the new arrivals', () => {
    expect(reading(build({ days: 14, newArrivals: ['rhea.png'] }))).toEqual(['The squad has known the commander for 14 days.', 'New arrivals: Rhea.']);
    expect(reading(build({ days: 30, newArrivals: [] }))).toEqual(['The squad has known the commander for 30 days.']);
  });

  it('does not name a deserted new arrival', () => {
    const s = build({ days: 14, newArrivals: ['rhea.png'] });
    s.squad.find((u) => u.id === 'unit_rhea')!.status = 'deserted' as never;
    expect(reading(s)).toEqual(['The squad has known the commander for 14 days.']);
  });

  it('says there is none without a head start, and reads nothing of it without a campaign', () => {
    expect(reading(build())).toEqual(['No head start.']);
    expect(reading(null).join(' ')).not.toMatch(/known the commander|New arrivals/);
  });
});
