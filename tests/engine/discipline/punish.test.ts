import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { disciplineOf, holdDefiance, impunityOf, recordOf } from '../../../src/engine/discipline';
import { checkPunish, perceptionOf } from '../../../src/engine/discipline/punish';
import { seedRng } from '../../../src/engine/rng';
import { rowFor } from '../../../src/engine/relations/deltas';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { noPresence, setRecord } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unit = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;

/** A guarded unit with no tags, no defects, Trust 50, Affinity 10, stress 20, an average-build commander. */
function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  s.resources.supplies = 10;
  s.resources.credits = 100;
  for (const u of s.squad) {
    u.defects = []; u.likes = []; u.dislikes = []; u.triggers = []; u.stress = 20;
    s.relations[u.id].stateId = 'comrade';
    s.relations[u.id].trust = 50;
    s.relations[u.id].affinity = 10;
    s.relations[u.id].metDay = -50; // the first impression is long gone
  }
  return s;
}
const punish = (s: CampaignState, measure: string, days?: number, id = ANN, r: Registries = reg) =>
  run(s, r, { type: 'discipline/punish', payload: { unitId: id, measure, ...(days !== undefined ? { days } : {}) } });
const ok = (s: CampaignState, measure: string, days?: number, id = ANN, r: Registries = reg) => {
  const res = punish(s, measure, days, id, r);
  expect(errors(res.events)).toEqual([]);
  return res;
};
const axes = (s: CampaignState, id = ANN) => [s.relations[id].trust, s.relations[id].affinity, unit(s, id).stress, recordOf(s, id)];

