import { describe, it, expect } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import {
  AffixSchema, CombatEffectSchema, DefectSchema, EnemySchema, ItemSchema, LootTableSchema, OrderSchema,
  RecipeSchema, RESERVED_EVENT_TYPES, RoleSchema, SignatureSchema, SkillSchema, StatusSchema, SynergySchema,
  ActivityEffectSchema,
} from '../../src/content/schemas';
import { REGISTRY_NAMES } from '../../src/content/types';
import { EFFECT_TYPES } from '../../src/engine/combat/types';

const MIN: Record<string, Record<string, unknown>> = {
  damage: { type: 'damage', mult: 1 },
  heal: { type: 'heal', pctMaxHp: 10 },
  revive: { type: 'revive', pctMaxHp: 30 },
  status: { type: 'status', statusId: 'bleed' },
  cleanse: { type: 'cleanse', kind: 'debuff', count: 1 },
  stat: { type: 'stat', stat: 'atk', pct: 10 },
  outgoing: { type: 'outgoing', pct: 10 },
  incoming: { type: 'incoming', pct: -10 },
  stress: { type: 'stress', amount: -5 },
  stress_taken: { type: 'stress_taken', pct: -50, direction: 'gain' },
  cp: { type: 'cp', amount: 1 },
  move: { type: 'move', to: 'front' },
  extra_action: { type: 'extra_action' },
  redirect: { type: 'redirect', pct: 50, turns: 2, from: 'ally' },
  intercept_lethal: { type: 'intercept_lethal', protect: 'commander' },
  summon: { type: 'summon', enemyId: 'husk', max: 1 },
  follow_up: { type: 'follow_up', mult: 0.5 },
  misfire: { type: 'misfire', chance: 0.1 },
  override_action: { type: 'override_action', policy: 'aggressive' },
  lock_target: { type: 'lock_target', turns: 3 },
  loot_roll: { type: 'loot_roll', extra: 1 },
  repeat_order: { type: 'repeat_order' },
  hp_set: { type: 'hp_set', value: 1 },
  immune: { type: 'immune', statusId: 'stun' },
  order_cost: { type: 'order_cost', delta: -1 },
  order_refusal: { type: 'order_refusal', chance: 0.1 },
  loadout_slots: { type: 'loadout_slots', amount: 1 },
  injury_days: { type: 'injury_days', pct: 50 },
};

const skill = {
  id: 's', name: 'S', kind: 'active', description: 'd', cooldown: 1, usableFrom: ['front'],
  targets: { side: 'enemy', rows: ['front', 'back'], count: 'one' }, effects: [{ type: 'damage', mult: 1 }], tags: [],
};

const growth = { hp: 6, atk: 1, def: 0.5, spd: 0.1, crit: 0.2 };
function tree(over: (nodes: Array<Record<string, unknown>>) => void = () => {}) {
  const nodes: Array<Record<string, unknown>> = [];
  for (let b = 0; b < 3; b++) {
    for (let t = 1; t <= 5; t++) {
      nodes.push({
        id: `n_${b}_${t}`, branch: b, tier: t, cost: t + 1, requires: t === 1 ? [] : [`n_${b}_${t - 1}`],
        grants: { skill: `sk_${b}_${t}` },
      });
    }
  }
  nodes.push({ id: 'n_ult', branch: null, tier: null, cost: 6, requires: [], grants: { skill: 'sk_ult' } });
  over(nodes);
  return nodes;
}
const role = {
  id: 'r', name: 'R', row: 'front', baseStats: { hp: 100, atk: 20, def: 10, spd: 12, crit: 5 },
  weaponClasses: ['Blade'], armorWeights: ['light'], identity: 'i', summary: 's', branches: [],
  growth, aiProfile: 'aggressive', starterSkills: ['a', 'b'], tree: tree(),
};
const enemy = {
  id: 'husk', categoryId: 'c', name: 'Husk', stats: { base: { hp: 40, atk: 10, def: 5, spd: 8, crit: 0 }, growth },
  skills: ['sk'], aiProfile: 'aggressive', rowPreference: 'front', power: 1,
  portrait: { ascii: ['o_o'] }, tags: [],
};

