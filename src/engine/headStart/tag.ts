/**
 * The tag a head start fact carries besides `head_start`: one per moment kind, so a reroll and the card find the fact of a moment by what it
 * is, never by its position (the player may have forgotten or merged one). A leaf: the memory resolver imports it. It follows the tag
 * normalization of `addFact` (lower case, `[a-z0-9 '_-]`, at most 32 characters), so what the resolver writes is what is searched for.
 */
export const momentTag = (kind: string): string => `hs_${kind}`.toLowerCase().replace(/[^a-z0-9 '_-]/g, '').slice(0, 32);
