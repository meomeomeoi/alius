import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ableParty, checkExpedition, resolveUnknownType } from '../../../src/engine/world/expedition';
import { nextNodes } from '../../../src/engine/world/nodeMap';
import { fixtureCombat } from '../../helpers/combat';
import { depart, payload, withMission } from '../../helpers/expedition';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const start = (state: CampaignState, missionId: string, over = {}) =>
  run(state, reg, { type: 'expedition/start', payload: payload(state, missionId, over) });
const reason = (state: CampaignState, missionId: string, over = {}) => checkExpedition(state, reg, payload(state, missionId, over));
const move = (s: CampaignState, nodeId: string) => run(s, reg, { type: 'expedition/move', payload: { nodeId } });
const withRegs = (patch: (r: Registries) => void): Registries => {
  const r = { ...reg } as Registries;
  for (const k of ['nodeTypes', 'regions'] as const) r[k] = new Map(reg[k]);
  patch(r);
  return r;
};

/** An open expedition whose first-layer nodes are of the given types (the map is otherwise generated). */
function runWith(types: Record<string, string> = {}, o: { supplies?: number; mutate?: (s: CampaignState) => void } = {}) {
  const { state, mission } = withMission(reg, base);
  let s = depart(reg, state, mission.id, { supplies: o.supplies ?? 4 });
  s = structuredClone(s);
  for (const [id, type] of Object.entries(types)) s.expedition!.map.nodes[id].type = type;
  o.mutate?.(s);
  return s;
}

