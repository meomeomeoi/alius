import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { arcAlignment, arcPaths, arcScale, wantedPath, type ArcPath } from '../../src/engine/arcs';
import { loyaltyDayStep } from '../../src/engine/loyalty/desertion';
import { seedRng } from '../../src/engine/rng';
import type { CampaignState, DefectInstance, Unit } from '../../src/engine/state/types';
import { campaign, ctxOf, endDay, errors, loadCore, ofType, run, setRelation, startFight } from '../helpers/loyalty';
import { leashLog } from '../../src/engine/leash/weekly';

let reg: Registries;
let base: CampaignState;
const ANN = 'unit_ann';
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4, { crimeId: 'purge' });
  base.day = 6;
  base.resources = { credits: 500, supplies: 50, plyx: 50 };
  base.leash.authorizationsLeft = 3;
  for (const u of base.squad) {
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
    u.defects = [{ id: 'echo_bleed' }];
    setRelation(base, u.id, { trust: 80, affinity: 30, stateId: 'confidant', band: 'steady', stateSince: 1 });
  }
  base.base.facilities.medbay = 5;
});

const clone = (seed = 1): CampaignState => {
  const s = structuredClone(base);
  s.rng = seedRng(seed);
  return s;
};
const unit = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const defect = (s: CampaignState, id = 'echo_bleed'): DefectInstance | undefined => unit(s).defects.find((d) => d.id === id);
const paths = (s: CampaignState, r: Registries = reg, defectId = 'echo_bleed') => arcPaths(s, r, ANN, defectId);
const avail = (s: CampaignState, r: Registries = reg): ArcPath[] => paths(s, r).filter((p) => p.available).map((p) => p.path);
const decide = (s: CampaignState, path: ArcPath, extra: Record<string, unknown> = {}, r: Registries = reg, defectId = 'echo_bleed') =>
  run(s, r, { type: 'arc/decide', payload: { unitId: ANN, defectId, path, ...extra } });
const withState = (stateId: string, medbay: number, patch: (s: CampaignState) => void = () => {}): CampaignState => {
  const s = clone();
  setRelation(s, ANN, { stateId });
  s.base.facilities.medbay = medbay;
  patch(s);
  return s;
};
/** One medbay visit with her as the companion in the current slot. */
const visit = (s: CampaignState) => run(s, reg, { type: 'activity/do', payload: { activityId: 'medbay', companionId: ANN } });

describe('arcAlignment and wantedPath', () => {
  it('alignment is the clamped mean of the values on the path\'s axes', () => {
    const u = structuredClone(unit(base));
    Object.assign(u.values, { autonomy: 3, corporate: 0, pragmatism: 3, ingroup: 0 });
    expect(arcAlignment(u, 'embrace')).toBe(1); // autonomy +, corporate −
    expect(arcAlignment(u, 'cure')).toBe(-1);
    expect(arcAlignment(u, 'manage')).toBe(1); // (3 + 0) / 3
    u.values.pragmatism = 1;
    expect(arcAlignment(u, 'manage')).toBeCloseTo(1 / 3);
    Object.assign(u.values, { autonomy: 0, corporate: 0, pragmatism: 0, ingroup: 0 });
    expect(arcAlignment(u, 'cure')).toBe(0);
  });

  it('ties go to manage, then embrace, then cure; only the offered paths compete', () => {
    const u = unit(base);
    expect(wantedPath(u, ['cure', 'embrace', 'manage'])).toBe('manage');
    expect(wantedPath(u, ['cure', 'embrace'])).toBe('embrace');
    expect(wantedPath(u, ['cure'])).toBe('cure');
    const v = structuredClone(u);
    v.values.corporate = 3;
    expect(wantedPath(v, ['cure', 'embrace', 'manage'])).toBe('cure');
  });
});

