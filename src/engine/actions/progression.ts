import { registerActivityHook } from '../activities';
import { registerAction } from '../dispatch';
import { applyAllLevelUps, releaseBreakdowns, respec, setLoadout, unlockNode } from '../progression';

// Importing this module registers the progression actions and the level-up activity hook.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string') throw new Error(`${what} must be a string`);
  return v;
};

registerAction('squad/unlock_node', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  return unlockNode(draft, ctx.registries, str(p.unitId, 'unitId'), str(p.nodeId, 'nodeId'));
});

registerAction('squad/respec', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  return respec(draft, ctx.registries, str(p.unitId, 'unitId'));
});

registerAction('squad/set_loadout', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  const ids = p.skillIds;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) throw new Error('squad/set_loadout needs { unitId, skillIds: string[] }');
  setLoadout(draft, ctx.registries, str(p.unitId, 'unitId'), ids as string[]);
  return [{ type: 'loadout_changed', unitId: p.unitId as string }];
});

registerAction('squad/release_breakdowns', (draft, payload) => {
  const ids = isObj(payload) ? payload.unitIds : undefined;
  if (ids !== undefined && !(Array.isArray(ids) && ids.every((x) => typeof x === 'string'))) throw new Error('unitIds must be a list of unit ids');
  return releaseBreakdowns(draft, ids as string[] | undefined);
});

/** P2 activities only add XP; P4 turns it into levels. */
registerActivityHook((draft, ctx) => applyAllLevelUps(draft, ctx.registries));
