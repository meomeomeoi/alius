import type { Registries } from '../content/types';
import type { EngineEvent } from '../engine/dispatch';
import { momentsOf } from '../engine/moments/state';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder, Directive } from '../llm/context';

/**
 * The `moment:<sourceId>` directive (P15a): the tension when a moment fires, and what the commander chose when it is answered. It lasts one
 * reply (`next_reply`, so a moment never turns into standing text); a lapse has no directive. Ids start with `moment:` (none is a prefix an
 * older package reserves). No text gives the commander a pronoun (lore §0).
 */
export const MOMENT_PREFIX = 'moment:';

/** What an added option (not one of the frame's three) says it is, as a verb phrase. AUTHOR TO WRITE. */
export const ADDITION_WORDS: Record<string, string> = {
  lock: 'ask her to lock the door',
  look: 'ask her with a look',
  ally: 'look at an ally',
};

const plain = (text: string): string => text.replace(/^\s*AUTHOR TO WRITE:\s*/, '').trim().replace(/[.\s]+$/, '');
const GAP_WORDS = { matched: 'what she expected', partial: 'only partly what she expected', opposite: 'the opposite of what she expected' } as const;

/** The words of an option: the frame's generic word, or the addition's. */
export function genericWord(reg: Registries, sourceId: string, key: string): string {
  const frame = reg.momentSources.get(sourceId)?.frame as Array<{ generic: string }> | undefined;
  return ['0', '1', '2'].includes(key) ? frame?.[Number(key)]?.generic ?? key : ADDITION_WORDS[key] ?? key;
}

/** The directive an event of the moments sets, or `null` (every other event, a moment that no longer exists). */
export function momentDirective(event: EngineEvent, state: CampaignState, reg: Registries): Directive | null {
  const { open, lastAnswer: a } = momentsOf(state.scene);
  const name = (id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
  if (event.type === 'moment_fired' && open !== undefined && open.id === event.momentId) {
    const source = reg.momentSources.get(open.sourceId);
    if (!source) return null;
    const exposing = open.exposing !== undefined ? ` ${open.exposing} may give the commander away.` : '';
    return { id: `${MOMENT_PREFIX}${open.sourceId}`, expiresAfter: 'next_reply', text: `A moment of tension: ${plain(String(source.description))}.${exposing}` };
  }
  if (event.type === 'moment_answered' && a !== undefined && a.momentId === event.momentId) {
    const word = genericWord(reg, a.sourceId, a.key);
    const hint = a.verb !== undefined ? ` ${String(reg.escalationVerbs.get(a.verb)?.promptHint ?? '').trim()}` : '';
    return {
      id: `${MOMENT_PREFIX}${a.sourceId}`, expiresAfter: 'next_reply',
      text: `The commander chose to ${word}. ${name(a.unitId)} takes it as ${GAP_WORDS[a.gap]}; she answers in character.${hint}`,
    };
  }
  return null;
}

/** Sets the directives the events of one dispatch call for. Returns whether any was set. */
export function applyMomentDirectives(builder: ContextBuilder, events: readonly EngineEvent[], state: CampaignState | null, reg: Registries): boolean {
  if (state === null) return false;
  let any = false;
  for (const e of events) {
    const d = momentDirective(e, state, reg);
    if (d) {
      builder.setDirective(d);
      any = true;
    }
  }
  return any;
}

/** Every `moment:` directive goes (the scene ended, the chat switched, no campaign). */
export function clearMomentDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith(MOMENT_PREFIX));
}

