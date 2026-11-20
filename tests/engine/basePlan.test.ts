import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import {
  cabinOf, cabinOwner, commanderCabin, isClosed, isOpenSpace, litRooms, neighbours, planGraph, planMarks, planRoomsOn,
  registerPlanMarks, resetPlanMarks, roomOfPerson, route, unitCabins,
} from '../../src/engine/basePlan';
import { whereabouts, type Whereabout } from '../../src/engine/hub';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const cabinIds = (): string[] => unitCabins(reg).map((c) => String(c.id));
const cab = (s: CampaignState, id: string): string | null => (cabinOf(s, reg, id)?.id as string | undefined) ?? null;

describe('plan rooms', () => {
  it('floors in registry order; open spaces and closed rooms are read by field', () => {
    const ground = planRoomsOn(reg, 'ground').map((e) => e.id);
    expect(ground[0]).toBe('g_corridor_1');
    expect(planRoomsOn(reg, 'roof').map((e) => e.id)).toEqual(['r_roof', 'r_hatch']);
    expect(isOpenSpace(reg.planRooms.get('g_corridor_2')!)).toBe(true);
    expect(isOpenSpace(reg.planRooms.get('g_lobby')!)).toBe(true);
    expect(isOpenSpace(reg.planRooms.get('g_stairs')!)).toBe(true);           // a staircase without doors
    expect(isOpenSpace(reg.planRooms.get('g_back_stairs')!)).toBe(false);     // behind a door
    expect(isClosed(reg, reg.planRooms.get('g_gym')!)).toBe(true);
    expect(isClosed(reg, reg.planRooms.get('g_mess_hall')!)).toBe(false);
    expect(isClosed(reg, reg.planRooms.get('u_cabin_5')!)).toBe(false);
    expect(isClosed(reg, reg.planRooms.get('g_back_stairs')!)).toBe(false);
    expect(commanderCabin(reg)!.id).toBe('u_cmdr');
    expect(cabinIds()).toHaveLength(10);
  });
});

