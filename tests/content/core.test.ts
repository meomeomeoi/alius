import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { EVENT_TYPES, PROPOSAL_KINDS } from '../../src/engine/relations/vocab';

const load = () => loadPacks(['content/core'], async (path) => JSON.parse(await readFile(path, 'utf8')));

describe('core content pack', () => {
  it('core pack loads with zero errors', async () => {
    const { errors } = await load();
    expect(errors).toEqual([]);
  });

  it('counts: 4 corporations, 2 starts, 6 crimes, 6 roles, 12 signatures, 18 defects (4 desire_bond), 10 statuses', async () => {
    const { registries: r } = await load();
    expect(r.corporations.size).toBe(4);
    expect(r.starts.size).toBe(2);
    expect(r.crimes.size).toBe(6);
    expect(r.roles.size).toBe(6);
    expect(r.signatures.size).toBe(12);
    expect(r.defects.size).toBe(18);
    expect([...r.defects.values()].filter((d) => d.category === 'desire_bond')).toHaveLength(4);
    expect(r.statuses.size).toBe(10);
  });

  it('both starts use playable corporations', async () => {
    const { registries: r } = await load();
    expect([...r.corporations.keys()].sort()).toEqual(['aurum', 'kestrel', 'sable', 'vesper']);
    expect(r.starts.get('start_vesper')!.corporationId).toBe('vesper');
    expect(r.starts.get('start_kestrel')!.corporationId).toBe('kestrel');
    for (const s of r.starts.values()) {
      expect(r.corporations.get(s.corporationId as string)!.playable).toBe(true);
    }
    expect(r.corporations.get('aurum')!.playable).toBe(false);
    expect(r.corporations.get('sable')!.playable).toBe(false);
  });

  it('lorebook has the three constant entries', async () => {
    const { lorebook } = await load();
    expect(lorebook!.name).toBe('Alius Core Lore');
    expect(lorebook!.entries.filter((e) => e.constant).map((e) => e.comment)).toEqual([
      'world_premise', 'leash_protocol', 'ccp_program',
    ]);
    for (const e of lorebook!.entries) {
      expect(e.content.split(/\s+/).length, e.comment).toBeLessThanOrEqual(120);
    }
    expect(lorebook!.entries).toHaveLength(21);
  });

  it('assault base stats are 110/24/12/14/10', async () => {
    const { registries: r } = await load();
    expect(r.roles.get('assault')!.baseStats).toEqual({ hp: 110, atk: 24, def: 12, spd: 14, crit: 10 });
  });

  it('crime start effects match the plan', async () => {
    const { registries: r } = await load();
    const fx = (id: string, side: 'perk' | 'flaw') =>
      ((r.crimes.get(id)![side] as { effects: unknown[] }).effects);
    expect(fx('mutiny', 'perk')).toContainEqual({ type: 'social_rank', stat: 'authority', rank: 2 });
    expect(fx('strain_trade', 'perk')).toContainEqual({ type: 'resource', resource: 'plyx', amount: 20 });
    expect(fx('experimentation', 'flaw')).toContainEqual({ type: 'starting_trust', amount: -10 });
    expect(fx('purge', 'perk')).toContainEqual({
      type: 'starting_trust', amount: 10, ifValue: { axis: 'pragmatism', sign: '+' },
    });
    for (const c of r.crimes.values()) expect(c.knownByDefault).toBe(false);
  });

  it('knows_crime flag is declared', async () => {
    const { registries: r } = await load();
    expect(r.flags.get('knows_crime')).toMatchObject({ scope: 'relation', setBy: ['start', 'event'] });
  });
});