describe('a menu punishment', () => {
  it('applies the registry deltas', () => {
    const s = world();
    const r = ok(s, 'brig', 2);
    expect(axes(r.state)).toEqual([44, 2, 32, -20]);
    expect(r.state.discipline!.restrictions).toEqual([expect.objectContaining({ unitId: ANN, kind: 'confined', untilDay: 7 })]);
    expect(ofType(r.events, 'discipline_applied')).toMatchObject([{ unitId: ANN, measure: 'brig', source: 'menu' }]);
    expect(ofType(r.events, 'restriction_started')).toHaveLength(1);
    expect(r.state.relations[ANN].history.at(-1)).toMatchObject({ type: 'commander_enforced', severity: 'extreme' });
  });

  it('each rung of the ladder', () => {
    const at = (measure: string, days?: number) => axes(ok(world(), measure, days).state);
    expect(at('verbal')).toEqual([50, 8, 23, -8]);
    expect(at('revoke_rations')).toEqual([48, 6, 26, -10]);
    expect(at('revoke_leave')).toEqual([48, 5, 25, -12]);
    expect(at('extra_duty')).toEqual([49, 7, 28, -12]);
    expect(at('bench')).toEqual([46, 5, 26, -15]);
  });

  it('disposition scales the cost; dispositionScaling none skips it', () => {
    const s = world();
    s.world.options = { ...(s.world.options ?? {}), disposition: 'hazardous' };
    const r = ok(s, 'brig', 1);
    expect([r.state.relations[ANN].trust, r.state.relations[ANN].affinity]).toEqual([38, -6]); // −6 × 2 = −12, −8 × 2 = −16
    const flat: Registries = { ...reg, punishments: new Map([...reg.punishments, ['brig', { ...(reg.punishments.get('brig') as object), id: 'brig', dispositionScaling: 'none' } as never]]) };
    const t = ok(s, 'brig', 1, ANN, flat);
    expect([t.state.relations[ANN].trust, t.state.relations[ANN].affinity]).toEqual([44, 2]);
  });

  it('perception multiplies the deltas and the deterrence', () => {
    const s = world();
    unit(s).likes = ['lives_for_combat'];
    const r = ok(s, 'bench');
    expect(axes(r.state)).toEqual([42, 0, 32, -30]); // Trust −8, Affinity −10, stress +12, record −30
    expect(axes(ok(world(), 'bench').state)).toEqual([46, 5, 26, -15]); // without the tag
  });

  it('the tag may also be a dislike or a trigger, and the highest match wins', () => {
    const entry = (extra: unknown[]) => ({ ...(reg.punishments.get('bench') as object), id: 'bench', perception: extra }) as never;
    const multi: Registries = { ...reg, punishments: new Map([...reg.punishments, ['bench', entry([{ tag: 'a', multiplier: 1.5 }, { tag: 'b', multiplier: 3 }, { tag: 'c', multiplier: 0.5 }])]]) };
    const u = unit(world());
    expect(perceptionOf(multi, { ...u, likes: ['a'], dislikes: [], triggers: [] }, multi.punishments.get('bench')!)).toBe(1.5);
    expect(perceptionOf(multi, { ...u, likes: ['a'], dislikes: ['b'], triggers: [] }, multi.punishments.get('bench')!)).toBe(3);
    expect(perceptionOf(multi, { ...u, likes: [], dislikes: [], triggers: ['c'] }, multi.punishments.get('bench')!)).toBe(0.5);
    expect(perceptionOf(multi, { ...u, likes: ['zzz'], dislikes: [], triggers: [] }, multi.punishments.get('bench')!)).toBe(1);
  });

  it("a slight commander's punishment is off-image while she is still sizing the commander up", () => {
    const calm = world();
    const slight = world();
    slight.commander.body = { strength: 1, endurance: 1, reflexes: 1 };
    for (const s of [calm, slight]) s.relations[ANN].metDay = s.day; // day 0 of knowing the commander: full weight
    const a = ok(calm, 'brig', 1).state;
    const b = ok(slight, 'brig', 1).state;
    expect(50 - b.relations[ANN].trust).toBeGreaterThan(50 - a.relations[ANN].trust);
    expect(Math.abs(10 - b.relations[ANN].affinity)).toBeGreaterThan(Math.abs(10 - a.relations[ANN].affinity));
    expect((50 - b.relations[ANN].trust) / (50 - a.relations[ANN].trust)).toBeCloseTo(1.3, 1);
  });

  it('revoke_rations returns one supply, extra_duty five credits', () => {
    const s = world();
    expect(ok(s, 'revoke_rations').state.resources.supplies).toBe(11);
    expect(ok(s, 'extra_duty').state.resources.credits).toBe(105);
    expect(ok(s, 'verbal').state.resources).toEqual(s.resources);
  });

  it('writes the public fact for a menu punishment', () => {
    const r = ok(world(), 'revoke_rations');
    const fact = r.state.memory.facts.at(-1)!;
    expect(fact.text).toBe('The commander imposed Rations revoked on Ann.');
    expect(fact.knownBy).toEqual(['*']);
  });

  it('records the application with its inverse, newest 20', () => {
    const r = ok(world(), 'brig', 3);
    const [app] = r.state.discipline!.applications;
    expect(app).toMatchObject({ unitId: ANN, measure: 'brig', source: 'menu', channel: 'pda', day: 5 });
    expect(app.inverse).toMatchObject({ axes: { trust: -6, affinity: -8 }, stress: 12, record: -20 });
    let s = r.state;
    for (let i = 0; i < 25; i++) {
      s = { ...s, day: s.day + 1 };
      s = ok(s, 'verbal', undefined, BEA).state;
    }
    expect(s.discipline!.applications).toHaveLength(20);
    expect(s.discipline!.applications.at(-1)!.unitId).toBe(BEA);
  });

  it('the channel is the scene while she is in the open scene, else the PDA', () => {
    const s = world();
    const open = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const a = ok(open, 'verbal').state.discipline!.applications[0];
    expect(a).toMatchObject({ channel: 'scene', sceneId: open.scene!.id });
    expect(ok(open, 'verbal', undefined, BEA).state.discipline!.applications[0].channel).toBe('pda'); // Bea is not in it
  });
});

