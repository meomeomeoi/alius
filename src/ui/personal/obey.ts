import type { Registries } from '../../content/types';
import { herPick } from '../../engine/personal/obedience';
import { obedienceOf } from '../../engine/personal/state';
import type { CampaignState } from '../../engine/state/types';
import { h } from '../dom';

/** Marks a control as the choice the soldier of today's obedience would make (the commander follows her today). */
export function markPick(el: HTMLElement): void {
  el.setAttribute('data-preselected', 'true');
  el.classList.add('is-preselected');
}

/** The small hint beside a choice that goes against her: `DEFIES {NAME}`. */
export function defiesHint(name: string): HTMLElement {
  return h('span', { class: 'alius-dim alius-defies', 'data-defies': name }, `DEFIES ${name.toUpperCase()}`);
}

/** The soldier the commander obeys today (her display name), or `null`. */
export function obeyedBy(state: CampaignState, unitId: string): string | null {
  const o = obedienceOf(state);
  return o !== null && o.who === 'commander' && o.unitId === unitId ? state.squad.find((u) => u.id === unitId)?.displayName ?? unitId : null;
}

/** For the open dilemma: the option she would pick while the commander obeys her (`null` otherwise, or when no option touches her). */
export function herPickView(state: CampaignState, reg: Registries): { index: number; name: string } | null {
  const o = obedienceOf(state);
  if (o === null || o.who !== 'commander') return null;
  const index = herPick(state, reg, o.unitId);
  return index === null ? null : { index, name: state.squad.find((u) => u.id === o.unitId)?.displayName ?? o.unitId };
}