describe('core content: P2 registries', () => {
  it('core pack has the nine v1 activities and five facilities', async () => {
    const { registries: r, errors } = await load();
    expect(errors).toEqual([]);
    expect([...r.activities.keys()].sort()).toEqual(
      ['medbay', 'mess', 'rest', 'scout_net', 'study', 'talk', 'train', 'work', 'workshop'],
    );
    expect([...r.facilities.keys()].sort()).toEqual(['barracks', 'comms', 'medbay', 'mess_hall', 'workshop']);
  });

  it('every activity facilityReq exists and is within the facility max level', async () => {
    const { registries: r } = await load();
    for (const a of r.activities.values()) {
      const req = a.facilityReq as { id: string; level: number } | undefined;
      if (!req) continue;
      const f = r.facilities.get(req.id);
      expect(f, `${a.id} → ${req.id}`).toBeDefined();
      expect(req.level).toBeLessThanOrEqual(f!.maxLevel as number);
    }
  });

  it('facility levels are complete', async () => {
    const { registries: r } = await load();
    const maxes = Object.fromEntries([...r.facilities.values()].map((f) => [f.id, f.maxLevel]));
    expect(maxes).toEqual({ barracks: 5, workshop: 5, medbay: 5, mess_hall: 3, comms: 3 });
    const barracks = r.facilities.get('barracks')!.levels as Array<{ effects: Record<string, number> }>;
    expect(barracks[0].effects.rosterCapacity).toBe(6);
    expect(barracks[4].effects.rosterCapacity).toBe(10);
  });

  it('talk requires a companion and starts a scene', async () => {
    const { registries: r } = await load();
    expect(r.activities.get('talk')).toMatchObject({ companion: 'required', startsScene: true });
  });

  it('train and work are blocked while the commander is injured, others are not', async () => {
    const { registries: r } = await load();
    const blocked = [...r.activities.values()].filter((a) => a.blockedWhenCommanderInjured === true).map((a) => a.id);
    expect(blocked.sort()).toEqual(['train', 'work']);
  });

  it('starts declare starting resources', async () => {
    const { registries: r } = await load();
    for (const s of r.starts.values()) {
      const res = s.startingResources as { credits: number; supplies: number; plyx: number };
      expect(res, s.id).toBeDefined();
      expect(res.supplies).toBeGreaterThan(0);
    }
  });
});

