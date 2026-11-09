import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { affectedUnits, computeDeltas, escalate, stressFromHint } from '../../../src/engine/relations/deltas';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';
const BEA = 'unit_bea';

function world(): CampaignState {
  const s = campaign(reg, 4);
  for (const u of s.squad) {
    u.defects = [];
    u.likes = []; u.dislikes = []; u.triggers = [];
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
    s.relations[u.id].stateId = 'comrade';
    s.relations[u.id].trust = 50;
    s.relations[u.id].affinity = 20;
  }
  return s;
}
const unit = (s: CampaignState, id: string): Unit => s.squad.find((u) => u.id === id)!;
const event = (over: Partial<EventIntent> = {}): EventIntent => ({
  type: 'praised', actor: 'commander', targets: [ANN], severity: 'major', evidence: 'e', confidence: 1, ...over,
});
const d = (s: CampaignState, e: EventIntent, id = ANN) => computeDeltas(s, reg, id, e);

describe('helpers', () => {
  it('escalate raises one step and stops at extreme', () => {
    expect(escalate('minor')).toBe('moderate');
    expect(escalate('major')).toBe('extreme');
    expect(escalate('extreme')).toBe('extreme');
  });
  it('stressFromHint is signed by direction', () => {
    expect(stressFromHint('major', 1)).toBe(10);
    expect(stressFromHint('minor', -1)).toBe(-2);
  });
  it('commander praise moves the targets, a unit\'s shared_secret moves the actor', () => {
    expect(affectedUnits(event({ targets: [ANN, BEA] }), [ANN, BEA])).toEqual([ANN, BEA]);
    expect(affectedUnits(event({ type: 'shared_secret', actor: ANN, targets: [] }), [ANN, BEA])).toEqual([ANN]);
    expect(affectedUnits(event({ actor: ANN, targets: [BEA] }), [ANN, BEA])).toEqual([]);
    expect(affectedUnits(event({ targets: ['ghost'] }), [ANN, BEA])).toEqual([]);
  });
});