describe('combat effect schemas', () => {
  it('every effect type parses its minimal example and rejects an unknown field', () => {
    expect(Object.keys(MIN).sort()).toEqual([...EFFECT_TYPES].sort());
    for (const [type, fx] of Object.entries(MIN)) {
      expect(CombatEffectSchema.safeParse(fx).success, `${type} minimal`).toBe(true);
      expect(CombatEffectSchema.safeParse({ ...fx, bogus: 1 }).success, `${type} bogus`).toBe(false);
    }
  });

  it('misfire and order_refusal need a chance', () => {
    expect(CombatEffectSchema.safeParse({ type: 'misfire' }).success).toBe(false);
    expect(CombatEffectSchema.safeParse({ type: 'order_refusal' }).success).toBe(false);
    expect(CombatEffectSchema.safeParse({ type: 'order_refusal', chance: 0.2, orders: ['steady'] }).success).toBe(true);
  });

  it('threshold without onStressThreshold is rejected', () => {
    const ok = { type: 'stress', amount: 1, trigger: 'onStressThreshold', threshold: 50 };
    expect(CombatEffectSchema.safeParse(ok).success).toBe(true);
    expect(CombatEffectSchema.safeParse({ ...ok, trigger: 'onTurnStart' }).success).toBe(false);
    expect(CombatEffectSchema.safeParse({ type: 'stress', amount: 1, threshold: 50 }).success).toBe(false);
    expect(CombatEffectSchema.safeParse({ ...ok, threshold: 60 }).success).toBe(false);
  });

  it('scope ally on onTurnStart is rejected', () => {
    const fx = { type: 'follow_up', mult: 0.5, scope: 'ally' };
    expect(CombatEffectSchema.safeParse({ ...fx, trigger: 'onCrit' }).success).toBe(true);
    expect(CombatEffectSchema.safeParse({ ...fx, trigger: 'onHit' }).success).toBe(true);
    expect(CombatEffectSchema.safeParse({ ...fx, trigger: 'onKill' }).success).toBe(true);
    expect(CombatEffectSchema.safeParse({ ...fx, trigger: 'onTurnStart' }).success).toBe(false);
    expect(CombatEffectSchema.safeParse(fx).success).toBe(false);
  });

  it('conditions accept the documented keys only', () => {
    const base = { type: 'stat', stat: 'atk', pct: 10 };
    expect(CombatEffectSchema.safeParse({ ...base, when: { hpBelowPct: 30, aloneInRow: true } }).success).toBe(true);
    expect(CombatEffectSchema.safeParse({ ...base, when: { bogus: 1 } }).success).toBe(false);
  });
});

describe('skill schema', () => {
  it('parses a valid active skill', () => {
    expect(SkillSchema.safeParse(skill).success).toBe(true);
  });

  it('skill with an empty usableFrom is rejected', () => {
    expect(SkillSchema.safeParse({ ...skill, usableFrom: [] }).success).toBe(false);
  });

  it('skill needs at least one effect', () => {
    expect(SkillSchema.safeParse({ ...skill, effects: [] }).success).toBe(false);
  });

  it('a passive may only hold always-on effects or triggered ones', () => {
    const passive = { id: 'p', name: 'P', kind: 'passive', description: 'd', tags: [] };
    expect(SkillSchema.safeParse({ ...passive, effects: [{ type: 'stat', stat: 'def', pct: 10 }] }).success).toBe(true);
    expect(SkillSchema.safeParse({ ...passive, effects: [{ type: 'heal', pctMaxHp: 5, trigger: 'onTurnStart', target: 'self' }] }).success).toBe(true);
    expect(SkillSchema.safeParse({ ...passive, effects: [{ type: 'heal', pctMaxHp: 5 }] }).success).toBe(false);
  });

  it('a skill enemy kind is allowed', () => {
    expect(SkillSchema.safeParse({ ...skill, kind: 'enemy' }).success).toBe(true);
  });
});

