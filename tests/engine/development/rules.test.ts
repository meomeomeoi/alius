import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/scene';
import { MODEST_BOND } from '../../../src/engine/bonds/profile';
import { axisForbidden, isAnchored } from '../../../src/engine/development/axes';
import { accumulate, matchRules } from '../../../src/engine/development/rules';
import { valuesOf } from '../../../src/engine/development/profile';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import type { Appraisal, CampaignState, Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { enable, loadGate, withBond } from '../../helpers/bonds';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea', CAT = 'unit_cat', DEE = 'unit_dee';
const on = (s: CampaignState, mode: 'normal' | 'slow' = 'normal'): CampaignState => { s.settings.characterDevelopment = mode; return s; };
const unitOf = (s: CampaignState, id: string): Unit => s.squad.find((u) => u.id === id)!;
const appraisal = (over: Partial<Appraisal> = {}): Appraisal => ({
  id: 'ap0', day: 1, kind: 'coerced', target: `unit:${ANN}`, role: 'witness', wanted: 'no', initiator: 'actor', harm: 'serious', outcome: 'bad',
  severity: 'moderate', subject: ANN, pushes: [], summary: '', ...over,
});
const welcome = { wanted: 'yes', initiator: 'target', harm: 'none', outcome: 'good' } as const;
const axes = (list: Array<{ axis: string; amount: number }>): Record<string, number> => Object.fromEntries(list.map((p) => [p.axis, p.amount]));

/** BEA is a caretaker, CAT is cold (mercy −1), DEE leads dominantly and values autonomy; ANN is the unit it happens to. */
function world(): CampaignState {
  const s = on(campaign(reg, 4));
  withBond(s, BEA, { caretaker: true });
  unitOf(s, CAT).values.mercy = -1;
  withBond(s, DEE, { leadStyle: 'dominant' });
  unitOf(s, DEE).values.autonomy = 1;
  return s;
}

describe('the same event moves different women differently', () => {
  it('a unit forced on, watched by four readers', () => {
    const s = world();
    const a = appraisal();
    expect(axes(matchRules(s, reg, unitOf(s, BEA), a, []))).toEqual({ 'value:mercy': 1, 'value:autonomy': 0.5 });
    expect(axes(matchRules(s, reg, unitOf(s, CAT), a, []))).toEqual({ 'value:mercy': -0.5 });
    expect(matchRules(s, reg, unitOf(s, ANN), a, [])).toEqual([]);
    const seen = appraisal(welcome);
    expect(axes(matchRules(s, reg, unitOf(s, BEA), seen, []))).toEqual({ 'value:autonomy': -0.5 });
    expect(axes(matchRules(s, reg, unitOf(s, DEE), seen, []))).toEqual({ 'bond:lead_style': 1 });
    expect(matchRules(s, reg, unitOf(s, CAT), seen, [])).toEqual([]);
  });

  it('a subject reads kindness and harm', () => {
    const s = world();
    const kind = appraisal({ kind: 'comforted', role: 'subject', target: 'her', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', subject: BEA });
    expect(axes(matchRules(s, reg, unitOf(s, BEA), kind, []))).toEqual({ 'value:mercy': 0.5, 'value:ingroup': 0.5, 'bond:attachment': 0.5 });
    const hurt = appraisal({ kind: 'insulted', role: 'subject', target: 'her', harm: 'minor', subject: BEA });
    expect(axes(matchRules(s, reg, unitOf(s, BEA), hurt, []))).toEqual({ 'value:ingroup': -0.5, 'bond:attachment': -0.5 });
  });

  it('an activity done with the commander makes its tags liked', () => {
    const s = world();
    const a = appraisal({ kind: 'activity:train', role: 'subject', target: 'her', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', severity: 'minor', subject: BEA });
    expect(axes(matchRules(s, reg, unitOf(s, BEA), a, ['training']))).toEqual({ 'like:training': 0.25 });
    expect(matchRules(s, reg, unitOf(s, BEA), a, [])).toEqual([]);
  });
});

describe('scaling, caps and holds', () => {
  it('severity and mode scale', () => {
    const s = world();
    const m = (sev: Appraisal['severity']) => axes(matchRules(s, reg, unitOf(s, BEA), appraisal({ severity: sev }), []))['value:mercy'];
    expect(m('extreme')).toBe(2 * m('moderate'));
    expect(m('minor')).toBe(0.5 * m('moderate'));
    expect(m('major')).toBe(1.5 * m('moderate'));
    on(s, 'slow');
    expect(m('moderate')).toBe(0.5);
  });

  it('is off when the mode is off', () => {
    const s = world();
    delete s.settings.characterDevelopment;
    expect(matchRules(s, reg, unitOf(s, BEA), appraisal(), [])).toEqual([]);
  });

  it('acc is clamped at ±6 and the applied amounts are returned', () => {
    const u = unitOf(world(), BEA);
    let last: Array<{ axis: string; amount: number }> = [];
    for (let i = 0; i < 50; i++) last = accumulate(u, [{ axis: 'value:mercy', amount: 1 }]);
    expect(developmentOf(u).acc['value:mercy']).toBe(TUNING.development.accCap);
    expect(last).toEqual([]); // nothing was left to add
    const applied = accumulate(u, [{ axis: 'value:mercy', amount: -20 }]);
    expect(applied).toEqual([{ axis: 'value:mercy', amount: -12 }]);
    expect(developmentOf(u).acc['value:mercy']).toBe(-TUNING.development.accCap);
  });

  it('held axes take nothing', () => {
    const s = world();
    ensureDevelopment(unitOf(s, BEA)).held = ['value:mercy'];
    expect(axes(matchRules(s, reg, unitOf(s, BEA), appraisal(), []))).toEqual({ 'value:autonomy': 0.5 });
    expect(axisForbidden(s, reg, unitOf(s, BEA), 'value:mercy')).toMatch(/held/);
  });

  it('bond pushes need an imported bond, and her limits and publicity can never be pushed', () => {
    const s = world();
    const a = appraisal({ kind: 'physical_affection', role: 'subject', target: 'her', wanted: 'yes', initiator: 'mutual', harm: 'none', outcome: 'good', subject: CAT });
    expect(matchRules(s, reg, unitOf(s, CAT), a, [])).toEqual([]); // CAT has no imported bond
    expect(axisForbidden(s, reg, unitOf(s, CAT), 'bond:desire')).toMatch(/bond/);
    withBond(s, CAT, {});
    expect(axes(matchRules(s, reg, unitOf(s, CAT), a, []))).toEqual({ 'bond:desire': 0.5 });
    for (const key of ['bond:own_limits', 'bond:publicity', 'bond:ownLimits']) expect(axisForbidden(s, reg, unitOf(s, CAT), key)).not.toBeNull();
    expect(unitOf(s, CAT).bond).not.toBe(MODEST_BOND);
  });

  it('a grunt takes no pushes', () => {
    const s = world();
    const g = { ...structuredClone(unitOf(s, BEA)), id: 'grunt_k_117', kind: 'grunt' as const };
    expect(axisForbidden(s, reg, g, 'value:mercy')).toMatch(/grunt/);
  });

  it('anchors are read from the development block', () => {
    const u = unitOf(world(), BEA);
    ensureDevelopment(u).anchors = ['value:ingroup'];
    expect(isAnchored(u, 'value:ingroup')).toBe(true);
    expect(isAnchored(u, 'value:mercy')).toBe(false);
  });
});

describe('the content gate', () => {
  it('a rule tagged with a disabled category is ignored', async () => {
    const gate = await loadGate();
    const s = on(campaign(gate, 4));
    const a = appraisal({ kind: 'praised', role: 'subject', target: 'her', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', subject: ANN });
    const mercy = (st: CampaignState) => axes(matchRules(st, gate, unitOf(st, ANN), a, []))['value:mercy'];
    expect(mercy(s)).toBe(0.5); // the core kindness rule only
    expect(mercy(enable(structuredClone(s), 'restraint'))).toBe(1.5); // plus the tagged fixture rule (+1)
    const limited = enable(structuredClone(s), 'restraint');
    withBond(limited, ANN, { ownLimits: { categories: ['restraint'] } });
    expect(mercy(limited)).toBe(0.5); // her own limit counts like a switch that is off
  });
});

describe('what accumulators do not do', () => {
  it('never change a profile field', () => {
    let s = world();
    const before = structuredClone(unitOf(s, ANN).values);
    s = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } }).state;
    for (let i = 0; i < 50; i++) {
      const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'comforted', actor: 'commander', targets: [ANN], severity: 'major', evidence: 'x', confidence: 1 }] } } });
      expect(errors(r.events)).toEqual([]);
      s = r.state;
    }
    expect(developmentOf(unitOf(s, ANN)).acc['value:mercy']).toBe(TUNING.development.accCap);
    expect(valuesOf(unitOf(s, ANN))).toEqual(before);
    expect(unitOf(s, ANN).values).toEqual(before);
    expect(developmentOf(unitOf(s, ANN)).drift).toEqual({});
  });

  it('record the pushes on the appraisal, as applied', () => {
    let s = world();
    s = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    s = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'praised', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'x', confidence: 1 }] } } }).state;
    const ap = developmentOf(unitOf(s, ANN)).pending[0];
    expect(axes(ap.pushes)).toEqual({ 'value:mercy': 0.5, 'value:ingroup': 0.5 });
    expect(developmentOf(unitOf(s, ANN)).acc).toEqual({ 'value:mercy': 0.5, 'value:ingroup': 0.5 });
  });
});