describe('which paths are offered', () => {
  it('nothing is available below trusted, before day 5, or for a lite defect', () => {
    expect(avail(withState('comrade', 5))).toEqual([]);
    expect(avail(withState('stranger', 5))).toEqual([]);
    expect(avail(withState('confidant', 5, (s) => { s.day = 4; }))).toEqual([]);
    expect(avail(withState('confidant', 5, (s) => { s.day = 5; }))).toEqual(['manage', 'embrace', 'cure']);
    expect(avail(withState('confidant', 5, (s) => { defect(s)!.lite = true; }))).toEqual([]);
    expect(avail(withState('confidant', 5, (s) => { unit(s).kind = 'grunt'; }))).toEqual([]);
    const why = paths(withState('comrade', 5)).map((p) => p.reason);
    expect(why.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);
  });

  it('trusted + medbay 1 offers manage only; confidant + medbay 3 adds embrace; medbay 5 adds cure', () => {
    expect(avail(withState('trusted', 1))).toEqual(['manage']);
    expect(avail(withState('trusted', 5))).toEqual(['manage']); // her bond only allows the mildest path
    expect(avail(withState('confidant', 1))).toEqual(['manage']);
    expect(avail(withState('confidant', 3))).toEqual(['manage', 'embrace']);
    expect(avail(withState('confidant', 5))).toEqual(['manage', 'embrace', 'cure']);
    for (const state of ['kindred', 'lover', 'devoted']) expect(avail(withState(state, 5)), state).toEqual(['manage', 'embrace', 'cure']);
    // unavailable paths say why
    const p = paths(withState('confidant', 1));
    expect(p.find((x) => x.path === 'embrace')!.reason).toMatch(/medbay/i);
  });

  it('defect_arc_early lifts the cap by one', () => {
    const plain = campaign(reg, 4, { crimeId: 'purge' });
    const early = campaign(reg, 4, { crimeId: 'experimentation' });
    for (const s of [plain, early]) {
      s.day = 6;
      s.resources = { credits: 500, supplies: 50, plyx: 50 };
      setRelation(s, ANN, { stateId: 'confidant' });
      s.base.facilities.medbay = 1;
    }
    expect(avail(plain)).toEqual(['manage']);
    expect(avail(early)).toEqual(['manage', 'embrace']);
  });

  it('an arcFlag gates the arc', () => {
    const r = { ...reg } as Registries;
    r.defects = new Map(reg.defects);
    r.defects.set('echo_bleed', { ...reg.defects.get('echo_bleed')!, arcFlag: 'shared_secret' });
    const s = withState('confidant', 5);
    expect(avail(s, r)).toEqual([]);
    expect(paths(s, r)[0].reason).toMatch(/not ready|ask/i);
    s.relations[ANN].flags.push('shared_secret');
    expect(avail(s, r)).toEqual(['manage', 'embrace', 'cure']);
  });

  it('a decided defect offers nothing more', () => {
    const s = withState('confidant', 5);
    defect(s)!.arc = 'manage';
    expect(avail(s)).toEqual([]);
  });

  it('a path she cannot afford is unavailable and says what is missing', () => {
    const s = withState('confidant', 5, (x) => { x.resources.credits = 10; });
    const cure = paths(s).find((p) => p.path === 'cure')!;
    expect(cure).toMatchObject({ available: false, cost: { credits: 60, plyx: 10 } });
    expect(cure.reason).toMatch(/credits/);
  });

  it('a unit with autonomy +3 wants embrace and refuses cure; with corporate +3 and autonomy −3 it is the reverse', () => {
    const a = withState('confidant', 5, (s) => { unit(s).values.autonomy = 3; });
    const pa = paths(a);
    expect(pa.map((p) => [p.path, p.wanted, p.refuses])).toEqual([['manage', false, false], ['embrace', true, false], ['cure', false, true]]);
    const b = withState('confidant', 5, (s) => Object.assign(unit(s).values, { corporate: 3, autonomy: -3 }));
    const pb = paths(b);
    expect(pb.map((p) => [p.path, p.wanted, p.refuses])).toEqual([['manage', false, false], ['embrace', false, true], ['cure', true, false]]);
    expect(pa[0].text).toBe('Journaling ritual with the commander.');
  });

  it('the only path on offer is the wanted one, however she feels', () => {
    const s = withState('trusted', 1, (x) => Object.assign(unit(x).values, { pragmatism: -3, ingroup: -3 }));
    expect(paths(s).filter((p) => p.available).map((p) => [p.path, p.wanted, p.refuses])).toEqual([['manage', true, false]]);
  });
});

