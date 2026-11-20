import type { Entry, Registries } from '../content/types';
import { PLAN_OPEN_KINDS, type PlanFloor } from '../content/schemas';
import { isLiving } from './economy';
import type { Whereabout } from './hub';
import type { CampaignState } from './state/types';

/**
 * P10d: the plan of the base. Pure, stateless, no rng. Plan rooms are read by `floor`, `kind`, `hubRoomId`, `cabin`,
 * `stairTo`, never by id. Geometry is in plan units (a 1000 × 625 box, the 16:10 hub stage).
 */

export type { PlanFloor };
export interface PlanRect { x: number; y: number; w: number; h: number }
export interface PlanDoor { x: number; y: number; side: 'n' | 's' | 'e' | 'w'; size: number }

export const rectOf = (e: Entry): PlanRect => e.rect as PlanRect;
export const doorsOf = (e: Entry): PlanDoor[] => (e.doors ?? []) as PlanDoor[];

/** Every plan room of a floor, in registry order. */
export function planRoomsOn(reg: Registries, floor: PlanFloor): Entry[] {
  return [...reg.planRooms.values()].filter((e) => e.floor === floor);
}

/** Corridors, lobbies and staircases without doors: their walls are the outline of their union. */
export function isOpenSpace(e: Entry): boolean {
  return (PLAN_OPEN_KINDS as readonly string[]).includes(String(e.kind)) || (e.kind === 'stair' && doorsOf(e).length === 0);
}

/** Drawn dark and not clickable: no hub room behind it (a cabin included), and not an open space or a staircase. */
export function isClosed(reg: Registries, e: Entry): boolean {
  if (typeof e.hubRoomId === 'string' && reg.hubRooms.has(e.hubRoomId)) return false;
  return !isOpenSpace(e) && e.kind !== 'stair';
}

export const unitCabins = (reg: Registries): Entry[] => [...reg.planRooms.values()].filter((e) => e.cabin === 'unit');
export const commanderCabin = (reg: Registries): Entry | undefined => [...reg.planRooms.values()].find((e) => e.cabin === 'commander');

/**
 * Who lives where. A unit's index `k` among all units in `state.squad` (append-only: a departed unit keeps hers) picks
 * `cabins[k % n]`; a cabin held by a living unit with a smaller index sends her on to the next free one; with none free
 * she shares the one she was pointed at. Nobody moves when someone leaves or joins.
 */
function cabinMap(state: Pick<CampaignState, 'squad'>, reg: Registries): Map<string, Entry> {
  const cabins = unitCabins(reg);
  const out = new Map<string, Entry>();
  if (cabins.length === 0) return out;
  const taken = new Set<string>();
  state.squad.forEach((u, k) => {
    if (!isLiving(u)) return;
    const start = k % cabins.length;
    let pick = cabins[start];
    for (let i = 0; i < cabins.length; i++) {
      const c = cabins[(start + i) % cabins.length];
      if (!taken.has(String(c.id))) {
        pick = c;
        break;
      }
    }
    taken.add(String(pick.id));
    out.set(u.id, pick);
  });
  return out;
}

export function cabinOf(state: Pick<CampaignState, 'squad'>, reg: Registries, unitId: string): Entry | null {
  return cabinMap(state, reg).get(unitId) ?? null;
}

/** The living unit who has this cabin (the first in squad order when it is shared), or `null` (VACANT). */
export function cabinOwner(state: Pick<CampaignState, 'squad'>, reg: Registries, cabinId: string): string | null {
  for (const [unitId, c] of cabinMap(state, reg)) if (c.id === cabinId) return unitId;
  return null;
}

/**
 * The plan room a person is drawn in. A unit: her whereabout's hub room, and when that hub room has unit cabins, her own
 * cabin; `null` while she is away or nowhere. The commander (`'commander'`): the commander's cabin (later packages add
 * reasons that move the commander: a hold, a night claimed, the cage).
 */
