import type { Entry, Registries } from '../../content/types';
import { handOf } from '../../engine/hand';
import type { CampaignState } from '../../engine/state/types';
import type { StageSetup } from './load';

/**
 * P10e-f: her look from her stage folder (`stage.json`), keyed by unit id: how she stands on the stage, her hand and her accent.
 * A leaf: module memory the app sets after the stage load and clears on a chat switch (unit ids repeat across campaigns), read by
 * the sprite placement, `unitAccent` and every UI site of her hand. No rng, no state: absent = today's look.
 */
let looks = new Map<string, StageSetup>();

/** Replaces every look (an empty map clears them). */
export function setStageLooks(map: Map<string, StageSetup>): void {
  looks = new Map(map);
}

export function stageLookOf(unitId: string): StageSetup | null {
  return looks.get(unitId) ?? null;
}

/**
 * Her hand: the campaign's own choice (`unit.hand`, when the registry has it), then her `stage.json` hand (when the registry has
 * it), then `handOf`'s hash. Null for a grunt or an unknown unit, as `handOf`.
 */
export function herHand(state: CampaignState, reg: Registries, unitId: string): Entry | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named') return null;
  const chosen = unit.hand === undefined ? undefined : reg.handFonts.get(unit.hand);
  if (chosen) return chosen;
  const card = stageLookOf(unitId)?.hand;
  const fromCard = card === undefined ? undefined : reg.handFonts.get(card);
  return fromCard ?? handOf(state, reg, unitId);
}
