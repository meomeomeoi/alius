import type { Registries } from '../../content/types';
import { skillById } from '../../engine/combat/targeting';
import { checkUnlock, nodeState } from '../../engine/progression';
import type { CampaignState, Unit } from '../../engine/state/types';
import { h } from '../dom';

export interface SkillTreeCtx {
  unit: Unit;
  registries: Registries;
  state: CampaignState;
  onUnlock(nodeId: string): void;
}

interface Node {
  id: string;
  branch: number | null;
  tier: number | null;
  cost: number;
  grants: { skill?: string; upgrade?: { skillId: string } };
}

const MARK = { owned: '[■]', available: '[□]', locked: '[·]' } as const;

/** The role's tree as an ASCII node graph: three branch columns, tiers top to bottom, the ultimate below. */
export function renderSkillTree(host: HTMLElement, ctx: SkillTreeCtx): void {
  host.replaceChildren();
  const { unit, registries: reg, state } = ctx;
  const role = reg.roles.get(unit.roleId);
  const tree = ((role?.tree as Node[] | undefined) ?? []);
  const branches = (role?.branches as Array<{ name: string }> | undefined) ?? [];
  const root = h('div', { class: 'alius-tree', 'data-unit': unit.id });

  const label = (n: Node): string => {
    if (n.grants.upgrade) return `${skillById(reg, n.grants.upgrade.skillId)?.name ?? n.grants.upgrade.skillId} +`;
    return skillById(reg, n.grants.skill ?? '')?.name ?? n.grants.skill ?? n.id;
  };
  const button = (n: Node): HTMLElement => {
    const st = nodeState(state, reg, unit, n.id);
    const reason = st === 'owned' ? 'UNLOCKED' : checkUnlock(state, reg, unit.id, n.id) ?? 'READY';
    const desc = n.grants.skill ? skillById(reg, n.grants.skill)?.description ?? '' : 'Upgrades a skill.';
    const afford = st === 'available' && reason === 'READY';
    return h('button', {
      type: 'button', class: 'alius-tree-node', 'data-node': n.id, 'data-state': st,
      title: `${reason} — ${desc} (${n.cost} pt)`, 'aria-disabled': st === 'owned' || !afford ? 'true' : null,
      onclick: () => { if (afford) ctx.onUnlock(n.id); },
    }, `${MARK[st]} ${label(n)} (${n.cost})`);
  };

  for (let b = 0; b < 3; b++) root.append(h('div', { class: 'alius-tree-head' }, (branches[b]?.name ?? `Branch ${b + 1}`).toUpperCase()));
  for (let tier = 1; tier <= 5; tier++) {
    for (let b = 0; b < 3; b++) {
      const n = tree.find((x) => x.branch === b && x.tier === tier);
      root.append(n ? button(n) : h('span', {}));
    }
  }
  const ult = tree.find((n) => n.branch === null);
  if (ult) root.append(h('div', { class: 'alius-tree-ult' }, button(ult)));
  host.append(root);
}
