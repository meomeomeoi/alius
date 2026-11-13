import type { CampaignState, LedgerEntry } from './state/types';
import { BODY_STATS } from './commander/profile';
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

  // P7: a raised (or scarred) body stat; the migration that first writes the body (`commander/seed`) is not training
  if (before.commander?.body !== undefined && after.commander?.body !== undefined) for (const stat of BODY_STATS) push(`body:${stat}`, (after.commander?.body?.[stat] ?? 0) - (before.commander?.body?.[stat] ?? 0));

  if (entries.length > 0) after.ledger = [...(after.ledger ?? []), ...entries];
  if (!after.ledger) return;
  const oldest = after.day - (TUNING.ledger.days - 1);
  const kept = after.ledger.filter((e) => e.day >= oldest);
  after.ledger = capByKind(kept, TUNING.ledger.max);
}

const kindOf = (e: LedgerEntry): string => e.key.slice(0, e.key.indexOf(':'));

/**
 * Keeps at most `max` entries. The oldest entry of the most crowded kind (`res`, `stress`, `axis`) goes first, so a
 * long conversation cannot push every resource entry out of the ledger.
 */
function capByKind(list: LedgerEntry[], max: number): LedgerEntry[] {
  if (list.length <= max) return list;
  const counts = new Map<string, number>();
  for (const e of list) counts.set(kindOf(e), (counts.get(kindOf(e)) ?? 0) + 1);
  const drop = new Set<LedgerEntry>();
  for (let over = list.length - max; over > 0; over--) {
    let crowded = '';
    for (const [kind, n] of counts) if (crowded === '' || n > (counts.get(crowded) ?? 0)) crowded = kind;
    const oldest = list.find((e) => !drop.has(e) && kindOf(e) === crowded)!;
    drop.add(oldest);
    counts.set(crowded, (counts.get(crowded) ?? 1) - 1);
  }
  return list.filter((e) => !drop.has(e));
}
