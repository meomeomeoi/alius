import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { bondsDayStep } from '../../../src/engine/bonds';
import { wantStep } from '../../../src/engine/bonds/want';
import { buildCombat } from '../../../src/engine/combat/build';
import { defaultFormation } from '../../../src/engine/combat/stats';
import type { StartPayload } from '../../../src/engine/combat/types';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { dynamicDayStep } from '../../../src/engine/dynamic/dayStep';
import { exchangeDayStep, protectionOf, satisfactionOf, wantGrowthMult } from '../../../src/engine/dynamic/exchange';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState, DesireLevel } from '../../../src/engine/state/types';
import { standingOf } from '../../../src/engine/power/standing';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, ctxOf, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const husk = { enemyId: 'husk', level: 1, affixes: [] as string[] };

const practice = (drive: 'low' | 'moderate' | 'high') => ({
  categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary: 'cold' as const },
  audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive,
});

/** Ann holds at `frame`; her desire is `desire` and she is a lover, so her Want runs; Bea and Cat have no practice. */
function world(opts: { frame?: Frame; drive?: 'low' | 'moderate' | 'high'; desire?: DesireLevel; holders?: 1 | 'any' } = {}): CampaignState {
  const s = campaign(reg, 3);
  s.day = 20;
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: opts.desire ?? 'high', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: practice(opts.drive ?? 'moderate'),
  };
  s.relations[ANN].stateId = 'lover';
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: opts.holders ?? 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: opts.frame ?? 'play', hold: 50 };
  return s;
}
const favour = (s: CampaignState, n: number): void => { s.relations[ANN].dynamic!.favour = n; };
const payloadOf = (s: CampaignState): StartPayload => ({ encounter: { enemies: [husk], danger: 1 }, formation: defaultFormation(s, reg, s.roster.activeIds) });
const combatOf = (s: CampaignState, unitId = ANN) => buildCombat(s, reg, new Rng(seedRng(9)), payloadOf(s)).combatants.find((c) => c.unitId === unitId)!;
const fromDynamic = (s: CampaignState, unitId = ANN) => combatOf(s, unitId).passives.filter((p) => p.source === 'dynamic').map((p) => ({ type: p.type, pct: (p as { pct?: number }).pct }));
const wantAfter = (s: CampaignState): number | undefined => {
  const d = structuredClone(s);
  bondsDayStep(d, ctxOf(d, reg));
  return d.relations[ANN].want;
};

describe('her satisfaction', () => {
  it('content at favour 5 with a calm Want, frustrated at favour -5, a refused day or an aching Want; neutral between', () => {
    const s = world();
    expect(satisfactionOf(s, reg, ANN)).toBe('neutral');
    favour(s, 5);
    expect(satisfactionOf(s, reg, ANN)).toBe('content');
    s.relations[ANN].want = 70; // aching: no longer content, and frustrated
    expect(satisfactionOf(s, reg, ANN)).toBe('frustrated');
    s.relations[ANN].want = 45; // restless: still content
    expect(satisfactionOf(s, reg, ANN)).toBe('content');
    s.relations[ANN].want = 0;
    favour(s, -5);
    expect(satisfactionOf(s, reg, ANN)).toBe('frustrated');
    favour(s, 0);
    s.relations[ANN].dynamic!.refusals = [s.day - 2];
    expect(satisfactionOf(s, reg, ANN)).toBe('frustrated');
    s.relations[ANN].dynamic!.refusals = [s.day - 3];
    expect(satisfactionOf(s, reg, ANN)).toBe('neutral');
  });

  it('is neutral with no dynamic, below the holders and with the dynamic off', () => {
    const s = world();
    favour(s, 10);
    expect(satisfactionOf(s, reg, BEA)).toBe('neutral'); // no dynamic of her own
    expect(satisfactionOf(world({ frame: 'equal' }), reg, ANN)).toBe('neutral');
    delete s.dynamic;
    expect(satisfactionOf(s, reg, ANN)).toBe('neutral');
  });
});

describe('combat', () => {
  it('content: outgoing +5 and incoming -5 in her combatant', () => {
    const s = world();
    favour(s, 6);
    expect(fromDynamic(s)).toEqual([{ type: 'outgoing', pct: 5 }, { type: 'incoming', pct: -5 }]);
  });

  it('frustrated: the reverse', () => {
    const s = world();
    favour(s, -6);
    expect(fromDynamic(s)).toEqual([{ type: 'outgoing', pct: -5 }, { type: 'incoming', pct: 5 }]);
  });

  it('neutral or no dynamic: no effect, and the combatant is the one a campaign without the dynamic builds', () => {
    const s = world();
    expect(fromDynamic(s)).toEqual([]);
    favour(s, 6);
    expect(fromDynamic(s, BEA)).toEqual([]); // only a holder's own combatant
    const off = structuredClone(s);
    delete off.dynamic;
    const plain = structuredClone(off);
    delete plain.relations[ANN].dynamic;
    expect(combatOf(off).passives).toEqual(combatOf(plain).passives);
    expect(combatOf(off).passives.some((p) => p.source === 'dynamic')).toBe(false);
  });
});

