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
