import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { dispatch } from '../../../src/engine/dispatch';
import '../../../src/engine/actions/commander';
import { firstImpressionWeight } from '../../../src/engine/commander/presence';
import { daysKnown } from '../../../src/engine/commander/profile';
import { meets } from '../../../src/engine/relations/graph';
import { buildCampaign, headStartDays, isNewArrival, validateSetup, type SetupResult, type UnitSetup } from '../../../src/engine/setup';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const unit = (name: string, over: Partial<UnitSetup> = {}): UnitSetup => ({
  cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId: 'assault',
  signature: { templateId: 'sig_last_stand', name: 'Last Stand', description: 'She holds the line.' },
  defects: [{ id: 'echo_bleed', origin: 'Heard things.' }],
  values: { ...ZERO }, likes: [], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 }, ...over,
});
const result = (over: Partial<SetupResult> = {}): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: [unit('Ann'), unit('Bea'), unit('Cat')], ...over,
});
const OPTS = { desireBondDefects: false, seed: 7 };
const build = (r: SetupResult) => {
  const out = buildCampaign(r, reg, OPTS);
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};
const hs = (days: number, newArrivals: string[] = [], extra: Record<string, unknown> = {}) => ({ headStart: { days, newArrivals, ...extra } as never });

describe('TUNING.headStart', () => {
  it('holds the plan values', () => {
    expect(TUNING.headStart).toEqual({
      days: [0, 7, 14, 30], k: { 7: 0.5, 14: 0.8, 30: 1.2 }, spread: 3, trustCap: 55,
      crime: { 7: 0.25, 14: 0.4, 30: 0.6 }, crimeReactMult: 1.5, crimeCap: 0.9,
      moments: { 7: [1, 1], 14: [1, 2], 30: [2, 2] }, textMax: 240, chronicleMax: 600,
    });
  });
});

describe('validateSetup: the head start option', () => {
  const errs = (over: Partial<SetupResult>) => validateSetup(result(over), reg, OPTS);

  it('no option and days 0 are valid', () => {
    expect(errs({})).toEqual([]);
    expect(errs(hs(0))).toEqual([]);
    expect(errs(hs(14, ['bea.png']))).toEqual([]);
  });

  it('days must be 0, 7, 14 or 30', () => {
    const e = errs(hs(10));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/0, 7, 14 or 30/);
  });

  it('a new arrival must be a chosen card', () => {
    expect(errs(hs(7, ['zed.png'])).join('\n')).toMatch(/zed\.png/);
  });

  it('a new arrival is listed once', () => {
    expect(errs(hs(7, ['bea.png', 'bea.png'])).join('\n')).toMatch(/more than once|once/);
  });

  it('every unit new is refused', () => {
    const e = errs({ ...hs(7, ['ann.png', 'bea.png']), units: [unit('Ann'), unit('Bea')] });
    expect(e).toEqual(['A head start needs at least one soldier who already knows the commander']);
  });

  it('no units with a head start is refused', () => {
    expect(errs({ ...hs(7), units: [] })).toEqual(['A head start needs at least one soldier who already knows the commander']);
  });

  it('days 0 with new arrivals is refused', () => {
    expect(errs(hs(0, ['ann.png'])).join('\n')).toMatch(/new arrival/i);
  });

  it('dynamicUnderway must be a boolean or chosen cards', () => {
    expect(errs(hs(7, [], { dynamicUnderway: true }))).toEqual([]);
    expect(errs(hs(7, [], { dynamicUnderway: ['ann.png'] }))).toEqual([]);
    expect(errs(hs(7, [], { dynamicUnderway: ['zed.png'] })).join('\n')).toMatch(/zed\.png/);
    expect(errs(hs(7, [], { dynamicUnderway: 'yes' })).join('\n')).toMatch(/dynamicUnderway/);
  });
});

describe('headStartDays and isNewArrival', () => {
  it('read the option; absent means 0 and nobody new', () => {
    expect(headStartDays(result())).toBe(0);
    expect(headStartDays(result(hs(14)))).toBe(14);
    expect(isNewArrival(result(hs(14, ['bea.png'])), 'bea.png')).toBe(true);
    expect(isNewArrival(result(hs(14, ['bea.png'])), 'ann.png')).toBe(false);
    expect(isNewArrival(result(), 'ann.png')).toBe(false);
  });
});

describe('buildCampaign: the shifted acquaintance', () => {
  it('days 0 builds the same state as no head start', () => {
    expect(build(result(hs(0)))).toEqual(build(result()));
  });

  it('a known unit has met the commander N days ago', () => {
    const s = build(result(hs(14, ['cat.png'])));
    const rel = s.relations.unit_ann;
    expect(rel.metDay).toBe(-13);
    expect(rel.stateSince).toBe(-13);
    expect(s.day).toBe(1);
    expect(daysKnown(s, 'unit_ann')).toBe(14);
  });

  it('a new arrival has met the commander today', () => {
    const s = build(result(hs(14, ['cat.png'])));
    expect(s.relations.unit_cat.metDay).toBe(1);
    expect(s.relations.unit_cat.stateSince).toBe(1);
    expect(daysKnown(s, 'unit_cat')).toBe(0);
  });

  it('firstImpressionWeight falls with the days known', () => {
    const w30 = firstImpressionWeight(build(result(hs(30, ['cat.png']))), 'unit_ann');
    const w0 = firstImpressionWeight(build(result()), 'unit_ann');
    expect(w30).toBeLessThan(w0);
  });
});

describe('readers of metDay and stateSince that assumed ≥ 1', () => {
  it('minDaysInState counts the skipped days', () => {
    const s = build(result());
    s.relations.unit_ann.stateSince = -2;
    expect(meets(s, reg, 'unit_ann', { minDaysInState: 3 })).toBe(true);
    s.relations.unit_ann.stateSince = 1;
    expect(meets(s, reg, 'unit_ann', { minDaysInState: 3 })).toBe(false);
  });

  it('commander/seed leaves a set metDay alone', () => {
    const s = build(result(hs(30, ['cat.png'])));
    expect(s.relations.unit_ann.metDay).toBe(-29);
    const r = dispatch(s, { type: 'commander/seed' } as never, reg);
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(r.state.relations.unit_ann.metDay).toBe(-29);
  });
});
