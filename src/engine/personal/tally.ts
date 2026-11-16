import type { Combatant, CombatState } from '../combat/types';
import type { CampaignState } from '../state/types';

/**
 * P9c: the killing blows each squad unit landed and the hits she took in a fight of the open expedition, added to
 * `ExpeditionState.tally`. Read from the combat log as `recordMerit` reads it. Nothing outside a run, nothing for a combatant that
 * is not a squad unit (the commander in a bout, a mutineer), friendly fire counts for nobody. No draw.
 */
export function recordTally(draft: CampaignState, cs: Pick<CombatState, 'combatants' | 'log'>): void {
  const exp = draft.expedition;
  if (!exp) return;
  const byCid = new Map<string, Combatant>(cs.combatants.map((c) => [c.cid, c]));
  const squadUnit = (cid: string | undefined): string | undefined => {
    const c = cid === undefined ? undefined : byCid.get(cid);
    return c !== undefined && c.side === 'squad' ? c.unitId : undefined;
  };
  const enemy = (cid: string | undefined): boolean => cid !== undefined && byCid.get(cid)?.side === 'enemy';
  const tally = (exp.tally ??= {});
  const entry = (id: string) => (tally[id] ??= { kills: 0, hits: 0 });
  for (const e of cs.log) {
    if (e.kind === 'downed' && enemy(e.target)) {
      const id = squadUnit(e.actor);
      if (id !== undefined) entry(id).kills += 1;
    } else if ((e.kind === 'hit' || e.kind === 'crit') && enemy(e.actor)) {
      const id = squadUnit(e.target);
      if (id !== undefined) entry(id).hits += 1;
    }
  }
  if (Object.keys(tally).length === 0) delete exp.tally;
}
