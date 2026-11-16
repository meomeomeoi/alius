import type { CampaignState, Fact } from '../state/types';
import { TUNING } from '../tuning';
import { isLiving } from '../economy';
import { memoryConfig } from './config';

/** The world dossier's key (`memory.dossiers['*']`): facts about nobody in particular. */
export const WORLD = '*';

const livingNamed = (state: CampaignState): string[] => state.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id);

/** A fact the fold may take: older than `foldAfterDays`, not pinned, not hidden from the commander (that one waits for P12). */
export function isFoldable(state: CampaignState, fact: Fact): boolean {
  return state.day - fact.day > memoryConfig(state).foldAfterDays && fact.pinned !== true && fact.hiddenFromCommander !== true;
}

/** `shared` when the whole squad knew it (or it was public), else `own`. */
export function foldPart(state: CampaignState, fact: Fact): 'own' | 'shared' {
  return fact.knownBy.includes('*') || livingNamed(state).every((id) => fact.knownBy.includes(id)) ? 'shared' : 'own';
}

/**
 * Whose dossiers a fact goes into (in squad order). What the whole squad knew goes to every unit it is about (the world dossier `*` when it
 * is about nobody, or about units who are gone: the squad still reads that one). What only some knew goes to the private part of those it
 * is about who know it; failing that, of those it is about; failing that, of those who know it, so a secret about the world lands in the
 * dossier of each who holds it and the world's private part (which no prompt carries) is used only by a fact nobody living knows.
 */
export function foldTargets(state: CampaignState, fact: Fact): string[] {
  const living = livingNamed(state);
  const known = fact.knownBy.includes('*') ? living : living.filter((id) => fact.knownBy.includes(id));
  const aboutLiving = living.filter((id) => fact.about.includes(id));
  const hit = foldPart(state, fact) === 'shared'
    ? aboutLiving
    : [aboutLiving.filter((id) => known.includes(id)), aboutLiving, known].find((l) => l.length > 0) ?? [];
  return hit.length > 0 ? hit : [WORLD];
}

const folded = (fact: Fact, target: string): boolean => fact.foldedInto?.includes(target) === true;

/** A fact every one of whose targets has it already: nothing is left to fold, so it only waits to be swept. */
const covered = (state: CampaignState, fact: Fact): boolean => (fact.foldedInto?.length ?? 0) > 0 && foldTargets(state, fact).every((t) => folded(fact, t));

/** Removes the facts that were folded into every one of their targets (a target that has died since no longer counts). Called by the fold and by every new fact. */
export function sweepCovered(draft: CampaignState): void {
  if (draft.memory.facts.some((f) => f.foldedInto !== undefined)) draft.memory.facts = draft.memory.facts.filter((f) => !covered(draft, f));
}

export interface FoldDue {
  target: string;
  own: Fact[];
  shared: Fact[];
}

/**
 * The next fold, or null. First, a target with at least `foldBatch` foldable facts it has not had yet (the one with the most; ties in
 * squad order, the world last). Otherwise, when the save holds more than `factsMax` facts, the target with the most. A fact about
 * several units is offered to each of them in turn and stays until all have had it.
 */
export function foldDue(state: CampaignState): FoldDue | null {
  const groups = new Map<string, Fact[]>();
  for (const f of state.memory.facts) {
    if (!isFoldable(state, f)) continue;
    for (const t of foldTargets(state, f)) if (!folded(f, t)) groups.set(t, [...(groups.get(t) ?? []), f]);
  }
  if (groups.size === 0) return null;
  const order = [...state.squad.map((u) => u.id), WORLD];
  const rank = (t: string): number => (order.indexOf(t) === -1 ? order.length : order.indexOf(t));
  const best = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || rank(a[0]) - rank(b[0]))[0];
  if (best[1].length < TUNING.memory.foldBatch && state.memory.facts.length <= memoryConfig(state).factsMax) return null;
  const own = best[1].filter((f) => foldPart(state, f) === 'own');
  return { target: best[0], own, shared: best[1].filter((f) => !own.includes(f)) };
}

const cut = (text: string, max: number): string => text.trim().slice(0, max).trim();

/**
 * Writes the dossier of `target` and removes exactly the facts it replaces. Throws unless `factIds` is the due set (a fact pinned, added
 * or aged since the question was asked makes the answer stale). `own` / `shared` are the new paragraphs; a part with no new facts may
 * be left empty and keeps what it was.
 */
export function applyFold(draft: CampaignState, p: { target: string; own: string; shared: string; factIds: string[] }): void {
  const due = foldDue(draft);
  const dueIds = due ? [...due.own, ...due.shared].map((f) => f.id) : [];
  if (!due || due.target !== p.target || p.factIds.length !== dueIds.length || new Set(p.factIds).size !== dueIds.length || !dueIds.every((id) => p.factIds.includes(id))) {
    throw new Error('memory/fold: that fold is not due (the facts changed)');
  }
  const dossiers = (draft.memory.dossiers ??= {});
  const prev = dossiers[p.target];
  const next = {
    own: due.own.length > 0 ? cut(p.own, TUNING.memory.dossierOwnMax) : cut(p.own, TUNING.memory.dossierOwnMax) || prev?.own || '',
    shared: due.shared.length > 0 ? cut(p.shared, TUNING.memory.dossierSharedMax) : cut(p.shared, TUNING.memory.dossierSharedMax) || prev?.shared || '',
  };
  if ((due.own.length > 0 && next.own === '') || (due.shared.length > 0 && next.shared === '')) throw new Error('memory/fold: a part with facts needs its text');
  dossiers[p.target] = { ...next, day: draft.day, folded: (prev?.folded ?? 0) + dueIds.length };
  // the facts now have this dossier; those that have every one of theirs are removed (a fact about several units waits for the others)
  const had = new Set(dueIds);
  for (const f of draft.memory.facts) if (had.has(f.id)) f.foldedInto = [...(f.foldedInto ?? []), p.target];
  sweepCovered(draft);
}

/**
 * No model, or it failed: the part and the new texts (oldest first) joined, and cut from the front so the newest text stays. The cut
 * never starts in the middle of a word.
 */
export function fallbackFold(part: string, facts: Fact[], max: number): string {
  const at = new Map(facts.map((f, i) => [f.id, i]));
  const texts = [...facts].sort((a, b) => a.day - b.day || at.get(a.id)! - at.get(b.id)!).map((f) => f.text.trim());
  const joined = [part.trim(), ...texts].filter(Boolean).join(' ');
  if (joined.length <= max) return joined;
  let out = joined.slice(joined.length - max);
  if (!/\s/.test(joined[joined.length - max - 1] ?? ' ') && !/^\s/.test(out)) {
    const space = out.search(/\s/);
    out = space === -1 ? out : out.slice(space);
  }
  return out.trim();
}