describe('what a punishment refuses', () => {
  it('the same measure twice a day is refused and changes nothing', () => {
    const once = ok(world(), 'verbal').state;
    const twice = punish(once, 'verbal');
    expect(errors(twice.events)).toHaveLength(1);
    expect(twice.state).toBe(once);
    expect(ok(once, 'revoke_rations').state).not.toBe(once); // another measure is fine
    const tomorrow = ok({ ...once, day: once.day + 1 }, 'verbal');
    expect(errors(tomorrow.events)).toEqual([]);
  });

  it('an unknown measure, a grunt, a deserter, a dead unit are refused', () => {
    const s = world();
    expect(String(errors(punish(s, 'guillotine').events)[0].message)).toMatch(/Unknown punishment/);
    s.squad.push({ ...structuredClone(unit(s)), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = structuredClone(s.relations[ANN]);
    expect(errors(punish(s, 'verbal', undefined, 'grunt_1').events)).toHaveLength(1);
    unit(s, BEA).status = 'deserted';
    expect(errors(punish(s, 'verbal', undefined, BEA).events)).toHaveLength(1);
    unit(s, 'unit_cat').status = 'dead';
    expect(errors(punish(s, 'verbal', undefined, 'unit_cat').events)).toHaveLength(1);
    expect(errors(punish(s, 'verbal', undefined, 'nobody').events)).toHaveLength(1);
  });

  it('brig days outside 1–3 are refused', () => {
    const s = world();
    for (const days of [0, 4, 2.5, -1]) expect(errors(punish(s, 'brig', days).events), String(days)).toHaveLength(1);
    expect(errors(punish(s, 'brig', 1).events)).toEqual([]);
    expect(errors(punish(s, 'brig', 3).events)).toEqual([]);
    expect(String(errors(punish(s, 'brig', 4).events)[0].message)).toBe('Brig lasts 1 to 3 days.');
  });

  it('a brig without days is the shortest; days for a measure that has none are ignored', () => {
    expect(ok(world(), 'brig').state.discipline!.restrictions[0].untilDay).toBe(6);
    expect(axes(ok(world(), 'verbal', 3).state)).toEqual(axes(ok(world(), 'verbal').state));
  });

  it('a unit already under that restriction is refused', () => {
    const jailed = ok(world(), 'brig', 2).state;
    const again = punish({ ...jailed, day: jailed.day + 1 }, 'brig', 1);
    expect(errors(again.events)).toHaveLength(1);
    const benched = ok(world(), 'bench').state;
    expect(errors(punish({ ...benched, day: benched.day + 1 }, 'bench').events)).toHaveLength(1);
    expect(checkPunish(world(), reg, ANN, 'bench')).toBeNull();
  });
});

describe('a punishment is an enforcement', () => {
  it('cancels held defiance and keeps a matching threat', () => {
    const s = world();
    holdDefiance(s, ANN, 'moderate', 'intent');
    disciplineOf(s).threats.push({ id: 'th1', unitId: ANN, measure: 'revoke_leave', day: 5, deadlineDay: 6, believed: true, channel: 'dm', inverse: {} });
    const r = ok(s, 'brig', 1);
    expect(r.state.discipline!.defiance).toEqual([]);
    expect(r.state.discipline!.threats).toEqual([]);
    expect(ofType(r.events, 'threat_kept')).toHaveLength(1);
    expect(r.state.discipline!.applications[0].inverse.defiance).toMatchObject({ unitId: ANN, severity: 'moderate' });
    expect(r.state.discipline!.applications[0].inverse.threat).toMatchObject({ id: 'th1', measure: 'revoke_leave' });
  });

  it('a lighter measure leaves a heavier threat pending', () => {
    const s = world();
    disciplineOf(s).threats.push({ id: 'th1', unitId: ANN, measure: 'brig', day: 5, deadlineDay: 6, believed: true, channel: 'dm', inverse: {} });
    const r = ok(s, 'verbal');
    expect(r.state.discipline!.threats).toHaveLength(1);
    expect(ofType(r.events, 'threat_kept')).toEqual([]);
  });

  it('the record moves by the deterrence, clamped at −40', () => {
    const s = setRecord(world(), ANN, -35);
    expect(recordOf(ok(s, 'brig', 1).state, ANN)).toBe(-40);
    expect(impunityOf(ok(world(), 'brig', 1).state, reg, ANN)!.terms.record).toBe(-20);
  });
});

describe('determinism', () => {
  it('discipline/punish draws no rng', () => {
    const s = world();
    s.rng = seedRng(9);
    const rng = structuredClone(s.rng);
    expect(ok(s, 'brig', 2).state.rng).toEqual(rng);
  });
});

describe('rowFor', () => {
  it("is the punishment's deltas times her perception for a known measure, the eventDeltas row otherwise", () => {
    const s = world();
    const ev = { type: 'commander_enforced' as const, actor: 'commander', targets: [ANN], severity: 'minor' as const, evidence: 'e', confidence: 1 };
    expect(rowFor(s, reg, ANN, { ...ev, measure: 'brig' }, 'extreme')).toEqual({ trust: -6, affinity: -8, stress: 12 });
    unit(s).likes = ['lives_for_combat'];
    expect(rowFor(s, reg, ANN, { ...ev, measure: 'bench' }, 'major')).toEqual({ trust: -8, affinity: -10, stress: 12 });
    const fallback = rowFor(s, reg, ANN, { ...ev, measure: 'gone' }, 'moderate');
    expect(fallback).toEqual({ trust: -2, affinity: -4, stress: 6 }); // the eventDeltas row of commander_enforced
    expect(rowFor(s, reg, ANN, { ...ev, type: 'praised' as never }, 'minor')).toEqual({ affinity: 1 });
  });
});
