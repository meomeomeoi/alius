/** Small valid content entries for schema tests (P4). */
export const growth = { hp: 6, atk: 1, def: 0.5, spd: 0.1, crit: 0.2 };

export function tree(over: (nodes: Array<Record<string, unknown>>) => void = () => {}) {
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

export const role = {
  id: 'r', name: 'R', row: 'front', baseStats: { hp: 100, atk: 20, def: 10, spd: 12, crit: 5 },
  weaponClasses: ['Blade'], armorWeights: ['light'], identity: 'i', summary: 's', branches: [],
  growth, aiProfile: 'aggressive', starterSkills: ['a', 'b'], tree: tree(),
};

export const skill = {
  id: 's', name: 'S', kind: 'active', description: 'd', cooldown: 1, usableFrom: ['front'],
  targets: { side: 'enemy', rows: ['front', 'back'], count: 'one' }, effects: [{ type: 'damage', mult: 1 }], tags: [],
};

/** Every skill id a role built from `role` refers to. */
export const roleSkillIds = ['a', 'b', ...[0, 1, 2].flatMap((b) => [1, 2, 3, 4, 5].map((t) => `sk_${b}_${t}`)), 'sk_ult'];
export const roleSkills = () => roleSkillIds.map((id) => ({ ...skill, id }));

export const status = {
  id: 'bleed', name: 'Bleed', kind: 'debuff', description: 'd', turns: 3, maxStacks: 3, stackMode: 'add',
};

export const defectBase = {
  id: 'd', name: 'D', category: 'neural', lore: 'l', upside: 'u', downside: 'd',
  breakdown: { name: 'b', text: 't' }, social: 's', arc: { cure: 'c', manage: 'm', embrace: 'e' },
};
export const defectCombat = {
  upside: [{ type: 'stat', stat: 'atk', pct: 10 }],
  downside: [{ type: 'stress', amount: 1, trigger: 'onRoundStart', downside: true }],
  breakdown: { policy: 'skip', ignoresOrders: false, onEnter: [], actionEffects: [] },
};
export const defect = { ...defectBase, combat: defectCombat };
