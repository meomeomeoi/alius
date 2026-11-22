import type { Registries } from '../../../src/content/types';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign } from '../../helpers/world';

export const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
export const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** A bond profile that practises `restraint` (and, listed in `also`, the other categories) as `enjoys`. */
export function holderBond(also: string[] = []) {
  return {
    leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] as string[] }, publicity: 'known' as const,
    practice: {
      categories: Object.fromEntries(['restraint', ...also].map((c) => [c, { as: 'enjoys' as const, witness: 'indifferent' as const }])),
      style: { primary: 'cold' as const }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const,
    },
  };
}

/**
 * Ann holds at `frame` (the dynamic is on, `restraint`, `public_humiliation` and `denial` are enabled), Bea and Cat are squad members with no profile.
 * `practices` is absent: nothing of P16 has written yet.
 */
export function world(reg: Registries, frame: Frame = 'play'): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = holderBond(['public_humiliation', 'denial']);
  s.content = { enabled: ['restraint', 'public_humiliation', 'denial'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.day = 20;
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold: frame === 'equal' ? 10 : 30 };
  return s;
}

/** Bea holds too (her own profile and a frame). */
export function withBea(s: CampaignState, frame: Frame = 'play'): CampaignState {
  unitOf(s, BEA).bond = holderBond();
  s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame, hold: 30 };
  return s;
}
