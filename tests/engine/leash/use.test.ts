import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { leashCost, witnessesOf, removeFromService } from '../../../src/engine/leash/use';
import { leashLog } from '../../../src/engine/leash/weekly';
import { loyaltyRecord } from '../../../src/engine/loyalty/state';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation, withDefect } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState; // Vesper start, purge crime (no Leash trust cost), 4 named units
let ANN: string;
let BEA: string;
let CAT: string;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4, { crimeId: 'purge' });
  [ANN, BEA, CAT] = base.squad.map((u) => u.id);
  for (const u of base.squad) {
    setRelation(base, u.id, { trust: 50, affinity: 20, stateId: 'comrade' });
    u.defects = [{ id: 'echo_bleed', arc: 'manage' }];
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  }
});

const clone = () => structuredClone(base);
const withRegs = (patch: (d: Registries['defects']) => void): Registries => {
  const r = { ...reg } as Registries;
  r.defects = new Map(reg.defects);
  patch(r.defects);
  return r;
};
/** A scene with `ids` where `ANN` has just refused an order. */
function refusalScene(s: CampaignState, ids: string[] = [ANN, BEA]): CampaignState {
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  r.state.scene!.refusals = [{ unitId: ANN, exchange: 0 }];
  return r.state;
}
const compel = (s: CampaignState, r: Registries = reg, unitId = ANN) =>
  run(s, r, { type: 'leash/compel', payload: { unitId, context: 'scene' } });
const stress = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!.stress;

describe('leash costs', () => {
  it('compel is 15/10/15', () => {
    expect(leashCost(base, reg, ANN, 'compel')).toEqual({ trust: 15, affinity: 10, stress: 15, failChance: 0 });
  });

  it('imprint_fracture doubles to 30/20 and may fail at 0.25', () => {
    const s = withDefect(clone(), ANN, 'imprint_fracture');
    expect(leashCost(s, reg, ANN, 'compel')).toEqual({ trust: 30, affinity: 20, stress: 15, failChance: 0.25 });
  });

  it('compliance_craving halves to 8/5', () => {
    const s = withDefect(clone(), ANN, 'compliance_craving');
    expect(leashCost(s, reg, ANN, 'compel')).toMatchObject({ trust: 8, affinity: 5, failChance: 0 });
  });

  it('the mutiny crime adds 5 Trust', () => {
    const s = campaign(reg, 2, { crimeId: 'mutiny' });
    expect(leashCost(s, reg, s.squad[0].id, 'compel')).toMatchObject({ trust: 20, affinity: 10 });
    expect(leashCost(s, reg, s.squad[0].id, 'suppress').trust).toBe(30);
  });

  it('suppress is 25 Trust and 10 stress', () => {
    expect(leashCost(base, reg, ANN, 'suppress')).toEqual({ trust: 25, affinity: 0, stress: 10, failChance: 0 });
  });
});