describe('start', () => {
  it('start moves the mission to active, takes the supplies and builds a map', () => {
    const { state, mission } = withMission(reg, base);
    const r = start(state, mission.id);
    expect(errors(r.events)).toEqual([]);
    const s = r.state;
    expect(s.missions.offered).toEqual([]);
    expect(s.missions.active).toEqual([{ ...mission, status: 'active' }]);
    expect(s.resources.supplies).toBe(state.resources.supplies - 4);
    const exp = s.expedition!;
    expect(exp).toMatchObject({
      missionId: mission.id, regionId: 'quarantine_d7', slots: 2, supplies: 4, at: null, path: [], phase: 'travel', reveal: 1,
      objectiveDone: false, loot: [], hints: [], day: state.day,
    });
    expect(exp.party).toEqual(state.roster.activeIds.slice(0, 4));
    expect(exp.formation).toEqual({ front: exp.party.slice(0, 2), back: exp.party.slice(2) });
    expect(exp.map.layers.length).toBeGreaterThanOrEqual(3);
    expect(exp.map.objectiveId).toBe('obj');
    expect(exp.log).toHaveLength(1);
    expect(exp.log[0]).toMatchObject({ n: 1, kind: 'start' });
    expect(ofType(r.events, 'expedition_started')).toHaveLength(1);
    // no slot is spent on departure
    expect([s.day, s.slot]).toEqual([state.day, state.slot]);
  });

  it('the map is seeded from the engine rng (same state, same map; the rng moves on)', () => {
    const { state, mission } = withMission(reg, base);
    const a = start(state, mission.id).state;
    const b = start(state, mission.id).state;
    expect(a.expedition!.map).toEqual(b.expedition!.map);
    expect(a.rng).not.toEqual(state.rng);
  });

  it('start is refused in the Evening for a 2-slot region and in the Afternoon for a 3-slot region, with the region named', () => {
    const { state, mission } = withMission(reg, base);
    state.slot = 'evening';
    expect(reason(state, mission.id)).toBe('District 7 Quarantine takes 2 slots: leave in the Morning or Afternoon.');
    state.slot = 'afternoon';
    expect(reason(state, mission.id)).toBeNull();
    const far = withMission(reg, base, { regionId: 'drowned_market' }, (s) => { s.world.clearanceTier = 1; });
    far.state.slot = 'afternoon';
    expect(reason(far.state, far.mission.id)).toBe('Drowned Market takes 3 slots: leave in the Morning.');
    far.state.slot = 'morning';
    expect(reason(far.state, far.mission.id)).toBeNull();
  });

  it('start is refused at night, with an open scene, an open talk, an open combat or a second expedition', () => {
    const { state, mission } = withMission(reg, base);
    const night = structuredClone(state);
    night.slot = 'night';
    expect(reason(night, mission.id)).toMatch(/night/i);
    const scene = structuredClone(state);
    scene.scene = { id: 's1' } as never;
    expect(reason(scene, mission.id)).toMatch(/scene/i);
    const talk = structuredClone(state);
    talk.calendar.pendingScene = { unitId: talk.roster.activeIds[0], day: talk.day, slot: talk.slot };
    expect(reason(talk, mission.id)).toMatch(/talk/i);
    const combat = structuredClone(state);
    combat.combat = fixtureCombat();
    expect(reason(combat, mission.id)).toMatch(/combat/i);
    const second = depart(reg, state, mission.id);
    expect(reason(second, mission.id)).toMatch(/expedition/i);
  });

  it('start is refused for an injured, dead, reserve, broken-down, duplicate or fifth unit', () => {
    const big = campaign(reg, 6);
    const { state, mission } = withMission(reg, big);
    const ids = state.roster.activeIds;
    const patched = (f: (s: CampaignState) => void) => {
      const s = structuredClone(state);
      f(s);
      return s;
    };
    const unit = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
    expect(reason(patched((s) => { unit(s, ids[0]).status = 'injured'; }), mission.id)).toMatch(/not available|injured/i);
    expect(reason(patched((s) => { unit(s, ids[0]).status = 'dead'; }), mission.id)).toMatch(/not available|dead/i);
    expect(reason(state, mission.id, { unitIds: [ids[0], 'unit_ea'], formation: { front: [ids[0]], back: ['unit_ea'] } })).toMatch(/unknown|not available|reserve/i);
    const reserve = state.squad.find((u) => u.status === 'reserve')!;
    expect(reason(state, mission.id, { unitIds: [ids[0], reserve.id], formation: { front: [ids[0]], back: [reserve.id] } })).toMatch(/not available|reserve/i);
    expect(reason(patched((s) => { unit(s, ids[0]).breakdown = { defectId: 'echo_bleed', day: 1 }; }), mission.id)).toMatch(/breakdown/i);
    expect(reason(state, mission.id, { unitIds: [ids[0], ids[0]], formation: { front: [ids[0]], back: [ids[0]] } })).toMatch(/twice|unique|duplicate/i);
    const five = [...ids, reserve.id];
    expect(reason(state, mission.id, { unitIds: five, formation: { front: five.slice(0, 3), back: five.slice(3) } })).toMatch(/1 to 4|at most/i);
    expect(reason(state, mission.id, { unitIds: [], formation: { front: [], back: [] } })).toMatch(/1 to 4|at least/i);
  });

  it('the formation must be the same ids, at most 3 per row, with a front line', () => {
    const { state, mission } = withMission(reg, base);
    const ids = state.roster.activeIds;
    expect(reason(state, mission.id, { formation: { front: ids.slice(0, 3), back: [] } })).toMatch(/formation|same/i);
    expect(reason(state, mission.id, { unitIds: ids.slice(0, 2), formation: { front: [], back: ids.slice(0, 2) } })).toMatch(/front/i);
    expect(reason(state, mission.id, { formation: { front: ids.slice(0, 4), back: [] } })).toMatch(/row/i);
    expect(reason(state, mission.id, { unitIds: ids.slice(0, 2), formation: { front: [ids[0]], back: [ids[1]] } })).toBeNull();
  });

  it('more supplies than owned or than 12 are refused', () => {
    const { state, mission } = withMission(reg, base, {}, (s) => { s.resources.supplies = 3; });
    expect(reason(state, mission.id, { supplies: 4 })).toMatch(/supplies/i);
    expect(reason(state, mission.id, { supplies: 3 })).toBeNull();
    expect(reason(state, mission.id, { supplies: 0 })).toBeNull();
    expect(reason(state, mission.id, { supplies: -1 })).toMatch(/supplies/i);
    expect(reason(state, mission.id, { supplies: 1.5 })).toMatch(/supplies/i);
    const rich = withMission(reg, base, {}, (s) => { s.resources.supplies = 50; });
    expect(reason(rich.state, rich.mission.id, { supplies: TUNING.expedition.suppliesMax })).toBeNull();
    expect(reason(rich.state, rich.mission.id, { supplies: TUNING.expedition.suppliesMax + 1 })).toMatch(/supplies/i);
  });

  it('a refused start leaves the state deep-equal', () => {
    const { state, mission } = withMission(reg, base);
    state.slot = 'evening';
    const before = structuredClone(state);
    const r = start(state, mission.id);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(state);
    expect(state).toEqual(before);
    // unknown mission / neither mission nor poi / both
    expect(checkExpedition(base, reg, { unitIds: [], formation: { front: [], back: [] }, supplies: 0 })).toMatch(/mission|poi/i);
    expect(reason(withMission(reg, base).state, 'ghost')).toMatch(/mission/i);
    const both = withMission(reg, base);
    expect(reason(both.state, both.mission.id, { poi: { regionId: 'ashway', poiId: 'scavenge' } })).toMatch(/exactly one|either/i);
  });

  it('a mission that is not on the board (active or completed) cannot be started', () => {
    const { state, mission } = withMission(reg, base);
    const s = structuredClone(state);
    s.missions.offered = [];
    s.missions.active = [{ ...mission, status: 'active' }];
    expect(reason(s, mission.id)).toMatch(/board|offered|mission/i);
  });

  it('a mission whose template or region was removed from the pack is refused', () => {
    const { state, mission } = withMission(reg, base);
    const regs = withRegs((r) => r.regions.delete('quarantine_d7'));
    expect(checkExpedition(state, regs, payload(state, mission.id))).toMatch(/region/i);
  });
});