describe('role, signature, status and defect extensions', () => {
  it('a role without P4 fields still parses; with them it is validated', () => {
    const { growth: _g, aiProfile: _a, starterSkills: _s, tree: _t, ...plain } = role;
    expect(RoleSchema.safeParse(plain).success).toBe(true);
    expect(RoleSchema.safeParse(role).success).toBe(true);
  });

  it('role tree needs 16 nodes and exactly one ultimate node', () => {
    expect(RoleSchema.safeParse({ ...role, tree: tree((n) => n.pop()) }).success).toBe(false);
    expect(RoleSchema.safeParse({ ...role, tree: tree((n) => { n[15 - 1] = { ...n[14], id: 'dup' }; n[15] = { ...n[15], branch: 0, tier: 1 }; }) }).success).toBe(false);
    expect(RoleSchema.safeParse({ ...role, tree: tree((n) => { n[0].id = n[1].id; }) }).success).toBe(false);
    expect(RoleSchema.safeParse({ ...role, starterSkills: ['a'] }).success).toBe(false);
  });

  it('a node that requires an unknown node of the role is reported', () => {
    const r = RoleSchema.safeParse({ ...role, tree: tree((n) => { n[1].requires = ['someone_elses_node']; }) });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.success ? [] : r.error.issues)).toContain('requires');
  });

  it('signature may point at its mechanics skill', () => {
    expect(SignatureSchema.safeParse({ id: 'sig_x', name: 'X', mechanic: 'm', fits: 'f', skill: 'sig_x' }).success).toBe(true);
  });

  it('status mechanics: stackMode and flags are enumerated', () => {
    const st = { id: 'bleed', name: 'Bleed', kind: 'debuff', description: 'd', turns: 3, maxStacks: 3, stackMode: 'add',
      tick: [{ type: 'damage', mult: 0.1, target: 'self' }], flags: ['skipTurn'] };
    expect(StatusSchema.safeParse(st).success).toBe(true);
    expect(StatusSchema.safeParse({ ...st, stackMode: 'multiply' }).success).toBe(false);
    expect(StatusSchema.safeParse({ ...st, flags: ['wow'] }).success).toBe(false);
  });

  it('defect combat data: every downside effect must carry downside: true', () => {
    const defect = {
      id: 'd', name: 'D', category: 'neural', lore: 'l', upside: 'u', downside: 'd',
      breakdown: { name: 'b', text: 't' }, social: 's', arc: { cure: 'c', manage: 'm', embrace: 'e' },
      combat: {
        upside: [{ type: 'stat', stat: 'atk', pct: 10 }],
        downside: [{ type: 'stress', amount: 1, trigger: 'onRoundStart', downside: true }],
        breakdown: { policy: 'skip', ignoresOrders: false, onEnter: [], actionEffects: [] },
      },
    };
    expect(DefectSchema.safeParse(defect).success).toBe(true);
    const bad = structuredClone(defect);
    delete (bad.combat.downside[0] as Record<string, unknown>).downside;
    expect(DefectSchema.safeParse(bad).success).toBe(false);
    expect(DefectSchema.safeParse({ ...defect, combat: { ...defect.combat, breakdown: { ...defect.combat.breakdown, policy: 'dance' } } }).success).toBe(false);
  });

  it('order, synergy, enemy category schemas', () => {
    expect(OrderSchema.safeParse({ id: 'o', name: 'O', summary: 's', cost: 2, target: 'enemy', effects: [{ type: 'status', statusId: 'mark', target: 'target' }] }).success).toBe(true);
    expect(OrderSchema.safeParse({ id: 'o', name: 'O', summary: 's', cost: 6, target: 'enemy', effects: [{ type: 'cp', amount: 1 }] }).success).toBe(false);
    expect(SynergySchema.safeParse({ id: 'y', name: 'Y', summary: 's', effects: [{ type: 'outgoing', pct: 10 }] }).success).toBe(true);
  });
});

describe('enemy, affix, item, recipe and loot schemas', () => {
  it('enemy with no skills is rejected', () => {
    expect(EnemySchema.safeParse(enemy).success).toBe(true);
    expect(EnemySchema.safeParse({ ...enemy, skills: [] }).success).toBe(false);
    expect(EnemySchema.safeParse({ ...enemy, portrait: { ascii: [] } }).success).toBe(false);
    expect(EnemySchema.safeParse({ ...enemy, portrait: { ascii: Array(9).fill('x') } }).success).toBe(false);
    expect(EnemySchema.safeParse({ ...enemy, aiProfile: 'sleepy' }).success).toBe(false);
  });

  it('affix and item schemas', () => {
    expect(AffixSchema.safeParse({ id: 'armored', name: 'Armored', appliesTo: 'enemy', adjective: 'Armored', statPct: { def: 40 }, effects: [] }).success).toBe(true);
    expect(AffixSchema.safeParse({ id: 'x', name: 'X', appliesTo: 'planet', effects: [] }).success).toBe(false);
    const item = { id: 'blade_std', name: 'Blade', slot: 'weapon', class: 'Blade', rarity: 'standard', baseStats: { atk: 5 }, effects: [], value: 10 };
    expect(ItemSchema.safeParse(item).success).toBe(true);
    expect(ItemSchema.safeParse({ ...item, slot: 'head' }).success).toBe(false);
    expect(ItemSchema.safeParse({ ...item, rarity: 'legendary' }).success).toBe(false);
  });

  it('recipe and loot entries', () => {
    expect(RecipeSchema.safeParse({ id: 'r1', itemId: 'blade_std', rarity: 'standard', cost: { credits: 10, plyx: 5 } }).success).toBe(true);
    const table = { id: 't', rolls: 1, entries: [{ weight: 1, kind: 'credits', amount: [5, 10] }] };
    expect(LootTableSchema.safeParse(table).success).toBe(true);
    expect(LootTableSchema.safeParse({ ...table, entries: [{ weight: 1, kind: 'item' }] }).success).toBe(false);
    expect(LootTableSchema.safeParse({ ...table, entries: [{ weight: 1, kind: 'credits' }] }).success).toBe(false);
    expect(LootTableSchema.safeParse({ ...table, entries: [{ weight: 0, kind: 'credits', amount: [1, 2] }] }).success).toBe(false);
  });
});

