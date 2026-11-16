import type { CampaignState, ChronicleEntry } from '../state/types';
import { nextId } from './facts';

export function addChronicle(draft: CampaignState, e: Omit<ChronicleEntry, 'id'>): ChronicleEntry {
  const entry: ChronicleEntry = { ...e, id: nextId(draft, 'c') };
  draft.memory.chronicle.push(entry);
  return entry;
}

const COMPACT_MAX = 400;
const weekOf = (day: number): number => Math.floor((day - 1) / 7);

/** The group a chronicle line compacts with: `*`, the sorted unit ids, or `none` for a line written before P3b. Two audiences never merge. */
export const audienceKey = (a: string[] | '*' | undefined): string => (a === undefined ? 'none' : a === '*' ? '*' : [...new Set(a)].sort().join(','));

export interface CompactionDue {
  kind: 'day' | 'week';
  day: number;
  toDay?: number;
  /** The audience of the group that is due (absent: the lines have none). */
  audience?: string[] | '*';
  entries: ChronicleEntry[];
}

/** The first group, in chronicle order, of entries that share an audience. */
function firstGroup(entries: ChronicleEntry[]): { audience: string[] | '*' | undefined; entries: ChronicleEntry[] } {
  const key = audienceKey(entries[0].audience);
  const group = entries.filter((e) => audienceKey(e.audience) === key);
  const a = group[0].audience;
  return { audience: a === undefined || a === '*' ? a : [...a], entries: group };
}

/**
 * What should be compacted next, or null. Scene lines of a day before today → one day entry; the day entries of a
 * week that is over → one week entry. Day compaction goes first. Lines with different audiences are compacted one group at a time
 * (P3b), so a private line is never folded into what the whole squad knows.
 */
export function compactionDue(state: CampaignState): CompactionDue | null {
  const scenes = state.memory.chronicle.filter((e) => e.kind === 'scene' && e.day < state.day);
  if (scenes.length > 0) {
    const day = Math.min(...scenes.map((e) => e.day));
    const g = firstGroup(scenes.filter((e) => e.day === day));
    return { kind: 'day', day, ...(g.audience !== undefined ? { audience: g.audience } : {}), entries: g.entries };
  }
  // a week is compacted once it is over, from whatever day entries it has (a day without scenes has none)
  const days = state.memory.chronicle.filter((e) => e.kind === 'day');
  for (const week of [...new Set(days.map((e) => weekOf(e.day)))].sort((a, b) => a - b)) {
    const first = week * 7 + 1;
    if (first + 6 < state.day) {
      const g = firstGroup(days.filter((e) => weekOf(e.day) === week));
      return { kind: 'week', day: first, toDay: first + 6, ...(g.audience !== undefined ? { audience: g.audience } : {}), entries: g.entries };
    }
  }
  return null;
}

/**
 * Replaces exactly the entries `compactionDue` named with one entry that inherits their audience; throws if the request (including
 * its `audience`) is not the due one.
 */
export function applyCompaction(
  draft: CampaignState, c: { kind: 'day' | 'week'; day: number; toDay?: number; audience?: string[] | '*'; text: string },
): ChronicleEntry {
  const due = compactionDue(draft);
  if (!due || due.kind !== c.kind || due.day !== c.day || due.toDay !== c.toDay || audienceKey(due.audience) !== audienceKey(c.audience)) {
    throw new Error('memory/compact: that compaction is not due');
  }
  const text = c.text.trim().slice(0, COMPACT_MAX).trim();
  if (text === '') throw new Error('memory/compact: empty text');
  const ids = new Set(due.entries.map((e) => e.id));
  const at = draft.memory.chronicle.findIndex((e) => ids.has(e.id));
  const entry: ChronicleEntry = {
    id: nextId(draft, 'c'), kind: c.kind, day: c.day, ...(c.toDay !== undefined ? { toDay: c.toDay } : {}),
    ...(due.audience !== undefined ? { audience: due.audience } : {}), text,
  };
  draft.memory.chronicle = draft.memory.chronicle.filter((e) => !ids.has(e.id));
  draft.memory.chronicle.splice(at, 0, entry);
  return entry;
}

/** No model, or it failed: the lines joined and cut, so nothing is lost. */
export function fallbackCompaction(entries: ChronicleEntry[]): string {
  return entries.map((e) => e.text.trim()).filter(Boolean).join(' ').slice(0, COMPACT_MAX);
}
