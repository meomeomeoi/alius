import type { Registries } from '../content/types';
import { lifeMode, pendingNews } from '../engine/life';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder, Directive } from '../llm/context';

const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * What the main model is told about her life (P14c). Every id starts with `life:`; none starts with a prefix an older package reserves.
 * All of them are derived from the state on every refresh, so they follow a reload and a chat switch needs only `clearLifeDirectives`. They
 * follow the prompt-hygiene rule: set only while a trigger holds, worded "if it fits ... once", and gone after her scene or once the item is
 * told (the engine closes it). The engine decides what is true; this layer only words it. No text gives the commander a pronoun (lore §0).
 */

/** The prefix of every directive of her life (the news, and later the opinions, jokes and pastimes). */
export const LIFE_DERIVED = ['life:'] as const;

export const NEWS_PREFIX = 'life:news:';

/**
 * Derived directives for the women in the scene (`present`):
 *  - `life:news:<unitId>`: the oldest thing she has to tell the commander and has not (an item the queue delivered as a directive). A
 *    stale item reads as a passing mention ("recently").
 * Nothing while life is off.
 */
export function lifeDirectives(state: CampaignState, _reg: Registries, present: string[]): Directive[] {
  if (lifeMode(state) === 'off') return [];
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    if (!unit || unit.kind !== 'named') continue;
    const first = pendingNews(state, id)[0];
    if (!first) continue;
    const name = unit.displayName;
    const raw = clean(first.text);
    const what = raw.startsWith(`${name}: `) ? raw.slice(name.length + 2) : raw;
    out.push({
      id: `${NEWS_PREFIX}${id}`, expiresAfter: 'scene',
      text: first.passing === true
        ? `If it fits, ${name} may mention in passing something that happened to her recently: ${what} A word or two, once.`
        : `If it fits, ${name} may tell the commander about something that happened to her: ${what} Once, in her own words.`,
    });
  }
  return out;
}

/** Drops every directive this layer owns (a chat switch, no campaign, a scene that closed). */
export function clearLifeDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => LIFE_DERIVED.some((p) => d.id.startsWith(p)));
}

/** Sets the derived directives and drops the ones that no longer hold. Called on every refresh. */
export function refreshLifeDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  clearLifeDirectives(builder);
  for (const d of lifeDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