describe('points of interest', () => {
  const poi = { regionId: 'quarantine_d7', poiId: 'scavenge' };
  const poiStart = (s: CampaignState) => run(s, reg, { type: 'expedition/start', payload: { ...payload(s, 'x'), missionId: undefined, poi } });

  it('a POI start creates a side mission that never appears on the board and stamps the cooldown', () => {
    const s = structuredClone(base);
    for (const u of s.squad) u.defects = [];
    const r = poiStart(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.missions.offered).toEqual([]);
    expect(r.state.missions.active).toHaveLength(1);
    expect(r.state.missions.active[0]).toMatchObject({
      source: 'side', templateId: 'tpl_scavenge', regionId: 'quarantine_d7', poiId: 'scavenge', status: 'active', rewardsTier: 'tier_1',
    });
    expect(r.state.missions.active[0].deadlineDay).toBeUndefined();
    expect(r.state.world.regions.quarantine_d7.poi!.scavenge).toBe(s.day);
    expect(r.state.expedition!.missionId).toBe(r.state.missions.active[0].id);
  });

  it('a POI on cooldown is refused until day + 2', () => {
    const s = structuredClone(base);
    s.world.regions.quarantine_d7 = { known: true, poi: { scavenge: 5 } };
    const check = (day: number) => { s.day = day; return checkExpedition(s, reg, { ...payload(s, 'x'), missionId: undefined, poi }); };
    expect(check(5)).toMatch(/cooldown|again/i);
    expect(check(6)).toMatch(/cooldown|again/i);
    expect(check(5 + TUNING.world.poiCooldownDays)).toBeNull();
  });

  it('an unknown POI, a region that is not known or a POI whose template is gone is refused', () => {
    const s = structuredClone(base);
    const check = (p: { regionId: string; poiId: string }, regs = reg) => checkExpedition(s, regs, { ...payload(s, 'x'), missionId: undefined, poi: p });
    expect(check({ regionId: 'quarantine_d7', poiId: 'nope' })).toMatch(/point of interest|poi/i);
    expect(check({ regionId: 'the_garden', poiId: 'scavenge' })).toMatch(/not known|unknown/i);
    const regs = { ...reg, missionTemplates: new Map(reg.missionTemplates) } as Registries;
    regs.missionTemplates.delete('tpl_scavenge');
    expect(check(poi, regs)).toMatch(/template/i);
  });
});

