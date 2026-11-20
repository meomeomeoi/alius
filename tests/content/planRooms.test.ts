import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, HubRoomSchema, PlanRoomSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES } from '../../src/content/types';

const room = {
  id: 'g_mess', label: 'MESS HALL', floor: 'ground', rect: { x: 170, y: 300, w: 210, h: 150 }, kind: 'mess',
  description: 'Long tables and a dented serving line.', hubRoomId: 'mess',
};

describe('planRooms schema', () => {
  it('is a described registry', () => {
    expect(REGISTRY_NAMES).toContain('planRooms');
    expect(DESCRIBED_REGISTRIES).toContain('planRooms');
  });

  it('a complete room parses', () => {
    expect(PlanRoomSchema.safeParse(room).success).toBe(true);
    expect(PlanRoomSchema.safeParse({
      ...room, shortLabel: 'MESS', sceneLocationId: 'mess_hall', labelAt: { x: 175, y: 430 }, affordances: ['crowd'],
      doors: [{ x: 380, y: 404, side: 'w', size: 20 }, { x: 170, y: 400, side: 'w', size: 16 }, { x: 230, y: 300, side: 's', size: 16 }],
    }).success).toBe(true);
  });

  it('the rect stays inside the 1000 × 625 plan', () => {
    expect(PlanRoomSchema.safeParse({ ...room, rect: { x: 900, y: 0, w: 120, h: 10 } }).success).toBe(false);
    expect(PlanRoomSchema.safeParse({ ...room, rect: { x: 0, y: 600, w: 10, h: 40 } }).success).toBe(false);
    expect(PlanRoomSchema.safeParse({ ...room, rect: { x: 0, y: 0, w: 0, h: 10 } }).success).toBe(false);
  });

  it('a door must lie on an edge of its room, along that edge', () => {
    expect(PlanRoomSchema.safeParse({ ...room, doors: [{ x: 250, y: 360, side: 'n', size: 16 }] }).success).toBe(false); // inside
    expect(PlanRoomSchema.safeParse({ ...room, doors: [{ x: 380, y: 404, side: 'n', size: 16 }] }).success).toBe(false); // n/s lies on a top or bottom edge
    expect(PlanRoomSchema.safeParse({ ...room, doors: [{ x: 370, y: 450, side: 's', size: 16 }] }).success).toBe(false); // runs past the corner
    expect(PlanRoomSchema.safeParse({ ...room, doors: [{ x: 300, y: 450, side: 's', size: 16 }] }).success).toBe(true);
  });

  it('cabin only on a cabin, stairTo only on stairs and never to its own floor; unknown floor, side and cabin kinds are rejected', () => {
    expect(PlanRoomSchema.safeParse({ ...room, cabin: 'unit' }).success).toBe(false);
    expect(PlanRoomSchema.safeParse({ ...room, kind: 'cabin', cabin: 'unit' }).success).toBe(true);
    expect(PlanRoomSchema.safeParse({ ...room, kind: 'cabin', cabin: 'guest' }).success).toBe(false);
    expect(PlanRoomSchema.safeParse({ ...room, stairTo: 'upper' }).success).toBe(false);
    expect(PlanRoomSchema.safeParse({ ...room, kind: 'stair', stairTo: 'upper' }).success).toBe(true);
    expect(PlanRoomSchema.safeParse({ ...room, kind: 'stair', stairTo: 'ground' }).success).toBe(false);
    expect(PlanRoomSchema.safeParse({ ...room, floor: 'basement' }).success).toBe(false);
    expect(PlanRoomSchema.safeParse({ ...room, doors: [{ x: 300, y: 450, side: 'up', size: 16 }] }).success).toBe(false);
  });

  it('hubRooms no longer take a rect', () => {
    const hub = { id: 'mess', label: 'MESS HALL', description: 'd', sceneLocationId: 'mess_hall', weights: { morning: 1 } };
    expect(HubRoomSchema.safeParse(hub).success).toBe(true);
    expect(HubRoomSchema.safeParse({ ...hub, rect: { x: 0, y: 0, w: 10, h: 10 } }).success).toBe(false);
  });
});

