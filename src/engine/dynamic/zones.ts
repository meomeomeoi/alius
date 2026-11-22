/**
 * The zones she has shown (P15, plan R20, spec §15.9): a worship target of hers is KNOWN to the commander once a fact says so. The fact is written by
 * the memory rule of `zone_revealed` and carries the tag `zoneTag(target)`, which is the plan's `expect:worship.<target>` in the form the fact store keeps (a tag
 * is lower case `[a-z0-9 '_-]`, so the colon and the dot of the plan's spelling cannot be stored). A leaf: it imports only the state types, so the offer, the
 * mastery and the body map can all ask it.
 */
import type { CampaignState, Fact } from '../state/types';

/** The tag of the facts that reveal a worship target of hers (`expect:worship.<target>` as the fact store spells it). */
export const ZONE_PREFIX = 'expect_worship_';
/** The tag a fact of hers carries when it shows the commander a field of her profile (`expect:<field>` or `expect:<field>.<id>` in the plan's spelling): `expect_<field>` and `expect_<field>_<id>`. */
export const expectTag = (field: string, id?: string): string => `expect_${field}${id === undefined ? '' : `_${id}`}`.toLowerCase().replace(/[^a-z0-9 '_-]/g, '').slice(0, 32);
export const zoneTag = (targetId: string): string => expectTag('worship', targetId);

/** The facts that reveal one target of hers: about her, tagged for the zone. Oldest first. */
export function zoneFacts(facts: readonly Fact[], unitId: string, targetId: string): Fact[] {
  const tag = zoneTag(targetId);
  return facts.filter((f) => f.tags.includes(tag) && f.about.includes(unitId));
}

/** Has a fact shown the commander what she thinks of this target? Reads the facts the commander has (nothing in this game hides a zone fact from the commander). */
export function zoneRevealed(state: Pick<CampaignState, 'memory'>, unitId: string, targetId: string): boolean {
  return zoneFacts(state.memory.facts, unitId, targetId).some((f) => f.hiddenFromCommander !== true);
}
