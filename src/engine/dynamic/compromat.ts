/**
 * Compromat (P15, plan R24, spec §11): what a holder quietly keeps of the commander's, as facts. A fact is compromat when it carries the tags
 * `compromat` and `holder:<id>`; it is hidden from the commander and known to her alone (`knownBy`), so no reading, count or hint shows it
 * (`Knowledge` already hides `hiddenFromCommander`) until she mentions it herself: the model reports `compromat_mentioned { factId?, summary }` and
 * `mentionCompromat` turns the matching fact, or a new one, known to the commander. Blackmail (`aftermath.ts`) uses one: a refused demand tells the
 * squad (`tellCompromat`). The writers are at their sites (a vow sworn before others, a bypass she found out, a Leash filed on her, an offer mocked
 * before others); a fact written here is no memory rule (it is the fact). Never draws.
 *
 * A leaf of the dynamic: it imports only the fact store, the state types and the tuning.
 */
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { factTextMax } from '../memory/config';
import { addFact } from '../memory/facts';
import type { CampaignState, Fact } from '../state/types';

export const COMPROMAT_TAG = 'compromat';
export const holderTag = (holderId: string): string => `holder:${holderId}`;
/** A pronoun for the commander (lore §0): a text that has one is dropped, never rewritten. */
const COMMANDER_PRONOUN = /\b(he|him|his|himself|he's)\b/i;
const MENTIONED = 'mentioned';

/** What the holder keeps of the commander's, oldest first. Includes what she has already mentioned (it is still hers). */
export function compromatOf(state: Pick<CampaignState, 'memory'>, holderId: string): Fact[] {
  return state.memory.facts.filter((f) => f.tags.includes(COMPROMAT_TAG) && f.tags.includes(holderTag(holderId)));
}

/**
 * She keeps something of the commander's: a hidden fact about the commander (and the `witnesses` who saw it), known to her alone. The text is the
 * caller's (authored, no pronoun for the commander). A text she already keeps is not written twice.
 */
export function addCompromat(draft: CampaignState, holderId: string, text: string, witnesses: readonly string[]): Fact {
  return tagHolder(addFact(draft, {
    about: ['commander', ...new Set(witnesses.filter((id) => id !== holderId))], text, tags: [COMPROMAT_TAG], importance: 4, day: draft.day,
    knownBy: [holderId], hiddenFromCommander: true,
  }), holderId);
}

/** The fact store keeps plain tags (`:` is not one), so the holder's own tag is put on after: `holder:<id>`. */
function tagHolder(fact: Fact, holderId: string): Fact {
  if (!fact.tags.includes(holderTag(holderId))) fact.tags.push(holderTag(holderId));
  return fact;
}

/** The words of a text worth matching on (four letters or more, lower case). */
const wordsOf = (text: string): Set<string> => new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []));

/** How much of the summary a fact's text says: shared words over the summary's own (0…1). */
function overlap(summary: string, factText: string): number {
  const mine = wordsOf(summary);
  if (mine.size === 0) return 0;
  const theirs = wordsOf(factText);
  let shared = 0;
  for (const w of mine) if (theirs.has(w)) shared++;
  return shared >= 2 || shared / mine.size >= 0.5 ? shared / mine.size : 0;
}

/** The commander learns what she holds, because she said it (`compromat_revealed`). A fact that is already known changes nothing. */
function reveal(fact: Fact, holderId: string): EngineEvent[] {
  if (fact.hiddenFromCommander !== true) return [];
  delete fact.hiddenFromCommander;
  if (!fact.tags.includes(MENTIONED)) fact.tags.push(MENTIONED);
  return [{ type: 'compromat_revealed', unitId: holderId, factId: fact.id }];
}

/**
 * She spoke of what she holds (the model's `compromat_mentioned`). The fact it names (`factId`, hers) or the one the summary says (the best match
 * by shared words) turns known to the commander. With no match, the summary becomes a new fact she holds that the commander knows: cut to the fact
 * length, and dropped whole when it has a pronoun for the commander (a text is never rewritten). Nothing for an empty summary with nothing named.
 */
export function mentionCompromat(draft: CampaignState, _ctx: unknown, holderId: string, factId?: string, summary?: string): EngineEvent[] {
  const mine = compromatOf(draft, holderId);
  const named = factId === undefined ? undefined : mine.find((f) => f.id === factId);
  if (named !== undefined) return reveal(named, holderId);
  const text = (summary ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text === '') return [];
  let best: { fact: Fact; score: number } | undefined;
  for (const f of mine) {
    const score = overlap(text, f.text);
    if (score > 0 && (best === undefined || score > best.score)) best = { fact: f, score };
  }
  if (best !== undefined) return reveal(best.fact, holderId);
  if (COMMANDER_PRONOUN.test(text)) return [];
  const fact = tagHolder(addFact(draft, { about: ['commander'], text: text.slice(0, factTextMax(draft)), tags: [COMPROMAT_TAG, MENTIONED], importance: 3, day: draft.day, knownBy: [holderId] }), holderId);
  return [{ type: 'compromat_revealed', unitId: holderId, factId: fact.id }];
}

/** The compromat a blackmail threat carries: her oldest one (the same one every time), or `null` when she holds none. */
export function threatFactOf(state: Pick<CampaignState, 'memory'>, holderId: string): Fact | null {
  return compromatOf(state, holderId)[0] ?? null;
}

/**
 * Her threat is carried out (a refused demand): every living named soldier learns it, the commander learns that they do, and with the outside as the
 * audience and `public_humiliation` switched on the fact also spreads as a fast rumor (P3b). Nothing is written about the outside's own view.
 */
export function tellCompromat(draft: CampaignState, holderId: string, threat: { factId: string; audience: 'squad' | 'outside' }, outsideOpen: boolean): EngineEvent[] {
  const fact = draft.memory.facts.find((f) => f.id === threat.factId);
  if (fact === undefined) return [];
  for (const u of draft.squad) if (u.kind === 'named' && isLiving(u) && !fact.knownBy.includes(u.id)) fact.knownBy.push(u.id);
  delete fact.hiddenFromCommander;
  if (threat.audience === 'outside' && outsideOpen) fact.spread = 'fast';
  return [{ type: 'compromat_told', unitId: holderId, factId: fact.id, audience: threat.audience }];
}

/**
 * The commander filed a Leash request on her (carried out, denied or held by her own block): she saw it, and so did whoever was in the scene. Hers
 * to keep. The text carries no number, so a directive may quote it.
 */
export function noteLeashOnHer(draft: CampaignState, holderId: string): Fact {
  const witnesses = (draft.scene?.participants ?? []).filter((id) => id !== holderId && draft.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));
  return addCompromat(draft, holderId, `AUTHOR TO WRITE: ${draft.squad.find((u) => u.id === holderId)?.displayName ?? 'She'} saw the commander file the Leash against her.`, witnesses);
}