describe('compel', () => {
  it('spends one authorization, logs { unitId, kind, day }, sets leashed and applies the exact cost', () => {
    const s = refusalScene(clone());
    const r = compel(s);
    expect(errors(r.events)).toEqual([]);
    const after = r.state;
    expect(after.leash.authorizationsLeft).toBe(s.leash.authorizationsLeft - 1);
    expect(leashLog(after)).toEqual([{ no: 1, unitId: ANN, kind: 'compel', day: 1, context: 'scene', outcome: 'done' }]);
    expect(after.relations[ANN].flags).toContain('leashed');
    expect(after.relations[ANN].trust).toBe(50 - 15);
    expect(after.relations[ANN].affinity).toBe(20 - 10);
    expect(stress(after, ANN)).toBe(stress(s, ANN) + 15);
    expect(after.scene!.refusals).toEqual([]);
    expect(loyaltyRecord(structuredClone(after), ANN).trigger).toEqual({ kind: 'leash', day: 1 });
    expect(ofType(r.events, 'leash_used')).toEqual([{ type: 'leash_used', kind: 'compel', unitId: ANN, no: 1, outcome: 'done' }]);
    expect(ofType(r.events, 'leash_changed')).toEqual([{ type: 'leash_changed', amount: -1, left: s.leash.authorizationsLeft - 1 }]);
    expect(ofType(r.events, 'scene_compelled')).toEqual([{ type: 'scene_compelled', unitId: ANN, forced: true }]);
    expect(after.relations[ANN].history.some((h) => h.kind === 'event' && h.type === 'coerced')).toBe(true);
  });

  it('a failed compel still costs and reports forced: false', () => {
    const r2 = withRegs((d) => d.set('imprint_fracture', { ...reg.defects.get('imprint_fracture')!, leash: { costMult: 2, failChance: 1 } }));
    const s = refusalScene(withDefect(clone(), ANN, 'imprint_fracture'));
    const r = compel(s, r2);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'scene_compelled')).toEqual([{ type: 'scene_compelled', unitId: ANN, forced: false }]);
    expect(r.state.leash.authorizationsLeft).toBe(s.leash.authorizationsLeft - 1);
    expect(leashLog(r.state)[0]).toMatchObject({ kind: 'compel', outcome: 'failed' });
    expect(r.state.relations[ANN].trust).toBe(50 - 30);
    // her refusal stands: the order did not go through
    expect(r.state.scene!.refusals).toEqual([{ unitId: ANN, exchange: 0 }]);
  });

  it('a request with no authorization changes nothing', () => {
    const s = refusalScene(clone());
    s.leash.authorizationsLeft = 0;
    const r = compel(s);
    expect(r.state).toBe(s);
    expect(errors(r.events)).toMatchObject([{ code: 'handler_failed', message: expect.stringContaining('authorization') }]);
  });

  it('a dead, deserted or terminated target is refused', () => {
    for (const status of ['dead', 'deserted', 'terminated'] as const) {
      const s = refusalScene(clone());
      s.squad.find((u) => u.id === ANN)!.status = status;
      const r = compel(s);
      expect(r.state, status).toBe(s);
      expect(errors(r.events), status).toHaveLength(1);
    }
  });

  it('needs her standing refusal in the open scene', () => {
    const noScene = compel(clone());
    expect(errors(noScene.events)).toHaveLength(1);
    const s = refusalScene(clone());
    s.scene!.refusals = [];
    expect(errors(compel(s).events)).toHaveLength(1);
    const other = refusalScene(clone());
    expect(errors(compel(other, reg, BEA).events)).toHaveLength(1);
  });

  it('a second compel for the same refusal is refused', () => {
    const once = compel(refusalScene(clone())).state;
    const again = compel(once);
    expect(again.state).toBe(once);
    expect(errors(again.events)).toHaveLength(1);
  });

  it('a unit outside the scene is refused', () => {
    const s = refusalScene(clone(), [BEA, CAT]);
    expect(errors(compel(s).events)).toHaveLength(1);
  });

  it('a witness with autonomy +3 loses more than one with autonomy 0', () => {
    const s = refusalScene(clone(), [ANN, BEA, CAT]);
    s.squad.find((u) => u.id === BEA)!.values.autonomy = 3;
    const r = compel(s);
    const d = (id: string) => r.state.relations[id].trust - s.relations[id].trust;
    expect(d(BEA)).toBeLessThan(d(CAT));
    expect(d(CAT)).toBeLessThan(0);
    expect(stress(r.state, BEA)).toBeGreaterThan(stress(r.state, CAT)); // a bigger scale also stresses more
  });

  it('a witness with autonomy −3 and corporate +3 approves: Trust rises and she is not stressed', () => {
    const s = refusalScene(clone(), [ANN, BEA, CAT]);
    Object.assign(s.squad.find((u) => u.id === CAT)!.values, { autonomy: -3, corporate: 3 });
    const r = compel(s);
    expect(r.state.relations[CAT].trust).toBeGreaterThan(s.relations[CAT].trust);
    expect(stress(r.state, CAT)).toBe(stress(s, CAT));
  });

  it('witnesses are the scene, else the expedition party, else the active roster; never her', () => {
    const s = refusalScene(clone(), [ANN, BEA]);
    expect(witnessesOf(s, ANN)).toEqual([BEA]);
    const open = clone();
    expect(witnessesOf(open, ANN).sort()).toEqual([BEA, CAT, base.squad[3].id].sort());
    open.squad.find((u) => u.id === CAT)!.status = 'deserted';
    expect(witnessesOf(open, ANN)).not.toContain(CAT);
  });

  it('two uses and Trust under 30 enter resentful', () => {
    let s = refusalScene(clone());
    s.relations[ANN].trust = 55;
    s = compel(s).state;
    expect(s.relations[ANN].stateId).not.toBe('resentful'); // 55 → 40
    s.scene!.refusals = [{ unitId: ANN, exchange: 1 }];
    s = compel(s).state; // 40 → 25
    expect(s.relations[ANN].trust).toBe(25);
    expect(s.relations[ANN].stateId).toBe('resentful');
    expect(leashLog(s).filter((e) => e.unitId === ANN)).toHaveLength(2);
  });

  it('a grunt pays no Affinity', () => {
    const s = refusalScene(clone());
    s.squad.find((u) => u.id === ANN)!.kind = 'grunt';
    const r = compel(s);
    expect(r.state.relations[ANN].affinity).toBe(20);
    expect(r.state.relations[ANN].trust).toBe(35);
  });
});