describe('computeDeltas', () => {
  it('insulted major uses the table row', () => {
    expect(d(world(), event({ type: 'insulted' }))).toMatchObject({ trust: -4, affinity: -10, attraction: 0, stress: 8, severity: 'major' });
  });
  it('decision_violated moves two units with opposite mercy in opposite directions', () => {
    const s = world();
    unit(s, ANN).values.mercy = 3;
    unit(s, BEA).values.mercy = -3;
    const e = event({ type: 'decision_violated', targets: [ANN, BEA], valueAxes: [{ axis: 'mercy', direction: -1 }] });
    const a = d(s, e, ANN);
    const b = d(s, e, BEA);
    expect(a.trust).toBe(-5);
    expect(a.affinity).toBe(-5);
    expect(b.trust).toBe(5);
    expect(b.affinity).toBe(5);
  });
  it('decision_aligned follows the sign of alignment too', () => {
    const s = world();
    unit(s, ANN).values.mercy = 3;
    expect(d(s, event({ type: 'decision_aligned', valueAxes: [{ axis: 'mercy', direction: 1 }] })).trust).toBe(4);
  });
  it('partial alignment scales the magnitude', () => {
    const s = world();
    unit(s, ANN).values.mercy = 1;
    const r = d(s, event({ type: 'decision_aligned', valueAxes: [{ axis: 'mercy', direction: 1 }] }));
    expect(r.trust).toBeCloseTo(4 / 3);
  });
  it('neutral values give no decision delta', () => {
    const r = d(world(), event({ type: 'decision_violated', valueAxes: [{ axis: 'mercy', direction: -1 }] }));
    expect(Object.is(r.trust, 0)).toBe(true);
    expect(Object.is(r.affinity, 0)).toBe(true);
  });
  it('a decision without valueAxes changes nothing', () => {
    expect(d(world(), event({ type: 'decision_aligned' })).trust).toBe(0);
  });
  it('a liked tag multiplies affinity gain by 1.5', () => {
    const s = world();
    unit(s, ANN).likes = ['tea'];
    expect(d(s, event({ tags: ['tea'] })).affinity).toBe(6); // 4 × 1.5
    expect(d(s, event({ tags: ['coffee'] })).affinity).toBe(4);
  });
  it('a disliked tag turns an affinity gain into a loss', () => {
    const s = world();
    unit(s, ANN).dislikes = ['tea'];
    expect(d(s, event({ tags: ['tea'] })).affinity).toBe(-4);
  });
  it('a disliked tag leaves losses as they are', () => {
    const s = world();
    unit(s, ANN).dislikes = ['tea'];
    expect(d(s, event({ type: 'insulted', tags: ['tea'] })).affinity).toBe(-10);
  });
  it('a trigger escalates severity one step and adds stress', () => {
    const s = world();
    unit(s, ANN).triggers = ['sirens'];
    const r = d(s, event({ type: 'insulted', severity: 'minor', tags: ['sirens'] }));
    expect(r.severity).toBe('moderate');
    expect(r).toMatchObject({ trust: -2, affinity: -6, stress: 4 + 8 });
  });
  it('extreme stays extreme when escalated', () => {
    const s = world();
    unit(s, ANN).triggers = ['sirens'];
    const r = d(s, event({ type: 'insulted', severity: 'extreme', tags: ['sirens'] }));
    expect(r.severity).toBe('extreme');
    expect(r.affinity).toBe(-18);
    expect(r.stress).toBe(14 + 8);
  });
  it('tags the unit does not own do nothing', () => {
    const s = world();
    const r = d(s, event({ type: 'insulted', severity: 'minor', tags: ['sirens'] }));
    expect(r).toMatchObject({ severity: 'minor', stress: 2 });
  });
  it('obsessed doubles affinity gains and losses', () => {
    const s = world();
    s.relations[ANN].stateId = 'obsessed';
    expect(d(s, event()).affinity).toBe(8);
    expect(d(s, event()).trust).toBe(2);
    expect(d(s, event({ type: 'insulted' })).affinity).toBe(-20);
    expect(d(s, event({ type: 'insulted' })).trust).toBe(-4);
  });
  it('estranged halves gains only', () => {
    const s = world();
    s.relations[ANN].stateId = 'estranged';
    expect(d(s, event())).toMatchObject({ trust: 1, affinity: 2 });
    expect(d(s, event({ type: 'insulted' }))).toMatchObject({ trust: -4, affinity: -10 });
  });
  it('affect_dampener halves affinity and attraction gains', () => {
    const s = world();
    unit(s, ANN).defects = [{ id: 'affect_dampener' }];
    expect(d(s, event())).toMatchObject({ trust: 2, affinity: 2 });
    expect(d(s, event({ type: 'insulted' })).affinity).toBe(-10);
    expect(d(s, event({ type: 'flirted', severity: 'major' })).attraction).toBeCloseTo(3.5);
  });
  it('imprint_fracture adds 50% to trust gains', () => {
    const s = world();
    unit(s, ANN).defects = [{ id: 'imprint_fracture' }];
    expect(d(s, event()).trust).toBe(3);
    expect(d(s, event({ type: 'insulted' })).trust).toBe(-4);
  });
  it('threat_saturation halves trust gains and losses', () => {
    const s = world();
    unit(s, ANN).defects = [{ id: 'threat_saturation' }];
    expect(d(s, event()).trust).toBe(1);
    expect(d(s, event({ type: 'insulted' })).trust).toBe(-2);
  });
  it('compulsive_protocol doubles broke_promise', () => {
    const s = world();
    unit(s, ANN).defects = [{ id: 'compulsive_protocol' }];
    expect(d(s, event({ type: 'broke_promise' }))).toMatchObject({ trust: -18, affinity: -12 });
    expect(d(s, event({ type: 'kept_promise' }))).toMatchObject({ trust: 10, affinity: 4 });
    expect(d(s, event({ type: 'insulted' })).trust).toBe(-4);
  });
  it('modifiers stack: state × defect', () => {
    const s = world();
    s.relations[ANN].stateId = 'obsessed';
    unit(s, ANN).defects = [{ id: 'affect_dampener' }];
    expect(d(s, event()).affinity).toBe(4); // 4 × 2 × 0.5
  });
  it('flirted gives no attraction when romance is off or affinity is negative, half when trust < 20', () => {
    const e = event({ type: 'flirted', severity: 'moderate' });
    const s = world();
    expect(d(s, e).attraction).toBe(4);
    s.relations[ANN].trust = 10;
    expect(d(s, e).attraction).toBe(2);
    const neg = world();
    neg.relations[ANN].affinity = -5;
    expect(d(neg, e).attraction).toBe(0);
    const off = world();
    off.settings.intimacy = { romance: false, initiative: 'med' };
    expect(d(off, e).attraction).toBe(0);
  });
  it('rejected_advance hurts attraction regardless of receptivity', () => {
    const off = world();
    off.settings.intimacy = { romance: false, initiative: 'med' };
    expect(d(off, event({ type: 'rejected_advance', severity: 'moderate' })).attraction).toBe(-6);
  });
  it('a grunt only ever gets trust', () => {
    const s = world();
    unit(s, ANN).kind = 'grunt';
    expect(d(s, event())).toMatchObject({ trust: 2, affinity: 0, attraction: 0 });
    expect(d(s, event({ type: 'flirted' })).attraction).toBe(0);
  });
  it('an unknown unit or relation gives zeros', () => {
    expect(d(world(), event(), 'ghost')).toMatchObject({ trust: 0, affinity: 0, attraction: 0, stress: 0 });
  });
});
