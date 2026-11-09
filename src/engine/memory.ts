import type { Entry, Registries } from '../content/types';
import type { EngineEvent } from './dispatch';
import { applyRelationDelta } from './relationGain';
import type { EventIntent, PromiseIntent } from './relations/intents';
import { normalizeTag } from './setup';
import type { CampaignState, ChronicleEntry, Fact, PromiseRecord } from './state/types';
import { TUNING } from './tuning';

/** `f12`, `p3`, `c40`, `s7`, …: one campaign-wide counter so ids never repeat inside a save. */
export function nextId(draft: CampaignState, prefix: string): string {
  const n = (draft.memory.nextId ?? 0) + 1;
  draft.memory.nextId = n;
  return `${prefix}${n}`;
}

// ---------------------------------------------------------------------------------------------
// facts

const normText = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const sameAbout = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join('\0') === [...b].sort().join('\0');
const tagList = (tags: unknown[]): string[] => [...new Set(tags.map((t) => normalizeTag(t)).filter((t): t is string => t !== null))];

/** Stores a fact (text cut to the cap, tags normalized). A duplicate (same text and subject) only widens `knownBy`. */
export function addFact(draft: CampaignState, f: Omit<Fact, 'id'>): Fact {
  const text = f.text.trim().slice(0, TUNING.memory.factTextMax).trim();
  const about = [...f.about];
  const dup = draft.memory.facts.find((x) => normText(x.text) === normText(text) && sameAbout(x.about, about));
  if (dup) {
    for (const k of f.knownBy) if (!dup.knownBy.includes(k)) dup.knownBy.push(k);
    return dup;
  }
  const fact: Fact = { ...f, id: nextId(draft, 'f'), text, about, tags: tagList(f.tags), knownBy: [...new Set(f.knownBy)] };
  draft.memory.facts.push(fact);
  pruneFacts(draft);
  return fact;
}

/** Metadata must stay small: past `factsMax` the least important (then oldest) facts go. */
function pruneFacts(draft: CampaignState): void {
  const extra = draft.memory.facts.length - TUNING.memory.factsMax;
  if (extra <= 0) return;
  const order = (f: Fact): number => Number(f.id.replace(/\D/g, '')) || 0;
  const doomed = new Set(
    [...draft.memory.facts].sort((a, b) => a.importance - b.importance || a.day - b.day || order(a) - order(b)).slice(0, extra).map((f) => f.id),
  );
  draft.memory.facts = draft.memory.facts.filter((f) => !doomed.has(f.id));
}

/** A fact is visible to a group only if it is public (`'*'`) or every viewer knows it. The commander always knows. */
export function factsVisibleTo(state: CampaignState, viewers: string[]): Fact[] {
  return state.memory.facts.filter((f) => f.knownBy.includes('*') || viewers.every((v) => f.knownBy.includes(v)));
}

/** Top-k visible facts: 3·participant overlap + 2·tag overlap + importance + 3·recencyBase^(age in days); ties → newer. */
export function retrieveFacts(
  state: CampaignState, q: { participants: string[]; tags: string[] }, k: number = TUNING.memory.retrievalK,
): Fact[] {
  const tags = new Set(tagList(q.tags));
  const people = new Set(q.participants);
  const score = (f: Fact): number =>
    3 * f.about.filter((a) => people.has(a)).length
    + 2 * f.tags.filter((t) => tags.has(t)).length
    + f.importance
    + 3 * TUNING.memory.recencyBase ** Math.max(0, state.day - f.day);
  const order = (f: Fact): number => Number(f.id.replace(/\D/g, '')) || 0;
  return factsVisibleTo(state, q.participants)
    .map((f) => ({ f, s: score(f) }))
    .sort((a, b) => b.s - a.s || b.f.day - a.f.day || order(b.f) - order(a.f))
    .slice(0, k)
    .map((x) => x.f);
}

// ---------------------------------------------------------------------------------------------
// promises

