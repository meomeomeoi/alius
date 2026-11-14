import { describe, it, expect } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import {
  ClockSchema, DilemmaTemplateSchema, MissionTemplateSchema, NodeTypeSchema, RegionSchema, RESERVED_EVENT_TYPES,
  RewardTierSchema, WorldEffectSchema, isCostEffect, ActivityEffectSchema,
} from '../../src/content/schemas';
import { REGISTRY_NAMES } from '../../src/content/types';
import { WORLD_EFFECT_TYPES, NODE_KINDS, MISSION_SOURCES, THREAD_STATUSES } from '../../src/engine/world/types';

const MIN: Record<string, Record<string, unknown>> = {
  resource: { type: 'resource', resource: 'credits', amount: 10 },
  carried_supplies: { type: 'carried_supplies', amount: -1 },
  faction: { type: 'faction', factionId: 'sable', amount: -5 },
  clock: { type: 'clock', clockId: 'oversight', by: 1 },
  flag: { type: 'flag', flagId: 'some_flag' },
  clearance: { type: 'clearance', tier: 1 },
  party_stress: { type: 'party_stress', amount: 5 },
  party_hp: { type: 'party_hp', pct: -20 },
  loot: { type: 'loot', tableId: 'loot_standard' },
  leash: { type: 'leash', amount: -1 },
  thread: { type: 'thread', threadId: 't1', status: 'resolved' },
  unit_event: { type: 'unit_event', event: 'sided_with', severity: 'minor', targets: 'party' },
  incoming_unit: { type: 'incoming_unit' },
  fact: { type: 'fact', text: 'Something happened.', tags: ['world'], importance: 3 },
  offer_mission: { type: 'offer_mission', templateId: 'tpl_sweep', source: 'command' },
  thread_flag: { type: 'thread_flag', threadId: 't1', flagId: 'thread:t1:saw_it', description: 'Saw it.' },
  stigma_news: { type: 'stigma_news', amount: 10 },
};

describe('world-effect vocabulary', () => {
  it('every world effect type parses its minimal example and rejects an unknown field', () => {
    expect(Object.keys(MIN).sort()).toEqual([...WORLD_EFFECT_TYPES].sort());
    for (const [type, fx] of Object.entries(MIN)) {
      expect(WorldEffectSchema.safeParse(fx).success, type).toBe(true);
      expect(WorldEffectSchema.safeParse({ ...fx, bogus: 1 }).success, `${type} + bogus`).toBe(false);
    }
    expect(WorldEffectSchema.safeParse({ type: 'teleport' }).success).toBe(false);
  });

  it('exports the const vocabularies', () => {
    expect(NODE_KINDS).toEqual(['combat', 'event', 'cache', 'rest', 'objective', 'unknown']);
    expect(MISSION_SOURCES).toEqual(['command', 'story', 'rumor', 'side']);
    expect(THREAD_STATUSES).toEqual(['open', 'resolved', 'failed', 'dormant']);
  });

  it('clock effect by 0 is rejected', () => {
    expect(WorldEffectSchema.safeParse({ type: 'clock', clockId: 'c', by: 0 }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ type: 'clock', clockId: 'c', by: -2 }).success).toBe(true);
    expect(WorldEffectSchema.safeParse({ type: 'clock', clockId: 'c', by: 3 }).success).toBe(false);
  });

  it('bounds: faction −30…30, clearance 1…3, party_hp −90…100, text ≤ 200', () => {
    expect(WorldEffectSchema.safeParse({ type: 'faction', factionId: 'f', amount: 31 }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ type: 'clearance', tier: 4 }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ type: 'party_hp', pct: -91 }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ ...MIN.fact, text: 'x'.repeat(201) }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ ...MIN.leash, amount: 2 }).success).toBe(false);
  });

  it('isCostEffect marks negative resources, positive stress/clock and hostile unit events', () => {
    const cost = (fx: Record<string, unknown>) => isCostEffect(WorldEffectSchema.parse(fx));
    expect(cost({ type: 'resource', resource: 'supplies', amount: -2 })).toBe(true);
    expect(cost({ type: 'resource', resource: 'supplies', amount: 2 })).toBe(false);
    expect(cost({ type: 'party_stress', amount: 5 })).toBe(true);
    expect(cost({ type: 'party_stress', amount: -5 })).toBe(false);
    expect(cost({ type: 'clock', clockId: 'c', by: 1 })).toBe(true);
    expect(cost({ type: 'clock', clockId: 'c', by: -1 })).toBe(false);
    expect(cost({ type: 'faction', factionId: 'f', amount: -3 })).toBe(true);
    expect(cost({ type: 'party_hp', pct: -10 })).toBe(true);
    expect(cost({ type: 'leash', amount: -1 })).toBe(true);
    expect(cost({ type: 'unit_event', event: 'decision_violated', severity: 'minor', targets: 'party' })).toBe(true);
    expect(cost({ type: 'unit_event', event: 'sided_with', severity: 'minor', targets: 'party' })).toBe(false);
    expect(cost({ type: 'flag', flagId: 'f' })).toBe(false);
    expect(cost({ type: 'loot', tableId: 't' })).toBe(false);
  });
});

