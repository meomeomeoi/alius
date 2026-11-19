import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/discipline';
import '../../../src/engine/actions/leash';
import { checkHabits } from '../../../src/engine/development/habits';
import { valuesOf } from '../../../src/engine/development/profile';
import { applyReview, eligibleAxes, undoReview, validateReview, type ReviewValue } from '../../../src/engine/development/review';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import type { Appraisal, CampaignState, Unit } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea';
const unit = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const ap = (i: number): Appraisal => ({
  id: `ap${i}`, day: 1, kind: 'praised', target: 'her', role: 'subject', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', severity: 'moderate', subject: ANN, pushes: [], summary: 's',
});
function world(acc: Record<string, number>, drift: number, base = 1): CampaignState {
  const s = campaign(reg, 4);
  s.settings.characterDevelopment = 'normal';
  s.day = 8;
  unit(s).values.mercy = base;
  const dev = ensureDevelopment(unit(s));
  dev.acc = { ...acc };
  dev.drift.mercy = drift;
  dev.pending = [ap(0), ap(1), ap(2)];
  dev.nextId = 3;
  return s;
}
const step = (direction: 'up' | 'down'): ReviewValue => ({ shifts: [{ axis: 'value:mercy', direction, size: 'step', reason: 'r' }], facts: [] });

describe('a value step always moves her visible value by one (review finding 1)', () => {
  it('up from a negative or fractional drift', () => {
    for (const [drift, from, to] of [[-0.34, '1', '2'], [-1.5, '0', '1'], [0.2, '1', '2']] as const) {
      const s = world({ 'value:mercy': 4 }, drift);
      const d = structuredClone(s);
      const events = applyReview(d, reg, ANN, step('up'), 'model');
      expect(valuesOf(unit(d)).mercy, `drift ${drift}`).toBe(Number(to));
      expect(ofType(events, 'development_moment')).toHaveLength(1);
      expect(developmentOf(unit(d)).moments[0]).toMatchObject({ from: String(Number(from) + 0), to });
    }
  });

  it('down from a positive or fractional drift', () => {
    for (const drift of [0.34, 1.5, -0.2]) {
      const d = structuredClone(world({ 'value:mercy': -4 }, drift));
      const before = valuesOf(unit(d)).mercy;
      const events = applyReview(d, reg, ANN, step('down'), 'model');
      expect(valuesOf(unit(d)).mercy, `drift ${drift}`).toBe(before - 1);
      expect(ofType(events, 'development_moment')).toHaveLength(1);
    }
  });
});

describe('a value at the end of the scale is not offered (review finding 2)', () => {
  it('base 3 cannot go up, base -3 cannot go down', () => {
    const top = world({ 'value:mercy': 4 }, 0, 3);
    expect(eligibleAxes(top, reg, unit(top))).toEqual([]);
    expect(validateReview(top, reg, ANN, step('up')).shifts).toEqual([]);
    const bottom = world({ 'value:mercy': -4 }, 0, -3);
    expect(eligibleAxes(bottom, reg, unit(bottom))).toEqual([]);
    // the other way is open
    expect(validateReview(top, reg, ANN, { ...step('down') }).shifts).toEqual([]); // no support that way
    const down = world({ 'value:mercy': -4 }, 0, 3);
    expect(eligibleAxes(down, reg, unit(down)).map((a) => a.direction)).toEqual(['down']);
  });

  it('a value that reached 3 through drift stops too', () => {
    const s = world({ 'value:mercy': 4 }, 2, 1);
    expect(valuesOf(unit(s)).mercy).toBe(3);
    expect(eligibleAxes(s, reg, unit(s))).toEqual([]);
  });
});

describe('a compelled unit and her witnesses (review finding 3)', () => {
  function scene(): CampaignState {
    const s = campaign(reg, 4);
    s.settings.characterDevelopment = 'normal';
    for (const u of s.squad) { s.relations[u.id].trust = 50; u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 }; }
    withCaretaker(s);
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } });
    r.state.scene!.refusals = [{ unitId: ANN, exchange: 0 }];
    return r.state;
  }
  const withCaretaker = (s: CampaignState): void => {
    unit(s, BEA).bond = { leadStyle: 'balanced', attachment: 'steady', desire: 'low', caretaker: true, ownLimits: { categories: [] }, publicity: 'known' };
  };

  it('she is the subject, the witness is a witness of her', () => {
    const r = run(scene(), reg, { type: 'leash/compel', payload: { unitId: ANN, context: 'scene' } });
    expect(errors(r.events)).toEqual([]);
    const her = developmentOf(unit(r.state, ANN)).pending;
    expect(her).toMatchObject([{ kind: 'coerced', role: 'subject', target: 'her', subject: ANN }]);
    const bea = developmentOf(unit(r.state, BEA)).pending;
    expect(bea).toMatchObject([{ kind: 'coerced', role: 'witness', target: `unit:${ANN}`, subject: ANN }]);
    // the caretaker's witness rule fires, not the subject rule
    expect(developmentOf(unit(r.state, BEA)).acc['value:mercy']).toBeGreaterThan(0);
    expect(bea[0].summary).toContain('witness');
  });
});

describe('a habit line never carries the draft marker (review finding 4)', () => {
  it('checkHabits strips AUTHOR TO WRITE', () => {
    const s = campaign(reg, 4);
    s.settings.characterDevelopment = 'normal';
    ensureDevelopment(unit(s)).counters['activity:train'] = 8;
    const d = structuredClone(s);
    checkHabits(d, reg, ANN);
    const fact = developmentOf(unit(d)).facts.find((f) => f.source === 'habit')!;
    expect(fact.text).toBe('Ann drills every day now, and it shows in how she stands.');
  });
});

describe('ids stay unique after a reroll (review finding 5)', () => {
  it('an appraisal recorded between the review and the reroll keeps a unique id', () => {
    const s = world({ 'value:mercy': 4 }, 0);
    const d = structuredClone(s);
    applyReview(d, reg, ANN, step('up'), 'model');
    const dev = ensureDevelopment(unit(d));
    const late = `ap${dev.nextId}`;
    dev.pending.push(ap(Number(late.slice(2))));
    dev.nextId += 1;
    undoReview(d, ANN);
    applyReview(d, reg, ANN, step('up'), 'model');
    const next = ensureDevelopment(unit(d));
    // the id the next appraisal would take is not one that is already held anywhere
    const held = new Set([...next.pending.map((a) => a.id), ...(next.lastApplied?.pending ?? []).map((a) => a.id)]);
    expect(held.has(`ap${next.nextId}`)).toBe(false);
    expect(late.startsWith('ap')).toBe(true);
    expect(next.nextId).toBeGreaterThan(Number(late.slice(2)));
  });

  it('a second reroll does not put two appraisals under one id', () => {
    const s = world({ 'value:mercy': 4 }, 0);
    const d = structuredClone(s);
    applyReview(d, reg, ANN, step('up'), 'model');
    const dev = ensureDevelopment(unit(d));
    dev.pending.push(ap(dev.nextId));
    dev.nextId += 1;
    undoReview(d, ANN);
    const ids = developmentOf(unit(d)).pending.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(developmentOf(unit(d)).nextId).toBeGreaterThan(Math.max(...ids.map((i) => Number(i.slice(2)))));
  });
});