describe('protection', () => {
  /** Ann holds, Bea is the unit whose Impunity is read; Ann's standing is what the protection follows. */
  const withProtection = () => {
    const s = world();
    s.relations[BEA].impunityRecord = 30;
    return s;
  };

  it('lowers the other units\' positive Impunity by standing x 0.3 %, capped at 30 %', () => {
    const s = withProtection();
    const standing = standingOf(s, reg, ANN)!;
    expect(standing).toBeGreaterThan(0);
    const protection = protectionOf(s, reg);
    expect(protection).toBeCloseTo(Math.min(0.3, standing * 0.003), 10);
    const bare = structuredClone(s);
    delete bare.dynamic;
    const before = impunityOf(bare, reg, BEA)!;
    const after = impunityOf(s, reg, BEA)!;
    const positive = Object.entries(before.terms).filter(([, v]) => v > 0).reduce((sum, [, v]) => sum + v, 0);
    expect(after.terms.dynamic).toBe(-Math.round(protection * positive));
    expect(after.value).toBeLessThan(before.value);
  });

  it('is capped at 30 %: a huge standing protects no more', () => {
    const s = withProtection();
    s.power = { ...(s.power ?? {}), hierarchy: { standings: {}, endorsed: false, computedDay: s.day, standingBonus: { unitId: ANN, amount: 500, untilDay: s.day + 10 } } } as never;
    expect(standingOf(s, reg, ANN)).toBeGreaterThan(100);
    expect(protectionOf(s, reg)).toBe(0.3);
  });

  it('never protects a holder, is 0 with no holder at play, and is 0 with the dynamic off', () => {
    const s = withProtection();
    const bare = structuredClone(s);
    delete bare.dynamic;
    expect(impunityOf(s, reg, ANN)!.terms.dynamic).toBeUndefined(); // she is the holder
    expect(impunityOf(s, reg, ANN)!.value).toBe(impunityOf(bare, reg, ANN)!.value);
    expect(protectionOf(world({ frame: 'equal' }), reg)).toBe(0);
    expect(protectionOf(bare, reg)).toBe(0);
    expect(impunityOf(bare, reg, BEA)!.terms.dynamic).toBeUndefined();
  });
});

describe('squad stress', () => {
  /** Bea trusts the commander (50) and Cat does not (20); Ann is content or frustrated. */
  const squadWorld = (n: number) => {
    const s = world({ desire: 'low' });
    s.relations[BEA].trust = 50;
    s.relations[CAT].trust = 20;
    favour(s, n);
    unitOf(s, BEA).stress = 30;
    unitOf(s, CAT).stress = 30;
    return s;
  };
  const stepAt = (s: CampaignState, day: number): CampaignState => {
    const d = structuredClone(s);
    d.day = day;
    d.relations[ANN].dynamic!.lastPracticeDay = day; // no decay
    dynamicDayStep(d, ctxOf(d, reg));
    return d;
  };

  it('-1 every 2 days for units with Trust >= 50 toward a content holder', () => {
    const even = stepAt(squadWorld(8), 20);
    expect(unitOf(even, BEA).stress).toBe(29);
    expect(unitOf(even, CAT).stress).toBe(30);
    expect(unitOf(even, ANN).stress).toBe(unitOf(squadWorld(8), ANN).stress); // not her own
    expect(unitOf(stepAt(squadWorld(8), 21), BEA).stress).toBe(30); // an odd day
  });

  it('+1 for a frustrated holder, and nothing for a neutral one', () => {
    expect(unitOf(stepAt(squadWorld(-8), 20), BEA).stress).toBe(31);
    expect(unitOf(stepAt(squadWorld(0), 20), BEA).stress).toBe(30);
  });

  it('is nothing at stress 0, and the change is an event', () => {
    const s = squadWorld(8);
    unitOf(s, BEA).stress = 0;
    const d = structuredClone(s);
    expect(exchangeDayStep(d, reg)).toEqual([]);
    expect(unitOf(d, BEA).stress).toBe(0);
    const live = structuredClone(squadWorld(8));
    expect(exchangeDayStep(live, reg)).toEqual([{ type: 'stress_changed', unitId: BEA, delta: -1 }]);
  });
});

