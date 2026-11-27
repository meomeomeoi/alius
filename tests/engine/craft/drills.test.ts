import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { checkActivity } from '../../../src/engine/activities';
import '../../../src/engine/actions/craft';
import { drillMult, drilledToday, drillXp, payDrill } from '../../../src/engine/craft/drills';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, errors, loadCore, run } from '../../helpers/world';
import { ANN, BEA, CAT, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

const DRILL = TUNING.craft.xp.drill;
const train = (s: CampaignState, req: Record<string, unknown>) => run(s, reg, { type: 'activity/do', payload: { activityId: 'train', ...req } });
const done = (events: Array<{ type: string; [k: string]: unknown }>) => events.filter((e) => e.type === 'drill_done');
const live = (): CampaignState => { const s = world(reg, 'play'); s.slot = 'morning'; return s; };

describe('a drill alone: one click, the slot is spent', () => {
  it.each([['drill_stillness', 'stillness'], ['drill_recitation', 'speech'], ['drill_rhythm', 'rhythm']])('%s pays %d xp to %s', (focus, key) => {
    const s = live();
    const r = train(s, { focus });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.commander.craft?.[key]).toMatchObject({ xp: DRILL, lastDay: s.day, drillDay: s.day });
    expect(done(r.events)).toEqual([{ type: 'drill_done', key, mult: 1, alone: true, xp: DRILL }]);
    expect(r.events.find((e) => e.type === 'craft_xp')).toMatchObject({ key, gained: DRILL, cause: 'drill' });
    expect(r.state.slot).toBe('afternoon'); // the slot is spent
  });

  it('a second one the same day pays nothing and the slot is spent all the same', () => {
    const first = train(live(), { focus: 'drill_stillness' });
    const second = train(first.state, { focus: 'drill_stillness' });
    expect(errors(second.events)).toEqual([]);
    expect(second.state.commander.craft!.stillness!.xp).toBe(DRILL);
    expect(done(second.events)).toEqual([{ type: 'drill_done', key: 'stillness', mult: 1, alone: true, xp: 0 }]);
    expect(second.events.some((e) => e.type === 'craft_xp')).toBe(false);
    expect(second.state.slot).toBe('evening');
  });

  it('another discipline the same day pays in full, and the day after pays again', () => {
    const a = train(live(), { focus: 'drill_stillness' });
    const b = train(a.state, { focus: 'drill_rhythm' });
    expect(b.state.commander.craft!.rhythm!.xp).toBe(DRILL);
    const next = structuredClone(a.state);
    next.day += 1;
    next.slot = 'morning';
    expect(drilledToday(next, 'stillness')).toBe(false);
    expect(train(next, { focus: 'drill_stillness' }).state.commander.craft!.stillness!.xp).toBe(2 * DRILL);
  });

  it('the xp raises the level through the book', () => {
    let s = live();
    for (let i = 0; i < 2; i++) { s = train(s, { focus: 'drill_stillness' }).state; s.day += 1; s.slot = 'morning'; }
    expect(s.commander.craft!.stillness).toMatchObject({ xp: 2 * DRILL, level: 1 });
  });

  it('an endurance drill alone is P15a\'s: +15 once a day, and with a holder it says drill_done too', () => {
    const r = train(live(), { focus: 'endurance_breath' });
    expect(r.state.commander.endurance!.breath).toMatchObject({ xp: TUNING.physics.endurance.training, trainedDay: 20 });
    expect(done(r.events)).toEqual([{ type: 'drill_done', key: 'endurance:breath', mult: 1, alone: true, xp: TUNING.physics.endurance.training }]);
    const again = train(r.state, { focus: 'endurance_breath' });
    expect(errors(again.events)[0]?.message).toMatch(/done today/);
  });
});

