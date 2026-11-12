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

  it('glossary is a registry of the core pack', async () => {
    const { registries: r } = await load();
    expect(r.glossary.size).toBeGreaterThanOrEqual(3);
    for (const id of ['trust', 'stress', 'cp']) expect(r.glossary.has(id), id).toBe(true);
  });

  it('counts: 4 corporations, 2 starts, 6 crimes, 6 roles, 12 signatures, 18 defects (4 desire_bond), 14 statuses', async () => {
    const { registries: r } = await load();
    expect(r.corporations.size).toBe(4);
    expect(r.starts.size).toBe(2);
    expect(r.crimes.size).toBe(6);
    expect(r.roles.size).toBe(6);
    expect(r.signatures.size).toBe(12);
    expect(r.defects.size).toBe(18);
    expect([...r.defects.values()].filter((d) => d.category === 'desire_bond')).toHaveLength(4);
    expect(r.statuses.size).toBe(14);
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

// ---- P4: role skills, signatures, statuses, orders, synergies, defect combat data -----------------------------------

import type { Skill } from '../../src/content/schemas';

type Node = { id: string; branch: number | null; tier: number | null; cost: number; requires: string[]; grants: { skill?: string; upgrade?: { skillId: string } } };
const roleTree = (r: Record<string, unknown>) => r.tree as Node[];
const skillOf = (r: Awaited<ReturnType<typeof load>>['registries'], id: string) => r.skills.get(id) as unknown as Skill;
const fxTypes = (s: Skill) => s.effects.map((e) => e.type);

describe('core content: P4 roles and skills', () => {
  it('every role has growth, aiProfile, 2 starters and a 66-point tree', async () => {
    const { registries: r } = await load();
    const profiles: Record<string, string> = {
      assault: 'aggressive', defender: 'protector', sniper: 'predator', support: 'protector', medic: 'protector', specialist: 'disruptor',
    };
    for (const role of r.roles.values()) {
      const g = role.growth as Record<string, number>;
      expect(g.hp, role.id).toBeGreaterThanOrEqual(5);
      expect(g.hp).toBeLessThanOrEqual(8);
      expect(g.atk).toBeGreaterThanOrEqual(0.8);
      expect(g.atk).toBeLessThanOrEqual(1.4);
      expect(role.aiProfile).toBe(profiles[role.id]);
      expect(role.starterSkills as string[]).toHaveLength(2);
      const tree = roleTree(role);
      expect(tree, role.id).toHaveLength(16);
      expect(tree.reduce((sum, n) => sum + n.cost, 0), role.id).toBe(66);
      expect(tree.filter((n) => n.branch === null)).toHaveLength(1);
      expect(tree.find((n) => n.branch === null)!.cost).toBe(6);
    }
  });

  it('every tree branch follows active/passive/upgrade/active/passive with costs 2-6', async () => {
    const { registries: r } = await load();
    for (const role of r.roles.values()) {
      for (let b = 0; b < 3; b++) {
        const nodes = roleTree(role).filter((n) => n.branch === b).sort((x, y) => (x.tier ?? 0) - (y.tier ?? 0));
        expect(nodes.map((n) => n.tier), `${role.id} branch ${b}`).toEqual([1, 2, 3, 4, 5]);
        expect(nodes.map((n) => n.cost)).toEqual([2, 3, 4, 5, 6]);
        const kinds = nodes.map((n) => (n.grants.upgrade ? 'upgrade' : skillOf(r, n.grants.skill!).kind));
        expect(kinds, `${role.id} branch ${b}`).toEqual(['active', 'passive', 'upgrade', 'active', 'passive']);
        expect(nodes[2].grants.upgrade!.skillId).toBe(nodes[0].grants.skill);
        for (let i = 1; i < 5; i++) expect(nodes[i].requires).toEqual([nodes[i - 1].id]);
      }
      const ult = roleTree(role).find((n) => n.branch === null)!;
      expect(skillOf(r, ult.grants.skill!).kind).toBe('ultimate');
      expect(skillOf(r, ult.grants.skill!).cp).toBe(3);
    }
  });

  it('every role has a basic damaging starter that costs no cooldown', async () => {
    const { registries: r } = await load();
    for (const role of r.roles.values()) {
      const first = skillOf(r, (role.starterSkills as string[])[0]);
      expect(first.kind).toBe('active');
      expect(first.cooldown).toBe(0);
      expect(fxTypes(first)).toContain('damage');
    }
  });

  it('medic trees revive (limit combat), support trees generate CP, defender trees taunt and guard', async () => {
    const { registries: r } = await load();
    const skillsOfRole = (id: string) => roleTree(r.roles.get(id)!).map((n) => n.grants.skill).filter(Boolean).map((s) => skillOf(r, s!));
    const effects = (id: string) => skillsOfRole(id).flatMap((s) => s.effects);
    expect(effects('medic').some((e) => e.type === 'revive' && e.limit === 'combat')).toBe(true);
    expect(effects('support').some((e) => e.type === 'cp')).toBe(true);
    expect(effects('defender').some((e) => e.type === 'status' && e.statusId === 'taunt')).toBe(true);
    expect(effects('defender').some((e) => e.type === 'status' && e.statusId === 'guard')).toBe(true);
  });

  it('every signature template has a signature skill under its own id', async () => {
    const { registries: r } = await load();
    for (const sig of r.signatures.values()) {
      expect(sig.skill, sig.id).toBe(sig.id);
      const s = skillOf(r, sig.id);
      expect(['signature', 'passive'], sig.id).toContain(s.kind);
    }
    expect(skillOf(r, 'sig_last_stand').kind).toBe('passive');
    expect(skillOf(r, 'sig_scavenge').kind).toBe('passive');
    expect(fxTypes(skillOf(r, 'sig_command_echo'))).toContain('repeat_order');
    expect(fxTypes(skillOf(r, 'sig_overclock_burst'))).toEqual(['extra_action', 'status']);
  });
});

describe('core content: P4 statuses, orders, synergies and defects', () => {
  it('14 statuses with mechanics', async () => {
    const { registries: r } = await load();
    expect([...r.statuses.keys()].sort()).toEqual([
      'authorized', 'bleed', 'burn', 'corrode', 'focus', 'guard', 'hold_line', 'infect', 'mark', 'overheat', 'shield', 'stun', 'taunt', 'untargetable',
    ]);
    expect(r.statuses.get('stun')!.flags).toEqual(['skipTurn']);
    expect(r.statuses.get('untargetable')!.flags).toEqual(['untargetable']);
    expect(r.statuses.get('taunt')!.flags).toEqual(['taunt']);
    expect(r.statuses.get('shield')!.flags).toEqual(['absorb']);
    expect(r.statuses.get('guard')!.incomingPct).toBe(-30);
    expect(r.statuses.get('mark')!.incomingPct).toBe(15);
    expect(r.statuses.get('corrode')!.mods).toEqual({ def: -15 });
    expect(r.statuses.get('corrode')!.maxStacks).toBe(3);
    expect(r.statuses.get('hold_line')!.mods).toEqual({ def: 30 });
    expect(r.statuses.get('hold_line')!.flags).toContain('rooted');
    expect((r.statuses.get('bleed')!.tick as Array<{ pctMaxHp: number }>)[0].pctMaxHp).toBe(4);
    expect((r.statuses.get('burn')!.tick as Array<{ pctMaxHp: number }>)[0].pctMaxHp).toBe(6);
    expect((r.statuses.get('infect')!.tick as Array<{ type: string; amount: number }>)[0]).toMatchObject({ type: 'stress', amount: 3 });
    expect(r.statuses.get('overheat')!.mods).toEqual({ atk: -10, spd: -10 });
  });

  it('5 orders with the roles.md costs', async () => {
    const { registries: r } = await load();
    expect([...r.orders.keys()]).toEqual(['focus_fire', 'hold_the_line', 'fall_back', 'steady', 'authorize_ultimate']);
    const cost = (id: string) => r.orders.get(id)!.cost;
    expect([cost('focus_fire'), cost('hold_the_line'), cost('fall_back'), cost('steady'), cost('authorize_ultimate')]).toEqual([2, 2, 1, 1, 3]);
    expect(r.orders.get('focus_fire')!.target).toBe('enemy');
    expect(r.orders.get('hold_the_line')!.target).toBe('none');
    expect(r.orders.get('fall_back')!.target).toBe('ally');
  });

  it('every synergy id unlocked by a relationship state exists, and the friction ids are attached', async () => {
    const { registries: r } = await load();
    for (const st of r.relationshipStates.values()) {
      for (const id of (st.unlocks as { synergies: string[] }).synergies) expect(r.synergies.has(id), `${st.id}: ${id}`).toBe(true);
    }
    const unlocks = (id: string) => (r.relationshipStates.get(id)!.unlocks as { synergies: string[] }).synergies;
    expect(unlocks('resentful')).toContain('order_friction_minor');
    expect(unlocks('estranged')).toContain('order_friction');
    expect(unlocks('despises')).toContain('order_friction_major');
    const chance = (id: string) => (r.synergies.get(id)!.effects as Array<{ chance: number }>)[0].chance;
    expect([chance('order_friction_minor'), chance('order_friction'), chance('order_friction_major')]).toEqual([0.15, 0.25, 0.35]);
  });

  it('all 18 defects have combat data and every downside effect is marked', async () => {
    const { registries: r } = await load();
    for (const d of r.defects.values()) {
      const c = d.combat as { upside: unknown[]; downside: Array<{ downside?: boolean }>; breakdown: { policy: string } };
      expect(c, d.id).toBeTruthy();
      expect(c.breakdown.policy, d.id).toBeTruthy();
      for (const e of c.downside) expect(e.downside, d.id).toBe(true);
    }
  });

  it('at least 6 defects use distinct breakdown policies', async () => {
    const { registries: r } = await load();
    const policies = new Set([...r.defects.values()].map((d) => (d.combat as { breakdown: { policy: string } }).breakdown.policy));
    expect(policies.size).toBeGreaterThanOrEqual(6);
    const by = (id: string) => (r.defects.get(id)!.combat as { breakdown: Record<string, unknown> }).breakdown;
    expect(by('rage_governor')).toMatchObject({ policy: 'attack', target: 'strongest_enemy', ignoresOrders: true });
    expect(by('affect_dampener').policy).toBe('skip');
    expect(by('compulsive_protocol').policy).toBe('repeat_last');
    expect(by('threat_saturation')).toMatchObject({ policy: 'attack', target: 'nearest_any', once: true });
    expect(by('overclock_bias').policy).toBe('twice_then_shutdown');
    expect(by('compliance_craving').policy).toBe('await_order');
    expect(by('graft_rejection').policy).toBe('normal');
    expect(by('echo_bleed')).toMatchObject({ policy: 'random_skill', ignoresOrders: true });
  });
});

// ---- P4: enemies, affixes, items, recipes, loot tables ---------------------------------------------------------------

describe('core content: P4 enemies and items', () => {
  it('6 categories with the lore frequencies', async () => {
    const { registries: r } = await load();
    const freq = Object.fromEntries([...r.enemyCategories.values()].map((c) => [c.id, c.frequency]));
    expect(freq).toEqual({
      mutant_human: 'common', mutant_beast: 'common', marauder: 'common',
      enemy_soldier: 'rare', offspec_hostile: 'rare', anomaly: 'very_rare',
    });
  });

  it('18 enemies, 3 per category, every aiProfile used, erratic only on fracture', async () => {
    const { registries: r } = await load();
    expect(r.enemies.size).toBe(18);
    const per: Record<string, number> = {};
    for (const e of r.enemies.values()) per[e.categoryId as string] = (per[e.categoryId as string] ?? 0) + 1;
    expect(Object.values(per)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(new Set([...r.enemies.values()].map((e) => e.aiProfile))).toEqual(
      new Set(['aggressive', 'predator', 'protector', 'disruptor', 'stressor', 'erratic']),
    );
    expect([...r.enemies.values()].filter((e) => e.aiProfile === 'erratic').map((e) => e.id)).toEqual(['fracture']);
    for (const e of r.enemies.values()) {
      const lines = (e.portrait as { ascii: string[] }).ascii;
      expect(lines.length, e.id).toBeLessThanOrEqual(8);
    }
    expect([...r.enemies.keys()].sort()).toEqual([
      'bloater', 'brute', 'echo', 'field_officer', 'fracture', 'hound', 'husk', 'raider', 'rogue_assault', 'rogue_medic',
      'rogue_specialist', 'scav_marksman', 'shield_trooper', 'stalker', 'swarmer', 'trooper', 'warlord', 'whisper',
    ]);
  });

  it('anomalies deal stress and ignore rows; mutants inflict infect or bleed', async () => {
    const { registries: r } = await load();
    const fx = (id: string) => (r.enemies.get(id)!.skills as string[]).flatMap((s) => skillOf(r, s).effects);
    for (const id of ['whisper', 'echo']) {
      expect(fx(id).some((e) => e.type === 'stress'), id).toBe(true);
    }
    for (const id of ['whisper', 'fracture', 'echo']) {
      expect(fx(id).some((e) => e.type === 'damage' && e.ignoreRows === true), id).toBe(true);
    }
    for (const id of ['husk', 'swarmer', 'stalker', 'hound']) {
      expect(fx(id).some((e) => e.type === 'status' && (e.statusId === 'infect' || e.statusId === 'bleed')), id).toBe(true);
    }
  });

  it('every enemy skill is kind enemy and every enemy has an elite skill', async () => {
    const { registries: r } = await load();
    for (const e of r.enemies.values()) {
      for (const s of e.skills as string[]) expect(skillOf(r, s).kind, `${e.id}: ${s}`).toBe('enemy');
      expect(skillOf(r, e.eliteSkill as string).kind).toBe('enemy');
    }
  });

  it('7 enemy affixes and >= 8 item affixes with 3 drawbacks', async () => {
    const { registries: r } = await load();
    const enemyAffixes = [...r.affixes.values()].filter((a) => a.appliesTo === 'enemy');
    expect(enemyAffixes.map((a) => a.id).sort()).toEqual(['armored', 'bloom_touched', 'elite', 'regenerating', 'reinforcing', 'swift', 'volatile']);
    for (const a of enemyAffixes) expect(typeof a.adjective, a.id).toBe('string');
    expect(r.affixes.get('elite')!.extraSkill).toBe(true);
    const itemAffixes = [...r.affixes.values()].filter((a) => a.appliesTo === 'item');
    expect(itemAffixes.filter((a) => !a.drawback).length).toBeGreaterThanOrEqual(8);
    expect(itemAffixes.filter((a) => a.drawback).map((a) => a.id).sort()).toEqual(['bloom_leak', 'parasitic', 'unstable_core']);
    for (const slot of ['weapon', 'upper', 'lower']) {
      const pool = itemAffixes.filter((a) => !a.drawback && (!a.slots || (a.slots as string[]).includes(slot)));
      expect(pool.length, slot).toBeGreaterThanOrEqual(3);
    }
  });

  it('18 item templates: one standard weapon per class, armor in three weights, three anomalous', async () => {
    const { registries: r } = await load();
    expect(r.items.size).toBe(18);
    const weapons = [...r.items.values()].filter((i) => i.slot === 'weapon' && i.rarity === 'standard');
    expect(weapons.map((w) => w.class).sort()).toEqual(['Bio', 'Blade', 'Heavy', 'Pistol', 'Precision Rifle', 'Rifle', 'SMG', 'Shotgun', 'Tech']);
    for (const slot of ['upper', 'lower']) {
      const std = [...r.items.values()].filter((i) => i.slot === slot && i.rarity === 'standard');
      expect(std.map((i) => i.class).sort()).toEqual(['heavy', 'light', 'medium']);
    }
    expect([...r.items.values()].filter((i) => i.rarity === 'anomalous').map((i) => i.id).sort()).toEqual(['bloom_fang', 'grafted_plate', 'whisper_coil']);
  });

  it('every weapon class and armor weight of every role is craftable at standard', async () => {
    const { registries: r } = await load();
    const craftable = new Set(
      [...r.recipes.values()].filter((x) => x.rarity === 'standard').map((x) => r.items.get(x.itemId as string)!)
        .map((i) => `${i.slot === 'weapon' ? 'w' : 'a'}:${i.class}`),
    );
    for (const role of r.roles.values()) {
      for (const c of role.weaponClasses as string[]) expect(craftable.has(`w:${c}`), `${role.id} ${c}`).toBe(true);
      for (const w of role.armorWeights as string[]) expect(craftable.has(`a:${w}`), `${role.id} ${w}`).toBe(true);
    }
  });

  it('recipes: weapons also at refined and prototype (>= 24); anomalous templates have no recipe', async () => {
    const { registries: r } = await load();
    expect(r.recipes.size).toBeGreaterThanOrEqual(24);
    for (const item of r.items.values()) {
      const mine = [...r.recipes.values()].filter((x) => x.itemId === item.id).map((x) => x.rarity as string).sort();
      if (item.rarity === 'anomalous') expect(mine, item.id).toEqual([]);
      else if (item.slot === 'weapon') expect(mine, item.id).toEqual(['prototype', 'refined', 'standard']);
      else expect(mine, item.id).toEqual(['standard']);
    }
  });

  it('loot tables reference known items and have positive weights', async () => {
    const { registries: r } = await load();
    expect([...r.lootTables.keys()].sort()).toEqual(['loot_cache', 'loot_elite', 'loot_standard']);
    for (const t of r.lootTables.values()) {
      const entries = t.entries as Array<{ weight: number; kind: string; itemId?: string }>;
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.weight).toBeGreaterThan(0);
        if (e.kind === 'item') expect(r.items.has(e.itemId!), `${t.id}: ${e.itemId}`).toBe(true);
      }
    }
    const share = (id: string, kind: string) => {
      const es = r.lootTables.get(id)!.entries as Array<{ weight: number; kind: string }>;
      return es.filter((e) => e.kind === kind).reduce((s, e) => s + e.weight, 0) / es.reduce((s, e) => s + e.weight, 0);
    };
    expect(share('loot_standard', 'item')).toBeCloseTo(0.25, 2);
    expect(r.lootTables.get('loot_elite')!.rolls).toBe(2);
    expect(share('loot_cache', 'supplies')).toBeGreaterThan(0);
  });
});

describe('core content: P5 world', () => {
  const REGION_IDS = ['quarantine_d7', 'kestrel_corridor', 'ashway', 'drowned_market', 'the_garden'];

  it('five regions, eight node types, both start regions exist and are known from the start', async () => {
    const { registries: r } = await load();
    expect([...r.regions.keys()].sort()).toEqual([...REGION_IDS].sort());
    expect([...r.nodeTypes.keys()].sort()).toEqual(['cache', 'combat', 'crisis', 'elite', 'event', 'objective', 'rest', 'unknown']);
    for (const corp of ['vesper', 'kestrel']) {
      const region = r.regions.get(String(r.corporations.get(corp)!.startingRegionId))!;
      expect(region.knownFromStart, corp).toBe(true);
    }
    expect(r.regions.get('drowned_market')!.unlockedBy).toEqual({ clearanceMin: 1 });
    expect(r.regions.get('the_garden')!.unlockedBy).toEqual({ clearanceMin: 2 });
    const cells = [...r.regions.values()].map((x) => JSON.stringify(x.mapCell));
    expect(new Set(cells).size).toBe(5);
    expect(r.regions.get('the_garden')!.danger).toBe(5);
    expect(r.regions.get('drowned_market')!.travelSlots).toBe(3);
  });

  it('every region has a scavenge POI and three rumor lines of at most 40 words', async () => {
    const { registries: r } = await load();
    expect(r.regions.size).toBe(5);
    for (const region of r.regions.values()) {
      const pois = region.pointsOfInterest as Array<{ id: string; templateId: string }>;
      expect(pois.find((p) => p.id === 'scavenge')?.templateId, String(region.id)).toBe('tpl_scavenge');
      const rumors = region.rumors as string[];
      expect(rumors.length, String(region.id)).toBeGreaterThanOrEqual(3);
      for (const line of rumors) expect(line.trim().split(/\s+/).length).toBeLessThanOrEqual(40);
    }
  });

  it('every mission template source is covered: command, story, rumor, side', async () => {
    const { registries: r } = await load();
    const covered = new Set([...r.missionTemplates.values()].flatMap((t) => t.sources as string[]));
    expect([...covered].sort()).toEqual(['command', 'rumor', 'side', 'story']);
    for (const id of ['tpl_sweep', 'tpl_recover', 'tpl_escort_data', 'tpl_hunt', 'tpl_scavenge', 'tpl_outbreak']) {
      expect(r.missionTemplates.has(id), id).toBe(true);
    }
    for (const start of ['vesper', 'kestrel']) {
      for (let n = 1; n <= 4; n++) expect(r.missionTemplates.get(`tpl_${start}_beat_${n}`)?.sources, `${start} ${n}`).toEqual(['story']);
    }
    expect(r.rewardTiers.size).toBe(4);
  });

  it('every spine beat of both starts has a reachable completion (story mission in an existing region, declared flags, or auto)', async () => {
    const { registries: r } = await load();
    for (const start of r.starts.values()) {
      const spine = start.spine as Array<{ id: string; completion?: { kind: string; templateId?: string; regionId?: string; anyOf?: string[] } }>;
      expect(spine.length, String(start.id)).toBe(6);
      for (const beat of spine) {
        const c = beat.completion ?? { kind: 'auto' };
        if (c.kind === 'mission') {
          const tpl = r.missionTemplates.get(c.templateId!)!;
          expect(tpl.sources, `${String(start.id)} ${beat.id}`).toContain('story');
          expect(r.regions.has(c.regionId!)).toBe(true);
          const allowed = tpl.regions as string[] | undefined;
          if (allowed) expect(allowed).toContain(c.regionId);
        } else if (c.kind === 'flag') {
          for (const f of c.anyOf!) expect(r.flags.get(f)?.scope).toBe('world');
        } else {
          expect(c.kind).toBe('auto');
        }
      }
      expect(spine[5].completion).toEqual({ kind: 'auto' });
      expect(spine[0].completion?.kind).toBe('mission');
    }
  });

  it('the pinned choice events set mutually exclusive declared flags', async () => {
    const { registries: r } = await load();
    const choices: Record<string, string[]> = {
      evt_vesper_choice: ['evidence_delivered_vesper', 'evidence_sold_aurum', 'evidence_buried'],
      evt_kestrel_choice: ['quota_met_k12', 'spared_survivors_k12', 'sable_offer_taken'],
    };
    for (const [evt, flags] of Object.entries(choices)) {
      const options = (r.dilemmaTemplates.get(evt)!.fixed as { options: Array<{ effects: Array<{ type: string; flagId?: string }> }> }).options;
      expect(options.map((o) => o.effects.find((e) => e.type === 'flag')?.flagId), evt).toEqual(flags);
      for (const f of flags) {
        const flag = r.flags.get(f)!;
        expect(flag.scope).toBe('world');
        expect(flag.setBy).toEqual(['event']);
        expect([...(flag.mutuallyExclusiveWith as string[])].sort()).toEqual(flags.filter((x) => x !== f).sort());
      }
    }
    // the two beat-4 templates point at their pinned events
    expect(r.missionTemplates.get('tpl_vesper_beat_4')!.objectiveEventId).toBe('evt_vesper_choice');
    expect(r.missionTemplates.get('tpl_kestrel_beat_4')!.objectiveEventId).toBe('evt_kestrel_choice');
    const spineFlags = (id: string) => (r.starts.get(id)!.spine as Array<{ completion?: { anyOf?: string[] } }>)[4].completion!.anyOf;
    expect(spineFlags('start_vesper')).toEqual(choices.evt_vesper_choice);
    expect(spineFlags('start_kestrel')).toEqual(choices.evt_kestrel_choice);
  });

  it('at least six non-flavor minor events, each option with a cost; value-axis events, a gated third way and flavor events exist', async () => {
    const { registries: r } = await load();
    const events = [...r.dilemmaTemplates.values()];
    const expeditionEvents = events.filter((e) => (e.contexts as string[]).includes('expedition_event'));
    for (const e of expeditionEvents) {
      // P6: the two beat-4 choices are defining; every other expedition event stays minor
      expect(e.scale).toBe(String(e.id).endsWith('_choice') ? 'defining' : 'minor');
    }
    const real = expeditionEvents.filter((e) => !e.flavor && !String(e.id).endsWith('_choice'));
    expect(real.length).toBeGreaterThanOrEqual(6);
    expect(events.filter((e) => e.flavor === true).length).toBeGreaterThanOrEqual(2);
    type Opt = { requires?: { stat: string; rank: number }; effects: Array<{ type: string; valueAxes?: unknown[] }> };
    const opts = (e: (typeof events)[number]) => (e.fixed as { options: Opt[] }).options;
    const withAxes = real.filter((e) => opts(e).some((o) => o.effects.some((x) => x.type === 'unit_event' && (x.valueAxes?.length ?? 0) > 0)));
    expect(withAxes.length).toBeGreaterThanOrEqual(3);
    expect(real.some((e) => opts(e).some((o) => o.requires?.stat === 'empathy' && o.requires.rank === 3))).toBe(true);
    for (const e of real) {
      expect(opts(e).length).toBeGreaterThanOrEqual(2);
      expect(opts(e).length).toBeLessThanOrEqual(3);
    }
  });

  it('clearance 1, 2 and 3 are each granted by some beat', async () => {
    const { registries: r } = await load();
    for (const start of r.starts.values()) {
      const granted = new Set(
        (start.spine as Array<{ onComplete?: Array<{ type: string; tier?: number }> }>)
          .flatMap((b) => (b.onComplete ?? []).filter((e) => e.type === 'clearance').map((e) => e.tier)),
      );
      expect([...granted].sort(), String(start.id)).toEqual([1, 2, 3]);
    }
  });

  it('echo_bleed reveals one more step', async () => {
    const { registries: r } = await load();
    expect(r.defects.get('echo_bleed')!.expedition).toEqual({ reveal: 1 });
    expect([...r.defects.values()].filter((d) => d.expedition !== undefined)).toHaveLength(1);
  });

  it('clocks, reward tiers and node types follow the plan numbers', async () => {
    const { registries: r } = await load();
    expect([...r.clocks.keys()].sort()).toEqual(['bloom_d7', 'corridor_quota', 'garden_wake', 'oversight', 'sable_operation']);
    expect(r.clocks.get('oversight')!.repeat).toBe(true);
    expect(r.clocks.get('bloom_d7')!.segments).toBe(8);
    expect(r.clocks.get('garden_wake')!.visibleToPlayer).toBe(false);
    expect(r.nodeTypes.get('crisis')).toMatchObject({ maxPerMap: 1, minDanger: 3, firstLayer: false });
    expect(r.nodeTypes.get('rest')).toMatchObject({ rest: { suppliesPerUnit: 1, hpPct: 25, stress: -15 }, firstLayer: false });
    expect(r.nodeTypes.get('unknown')!.resolvesTo).toEqual({ combat: 4, event: 3, cache: 3 });
    expect(r.rewardTiers.get('tier_3')).toMatchObject({ credits: [70, 120], plyx: [8, 16], lootTableId: 'loot_elite', faction: 5 });
  });
});

describe('core content pack: P6 content', () => {
  it('every corporation has leash numbers', async () => {
    const { registries: r } = await load();
    const leash = (id: string) => r.corporations.get(id)!.leash;
    expect(leash('vesper')).toEqual({ weekly: 3, approval: 0.7 });
    expect(leash('kestrel')).toEqual({ weekly: 2, approval: 0.5 });
    expect(leash('aurum')).toEqual({ weekly: 2, approval: 0.6 });
    expect(leash('sable')).toEqual({ weekly: 1, approval: 0.4 });
  });

  it('the mutiny flaw costs 5 Trust per Leash use; defect Leash and desertion modifiers are set', async () => {
    const { registries: r } = await load();
    const flaw = (r.crimes.get('mutiny')!.flaw as { effects: unknown[] }).effects;
    expect(flaw).toContainEqual({ type: 'leash_trust_cost', amount: 5 });
    const d = (id: string) => r.defects.get(id)!;
    expect(d('imprint_fracture').leash).toEqual({ costMult: 2, failChance: 0.25 });
    expect(d('imprint_fracture').desertionMod).toBe(0.1);
    expect(d('compliance_craving').leash).toEqual({ costMult: 0.5 });
    expect(d('compliance_craving').desertionMod).toBe(-0.1);
    expect(d('possessive_protocol').desertionMod).toBe(-0.1);
  });

  it('loyalty_wavering is 0.15 and loyalty_breaking 0.35', async () => {
    const { registries: r } = await load();
    const chance = (id: string) =>
      (r.synergies.get(id)!.effects as Array<{ type: string; chance: number }>).find((e) => e.type === 'order_refusal')!.chance;
    expect(chance('loyalty_wavering')).toBe(0.15);
    expect(chance('loyalty_breaking')).toBe(0.35);
  });

  it('leashed and arc_raised are declared relation flags', async () => {
    const { registries: r } = await load();
    expect(r.flags.get('leashed')).toMatchObject({ scope: 'relation' });
    expect(r.flags.get('arc_raised')).toMatchObject({ scope: 'relation' });
  });

  it('both beat-4 choices are defining, generating and keep three mutually exclusive flags', async () => {
    const { registries: r } = await load();
    for (const id of ['evt_vesper_choice', 'evt_kestrel_choice']) {
      const t = r.dilemmaTemplates.get(id)!;
      expect(t.scale, id).toBe('defining');
      expect(t.generate, id).toBeTruthy();
      expect(t.optionCount, id).toBe(3);
      expect((t.constraints as { flagPerOption: boolean }).flagPerOption, id).toBe(true);
      const allowed = t.allowedFlags as string[];
      expect(allowed, id).toHaveLength(3);
      const fixedFlags = (t.fixed as { options: Array<{ effects: Array<{ type: string; flagId?: string }> }> }).options
        .map((o) => o.effects.find((e) => e.type === 'flag')!.flagId);
      expect(fixedFlags.sort(), id).toEqual([...allowed].sort());
      for (const f of allowed) {
        const others = allowed.filter((x) => x !== f).sort();
        expect([...(r.flags.get(f)!.mutuallyExclusiveWith as string[])].sort(), f).toEqual(others);
      }
    }
  });

  it('the new base and mission-outcome templates generate and carry an authored fixed block', async () => {
    const { registries: r } = await load();
    const want: Record<string, { scale: string; contexts: string[] }> = {
      dil_rations: { scale: 'minor', contexts: ['base'] },
      dil_informant: { scale: 'major', contexts: ['base', 'director'] },
      dil_transfer_order: { scale: 'major', contexts: ['base'] },
      dil_after_action: { scale: 'major', contexts: ['mission_outcome'] },
    };
    for (const [id, w] of Object.entries(want)) {
      const t = r.dilemmaTemplates.get(id)!;
      expect(t, id).toBeTruthy();
      expect(t.scale, id).toBe(w.scale);
      expect(t.contexts, id).toEqual(w.contexts);
      expect((t.generate as { brief: string }).brief.length, id).toBeGreaterThan(0);
      const options = (t.fixed as { options: Array<{ effects: Array<Record<string, unknown>> }> }).options;
      expect(options.length, id).toBeGreaterThanOrEqual(2);
      expect(options.length, id).toBeLessThanOrEqual(3);
      expect(options.some((o) => o.effects.some((e) => e.type === 'unit_event' && Array.isArray(e.valueAxes))), id).toBe(true);
    }
    expect(r.dilemmaTemplates.get('dil_transfer_order')!.requiredRefs).toEqual({ units: 2 });
  });

  it('there is a sign for every about/kind the engine needs', async () => {
    const { registries: r } = await load();
    const signs = [...r.loyaltySigns.values()] as unknown as Array<{ about: string; kind: string; level?: number }>;
    const has = (about: string, kind: string, level?: number) =>
      signs.some((s) => s.about === about && s.kind === kind && (level === undefined || s.level === level));
    for (const kind of ['dm', 'fact', 'talk']) expect(has('doubt', kind), `doubt/${kind}`).toBe(true);
    for (const kind of ['dm', 'fact']) expect(has('desertion', kind), `desertion/${kind}`).toBe(true);
    expect(signs.filter((s) => s.about === 'doubt').length).toBeGreaterThanOrEqual(2);
    expect(signs.filter((s) => s.about === 'desertion').length).toBeGreaterThanOrEqual(3);
    expect(signs.filter((s) => s.about === 'mutiny' && s.level === 1).length).toBeGreaterThanOrEqual(2);
    expect(signs.filter((s) => s.about === 'mutiny' && s.level === 2).length).toBeGreaterThanOrEqual(2);
  });
});
