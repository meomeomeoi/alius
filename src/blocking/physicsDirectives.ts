import type { Registries } from '../content/types';
import type { EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder, Directive } from '../llm/context';
import { BLOCKING_PREFIX } from './directives';

/**
 * The directives of the contact physics (P15a). `blocking:stop` lasts one reply and is set by the stop word: she stops now, in character.
 * (The `physics:<id>` directive is derived from the run, see `physicsLines`.) No text gives the commander a pronoun (lore §0).
 */
export const STOP_TEXT = 'The commander used the stop word. She stops what she is doing now; she may react in character, but she lets go.';

/** The directive an event sets, or `null`. */
export function physicsDirective(event: EngineEvent, _state: CampaignState, _reg: Registries): Directive | null {
  if (event.type === 'physics_outcome' && event.result === 'stopped') return { id: `${BLOCKING_PREFIX}stop`, text: STOP_TEXT, expiresAfter: 'next_reply' };
  return null;
}

/** Sets the directives the events of one dispatch call for. Returns whether any was set. */
export function applyPhysicsDirectives(builder: ContextBuilder, events: readonly EngineEvent[], state: CampaignState | null, reg: Registries): boolean {
  if (state === null) return false;
  let any = false;
  for (const e of events) {
    const d = physicsDirective(e, state, reg);
    if (d) {
      builder.setDirective(d);
      any = true;
    }
  }
  return any;
}