const region = {
  id: 'r1', name: 'R', summary: 's', environmentPrompt: 'e', danger: 2, travelSlots: 2,
  enemyTable: { categories: { mutant_human: 3 } }, modifiers: [],
  mapHotspot: [[0, 0], [10, 0], [10, 10]], mapCell: { x: 0, y: 0 }, layers: [3, 4],
  nodeWeights: { combat: 3, event: 1 },
  pointsOfInterest: [{ id: 'scavenge', name: 'Scavenge', summary: 's', templateId: 'tpl_scavenge' }],
  rumors: ['A short rumor line.'],
};

describe('world content schemas', () => {
  it('region needs 3 hotspot points and layers inside 3..5', () => {
    expect(RegionSchema.safeParse(region).success).toBe(true);
    expect(RegionSchema.safeParse({ ...region, mapHotspot: [[0, 0], [10, 0]] }).success).toBe(false);
    expect(RegionSchema.safeParse({ ...region, mapHotspot: [[0, 0], [10, 0], [101, 10]] }).success).toBe(false);
    expect(RegionSchema.safeParse({ ...region, layers: [2, 4] }).success).toBe(false);
    expect(RegionSchema.safeParse({ ...region, layers: [3, 6] }).success).toBe(false);
    expect(RegionSchema.safeParse({ ...region, layers: [5, 3] }).success).toBe(false);
    expect(RegionSchema.safeParse({ ...region, travelSlots: 4 }).success).toBe(false);
    expect(RegionSchema.safeParse({ ...region, nodeWeights: { combat: 0 } }).success).toBe(false);
    expect(RegionSchema.safeParse({ ...region, rumors: [Array(41).fill('w').join(' ')] }).success).toBe(false);
    expect(RegionSchema.safeParse({ ...region, unlockedBy: { clearanceMin: 1 }, knownFromStart: false }).success).toBe(true);
  });

  it('combat node type needs a combat block, rest a rest block, unknown resolvesTo', () => {
    const base = { name: 'N', glyph: 'X' };
    const combat = { ...base, id: 'combat', kind: 'combat', combat: { dangerDelta: 0, lootTableId: 'loot_standard' } };
    expect(NodeTypeSchema.safeParse(combat).success).toBe(true);
    expect(NodeTypeSchema.safeParse({ ...combat, combat: undefined }).success).toBe(false);
    expect(NodeTypeSchema.safeParse({ ...combat, combat: { dangerDelta: 3, lootTableId: 'l' } }).success).toBe(false);
    const rest = { ...base, id: 'rest', kind: 'rest', rest: { suppliesPerUnit: 1, hpPct: 25, stress: -15 } };
    expect(NodeTypeSchema.safeParse(rest).success).toBe(true);
    expect(NodeTypeSchema.safeParse({ ...rest, rest: undefined }).success).toBe(false);
    const unknown = { ...base, id: 'unknown', kind: 'unknown', resolvesTo: { combat: 4, event: 3 } };
    expect(NodeTypeSchema.safeParse(unknown).success).toBe(true);
    expect(NodeTypeSchema.safeParse({ ...unknown, resolvesTo: undefined }).success).toBe(false);
    expect(NodeTypeSchema.safeParse({ ...base, id: 'event', kind: 'event' }).success).toBe(true);
    expect(NodeTypeSchema.safeParse({ ...base, id: 'event', kind: 'event', glyph: 'XY' }).success).toBe(false);
    expect(NodeTypeSchema.safeParse({ ...base, id: 'event', kind: 'event', combat: { dangerDelta: 0, lootTableId: 'l' } }).success).toBe(false);
    expect(NodeTypeSchema.safeParse({ ...base, id: 'crisis', kind: 'combat', glyph: '▲', maxPerMap: 1, minDanger: 3, firstLayer: false,
      combat: { dangerDelta: 1, lootTableId: 'l', exposesCommander: true } }).success).toBe(true);
  });

  it('clock schema: segments 4…12 and startFilled below segments', () => {
    const clock = { id: 'c', label: 'C', segments: 6, startFilled: 0, visibleToPlayer: true, onFill: [MIN.fact] };
    expect(ClockSchema.safeParse(clock).success).toBe(true);
    expect(ClockSchema.safeParse({ ...clock, segments: 3 }).success).toBe(false);
    expect(ClockSchema.safeParse({ ...clock, segments: 13 }).success).toBe(false);
    expect(ClockSchema.safeParse({ ...clock, startFilled: 6 }).success).toBe(false);
    expect(ClockSchema.safeParse({ ...clock, onFill: [{ type: 'nope' }] }).success).toBe(false);
  });

  it('reward tier needs ordered ranges', () => {
    const tier = { id: 'tier_1', rank: 1, credits: [20, 40], plyx: [2, 6] };
    expect(RewardTierSchema.safeParse(tier).success).toBe(true);
    expect(RewardTierSchema.safeParse({ ...tier, credits: [40, 20] }).success).toBe(false);
    expect(RewardTierSchema.safeParse({ ...tier, rank: 6 }).success).toBe(false);
    expect(RewardTierSchema.safeParse({ ...tier, faction: 16 }).success).toBe(false);
    expect(RewardTierSchema.safeParse({ ...tier, lootTableId: 'loot_standard', lootRolls: 2 }).success).toBe(true);
  });

  it('mission template without objectives or tiers is rejected', () => {
    const tpl = {
      id: 'tpl_x', name: 'X', sources: ['command'], objectives: [{ node: 'combat', condition: 'win' }],
      dangerRange: [1, 3], tiers: ['tier_1'], failureEffects: [], titles: ['T'], briefs: ['B'],
    };
    expect(MissionTemplateSchema.safeParse(tpl).success).toBe(true);
    expect(MissionTemplateSchema.safeParse({ ...tpl, objectives: [] }).success).toBe(false);
    expect(MissionTemplateSchema.safeParse({ ...tpl, tiers: [] }).success).toBe(false);
    expect(MissionTemplateSchema.safeParse({ ...tpl, sources: [] }).success).toBe(false);
    expect(MissionTemplateSchema.safeParse({ ...tpl, sources: ['dream'] }).success).toBe(false);
    expect(MissionTemplateSchema.safeParse({ ...tpl, dangerRange: [0, 3] }).success).toBe(false);
    expect(MissionTemplateSchema.safeParse({ ...tpl, titles: ['x'.repeat(61)] }).success).toBe(false);
    expect(MissionTemplateSchema.safeParse({ ...tpl, briefs: ['x'.repeat(301)] }).success).toBe(false);
    expect(MissionTemplateSchema.safeParse({ ...tpl, onSuccess: [MIN.flag], clearance: 1, factionId: 'sable' }).success).toBe(true);
  });
});

