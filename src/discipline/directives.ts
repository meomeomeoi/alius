import type { Entry, Registries } from '../content/types';
import type { LoyaltyBand } from '../engine/state/types';
import type { Directive } from '../llm/context';

/** The P6 sentence a unit on the edge of leaving adds to whatever her stance says. */
const LEAVING = 'She is close to leaving the unit: if pressed she says she is thinking of going.';

const fill = (text: unknown, vars: Record<string, string>): string =>
  Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), String(text ?? ''));

/** What the main model is told about how a unit relates to the commander's authority (replaces the loyalty band text). */
export function stanceDirective(unitId: string, name: string, entry: Entry, band: LoyaltyBand): Directive {
  const text = fill(entry.directive, { name });
  return { id: `loyalty:${unitId}`, expiresAfter: 'scene', text: band === 'breaking' ? `${text} ${LEAVING}` : text };
}

/** A refused order, in the form her stance gives it (open, formal, her own way, or a quiet stall). Same id as the P6 refusal. */
export function stanceRefusalDirective(unitId: string, name: string, entry: Entry, reason: string): Directive {
  return { id: `refusal:${unitId}`, expiresAfter: 'scene', text: fill(entry.refusal, { name, reason }) };
}

/** The threat that was just made and what she makes of it: for the next reply only. */
export function threatDirective(unitId: string, name: string, label: string, believed: boolean): Directive {
  return {
    id: `threat:${unitId}`, expiresAfter: 'next_reply',
    text: believed
      ? `${name} believes the commander's threat (${label}) will be carried out.`
      : `${name} does not believe the commander's threat (${label}) will be carried out, and it shows.`,
  };
}

/** A menu punishment just imposed: for her next reply only (a punishment read from dialogue needs none, her reply already reacted). */
export function punishDirective(unitId: string, name: string, label: string, stanceName: string): Directive {
  return { id: `discipline:${unitId}`, expiresAfter: 'next_reply', text: `The commander has imposed ${label} on ${name}. React in character; stance: ${stanceName}.` };
}

/** A demand she is pressing in this scene (from the state, so it survives a reload and a chat switch). */
export function demandDirective(unitId: string, name: string, text: string): Directive {
  return { id: `demand:${unitId}`, expiresAfter: 'scene', text: `${name} demands something of the commander and presses it this scene: "${text}"` };
}

/** The first time a unit calls the commander by a new nickname (private scene, her next reply only). */
export function nicknameDirective(unitName: string, nickname: string): Directive {
  return { id: 'nickname', expiresAfter: 'next_reply', text: `${unitName} calls the commander "${nickname}" for the first time.` };
}

/** What an active nickname's own text tells the model for as long as the nickname is held (scene-long). */
export function reputationDirective(id: string, text: string): Directive {
  return { id: `reputation:${id}`, expiresAfter: 'scene', text };
}

/** The label of a measure: a punishment's own, the Leash, or the generic word for a threat that named nothing. */
export function measureLabel(reg: Registries, measure: string): string {
  if (measure === 'leash') return 'The Leash';
  const label = reg.punishments.get(measure)?.label;
  return typeof label === 'string' && label !== '' ? label : 'Consequences';
}
