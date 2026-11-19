import type { EngineEvent } from './dispatch';
import type { CampaignState, GenerationFailReason, GenerationRecord } from './state/types';
import { TUNING } from './tuning';

export type { GenerationRecord } from './state/types';

// P14: the failure records of model calls. Pure bookkeeping: no rng, no prompt, no model text (acceptance 6).

export const GENERATION_REASONS: readonly GenerationFailReason[] = ['no_profile', 'network', 'timeout', 'truncated', 'refused', 'invalid_output', 'empty'];
export const CLOSE_OUTCOMES = ['applied', 'dropped', 'kept_fallback'] as const;
export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];

const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/** The records that wait for a retry (not expired), oldest first; optionally of one site. Absent `generations` reads as none. */
export function openRecords(state: CampaignState, filter?: { siteId?: string }): GenerationRecord[] {
  return (state.generations?.records ?? []).filter((r) => r.status === 'open' && (filter?.siteId === undefined || r.siteId === filter.siteId));
}

/** The record of a site and key: the open one if there is one, else an expired one. */
export function recordFor(state: CampaignState, siteId: string, key: string): GenerationRecord | undefined {
  const list = (state.generations?.records ?? []).filter((r) => r.siteId === siteId && r.key === key);
  return list.find((r) => r.status === 'open') ?? list[0];
}

export interface FailurePayload {
  siteId: string;
  key: string;
  reason: GenerationFailReason;
  detail: string;
  attempts: number;
  at: number;
  budgetMult: number;
  fallbackApplied?: boolean;
  quiet?: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks a `generation/failed` payload and keeps only the known fields (anything else, a prompt or raw text included, is dropped). */
export function readFailure(payload: unknown): FailurePayload {
  if (!isObj(payload)) throw new Error('generation/failed needs a payload');
  const { siteId, key, reason, detail, attempts, at, budgetMult } = payload;
  if (typeof siteId !== 'string' || siteId === '' || typeof key !== 'string' || key === '') throw new Error('generation/failed needs { siteId, key }');
  if (typeof reason !== 'string' || !(GENERATION_REASONS as readonly string[]).includes(reason)) throw new Error(`generation/failed: unknown reason "${String(reason)}"`);
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 1) throw new Error('generation/failed needs attempts ≥ 1');
  if (typeof at !== 'number' || !Number.isFinite(at)) throw new Error('generation/failed needs at');
  if (typeof budgetMult !== 'number' || !Number.isFinite(budgetMult) || budgetMult <= 0) throw new Error('generation/failed needs budgetMult > 0');
  return {
    siteId, key, reason: reason as GenerationFailReason, detail: typeof detail === 'string' ? detail : '', attempts, at, budgetMult,
    ...(payload.fallbackApplied === true ? { fallbackApplied: true } : {}), ...(payload.quiet === true ? { quiet: true } : {}),
  };
}

/** Writes a failure: one open record per site and key (a second failure updates it), at most `maxRecords` (the oldest is dropped). */
export function recordFailure(draft: CampaignState, p: FailurePayload): EngineEvent[] {
  const gens = (draft.generations ??= { seq: 0, records: [] });
  const detail = cut(p.detail, TUNING.generation.detailMax);
  let rec = gens.records.find((r) => r.status === 'open' && r.siteId === p.siteId && r.key === p.key);
  if (rec) {
    rec.attempts += p.attempts;
    rec.reason = p.reason;
    rec.detail = detail;
    rec.at = p.at;
    rec.budgetMult = p.budgetMult;
    if (p.fallbackApplied) rec.fallbackApplied = true;
  } else {
    gens.seq += 1;
    rec = {
      id: `g${gens.seq}`, siteId: p.siteId, key: p.key, reason: p.reason, detail, attempts: p.attempts, day: draft.day, slot: draft.slot,
      at: p.at, budgetMult: p.budgetMult, status: 'open',
      ...(p.fallbackApplied ? { fallbackApplied: true as const } : {}), ...(p.quiet ? { quiet: true as const } : {}),
    };
    gens.records.push(rec);
    while (gens.records.length > TUNING.generation.maxRecords) {
      const dropped = gens.records.shift()!;
      console.info(`[alius] generation record ${dropped.id} (${dropped.siteId}) dropped: the list is full`);
    }
  }
  return [{ type: 'generation_failed', id: rec.id, siteId: rec.siteId, key: rec.key, reason: rec.reason }];
}

/** Removes records: by id (any status) or every open record of a site and key. A close that matches nothing is not an error. */
export function closeRecords(draft: CampaignState, by: { id: string } | { siteId: string; key: string }, outcome: CloseOutcome): EngineEvent[] {
  const gens = draft.generations;
  if (!gens) return [];
  const hit = (r: GenerationRecord): boolean => ('id' in by ? r.id === by.id : r.status === 'open' && r.siteId === by.siteId && r.key === by.key);
  const closed = gens.records.filter(hit);
  if (closed.length === 0) return [];
  gens.records = gens.records.filter((r) => !hit(r));
  return closed.map((r) => ({ type: 'generation_closed', id: r.id, siteId: r.siteId, key: r.key, outcome }));
}

/** The moment a record was about to retry has passed: it stays listed, saying why, for the rest of that day and the next. */
export function expireRecord(draft: CampaignState, id: string, why: string): EngineEvent[] {
  const rec = draft.generations?.records.find((r) => r.id === id);
  if (!rec || rec.status === 'expired') return [];
  rec.status = 'expired';
  rec.reason = 'expired';
  rec.expiredWhy = cut(why, TUNING.generation.detailMax);
  rec.expiredDay = draft.day;
  return [{ type: 'generation_expired', id: rec.id, siteId: rec.siteId, key: rec.key, why: rec.expiredWhy }];
}

/**
 * The day-end sweep. It runs before the day rolls over, so a record that expired on day E (shown the rest of E and all of E + 1) goes
 * at the end of day E + `expiredDays`. Open records stay until retried, dropped, closed or pushed out by the cap.
 */
export function generationSweep(draft: CampaignState): EngineEvent[] {
  const gens = draft.generations;
  if (!gens) return [];
  const keep = gens.records.filter((r) => r.status === 'open' || (r.expiredDay ?? 0) + TUNING.generation.expiredDays > draft.day);
  if (keep.length !== gens.records.length) gens.records = keep;
  return [];
}