const option = (label: string, effects: unknown[]) => ({ label, effects });
const minor = {
  id: 'evt_x', scale: 'minor', contexts: ['expedition_event'],
  fixed: {
    title: 'A fork', setup: 'Two ways.',
    options: [option('Go left', [{ type: 'resource', resource: 'supplies', amount: -1 }]), option('Go right', [{ type: 'party_stress', amount: 5 }])],
  },
};

describe('dilemma templates (minor events)', () => {
  it('minor expedition event needs a fixed block', () => {
    expect(DilemmaTemplateSchema.safeParse(minor).success).toBe(true);
    expect(DilemmaTemplateSchema.safeParse({ ...minor, fixed: undefined }).success).toBe(false);
  });

  it('a non-flavor option without a cost effect is rejected', () => {
    const bad = { ...minor, fixed: { ...minor.fixed, options: [minor.fixed.options[0], option('Free lunch', [{ type: 'resource', resource: 'credits', amount: 20 }])] } };
    expect(DilemmaTemplateSchema.safeParse(bad).success).toBe(false);
    const tooFew = { ...minor, fixed: { ...minor.fixed, options: [minor.fixed.options[0]] } };
    expect(DilemmaTemplateSchema.safeParse(tooFew).success).toBe(false);
  });

  it('a flavor event is one CONTINUE option without effects; with effects it is rejected', () => {
    const flavor = { id: 'evt_f', scale: 'minor', contexts: ['expedition_event'], flavor: true,
      fixed: { title: 'Quiet', setup: 'Nothing.', options: [option('CONTINUE', [])] } };
    expect(DilemmaTemplateSchema.safeParse(flavor).success).toBe(true);
    expect(DilemmaTemplateSchema.safeParse({ ...flavor, fixed: { ...flavor.fixed, options: [option('CONTINUE', [MIN.flag])] } }).success).toBe(false);
    expect(DilemmaTemplateSchema.safeParse({ ...flavor, fixed: { ...flavor.fixed, options: [option('A', []), option('B', [])] } }).success).toBe(false);
  });

  it('options may carry a requires gate; unknown extra fields pass through (P6)', () => {
    const gated = { ...minor, generation: { prompt: 'p' }, fixed: { ...minor.fixed, options: [
      { ...minor.fixed.options[0], requires: { stat: 'empathy', rank: 3 } }, minor.fixed.options[1]] } };
    expect(DilemmaTemplateSchema.safeParse(gated).success).toBe(true);
    expect(DilemmaTemplateSchema.safeParse({ ...minor, fixed: { ...minor.fixed, options: [
      { ...minor.fixed.options[0], requires: { stat: 'empathy', rank: 6 } }, minor.fixed.options[1]] } }).success).toBe(false);
    expect(DilemmaTemplateSchema.safeParse({ ...minor, scale: 'major', fixed: undefined }).success).toBe(true);
  });
});

