import type { Registries } from '../content/types';
import { blockingLive, COMMANDER, personEffects, type BlockingEffect } from '../engine/blocking';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';

/**
 * The directives of the scene blocking (P15a). Every id starts with `blocking:` (none is a prefix an older package reserves), all are
 * `manual` and derived from the state on every refresh, gone when the blocking is not live, the scene ends or the chat switches.
 *  - `blocking:scene`: the hard limits (what cannot be said or done), one sentence per person with an `input` or a `mobility` effect.
 *  - `blocking:pov`: the commander cannot see (a `perception others obscured` or a `camera pov_dark`): narrate by hearing, touch and smell.
 *  - `blocking:stop`: set by the physics layer for one reply after the stop word.
 * No text gives the commander a pronoun (lore §0).
 */
export const BLOCKING_PREFIX = 'blocking:';

const SPEECH: Record<string, string> = {
  muffled: 'cannot speak words, only muffled sounds',
  no_speech: 'cannot speak words, only sounds',
  gestures_only: 'can only gesture, not speak',
  action_only: 'can only act, not speak',
  no_hands: 'cannot use the hands',
};
const garbled = (strength: number | undefined): string =>
  strength === 3 ? 'cannot be understood: every word comes out garbled' : strength === 2 ? 'is badly garbled when speaking' : 'is garbled when speaking';
const MOVEMENT: Record<string, string> = {
  none: 'cannot move: held in place',
  limited: 'has limited movement',
  crawl: 'can only crawl',
  follows: 'can only stay at her side, led',
};

/**
 * P10e-e (review M5, re-review m3): while the jaw instrument is drawn for a ring held in the mouth, the commander's line goes out as it came out
 * of the mouth (`speech.ts`) and she understands what came out clearly (jaw.html's fair listening): the garbled limit says so. Only then: when
 * the card plays the jaw (the line goes out as typed), the item's own "cannot be understood" stands. The caller says whether it is drawn.
 */
export const THROUGH_THE_RING = 'speaks through a ring that holds the mouth open: what comes out clearly can be understood, the rest comes out garbled';

/** What one person is limited to, as the words of a sentence (empty when nothing limits her). */
function limitWords(effects: BlockingEffect[], ring = false): string[] {
  const out: string[] = [];
  for (const e of effects) {
    if (e.type === 'input') out.push(e.limit === 'garbled' ? (ring ? THROUGH_THE_RING : garbled(e.strength)) : SPEECH[e.limit] ?? '');
    else if (e.type === 'mobility') out.push(MOVEMENT[e.level] ?? '');
  }
  return [...new Set(out.filter((w) => w !== ''))];
}

/** The `blocking:scene` sentences of the open scene, in participant order, then the commander. */
export function limitSentences(state: CampaignState, reg: Registries, ringHeard = false): string[] {
  const out: string[] = [];
  for (const id of [...(state.scene?.participants ?? []), COMMANDER]) {
    const words = limitWords(personEffects(state, reg, id), id === COMMANDER && ringHeard);
    if (words.length === 0) continue;
    const name = id === COMMANDER ? 'The commander' : state.squad.find((u) => u.id === id)?.displayName ?? id;
    out.push(`${name} ${words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`}.`);
  }
  return out;
}

export const POV_TEXT = 'Narrate only what the commander can hear, feel and smell; do not describe how anyone looks.';

/** Sets or clears the derived directives for the open scene (call with every context refresh). */
export function refreshBlockingDirectives(builder: ContextBuilder, state: CampaignState | null, reg: Registries, opts: { ringHeard?: boolean } = {}): void {
  const live = state !== null && blockingLive(state, reg);
  const sentences = live ? limitSentences(state, reg, opts.ringHeard === true) : [];
  if (sentences.length > 0) builder.setDirective({ id: `${BLOCKING_PREFIX}scene`, text: sentences.join(' '), expiresAfter: 'manual' });
  else builder.clearDirective(`${BLOCKING_PREFIX}scene`);
  const commander = live ? personEffects(state, reg, COMMANDER) : [];
  const blind = commander.some((e) => (e.type === 'perception' && e.others === 'obscured') || (e.type === 'camera' && e.mode === 'pov_dark'));
  if (blind) builder.setDirective({ id: `${BLOCKING_PREFIX}pov`, text: POV_TEXT, expiresAfter: 'manual' });
  else builder.clearDirective(`${BLOCKING_PREFIX}pov`);
}

/** Every `blocking:` directive goes (the scene ended, the chat switched, no campaign). */
export function clearBlockingDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith(BLOCKING_PREFIX));
}