describe('registries and events', () => {
  it('REGISTRY_NAMES contains orders, synergies, recipes, lootTables', () => {
    for (const n of ['orders', 'synergies', 'recipes', 'lootTables']) expect(REGISTRY_NAMES).toContain(n);
  });

  it('emit_event cannot impersonate combat_ended', () => {
    const fx = (event: string) => ({ type: 'emit_event', event });
    expect(ActivityEffectSchema.safeParse(fx('combat_ended')).success).toBe(false);
    for (const e of ['combat_started', 'combat_log', 'combat_awaiting', 'combat_cutin', 'order_refused', 'level_up', 'node_unlocked',
      'loot_banked', 'item_crafted', 'item_upgraded', 'item_equipped', 'breakdown', 'breakdown_released', 'workshop_opened']) {
      expect(RESERVED_EVENT_TYPES, e).toContain(e);
    }
    expect(ActivityEffectSchema.safeParse(fx('something_else')).success).toBe(true);
  });
});

// ---- cross references through the loader -------------------------------------------------------------------------

const memFetch = (files: Record<string, unknown>) => async (path: string) => {
  if (!(path in files)) throw new Error(`404 ${path}`);
  return files[path];
};
const pack = (files: Record<string, unknown[]>) => {
  const out: Record<string, unknown> = {
    'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: Object.fromEntries(Object.keys(files).map((k) => [k, `${k}.json`])) },
  };
  for (const [k, v] of Object.entries(files)) out[`p/${k}.json`] = v;
  return out;
};
const status = { id: 'bleed', name: 'Bleed', kind: 'debuff', description: 'd' };
const dmgSkill = (id: string, effects: unknown[] = [{ type: 'damage', mult: 1 }]) => ({ ...skill, id, effects });
const cat = { id: 'c', name: 'C', frequency: 'common', summary: 's' };

async function errorsOf(files: Record<string, unknown[]>) {
  const r = await loadPacks(['p'], memFetch(pack(files)));
  return r.errors;
}

