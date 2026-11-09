import type { CampaignState } from './state/types';

/** `f12`, `p3`, `c40`, `s7`, …: one campaign-wide counter so ids never repeat inside a save. */
export function nextId(draft: CampaignState, prefix: string): string {
  const n = (draft.memory.nextId ?? 0) + 1;
  draft.memory.nextId = n;
  return `${prefix}${n}`;
}