describe('reveal', () => {
  const revealOf = (mutate: (s: CampaignState) => void, o: Parameters<typeof withMission>[2] = {}) => {
    const { state, mission } = withMission(reg, base, o, mutate);
    return depart(reg, state, mission.id).expedition!.reveal;
  };

  it('echo_bleed and a scouted mission each add 1 to reveal', () => {
    expect(revealOf(() => {})).toBe(1);
    expect(revealOf((s) => { s.squad[0].defects.push({ id: 'echo_bleed' }); })).toBe(2);
    expect(revealOf(() => {}, { scouted: true })).toBe(2);
    expect(revealOf((s) => { s.squad[0].defects.push({ id: 'echo_bleed' }); }, { scouted: true })).toBe(3);
    // two carriers do not stack
    expect(revealOf((s) => { s.squad[0].defects.push({ id: 'echo_bleed' }); s.squad[1].defects.push({ id: 'echo_bleed' }); })).toBe(2);
    // a carrier left at home does not count
    expect(revealOf((s) => { s.squad[3].defects.push({ id: 'echo_bleed' }); s.roster.activeIds = s.roster.activeIds.slice(0, 3); })).toBe(1);
  });
});

describe('movement', () => {
  it('move only accepts a connected node', () => {
    const s = runWith();
    const exp = s.expedition!;
    const second = exp.map.layers[1][0];
    const refused = move(s, second);
    expect(errors(refused.events)).toHaveLength(1);
    expect(refused.state).toBe(s);
    expect(errors(move(s, 'ghost').events)).toHaveLength(1);
    const first = nextNodes(exp.map, null)[0];
    const ok = move(runWith({ [first]: 'cache' }), first);
    expect(errors(ok.events)).toEqual([]);
    expect(ok.state.expedition!.at).toBe(first);
    expect(ok.state.expedition!.path).toEqual([first]);
    expect(ok.state.expedition!.map.nodes[first].visited).toBe(true);
    expect(ofType(ok.events, 'expedition_moved')).toEqual([{ type: 'expedition_moved', nodeId: first }]);
    expect(ofType(ok.events, 'expedition_node')).toEqual([{ type: 'expedition_node', nodeId: first, nodeType: 'cache', kind: 'cache' }]);
    // a sibling of the visited node is no longer reachable
    const sibling = exp.map.layers[0].find((n) => n !== first)!;
    expect(errors(move(ok.state, sibling).events)).toHaveLength(1);
    const next = ok.state.expedition!.map.nodes[first].edges[0];
    expect(nextNodes(ok.state.expedition!.map, first)).toContain(next);
  });

  it('move needs an open expedition in the travel phase', () => {
    expect(errors(run(base, reg, { type: 'expedition/move', payload: { nodeId: 'n0_0' } }).events)).toHaveLength(1);
    const s = runWith({ n0_0: 'cache' });
    s.expedition!.phase = 'combat';
    expect(errors(move(s, 'n0_0').events)).toHaveLength(1);
  });

  it('cache adds loot to the expedition, not to the inventory', () => {
    const s = runWith({ n0_0: 'cache' });
    const r = move(s, 'n0_0');
    expect(r.state.expedition!.loot.length).toBeGreaterThan(0);
    expect(r.state.inventory).toEqual(s.inventory);
    expect(r.state.resources).toEqual(s.resources);
    expect(r.state.expedition!.log.at(-1)!.kind).toBe('cache');
    expect(r.state.expedition!.phase).toBe('travel');
    expect(ofType(r.events, 'loot_banked')).toEqual([]);
  });

  it('rest spends 1 supply per able unit and heals', () => {
    const s = runWith({ n0_0: 'rest' }, {
      mutate: (x) => {
        for (const u of x.squad) { u.currentHp = 10; u.stress = 30; }
        x.squad[3].status = 'injured';
      },
    });
    expect(ableParty(s)).toHaveLength(3);
    const r = move(s, 'n0_0');
    const exp = r.state.expedition!;
    expect(exp.supplies).toBe(4 - 3);
    for (const id of ableParty(r.state)) {
      const u = r.state.squad.find((x) => x.id === id)!;
      expect(u.currentHp).toBeGreaterThan(10);
      expect(u.stress).toBe(15);
    }
    // the injured unit stays as it was
    expect(r.state.squad[3].currentHp).toBe(10);
    expect(r.state.squad[3].stress).toBe(30);
    expect(exp.log.at(-1)!.kind).toBe('rest');
  });

  it('rest without supplies changes nothing and logs it', () => {
    const s = runWith({ n0_0: 'rest' }, { supplies: 2, mutate: (x) => { for (const u of x.squad) { u.currentHp = 10; u.stress = 30; } } });
    const r = move(s, 'n0_0');
    expect(r.state.expedition!.supplies).toBe(2);
    expect(r.state.squad.map((u) => u.currentHp)).toEqual(s.squad.map((u) => u.currentHp));
    expect(r.state.squad.map((u) => u.stress)).toEqual(s.squad.map((u) => u.stress));
    expect(r.state.expedition!.log.at(-1)!.text).toContain('No supplies to rest.');
    expect(r.state.expedition!.at).toBe('n0_0'); // the run goes on
  });

  it('unknown resolves to a real type with the seed', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 100; i++) seen.add(resolveUnknownType(reg, new Rng(seedRng(i)), 'unknown')!);
    expect([...seen].sort()).toEqual(['cache', 'combat', 'event']);
    expect(resolveUnknownType(reg, new Rng(seedRng(1)), 'unknown')).toBe(resolveUnknownType(reg, new Rng(seedRng(1)), 'unknown'));
    const regs = withRegs((r) => r.nodeTypes.set('unknown', { ...reg.nodeTypes.get('unknown')!, resolvesTo: { cache: 1 } }));
    const s = runWith({ n0_0: 'unknown' });
    const draft = structuredClone(s);
    const r = run(draft, regs, { type: 'expedition/move', payload: { nodeId: 'n0_0' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition!.map.nodes.n0_0.resolvedType).toBe('cache');
    expect(r.state.expedition!.loot.length).toBeGreaterThan(0);
    // all targets removed: nothing resolves
    const empty = withRegs((x) => x.nodeTypes.set('unknown', { ...reg.nodeTypes.get('unknown')!, resolvesTo: { ghost: 1 } }));
    expect(resolveUnknownType(empty, new Rng(seedRng(1)), 'unknown')).toBeNull();
  });

  it('a node type removed from the pack resolves as nothing and the run continues', () => {
    const regs = withRegs((r) => r.nodeTypes.delete('cache'));
    const s = runWith({ n0_0: 'cache' });
    const r = run(s, regs, { type: 'expedition/move', payload: { nodeId: 'n0_0' } });
    expect(errors(r.events)).toEqual([]);
    const exp = r.state.expedition!;
    expect(exp.log.at(-1)!.text).toContain('Nothing here.');
    expect(exp.at).toBe('n0_0');
    expect(exp.phase).toBe('travel');
    expect(exp.loot).toEqual([]);
    expect(exp.map.nodes.n0_0.visited).toBe(true);
  });

  it('reaching a reach-objective sets objectiveDone', () => {
    const s = runWith();
    const exp = s.expedition!;
    exp.map = {
      layers: [['n0_0', 'n0_1']], objectiveId: 'obj',
      nodes: {
        n0_0: { id: 'n0_0', layer: 0, type: 'cache', edges: ['obj'], visited: false },
        n0_1: { id: 'n0_1', layer: 0, type: 'cache', edges: ['obj'], visited: false },
        obj: { id: 'obj', layer: 1, type: 'objective', edges: [], visited: false },
      },
    };
    const mid = move(s, 'n0_0').state;
    expect(mid.expedition!.objectiveDone).toBe(false);
    const end = move(mid, 'obj');
    expect(errors(end.events)).toEqual([]);
    expect(end.state.expedition!.objectiveDone).toBe(true);
    expect(end.state.expedition!.loot.length).toBeGreaterThan(mid.expedition!.loot.length); // the objective plays as a cache
    expect(ofType(end.events, 'expedition_node')[0]).toMatchObject({ nodeId: 'obj', kind: 'cache' });
  });
});

