import type { Registries } from '../../content/types';
import { amplify } from '../combat/effects';
import type { EffectSpec } from '../combat/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
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

/** The chance that she refuses an order, as she will roll it: the source chance scaled by her disposition. */
export function refusalChance(state: CampaignState, reg: Registries, unitId: string, orderId?: string): number {
  return scaleRefusal(state, reg, unitId, rawRefusalChance(state, reg, unitId, orderId));
}

/**
 * An out-of-combat order to her in the open scene (a fixed scene control, not an intent): rolls her refusal before the
 * player's message goes out. A refusal is stored until she is answered (`leash/compel`) or the next exchange; a
 * compliance clears an older refusal of hers.
 */
export function orderInScene(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const scene = draft.scene;
  if (!scene || !scene.participants.includes(unitId)) throw new Error('She is not in the open scene.');
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit) throw new Error(`Unknown unit "${unitId}".`);
  if (scene.refusals?.some((r) => r.unitId === unitId && r.exchange === scene.exchanges)) {
    throw new Error('She has already refused: wait for her answer.');
  }
  const chance = refusalChance(draft, ctx.registries, unitId);
  const refused = chance > 0 && ctx.rng.chance(chance);
  scene.refusals = (scene.refusals ?? []).filter((r) => r.unitId !== unitId);
  if (refused) scene.refusals.push({ unitId, exchange: scene.exchanges });
  return [{ type: 'scene_order', unitId, refused, chance }];
}
