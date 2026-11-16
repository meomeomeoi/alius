import type { Registries } from '../../content/types';
import { unitObeys } from '../personal/state';
import { seizing } from '../bonds/want';
import { amplify } from '../combat/effects';
import type { EffectSpec } from '../combat/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { inAcquaintance } from '../discipline/acquaintance';
import { holdDefiance } from '../discipline/record';
import { isCovert, queueSabotage } from '../discipline/sabotage';
import { grudgeHolds } from '../power/state';
import { getSynergies } from '../relations';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { scaleRefusal } from '../worldOptions';

type Refusal = { chance?: number; orders?: string[] };

const refusalsOf = (effects: unknown): Array<Refusal & { type: string }> =>
  Array.isArray(effects) ? (effects as Array<Refusal & { type: string }>).filter((e) => e?.type === 'order_refusal') : [];

/**
 * The source chance that she refuses an order, before her disposition: the highest `order_refusal` chance among the synergies of her relationship
 * state and loyalty band and the combat downsides of her defects (strained ones amplified, as in combat). An effect
 * limited to named orders only counts when `orderId` is one of them; without an `orderId` (an order in a scene) only
 * unrestricted effects count.
 */
export function rawRefusalChance(state: CampaignState, reg: Registries, unitId: string, orderId?: string): number {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit) return 0;
  const found: number[] = [0];
  const take = (e: Refusal): void => {
    const limited = e.orders !== undefined && e.orders.length > 0;
    if (limited && (orderId === undefined || !e.orders!.includes(orderId))) return;
    found.push(e.chance ?? 0);
  };
  for (const { synergyId } of getSynergies(state, reg, [unitId])) {
    for (const e of refusalsOf(reg.synergies.get(synergyId)?.effects)) take(e);
  }
  const strained = unit.stress >= 50;
  for (const d of unit.defects) {
    const downside = (reg.defects.get(d.id)?.combat as { downside?: unknown } | undefined)?.downside;
    for (const e of refusalsOf(downside)) take(strained ? amplify(e as unknown as EffectSpec, TUNING.combat.strainedMult) as Refusal : e);
  }
  return Math.max(...found);
}

/** The chance that she refuses an order, as she will roll it: the source chance scaled by her disposition (and by a grudge, P9b). */
export function refusalChance(state: CampaignState, reg: Registries, unitId: string, orderId?: string): number {
  if (unitObeys(state, unitId)) return 0; // P9c: a day of obedience: she follows the commander's non-combat orders
  const chance = scaleRefusal(state, reg, unitId, rawRefusalChance(state, reg, unitId, orderId));
  // P9b: a unit the commander overruled in a squad vote pushes back more openly until the next day end
  return grudgeHolds(state, unitId) ? Math.min(TUNING.disposition.refusalCap, chance * TUNING.power.vote.grudgeRefusalMult) : chance;
}

/**
 * An out-of-combat order to her in the open scene (a fixed scene control, not an intent): rolls her refusal before the
 * player's message goes out. A refusal is stored until she is answered (`leash/compel`) or the next exchange; a
 * compliance clears an older refusal of hers. P9: a refusal holds a moderate defiance (it settles when the scene ends,
 * unless the commander enforces); a unit whose command stance is covert (fearful) refuses in secret instead: nothing is
 * stored, the order looks accepted, one covert sabotage is queued (none while she is still getting to know the commander)
 * and no defiance is held.
 */
export function orderInScene(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const scene = draft.scene;
  if (!scene || !scene.participants.includes(unitId)) throw new Error('She is not in the open scene.');
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit) throw new Error(`Unknown unit "${unitId}".`);
  if (scene.refusals?.some((r) => r.unitId === unitId && r.exchange === scene.exchanges)) {
    throw new Error('She has already refused: wait for her answer.');
  }
  // P9d: in a breakdown that seizes command she refuses every order (not a defiance: it is the breakdown)
  if (seizing(unit, ctx.registries)) {
    scene.refusals = [...(scene.refusals ?? []).filter((r) => r.unitId !== unitId), { unitId, exchange: scene.exchanges }];
    return [{ type: 'scene_order', unitId, refused: true, chance: 1, seized: true }];
  }
  const chance = refusalChance(draft, ctx.registries, unitId);
  const refused = chance > 0 && ctx.rng.chance(chance);
  scene.refusals = (scene.refusals ?? []).filter((r) => r.unitId !== unitId);
  if (!refused) return [{ type: 'scene_order', unitId, refused, chance }];
  if (unit.kind === 'named' && isCovert(draft, ctx.registries, unitId)) {
    if (!inAcquaintance(draft, ctx.registries, unitId)) queueSabotage(draft, unitId); // she stalls either way; inside the acquaintance period nothing comes of it
    return [{ type: 'scene_order', unitId, refused: false, chance, covert: true }];
  }
  scene.refusals.push({ unitId, exchange: scene.exchanges });
  return [{ type: 'scene_order', unitId, refused, chance }, ...(unit.kind === 'named' ? holdDefiance(draft, unitId, 'moderate', 'order', scene.id) : [])];
}
