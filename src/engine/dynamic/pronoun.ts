/**
 * The one check the dynamic makes of a text a model or a player wrote, for a pronoun for the commander (lore §0: the soldiers are women and the commander has none). A text that has one is
 * dropped, never rewritten. A leaf: no imports.
 */
const COMMANDER_PRONOUN = /\b(he|him|his|himself|he's)\b/i;

/** Whether `text` gives the commander a pronoun. */
export function hasCommanderPronoun(text: string): boolean {
  return COMMANDER_PRONOUN.test(text);
}