describe('deciding', () => {
  it('the wanted path raises Trust, another path lowers it', () => {
    const s = withState('confidant', 5, (x) => { unit(x).values.autonomy = 3; setRelation(x, ANN, { trust: 50 }); });
    const embrace = decide(s, 'embrace');
    expect(errors(embrace.events)).toEqual([]);
    expect(embrace.state.relations[ANN].trust).toBeGreaterThan(50);
    expect(embrace.state.relations[ANN].history.at(-1)).toMatchObject({ type: 'decision_aligned', severity: 'major' });
    expect(defect(embrace.state)).toMatchObject({ arc: 'embrace', arcSteps: { done: 0, needed: 2 } });
    expect(embrace.state.resources.plyx).toBe(50 - 5);
    expect(ofType(embrace.events, 'arc_decided')).toEqual([{ type: 'arc_decided', unitId: ANN, defectId: 'echo_bleed', path: 'embrace', forced: false }]);
    const cure = decide(s, 'cure', { compel: true });
    expect(cure.state.relations[ANN].trust).toBeLessThan(50);
    expect(cure.state.relations[ANN].history.some((h) => h.type === 'decision_violated' && h.severity === 'extreme')).toBe(true);
  });

  it('a path that matches her values but is not the one she wants is violated at major, with no loss', () => {
    const s = withState('confidant', 5, (x) => { unit(x).values.autonomy = 3; setRelation(x, ANN, { trust: 50 }); });
    const manage = decide(s, 'manage'); // m = 0: not refused, not wanted
    expect(errors(manage.events)).toEqual([]);
    expect(manage.state.relations[ANN].history.at(-1)).toMatchObject({ type: 'decision_violated', severity: 'major' });
    expect(manage.state.relations[ANN].trust).toBe(50);
  });

  it('a refused path fails without compel and with compel costs an authorization and Trust', () => {
    const s = withState('confidant', 5, (x) => { unit(x).values.autonomy = 3; setRelation(x, ANN, { trust: 60 }); });
    const no = decide(s, 'cure');
    expect(no.state).toBe(s);
    expect(errors(no.events)).toMatchObject([{ message: expect.stringContaining('refuses') }]);
    const yes = decide(s, 'cure', { compel: true });
    expect(errors(yes.events)).toEqual([]);
    expect(yes.state.leash.authorizationsLeft).toBe(2);
    expect(leashLog(yes.state)).toMatchObject([{ unitId: ANN, kind: 'compel', context: 'arc', outcome: 'done' }]);
    expect(yes.state.relations[ANN].trust).toBeLessThan(60 - 15 + 1);
    expect(defect(yes.state)).toMatchObject({ arc: 'cure', arcSteps: { done: 0, needed: 3 } });
    expect(yes.state.resources).toMatchObject({ credits: 440, plyx: 40 });
    expect(ofType(yes.events, 'arc_decided')).toMatchObject([{ path: 'cure', forced: true }]);
    // no authorization left: nothing happens
    const broke = structuredClone(s);
    broke.leash.authorizationsLeft = 0;
    expect(decide(broke, 'cure', { compel: true }).state).toBe(broke);
  });

  it('a compel that fails costs the authorization and Trust and decides nothing', () => {
    const r2 = { ...reg } as Registries;
    r2.defects = new Map(reg.defects);
    r2.defects.set('echo_bleed', { ...reg.defects.get('echo_bleed')!, leash: { costMult: 1, failChance: 1 } });
    const s = withState('confidant', 5, (x) => { unit(x).values.autonomy = 3; });
    const r = decide(s, 'cure', { compel: true }, r2);
    expect(errors(r.events)).toEqual([]);
    expect(defect(r.state)!.arc).toBeUndefined();
    expect(r.state.leash.authorizationsLeft).toBe(2);
    expect(r.state.resources).toEqual(s.resources);
    expect(ofType(r.events, 'arc_decided')).toEqual([]);
    expect(leashLog(r.state)[0].outcome).toBe('failed');
  });

  it('compel on a path she does not refuse is ignored', () => {
    const s = withState('confidant', 5);
    const r = decide(s, 'manage', { compel: true });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.leash.authorizationsLeft).toBe(3);
    expect(ofType(r.events, 'arc_decided')).toMatchObject([{ forced: false }]);
  });

  it('a compelled cure is a mutiny trigger', () => {
    const s = withState('confidant', 5, (x) => { unit(x).values.autonomy = 3; });
    const r = decide(s, 'cure', { compel: true });
    expect(r.state.disloyalty!.units[ANN].trigger).toEqual({ kind: 'forced_cure', day: s.day });
  });

  it('an unaffordable path is refused and nothing is paid', () => {
    const s = withState('confidant', 5, (x) => { x.resources = { credits: 59, supplies: 50, plyx: 50 }; });
    const r = decide(s, 'cure');
    expect(r.state).toBe(s);
    expect(errors(r.events)).toHaveLength(1);
    expect(decide(withState('confidant', 5, (x) => { x.resources.plyx = 9; }), 'cure').state.resources.plyx).toBe(9);
  });

  it('only one arc per defect, and only offered paths', () => {
    const s = withState('confidant', 5);
    const once = decide(s, 'manage').state;
    expect(errors(decide(once, 'embrace').events)).toHaveLength(1);
    expect(errors(decide(withState('trusted', 5), 'cure').events)).toHaveLength(1);
    expect(errors(decide(s, 'teleport' as never).events)).toHaveLength(1);
    expect(errors(decide(s, 'manage', {}, reg, 'ghost_defect').events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'arc/decide', payload: { unitId: 'ghost', defectId: 'echo_bleed', path: 'manage' } }).events)).toHaveLength(1);
  });
});

