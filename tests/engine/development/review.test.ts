import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import { bondOf } from '../../../src/engine/bonds/profile';
import { likesOf, dislikesOf, valuesOf } from '../../../src/engine/development/profile';
import {
  applyReview, eligibleAxes, fallbackReview, reviewCommitted, reviewDue, undoReview, validateReview, type ReviewValue,
} from '../../../src/engine/development/review';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import type { Appraisal, CampaignState, Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { enable, withBond } from '../../helpers/bonds';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea';
const unitOf = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const ap = (i: number): Appraisal => ({
  id: `ap${i}`, day: 1, kind: 'praised', target: 'her', role: 'subject', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', severity: 'moderate',
  subject: ANN, pushes: [], summary: 'subject · praised · Ann · wanted yes, harm none, outcome good',
});
/** ANN with three experiences waiting and the accumulators given; development on. */
function world(acc: Record<string, number> = {}, day = 8): CampaignState {
  const s = campaign(reg, 4);
  s.settings.characterDevelopment = 'normal';
  s.day = day;
  const dev = ensureDevelopment(unitOf(s));
  dev.acc = { ...acc };
  dev.pending = [ap(0), ap(1), ap(2)];
  dev.nextId = 3;
  unitOf(s).values.mercy = 1;
  return s;
}
const shift = (axis: string, direction: 'up' | 'down' = 'up', size: 'nudge' | 'step' = 'nudge', reason = 'because'): ReviewValue['shifts'][number] => ({ axis, direction, size, reason });
const review = (shifts: ReviewValue['shifts'], facts: ReviewValue['facts'] = []): ReviewValue => ({ shifts, facts });
const check = (s: CampaignState, v: ReviewValue, id = ANN) => validateReview(s, reg, id, v);

describe('reviewDue', () => {
  it('needs material, then time or a strong accumulator', () => {
    expect(reviewDue(world(), reg)).toBe(ANN); // 3 pending, day 8, no review yet
    const few = world();
    developmentOf(unitOf(few)).pending.length = 0;
    ensureDevelopment(unitOf(few)).pending = [ap(0), ap(1)];
    expect(reviewDue(few, reg)).toBeNull();
    expect(reviewDue(world({ 'value:mercy': 5 }, 3), reg)).toBe(ANN); // acc 5 on day 3
    expect(reviewDue(world({}, 3), reg)).toBeNull();
    const off = world();
    delete off.settings.characterDevelopment;
    expect(reviewDue(off, reg)).toBeNull();
  });

  it('slow waits 14 days, and a review resets the clock', () => {
    const s = world({}, 10);
    s.settings.characterDevelopment = 'slow';
    expect(reviewDue(s, reg)).toBeNull();
    s.day = 14;
    expect(reviewDue(s, reg)).toBe(ANN);
    ensureDevelopment(unitOf(s)).lastReview = 8;
    s.settings.characterDevelopment = 'normal';
    s.day = 14;
    expect(reviewDue(s, reg)).toBeNull();
    s.day = 15;
    expect(reviewDue(s, reg)).toBe(ANN);
  });

  it('the first in squad order wins, and a dead unit is skipped', () => {
    const s = world();
    const b = ensureDevelopment(unitOf(s, BEA));
    b.pending = [ap(0), ap(1), ap(2)];
    expect(reviewDue(s, reg)).toBe(ANN);
    unitOf(s).status = 'dead';
    expect(reviewDue(s, reg)).toBe(BEA);
  });
});

describe('eligibleAxes', () => {
  it('lists axes with a direction and a support band, never a number', () => {
    const s = world({ 'value:mercy': 1.5, 'value:autonomy': -3.5, 'value:ingroup': 0.5 });
    const list = eligibleAxes(s, reg, unitOf(s));
    expect(list).toEqual([
      { axis: 'value:mercy', direction: 'up', support: 'weak' },
      { axis: 'value:autonomy', direction: 'down', support: 'strong' },
    ]);
  });

  it('an anchored axis needs more for strong, and an axis at its cap is not offered that way', () => {
    const s = world({ 'value:mercy': 3.5, 'value:autonomy': 4 });
    ensureDevelopment(unitOf(s)).anchors = ['value:mercy'];
    ensureDevelopment(unitOf(s)).drift.autonomy = 2;
    const list = eligibleAxes(s, reg, unitOf(s));
    expect(list).toEqual([{ axis: 'value:mercy', direction: 'up', support: 'weak' }]);
  });
});

describe('validation drops', () => {
  it('a step on an anchored axis needs 1.5 times the support', () => {
    const s = world({ 'value:mercy': 3.5 });
    ensureDevelopment(unitOf(s)).anchors = ['value:mercy'];
    expect(check(s, review([shift('value:mercy', 'up', 'step')])).shifts).toEqual([]);
    ensureDevelopment(unitOf(s)).acc['value:mercy'] = 4.5;
    expect(check(s, review([shift('value:mercy', 'up', 'step')])).shifts).toHaveLength(1);
  });

  it('a shift against the accumulators is dropped, and so is one without support', () => {
    const s = world({ 'value:mercy': 2, 'value:autonomy': 0.5 });
    const r = check(s, review([shift('value:mercy', 'down'), shift('value:autonomy', 'up'), shift('value:ingroup', 'up')]));
    expect(r.shifts).toEqual([]);
    expect(r.dropped.map((d) => d.axis)).toEqual(['value:mercy', 'value:autonomy', 'value:ingroup']);
  });

  it('her own limits and publicity are never touched', () => {
    const s = world({ 'bond:own_limits': 5, 'bond:publicity': 5, 'bond:ownLimits': 5 });
    withBond(s, ANN, {});
    expect(check(s, review(['bond:own_limits', 'bond:publicity', 'bond:ownLimits'].map((a) => shift(a, 'up', 'step')))).shifts).toEqual([]);
  });

  it('a held axis is dropped', () => {
    const s = world({ 'value:mercy': 3 });
    ensureDevelopment(unitOf(s)).held = ['value:mercy'];
    expect(check(s, review([shift('value:mercy', 'up', 'step')])).shifts).toEqual([]);
  });

  it('a grunt takes no shifts and no facts', () => {
    const s = world();
    s.squad.push({ ...structuredClone(unitOf(s)), id: 'grunt_k_117', kind: 'grunt', designation: 'K-117' } as Unit);
    ensureDevelopment(unitOf(s, 'grunt_k_117')).acc = { 'value:mercy': 5 };
    const r = check(s, review([shift('value:mercy', 'up', 'step')], [{ text: 'She changed.', kind: 'attitude' }]), 'grunt_k_117');
    expect(r.shifts).toEqual([]);
    expect(r.facts).toEqual([]);
  });

  it('a nudge on a discrete axis is dropped; a step needs 3', () => {
    const s = world({ 'bond:desire': 2 });
    withBond(s, ANN, {});
    expect(check(s, review([shift('bond:desire', 'up', 'nudge')])).shifts).toEqual([]);
    expect(check(s, review([shift('bond:desire', 'up', 'step')])).shifts).toEqual([]);
    ensureDevelopment(unitOf(s)).acc['bond:desire'] = 3;
    expect(check(s, review([shift('bond:desire', 'up', 'step')])).shifts).toHaveLength(1);
  });

  it('a bond axis needs an imported bond', () => {
    const s = world({ 'bond:desire': 5 });
    expect(check(s, review([shift('bond:desire', 'up', 'step')])).shifts).toEqual([]);
  });

  it('a value at its cap is dropped', () => {
    const s = world({ 'value:mercy': 5 });
    ensureDevelopment(unitOf(s)).drift.mercy = TUNING.development.valueCap;
    expect(check(s, review([shift('value:mercy', 'up', 'step')])).shifts).toEqual([]);
    expect(check(s, review([shift('value:mercy', 'down', 'step')])).shifts).toEqual([]); // and no support that way
  });

  it('a like in a disabled category is dropped, in an enabled one it is kept', () => {
    const s = world({ 'like:restraint': 3.5, 'like:tea': 3.5 });
    const v = review([shift('like:restraint', 'up', 'step'), shift('like:tea', 'up', 'step')]);
    expect(check(s, v).shifts.map((x) => x.axis)).toEqual(['like:tea']);
    expect(check(enable(structuredClone(s), 'restraint'), v).shifts.map((x) => x.axis)).toEqual(['like:restraint', 'like:tea']);
    const limited = enable(structuredClone(s), 'restraint');
    withBond(limited, ANN, { ownLimits: { categories: ['restraint'] } });
    expect(check(limited, v).shifts.map((x) => x.axis)).toEqual(['like:tea']);
  });

  it('more than three shifts keep the first three', () => {
    const s = world({ 'value:mercy': 2, 'value:autonomy': 2, 'value:ingroup': 2, 'value:pragmatism': 2, 'value:corporate': 2 });
    const r = check(s, review(['mercy', 'autonomy', 'ingroup', 'pragmatism', 'corporate'].map((a) => shift(`value:${a}`))));
    expect(r.shifts.map((x) => x.axis)).toEqual(['value:mercy', 'value:autonomy', 'value:ingroup']);
  });

  it('repeats, long facts and more than three facts are cut', () => {
    const s = world({ 'value:mercy': 2 });
    const facts = Array.from({ length: 5 }, (_, i) => ({ text: `Fact ${i} ${'x'.repeat(200)}`, kind: 'attitude' as const }));
    const r = check(s, review([shift('value:mercy'), shift('value:mercy')], facts));
    expect(r.shifts).toHaveLength(1);
    expect(r.facts).toHaveLength(TUNING.development.maxFacts);
    expect(r.facts.every((f) => f.text.length <= TUNING.development.factTextMax)).toBe(true);
  });
});

describe('applying a review', () => {
  const apply = (s: CampaignState, v: ReviewValue, source: 'model' | 'fallback' = 'model') => {
    const r = run(s, reg, { type: 'development/review', payload: { unitId: ANN, review: v, source } });
    expect(errors(r.events)).toEqual([]);
    return r;
  };

  it('a nudge moves drift and consumes support (anchored: half)', () => {
    const r = apply(world({ 'value:mercy': 1.5 }), review([shift('value:mercy')]));
    expect(developmentOf(unitOf(r.state)).drift.mercy).toBeCloseTo(0.34);
    expect(developmentOf(unitOf(r.state)).acc['value:mercy']).toBeCloseTo(0.5);
    expect(ofType(r.events, 'development_shift')).toEqual([{ type: 'development_shift', unitId: ANN, axis: 'value:mercy', size: 'nudge' }]);
    expect(ofType(r.events, 'development_moment')).toEqual([]);
    const s = world({ 'value:mercy': 1.5 });
    ensureDevelopment(unitOf(s)).anchors = ['value:mercy'];
    expect(developmentOf(unitOf(apply(s, review([shift('value:mercy')])).state)).drift.mercy).toBeCloseTo(0.17);
  });

  it('the review closes the batch: pending cleared, the day kept, one event', () => {
    const r = apply(world({ 'value:mercy': 1.5 }), review([shift('value:mercy')], [{ text: 'She hums now.', kind: 'habit' }]));
    const dev = developmentOf(unitOf(r.state));
    expect(dev.pending).toEqual([]);
    expect(dev.lastReview).toBe(8);
    expect(ofType(r.events, 'development_review')).toEqual([{ type: 'development_review', unitId: ANN, source: 'model', shifts: 1, facts: 1 }]);
    expect(dev.facts).toMatchObject([{ id: 'df3', text: 'She hums now.', kind: 'habit', day: 8, source: 'review' }]);
    expect(ofType(r.events, 'development_fact')).toEqual([{ type: 'development_fact', unitId: ANN, factId: 'df3' }]);
    expect(reviewDue(r.state, reg)).toBeNull();
  });

  it('three nudges make a moment', () => {
    const s = world({ 'value:mercy': 3 });
    ensureDevelopment(unitOf(s)).drift.mercy = 0.68;
    const r = apply(s, review([shift('value:mercy')]));
    expect(valuesOf(unitOf(r.state)).mercy).toBe(2);
    expect(developmentOf(unitOf(r.state)).moments).toMatchObject([{ axis: 'value:mercy', from: '1', to: '2', day: 8 }]);
    expect(ofType(r.events, 'development_moment')).toHaveLength(1);
  });

  it('a value step goes to the next whole number', () => {
    const r = apply(world({ 'value:mercy': 3 }), review([shift('value:mercy', 'up', 'step')]));
    expect(developmentOf(unitOf(r.state)).drift.mercy).toBe(1);
    expect(developmentOf(unitOf(r.state)).acc['value:mercy']).toBeUndefined(); // 3 consumed
    expect(valuesOf(unitOf(r.state)).mercy).toBe(2);
    const down = apply(world({ 'value:autonomy': -3.5 }), review([shift('value:autonomy', 'down', 'step')]));
    expect(developmentOf(unitOf(down.state)).drift.autonomy).toBe(-1);
    expect(developmentOf(unitOf(down.state)).acc['value:autonomy']).toBeCloseTo(-0.5);
  });

  it('a discrete step moves one place and writes a moment', () => {
    const s = world({ 'bond:desire': 3 });
    withBond(s, ANN, {});
    const r = apply(s, review([shift('bond:desire', 'up', 'step')]));
    expect(bondOf(unitOf(r.state))!.desire).toBe('medium');
    expect(unitOf(r.state).bond!.desire).toBe('low'); // the import stays as it was
    expect(developmentOf(unitOf(r.state)).moments).toMatchObject([{ axis: 'bond:desire', from: 'low', to: 'medium' }]);
  });

  it('a bond step stops two places from the import', () => {
    let s = world({ 'bond:desire': 6 });
    withBond(s, ANN, {});
    s = apply(s, review([shift('bond:desire', 'up', 'step')])).state; // low -> medium
    ensureDevelopment(unitOf(s)).acc['bond:desire'] = 6;
    ensureDevelopment(unitOf(s)).pending = [ap(5), ap(6), ap(7)];
    s = apply(s, review([shift('bond:desire', 'up', 'step')])).state; // medium -> high
    expect(bondOf(unitOf(s))!.desire).toBe('high');
    expect(eligibleAxes(s, reg, unitOf(s)).map((a) => a.axis)).not.toContain('bond:desire');
  });

  it('gaining a like removes it from the dislikes', () => {
    const s = world({ 'like:tech': 3.5 });
    unitOf(s).dislikes = ['tech'];
    const r = apply(s, review([shift('like:tech', 'up', 'step')]));
    expect(likesOf(unitOf(r.state))).toContain('tech');
    expect(dislikesOf(unitOf(r.state))).not.toContain('tech');
    expect(developmentOf(unitOf(r.state)).moments).toHaveLength(1);
  });

  it('a lost like can come back without a trace in the lists', () => {
    let s = world({ 'like:tea': -3.5 });
    unitOf(s).likes = ['tea'];
    s = apply(s, review([shift('like:tea', 'down', 'step')])).state;
    expect(likesOf(unitOf(s))).toEqual([]);
    ensureDevelopment(unitOf(s)).acc['like:tea'] = 3.5;
    ensureDevelopment(unitOf(s)).pending = [ap(5), ap(6), ap(7)];
    s = apply(s, review([shift('like:tea', 'up', 'step')])).state;
    expect(likesOf(unitOf(s))).toEqual(['tea']);
    expect(developmentOf(unitOf(s)).lost?.likes ?? []).toEqual([]);
  });

  it('facts are capped at 12, the oldest unedited one out', () => {
    const s = world({});
    const dev = ensureDevelopment(unitOf(s));
    dev.facts = Array.from({ length: 12 }, (_, i) => ({ id: `df${i + 100}`, text: `old ${i}`, kind: 'memory' as const, day: 1, source: 'review' as const, ...(i === 0 ? { edited: true as const } : {}) }));
    const r = apply(s, review([], [{ text: 'new one', kind: 'attitude' }]));
    const facts = developmentOf(unitOf(r.state)).facts;
    expect(facts).toHaveLength(TUNING.development.factsMax);
    expect(facts.map((f) => f.text)).toContain('old 0'); // edited: kept
    expect(facts.map((f) => f.text)).not.toContain('old 1'); // the oldest unedited
    expect(facts.at(-1)!.text).toBe('new one');
  });

  it('the fallback nudges only', () => {
    const s = world({ 'value:mercy': 2, 'value:autonomy': 1.5, 'bond:desire': 4, 'value:ingroup': 0.5 });
    withBond(s, ANN, {});
    const v = fallbackReview(s, reg, ANN);
    expect(v.facts).toEqual([]);
    expect(v.shifts.map((x) => [x.axis, x.size, x.direction])).toEqual([['value:mercy', 'nudge', 'up'], ['value:autonomy', 'nudge', 'up']]);
    const r = apply(s, v, 'fallback');
    expect(ofType(r.events, 'development_review')[0]).toMatchObject({ source: 'fallback', shifts: 2, facts: 0 });
    expect(developmentOf(unitOf(r.state)).moments).toEqual([]);
  });

  it('draws nothing', () => {
    const s = world({ 'value:mercy': 3 });
    const r = apply(s, review([shift('value:mercy', 'up', 'step')], [{ text: 'x', kind: 'value' }]));
    expect(r.state.rng).toEqual(s.rng);
  });

  it('is refused while development is off, for an unknown unit and for a bad payload', () => {
    const s = world({ 'value:mercy': 3 });
    const off = structuredClone(s);
    delete off.settings.characterDevelopment;
    for (const [state, payload] of [[off, { unitId: ANN, review: review([]), source: 'model' }], [s, { unitId: 'nobody', review: review([]), source: 'model' }], [s, { unitId: ANN, review: 'x', source: 'model' }], [s, { unitId: ANN, review: review([]), source: 'guess' }]] as const) {
      const r = run(state, reg, { type: 'development/review', payload });
      expect(errors(r.events)).toHaveLength(1);
      expect(r.state).toEqual(state);
    }
  });
});

describe('undo and replace', () => {
  it('undo restores exactly', () => {
    const s = world({ 'value:mercy': 3, 'bond:desire': 3, 'like:tea': 3.5 });
    withBond(s, ANN, {});
    unitOf(s).dislikes = ['tea'];
    ensureDevelopment(unitOf(s)).drift.mercy = 0.68;
    ensureDevelopment(unitOf(s)).facts = [{ id: 'df50', text: 'before', kind: 'memory', day: 1, source: 'review' }];
    const before = structuredClone(unitOf(s));
    const draft = structuredClone(s);
    const events = applyReview(draft, reg, ANN, review([shift('value:mercy', 'up', 'step'), shift('bond:desire', 'up', 'step'), shift('like:tea', 'up', 'step')], [{ text: 'new', kind: 'attitude' }]), 'model');
    expect(ofType(events, 'development_moment').length).toBeGreaterThan(0);
    expect(unitOf(draft)).not.toEqual(before);
    expect(undoReview(draft, ANN)).toBe(true);
    const after = unitOf(draft);
    delete after.development!.lastApplied;
    after.development!.nextId = before.development!.nextId; // ids are never reused: only the counter differs
    expect(after).toEqual(before);
    expect(undoReview(draft, ANN)).toBe(false);
  });

  it('undo keeps what was recorded after the review', () => {
    const s = world({ 'value:mercy': 3 });
    const draft = structuredClone(s);
    applyReview(draft, reg, ANN, review([shift('value:mercy', 'up', 'step')]), 'model');
    ensureDevelopment(unitOf(draft)).pending.push(ap(9));
    ensureDevelopment(unitOf(draft)).acc['value:ingroup'] = 0.5;
    undoReview(draft, ANN);
    expect(developmentOf(unitOf(draft)).pending.map((a) => a.id)).toEqual(['ap0', 'ap1', 'ap2', 'ap9']);
    expect(developmentOf(unitOf(draft)).acc).toEqual({ 'value:mercy': 3, 'value:ingroup': 0.5 });
  });

  it('replace swaps the review while nothing has been shown', () => {
    const s = world({ 'value:mercy': 3, 'value:autonomy': 3 });
    const a = run(s, reg, { type: 'development/review', payload: { unitId: ANN, review: review([shift('value:mercy', 'up', 'step')]), source: 'model' } }).state;
    expect(reviewCommitted(a, ANN)).toBeNull();
    const b = run(a, reg, { type: 'development/review', payload: { unitId: ANN, review: review([shift('value:autonomy', 'up', 'step')]), source: 'model', replace: true } });
    expect(errors(b.events)).toEqual([]);
    expect(developmentOf(unitOf(b.state)).drift).toEqual({ autonomy: 1 });
    expect(developmentOf(unitOf(b.state)).acc['value:mercy']).toBe(3);
  });

  it('replace is refused after a scene stamped the moment', () => {
    const s = world({ 'value:mercy': 3 });
    ensureDevelopment(unitOf(s)).drift.mercy = 0.9;
    const a = run(s, reg, { type: 'development/review', payload: { unitId: ANN, review: review([shift('value:mercy', 'up', 'step')]), source: 'model' } }).state;
    const dev = ensureDevelopment(unitOf(a));
    expect(dev.moments).toHaveLength(1);
    dev.moments[0].sceneId = 'scene_1';
    expect(reviewCommitted(a, ANN)).toBe('She has already shown it.');
    const b = run(a, reg, { type: 'development/review', payload: { unitId: ANN, review: review([]), source: 'model', replace: true } });
    expect(errors(b.events)).toHaveLength(1);
    expect(b.state).toEqual(a);
  });

  it('a context is available to the engine functions', () => {
    const s = world();
    expect(ctxOf(structuredClone(s), reg).registries).toBe(reg);
  });
});
