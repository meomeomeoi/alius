import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/warden';
import '../../../src/engine/actions/base';
import { addHold } from '../../../src/engine/dynamic/hold';
import { holderAgenda, holderSource, openOverrideOf, rollOverrides } from '../../../src/engine/dynamic/command';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { ProfileStyle } from '../../../src/engine/dynamic/types';
import { dispatch } from '../../../src/engine/dispatch';
import { Rng, seedRng } from '../../../src/engine/rng';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { fallbackAgenda, overrideChance, overrideOpen, rollOverride, wardenOf, type Expectation, type WardenOrder } from '../../../src/engine/warden';
import { OPEN_FIRST } from '../../../src/engine/warden/override';
import { campaign, errors, loadCore, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = (primary: ProfileStyle) => ({
  categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const,
  fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const,
});
/** The unit holds the command (a countermand domain) at `hold`. */
function holder(s: CampaignState, id: string, hold: number, style: ProfileStyle = 'possessive', domains: string[] = ['command']): CampaignState {
  s.dynamic ??= newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.content = { enabled: ['restraint'] };
  unitOf(s, id).bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: practice(style) };
  s.relations[id].dynamic = { ...blankDynamic(s.day), frame: 'rule', hold, domains: domains.map((d) => ({ id: d, since: 1 })) };
  s.relations[id].affinity = 0;
  return s;
}
/** A rng whose chances come from a queue (then `true`), and that records the probability it was asked. */
function queue(...answers: boolean[]) {
  const asked: number[] = [];
  const rng = { chance: (p: number): boolean => { asked.push(p); return answers.length > 0 ? answers.shift()! : true; }, float: () => 0, int: (a: number) => a };
  return { asked, ctx: { registries: reg, rng: rng as unknown as Rng } };
}
const withBea: WardenOrder = { kind: 'activity', activityId: 'train', companionId: BEA };

/** A LEASHSWAP campaign (Bea holds the leash) with a keep_me_close agenda. */
function swap(weight = 0.5): CampaignState {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat', 'Dee'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 7 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  const w = wardenOf(r.state)!;
  w.expectations = [{ id: 'e1', kind: 'keep_me_close', weight, source: 'values', known: false }];
  w.satisfaction = 60;
  r.state.relations[w.unitId].affinity = 0;
  return r.state;
}
const trainWith = (companionId: string) => ({ type: 'activity/do', payload: { activityId: 'train', companionId } });

describe('the source', () => {
  it('a holder of the command has a source: hold is her authority, Affinity softens her', () => {
    const s = holder(campaign(reg, 4), ANN, 70);
    const src = holderSource(s, reg, ANN)!;
    expect(src).toMatchObject({ kind: 'holder', unitId: ANN, authority: 0.7, leniency: 1 });
    s.relations[ANN].affinity = 100;
    expect(holderSource(s, reg, ANN)!.leniency).toBe(0.5);
    s.relations[ANN].affinity = -40;
    expect(holderSource(s, reg, ANN)!.leniency).toBe(1);
    // no countermand, no source
    expect(holderSource(holder(campaign(reg, 4), ANN, 70, 'cold', ['private_time']), reg, ANN)).toBeNull();
    expect(holderSource(campaign(reg, 4), reg, ANN)).toBeNull();
  });

  it('holderAgenda equals fallbackAgenda plus the possessive pair', () => {
    const s = holder(campaign(reg, 4), ANN, 70, 'possessive');
    const base = fallbackAgenda(s, reg, ANN);
    const agenda = holderAgenda(s, reg, ANN);
    const pair = agenda.filter((x) => x.kind === 'keep_me_close' || x.kind === 'no_romance_with_others');
    expect(pair).toHaveLength(2);
    const top = Math.max(...base.map((x) => x.weight));
    for (const x of pair) { expect(x.weight).toBe(top); expect(x.known).toBe(true); }
    // everything the fallback had is still there, known to her
    for (const x of base.filter((b) => !pair.some((p) => p.kind === b.kind))) expect(agenda).toContainEqual({ ...x, known: true });
    expect(agenda.length).toBe(base.filter((b) => !pair.some((p) => p.kind === b.kind)).length + 2);
    // another style: the fallback alone
    const cold = holder(campaign(reg, 4), ANN, 70, 'cold');
    expect(holderAgenda(cold, reg, ANN)).toEqual(fallbackAgenda(cold, reg, ANN).map((x) => ({ ...x, known: true })));
    expect(new Set(holderAgenda(holder(campaign(reg, 4), ANN, 70, 'obsessive'), reg, ANN).filter((x) => x.kind === 'keep_me_close')).size).toBe(1);
  });
});

