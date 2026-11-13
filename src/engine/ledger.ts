import type { CampaignState, LedgerEntry } from './state/types';
import { TUNING } from './tuning';

export type { LedgerEntry } from './state/types';

const RESOURCES = ['credits', 'supplies', 'plyx'] as const;
const AXES = ['trust', 'affinity', 'attraction'] as const;

/**
 * Appends to `after.ledger` one entry per resource, unit stress and relation axis that differs between
 * `before` and `after`, stamped with the day and slot `before` was at, then drops what is older than
 * `TUNING.ledger.days` days or beyond the newest `TUNING.ledger.max`. `dispatch` calls it on the draft
 * after a handler returned. A save without a ledger gets one only when something changed.
 */
export function recordLedger(before: CampaignState, after: CampaignState, action: string): void {
  const entries: LedgerEntry[] = [];
  const push = (key: string, delta: number): void => {
    if (Number.isFinite(delta) && delta !== 0) entries.push({ day: before.day, slot: before.slot, action, key, delta });
  };

  for (const r of RESOURCES) push(`res:${r}`, (after.resources?.[r] ?? 0) - (before.resources?.[r] ?? 0));

  const stressBefore = new Map(before.squad.map((u) => [u.id, u.stress]));
  for (const u of after.squad) {
    const was = stressBefore.get(u.id);
    if (was !== undefined) push(`stress:${u.id}`, (u.stress ?? 0) - (was ?? 0));
  }

  for (const [id, rel] of Object.entries(after.relations)) {
    const was = before.relations[id];
    if (!was) continue;
    for (const axis of AXES) push(`axis:${id}:${axis}`, (rel[axis] ?? 0) - (was[axis] ?? 0));
  }

  if (entries.length > 0) after.ledger = [...(after.ledger ?? []), ...entries];
  if (!after.ledger) return;
  const oldest = after.day - (TUNING.ledger.days - 1);
  const kept = after.ledger.filter((e) => e.day >= oldest);
  after.ledger = kept.length > TUNING.ledger.max ? kept.slice(kept.length - TUNING.ledger.max) : kept;
}
