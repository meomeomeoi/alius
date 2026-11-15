import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { clearPowerDirectives, powerDirectives, refreshPowerDirectives } from '../../src/power/directives';
import { noteFeat } from '../../src/engine/power/outside';
import { campaign, endDay, loadCore } from '../helpers/loyalty';
import { withLeader } from '../helpers/power';

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

describe('the leader directives (P9b)', () => {
  const led = (opts: { endorsed?: boolean; inScene?: boolean } = {}): CampaignState => {
    const s = withLeader(campaign(reg, 4), ANN, { endorsed: opts.endorsed });
    if (opts.inScene) s.scene = { id: 'sc', participants: [ANN, BEA], mode: 'group', locationId: 'mess_hall', exchanges: 0 } as never;
    return s;
  };

  it('power:leader is set for a leader who is in the scene and tells the endorsement', () => {
    const s = led({ inScene: true });
    const d = powerDirectives(s, reg, [ANN, BEA]).find((x) => x.id === 'power:leader')!;
    expect(d).toMatchObject({ expiresAfter: 'scene', text: 'Ann is the one the squad looks to and speaks for the others.' });
    expect(powerDirectives(s, reg, [BEA]).some((x) => x.id === 'power:leader')).toBe(false);
    const e = powerDirectives(led({ endorsed: true, inScene: true }), reg, [ANN]).find((x) => x.id === 'power:leader')!;
    expect(e.text).toContain('The commander has formally made Ann second-in-command.');
  });

  it('power:outside is set while active (scene or not), tells the endorsement and is cleared on a feat', () => {
    const s = led();
    const out = powerDirectives(s, reg, []).find((x) => x.id === 'power:outside')!;
    expect(out).toMatchObject({ expiresAfter: 'manual', text: 'Outsiders (oversight officers, traders, enemy commanders) address Ann as the one who really runs the unit.' });
    expect(powerDirectives(led({ endorsed: true }), reg, []).find((x) => x.id === 'power:outside')!.text)
      .toBe("Oversight treats Ann as the commander's second-in-command; outsiders address both.");
    const b = new ContextBuilder();
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('address Ann as the one who really runs the unit');
    noteFeat(s, reg, 'negotiation');
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('really runs the unit');
    expect(powerDirectives(campaign(reg, 4), reg, []).some((x) => x.id === 'power:outside')).toBe(false);
  });

  it('refresh drops the challenge directive once no scene is open and keeps it while one is', () => {
    const s = led({ inScene: true });
    const b = new ContextBuilder();
    b.setDirective({ id: 'power:challenge', expiresAfter: 'scene', text: 'Ann has just lost a challenge.' });
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('Ann has just lost a challenge.');
    delete s.scene;
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('lost a challenge');
  });

  it('no text gives the commander a pronoun', () => {
    const texts = [...powerDirectives(led({ endorsed: true, inScene: true }), reg, [ANN]), ...powerDirectives(grudged(), reg, [ANN])].map((d) => d.text).join(' ');
    expect(texts.match(/\b(he|him|his|himself)\b/i)).toBeNull();
  });
});
