import { dynamicOn } from '../../engine/dynamic/gate';
import { cardOf } from '../../engine/practice/request';
import type { Registries } from '../../content/types';
import type { CampaignState } from '../../engine/state/types';
import { drawGenerationChips, drawSiteReroll, type GenerationUi } from '../generation/surface';
import type { PracticeKind } from '../../engine/practice/state';

/** The P14 site of a kind of practice (`practice.<kind>`, declared in `src/llm/sites.ts`); the key of its generation is the request id. */
export const practiceSite = (kind: PracticeKind): string => `practice.${kind}`;

/**
 * `[ REROLL ]` of a card that was written for a request and not answered (P16, plan R24): enabled as the practice controller says (`committed`), locked while the call runs. Nothing
 * is drawn without a `generation`, or for a card that has no request (an order about a soldier, a confession).
 */
export function drawPracticeReroll(host: HTMLElement, generation: GenerationUi | undefined, kind: PracticeKind, requestId: string | undefined): HTMLElement | null {
  if (generation === undefined || requestId === undefined) return null;
  return drawSiteReroll(host, generation, practiceSite(kind), requestId);
}

/**
 * The failure chips of the practices whose words did not come (P16, plan R24): a record of a `practice.*` site whose request still waits (or whose card is on this surface), for the
 * units `pick` chooses. Drawn once per surface (the task host draws them). Nothing without a `generation`, and nothing while the dynamic is off.
 */
export function drawPracticeChips(host: HTMLElement, generation: GenerationUi | undefined, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean): number {
  if (generation === undefined || !dynamicOn(state, reg)) return 0;
  const holderOf = (key: string): string | undefined => state.practices?.requests.find((r) => r.id === key)?.holderId ?? cardOf(state, key)?.card.holderId;
  return drawGenerationChips(host, generation, state, 'comms', (r) => {
    if (!r.siteId.startsWith('practice.')) return false;
    const holder = holderOf(r.key);
    return holder !== undefined && pick({ unitId: holder });
  });
}