const words = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
function jaccard(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/**
 * `made` opens a promise; `kept`/`broken` closes the open promise with the same parties that best matches the text
 * (word overlap ≥ 0.3, else the newest). A commander promise yields the `kept_promise`/`broke_promise` event the caller
 * should apply (unless the intent list already carried one for that unit).
 */
export function recordPromise(
  draft: CampaignState, p: PromiseIntent, day: number, knownBy?: string[],
): { event: EventIntent | null; record?: PromiseRecord } {
  const list = (draft.memory.promises ??= []);
  if (p.kind === 'made') {
    const record: PromiseRecord = { id: nextId(draft, 'p'), by: p.by, to: p.to, text: p.text, status: 'open', day, ...(knownBy ? { knownBy: [...knownBy] } : {}) };
    list.push(record);
    return { event: null, record };
  }
  const open = list.filter((x) => x.status === 'open' && x.by === p.by && x.to === p.to);
  if (open.length === 0) return { event: null };
  const matching = open.filter((x) => jaccard(x.text, p.text) >= 0.3).sort((a, b) => jaccard(b.text, p.text) - jaccard(a.text, p.text));
  const target = matching[0] ?? open[open.length - 1];
  target.status = p.kind === 'kept' ? 'kept' : 'broken';
  pruneClosedPromises(draft);
  if (p.by !== 'commander') return { event: null, record: target };
  const event: EventIntent = {
    type: p.kind === 'kept' ? 'kept_promise' : 'broke_promise', actor: 'commander', targets: [p.to], severity: 'moderate',
    evidence: target.text.split(/\s+/).slice(0, 20).join(' ') || 'a promise', confidence: 1,
  };
  return { event, record: target };
}

/** Closed promises are only history: keep the newest `closedPromisesMax`. */
function pruneClosedPromises(draft: CampaignState): void {
  const list = draft.memory.promises ?? [];
  const extra = list.filter((x) => x.status !== 'open').length - TUNING.memory.closedPromisesMax;
  if (extra <= 0) return;
  let drop = extra;
  draft.memory.promises = list.filter((x) => !(x.status !== 'open' && drop-- > 0));
}

/**
 * Open promises that involve any of these units and that every viewer heard (a promise without `knownBy` is visible to
 * all). Pass the present participants as `viewers` for anything that reaches a shared prompt.
 */
export function openPromises(state: CampaignState, unitIds: string[], viewers: string[] = []): PromiseRecord[] {
  return (state.memory.promises ?? []).filter(
    (p) => p.status === 'open' && (unitIds.includes(p.by) || unitIds.includes(p.to))
      && (!p.knownBy || p.knownBy.includes('*') || viewers.every((v) => p.knownBy!.includes(v))),
  );
}

// ---------------------------------------------------------------------------------------------
// chronicle

export function addChronicle(draft: CampaignState, e: Omit<ChronicleEntry, 'id'>): ChronicleEntry {
  const entry: ChronicleEntry = { ...e, id: nextId(draft, 'c') };
  draft.memory.chronicle.push(entry);
  return entry;
}

const COMPACT_MAX = 400;
const weekOf = (day: number): number => Math.floor((day - 1) / 7);

export interface CompactionDue {
  kind: 'day' | 'week';
  day: number;
  toDay?: number;
  entries: ChronicleEntry[];
}

/**
 * What should be compacted next, or null. Scene lines of a day before today → one day entry; the day entries of a
 * week that is over → one week entry. Day compaction goes first.
 */
export function compactionDue(state: CampaignState): CompactionDue | null {
  const scenes = state.memory.chronicle.filter((e) => e.kind === 'scene' && e.day < state.day);
  if (scenes.length > 0) {
    const day = Math.min(...scenes.map((e) => e.day));
    return { kind: 'day', day, entries: scenes.filter((e) => e.day === day) };
  }
  // a week is compacted once it is over, from whatever day entries it has (a day without scenes has none)
  const days = state.memory.chronicle.filter((e) => e.kind === 'day');
  for (const week of [...new Set(days.map((e) => weekOf(e.day)))].sort((a, b) => a - b)) {
    const first = week * 7 + 1;
    if (first + 6 < state.day) return { kind: 'week', day: first, toDay: first + 6, entries: days.filter((e) => weekOf(e.day) === week) };
  }
  return null;
}

/** Replaces exactly the entries `compactionDue` named with one entry; throws if the request is not the due one. */
export function applyCompaction(draft: CampaignState, c: { kind: 'day' | 'week'; day: number; toDay?: number; text: string }): ChronicleEntry {
  const due = compactionDue(draft);
  if (!due || due.kind !== c.kind || due.day !== c.day || due.toDay !== c.toDay) throw new Error('memory/compact: that compaction is not due');
  const text = c.text.trim().slice(0, COMPACT_MAX).trim();
  if (text === '') throw new Error('memory/compact: empty text');
  const ids = new Set(due.entries.map((e) => e.id));
  const at = draft.memory.chronicle.findIndex((e) => ids.has(e.id));
  const entry: ChronicleEntry = { id: nextId(draft, 'c'), kind: c.kind, day: c.day, ...(c.toDay !== undefined ? { toDay: c.toDay } : {}), text };
  draft.memory.chronicle = draft.memory.chronicle.filter((e) => !ids.has(e.id));
  draft.memory.chronicle.splice(at, 0, entry);
  return entry;
}

/** No model, or it failed: the lines joined and cut, so nothing is lost. */
export function fallbackCompaction(entries: ChronicleEntry[]): string {
  return entries.map((e) => e.text.trim()).filter(Boolean).join(' ').slice(0, COMPACT_MAX);
}

// ---------------------------------------------------------------------------------------------
// crime discovery

type Reaction = { axis: keyof CampaignState['squad'][number]['values']; sign: '+' | '-'; weight: number };

/**
 * Units that do not yet know the commander's crime learn it and, once, react to it according to their values:
 * Trust += weight·trustPerWeight and Affinity += weight·affinityPerWeight for every matching value reaction.
 * (Units that already knew — from the start or earlier — are left alone.) Grunts only get the Trust part.
 */
export function revealCrime(draft: CampaignState, reg: Registries, unitIds: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  const crime: Entry | undefined = draft.commander.crimeId ? reg.crimes.get(draft.commander.crimeId) : undefined;
  const reactions = (crime?.valueReactions as Reaction[] | undefined) ?? [];
  for (const id of unitIds) {
    const unit = draft.squad.find((u) => u.id === id);
    const rel = draft.relations[id];
    if (!unit || !rel || rel.flags.includes('knows_crime')) continue;
    rel.flags.push('knows_crime');
    if (!rel.flags.includes('crime_reaction_done')) {
      rel.flags.push('crime_reaction_done');
      for (const r of reactions) {
        const v = unit.values[r.axis];
        if (r.sign === '+' ? !(v > 0) : !(v < 0)) continue;
        applyRelationDelta(draft, id, 'trust', r.weight * TUNING.relations.crime.trustPerWeight, 'crime_revealed');
        if (unit.kind !== 'grunt') applyRelationDelta(draft, id, 'affinity', r.weight * TUNING.relations.crime.affinityPerWeight, 'crime_revealed');
      }
    }
    events.push({ type: 'crime_known', unitId: id });
  }
  return events;
}
