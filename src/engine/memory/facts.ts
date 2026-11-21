import type { CampaignState, Fact } from '../state/types';
import { UNTOLD_TAG } from '../life/state';
import { normalizeTag } from '../setup';
import { TUNING } from '../tuning';
import { factTextMax, memoryConfig } from './config';
import { sweepCovered } from './fold';

/** `f12`, `p3`, `c40`, `s7`, …: one campaign-wide counter so ids never repeat inside a save. */
export function nextId(draft: CampaignState, prefix: string): string {
  const n = (draft.memory.nextId ?? 0) + 1;
  draft.memory.nextId = n;
  return `${prefix}${n}`;
}

const normText = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const sameAbout = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join('\0') === [...b].sort().join('\0');
const tagList = (tags: unknown[]): string[] => [...new Set(tags.map((t) => normalizeTag(t)).filter((t): t is string => t !== null))];

/** `fr1`, `fr2`, …: the facts a memory rule writes have their own counter, so `nextId` (and every id a test asserts) never shifts. */
function nextRememberId(draft: CampaignState): string {
  const n = (draft.memory.nextRememberId ?? 0) + 1;
  draft.memory.nextRememberId = n;
  return `fr${n}`;
}

/**
 * Stores a fact (text cut to the cap, tags normalized). A duplicate (same text and subject) only widens `knownBy`.
 * `remembered` (P3b rules) takes the id from the separate `fr` counter; `pinned`, `hiddenFromCommander` and `spread` pass through `f`.
 */
export function addFact(draft: CampaignState, f: Omit<Fact, 'id'>, opts: { remembered?: true } = {}): Fact {
  const text = f.text.trim().slice(0, factTextMax(draft)).trim();
  const about = [...f.about];
  const dup = draft.memory.facts.find((x) => normText(x.text) === normText(text) && sameAbout(x.about, about));
  if (dup) {
    for (const k of f.knownBy) if (!dup.knownBy.includes(k)) dup.knownBy.push(k);
    return dup;
  }
  const fact: Fact = { ...f, id: opts.remembered ? nextRememberId(draft) : nextId(draft, 'f'), text, about, tags: tagList(f.tags), knownBy: [...new Set(f.knownBy)] };
  draft.memory.facts.push(fact);
  pruneFacts(draft);
  return fact;
}

/**
 * Metadata must stay small. The fold runs first (P3b); only past `factsMax × 1.25` are the least important (then oldest)
 * unpinned facts deleted, so a save cannot grow without bound if the fold cannot run.
 */
function pruneFacts(draft: CampaignState): void {
  sweepCovered(draft); // a fact that was folded into all its dossiers goes before anything is deleted
  const ceiling = Math.floor(memoryConfig(draft).factsMax * TUNING.memory.hardCeiling);
  const extra = draft.memory.facts.length - ceiling;
  if (extra <= 0) return;
  const at = new Map(draft.memory.facts.map((f, i) => [f.id, i]));
  const doomed = new Set(
    draft.memory.facts.filter((f) => !f.pinned)
      .sort((a, b) => a.importance - b.importance || a.day - b.day || at.get(a.id)! - at.get(b.id)!)
      .slice(0, extra).map((f) => f.id),
  );
  draft.memory.facts = draft.memory.facts.filter((f) => !doomed.has(f.id));
}

/** A fact is visible to a group only if it is public (`'*'`) or every viewer knows it. The commander always knows. */
export function factsVisibleTo(state: CampaignState, viewers: string[]): Fact[] {
  return state.memory.facts.filter((f) => f.knownBy.includes('*') || viewers.every((v) => f.knownBy.includes(v)));
}

/** Top-k visible facts: 3·participant overlap + 2·tag overlap + importance + 3·recencyBase^(age in days) (+2 when pinned); ties → newer. k and recencyBase come from the campaign's memory config. */
export function retrieveFacts(
  state: CampaignState, q: { participants: string[]; tags: string[] }, k: number = memoryConfig(state).retrievalK,
): Fact[] {
  const { recencyBase } = memoryConfig(state);
  const tags = new Set(tagList(q.tags));
  const people = new Set(q.participants);
  const score = (f: Fact): number =>
    3 * f.about.filter((a) => people.has(a)).length
    + 2 * f.tags.filter((t) => tags.has(t)).length
    + f.importance
    + 3 * recencyBase ** Math.max(0, state.day - f.day)
    + (f.pinned ? TUNING.memory.pinnedBonus : 0);
  const at = new Map(state.memory.facts.map((f, i) => [f.id, i]));
  const order = (f: Fact): number => at.get(f.id) ?? 0;
  return factsVisibleTo(state, q.participants)
    .filter((f) => !f.tags.includes(UNTOLD_TAG)) // P14c: a life fact the commander has not been told never reaches a prompt (revealing it takes the tag off)
    .map((f) => ({ f, s: score(f) }))
    .sort((a, b) => b.s - a.s || b.f.day - a.f.day || order(b.f) - order(a.f))
    .slice(0, k)
    .map((x) => x.f);
}

