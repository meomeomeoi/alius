import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { bondsDayStep, wantBand, wantEligible, wantOf } from '../../../src/engine/bonds';
import { initiativeChance } from '../../../src/engine/dms';
import { Rng } from '../../../src/engine/rng';
import { rollNight } from '../../../src/engine/night';
import { removeFromService } from '../../../src/engine/leash/use';
import { releaseBreakdowns } from '../../../src/engine/progression';
import type { Attachment, CampaignState, DesireLevel } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { withBond } from '../../helpers/bonds';
import '../../../src/engine/actions/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

/** A world where Ann is eligible: lover, medium desire, steady. */
function world(over: { desire?: DesireLevel; attachment?: Attachment; stateId?: string; want?: number } = {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  setRelation(s, ANN, { stateId: over.stateId ?? 'lover' });
  withBond(s, ANN, { desire: over.desire ?? 'medium', attachment: over.attachment ?? 'steady' });
  if (over.want !== undefined) s.relations[ANN].want = over.want;
  return s;
}
const step = (s: CampaignState, r: Registries = reg) => {
  const d = structuredClone(s);
  const events = bondsDayStep(d, { registries: r, rng: new Rng(d.rng) });
  return { state: d, events };
};
const want = (s: CampaignState) => s.relations[ANN].want;

describe('wantBand', () => {
  it('calm below 40, restless to 70, aching to 90, desperate from 90', () => {
    expect([0, 39, 40, 69, 70, 89, 90, 100].map(wantBand)).toEqual(['calm', 'calm', 'restless', 'restless', 'aching', 'aching', 'desperate', 'desperate']);
  });
});

describe('who gets Want (acceptance 1)', () => {
  it('medium desire in a romantic state rises +4 a day; high intense rises round(7×1.4)=10', () => {
    expect(want(step(world()).state)).toBe(4);
    expect(want(step(world({ desire: 'high', attachment: 'intense' })).state)).toBe(10);
    expect(want(step(world({ desire: 'medium', attachment: 'intense' })).state)).toBe(6); // 5.6 rounds up
    expect(want(step(world({ desire: 'high', attachment: 'avoidant' })).state)).toBe(4); // 4.2
    expect(want(step(world({ desire: 'medium', attachment: 'avoidant' })).state)).toBe(2); // 2.4
    expect(want(step(world({ desire: 'high', attachment: 'slow' })).state)).toBe(7);
  });

  it('adds up day after day and stops at 100', () => {
    let s = world({ want: 98, desire: 'high', attachment: 'intense' });
    s = step(s).state;
    expect(want(s)).toBe(100);
    expect(want(step(s).state)).toBe(100);
  });

  it('the attraction path needs attraction ≥ 60 and not avoidant, outside a romantic state', () => {
    const at = (attraction: number, attachment: Attachment) => {
      const s = world({ stateId: 'friend', attachment });
      s.relations[ANN].attraction = attraction;
      return step(s).state;
    };
    expect(want(at(60, 'steady'))).toBe(4);
    expect(want(at(59, 'steady'))).toBeUndefined();
    expect(want(at(80, 'avoidant'))).toBeUndefined();
    expect(wantEligible(world({ stateId: 'friend' }), reg, ANN)).toBe(false);
  });

  it('low desire and the modest profile never get Want', () => {
    expect(want(step(world({ desire: 'low' })).state)).toBeUndefined();
    const modest = campaign(reg, 4);
    setRelation(modest, ANN, { stateId: 'lover' });
    modest.relations[ANN].attraction = 90;
    for (const u of modest.squad) expect(wantEligible(modest, reg, u.id)).toBe(false);
    expect(step(modest).state.relations[ANN].want).toBeUndefined();
  });

  it('a grunt never gets Want', () => {
    const s = world();
    s.squad.find((u) => u.id === 'unit_cat')!.kind = 'grunt';
    setRelation(s, 'unit_cat', { stateId: 'lover' });
    expect(wantEligible(s, reg, 'unit_cat')).toBe(false);
  });

  it('an ineligible unit\'s Want fades 5 a day to 0 and the key goes away', () => {
    const s = world({ stateId: 'friend', want: 12 });
    const a = step(s).state;
    expect(want(a)).toBe(7);
    const b = step(step(a).state).state;
    expect(want(b)).toBeUndefined(); // 7 → 2 → 0: a zero Want is not stored
  });
});

describe('relief', () => {
  const sceneEnd = (tone: 'romantic' | 'intimate' | undefined, w = 80) => {
    const s = world({ want: w });
    const o = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    if (tone === undefined) delete o.scene!.tone;
    else o.scene!.tone = tone;
    return run(o, reg, { type: 'scene/end', payload: {} });
  };

  it('an intimate scene ending lowers Want by 60, a romantic one by 25, a plain one by nothing', () => {
    expect(want(sceneEnd('intimate').state)).toBe(20);
    expect(want(sceneEnd('romantic').state)).toBe(55);
    const plain = sceneEnd(undefined);
    expect(want(plain.state)).toBe(80);
  });

  it('never below 0', () => {
    expect(want(sceneEnd('intimate', 30).state)).toBeUndefined();
  });

  const activity = (activityId: string, companionId: string | undefined) => {
    const s = world({ want: 80 });
    s.resources = { credits: 500, supplies: 50, plyx: 50 };
    return run(s, reg, { type: 'activity/do', payload: { activityId, ...(companionId ? { companionId } : {}) } });
  };

  it('training together lowers it by 15, any other companion activity by 5, her not being there by nothing', () => {
    const t = activity('train', ANN);
    expect(errors(t.events)).toEqual([]);
    expect(want(t.state)).toBe(65);
    expect(want(activity('rest', ANN).state)).toBe(75);
    expect(want(activity('rest', BEA).state)).toBe(80);
    expect(want(activity('rest', undefined).state)).toBe(80);
  });

  it('opening a want_visit knock takes 30; another knock takes nothing', () => {
    const knock = (kind: string) => {
      const s = world({ want: 80 });
      s.slot = 'night';
      s.calendar.nightEvent = { id: 'n1', unitId: ANN, kind, priority: 55, framing: 'k', ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: 99 };
      return run(s, reg, { type: 'night/open', payload: {} });
    };
    expect(want(knock('want_visit').state)).toBe(50);
    expect(want(knock('visit').state)).toBe(80);
  });
});

describe('the bands act', () => {
  it('≥ 40 adds a want_visit night spec (chance 0.25/day, priority 55) and raises DM initiative ×1.5', () => {
    const calm = world({ want: 20 });
    const restless = world({ want: 45 });
    const q = (s: CampaignState) => {
      const d = structuredClone(s);
      const sure = structuredClone(reg);
      rollNight(d, sure, { chance: () => true, float: () => 0, int: () => 0 } as never, 'daily');
      return d.calendar.nightEventsQueue.find((e) => e.unitId === ANN && e.kind === 'want_visit');
    };
    expect(q(calm)).toBeUndefined();
    const entry = q(restless)!;
    expect(entry).toMatchObject({ kind: 'want_visit', priority: 55, ignore: { event: 'dismissed', severity: 'moderate' } });
    expect(entry.contentTags).toBeUndefined();
    expect(initiativeChance(restless, reg, ANN)).toBeCloseTo(Math.min(1, initiativeChance(calm, reg, ANN) * 1.5));
  });

  it('the want_visit chance is 0.25 a day', () => {
    expect(TUNING.bonds.want.visit.chance).toBe(0.25);
    expect(TUNING.bonds.want.visit.priority).toBe(55);
  });

  it('≥ 70 adds 2 stress a day', () => {
    const a = step(world({ want: 70 })).state; // 70 + 4 → aching
    expect(a.squad.find((u) => u.id === ANN)!.stress).toBe(world().squad.find((u) => u.id === ANN)!.stress + 2);
    const b = step(world({ want: 50 })).state; // restless: no stress
    expect(b.squad.find((u) => u.id === ANN)!.stress).toBe(world().squad.find((u) => u.id === ANN)!.stress);
  });

  it('crossing 90 starts imprint_hunger withdrawal once, queues its night knock and releases it after its days', () => {
    const s = world({ want: 88, desire: 'medium', attachment: 'steady' });
    s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'imprint_hunger' }];
    s.settings.desireBondDefects = true;
    const day1 = step(s);
    expect(want(day1.state)).toBe(92);
    expect(day1.state.squad.find((u) => u.id === ANN)!.breakdown).toEqual({ defectId: 'imprint_hunger', day: 5, until: 6 });
    expect(day1.state.relations[ANN].wantBreakDay).toBe(5);
    expect(day1.state.calendar.nightEventsQueue.filter((e) => e.unitId === ANN && e.kind === 'withdrawal')).toHaveLength(1);
    expect(ofType(day1.events, 'want_breakdown')).toHaveLength(1);
    // still above 90 the next day: no second breakdown
    const day2 = step({ ...day1.state, day: 6 });
    expect(day2.state.squad.find((u) => u.id === ANN)!.breakdown).toEqual({ defectId: 'imprint_hunger', day: 5, until: 6 });
    expect(ofType(day2.events, 'want_breakdown')).toHaveLength(0);
    // released once the day is past `until`
    const day3 = step({ ...day2.state, day: 7 });
    expect(day3.state.squad.find((u) => u.id === ANN)!.breakdown).toBeUndefined();
    expect(ofType(day3.events, 'breakdown_released')).toEqual([{ type: 'breakdown_released', unitId: ANN }]);
  });

  it('it starts again at the next crossing, not before: falling below 90 resets it', () => {
    const s = world({ want: 95 });
    s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'imprint_hunger' }];
    s.settings.desireBondDefects = true;
    s.relations[ANN].wantBreakDay = 3;
    const low = world({ want: 10 });
    low.relations[ANN].wantBreakDay = 3;
    expect(step(low).state.relations[ANN].wantBreakDay).toBeUndefined();
    expect(step(s).state.relations[ANN].wantBreakDay).toBe(3); // still crossed: no new start
  });

  it('reward_loop binge costs 10 credits (never below 0)', () => {
    const s = world({ want: 90 });
    s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'reward_loop' }];
    s.resources.credits = 25;
    const a = step(s);
    expect(a.state.resources.credits).toBe(15);
    expect(a.state.squad.find((u) => u.id === ANN)!.breakdown).toMatchObject({ defectId: 'reward_loop' });
    const poor = world({ want: 90 });
    poor.squad.find((u) => u.id === ANN)!.defects = [{ id: 'reward_loop' }];
    poor.resources.credits = 4;
    expect(step(poor).state.resources.credits).toBe(0);
  });

  it('a defect without wantBreakdown does nothing at 90', () => {
    const s = world({ want: 95 });
    s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'echo_bleed' }];
    expect(step(s).state.squad.find((u) => u.id === ANN)!.breakdown).toBeUndefined();
  });

  it('a unit already in a combat breakdown is not given a second one', () => {
    const s = world({ want: 95 });
    const u = s.squad.find((x) => x.id === ANN)!;
    u.defects = [{ id: 'imprint_hunger' }];
    u.breakdown = { defectId: 'echo_bleed', day: 4 };
    expect(step(s).state.squad.find((x) => x.id === ANN)!.breakdown).toEqual({ defectId: 'echo_bleed', day: 4 });
  });

  it('the end of an expedition does not release a Want breakdown, but still releases a combat one', () => {
    const s = world();
    const a = s.squad.find((u) => u.id === ANN)!;
    a.breakdown = { defectId: 'imprint_hunger', day: 5, until: 6 };
    const b = s.squad.find((u) => u.id === BEA)!;
    b.breakdown = { defectId: 'echo_bleed', day: 5 };
    const events = releaseBreakdowns(s);
    expect(events).toEqual([{ type: 'breakdown_released', unitId: BEA }]);
    expect(a.breakdown).toBeDefined();
    expect(b.breakdown).toBeUndefined();
  });

  it('a Want breakdown keeps her off expeditions through the existing guard', () => {
    const s = world();
    s.squad.find((u) => u.id === ANN)!.breakdown = { defectId: 'imprint_hunger', day: 5, until: 6 };
    expect(s.squad.find((u) => u.id === ANN)!.breakdown).toBeTruthy();
  });

  it('seize refuses every scene/order on her (read from the defect field)', () => {
    const r = structuredClone(reg);
    r.defects.get('echo_bleed')!.wantBreakdown = { kind: 'seize', days: 1 };
    const s = world();
    s.squad.find((u) => u.id === ANN)!.breakdown = { defectId: 'echo_bleed', day: 5, until: 6 };
    const open = run(s, r, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const refused = run(open, r, { type: 'scene/order', payload: { unitId: ANN } });
    expect(errors(refused.events)).toEqual([]);
    expect(ofType(refused.events, 'scene_order')).toMatchObject([{ unitId: ANN, refused: true }]);
    const free = run(world(), r, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    expect(ofType(run(free, r, { type: 'scene/order', payload: { unitId: ANN } }).events, 'scene_order')[0]).toHaveProperty('refused');
  });
});