describe('field actions', () => {
  it('treat spends one supply and never exceeds max HP', () => {
    const s = runWith({}, { mutate: (x) => { x.squad[0].currentHp = 10; } });
    const id = s.expedition!.party[0];
    const r = run(s, reg, { type: 'expedition/treat', payload: { unitId: id, kind: 'patch' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition!.supplies).toBe(3);
    const hp = r.state.squad[0].currentHp;
    expect(hp).toBeGreaterThan(10);
    expect(ofType(r.events, 'expedition_treated')).toEqual([{ type: 'expedition_treated', unitId: id, kind: 'patch' }]);
    expect(r.state.expedition!.log.at(-1)!.kind).toBe('treat');
    // near max: capped
    const full = run(runWith({}, { mutate: (x) => { x.squad[0].currentHp = x.squad[0].baseStats.hp - 1; } }), reg, { type: 'expedition/treat', payload: { unitId: id, kind: 'patch' } });
    expect(full.state.squad[0].currentHp).toBeLessThanOrEqual(full.state.squad[0].baseStats.hp);
  });

  it('calm lowers stress by 10 and stops at 0; it is refused for a unit in breakdown', () => {
    const s = runWith({}, { mutate: (x) => { x.squad[0].stress = 25; x.squad[1].stress = 4; x.squad[2].breakdown = { defectId: 'echo_bleed', day: 1 }; } });
    const [a, b, c] = s.expedition!.party;
    expect(run(s, reg, { type: 'expedition/treat', payload: { unitId: a, kind: 'calm' } }).state.squad[0].stress).toBe(15);
    expect(run(s, reg, { type: 'expedition/treat', payload: { unitId: b, kind: 'calm' } }).state.squad[1].stress).toBe(0);
    expect(errors(run(s, reg, { type: 'expedition/treat', payload: { unitId: c, kind: 'calm' } }).events)).toHaveLength(1);
  });

  it('treat is refused without supplies, outside the travel phase, for a unit outside the able party or an unknown kind', () => {
    const s = runWith({}, { supplies: 0 });
    const id = s.expedition!.party[0];
    expect(errors(run(s, reg, { type: 'expedition/treat', payload: { unitId: id, kind: 'patch' } }).events)).toHaveLength(1);
    const t = runWith();
    t.expedition!.phase = 'event';
    expect(errors(run(t, reg, { type: 'expedition/treat', payload: { unitId: id, kind: 'patch' } }).events)).toHaveLength(1);
    const u = runWith({}, { mutate: (x) => { x.squad[0].status = 'injured'; } });
    expect(errors(run(u, reg, { type: 'expedition/treat', payload: { unitId: id, kind: 'patch' } }).events)).toHaveLength(1);
    const v = runWith();
    expect(errors(run(v, reg, { type: 'expedition/treat', payload: { unitId: id, kind: 'heal' } }).events)).toHaveLength(1);
    expect(errors(run(v, reg, { type: 'expedition/treat', payload: { unitId: 'ghost', kind: 'patch' } }).events)).toHaveLength(1);
  });

  it('set_formation applies the start validation over the able party', () => {
    const s = runWith({}, { mutate: (x) => { x.squad[3].status = 'injured'; } });
    const [a, b, c] = s.expedition!.party;
    const set = (formation: unknown, st = s) => run(st, reg, { type: 'expedition/set_formation', payload: { formation } });
    const ok = set({ front: [a], back: [b, c] });
    expect(errors(ok.events)).toEqual([]);
    expect(ok.state.expedition!.formation).toEqual({ front: [a], back: [b, c] });
    expect(errors(set({ front: [a, b, c, s.expedition!.party[3]], back: [] }).events)).toHaveLength(1);
    expect(errors(set({ front: [], back: [a, b, c] }).events)).toHaveLength(1);
    expect(errors(set({ front: [a, b], back: [] }).events)).toHaveLength(1);
    const busy = structuredClone(s);
    busy.expedition!.phase = 'event';
    expect(errors(set({ front: [a], back: [b, c] }, busy).events)).toHaveLength(1);
  });

  it('ableParty lists party units that are living and active', () => {
    const s = runWith({}, { mutate: (x) => { x.squad[0].status = 'dead'; x.squad[1].status = 'injured'; } });
    expect(ableParty(s)).toEqual(s.expedition!.party.slice(2));
    expect(ableParty(base)).toEqual([]);
  });

  it('activities are refused during the run', () => {
    const s = runWith();
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'rest' } });
    expect(r.events[0]).toMatchObject({ type: 'error', code: 'expedition_open' });
    expect(r.state).toBe(s);
  });
});