const core = async (file: string): Promise<unknown> => JSON.parse(await readFile(`content/core/${file}`, 'utf8'));

/** A pack with the core hub rooms, locations, facilities and activities, and the plan rooms under test. */
async function loadPlan(plan: unknown[], hubRooms?: unknown[]) {
  const files: Record<string, unknown> = {
    'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 0, files: { planRooms: 'planRooms.json', hubRooms: 'hubRooms.json', locations: 'locations.json', facilities: 'facilities.json', activities: 'activities.json' } },
    'mem/planRooms.json': plan,
    'mem/hubRooms.json': hubRooms ?? await core('hubRooms.json'),
    'mem/locations.json': await core('locations.json'),
    'mem/facilities.json': await core('facilities.json'),
    'mem/activities.json': await core('activities.json'),
  };
  const loaded = await loadPacks(['mem'], async (p) => {
    if (!(p in files)) throw new Error(`404 ${p}`);
    return files[p];
  });
  return loaded.errors.filter((e) => e.file === 'planRooms.json').map((e) => e.message).join('\n');
}

describe('planRooms loader checks', () => {
  it('the core plan loads without errors', async () => {
    expect(await loadPlan(await core('planRooms.json') as unknown[])).toBe('');
  });

  it('an unknown hub room or scene location is an error', async () => {
    const plan = await core('planRooms.json') as Array<Record<string, unknown>>;
    expect(await loadPlan([...plan, { ...room, id: 'x1', rect: { x: 0, y: 0, w: 10, h: 10 }, floor: 'roof', hubRoomId: 'ghost' }])).toMatch(/ghost/);
    expect(await loadPlan([...plan, { ...room, id: 'x2', rect: { x: 0, y: 0, w: 10, h: 10 }, floor: 'roof', sceneLocationId: 'nowhere' }])).toMatch(/nowhere/);
  });

  it('a hub room without a plan room is an error', async () => {
    const plan = (await core('planRooms.json') as Array<Record<string, unknown>>).filter((p) => p.hubRoomId !== 'garage');
    expect(await loadPlan(plan)).toMatch(/garage/);
  });

  it('two closed rooms of one floor that overlap are an error; open spaces and stairs may overlap', async () => {
    const plan = await core('planRooms.json') as Array<Record<string, unknown>>;
    const mess = plan.find((p) => p.hubRoomId === 'mess')!;
    expect(await loadPlan([...plan, { ...room, id: 'x3', hubRoomId: undefined, kind: 'storage', rect: mess.rect }])).toMatch(/overlap/);
    expect(await loadPlan([...plan, { ...room, id: 'x4', hubRoomId: undefined, kind: 'corridor', floor: 'roof', rect: { x: 0, y: 0, w: 40, h: 20 } }, { ...room, id: 'x5', hubRoomId: undefined, kind: 'corridor', floor: 'roof', rect: { x: 20, y: 0, w: 40, h: 20 } }])).toBe('');
  });

  it('review fix: fewer unit cabins than the largest roster is an error; the commander cabin must belong to the commander cell', async () => {
    const plan = await core('planRooms.json') as Array<Record<string, unknown>>;
    expect(await loadPlan(plan.filter((p) => p.id !== 'u_cabin_10'))).toMatch(/9 unit cabins for a roster of up to 10/);
    expect(await loadPlan(plan.map((p) => (p.cabin === 'commander' ? { ...p, hubRoomId: 'comms' } : p)))).toMatch(/must belong to the commander cell/);
  });

  it('a commander cell needs a commander cabin', async () => {
    const plan = (await core('planRooms.json') as Array<Record<string, unknown>>).filter((p) => p.cabin !== 'commander');
    expect(await loadPlan(plan)).toMatch(/commander/);
  });
});
