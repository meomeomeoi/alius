import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { answerProbe, pendingProbe, probeDayStep, probeQueueRoom, sceneProbe } from '../../../src/engine/dynamic/probes';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { TONES } from '../../../src/engine/dynamic/types';
import type { Frame, Inclination, ProfileStyle, Sensitivity } from '../../../src/engine/dynamic/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TONES as INTENT_TONES } from '../../../src/llm/calls/intentExtract';
import { campaign, ctxOf, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Gives `id` a practice (restraint, she enjoys leading it) with this inclination and primary style. */
function give(s: CampaignState, id: string, inclination: Inclination, style: ProfileStyle = 'cold'): void {
  unitOf(s, id).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: style }, audience: 'indifferent', inclination, fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
}
function world(opts: { units?: Array<[string, Inclination]>; holders?: 0 | 1 | 2 | 3 | 'any'; frequency?: 'rare' | 'normal' | 'often'; style?: ProfileStyle } = {}): CampaignState {
  const s = campaign(reg, 3);
  for (const [id, inc] of opts.units ?? [[ANN, 'eager']]) give(s, id, inc, opts.style);
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: opts.holders ?? 1, pace: 'normal', frequency: opts.frequency ?? 'normal', units: {} });
  s.day = 20;
  return s;
}
/** Ann has a block with a probe pending (`axis`), her hold at `hold`. */
function pending(over: { hold?: number; style?: ProfileStyle; sensitivity?: Sensitivity; frame?: Frame } = {}): CampaignState {
  const s = world({ style: over.style });
  const d = { ...blankDynamic(s.day), hold: over.hold ?? 10, frame: over.frame ?? 'equal' };
  d.probes = { pending: { axis: 'space', tier: 1, day: s.day }, lastDay: s.day, answers: [], issued: 1 };
  s.relations[ANN].dynamic = d;
  s.dynamic!.queue = [ANN];
  if (over.sensitivity !== undefined) s.dynamic!.setup.units[ANN] = { sensitivity: over.sensitivity };
  return s;
}
const holdOf = (s: CampaignState): number => dynamicOf(s, ANN)!.hold;
const answer = (s: CampaignState, response: Parameters<typeof answerProbe>[3], weight: 1 | 0.5 = 1, tone?: Parameters<typeof answerProbe>[4]) => answerProbe(s, { registries: reg }, ANN, response, tone, weight);
function impunity(s: CampaignState, id: string, target: number): void {
  s.relations[id].impunityRecord = 0;
  s.relations[id].impunityRecord = target - impunityOf(s, reg, id)!.value;
  expect(impunityOf(s, reg, id)!.value).toBe(target);
}
/** `days` fresh days, each rolled on its own copy of `s` from one seeded stream; the share of days that issued a probe. */
function share(s: CampaignState, days: number): number {
  const rng = new Rng(seedRng(5));
  let n = 0;
  for (let i = 0; i < days; i++) {
    const d = structuredClone(s);
    if (probeDayStep(d, { registries: reg, rng }).some((e) => e.type === 'probe_issued')) n++;
  }
  return n / days;
}