describe('arc steps through the medbay', () => {
  it('medbay visits complete manage in 1, embrace in 2 and cure in 3 days, one step per day', () => {
    for (const [path, needed] of [['manage', 1], ['embrace', 2], ['cure', 3]] as const) {
      let s = decide(withState('confidant', 5), path, { compel: true }).state;
      expect(defect(s)!.arcSteps).toEqual({ done: 0, needed });
      const log: string[] = [];
      for (let day = 1; day <= needed; day++) {
        const r = visit(s);
        expect(errors(r.events), `${path} day ${day}`).toEqual([]);
        s = r.state;
        log.push(...r.events.filter((e) => e.type === 'arc_step' || e.type === 'arc_completed').map((e) => e.type as string));
        // a second visit the same day does not count (the cure removes the defect, so look the arc up while it is there)
        if (day < needed) {
          expect(defect(s)!.arcSteps!.done).toBe(day);
          const again = visit(s);
          expect(defect(again.state)?.arcSteps?.done ?? needed).toBe(day);
          s = endDay(s, reg);
        }
      }
      expect(log, path).toEqual([...Array(needed - 1).fill('arc_step'), 'arc_completed']);
      if (path !== 'cure') expect(defect(s)).toMatchObject({ arc: path, arcSteps: { done: needed, needed } });
    }
  });

  it('a visit without her as the companion advances nothing', () => {
    const s = decide(withState('confidant', 5), 'manage').state;
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'medbay', unitIds: [ANN], focus: 'units' } });
    expect(errors(r.events)).toEqual([]);
    expect(defect(r.state)!.arcSteps!.done).toBe(0);
    const other = run(s, reg, { type: 'activity/do', payload: { activityId: 'medbay', companionId: 'unit_bea' } });
    expect(defect(other.state)!.arcSteps!.done).toBe(0);
  });

  it('a completed cure removes the defect and its combat effects and remembers it', () => {
    let s = decide(withState('confidant', 5), 'cure').state;
    for (let day = 1; day <= 3; day++) {
      s = visit(s).state;
      if (day < 3) s = endDay(s, reg);
    }
    expect(defect(s)).toBeUndefined();
    expect(unit(s).defects).toEqual([]);
    const fact = s.memory.facts.find((f) => f.about.includes(ANN) && f.tags.includes('cure'));
    expect(fact).toMatchObject({ importance: 4 });
    expect(fact!.text).toContain('Ann');
    const fight = startFight(s, reg);
    const sources = fight.combat!.combatants.find((c) => c.unitId === ANN)!.passives.map((p) => p.source);
    expect(sources.some((x) => x.startsWith('defect:echo_bleed'))).toBe(false);
  });
});