describe('activity cross references', () => {
  const pack = (activity: Record<string, unknown>) => {
    const files: Record<string, unknown> = {
      'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: { activities: 'a.json', facilities: 'f.json' } },
      'p/a.json': [activity],
      'p/f.json': [{
        id: 'medbay', name: 'M', summary: 's', maxLevel: 1, levels: [{ effects: { stressReliefPct: 0 } }],
      }],
    };
    return loadPacks(['p'], async (path) => files[path]);
  };
  const base = {
    id: 'x', name: 'X', summary: 's', slotRules: ['morning'], cost: {}, companion: 'none', flavor: 'none', companionEffects: [],
    effects: [{ type: 'unit_stress', target: 'selected', amount: -5, scale: { facility: 'medbay', key: 'stressReliefPct' } }],
  };

  it('a valid scale reference loads', async () => {
    expect((await pack(base)).errors).toEqual([]);
  });

  it('scale pointing at an unknown facility is a load error', async () => {
    const r = await pack({ ...base, effects: [{ ...base.effects[0], scale: { facility: 'nowhere', key: 'k' } }] });
    expect(r.errors.map((e) => e.message).join('|')).toContain('references unknown facilities id "nowhere"');
  });

  it('scale pointing at an unknown facility key is a load error', async () => {
    const r = await pack({ ...base, effects: [{ ...base.effects[0], scale: { facility: 'medbay', key: 'nope' } }] });
    expect(r.errors.map((e) => e.message).join('|')).toContain('has no effect "nope"');
  });

  it('facilityReq above the facility max level is a load error', async () => {
    const r = await pack({ ...base, facilityReq: { id: 'medbay', level: 2 } });
    expect(r.errors.map((e) => e.message).join('|')).toContain('has no level 2');
  });

  it('core has the 18 relationship states of the spec', async () => {
    const { registries: r } = await load();
    expect([...r.relationshipStates.keys()].sort()).toEqual([
      'comrade', 'confidant', 'dependent', 'despises', 'devoted', 'estranged', 'flirting', 'friend', 'fwb', 'kindred',
      'lover', 'obsessed', 'resentful', 'rival', 'rival_romance', 'secret_affair', 'stranger', 'trusted', 'unrequited',
    ]);
    // the spec table has 18 rows; its first row (stranger → comrade) is two states
    expect(r.relationshipStates.size).toBe(19);
  });

  it('every proposal kind maps to at least one state', async () => {
    const { registries: r } = await load();
    const covered = new Set([...r.relationshipStates.values()].flatMap((s) => (s.entry as { proposals?: string[] }).proposals ?? []));
    for (const k of PROPOSAL_KINDS) expect(covered.has(k), k).toBe(true);
  });

  it('romantic group states are marked romance', async () => {
    const { registries: r } = await load();
    for (const s of r.relationshipStates.values()) {
      if (s.group === 'romantic') expect(s.romance, String(s.id)).toBe(true);
    }
    expect(r.relationshipStates.get('comrade')!.romance).toBe(false);
  });

  it('stranger, comrade and trusted are available to grunts', async () => {
    const { registries: r } = await load();
    const grunt = [...r.relationshipStates.values()].filter((s) => s.grunts === true).map((s) => s.id).sort();
    expect(grunt).toEqual(['comrade', 'stranger', 'trusted']);
  });

  it('every event type has all four severity rows', async () => {
    const { registries: r } = await load();
    for (const t of EVENT_TYPES) {
      const e = r.eventDeltas.get(t);
      expect(e, t).toBeDefined();
      expect(Object.keys(e!.rows as object).sort(), t).toEqual(['extreme', 'major', 'minor', 'moderate']);
    }
    expect(r.eventDeltas.size).toBe(EVENT_TYPES.length);
  });

  it('table rows from the spec', async () => {
    const { registries: r } = await load();
    const row = (t: string, sev: string) => (r.eventDeltas.get(t)!.rows as Record<string, Record<string, number>>)[sev];
    expect(row('insulted', 'major')).toMatchObject({ trust: -4, affinity: -10 });
    expect(row('protected', 'major')).toMatchObject({ trust: 8, affinity: 6 });
    expect(row('flirted', 'minor')).toMatchObject({ attraction: 2 });
    expect(r.eventDeltas.get('flirted')!.attractionUsesReceptivity).toBe(true);
    expect(r.eventDeltas.get('decision_violated')!.valueAligned).toBe(true);
    expect(r.eventDeltas.get('decision_aligned')!.valueAligned).toBe(true);
  });

  it('ten base locations with ASCII art', async () => {
    const { registries: r } = await load();
    expect([...r.locations.keys()].sort()).toEqual([
      'comms_room', 'garage', 'medbay', 'mess_hall', 'perimeter', 'quarters_commander', 'quarters_unit', 'roof',
      'training_yard', 'workshop',
    ]);
    for (const l of r.locations.values()) expect((l.ascii as string[]).length, String(l.id)).toBeGreaterThan(0);
    expect(r.locations.get('quarters_unit')!.perUnit).toBe(true);
  });

  it('defect hooks reference existing activities and flags', async () => {
    const { registries: r } = await load();
    const hooks = [...r.defects.values()].flatMap((d) => (d.socialHooks as Array<{ activity: string; setFlag?: string }> | undefined) ?? []);
    expect(hooks.length).toBeGreaterThanOrEqual(5);
    for (const h of hooks) {
      expect(r.activities.has(h.activity), h.activity).toBe(true);
      if (h.setFlag) expect(r.flags.has(h.setFlag), h.setFlag).toBe(true);
    }
    expect(r.defects.get('affect_dampener')!.relationModifiers).toMatchObject({ gain: { affinity: 0.5, attraction: 0.5 } });
    expect(r.defects.get('imprint_fracture')!.relationModifiers).toMatchObject({ gain: { trust: 1.5 } });
    expect(r.defects.get('compulsive_protocol')!.relationModifiers).toMatchObject({ events: { kept_promise: 2, broke_promise: 2 } });
    for (const f of ['shared_secret', 'need_controlled', 'crime_reaction_done']) expect(r.flags.get(f)!.scope).toBe('relation');
  });

  it('the exits and proposal targets listed in the plan exist', async () => {
    const { registries: r } = await load();
    const exits = (id: string) => (r.relationshipStates.get(id)!.exit as Array<{ to: string }>).map((e) => e.to);
    expect(exits('estranged')).toContain('comrade');
    expect(exits('despises')).toContain('estranged');
    expect(exits('resentful')).toContain('comrade');
    expect(exits('obsessed')).toContain('comrade');
    expect(exits('kindred')).toContain('confidant');
    expect(exits('unrequited')).toContain('comrade');
    for (const id of ['flirting', 'fwb', 'lover', 'devoted', 'secret_affair']) expect(exits(id), id).toContain('estranged');
  });
});