describe('suppress', () => {
  const confrontation = (at: 'night' | 'mission_start' = 'mission_start'): CampaignState => {
    const s = clone();
    s.disloyalty = { units: {}, open: { kind: 'desertion', unitId: ANN, day: 1, at } };
    return s;
  };

  it('needs an open confrontation for her', () => {
    expect(errors(run(clone(), reg, { type: 'leash/suppress', payload: { unitId: ANN } }).events)).toHaveLength(1);
    expect(errors(run(confrontation(), reg, { type: 'leash/suppress', payload: { unitId: BEA } }).events)).toHaveLength(1);
  });

  it('stresses the rest of the squad and pauses desertion checks', () => {
    const s = confrontation();
    const r = run(s, reg, { type: 'leash/suppress', payload: { unitId: ANN } });
    expect(errors(r.events)).toEqual([]);
    const after = r.state;
    expect(after.relations[ANN].trust).toBe(50 - 25);
    expect(after.relations[ANN].affinity).toBe(20);
    expect(stress(after, ANN)).toBe(stress(s, ANN) + 10);
    for (const id of [BEA, CAT]) expect(stress(after, id)).toBe(stress(s, id) + 5);
    expect(after.disloyalty!.open).toBeUndefined();
    expect(after.disloyalty!.units[ANN].nextCheckDay).toBe(s.day + 3);
    expect(after.leash.authorizationsLeft).toBe(s.leash.authorizationsLeft - 1);
    expect(leashLog(after)[0]).toMatchObject({ unitId: ANN, kind: 'suppress', context: 'desertion', outcome: 'done' });
    expect(after.squad.find((u) => u.id === ANN)!.status).toBe('active');
    expect(after.slot).toBe(s.slot); // a mission-start answer spends no slot
  });

  it('a Night answer ends the Night slot', () => {
    const s = confrontation('night');
    s.slot = 'night';
    const r = run(s, reg, { type: 'leash/suppress', payload: { unitId: ANN } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.slot).toBe('morning');
    expect(r.state.day).toBe(s.day + 1);
  });
});

describe('terminate', () => {
  const caused = (): CampaignState => {
    const s = clone();
    loyaltyRecord(s, ANN).cause = { kind: 'attack', day: 1 };
    return s;
  };
  const term = (s: CampaignState, r: Registries = reg) => run(s, r, { type: 'leash/terminate', payload: { unitId: ANN } });
  /** The first seed in 1…60 whose roll gives the wanted verdict. */
  function withVerdict(s: CampaignState, approved: boolean, r: Registries = reg): ReturnType<typeof term> {
    for (let seed = 1; seed <= 60; seed++) {
      const t = structuredClone(s);
      t.rng = seedRng(seed);
      const out = term(t, r);
      if (ofType(out.events, 'unit_terminated').length === (approved ? 1 : 0) && errors(out.events).length === 0) return out;
    }
    throw new Error('no seed found');
  }

  it('without cause is refused', () => {
    const s = clone();
    const r = term(s);
    expect(r.state).toBe(s);
    expect(errors(r.events)).toHaveLength(1);
  });

  it('a denied terminate costs nothing, is logged and cannot be re-filed today', () => {
    const s = caused();
    const r = withVerdict(s, false);
    expect(r.state.leash.authorizationsLeft).toBe(s.leash.authorizationsLeft);
    expect(leashLog(r.state)).toMatchObject([{ unitId: ANN, kind: 'terminate', outcome: 'denied' }]);
    expect(r.state.squad.find((u) => u.id === ANN)!.status).toBe('active');
    expect(r.state.disloyalty!.units[ANN].deniedDay).toBe(1);
    const again = term(r.state);
    expect(again.state).toBe(r.state);
    expect(errors(again.events)).toHaveLength(1);
    // tomorrow it can be filed again
    const tomorrow = structuredClone(r.state);
    tomorrow.day = 2;
    expect(errors(term(tomorrow).events)).toEqual([]);
  });

  it('an approved terminate removes the unit for good and every named unit reacts by mercy and ingroup', () => {
    const s = caused();
    s.squad.find((u) => u.id === BEA)!.values.mercy = 3; // mercy +3 loses: the order violated what she holds dear
    s.squad.find((u) => u.id === CAT)!.values.mercy = -3; // mercy −3 gains
    const r = withVerdict(s, true);
    const after = r.state;
    expect(after.squad.find((u) => u.id === ANN)!.status).toBe('terminated');
    expect(after.roster.activeIds).not.toContain(ANN);
    expect(after.leash.authorizationsLeft).toBe(s.leash.authorizationsLeft - 1);
    expect(leashLog(after)).toMatchObject([{ unitId: ANN, kind: 'terminate', outcome: 'done' }]);
    expect(after.relations[BEA].trust).toBeLessThan(s.relations[BEA].trust);
    expect(after.relations[CAT].trust).toBeGreaterThan(s.relations[CAT].trust);
    expect(after.memory.facts.some((f) => f.importance === 5 && f.knownBy.includes('*') && f.about.includes(ANN))).toBe(true);
    expect(after.memory.chronicle.length).toBeGreaterThan(s.memory.chronicle.length);
    expect(ofType(r.events, 'unit_terminated')).toEqual([{ type: 'unit_terminated', unitId: ANN }]);
    // irreversible: she cannot be targeted again
    expect(errors(term(after).events)).toHaveLength(1);
  });

  it('is refused while a scene with her is open', () => {
    const s = refusalScene(caused());
    const r = term(s);
    expect(r.state).toBe(s);
    expect(errors(r.events)).toHaveLength(1);
  });

  it('the approval chance follows the corporation and standing', () => {
    // approval 0 and standing 0 → clamp 0.1: most seeds deny
    const r0 = { ...reg } as Registries;
    r0.corporations = new Map(reg.corporations);
    const own = base.commander.corporationId as string;
    r0.corporations.set(own, { ...reg.corporations.get(own)!, leash: { weekly: 3, approval: 0 } });
    let approved = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const t = caused();
      t.rng = seedRng(seed);
      if (ofType(term(t, r0).events, 'unit_terminated').length === 1) approved++;
    }
    expect(approved).toBeGreaterThan(5);
    expect(approved).toBeLessThan(45); // ≈ 10 % of 200
  });
});