describe('drive and Want', () => {
  const noiseOf = (s: CampaignState): number => wantGrowthMult(s, reg, ANN);

  it('a high holder grows x1.4 and a low one x0.7 (the noise is hashed: the same on the same day)', () => {
    const high = world({ drive: 'high' });
    const low = world({ drive: 'low' });
    const mid = world({ drive: 'moderate' });
    for (const [s, base] of [[high, 1.4], [low, 0.7], [mid, 1]] as const) {
      const m = noiseOf(s);
      expect(m).toBeGreaterThanOrEqual(base * 0.8 - 1e-9);
      expect(m).toBeLessThanOrEqual(base * 1.2 + 1e-9);
      expect(noiseOf(s)).toBe(m); // same day, same number
    }
    const later = structuredClone(high);
    later.day = 21;
    expect(wantGrowthMult(later, reg, ANN)).not.toBe(noiseOf(high)); // another day, another noise
  });

  it('moody doubles the noise', () => {
    const steady = world({ drive: 'moderate' });
    const moody = structuredClone(steady);
    unitOf(moody, ANN).temperament = { talkativeness: 'terse', volatility: 'moody', humor: 'dry' };
    expect(Math.abs(noiseOf(moody) - 1)).toBeCloseTo(2 * Math.abs(noiseOf(steady) - 1), 10);
  });

  it('x1.3 on a content day or with a rival favoured today, x0.7 at stress 75, while injured or after a lost run', () => {
    const base = noiseOf(world());
    const content = world();
    favour(content, 6);
    expect(noiseOf(content)).toBeCloseTo(base * 1.3, 10);
    const jealous = world();
    jealous.relations[ANN].history.push({ day: jealous.day, kind: 'event', type: 'rival_favoured', severity: 'major' });
    expect(noiseOf(jealous)).toBeCloseTo(base * 1.3, 10);
    const stale = world();
    stale.relations[ANN].history.push({ day: stale.day - 1, kind: 'event', type: 'rival_favoured', severity: 'major' });
    expect(noiseOf(stale)).toBeCloseTo(base, 10);
    const rival = world();
    rival.personal = { ...(rival.personal ?? {}), bookings: [{ id: 'bk1', unitId: BEA, kindId: 'evening', day: rival.day, slot: 'evening', status: 'booked', source: 'roll' }] } as never;
    rival.relations[BEA].dynamic = { ...blankDynamic(rival.day), frame: 'role', hold: 50 };
    expect(noiseOf(rival)).toBeCloseTo(base * 1.3, 10);
    const stressed = world();
    unitOf(stressed, ANN).stress = 75;
    expect(noiseOf(stressed)).toBeCloseTo(base * 0.7, 10);
    const hurt = world();
    unitOf(hurt, ANN).status = 'injured';
    expect(noiseOf(hurt)).toBeCloseTo(base * 0.7, 10);
    const lost = world();
    lost.lastExpedition = { outcome: 'failed', day: lost.day } as never;
    expect(noiseOf(lost)).toBeCloseTo(base * 0.7, 10);
  });

  it('feeds the day step: high grows faster than low from the same Want', () => {
    // medium desire in a romantic state rises +4 a day; the multiplier scales it (rounded)
    const high = world({ drive: 'high', desire: 'medium' });
    const low = world({ drive: 'low', desire: 'medium' });
    const plain = world({ drive: 'moderate', desire: 'medium' });
    expect(wantAfter(high)!).toBeGreaterThan(wantAfter(low)!);
    expect(wantAfter(plain)).toBe(Math.round(4 * noiseOf(plain)));
  });

  it('is 1 with the dynamic off, with no practice section and with no holder frame needed: Want is unchanged', () => {
    const off = world({ drive: 'high', desire: 'medium' });
    delete off.dynamic;
    expect(wantGrowthMult(off, reg, ANN)).toBe(1);
    expect(wantAfter(off)).toBe(4);
    const noPractice = world({ drive: 'high', desire: 'medium' });
    delete unitOf(noPractice, ANN).bond!.practice;
    expect(wantGrowthMult(noPractice, reg, ANN)).toBe(1);
    expect(wantAfter(noPractice)).toBe(4);
    expect(wantGrowthMult(world(), reg, BEA)).toBe(1);
  });
});

describe('no rng draw', () => {
  it('none of satisfaction, protection, the combat effects, the stress step or the Want multiplier moves the rng', () => {
    const s = world();
    favour(s, 6);
    s.relations[BEA].trust = 60;
    const rng = new Rng(seedRng(3));
    const before = JSON.stringify(rng.state);
    satisfactionOf(s, reg, ANN);
    protectionOf(s, reg);
    impunityOf(s, reg, BEA);
    wantGrowthMult(s, reg, ANN);
    combatOf(s);
    expect(JSON.stringify(rng.state)).toBe(before);
    const d = structuredClone(s);
    d.day = 20;
    const ctx = { registries: reg, rng: new Rng(seedRng(3)) };
    const stateBefore = JSON.stringify(ctx.rng.state);
    // the exchange sub-step alone: the whole day step may draw (a claim, a probe) for a holder who is due one, and this one is none of its business
    exchangeDayStep(d, reg);
    wantStep(d, reg); // draws no rng by its own contract (the rest of the bonds step may)
    expect(JSON.stringify(ctx.rng.state)).toBe(stateBefore);
  });

  it('the tuning is where the spec puts it', () => {
    expect(TUNING.exchange.combatPct).toBe(5);
  });
});