export function roomOfPerson(state: CampaignState, reg: Registries, here: Whereabout[], personId: string): Entry | null {
  if (personId === 'commander') return commanderCabin(reg) ?? null;
  const w = here.find((x) => x.unitId === personId);
  if (!w || w.roomId === null) return null;
  const plan = [...reg.planRooms.values()].filter((e) => e.hubRoomId === w.roomId);
  if (plan.some((e) => e.cabin === 'unit')) {
    const own = cabinOf(state, reg, personId);
    if (own && own.hubRoomId === w.roomId) return own;
  }
  return plan.find((e) => e.cabin === undefined) ?? plan[0] ?? null;
}

/** Plan rooms with somebody in them this slot, and the commander's cabin. */
export function litRooms(state: CampaignState, reg: Registries, here: Whereabout[]): Set<string> {
  const lit = new Set<string>();
  for (const w of here) {
    const r = roomOfPerson(state, reg, here, w.unitId);
    if (r) lit.add(String(r.id));
  }
  const cmdr = roomOfPerson(state, reg, here, 'commander');
  if (cmdr) lit.add(String(cmdr.id));
  return lit;
}

// ---------------------------------------------------------------------------------------------
// The door graph (groundwork for P17 visitors, P17a summons, P17d sounds)

export interface PlanEdge { to: string; via: 'door' | 'open' | 'stair'; length: number }
export const OUTSIDE = 'outside';

const centre = (r: PlanRect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const dist = (a: PlanRect, b: PlanRect): number => Math.hypot(centre(a)[0] - centre(b)[0], centre(a)[1] - centre(b)[1]);
const contains = (r: PlanRect, x: number, y: number): boolean => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const overlap = (a: PlanRect, b: PlanRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Length of boundary two rects share (0 when they only meet at a corner or not at all). */
function shared(a: PlanRect, b: PlanRect): number {
  const xs = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const ys = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const vertical = (Math.abs(a.x + a.w - b.x) < 0.01 || Math.abs(b.x + b.w - a.x) < 0.01) ? Math.max(0, ys) : 0;
  const horizontal = (Math.abs(a.y + a.h - b.y) < 0.01 || Math.abs(b.y + b.h - a.y) < 0.01) ? Math.max(0, xs) : 0;
  return Math.max(vertical, horizontal);
}
const STAIR_LENGTH = 40;

/** The smallest plan room of a floor that holds the point (a staircase inside a lobby wins over the lobby). */
function roomAt(rooms: Entry[], x: number, y: number): Entry | undefined {
  return rooms.filter((e) => contains(rectOf(e), x, y)).sort((a, b) => rectOf(a).w * rectOf(a).h - rectOf(b).w * rectOf(b).h)[0];
}

const graphs = new WeakMap<Registries, Map<string, PlanEdge[]>>();

/**
 * Rooms joined by their doors (each door probed 2 units to either side of its middle, across its wall; nothing there
 * is `outside`), open spaces joined where they touch, a staircase joined to the room it stands in and to the staircase
 * of `stairTo` that it overlaps. Edges carry the distance between the rooms' centres.
 */
export function planGraph(reg: Registries): Map<string, PlanEdge[]> {
  const known = graphs.get(reg);
  if (known) return known;
  const g = new Map<string, PlanEdge[]>();
  const add = (a: string, b: string, via: PlanEdge['via'], length: number): void => {
    if (a === b) return;
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const list = g.get(from) ?? [];
      if (!list.some((e) => e.to === to && e.via === via)) list.push({ to, via, length });
      g.set(from, list);
    }
  };
  const all = [...reg.planRooms.values()];
  for (const e of all) g.set(String(e.id), g.get(String(e.id)) ?? []);
  const byFloor = new Map<string, Entry[]>();
  for (const e of all) byFloor.set(String(e.floor), [...(byFloor.get(String(e.floor)) ?? []), e]);

  for (const e of all) {
    const floor = byFloor.get(String(e.floor)) ?? [];
    for (const d of doorsOf(e)) {
      const across = d.side === 'n' || d.side === 's';
      const mx = across ? d.x + d.size / 2 : d.x;
      const my = across ? d.y : d.y + d.size / 2;
      const [p, q] = across ? [[mx, my - 2], [mx, my + 2]] : [[mx - 2, my], [mx + 2, my]];
      const a = roomAt(floor, p[0], p[1]);
      const b = roomAt(floor, q[0], q[1]);
      const ida = a ? String(a.id) : OUTSIDE;
      const idb = b ? String(b.id) : OUTSIDE;
      if (ida === OUTSIDE && idb === OUTSIDE) continue;
      add(ida, idb, 'door', a && b ? dist(rectOf(a), rectOf(b)) : 30);
    }
  }
  for (const rooms of byFloor.values()) {
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const ra = rectOf(a);
        const rb = rectOf(b);
        const openPair = isOpenSpace(a) && isOpenSpace(b) && (overlap(ra, rb) || shared(ra, rb) > 0);
        const stairIn = (a.kind === 'stair' || b.kind === 'stair') && overlap(ra, rb);
        if (openPair || stairIn) add(String(a.id), String(b.id), 'open', dist(ra, rb));
      }
    }
  }
  for (const e of all) {
    if (typeof e.stairTo !== 'string') continue;
    const there = (byFloor.get(e.stairTo) ?? []).find((o) => o.kind === 'stair' && overlap(rectOf(o), rectOf(e)));
    if (there) add(String(e.id), String(there.id), 'stair', STAIR_LENGTH);
  }
  graphs.set(reg, g);
  return g;
}

