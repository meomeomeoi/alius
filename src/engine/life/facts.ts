import { addFact } from '../memory';
import type { CampaignState, Fact } from '../state/types';
import { UNTOLD_TAG } from './state';

/** The tag every fact of her life carries (with `untold` until the commander is told, and the id of the event, hobby or topic it is about). */
export const LIFE_TAG = 'life';

/** A content text without its `AUTHOR TO WRITE:` marker (the draft texts carry it until the author writes them). */
export const plainText = (text: string): string => text.replace(/^\s*AUTHOR TO WRITE:\s*/, '').trim();

/**
 * Writes a fact of her life: about her, known to her alone, hidden from the commander and tagged `life` and `untold` (so no prompt retrieves
 * it) until it is told. The text is written once; a text that already stands for her (a second event of the same kind) is the same fact.
 */
export function writeLifeFact(draft: CampaignState, unitId: string, text: string, tags: readonly string[], importance: Fact['importance']): Fact {
  return addFact(draft, {
    about: [unitId], text, tags: [LIFE_TAG, UNTOLD_TAG, ...tags], importance, day: draft.day, knownBy: [unitId], hiddenFromCommander: true,
  });
}

/**
 * The commander learns the fact (it was told in a DM, in a note or in a scene): it stops being hidden and untold, and prompts may retrieve it.
 * `false` when there is no such fact or nothing to reveal.
 */
export function revealFact(draft: CampaignState, factId: string): boolean {
  const fact = draft.memory.facts.find((f) => f.id === factId);
  if (!fact) return false;
  const was = fact.hiddenFromCommander === true || fact.tags.includes(UNTOLD_TAG);
  delete fact.hiddenFromCommander;
  fact.tags = fact.tags.filter((t) => t !== UNTOLD_TAG);
  return was;
}
