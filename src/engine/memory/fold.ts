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

/**
 * Whose dossier a fact goes into. A fact about one unit goes to her; about several, to the first of them in squad order who knows it
 * (or, when it is public, the first of them): the simple rule, so a fact is folded once (the spec's "into each unit's dossier" is an
 * open item). A fact about nobody, or about units who are gone, goes to the world dossier, where the whole squad still reads it.
 */
export function foldTarget(state: CampaignState, fact: Fact): string {
  const living = livingNamed(state);
  const knows = (id: string): boolean => fact.knownBy.includes('*') || fact.knownBy.includes(id);
  const hit = living.find((id) => fact.about.includes(id) && knows(id));
  return hit ?? WORLD;
}

/** `shared` when the whole squad knew it (or it was public), else `own`. */
export function foldPart(state: CampaignState, fact: Fact): 'own' | 'shared' {
  return fact.knownBy.includes('*') || livingNamed(state).every((id) => fact.knownBy.includes(id)) ? 'shared' : 'own';
}

export interface FoldDue {
  target: string;
  own: Fact[];
  shared: Fact[];
}

/**
 * The next fold, or null. First, a target with at least `foldBatch` foldable facts (the one with the most; ties in squad order,
 * the world last). Otherwise, when the save holds more than `factsMax` facts, the target with the most foldable ones.
 */
export function foldDue(state: CampaignState): FoldDue | null {
  const groups = new Map<string, Fact[]>();
  for (const f of state.memory.facts) {
    if (!isFoldable(state, f)) continue;
    const t = foldTarget(state, f);
    groups.set(t, [...(groups.get(t) ?? []), f]);
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
  const gone = new Set(dueIds);
  draft.memory.facts = draft.memory.facts.filter((f) => !gone.has(f.id));
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