describe('the roll', () => {
  it('a holder overrides an activity that conflicts with keep_me_close, at weight x hold/100 x leniency x 2.0 capped at 0.9', () => {
    const s = holder(campaign(reg, 4), ANN, 70);
    const { ctx, asked } = queue(true);
    const events = rollOverrides(s, ctx as never, withBea, { payload: { activityId: 'train', companionId: BEA } });
    expect(events).not.toBeNull();
    expect(events![0]).toMatchObject({ type: 'warden_override', source: 'holder', unitId: ANN, context: 'base' });
    const source = holderSource(s, reg, ANN)!;
    const weight = source.expectations.find((x) => x.kind === 'keep_me_close')!.weight;
    expect(asked).toEqual([overrideChance(weight, source)]);
    expect(asked[0]).toBeCloseTo(Math.min(0.9, weight * 0.7 * 1 * 2));
    const open = s.dynamic!.override!;
    expect(open).toMatchObject({ id: 'dov1', unitId: ANN, order: withBea, weight, context: 'base', day: s.day, slot: s.slot, payload: { activityId: 'train', companionId: BEA } });
    expect(open.alternative).toEqual({ kind: 'activity', activityId: 'train', companionId: ANN });
    expect(open.altLabel).toContain('Ann');
    expect(s.dynamic!.overrideSeq).toBe(1);
    // at a high hold and weight the chance is capped
    const strong = holder(campaign(reg, 4), ANN, 100);
    const big = holderSource(strong, reg, ANN)!;
    expect(overrideChance(0.9, big)).toBe(0.9);
  });

  it('the holder\'s slot is state.dynamic.override and the warden\'s slot is untouched', () => {
    const s = holder(swap(), ANN, 70);
    const { ctx } = queue(false, true); // the warden's roll misses, the holder's hits
    const events = rollOverrides(s, ctx as never, { kind: 'activity', activityId: 'train', companionId: CAT });
    expect(events![0]).toMatchObject({ source: 'holder', unitId: ANN });
    expect(s.dynamic!.override!.unitId).toBe(ANN);
    expect(s.leashswap!.warden!.override).toBeUndefined();
    expect(s.leashswap!.warden!.overrideSeq).toBeUndefined();
    expect(overrideOpen(s)).toBe(s.dynamic!.override);
    expect(openOverrideOf(s)).toMatchObject({ source: 'holder', unitId: ANN, id: 'dov1' });
  });

  it('warden first, one open: her override stops the holders, and a holder cannot roll while hers waits', () => {
    const s = holder(swap(1), ANN, 70);
    const { ctx, asked } = queue(true);
    const events = rollOverrides(s, ctx as never, { kind: 'activity', activityId: 'train', companionId: CAT });
    expect(events![0]).toMatchObject({ type: 'warden_override', overrideId: 'ov1' });
    expect(asked).toHaveLength(1); // the holder never rolled
    expect(s.dynamic!.override).toBeUndefined();
    expect(openOverrideOf(s)).toMatchObject({ source: 'warden', unitId: BEA, id: 'ov1' });
    const source = holderSource(s, reg, ANN)!;
    expect(() => rollOverride(s, ctx as never, withBea, { source })).toThrow(OPEN_FIRST);
    expect(() => rollOverrides(s, ctx as never, withBea)).toThrow(OPEN_FIRST);
  });

  it('while a holder\'s override waits, no other roll is made: answer it first', () => {
    const s = holder(campaign(reg, 4), ANN, 70);
    const { ctx, asked } = queue(true);
    rollOverrides(s, ctx as never, withBea);
    asked.length = 0;
    expect(() => rollOverrides(s, ctx as never, { kind: 'roster', activeIds: [BEA] })).toThrow(/answer it first/);
    expect(asked).toEqual([]);
    // a stale one (another slot) is dropped, not refused
    s.slot = s.slot === 'morning' ? 'afternoon' : 'morning';
    expect(overrideOpen(s)).toBeNull();
    expect(() => rollOverrides(s, ctx as never, withBea)).not.toThrow();
  });

  it('no countermand, no roll; no conflict, no draw', () => {
    const noCap = holder(campaign(reg, 4), ANN, 70, 'possessive', ['private_time']);
    const a = queue(true);
    expect(rollOverrides(noCap, a.ctx as never, withBea)).toBeNull();
    expect(a.asked).toEqual([]);
    const fine = holder(campaign(reg, 4), ANN, 70);
    const b = queue(true);
    expect(rollOverrides(fine, b.ctx as never, { kind: 'activity', activityId: 'train', companionId: ANN })).toBeNull(); // with her: nothing to object to
    expect(b.asked).toEqual([]);
    // a real rng is left alone as well
    const rng = new Rng(seedRng(3));
    const before = rng.state;
    rollOverrides(fine, { registries: reg, rng } as never, { kind: 'activity', activityId: 'train', companionId: ANN });
    expect(rng.state).toEqual(before);
    // and the dynamic off: nothing, even with the capability on her list
    fine.dynamic!.setup.holders = 0;
    expect(rollOverrides(fine, b.ctx as never, withBea)).toBeNull();
    expect(b.asked).toEqual([]);
  });

  it('the holder with the highest hold rolls first', () => {
    const s = holder(holder(campaign(reg, 4), ANN, 50), BEA, 80);
    const { ctx } = queue(true);
    rollOverrides(s, ctx as never, { kind: 'activity', activityId: 'train', companionId: CAT });
    expect(s.dynamic!.override!.unitId).toBe(BEA);
    const t = holder(holder(campaign(reg, 4), ANN, 80), BEA, 50);
    rollOverrides(t, queue(true).ctx as never, { kind: 'activity', activityId: 'train', companionId: CAT });
    expect(t.dynamic!.override!.unitId).toBe(ANN);
    // the first override wins: the second holder does not roll
    const u = holder(holder(campaign(reg, 4), ANN, 80), BEA, 50);
    const q = queue(true);
    rollOverrides(u, q.ctx as never, { kind: 'activity', activityId: 'train', companionId: CAT });
    expect(q.asked).toHaveLength(1);
  });

  it('P13 unchanged: without a holder, rollOverrides is rollOverride', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = swap(1);
      const b = structuredClone(a);
      const ra = new Rng(seedRng(seed));
      const rb = new Rng(seedRng(seed));
      const order: WardenOrder = { kind: 'activity', activityId: 'train', companionId: CAT };
      const viaOne = rollOverride(a, { registries: reg, rng: ra } as never, order, { payload: { activityId: 'train' } });
      const viaMany = rollOverrides(b, { registries: reg, rng: rb } as never, order, { payload: { activityId: 'train' } });
      expect(viaMany).toEqual(viaOne);
      expect(b).toEqual(a);
      expect(rb.state).toEqual(ra.state);
    }
  });
});