describe('the daily chance', () => {
  it('an eager unit on interest probes about 30 % of days', () => {
    const p = share(world(), 200);
    expect(p).toBeGreaterThanOrEqual(0.25);
    expect(p).toBeLessThanOrEqual(0.35);
    const s = world();
    const events = probeDayStep(s, ctxOf(s, reg));
    // the first day of the stream may or may not roll; a probe, when it comes, is tier 1 on interest and starts her block
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const d = world();
      const issued = probeDayStep(d, { registries: reg, rng: new Rng(seedRng(seed)) }).find((e) => e.type === 'probe_issued');
      if (issued !== undefined) {
        expect(issued).toMatchObject({ unitId: ANN, tier: 1 });
        expect(dynamicOf(d, ANN)!.probes.pending).toMatchObject({ tier: 1, day: 20 });
        expect(dynamicOf(d, ANN)!.probes.issued).toBe(1);
        expect(d.dynamic!.queue).toEqual([ANN]);
      }
    }
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it('frequency scales the chance (rare about half, often about 1.6 times)', () => {
    const normal = share(world(), 400);
    expect(share(world({ frequency: 'rare' }), 400)).toBeLessThan(normal * 0.75);
    expect(share(world({ frequency: 'often' }), 400)).toBeGreaterThan(normal * 1.3);
  });

  it('none never probes; latent only with a cause (Impunity 45 probes, 30 never)', () => {
    expect(share(world({ units: [[ANN, 'none']] }), 100)).toBe(0);
    const high = world({ units: [[ANN, 'latent']] });
    impunity(high, ANN, 45);
    expect(share(high, 400)).toBeGreaterThan(0);
    const low = world({ units: [[ANN, 'latent']] });
    impunity(low, ANN, 30);
    expect(share(low, 200)).toBe(0);
  });

  it('latent also probes when she knows a dynamic and is drawn to seeing one', () => {
    const s = world({ units: [[ANN, 'latent']] });
    impunity(s, ANN, 30);
    unitOf(s, ANN).bond!.practice!.categories.restraint.witness = 'drawn';
    s.dynamic!.knowledge[ANN] = { [BEA]: { suspicion: 100, level: 'knows_dynamic', levelDay: 10 } };
    expect(share(s, 400)).toBeGreaterThan(0);
  });

  it('a unit at play, a backed-off unit and a unit whose probe is pending do not roll', () => {
    const play = world();
    play.relations[ANN].dynamic = { ...blankDynamic(20), frame: 'play', hold: 30 };
    expect(share(play, 100)).toBe(0);
    const off = world();
    off.relations[ANN].dynamic = blankDynamic(20);
    off.relations[ANN].dynamic!.probes.backoffUntil = 25;
    expect(share(off, 100)).toBe(0);
    expect(share(pending(), 100)).toBe(0);
  });
});

describe('the queue and the schedule', () => {
  it('at most cap units probe: cap 1, two eager units, only one is ever pending', () => {
    const s = world({ units: [[ANN, 'eager'], [BEA, 'eager']] });
    const rng = new Rng(seedRng(3));
    let issued = 0;
    for (let day = 20; day < 100; day++) {
      s.day = day;
      issued += probeDayStep(s, { registries: reg, rng }).filter((e) => e.type === 'probe_issued').length;
      const pend = [ANN, BEA].filter((id) => pendingProbe(s, id) !== undefined);
      expect(pend.length).toBeLessThanOrEqual(1);
      expect(s.dynamic!.queue.length).toBeLessThanOrEqual(1);
    }
    expect(issued).toBeGreaterThan(1);
  });

  it('the queue has room for the cap, and "any" counts as 3', () => {
    const s = world({ holders: 2 });
    expect(probeQueueRoom(s)).toBe(2);
    s.dynamic!.queue = [ANN];
    expect(probeQueueRoom(s)).toBe(1);
    expect(probeQueueRoom(world({ holders: 'any' }))).toBe(3);
  });

  it('a unit leaves the queue at play, after a back-off, or after 14 days without a probe', () => {
    const s = world({ units: [[ANN, 'none'], [BEA, 'none'], [CAT, 'none']] });
    for (const id of [ANN, BEA, CAT]) s.relations[id].dynamic = { ...blankDynamic(20), probes: { lastDay: 18, answers: [], issued: 1 } };
    s.dynamic!.queue = [ANN, BEA, CAT];
    s.relations[ANN].dynamic!.frame = 'play';
    s.relations[BEA].dynamic!.probes.backoffUntil = 30;
    s.relations[CAT].dynamic!.probes.lastDay = 5;
    probeDayStep(s, ctxOf(s, reg));
    expect(s.dynamic!.queue).toEqual([]);
  });

  it('one a day: three eager units under "any" never issue two in one day, and a second call the same day issues none', () => {
    const s = world({ units: [[ANN, 'eager'], [BEA, 'eager'], [CAT, 'eager']], holders: 'any', frequency: 'often' });
    const rng = new Rng(seedRng(9));
    let total = 0;
    for (let day = 20; day < 80; day++) {
      s.day = day;
      const first = probeDayStep(s, { registries: reg, rng }).filter((e) => e.type === 'probe_issued').length;
      expect(first).toBeLessThanOrEqual(1);
      if (first === 1) {
        const before = JSON.stringify(rng.state);
        expect(probeDayStep(s, { registries: reg, rng })).toEqual([]);
        expect(JSON.stringify(rng.state)).toBe(before); // nothing is rolled once a probe came
      }
      total += first;
    }
    expect(total).toBeGreaterThan(3);
  });

  it('one a scene: with two pending probes among those present, the scene carries the first only', () => {
    const s = world({ units: [[ANN, 'eager'], [BEA, 'eager']], holders: 'any' });
    for (const [i, id] of [ANN, BEA].entries()) {
      s.relations[id].dynamic = { ...blankDynamic(20), probes: { pending: { axis: 'space', tier: 1, day: 19 + i }, lastDay: 19 + i, answers: [], issued: 1 } };
    }
    expect(sceneProbe(s, [BEA, ANN])).toMatchObject({ unitId: BEA });
    expect(sceneProbe(s, [CAT])).toBeUndefined();
  });

  it('the axis is hashed (no draw, whatever the rng) and avoids the last three', () => {
    const picks = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = world({ frequency: 'often' });
      s.relations[ANN].dynamic = { ...blankDynamic(20), recent: ['space', 'small_order', 'correction'] }; // tier 1: decision and waiting are left
      const rng = new Rng(seedRng(seed));
      const issued = probeDayStep(s, { registries: reg, rng }).find((e) => e.type === 'probe_issued');
      if (issued === undefined) continue;
      expect(['decision', 'waiting']).toContain(issued.axis);
      picks.add(String(issued.axis));
      // the same day, the same state: the same axis, whatever the stream
      const again = world({ frequency: 'often' });
      again.relations[ANN].dynamic = { ...blankDynamic(20), recent: ['space', 'small_order', 'correction'] };
      expect(probeDayStep(again, { registries: reg, rng: new Rng(seedRng(seed)) }).find((e) => e.type === 'probe_issued')?.axis).toBe(issued.axis);
    }
    expect(picks.size).toBeGreaterThan(0);
    const s = world();
    s.relations[ANN].dynamic = { ...blankDynamic(20), hold: 25, recent: ['touch', 'claim', 'space'] }; // testing: tier 2 opens
    for (let seed = 1; seed < 60; seed++) {
      const d = structuredClone(s);
      const e = probeDayStep(d, { registries: reg, rng: new Rng(seedRng(seed)) }).find((x) => x.type === 'probe_issued');
      if (e !== undefined) {
        expect(e.tier).toBe(2);
        expect(['touch', 'claim', 'space']).not.toContain(e.axis);
      }
    }
  });

  it('the axis and the order of the queue are spread over consecutive days, not stuck on one pick for weeks (review I8)', () => {
    const sure = { chance: () => true } as unknown as Rng;
    const longest = (xs: string[]): number => { let best = 1; let run = 1; for (let i = 1; i < xs.length; i++) { run = xs[i] === xs[i - 1] ? run + 1 : 1; best = Math.max(best, run); } return best; };
    // the order: three eager units, one probe a day (the first in the order), sixty days in a row
    const first: string[] = [];
    for (let day = 1; day <= 60; day++) {
      const s = world({ units: [[ANN, 'eager'], [BEA, 'eager'], [CAT, 'eager']], holders: 'any', frequency: 'often' });
      s.day = day;
      first.push(String(probeDayStep(s, { registries: reg, rng: sure }).find((e) => e.type === 'probe_issued')?.unitId));
    }
    for (const id of [ANN, BEA, CAT]) expect(first.filter((x) => x === id).length).toBeGreaterThanOrEqual(8);
    expect(longest(first)).toBeLessThanOrEqual(6);
    // the axis: one unit, nothing recent, sixty days in a row: every axis of the tier comes up and none sticks
    const axes: string[] = [];
    for (let day = 1; day <= 60; day++) {
      const s = world({ frequency: 'often' });
      s.day = day;
      axes.push(String(probeDayStep(s, { registries: reg, rng: sure }).find((e) => e.type === 'probe_issued')?.axis));
    }
    const tier1 = [...reg.probeAxes.values()].filter((a) => Number(a.tier) <= 1).map((a) => String(a.id));
    for (const id of tier1) expect(axes).toContain(id);
    expect(longest(axes)).toBeLessThanOrEqual(5);
  });

  it('recent keeps the axes she used, at most 8', () => {
    const s = world({ frequency: 'often' });
    const rng = new Rng(seedRng(2));
    for (let day = 20; day < 200; day++) {
      s.day = day;
      probeDayStep(s, { registries: reg, rng });
      const d = dynamicOf(s, ANN);
      if (d !== undefined) expect(d.recent.length).toBeLessThanOrEqual(8);
    }
    expect(dynamicOf(s, ANN)!.recent.length).toBeGreaterThan(3);
  });

  it('a pending probe lapses after 3 days', () => {
    const s = pending();
    s.day = 22;
    probeDayStep(s, ctxOf(s, reg));
    expect(pendingProbe(s, ANN)).toBeDefined();
    s.day = 23;
    probeDayStep(s, ctxOf(s, reg));
    expect(pendingProbe(s, ANN)).toBeUndefined();
  });

  it('no eligible unit: no draw', () => {
    const none = world({ units: [[ANN, 'none']] });
    const off = world();
    delete off.dynamic;
    const capped = world({ units: [[ANN, 'eager'], [BEA, 'eager']] });
    capped.dynamic!.queue = [BEA];
    capped.relations[BEA].dynamic = { ...blankDynamic(20), probes: { pending: { axis: 'space', tier: 1, day: 20 }, lastDay: 20, answers: [], issued: 1 } };
    const playing = world();
    playing.relations[ANN].dynamic = { ...blankDynamic(20), frame: 'play', hold: 30 };
    for (const s of [none, off, capped, playing]) {
      const before = structuredClone(s.rng);
      const ctx = ctxOf(s, reg);
      expect(probeDayStep(s, ctx)).toEqual([]);
      expect(ctx.rng.state).toEqual(before);
    }
  });
});

