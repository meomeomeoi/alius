import type { Registries } from '../../content/types';
import { impunityOf } from '../discipline/impunity';
import { isLiving } from '../economy';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addFact } from '../memory';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { fallbackAgenda } from './agenda';
import { leashswapOf, type WardenState } from './state';
import { valuesOf } from '../development/profile';

/**
 * Corporate assignment (P13 §1): among the named units whose status is `active`, the one with the highest `values.corporate`, then
 * the lowest `autonomy`, then the lowest Impunity (0 when it cannot be read), then the earliest in the squad. A total order, so
 * no draw. `exclude` keeps a unit out (the removed warden, a deserter). `anyLiving` (a conviction's successor) also takes a unit who is injured or
 * in reserve: a full medbay is no reason to execute the commander. Null when nobody is eligible.
 */
export function corporateWardenPick(state: CampaignState, reg: Registries, exclude: readonly string[] = [], opts: { anyLiving?: true } = {}): string | null {
  const pool = state.squad
    .map((unit, order) => ({ unit, order }))
    .filter(({ unit }) => unit.kind === 'named' && (opts.anyLiving === true ? isLiving(unit) : unit.status === 'active') && !exclude.includes(unit.id));
  if (pool.length === 0) return null;
  const impunity = (id: string): number => impunityOf(state, reg, id)?.value ?? 0;
  pool.sort((a, b) =>
    valuesOf(b.unit).corporate - valuesOf(a.unit).corporate
    || valuesOf(a.unit).autonomy - valuesOf(b.unit).autonomy
    || impunity(a.unit.id) - impunity(b.unit.id)
    || a.order - b.order);
  return pool[0].unit.id;
}

/**
 * Puts a unit in charge of the leash: satisfaction at its start, defiance 0, a full week of Leash authorizations and an empty
 * fallback agenda (so the campaign is playable without a model; the controller may replace it once). Writes the site's own public
 * pinned fact and emits `warden_assigned`. Draws nothing. The mode block must exist.
 */
export function seedWarden(draft: CampaignState, ctx: EngineCtx, p: { unitId: string; assignedBy: WardenState['assignedBy'] }): EngineEvent[] {
  const ls = leashswapOf(draft);
  const unit = draft.squad.find((u) => u.id === p.unitId);
  if (!ls) throw new Error('The campaign is not in the LEASHSWAP mode.');
  if (!unit) throw new Error(`Unknown unit "${p.unitId}".`);
  ls.status = 'held';
  // she holds the leash now: she is nobody's ally against herself, and a new warden has not been told who stood against the last
  for (const rel of Object.values(draft.relations)) rel.flags = rel.flags.filter((f) => f !== 'warden_knows_ally');
  if (draft.relations[unit.id]) draft.relations[unit.id].flags = draft.relations[unit.id].flags.filter((f) => f !== 'warden_ally');
  ls.warden = {
    unitId: unit.id, assignedBy: p.assignedBy, sinceDay: draft.day,
    expectations: [], agenda: 'fallback',
    satisfaction: p.assignedBy === 'oversight' ? TUNING.warden.verdict.newWardenSatisfaction : TUNING.warden.satisfaction.start,
    defiance: TUNING.warden.defiance.start,
    warnings: [], leashLeft: TUNING.warden.leash.weekly, leashRefreshDay: draft.day + TUNING.leash.refreshDays,
    restrictions: [], punishLog: [],
  };
  ls.warden.expectations = fallbackAgenda(draft, ctx.registries, unit.id); // no model, no draw: the campaign is playable at once
  addFact(draft, {
    about: [unit.id], text: `${unit.displayName} holds the commander's controller.`, tags: ['warden'], importance: 4,
    day: draft.day, knownBy: ['*'], pinned: true,
  });
  return [{ type: 'warden_assigned', unitId: unit.id, assignedBy: p.assignedBy }];
}