/**
 * The rooms next to a room. `door`: one step through a door, an opening or a staircase (`outside` included). `wall`:
 * rooms of the same floor sharing at least 8 units of wall with no door or opening between (what the next room hears).
 */
export function neighbours(reg: Registries, roomId: string, by: 'door' | 'wall' | 'any' = 'any'): string[] {
  const g = planGraph(reg);
  const door = (g.get(roomId) ?? []).map((e) => e.to);
  if (by === 'door') return [...new Set(door)];
  const me = reg.planRooms.get(roomId);
  const wall = me
    ? planRoomsOn(reg, me.floor as PlanFloor).filter((o) => o.id !== roomId && !door.includes(String(o.id)) && shared(rectOf(me), rectOf(o)) >= 8).map((o) => String(o.id))
    : [];
  return by === 'wall' ? wall : [...new Set([...door, ...wall])];
}

export interface PlanRoute { rooms: string[]; length: number; floors: PlanFloor[] }

/** The shortest way between two plan rooms (Dijkstra over the door graph), or `null` when there is none. */
export function route(reg: Registries, from: string, to: string): PlanRoute | null {
  const g = planGraph(reg);
  if (!g.has(from) || !g.has(to)) return null;
  const best = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set<string>([from]);
  while (open.size > 0) {
    let cur = '';
    let curD = Infinity;
    for (const n of open) {
      const d = best.get(n)!;
      if (d < curD || (d === curD && n < cur)) [cur, curD] = [n, d];
    }
    open.delete(cur);
    if (cur === to) break;
    for (const e of g.get(cur) ?? []) {
      const d = curD + e.length;
      if (d < (best.get(e.to) ?? Infinity)) {
        best.set(e.to, d);
        prev.set(e.to, cur);
        open.add(e.to);
      }
    }
  }
  if (!best.has(to)) return null;
  const rooms = [to];
  while (rooms[0] !== from) rooms.unshift(prev.get(rooms[0])!);
  const floors: PlanFloor[] = [];
  for (const id of rooms) {
    const f = reg.planRooms.get(id)?.floor as PlanFloor | undefined;
    if (f && floors.at(-1) !== f) floors.push(f);
  }
  return { rooms, length: Math.round(best.get(to)!), floors };
}

// ---------------------------------------------------------------------------------------------
// Marks over the plan (groundwork: P15/P16/P17 draw territory, a forbidden room, a locked door, a staging, her props)

export interface PlanMark { planRoomId: string; kind: string; label?: string; analyze?: string }
export type PlanMarkProvider = (state: CampaignState, reg: Registries) => PlanMark[];
const markProviders: PlanMarkProvider[] = [];

export function registerPlanMarks(provider: PlanMarkProvider): void {
  markProviders.push(provider);
}

/** Tests only. */
export function resetPlanMarks(): void {
  markProviders.length = 0;
}

/** The marks of every provider, in registration order; marks on rooms the plan does not have are dropped. */
export function planMarks(state: CampaignState, reg: Registries): PlanMark[] {
  return markProviders.flatMap((p) => p(state, reg)).filter((m) => reg.planRooms.has(m.planRoomId));
}
