import type { Registries } from '../content/types';
import { effectiveHoldsUntil, leadStyle, physicsStyleOf } from '../engine/physics/style';
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
export function physicsDirective(event: EngineEvent, state: CampaignState, _reg: Registries): Directive | null {
  if (event.type !== 'physics_outcome') return null;
  if (event.result === 'stopped') return { id: `${BLOCKING_PREFIX}stop`, text: STOP_TEXT, expiresAfter: 'next_reply' };
  const text = OUTCOME[String(event.result)];
  if (text === undefined) return null;
  const her = state.squad.find((u) => u.id === event.holderId)?.displayName;
  return { id: `${PHYSICS_PREFIX}end`, text: her ? text.replace('She ', `${her} `).replace('she ', `${her} `) : text, expiresAfter: 'next_reply' };
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

/** The `physics:` prefix: the run's own directive is derived from it (`physics:<physicsId>`), and an outcome's sentence is `physics:end`. */
export const PHYSICS_PREFIX = 'physics:';

/** How a holder's rhythm reads in words, by her lead style (AUTHOR TO WRITE). */
const RHYTHM: Record<string, string> = {
  neutral: 'even', cold: 'even and predictable', ritual: 'measured and counted', clinical: 'measuring, to test what the commander has learned', possessive: 'tight and close',
  playful: 'teasing, with false openings', cruel: 'short and hard', obsessive: 'irregular', drill: 'even and counted aloud', regal: 'slow, in her own time',
  vindictive: 'sparse and long', affectionate: 'gentle',
};
const EXPECTS = {
  signal: 'She lets go at a tap or when the commander is nearly spent.',
  limit: 'She holds to a limit: she ignores the first tap and lets go only near the end.',
  blackout: 'She holds on and ignores every tap.',
} as const;
const MOVE: Record<string, string> = {
  press: 'she presses harder', lift: 'she eases off', rhythm: 'she changes her rhythm', asleep: 'she dozes off', forgets: 'she does not let go yet',
};

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The directive of a running hold, derived from the run and never stored (`physics:<id>`, manual): her rhythm in words, what she expects (what
 * she holds the commander until) and what the last stretch came to. It describes her and the body; no line states what the commander feels
 * (spec §16.1), and none gives the commander a pronoun. `null` while no run is open.
 */
export function physicsLines(state: CampaignState, reg: Registries): Directive | null {
  const run = state.scene?.physics;
  if (!state.scene || !run) return null;
  const name = state.squad.find((u) => u.id === run.holderId)?.displayName ?? run.holderId;
  const style = leadStyle(physicsStyleOf(state, run.holderId)).key;
  const source = run.sourceKind === 'contact' ? reg.blockingContacts.get(run.sourceId) : reg.blockingItems.get(run.sourceId);
  const what = String(source?.label ?? run.sourceId).toLowerCase();
  const also = run.second ? ` and ${String(reg.contactPhysics.get(run.second.physicsId)?.label ?? run.second.physicsId).toLowerCase()} at once` : '';
  const parts = [`${name} has the commander in a hold (${what}${also}); her rhythm is ${RHYTHM[style] ?? RHYTHM.neutral}.`, EXPECTS[effectiveHoldsUntil(state, reg, run.holderId)]];
  const last = run.last;
  if (last) {
    const said: string[] = [];
    if (last.caught > 0) said.push(`${count(last.caught, 'opening', 'openings')} caught`);
    if (last.missed > 0) said.push(`${last.missed} missed`);
    if (last.falseTaken > 0) said.push('a false opening taken');
    if (last.slips > 0) said.push(count(last.slips, 'a slip', 'slips'));
    if (last.gasps > 0) said.push('a gasp');
    if (last.reliefs > 0) said.push('a relief taken');
    if (last.noise > 0) said.push('some noise');
    if (last.warning) said.push('close to the limit');
    if (said.length > 0) parts.push(`Last stretch: ${said.join(', ')}.`);
    if (last.move !== undefined && MOVE[last.move] !== undefined) parts.push(`Next: ${MOVE[last.move]}.`);
  }
  return { id: `${PHYSICS_PREFIX}${run.physicsId}`, text: parts.join(' '), expiresAfter: 'manual' };
}

const OUTCOME: Record<string, string> = {
  released: 'She lets go.', checked: 'She checks the work and is done.', collapse: 'The commander gives out and she lets go.',
  limit_broken: 'The commander is pushed past the limit before she lets go.', blackout: 'The commander blacks out.',
};

/** Sets or clears the derived `physics:` directive for the open scene (call with every context refresh). */
export function refreshPhysicsDirectives(builder: ContextBuilder, state: CampaignState | null, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith(PHYSICS_PREFIX) && d.expiresAfter === 'manual');
  const d = state ? physicsLines(state, reg) : null;
  if (d) builder.setDirective(d);
}

/** Every `physics:` directive goes (the scene ended, the chat switched, no campaign). */
export function clearPhysicsDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith(PHYSICS_PREFIX));
}
