import type { CampaignState, Fact } from '../state/types';
import { joinNames } from './resolvers';

/**
 * Do all these viewers know it? `knownBy` / `audience` hold unit ids or `'*'` (public). `undefined` is a chronicle entry written
 * before P3b: LOG-only, nobody's prompt may carry it. The commander always knows, so the commander is never one of the viewers.
 */
export function visibleToAll(knownBy: string[] | '*' | undefined, viewers: string[]): boolean {
  if (knownBy === undefined) return false;
  if (knownBy === '*' || knownBy.includes('*')) return true;
  return viewers.every((v) => knownBy.includes(v));
}

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/**
 * One prompt line for a fact that every viewer may see (callers filter with `visibleToAll` / `factsVisibleTo` first):
 * - plain: `- {text}`;
 * - a viewer only heard it: `- (heard as a rumor) {text}`, the model's retelling (`rumor.text`) replacing the text when there is one;
 * - hidden from the commander: `- {names} know (the commander does not): {text}; they do not tell the commander.` (`names` are the
 *   viewers, or whoever knows it when nobody is in a scene).
 */
export function factLine(state: CampaignState, fact: Fact, viewers: string[]): string {
  if (fact.hiddenFromCommander === true) {
    const who = (viewers.length > 0 ? viewers : fact.knownBy.filter((id) => id !== '*')).map((id) => nameOf(state, id));
    const one = who.length === 1;
    return `- ${joinNames(who)} ${one ? 'knows' : 'know'} (the commander does not): ${fact.text.replace(/[.!\s]+$/, '')}; ${one ? 'she does' : 'they do'} not tell the commander.`;
  }
  if (viewers.some((v) => fact.heard?.[v] !== undefined)) return `- (heard as a rumor) ${fact.rumor?.text ?? fact.text}`;
  return `- ${fact.text}`;
}