describe('content refs', () => {
  it('a consistent mini pack loads', async () => {
    expect(await errorsOf({
      statuses: [status], skills: [dmgSkill('sk', [{ type: 'status', statusId: 'bleed' }])],
      enemyCategories: [cat], enemies: [{ ...enemy, id: 'husk', categoryId: 'c' }],
    })).toEqual([]);
  });

  it('refs: unknown status, enemy, skill, category, item and synergy ids are reported with their path', async () => {
    const errs = await errorsOf({
      statuses: [status],
      skills: [
        dmgSkill('sk', [{ type: 'status', statusId: 'nope' }]),
        dmgSkill('sk2', [{ type: 'summon', enemyId: 'ghost', max: 1 }]),
        dmgSkill('sk3', [{ type: 'immune', statusId: 'nada' }]),
      ],
      enemyCategories: [cat],
      enemies: [{ ...enemy, id: 'husk', categoryId: 'missing', skills: ['sk', 'zzz'], eliteSkill: 'yyy' }],
      lootTables: [{ id: 'lt', rolls: 1, entries: [{ weight: 1, kind: 'item', itemId: 'ghost_item' }] }],
      recipes: [{ id: 'rc', itemId: 'ghost_item', rarity: 'standard', cost: { credits: 1, plyx: 1 } }],
      relationshipStates: [],
    });
    const at = (file: string, path: string) => errs.find((e) => e.file === file && e.path === path);
    expect(at('skills.json', '[0].effects[0].statusId')?.message).toContain('statuses');
    expect(at('skills.json', '[1].effects[0].enemyId')?.message).toContain('enemies');
    expect(at('skills.json', '[2].effects[0].statusId')?.message).toContain('statuses');
    expect(at('enemies.json', '[0].categoryId')?.message).toContain('enemyCategories');
    expect(at('enemies.json', '[0].skills[1]')?.message).toContain('skills');
    expect(at('enemies.json', '[0].eliteSkill')?.message).toContain('skills');
    expect(at('lootTables.json', '[0].entries[0].itemId')?.message).toContain('items');
    expect(at('recipes.json', '[0].itemId')?.message).toContain('items');
  });

  it('refs: role skills, tree skills, signature skills and relationship synergies', async () => {
    const stateEntry = {
      id: 'friend', name: 'F', group: 'platonic', romance: false, glyph: 'F', priority: 1,
      entry: { via: ['automatic'] }, exit: [], unlocks: { synergies: ['ghost_synergy'], activities: [], nightEvents: [], defectArcStages: [] },
      dmChance: 0, promptHint: 'h',
    };
    const errs = await errorsOf({
      skills: [dmgSkill('a'), dmgSkill('b')],
      roles: [{ ...role, id: 'r1', starterSkills: ['a', 'missing_starter'], tree: tree((n) => { n[0].grants = { upgrade: { skillId: 'missing_up' } }; }) }],
      signatures: [{ id: 'sig_x', name: 'X', mechanic: 'm', fits: 'f', skill: 'missing_sig' }],
      relationshipStates: [stateEntry],
    });
    const at = (file: string, path: string) => errs.find((e) => e.file === file && e.path === path);
    expect(at('roles.json', '[0].starterSkills[1]')).toBeTruthy();
    expect(at('roles.json', '[0].tree[0].grants.upgrade.skillId')).toBeTruthy();
    expect(at('roles.json', '[0].tree[1].grants.skill')).toBeTruthy();
    expect(at('signatures.json', '[0].skill')).toBeTruthy();
    expect(at('relationshipStates.json', '[0].unlocks.synergies[0]')?.message).toContain('synergies');
  });

  it('item class must be a weapon class or armor weight of some role; recipe rarity may not be below the template', async () => {
    const item = { id: 'blade_std', name: 'B', slot: 'weapon', class: 'Blade', rarity: 'refined', baseStats: { atk: 5 }, effects: [], value: 10 };
    const errs = await errorsOf({
      roles: [{ ...role, id: 'r1', growth: undefined, aiProfile: undefined, starterSkills: undefined, tree: undefined }].map((r) => JSON.parse(JSON.stringify(r))),
      items: [item, { ...item, id: 'laser', class: 'Laser' }],
      recipes: [{ id: 'rc', itemId: 'blade_std', rarity: 'standard', cost: { credits: 1, plyx: 1 } }],
    });
    expect(errs.find((e) => e.file === 'items.json' && e.path === '[1].class')?.message).toContain('Laser');
    expect(errs.find((e) => e.file === 'items.json' && e.path === '[0].class')).toBeUndefined();
    expect(errs.find((e) => e.file === 'recipes.json' && e.path === '[0].itemId')?.message).toContain('below');
  });

  it('refs: defect, order and status effects reference known statuses', async () => {
    const errs = await errorsOf({
      statuses: [{ ...status, tick: [{ type: 'status', statusId: 'ghost_tick', target: 'self' }] }],
      orders: [{ id: 'o', name: 'O', summary: 's', cost: 1, target: 'none', effects: [{ type: 'status', statusId: 'ghost_order' }] }],
      defects: [{
        id: 'd', name: 'D', category: 'neural', lore: 'l', upside: 'u', downside: 'd', breakdown: { name: 'b', text: 't' }, social: 's',
        arc: { cure: 'c', manage: 'm', embrace: 'e' },
        combat: {
          upside: [{ type: 'status', statusId: 'ghost_up' }], downside: [],
          breakdown: { policy: 'skip', ignoresOrders: false, onEnter: [{ type: 'status', statusId: 'ghost_enter' }], actionEffects: [] },
        },
      }],
    });
    const msgs = errs.map((e) => `${e.file}:${e.path}`);
    expect(msgs).toContain('statuses.json:[0].tick[0].statusId');
    expect(msgs).toContain('orders.json:[0].effects[0].statusId');
    expect(msgs).toContain('defects.json:[0].combat.upside[0].statusId');
    expect(msgs).toContain('defects.json:[0].combat.breakdown.onEnter[0].statusId');
  });
});
