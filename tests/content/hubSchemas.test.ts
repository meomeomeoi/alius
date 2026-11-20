import { describe, expect, it } from 'vitest';
import { HubRoomSchema } from '../../src/content/schemas';
import { loadPacks } from '../../src/content/loader';
import { readFile } from 'node:fs/promises';
import { REGISTRY_NAMES } from '../../src/content/types';

const room = {
  id: 'mess', label: 'MESS HALL', description: 'Long tables and a dented serving line.',
  sceneLocationId: 'mess_hall',
  weights: { morning: 3, afternoon: 1, evening: 3, night: 0 },
};

describe('hubRooms schema', () => {
  it('is a registry name', () => {
    expect(REGISTRY_NAMES).toContain('hubRooms');
  });

  it('a complete room parses', () => {
    expect(HubRoomSchema.safeParse(room).success).toBe(true);
    expect(HubRoomSchema.safeParse({ ...room, facilityId: 'mess_hall', activityIds: ['mess'], likeTags: ['food'], hosts: ['night'], commanderCell: true }).success).toBe(true);
  });

  it('P10d: a rect is rejected (the geometry lives in planRooms)', () => {
    expect(HubRoomSchema.safeParse({ ...room, rect: { x: 0, y: 46, w: 32, h: 32 } }).success).toBe(false);
  });

  it('weights above 5 are rejected', () => {
    expect(HubRoomSchema.safeParse({ ...room, weights: { morning: 6 } }).success).toBe(false);
    expect(HubRoomSchema.safeParse({ ...room, weights: { morning: 2.5 } }).success).toBe(false);
    expect(HubRoomSchema.safeParse({ ...room, weights: { dusk: 1 } }).success).toBe(false);
  });

  it('an unknown host is rejected', () => {
    expect(HubRoomSchema.safeParse({ ...room, hosts: ['sleeping'] }).success).toBe(false);
  });
});

const core = async (file: string): Promise<unknown> => JSON.parse(await readFile(`content/core/${file}`, 'utf8'));

/** A fixture pack: real core locations, facilities and activities, plus the rooms under test. */
async function loadRooms(rooms: unknown[]) {
  const files: Record<string, unknown> = {
    'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 0, files: { hubRooms: 'hubRooms.json', locations: 'locations.json', facilities: 'facilities.json', activities: 'activities.json' } },
    'mem/hubRooms.json': rooms,
    'mem/locations.json': await core('locations.json'),
    'mem/facilities.json': await core('facilities.json'),
    'mem/activities.json': await core('activities.json'),
  };
  const loaded = await loadPacks(['mem'], async (p) => {
    if (!(p in files)) throw new Error(`404 ${p}`);
    return files[p];
  });
  return { ...loaded, errors: loaded.errors.filter((e) => e.file === 'hubRooms.json') };
}

describe('hubRooms loader checks', () => {
  it('an unknown sceneLocationId is an error naming the room', async () => {
    const { errors } = await loadRooms([{ ...room, sceneLocationId: 'nowhere' }]);
    const text = errors.map((e) => `${e.message} @ ${JSON.stringify(e)}`).join('\n');
    expect(errors.length).toBeGreaterThan(0);
    expect(text).toMatch(/nowhere/);
    expect(text).toMatch(/mess/);
  });

  it('an unknown facility id is an error', async () => {
    const { errors } = await loadRooms([{ ...room, facilityId: 'ghost_facility' }]);
    expect(errors.map((e) => e.message).join('\n')).toMatch(/ghost_facility/);
  });

  it('an unknown activity id is an error', async () => {
    const { errors } = await loadRooms([{ ...room, activityIds: ['ghost_activity'] }]);
    expect(errors.map((e) => e.message).join('\n')).toMatch(/ghost_activity/);
  });

  it('two rooms hosting injured is an error', async () => {
    const other = { ...room, id: 'cot', label: 'COT' };
    const { errors } = await loadRooms([
      { ...room, hosts: ['injured', 'confined', 'duty', 'night'] },
      { ...other, hosts: ['injured'] },
    ]);
    expect(errors.map((e) => e.message).join('\n')).toMatch(/injured/);
  });

  it('a non-empty registry that leaves a host unplaced is an error', async () => {
    const { errors } = await loadRooms([{ ...room, hosts: ['injured', 'confined', 'duty'] }]);
    expect(errors.map((e) => e.message).join('\n')).toMatch(/night/);
  });

  it('a valid fixture loads without room errors', async () => {
    const { errors } = await loadRooms([{ ...room, facilityId: 'mess_hall', activityIds: ['mess'], hosts: ['injured', 'confined', 'duty', 'night'] }]);
    expect(errors, JSON.stringify(errors)).toEqual([]);
  });
});