describe('arc scaling in combat', () => {
  const echoDown = (s: CampaignState) => {
    const fight = startFight(s, reg);
    const passives = fight.combat!.combatants.find((c) => c.unitId === ANN)!.passives;
    return passives.find((p) => p.source === 'defect:echo_bleed:down') as unknown as { amount: number } | undefined;
  };

  it('arcScale: incomplete arcs and unset arcs do nothing', () => {
    expect(arcScale({ id: 'x' }, 10)).toEqual({ upside: 1, downside: 1 });
    expect(arcScale({ id: 'x', arc: 'manage', arcSteps: { done: 0, needed: 1 }, upkeepDay: 10 }, 10)).toEqual({ upside: 1, downside: 1 });
    expect(arcScale({ id: 'x', arc: 'embrace', arcSteps: { done: 1, needed: 2 } }, 10)).toEqual({ upside: 1, downside: 1 });
  });

  it('arcScale: managed halves the downside while upkeep is at most 5 days old; embraced is 1.5 / 1.5', () => {
    const managed = (upkeepDay?: number): DefectInstance => ({ id: 'x', arc: 'manage', arcSteps: { done: 1, needed: 1 }, ...(upkeepDay !== undefined ? { upkeepDay } : {}) });
    expect(arcScale(managed(10), 10)).toEqual({ upside: 1, downside: 0.5 });
    expect(arcScale(managed(5), 10)).toEqual({ upside: 1, downside: 0.5 });
    expect(arcScale(managed(4), 10)).toEqual({ upside: 1, downside: 1 });
    expect(arcScale(managed(), 10)).toEqual({ upside: 1, downside: 1 });
    expect(arcScale({ id: 'x', arc: 'embrace', arcSteps: { done: 2, needed: 2 } }, 10)).toEqual({ upside: 1.5, downside: 1.5 });
  });

  it('managed halves downside effects in a built combat while upkeep is fresh and not after 6 days', () => {
    const s = clone();
    s.day = 20;
    Object.assign(defect(s)!, { arc: 'manage', arcSteps: { done: 1, needed: 1 } });
    expect(echoDown(s)!.amount).toBe(2); // never maintained
    defect(s)!.upkeepDay = 20;
    expect(echoDown(s)!.amount).toBe(1);
    defect(s)!.upkeepDay = 15;
    expect(echoDown(s)!.amount).toBe(1); // 5 days old
    defect(s)!.upkeepDay = 14;
    expect(echoDown(s)!.amount).toBe(2); // 6 days old
  });

  it('embraced multiplies upside and downside by 1.5', () => {
    const s = clone();
    unit(s).defects = [{ id: 'imprint_fracture', arc: 'embrace', arcSteps: { done: 2, needed: 2 } }];
    const fight = startFight(s, reg);
    const passives = fight.combat!.combatants.find((c) => c.unitId === ANN)!.passives as Array<{ source: string; type: string; pct?: number; chance?: number }>;
    expect(passives.find((p) => p.source === 'defect:imprint_fracture')!.pct).toBeCloseTo(-75);
    expect(passives.find((p) => p.source === 'defect:imprint_fracture:down')!.chance).toBeCloseTo(0.15);
    // an unembraced twin is untouched
    const plain = clone();
    unit(plain).defects = [{ id: 'imprint_fracture' }];
    const p2 = startFight(plain, reg).combat!.combatants.find((c) => c.unitId === ANN)!.passives as Array<{ source: string; pct?: number }>;
    expect(p2.find((p) => p.source === 'defect:imprint_fracture')!.pct).toBe(-50);
  });
});