describe('removeFromService', () => {
  it('a removed unit leaves no dangling references', () => {
    const s = clone();
    s.squad.find((u) => u.id === ANN)!.equipment = { weapon: 'it1', upper: 'it2' };
    s.squad.find((u) => u.id === ANN)!.breakdown = { defectId: 'echo_bleed', day: 1 };
    s.inventory.push({ uid: 'it1', itemId: 'x', rarity: 'standard', upgrade: 0, affixes: [] }, { uid: 'it2', itemId: 'y', rarity: 'standard', upgrade: 0, affixes: [] });
    s.calendar.nightEventsQueue.push(
      { id: 'n1', unitId: ANN, kind: 'visit', priority: 10, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 },
      { id: 'n2', unitId: BEA, kind: 'visit', priority: 10, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 },
    );
    s.proposals = [
      { id: 'p1', unitId: ANN, kind: 'kiss', from: 'unit', day: 1, channel: 'dm', targetState: 'lover', needsDisclosure: false },
      { id: 'p2', unitId: BEA, kind: 'kiss', from: 'unit', day: 1, channel: 'dm', targetState: 'lover', needsDisclosure: false },
    ];
    s.calendar.pendingScene = { unitId: ANN, day: 1, slot: 'morning' };
    s.calendar.nightEvent = { id: 'n0', unitId: ANN, kind: 'desertion', priority: 95, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 };
    s.dilemmas = { open: { id: 'dl1', templateId: 'dil_rations', scale: 'minor', context: 'base', status: 'requested', attempts: 0, units: [ANN, BEA] } } as CampaignState['dilemmas'];
    removeFromService(s, ANN, 'deserted');
    const ann = s.squad.find((u) => u.id === ANN)!;
    expect(ann.status).toBe('deserted');
    expect(s.roster.activeIds).not.toContain(ANN);
    expect(ann.equipment).toEqual({});
    expect(s.inventory.map((i) => i.uid)).toEqual(['it1', 'it2']); // items stay in the stash
    expect(ann.breakdown).toBeUndefined();
    expect(s.calendar.nightEventsQueue.map((n) => n.id)).toEqual(['n2']);
    expect(s.proposals.map((p) => p.id)).toEqual(['p2']);
    expect(s.calendar.pendingScene).toBeUndefined();
    expect(s.calendar.nightEvent).toBeUndefined();
    expect(s.dilemmas!.open!.units).toEqual([BEA]);
  });

  it('a Terminate approved at her own night does not strand the night', () => {
    const s = clone();
    loyaltyRecord(s, ANN).cause = { kind: 'attack', day: 1 };
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n0', unitId: ANN, kind: 'desertion', priority: 95, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 };
    s.disloyalty!.open = { kind: 'desertion', unitId: ANN, day: 1, at: 'night', nightEntryId: 'n0' };
    let out: ReturnType<typeof run> | undefined;
    for (let seed = 1; seed <= 60 && !out; seed++) {
      const t = structuredClone(s);
      t.rng = seedRng(seed);
      const r = run(t, reg, { type: 'leash/terminate', payload: { unitId: ANN } });
      if (ofType(r.events, 'unit_terminated').length === 1) out = r;
    }
    expect(out).toBeDefined();
    expect(out!.state.calendar.nightEvent).toBeUndefined();
    expect(out!.state.slot).toBe('morning');
    expect(out!.state.day).toBe(s.day + 1);
  });

  it('is refused while a scene with her is open', () => {
    const s = refusalScene(clone());
    expect(() => removeFromService(s, ANN, 'terminated')).toThrow(/scene/);
    expect(s.squad.find((u) => u.id === ANN)!.status).toBe('active');
  });
});