describe('losing the command', () => {
  it('closes her open override (the band falls below owning)', () => {
    const s = holder(campaign(reg, 4), ANN, 70);
    s.relations[ANN].dynamic!.frame = 'role'; // the rule frame's floor would hold her at owning
    rollOverrides(s, queue(true).ctx as never, withBea);
    expect(s.dynamic!.override).toBeDefined();
    addHold(s, { registries: reg }, ANN, -15, 'decay'); // 55: below owning
    expect(s.relations[ANN].dynamic!.domains).toEqual([]);
    expect(s.dynamic!.override).toBeUndefined();
    expect(openOverrideOf(s)).toBeNull();
  });
});

describe('the hook sites', () => {
  it('an activity order is overridden by the holder: nothing runs and no slot is spent', () => {
    let hit: { state: CampaignState } | null = null;
    for (let seed = 1; seed <= 200 && hit === null; seed++) {
      const s = holder(campaign(reg, 4), ANN, 90);
      s.rng = seedRng(seed);
      const r = dispatch(s, trainWith(BEA), reg);
      if (r.state.dynamic?.override !== undefined) hit = r;
    }
    expect(hit).not.toBeNull();
    const after = hit!.state;
    const s0 = holder(campaign(reg, 4), ANN, 90);
    expect(after.slot).toBe(s0.slot);
    expect(after.day).toBe(s0.day);
    expect(after.dynamic!.override).toMatchObject({ id: 'dov1', unitId: ANN, context: 'base' });
    // another order is refused until it is answered
    const blocked = dispatch(after, trainWith(BEA), reg);
    expect(errors(blocked.events)[0]).toMatchObject({ message: expect.stringContaining('answer it first') });
  });

  it('a roster order is overridden the same way', () => {
    let hit: CampaignState | null = null;
    for (let seed = 1; seed <= 200 && hit === null; seed++) {
      const s = holder(campaign(reg, 4), ANN, 90);
      s.rng = seedRng(seed);
      const others = s.squad.filter((u) => u.id !== ANN && u.status === 'active').map((u) => u.id).slice(0, 2);
      const r = dispatch(s, { type: 'roster/set_active', payload: { activeIds: others } }, reg);
      if (r.state.dynamic?.override !== undefined) hit = r.state;
    }
    expect(hit).not.toBeNull();
    expect(hit!.dynamic!.override!.order.kind).toBe('roster');
  });

  it('without the dynamic, the hook sites behave as before', () => {
    const s = campaign(reg, 4);
    const r = dispatch(s, trainWith(BEA), reg);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dynamic).toBeUndefined();
  });
});