describe('end to end', () => {
  it('the flow works end to end for echo_bleed, imprint_fracture and hunger_loop', () => {
    for (const [defectId, path] of [['echo_bleed', 'manage'], ['imprint_fracture', 'embrace'], ['hunger_loop', 'cure']] as const) {
      let s = withState('confidant', 5);
      unit(s).defects = [{ id: defectId }];
      s.resources = { credits: 500, supplies: 50, plyx: 50 };
      // she is offered the paths and wants one
      const offered = arcPaths(s, reg, ANN, defectId);
      expect(offered.filter((p) => p.available).map((p) => p.path), defectId).toEqual(['manage', 'embrace', 'cure']);
      expect(offered.filter((p) => p.wanted)).toHaveLength(1);
      expect(offered.every((p) => p.text.length > 0)).toBe(true);
      const decided = decide(s, path, { compel: false }, reg, defectId);
      expect(errors(decided.events), defectId).toEqual([]);
      s = decided.state;
      const needed = { manage: 1, embrace: 2, cure: 3 }[path];
      let completed = 0;
      for (let day = 1; day <= needed; day++) {
        const r = visit(s);
        completed += ofType(r.events, 'arc_completed').length;
        s = r.state;
        if (day < needed) s = endDay(s, reg);
      }
      expect(completed, defectId).toBe(1);
      const d = unit(s).defects.find((x) => x.id === defectId);
      if (path === 'cure') expect(d).toBeUndefined();
      else expect(d).toMatchObject({ arc: path, arcSteps: { done: needed, needed } });
    }
  });
});

describe('the unlock', () => {
  it('the unlock is raised once, as a night entry', () => {
    const s = withState('confidant', 5);
    const events = loyaltyDayStep(s, ctxOf(s, reg));
    expect(ofType(events, 'arc_unlocked').filter((e) => e.unitId === ANN)).toEqual([{ type: 'arc_unlocked', unitId: ANN, defectId: 'echo_bleed' }]);
    expect(ofType(events, 'arc_unlocked')).toHaveLength(4); // every confidant raises her own
    const entries = s.calendar.nightEventsQueue.filter((n) => n.kind === 'arc_talk' && n.unitId === ANN);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ priority: 45, ignore: { event: 'dismissed', severity: 'moderate' } });
    expect(entries[0].framing).toContain('Ann');
    expect(s.relations[ANN].flags).toContain('arc_raised');
    // the next day it is not raised again
    s.calendar.nightEventsQueue = [];
    s.day += 1;
    expect(ofType(loyaltyDayStep(s, ctxOf(s, reg)), 'arc_unlocked').filter((e) => e.unitId === ANN)).toEqual([]);
    expect(s.calendar.nightEventsQueue.filter((n) => n.kind === 'arc_talk')).toEqual([]);
  });

  it('nobody is told about an arc that is not available, a grunt, or a defect already on a path', () => {
    const none = withState('comrade', 5, (x) => setRelation(x, ANN, { trust: 22, affinity: 0 })); // low enough that the day step keeps her a comrade
    expect(ofType(loyaltyDayStep(none, ctxOf(none, reg)), 'arc_unlocked').filter((e) => e.unitId === ANN)).toEqual([]);
    const decided = withState('confidant', 5);
    defect(decided)!.arc = 'manage';
    expect(ofType(loyaltyDayStep(decided, ctxOf(decided, reg)), 'arc_unlocked').filter((e) => e.unitId === ANN)).toEqual([]);
    const grunt = withState('confidant', 5, (s) => { unit(s).kind = 'grunt'; });
    expect(ofType(loyaltyDayStep(grunt, ctxOf(grunt, reg)), 'arc_unlocked').filter((e) => e.unitId === ANN)).toEqual([]);
  });

  it('an arc whose defect vanished from the content never throws', () => {
    const s = withState('confidant', 5);
    unit(s).defects = [{ id: 'ghost_defect', arc: 'manage', arcSteps: { done: 0, needed: 1 } }];
    expect(() => loyaltyDayStep(s, ctxOf(s, reg))).not.toThrow();
    expect(paths(s, reg, 'ghost_defect').every((p) => !p.available)).toBe(true);
    expect(errors(visit(s).events)).toEqual([]);
  });
});
