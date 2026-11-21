import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/life';
import '../../src/engine/actions/memory';
import '../../src/engine/actions/scene';
import { newLife } from '../../src/engine/life/state';
import type { CampaignState } from '../../src/engine/state/types';
import { endDay } from '../helpers/loyalty';
import { campaign, loadCore } from '../helpers/world';
import { runWeek } from '../helpers/unaffectedWeek';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** The state as the week left it, without the setting itself (an explicit `off` writes the key; nothing else may differ). */
const comparable = (s: CampaignState): unknown => {
  const c = structuredClone(s) as unknown as { settings: Record<string, unknown> };
  delete c.settings.lifeEvents;
  return c;
};

describe('her life is unaffected until it is turned on (Review Focus 1, acceptance 10)', () => {
  it('a seeded week with life off is byte-identical to a campaign built without the setting', () => {
    const plain = runWeek(reg);
    const off = runWeek(reg, { life: 'off' });
    expect(off.state.settings.lifeEvents).toBe('off'); // the helper really wrote it
    expect(off.state.life).toBeUndefined();
    expect(off.log).toEqual(plain.log);
    expect(off.rng).toEqual(plain.rng);
    expect(comparable(off.state)).toEqual(comparable(plain.state));
    expect(plain.state.life).toBeUndefined();
    expect(plain.log.some((l) => /life_|news_|hobby_|opinion_/.test(l))).toBe(false);
  });

  it('a seeded week with life on draws the same rng: state.rng is deep-equal to the run with it off', () => {
    const plain = runWeek(reg);
    for (const mode of ['rare', 'normal', 'often'] as const) {
      const on = runWeek(reg, { life: mode });
      expect(on.state.settings.lifeEvents, mode).toBe(mode);
      expect(on.state.life, mode).toBeDefined();
      expect(on.rng, mode).toEqual(plain.rng);
    }
  });

  it('life on does its work in that week without a draw: the same run is deterministic and writes only hidden facts', () => {
    const a = runWeek(reg, { life: 'often' });
    const b = runWeek(reg, { life: 'often' });
    expect(a.log).toEqual(b.log);
    expect(a.state.life).toEqual(b.state.life);
    expect(a.state.memory.facts.filter((x) => x.tags.includes('life')).length).toBeGreaterThan(0); // the week really did something
    // nothing of her days reaches the chronicle or the commander before it is told
    for (const f of a.state.memory.facts.filter((x) => x.tags.includes('life'))) expect(f.hiddenFromCommander === true || !f.tags.includes('untold')).toBe(true);
  });

  it('a squad of grunts only runs nothing', () => {
    let s = campaign(reg, 4);
    s.settings.lifeEvents = 'often';
    s.life = newLife(13);
    for (const u of s.squad) u.kind = 'grunt';
    for (let day = 0; day < 14; day++) s = endDay(s, reg);
    expect(s.memory.facts.filter((f) => f.tags.includes('life'))).toEqual([]);
    expect(s.life!.queue).toEqual([]);
    expect(s.life!.units).toEqual({});
    expect(s.life!.delivered).toEqual([]);
  });
});
