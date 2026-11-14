import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { fnv1a, whereabouts, type Whereabout } from '../../src/engine/hub';
import type { CampaignState, Slot } from '../../src/engine/state/types';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'night'];
const roomOf = (list: Whereabout[], unitId: string): Whereabout => list.find((w) => w.unitId === unitId)!;
const weightOf = (roomId: string, slot: Slot): number => ((reg.hubRooms.get(roomId)!.weights as Record<string, number>)[slot] ?? 0);
const hosting = (host: string): string => [...reg.hubRooms.values()].find((r) => ((r.hosts ?? []) as string[]).includes(host))!.id as string;

function at(s: CampaignState, day: number, slot: Slot): CampaignState {
  const c = structuredClone(s);
  c.day = day;
  c.slot = slot;
  return c;
}

describe('fnv1a', () => {
  it('is the 32-bit FNV-1a hash', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
});

describe('whereabouts', () => {
  it('is deterministic and draws no RNG', () => {
    const s = campaign(reg, 4);
    const before = structuredClone(s.rng);
    const a = whereabouts(s, reg);
    const b = whereabouts(structuredClone(s), reg);
    expect(a).toEqual(b);
    expect(s.rng).toEqual(before);
    expect(a).toHaveLength(4);
  });

  it('every routine room is open this slot and has weight above zero', () => {
    const s = campaign(reg, 4);
    let routine = 0;
    for (let day = 1; day <= 10; day++) {
      for (const slot of SLOTS) {
        const c = at(s, day, slot);
        for (const w of whereabouts(c, reg).filter((x) => x.reason === 'routine')) {
          routine++;
          const room = reg.hubRooms.get(w.roomId!)!;
          expect(weightOf(room.id as string, slot), `${room.id} ${slot}`).toBeGreaterThan(0);
          expect((reg.locations.get(room.sceneLocationId as string)!.slots as string[]), `${room.id} open ${slot}`).toContain(slot);
        }
      }
    }
    expect(routine).toBeGreaterThan(40);
  });

  it('an injured unit is in the room hosting injured', () => {
    const s = campaign(reg, 4);
    s.squad[0].status = 'injured';
    const w = roomOf(whereabouts(s, reg), s.squad[0].id);
    expect(w).toEqual({ unitId: s.squad[0].id, roomId: hosting('injured'), reason: 'injured' });
  });

  it('injuryDays above zero counts as injured', () => {
    const s = campaign(reg, 4);
    s.squad[1].injuryDays = 2;
    expect(roomOf(whereabouts(s, reg), s.squad[1].id).reason).toBe('injured');
    s.squad[1].injuryDays = 0;
    expect(roomOf(whereabouts(s, reg), s.squad[1].id).reason).not.toBe('injured');
  });

  it('a confined unit is in the room hosting confined', () => {
    const s = campaign(reg, 4);
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: s.squad[2].id, kind: 'confined', untilDay: s.day + 2 }], demands: [], demandLog: [] };
    expect(roomOf(whereabouts(s, reg), s.squad[2].id)).toEqual({ unitId: s.squad[2].id, roomId: hosting('confined'), reason: 'confined' });
    expect(hosting('confined')).toBe('quarters');
    // an expired brig no longer holds her
    s.day = s.day + 3;
    expect(roomOf(whereabouts(s, reg), s.squad[2].id).reason).not.toBe('confined');
  });

  it('duty in its duty slot is in the room hosting duty, outside it routine', () => {
    const s = campaign(reg, 4);
    const id = s.squad[3].id;
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: id, kind: 'duty', day: s.day, slot: s.slot }], demands: [], demandLog: [] };
    expect(roomOf(whereabouts(s, reg), id)).toEqual({ unitId: id, roomId: hosting('duty'), reason: 'duty' });
    const later = at(s, s.day, s.slot === 'afternoon' ? 'evening' : 'afternoon');
    expect(roomOf(whereabouts(later, reg), id).reason).toBe('routine');
  });

  it('at night everyone is in the room hosting night', () => {
    const s = at(campaign(reg, 4), 3, 'night');
    const list = whereabouts(s, reg);
    expect(list.every((w) => w.reason === 'night' && w.roomId === hosting('night'))).toBe(true);
  });

  it('injured beats confined and confined beats night', () => {
    const s = at(campaign(reg, 4), 3, 'night');
    const id = s.squad[0].id;
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: id, kind: 'confined', untilDay: 9 }], demands: [], demandLog: [] };
    expect(roomOf(whereabouts(s, reg), id).reason).toBe('confined');
    s.squad[0].status = 'injured';
    expect(roomOf(whereabouts(s, reg), id).reason).toBe('injured');
  });

  it('an expedition party member has no room and reason expedition', () => {
    const s = campaign(reg, 4);
    const id = s.squad[0].id;
    s.expedition = { party: [id] } as unknown as CampaignState['expedition'];
    expect(roomOf(whereabouts(s, reg), id)).toEqual({ unitId: id, roomId: null, reason: 'expedition' });
    expect(roomOf(whereabouts(s, reg), s.squad[1].id).roomId).not.toBeNull();
  });

  it('dead, deserted and terminated units are absent', () => {
    const s = campaign(reg, 4);
    s.squad[0].status = 'dead';
    s.squad[1].status = 'deserted';
    s.squad[2].status = 'terminated';
    expect(whereabouts(s, reg).map((w) => w.unitId)).toEqual([s.squad[3].id]);
  });

  it('likes move the odds: the same unit lands in the mess hall more often when she likes food', () => {
    const s = campaign(reg, 4);
    const id = s.squad[0].id;
    // the hash input is the same in both runs (same day, slot and unit id), so only the likes differ
    const messVisits = (likes: string[]): number => {
      let n = 0;
      for (let day = 1; day <= 30; day++) {
        for (const slot of ['morning', 'afternoon', 'evening'] as Slot[]) {
          const c = at(s, day, slot);
          c.squad[0].likes = likes;
          if (roomOf(whereabouts(c, reg), id).roomId === 'mess') n++;
        }
      }
      return n;
    };
    expect(messVisits(['food'])).toBeGreaterThan(messVisits([]));
  });

  it('a room whose facility level is 0 is skipped', () => {
    const s = campaign(reg, 4);
    s.base.facilities.medbay = 0;
    for (let day = 1; day <= 20; day++) {
      for (const slot of ['morning', 'afternoon', 'evening'] as Slot[]) {
        const c = at(s, day, slot);
        for (const w of whereabouts(c, reg)) expect(w.roomId, `day ${day} ${slot}`).not.toBe('medbay');
      }
    }
  });

  it('a pack with no hubRooms gives reason nowhere for everyone', () => {
    const s = campaign(reg, 4);
    const w = whereabouts(s, { ...reg, hubRooms: new Map() });
    expect(w).toHaveLength(4);
    expect(w.every((x) => x.roomId === null && x.reason === 'nowhere')).toBe(true);
  });

  it('changing the day can change the room, changing nothing does not', () => {
    const s = campaign(reg, 4);
    const rooms = new Set<string | null>();
    for (let day = 1; day <= 12; day++) rooms.add(roomOf(whereabouts(at(s, day, 'morning'), reg), s.squad[0].id).roomId);
    expect(rooms.size).toBeGreaterThan(1);
    const a = whereabouts(at(s, 5, 'afternoon'), reg);
    expect(whereabouts(at(s, 5, 'afternoon'), reg)).toEqual(a);
  });

  it('grunts are placed like named units', () => {
    const s = campaign(reg, 4);
    const grunt = { ...structuredClone(s.squad[0]), id: 'grunt_k117', kind: 'grunt' as const, displayName: 'K-117', likes: [] };
    s.squad.push(grunt);
    expect(roomOf(whereabouts(s, reg), 'grunt_k117').roomId).not.toBeNull();
  });
});