describe('registries and events', () => {
  it('REGISTRY_NAMES contains missionTemplates, clocks, rewardTiers', () => {
    for (const n of ['missionTemplates', 'clocks', 'rewardTiers']) expect(REGISTRY_NAMES).toContain(n);
  });

  it('emit_event cannot impersonate expedition_ended', () => {
    const fx = (event: string) => ({ type: 'emit_event', event });
    for (const e of ['world_seeded', 'clock_advanced', 'clock_filled', 'faction_changed', 'flag_set', 'clearance_raised', 'thread_changed',
      'mission_offered', 'mission_completed', 'mission_failed', 'mission_expired', 'rumor_posted', 'rumor_followed', 'beat_proposed',
      'beat_completed', 'incoming_unit_offered', 'unit_joined', 'director_requested', 'director_applied', 'director_rejected',
      'expedition_started', 'expedition_moved', 'expedition_node', 'expedition_combat', 'expedition_event', 'expedition_choice',
      'expedition_treated', 'expedition_ended', 'expedition_recap_set']) {
      expect(RESERVED_EVENT_TYPES, e).toContain(e);
      expect(ActivityEffectSchema.safeParse(fx(e)).success, e).toBe(false);
    }
  });
});

// ---- cross references through the loader -------------------------------------------------------------------------