describe('cabinOf (derived from the order of joining; no state, no rng)', () => {
  it('the first four soldiers get the first four cabins, which are far apart', () => {
    const s = campaign(reg, 4);
    expect(s.squad.map((u) => cab(s, u.id))).toEqual(cabinIds().slice(0, 4));
    const rects = s.squad.map((u) => cabinOf(s, reg, u.id)!.rect as { x: number; y: number });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(Math.hypot(rects[i].x - rects[j].x, rects[i].y - rects[j].y)).toBeGreaterThan(100);
    }
  });

  it('nobody moves when an earlier soldier leaves or a later one joins; the leaver\'s cabin is vacant', () => {
    const s = campaign(reg, 6);
    const before = s.squad.map((u) => cab(s, u.id));
    s.squad[1].status = 'deserted';
    expect(cab(s, s.squad[1].id)).toBeNull();
    expect(s.squad.filter((_, i) => i !== 1).map((u) => cab(s, u.id))).toEqual(before.filter((_, i) => i !== 1));
    expect(cabinOwner(s, reg, before[1]!)).toBeNull();
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'unit_gia', displayName: 'Gia' });
    expect(cab(s, 'unit_gia')).toBe(cabinIds()[6]);
    expect(cabinOwner(s, reg, cabinIds()[6])).toBe('unit_gia');
  });

  it('review fix: grunts dying and being replaced never move a named soldier', () => {
    const s = campaign(reg, 4);
    for (let i = 0; i < 4; i++) s.squad.push({ ...structuredClone(s.squad[0]), id: `unit_n${i}`, displayName: `N${i}` }); // 8 named
    const named = s.squad.map((u) => u.id);
    const before = named.map((id) => cab(s, id));
    for (let i = 0; i < 30; i++) {                     // a long campaign: grunts come and die
      s.squad.push({ ...structuredClone(s.squad[0]), id: `g${i}`, kind: 'grunt', displayName: `K-${i}` });
      if (i % 2 === 0) s.squad[s.squad.length - 1].status = 'dead';
    }
    s.squad[2].status = 'dead';                        // and a named one dies
    expect(named.filter((_, i) => i !== 2).map((id) => cab(s, id))).toEqual(before.filter((_, i) => i !== 2));
  });

  it('grunts take the free cabins from the end of the list, and share the last one when none is free', () => {
    const s = campaign(reg, 4);
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'g1', kind: 'grunt', displayName: 'K-1' });
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'g2', kind: 'grunt', displayName: 'K-2' });
    expect(cab(s, 'g1')).toBe(cabinIds().at(-1));
    expect(cab(s, 'g2')).toBe(cabinIds().at(-2));
    for (let i = 0; i < 6; i++) s.squad.push({ ...structuredClone(s.squad[0]), id: `n${i}` });   // 10 named: every cabin taken
    expect(cab(s, 'g1')).toBe(cabinIds().at(-1));        // grunts share the last
  });

  it('the first ten named soldiers never move; past the cabins the order wraps to the first free one, or shares', () => {
    const s = campaign(reg, 4);
    for (let i = 0; i < 7; i++) s.squad.push({ ...structuredClone(s.squad[0]), id: `unit_x${i}`, displayName: `X${i}` });
    expect(new Set(s.squad.map((u) => cab(s, u.id))).size).toBe(10);        // eleven named, ten cabins
    expect(cab(s, 'unit_x6')).toBe(cabinIds()[0]);                          // the eleventh shares the first
    const firstTen = s.squad.slice(0, 10).map((u) => cab(s, u.id));
    s.squad[0].status = 'dead';
    expect(cab(s, 'unit_x6')).toBe(cabinIds()[0]);                          // and has it to herself now
    expect(s.squad.slice(1, 10).map((u) => cab(s, u.id))).toEqual(firstTen.slice(1));
  });

  it('an unknown unit has none; no plan, no cabin', () => {
    const s = campaign(reg, 4);
    expect(cabinOf(s, reg, 'nobody')).toBeNull();
    expect(cabinOf(s, { ...reg, planRooms: new Map() } as Registries, s.squad[0].id)).toBeNull();
  });

  it('reads nothing but the squad (the same answer for a clone)', () => {
    const s = campaign(reg, 4);
    expect(structuredClone(s).squad.map((u) => cab(structuredClone(s), u.id))).toEqual(s.squad.map((u) => cab(s, u.id)));
  });
});

describe('roomOfPerson', () => {
  const at = (unitId: string, roomId: string | null, reason: Whereabout['reason'] = 'routine'): Whereabout => ({ unitId, roomId, reason });

  it('a soldier in the quarters is drawn in her own cabin; in any other room in that room\'s plan room', () => {
    const s = campaign(reg, 4);
    const [a, b] = s.squad;
    const here = [at(a.id, 'quarters', 'night'), at(b.id, 'mess')];
    expect(roomOfPerson(s, reg, here, a.id)!.id).toBe(cab(s, a.id));
    expect(roomOfPerson(s, reg, here, b.id)!.id).toBe('g_mess_hall');
    expect(roomOfPerson(s, reg, [at(a.id, null, 'expedition')], a.id)).toBeNull();
    expect(roomOfPerson(s, reg, [], a.id)).toBeNull();
  });

  it('the commander is in the commander\'s cabin', () => {
    expect(roomOfPerson(campaign(reg, 4), reg, [], 'commander')!.id).toBe('u_cmdr');
  });

  it('litRooms: where someone is drawn, and the commander\'s cabin', () => {
    const s = campaign(reg, 4);
    s.slot = 'night';
    const here = whereabouts(s, reg);
    const lit = litRooms(s, reg, here);
    expect(lit.has('u_cmdr')).toBe(true);
    for (const u of s.squad) expect(lit.has(String(roomOfPerson(s, reg, here, u.id)!.id))).toBe(true);
    expect(lit.has('g_gym')).toBe(false);
  });
});