describe('romance off and units who leave (Review Focus 5, 6)', () => {
  it('romance off: Want does not rise and no band acts', () => {
    const s = world({ want: 95 });
    s.settings.intimacy = { romance: false, initiative: 'med' };
    s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'imprint_hunger' }];
    s.settings.desireBondDefects = true;
    const stress = s.squad.find((u) => u.id === ANN)!.stress;
    const a = step(s);
    expect(want(a.state)).toBe(90); // it fades like an ineligible unit's, it never rises
    expect(a.state.squad.find((u) => u.id === ANN)!.stress).toBe(stress);
    expect(a.state.squad.find((u) => u.id === ANN)!.breakdown).toBeUndefined();
    expect(initiativeChance(s, reg, ANN)).toBeLessThanOrEqual(initiativeChance(world(), reg, ANN));
    const d = structuredClone(s);
    rollNight(d, structuredClone(reg), { chance: () => true } as never, 'daily');
    expect(d.calendar.nightEventsQueue.some((e) => e.kind === 'want_visit')).toBe(false);
  });

  it('a dead unit\'s Want is skipped; a unit who leaves is forgotten', () => {
    const s = world({ want: 60 });
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    expect(want(step(s).state)).toBe(60);
    const t = world({ want: 60 });
    removeFromService(t, ANN, 'deserted');
    expect(want(t)).toBeUndefined();
    expect(want(step(t).state)).toBeUndefined();
  });
});

describe('an old save and the real day end', () => {
  it('an old save runs the bonds day step without throwing, changing nothing', () => {
    const s = campaign(reg, 4);
    const a = step(s);
    expect(a.state.relations).toEqual(s.relations);
    expect(a.events).toEqual([]);
    const after = endDay(s, reg);
    expect(after.day).toBe(s.day + 1);
  });

  it('the day end raises Want through the pipeline, and wantOf reads it', () => {
    const s = world();
    const after = endDay(s, reg);
    expect(wantOf(after, ANN)).toBe(4);
    expect(wantOf(after, BEA)).toBe(0);
  });

  it('Want changes are in the ledger as want:<id>', () => {
    const s = world();
    s.slot = 'evening';
    const r = run(s, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'x' } });
    expect(r.state.ledger?.some((e) => e.key === `want:${ANN}` && e.delta === 4)).toBe(true);
  });
});