describe('answers', () => {
  it('answers move hold: yielded +4, returned +3 (playful +5), deflected -1, resisted -3', () => {
    const y = pending();
    answer(y, 'yielded');
    expect(holdOf(y)).toBe(14);
    const r = pending();
    answer(r, 'returned');
    expect(holdOf(r)).toBe(13);
    const pr = pending({ style: 'playful' });
    answer(pr, 'returned');
    expect(holdOf(pr)).toBe(15);
    const cr = pending({ style: 'cruel' });
    answer(cr, 'returned');
    expect(holdOf(cr)).toBe(15);
    const d = pending();
    answer(d, 'deflected');
    expect(holdOf(d)).toBe(9);
    const x = pending();
    answer(x, 'resisted');
    expect(holdOf(x)).toBe(7);
  });

  it('is scaled by her sensitivity: lively +6.4, sluggish +2', () => {
    const lively = pending({ sensitivity: 'lively' });
    answer(lively, 'yielded');
    expect(holdOf(lively)).toBeCloseTo(16.4, 6);
    const sluggish = pending({ sensitivity: 'sluggish' });
    answer(sluggish, 'yielded');
    expect(holdOf(sluggish)).toBeCloseTo(12, 6);
  });

  it('a probe answer closes the pending probe, records it and reports the hold', () => {
    const s = pending();
    const events = answer(s, 'yielded', 1, 'sincere');
    expect(pendingProbe(s, ANN)).toBeUndefined();
    expect(dynamicOf(s, ANN)!.probes.answers).toEqual(['yielded']);
    expect(events).toContainEqual({ type: 'hold_changed', unitId: ANN, from: 10, to: 14, cause: 'probe_yielded' });
  });

  it('an answer feeds her reading after the hold (the first gain is exact; a later one is scaled by how she reads the commander)', () => {
    const s = pending({ hold: 10 });
    answer(s, 'yielded', 1, 'sincere');
    expect(holdOf(s)).toBe(14);
    expect(dynamicOf(s, ANN)!.readOf.updates).toBe(1);
    expect(dynamicOf(s, ANN)!.readOf.r).toBeGreaterThan(0);
    const half = pending({ hold: 10 });
    answer(half, 'yielded', 0.5);
    expect(dynamicOf(half, ANN)!.readOf.r).toBeCloseTo(dynamicOf(s, ANN)!.readOf.r / 2, 3); // observed moves her reading half as far
    dynamicOf(s, ANN)!.probes.pending = { axis: 'touch', tier: 2, day: s.day };
    answer(s, 'yielded');
    expect(holdOf(s)).not.toBe(18); // her compatibility now counts
    expect(dynamicOf(s, ANN)!.readOf.updates).toBe(2);
  });

  it('observed counts half, closes nothing and records nothing', () => {
    const s = pending();
    answer(s, 'yielded', 0.5);
    expect(holdOf(s)).toBe(12);
    expect(pendingProbe(s, ANN)).toBeDefined();
    expect(dynamicOf(s, ANN)!.probes.answers).toEqual([]);
  });

  it('an answer without a pending probe does nothing (weight 1), and the dynamic off does nothing', () => {
    const s = pending();
    delete dynamicOf(s, ANN)!.probes.pending;
    expect(answer(s, 'yielded')).toEqual([]);
    expect(holdOf(s)).toBe(10);
    const off = pending();
    delete off.dynamic;
    expect(answer(off, 'yielded')).toEqual([]);
  });

  it('an observed gesture starts the dynamic of a unit who may hold', () => {
    const s = world();
    expect(dynamicOf(s, ANN)).toBeUndefined();
    const events = answer(s, 'yielded', 0.5);
    expect(events.map((e) => e.type)).toEqual(['dynamic_started', 'hold_changed']);
    expect(holdOf(s)).toBe(2);
    const none = world({ units: [[ANN, 'none']] });
    expect(answer(none, 'yielded', 0.5)).toEqual([]);
  });

  it('back-off: three deflections among the last five, she waits 14 days and leaves the queue', () => {
    const s = pending({ hold: 10 });
    const d = dynamicOf(s, ANN)!;
    d.probes.answers = ['yielded', 'deflected'];
    const sets = (): void => { d.probes.pending = { axis: 'space', tier: 1, day: s.day }; };
    answer(s, 'resisted');
    expect(d.probes.backoffUntil).toBeUndefined();
    sets();
    const events = answer(s, 'deflected');
    expect(d.probes.backoffUntil).toBe(s.day + 14);
    expect(events).toContainEqual({ type: 'probe_backoff', unitId: ANN, until: s.day + 14 });
    expect(s.dynamic!.queue).toEqual([]);
    expect(d.probes.answers).toEqual([]);
  });

  it('two deflections among five are not a back-off', () => {
    const s = pending();
    const d = dynamicOf(s, ANN)!;
    d.probes.answers = ['deflected', 'yielded', 'returned', 'yielded'];
    answer(s, 'deflected');
    expect(d.probes.backoffUntil).toBeUndefined();
    expect(d.probes.answers).toEqual(['deflected', 'yielded', 'returned', 'yielded', 'deflected']);
  });

  it('draws nothing', () => {
    const s = pending();
    const before = structuredClone(s.rng);
    answer(s, 'yielded');
    expect(s.rng).toEqual(before);
  });

  it('the tone list is the intent reader\'s', () => {
    expect([...TONES]).toEqual([...INTENT_TONES]);
  });
});