describe('the door graph', () => {
  it('every open place on the plan can be reached from the lobby; closed ones by their doors', () => {
    const g = planGraph(reg);
    for (const e of reg.planRooms.values()) {
      expect(route(reg, 'g_lobby', String(e.id)), String(e.id)).not.toBeNull();
    }
    expect(g.get('g_lobby')!.some((x) => x.to.startsWith('outside:ground:') && x.via === 'door')).toBe(true);
  });

  it('neighbours through a door and through a wall', () => {
    const door = neighbours(reg, 'g_mess_hall', 'door');
    expect(door).toContain('g_lobby');
    expect(door).toContain('g_kitchen');
    expect(door).toContain('outside');
    const wall = neighbours(reg, 'u_cabin_1', 'wall');      // ANN's cabin, north-west
    expect(wall).toContain('u_cabin_5');                    // the vacant cabin above it: a wall, no door
    expect(wall).not.toContain('u_corridor_6');             // her door opens onto that corridor
    expect(neighbours(reg, 'u_cabin_1', 'door')).toContain('u_corridor_6');
  });

  it('review fix: the outside is per floor (an upper exterior door never leads down to the yard), and the walk across the yard is measured', () => {
    for (const [from, to] of [['g_lobby', 'u_cmdr'], ['u_cabin_4', 'g_mess_hall'], ['g_lobby', 'u_cabin_1'], ['g_garage', 'u_comms']]) {
      const r = route(reg, from, to)!;
      expect(r.rooms.some((id) => id === 'g_stairs' || id === 'g_back_stairs'), `${from} → ${to}: ${r.rooms.join(' > ')}`).toBe(true);
      const outsideOnUpper = r.rooms.findIndex((id) => id === 'outside');
      if (outsideOnUpper >= 0) expect(reg.planRooms.get(r.rooms[outsideOnUpper - 1])?.floor, r.rooms.join(' > ')).toBe('ground');
    }
    // the yard door and the main door are far apart: going out of one and in by the other costs the walk between them
    const viaYard = route(reg, 'g_training_yard', 'g_lobby')!;
    expect(viaYard.length).toBeGreaterThan(150);
    expect(neighbours(reg, 'u_corridor_8', 'door')).toContain('outside');
  });

  it('a route from the lobby to a cabin takes the stairs; it lists the floors and grows with the walk', () => {
    const r = route(reg, 'g_lobby', 'u_cabin_1')!;
    expect(r.rooms[0]).toBe('g_lobby');
    expect(r.rooms.at(-1)).toBe('u_cabin_1');
    expect(r.floors).toEqual(['ground', 'upper']);
    expect(r.length).toBeGreaterThan(route(reg, 'g_lobby', 'g_mess_hall')!.length);
    expect(route(reg, 'g_lobby', 'r_roof')!.rooms).toContain('u_back_stairs');   // the roof only by the back stairs
    expect(route(reg, 'g_lobby', 'nowhere')).toBeNull();
  });
});

describe('plan marks', () => {
  it('providers run in order; marks on unknown rooms are dropped; reset clears them', () => {
    resetPlanMarks();
    const s = campaign(reg, 4);
    expect(planMarks(s, reg)).toEqual([]);
    registerPlanMarks(() => [{ planRoomId: 'u_cabin_1', kind: 'territory' }, { planRoomId: 'nowhere', kind: 'x' }]);
    registerPlanMarks(() => [{ planRoomId: 'g_gym', kind: 'locked', label: 'LOCKED' }]);
    expect(planMarks(s, reg)).toEqual([{ planRoomId: 'u_cabin_1', kind: 'territory' }, { planRoomId: 'g_gym', kind: 'locked', label: 'LOCKED' }]);
    resetPlanMarks();
    expect(planMarks(s, reg)).toEqual([]);
  });
});
