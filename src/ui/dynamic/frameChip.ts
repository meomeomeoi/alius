import type { Registries } from '../../content/types';
import { frameRank } from '../../engine/blocking/state';
import { isLiving } from '../../engine/economy';
import { dynamicOn } from '../../engine/dynamic/gate';
import { dynamicOf } from '../../engine/dynamic/state';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';

/**
 * The frame chip of a scene (P15, plan R25): beside the lead chips, one chip for each woman present who holds at `play` or beyond, `ANN: ROLE`, addressed by the glossary's frame. Appends
 * one row to `host` (the lead chips' host, which is replaced on every draw); nothing is drawn while the dynamic is off, for a woman at `equal`, or in immersive mode (`hidden`: the frame's
 * name is a band, and the cut-in names her only). It shows no hold and no number.
 */
export function drawFrameChips(host: HTMLElement, state: CampaignState, reg: Registries, pick: (unitId: string) => boolean, hidden: boolean): void {
  if (hidden || !dynamicOn(state, reg)) return;
  const chips = state.squad
    .filter((u) => u.kind === 'named' && isLiving(u) && pick(u.id) && frameRank(dynamicOf(state, u.id)?.frame ?? 'equal') >= frameRank('play'))
    .map((u) => h('span', { class: 'alius-chip alius-frame-chip', 'data-frame-chip': u.id, ...analyzeAttrs('glossary:frame', { unitId: u.id }) },
      `${u.displayName.toUpperCase()}: ${String(reg.dynamicFrames.get(dynamicOf(state, u.id)!.frame)?.label ?? '').toUpperCase()}`));
  if (chips.length > 0) host.append(h('div', { class: 'alius-lead-chips alius-frame-chips' }, ...chips));
}