const memFetch = (files: Record<string, unknown>) => async (path: string) => {
  if (!(path in files)) throw new Error(`404 ${path}`);
  return files[path];
};
async function errorsOf(files: Record<string, unknown[]>) {
  const out: Record<string, unknown> = {
    'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: Object.fromEntries(Object.keys(files).map((k) => [k, `${k}.json`])) },
  };
  for (const [k, v] of Object.entries(files)) out[`p/${k}.json`] = v;
  return (await loadPacks(['p'], memFetch(out))).errors;
}
const at = (errs: Array<{ file: string; path: string; message: string }>, file: string, path: string) =>
  errs.find((e) => e.file === file && e.path === path);

describe('world content refs', () => {
  it('refs: unknown clock, faction, flag, loot table, region, node type, template and tier ids are reported with their path', async () => {
    const errs = await errorsOf({
      clocks: [
        { id: 'c1', label: 'C', segments: 6, startFilled: 0, visibleToPlayer: true, regionId: 'ghost_region', onFill: [
          { type: 'clock', clockId: 'ghost_clock', by: 1 }, { type: 'faction', factionId: 'ghost_corp', amount: 1 },
          { type: 'flag', flagId: 'ghost_flag' }, { type: 'loot', tableId: 'ghost_loot' },
          { type: 'offer_mission', templateId: 'ghost_tpl', regionId: 'ghost_r2', source: 'command' }] },
      ],
      regions: [{ ...region, id: 'r1', enemyTable: { categories: { ghost_cat: 1 }, archetypes: ['ghost_enemy'] },
        nodeWeights: { ghost_node: 1 }, unlockedBy: { flag: 'ghost_flag2' },
        pointsOfInterest: [{ id: 'p', name: 'P', summary: 's', templateId: 'ghost_tpl2' }] }],
      nodeTypes: [{ id: 'combat', name: 'C', glyph: 'X', kind: 'combat', combat: { dangerDelta: 0, lootTableId: 'ghost_loot2' } },
        { id: 'unknown', name: 'U', glyph: '?', kind: 'unknown', resolvesTo: { ghost_node2: 1, unknown: 1 } }],
      missionTemplates: [{ id: 'tpl_x', name: 'X', sources: ['command'], regions: ['ghost_region3'], objectives: [{ node: 'ghost_node3', condition: 'win' }],
        dangerRange: [1, 3], tiers: ['ghost_tier'], factionId: 'ghost_corp2', objectiveEventId: 'ghost_event',
        failureEffects: [], titles: ['T'], briefs: ['B'] }],
      dilemmaTemplates: [{ ...minor, id: 'evt_a', regions: ['ghost_region4'] }],
      corporations: [{ id: 'corp', name: 'C', summary: 's', values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 },
        oversightStyle: 'o', playable: true, startingBonus: { text: 't', effects: [] }, startingRegionId: 'ghost_region5',
        leash: { weekly: 2, approval: 0.5 } }],
    });
    const wanted: Array<[string, string, string]> = [
      ['clocks.json', '[0].regionId', 'regions'],
      ['clocks.json', '[0].onFill[0].clockId', 'clocks'],
      ['clocks.json', '[0].onFill[1].factionId', 'corporations'],
      ['clocks.json', '[0].onFill[2].flagId', 'flags'],
      ['clocks.json', '[0].onFill[3].tableId', 'lootTables'],
      ['clocks.json', '[0].onFill[4].templateId', 'missionTemplates'],
      ['clocks.json', '[0].onFill[4].regionId', 'regions'],
      ['regions.json', '[0].enemyTable.categories.ghost_cat', 'enemyCategories'],
      ['regions.json', '[0].enemyTable.archetypes[0]', 'enemies'],
      ['regions.json', '[0].nodeWeights.ghost_node', 'nodeTypes'],
      ['regions.json', '[0].unlockedBy.flag', 'flags'],
      ['regions.json', '[0].pointsOfInterest[0].templateId', 'missionTemplates'],
      ['nodeTypes.json', '[0].combat.lootTableId', 'lootTables'],
      ['nodeTypes.json', '[1].resolvesTo.ghost_node2', 'nodeTypes'],
      ['missionTemplates.json', '[0].regions[0]', 'regions'],
      ['missionTemplates.json', '[0].objectives[0].node', 'nodeTypes'],
      ['missionTemplates.json', '[0].tiers[0]', 'rewardTiers'],
      ['missionTemplates.json', '[0].factionId', 'corporations'],
      ['missionTemplates.json', '[0].objectiveEventId', 'dilemmaTemplates'],
      ['dilemmaTemplates.json', '[0].regions[0]', 'regions'],
      ['corporations.json', '[0].startingRegionId', 'regions'],
    ];
    for (const [file, path, registry] of wanted) {
      expect(at(errs, file, path)?.message, `${file} ${path}`).toContain(registry);
    }
    // an unknown inside a rest/unknown chain: `unknown` may not resolve to itself
    expect(at(errs, 'nodeTypes.json', '[1].resolvesTo.unknown')?.message).toContain('unknown');
  });

  it('refs: dilemma option effects and spine beats are checked too', async () => {
    const errs = await errorsOf({
      dilemmaTemplates: [{ ...minor, fixed: { ...minor.fixed, options: [
        option('A', [{ type: 'flag', flagId: 'ghost_flag' }, { type: 'resource', resource: 'supplies', amount: -1 }]),
        option('B', [{ type: 'party_stress', amount: 1 }])] } }],
      starts: [{ id: 's', name: 'S', corporationId: 'corp', summary: 'x', situation: 'y', spine: [1, 2, 3, 4, 5].map((i) => ({
        id: `b${i}`, title: 't', goal: 'g',
        conditions: i === 1 ? { flagsAll: ['ghost_a'], flagsNone: ['ghost_b'] } : undefined,
        completion: i === 2 ? { kind: 'flag', anyOf: ['ghost_c'] } : i === 3 ? { kind: 'mission', templateId: 'ghost_tpl', regionId: 'ghost_r' } : undefined,
        onComplete: i === 4 ? [{ type: 'clock', clockId: 'ghost_clock', by: 1 }] : undefined,
      })) }],
    });
    expect(at(errs, 'dilemmaTemplates.json', '[0].fixed.options[0].effects[0].flagId')?.message).toContain('flags');
    expect(at(errs, 'starts.json', '[0].spine[0].conditions.flagsAll[0]')?.message).toContain('flags');
    expect(at(errs, 'starts.json', '[0].spine[0].conditions.flagsNone[0]')?.message).toContain('flags');
    expect(at(errs, 'starts.json', '[0].spine[1].completion.anyOf[0]')?.message).toContain('flags');
    expect(at(errs, 'starts.json', '[0].spine[2].completion.templateId')?.message).toContain('missionTemplates');
    expect(at(errs, 'starts.json', '[0].spine[2].completion.regionId')?.message).toContain('regions');
    expect(at(errs, 'starts.json', '[0].spine[3].onComplete[0].clockId')?.message).toContain('clocks');
  });

  it('a relation-scoped flag in a world effect is reported', async () => {
    const errs = await errorsOf({
      flags: [{ id: 'rel_flag', scope: 'relation', description: 'd' }, { id: 'world_flag', scope: 'world', description: 'd' },
        { id: 'cmd_flag', scope: 'commander', description: 'd' }],
      clocks: [{ id: 'c1', label: 'C', segments: 6, startFilled: 0, visibleToPlayer: true, onFill: [
        { type: 'flag', flagId: 'rel_flag' }, { type: 'flag', flagId: 'world_flag' }, { type: 'flag', flagId: 'cmd_flag' }] }],
    });
    expect(at(errs, 'clocks.json', '[0].onFill[0].flagId')?.message).toContain('scope');
    expect(at(errs, 'clocks.json', '[0].onFill[1].flagId')).toBeUndefined();
    expect(at(errs, 'clocks.json', '[0].onFill[2].flagId')).toBeUndefined();
  });

  it('refs: node-type, template and event kinds are checked', async () => {
    const errs = await errorsOf({
      nodeTypes: [
        { id: 'event', name: 'E', glyph: '!', kind: 'event' },
        { id: 'rest', name: 'R', glyph: '+', kind: 'rest', rest: { suppliesPerUnit: 1, hpPct: 25, stress: -15 } },
        { id: 'objective', name: 'O', glyph: 'o', kind: 'objective' },
        { id: 'unknown', name: 'U', glyph: '?', kind: 'unknown', resolvesTo: { objective: 1, event: 1 } },
      ],
      rewardTiers: [{ id: 'tier_1', rank: 1, credits: [1, 2], plyx: [1, 2] }],
      missionTemplates: [
        { id: 'tpl_bad', name: 'B', sources: ['command'], objectives: [{ node: 'rest', condition: 'reach' }], dangerRange: [1, 2], tiers: ['tier_1'], failureEffects: [], titles: ['T'], briefs: ['B'] },
        { id: 'tpl_ok', name: 'K', sources: ['command'], objectives: [{ node: 'event', condition: 'reach' }], dangerRange: [1, 2], tiers: ['tier_1'], failureEffects: [], titles: ['T'], briefs: ['B'] },
        { id: 'tpl_cmd', name: 'C', sources: ['command'], objectives: [{ node: 'event', condition: 'reach' }], dangerRange: [1, 2], tiers: ['tier_1'], failureEffects: [], titles: ['T'], briefs: ['B'] },
      ],
      regions: [{ ...region, nodeWeights: { event: 1 },
        pointsOfInterest: [{ id: 'p', name: 'P', summary: 's', templateId: 'tpl_cmd' }] }],
      starts: [{ id: 's', name: 'S', corporationId: 'corp', summary: 'x', situation: 'y', spine: [1, 2, 3, 4, 5].map((i) => ({
        id: `b${i}`, title: 't', goal: 'g', completion: i === 1 ? { kind: 'mission', templateId: 'tpl_ok', regionId: 'r1' } : undefined })) }],
    });
    expect(at(errs, 'missionTemplates.json', '[0].objectives[0].node')?.message).toContain('rest');
    expect(at(errs, 'missionTemplates.json', '[1].objectives[0].node')).toBeUndefined();
    expect(at(errs, 'nodeTypes.json', '[3].resolvesTo.objective')?.message).toContain('objective');
    expect(at(errs, 'nodeTypes.json', '[3].resolvesTo.event')).toBeUndefined();
    expect(at(errs, 'regions.json', '[0].pointsOfInterest[0].templateId')?.message).toContain('side');
    expect(at(errs, 'starts.json', '[0].spine[0].completion.templateId')?.message).toContain('story');
  });

  it('a win objective needs a combat-kind node; reach may use any objective kind', async () => {
    const nodeTypes = [
      { id: 'combat', name: 'C', glyph: 'X', kind: 'combat', combat: { dangerDelta: 0, lootTableId: 'ghost_loot' } },
      { id: 'cache', name: 'K', glyph: '=', kind: 'cache' },
    ];
    const tpl = (id: string, node: string, condition: string) => ({
      id, name: 'T', sources: ['command'], objectives: [{ node, condition }], dangerRange: [1, 2], tiers: ['tier_1'], failureEffects: [], titles: ['T'], briefs: ['B'],
    });
    const errs = await errorsOf({
      nodeTypes, rewardTiers: [{ id: 'tier_1', rank: 1, credits: [1, 2], plyx: [1, 2] }],
      missionTemplates: [tpl('win_cache', 'cache', 'win'), tpl('win_combat', 'combat', 'win'), tpl('reach_cache', 'cache', 'reach')],
    });
    expect(at(errs, 'missionTemplates.json', '[0].objectives[0].condition')?.message).toMatch(/win/);
    expect(at(errs, 'missionTemplates.json', '[1].objectives[0].condition')).toBeUndefined();
    expect(at(errs, 'missionTemplates.json', '[2].objectives[0].condition')).toBeUndefined();
  });
});
