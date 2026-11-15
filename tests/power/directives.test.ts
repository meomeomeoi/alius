import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { clearPowerDirectives, powerDirectives, refreshPowerDirectives } from '../../src/power/directives';
import { campaign, endDay, loadCore } from '../helpers/loyalty';
import '../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

const grudged = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources.supplies = 100;
  s.power = { votes: { log: [], seq: 0 }, grudges: { [ANN]: s.day, [BEA]: s.day } };
  return s;
};

describe('the grudge directive', () => {
  it('appears for a present overruled voter and is gone after the day end', () => {
    const s = grudged();
    const d = powerDirectives(s, reg, [ANN]);
    expect(d).toEqual([{
      id: `power:vote:${ANN}`, expiresAfter: 'scene',
      text: "Ann voted against the commander's decision and was overruled; she may push back openly.",
    }]);
    expect(powerDirectives(s, reg, [])).toEqual([]);
    expect(powerDirectives(s, reg, [ANN, BEA]).map((x) => x.id)).toEqual([`power:vote:${ANN}`, `power:vote:${BEA}`]);
    expect(powerDirectives(endDay(s, reg), reg, [ANN])).toEqual([]);
  });

  it('refreshPowerDirectives sets them for the open scene and drops the ones that no longer hold', () => {
    const s = grudged();
    s.scene = { id: 'sc', participants: [ANN], mode: 'private', locationId: 'mess_hall', exchanges: 0 } as never;
    const b = new ContextBuilder();
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain("Ann voted against the commander's decision");
    delete s.power!.grudges;
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('voted against');
    // the chat has no campaign: nothing left
    s.power = { votes: { log: [], seq: 0 }, grudges: { [ANN]: s.day } };
    refreshPowerDirectives(b, s, reg);
    clearPowerDirectives(b);
    expect(b.build(s, 5000).directives).not.toContain('voted against');
  });

  it('a save without power sets nothing', () => {
    const s = campaign(reg, 4);
    expect(powerDirectives(s, reg, [ANN])).toEqual([]);
  });

  it('no directive text gives the commander a pronoun', async () => {
    const text = await readFile('src/power/directives.ts', 'utf8');
    expect(text.match(/\b(he|him|his|himself|he's)\b/i)).toBeNull();
    const sample = powerDirectives(grudged(), reg, [ANN, BEA]).map((d) => d.text).join(' ');
    expect(sample.match(/\b(he|him|his|himself)\b/i)).toBeNull();
  });
});