describe('a drill with a partner', () => {
  const together = (companionId: string, focus = 'endurance_breath', make: (s: CampaignState) => CampaignState = (s) => s) => train(make(live()), { companionId, focus });
  const close = (s: CampaignState, id: string) => { s.relations[id].stateId = 'confidant'; return s; };

  it('a holder doubles it by half (x1.5)', () => {
    const r = together(ANN);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.commander.endurance!.breath!.xp).toBe(DRILL * TUNING.craft.drill.holder);
    expect(done(r.events)).toEqual([{ type: 'drill_done', key: 'endurance:breath', companionId: ANN, mult: 1.5, alone: false, xp: 22.5 }]);
    expect(r.state.relations[ANN].craft?.partnerDay).toBe(20);
  });

  it('another close woman makes it x1.2', () => {
    const r = together(BEA, 'endurance_weight', (s) => close(s, BEA));
    expect(r.state.commander.endurance!.weight!.xp).toBe(DRILL * TUNING.craft.drill.other);
    expect(done(r.events)[0]).toMatchObject({ companionId: BEA, mult: 1.2, alone: false });
  });

  it('anyone else is x1', () => {
    const r = together(CAT);
    expect(r.state.commander.endurance!.breath!.xp).toBe(DRILL);
    expect(done(r.events)[0]).toMatchObject({ mult: 1 });
    expect(r.state.relations[CAT].craft?.partnerDay).toBeUndefined(); // a x1 companion is no jealousy for anyone (the review: M7)
    expect(r.state.relations[ANN].craft?.partnerDay).toBeUndefined();
  });

  it('a close woman (x1.2) stamps the day of the pair, which another holder reads as jealousy', () => {
    const r = together(BEA, 'endurance_weight', (s) => close(s, BEA));
    expect(r.state.relations[BEA].craft?.partnerDay).toBe(20);
  });

  it('is the same drill as alone for the once-a-day rule and keeps P2\'s companion effects', () => {
    const alone = train(live(), { focus: 'endurance_breath' }).state;
    expect(String(checkActivity(alone, reg, { activityId: 'train', companionId: ANN, focus: 'endurance_breath' }))).toMatch(/done today/);
    const r = together(ANN);
    const plain = train(live(), { companionId: ANN });
    expect(r.events.filter((e) => e.type === 'xp_gained' || e.type === 'social_gained' || e.type === 'relation_changed')).toEqual(plain.events.filter((e) => e.type === 'xp_gained' || e.type === 'social_gained' || e.type === 'relation_changed'));
  });

  it('only a drill with an instrument takes a partner: the others are dropped with a companion, as ever', () => {
    const r = train(live(), { companionId: ANN, focus: 'drill_stillness' });
    expect(errors(r.events)).toEqual([]);
    expect(done(r.events)).toEqual([]);
    expect(r.state.commander.craft).toBeUndefined();
  });

  it('a companion on the units focus behaves exactly as without a focus', () => {
    const a = train(live(), { companionId: ANN, focus: 'units', unitIds: [BEA] });
    const b = train(live(), { companionId: ANN });
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
  });

  it('drillMult and drillXp read the partner', () => {
    const s = close(live(), BEA);
    expect([drillMult(s, reg), drillMult(s, reg, ANN), drillMult(s, reg, BEA), drillMult(s, reg, CAT)]).toEqual([1, 1.5, 1.2, 1]);
    expect(drillXp(s, reg, 'endurance:breath', ANN)).toBe(22.5);
    const paid = structuredClone(s);
    payDrill(paid, reg, 'stillness');
    expect(drillXp(paid, reg, 'stillness')).toBe(0);
    expect(drillXp(paid, reg, 'speech')).toBe(DRILL);
  });
});

