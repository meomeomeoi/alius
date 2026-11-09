import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { defaultFormation } from '../../../src/engine/combat/stats';
import { createCampaign } from '../../../src/engine/state/create';
import { migrate } from '../../../src/engine/state/migrations';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { clockById, factionStanding, knownRegions, regionState, seedWorld } from '../../../src/engine/world/state';
import '../../../src/engine/actions/debug';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let seeded: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  seeded = campaign(reg, 4);
});

/** A save made before P5: nothing seeded. */
function p4Save(): CampaignState {
  const s = structuredClone(seeded);
  s.world.clocks = [];
  s.world.factions = {};
  s.world.regions = {};
  delete s.world.seeded;
  return s;
}

describe('seedWorld', () => {
  it('creates every clock at its start value, factions at 0 with the own corporation at 10, and knows the start region', () => {
    const s = p4Save();
    const events = seedWorld(s, reg);
    expect(s.world.clocks.map((c) => c.id).sort()).toEqual([...reg.clocks.keys()].sort());
    for (const c of s.world.clocks) {
      const def = reg.clocks.get(c.id)!;
      expect(c.filled).toBe(def.startFilled);
      expect(c.segments).toBe(def.segments);
      expect(c.label).toBe(def.label);
      expect(c.visibleToPlayer).toBe(def.visibleToPlayer);
      expect(c.regionId).toBe(def.regionId);
    }
    expect(s.world.factions).toEqual({ vesper: TUNING.world.ownFactionStart, kestrel: 0, aurum: 0, sable: 0 });
    expect(TUNING.world.ownFactionStart).toBe(10);
    expect(s.world.regions.quarantine_d7.known).toBe(true);
    expect(s.world.regions.kestrel_corridor.known).toBe(true);
    expect(s.world.regions.ashway.known).toBe(true);
    expect(s.world.regions.drowned_market.known).toBe(false);
    expect(s.world.seeded).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['world_seeded']);
    expect(s.missions).toEqual({ offered: [], active: [], completed: [] });
  });

  it('twice changes nothing', () => {
    const s = p4Save();
    seedWorld(s, reg);
    const once = structuredClone(s);
    s.world.clocks[0].filled = 3; // a later change must survive a second call
    once.world.clocks[0].filled = 3;
    const events = seedWorld(s, reg);
    expect(events).toEqual([]);
    expect(s).toEqual(once);
  });

  it('buildCampaign returns a seeded world', () => {
    expect(seeded.world.seeded).toBe(true);
    expect(seeded.world.clocks).toHaveLength(5);
    expect(factionStanding(seeded, 'vesper')).toBe(10);
    expect(factionStanding(seeded, 'sable')).toBe(0);
    expect(seeded.world.regions.quarantine_d7.known).toBe(true);
    // the Kestrel start owns Kestrel
    const k = campaign(reg, 4, { startId: 'start_kestrel' });
    expect(factionStanding(k, 'kestrel')).toBe(10);
    expect(factionStanding(k, 'vesper')).toBe(0);
  });

  it('a P4-era save (world.clocks = [], no seeded flag) loads through migrate and seeds with world/seed', () => {
    const raw = JSON.parse(JSON.stringify(p4Save()));
    const m = migrate(raw);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.world.clocks).toEqual([]);
    const r = run(m.state, reg, { type: 'world/seed', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'world_seeded')).toHaveLength(1);
    expect(r.state.world.clocks).toHaveLength(5);
    expect(r.state.world.seeded).toBe(true);
    // a second call is a no-op without events
    const again = run(r.state, reg, { type: 'world/seed', payload: {} });
    expect(again.events).toEqual([]);
    expect(again.state).toEqual(r.state);
  });
});

describe('world readers', () => {
  it('default for unknown ids', () => {
    const s = createCampaign({ seed: 1, commanderName: 'V' });
    expect(factionStanding(s, 'nobody')).toBe(0);
    expect(clockById(s, 'nope')).toBeUndefined();
    expect(regionState(s, 'nowhere')).toEqual({ known: false });
  });

  it('clockById finds a seeded clock', () => {
    expect(clockById(seeded, 'oversight')?.segments).toBe(6);
  });

  it('knownRegions adds a region when its clearance requirement is met', () => {
    const s = structuredClone(seeded);
    const ids = (st: CampaignState) => knownRegions(st, reg).map((r) => r.id).sort();
    expect(ids(s)).toEqual(['ashway', 'kestrel_corridor', 'quarantine_d7']);
    s.world.clearanceTier = 1;
    expect(ids(s)).toEqual(['ashway', 'drowned_market', 'kestrel_corridor', 'quarantine_d7']);
    s.world.clearanceTier = 2;
    expect(ids(s)).toContain('the_garden');
  });

  it('knownRegions honours a state flag and an unlock flag', () => {
    const s = structuredClone(seeded);
    s.world.regions.the_garden = { known: true };
    expect(knownRegions(s, reg).map((r) => r.id)).toContain('the_garden');
    const r2 = new Map(reg.regions);
    r2.set('flagged', { ...(reg.regions.get('ashway') as object), id: 'flagged', knownFromStart: false, unlockedBy: { flag: 'evidence_buried' } } as never);
    const reg2 = { ...reg, regions: r2 } as Registries;
    expect(knownRegions(s, reg2).map((r) => r.id)).not.toContain('flagged');
    s.world.flags.push('evidence_buried');
    expect(knownRegions(s, reg2).map((r) => r.id)).toContain('flagged');
  });
});

describe('the expedition guard', () => {
  const open = (s: CampaignState): CampaignState => {
    const t = structuredClone(s);
    t.expedition = { id: 'exp_1' } as never;
    return t;
  };

  it('an activity is refused while an expedition is open and the state is unchanged', () => {
    const s = open(seeded);
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'rest' } });
    expect(r.events).toEqual([{ type: 'error', code: 'expedition_open', message: 'An expedition is under way: finish or abandon it first.' }]);
    expect(r.state).toBe(s);
    for (const type of ['base/requisition', 'calendar/consume_slot', 'scene/start', 'world/seed']) {
      const x = run(s, reg, { type, payload: {} });
      expect(x.events[0], type).toMatchObject({ type: 'error', code: 'expedition_open' });
      expect(x.state).toBe(s);
    }
  });

  it('combat and debug actions still run while an expedition is open', () => {
    const s = open(seeded);
    expect(errors(run(s, reg, { type: 'debug/noop' }).events)).toEqual([]);
    const formation = defaultFormation(s, reg, s.roster.activeIds);
    const r = run(s, reg, { type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.combat).toBeDefined();
    expect(ofType(r.events, 'combat_started')).toHaveLength(1);
    // while the fight is open the P4 guard still keeps other actions out
    const blocked = run(r.state, reg, { type: 'activity/do', payload: { activityId: 'rest' } });
    expect(blocked.events[0]).toMatchObject({ type: 'error' });
  });

  it('with no expedition the guard is silent', () => {
    const r = run(seeded, reg, { type: 'world/seed', payload: {} });
    expect(errors(r.events)).toEqual([]);
  });
});