describe('the posture drill (P16b, Task 12)', () => {
  const named = (s: CampaignState, ids: string[]): CampaignState => {
    s.practices = { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [], postures: { [ANN]: ids.map((postureId) => ({ postureId, name: postureId, day: s.day })) } } as never;
    return s;
  };

  it('alone it pays the posture discipline like any drill', () => {
    const r = train(live(), { focus: 'drill_posture' });
    expect(errors(r.events)).toEqual([]);
    expect(done(r.events)).toEqual([{ type: 'drill_done', key: 'posture', mult: 1, alone: true, xp: DRILL }]);
    expect(r.state.commander.craft!.posture).toMatchObject({ xp: DRILL, drillDay: r.state.day });
  });

  it('with a holder it is x1.5 and a drill of one of her named postures: her pick, the pair\'s mastery of it, no draw', () => {
    const s = named(live(), ['kneel_open', 'attention']);
    const rng = JSON.stringify(s.rng);
    const r = train(s, { companionId: ANN, focus: 'drill_posture' });
    expect(errors(r.events)).toEqual([]);
    const [d] = done(r.events);
    expect(d).toMatchObject({ key: 'posture', mult: 1.5, xp: DRILL * 1.5 });
    expect(['kneel_open', 'attention']).toContain(d.presetId);
    expect(r.state.relations[ANN].craft!.postures![d.presetId as string].xp).toBe(TUNING.craft.xp.knowledge);
    expect(JSON.stringify(r.state.rng)).toBe(rng);
    const again = train(named(live(), ['kneel_open', 'attention']), { companionId: ANN, focus: 'drill_posture' });
    expect(done(again.events)[0].presetId).toBe(d.presetId); // the same pick the same day
  });

  it('a second one the same day pays nothing and teaches nothing; a holder with no named posture is a plain drill', () => {
    const first = train(named(live(), ['kneel_open']), { companionId: ANN, focus: 'drill_posture' });
    const before = JSON.stringify(first.state.relations[ANN].craft!.postures);
    const second = train({ ...first.state, slot: 'morning' } as CampaignState, { companionId: ANN, focus: 'drill_posture' });
    expect(done(second.events)[0]).toMatchObject({ xp: 0 });
    expect(JSON.stringify(second.state.relations[ANN].craft!.postures)).toBe(before);
    const bare = train(live(), { companionId: ANN, focus: 'drill_posture' });
    expect(done(bare.events)[0]).toMatchObject({ key: 'posture', mult: 1.5 });
    expect(done(bare.events)[0].presetId).toBeUndefined();
  });
});

describe('without a craft-live holder', () => {
  const plain = (): CampaignState => { const s = campaign(reg, 4); s.resources.supplies = 200; s.slot = 'morning'; return s; };

  it('a drill of the craft is not offered and pays nothing', () => {
    const s = plain();
    expect(checkActivity(s, reg, { activityId: 'train', focus: 'drill_stillness' })).toMatch(/not available/);
    const r = train(s, { focus: 'drill_rhythm' });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(s);
  });

  it('the three P15a endurance drills keep their behaviour: +15 once a day, nothing of the craft written', () => {
    for (const [focus, physics] of [['endurance_breath', 'breath'], ['endurance_weight', 'weight'], ['endurance_jaw', 'jaw']] as const) {
      const r = train(plain(), { focus });
      expect(errors(r.events)).toEqual([]);
      expect(r.state.commander.endurance![physics]).toMatchObject({ xp: TUNING.physics.endurance.training });
      expect(done(r.events)).toEqual([]);
      expect(r.state.commander.craft).toBeUndefined();
    }
  });

  it('a companion drops the endurance focus, as P2 always did', () => {
    const r = train(plain(), { companionId: 'unit_ann', focus: 'endurance_breath' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.commander.endurance).toBeUndefined();
    expect(done(r.events)).toEqual([]);
  });

  it('payDrill writes nothing', () => {
    const s = plain();
    expect(payDrill(s, reg, 'stillness')).toEqual([]);
    expect(s.commander.craft).toBeUndefined();
  });
});

describe('the drill focuses of the content', () => {
  type F = { id: string; drill?: { key: string; partner?: true } };
  type Fx = { type: string; key?: string; physics?: string; when?: { focus?: string } };
  const train = () => reg.activities.get('train') as unknown as { focus: F[]; effects: Fx[] };

  it('every drill has an effect that trains the key it names', () => {
    for (const f of train().focus.filter((x) => x.drill)) {
      const fx = train().effects.filter((e) => e.when?.focus === f.id);
      expect(fx, f.id).toHaveLength(1);
      expect(fx[0]!.type === 'commander_craft_xp' ? fx[0]!.key : `endurance:${fx[0]!.physics}`, f.id).toBe(f.drill!.key);
    }
  });

  it('only a drill with an instrument takes a partner: breath, weight and the posture drill (the presets)', () => {
    expect(train().focus.filter((f) => f.drill?.partner).map((f) => f.drill!.key)).toEqual(['endurance:breath', 'endurance:weight', 'posture']);
    expect(train().focus.filter((f) => f.drill).map((f) => f.drill!.key)).toEqual(expect.arrayContaining(['stillness', 'speech', 'rhythm', 'endurance:jaw']));
  });
});
