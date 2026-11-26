import type { Entry, Registries } from '../content/types';
import { bandOf, exposedKinds, perceptionWord } from '../engine/physics/stimuli';
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
  if (event.type === 'mouth_act' && event.kind === 'kiss') {
    const her = state.squad.find((u) => u.id === event.unitId)?.displayName ?? 'She';
    return { id: `${PHYSICS_PREFIX}act`, text: `${her} has the commander kiss her, and she takes it as it comes.`, expiresAfter: 'next_reply' };
  }
  if (event.type !== 'physics_outcome') return null;
  if (event.result === 'stopped') return { id: `${BLOCKING_PREFIX}stop`, text: STOP_TEXT, expiresAfter: 'next_reply' };
  const text = OUTCOME[String(event.result)];
  if (text === undefined) return null;
  const her = state.squad.find((u) => u.id === event.holderId)?.displayName;
  const said = her ? text.replace('She ', `${her} `).replace('she ', `${her} `) : text;
  // R28: one sentence of what she perceived over the whole hold (`run.tally`, carried by the outcome)
  const tally = tallySentence((event as { tally?: Record<string, number> }).tally ?? {}, _reg.contactPhysics.get(String(event.physicsId)));
  return { id: `${PHYSICS_PREFIX}end`, text: tally === '' ? said : `${said} ${tally}`, expiresAfter: 'next_reply' };
}

/**
 * P10e-e R28: the words of a tally, by the physics' interaction (never by its id). Each count is said only when it is above 0; a relief is
 * named only once she caught it (`cheatsCaught`), so an uncaught cheat never reaches the model, and an over-hold only once she noticed it (`noticed`;
 * the `strains` count is never said). No pronoun for the commander.
 */
const TALLY_WORDS: Record<string, Partial<Record<string, (n: number) => string>>> = {
  timing: { caught: (n) => `${n} ${n === 1 ? 'opening' : 'openings'} caught`, falseTaken: (n) => `${n} false ${n === 1 ? 'opening' : 'openings'} taken` },
  hold: { slips: (n) => `the hold broke ${times(n)}` },
  order: { slips: (n) => `${n} ${n === 1 ? 'slip' : 'slips'} of the tongue` },
  gesture: { slips: (n) => `the teeth touched her ${times(n)}` },
};
const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const GENERIC: Record<string, (n: number) => string> = {
  caught: (n) => `${n} caught`,
  missed: (n) => `${n} missed`,
  falseTaken: (n) => `${n} taken falsely`,
  noticed: (n) => `held on past her opening ${times(n)}, and she noticed`,
  slips: (n) => `${n} ${n === 1 ? 'slip' : 'slips'}`,
  gasps: (n) => `${n} ${n === 1 ? 'gasp' : 'gasps'}`,
  cheatsCaught: (n) => `she caught ${n} ${n === 1 ? 'cheat' : 'cheats'}`,
};
/** `strains` is never said: an over-hold she did not notice (amount 0.5) is not hers to tell; only `noticed` is. */
const ORDER = ['caught', 'missed', 'falseTaken', 'noticed', 'slips', 'gasps', 'cheatsCaught'];

/** The tally of a run in one sentence (`''` when nothing was counted). */
export function tallySentence(tally: Record<string, number>, phys: Entry | undefined): string {
  const own = TALLY_WORDS[String(phys?.interaction ?? '')] ?? {};
  const parts: string[] = [];
  for (const k of ORDER) {
    const n = tally[k] ?? 0;
    if (n <= 0) continue;
    parts.push((own[k] ?? GENERIC[k]!)(n));
  }
  return parts.length === 0 ? '' : `Over the whole hold: ${parts.join(', ')}.`;
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
  const style = leadStyle(physicsStyleOf(state, run.holderId, reg)).key;
  const source = run.sourceKind === 'contact' ? reg.blockingContacts.get(run.sourceId) : reg.blockingItems.get(run.sourceId);
  const what = String(source?.label ?? run.sourceId).toLowerCase();
  const also = run.second ? ` and ${String(reg.contactPhysics.get(run.second.physicsId)?.label ?? run.second.physicsId).toLowerCase()} at once` : '';
  const parts = [`${name} has the commander in a hold (${what}${also}); her rhythm is ${RHYTHM[style] ?? RHYTHM.neutral}.`, EXPECTS[effectiveHoldsUntil(state, reg, run.holderId)]];
  if (run.marathon?.summary !== undefined) parts.push(run.marathon.summary);
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

/**
 * What reaches the commander through the senses while a contact or an item exposes a stimulus: the kind's line for the stage the record has
 * reached (`physics:perception`, derived). Perception only: never what the commander thinks or feels. A faint scent that tolerance has worn
 * past is not mentioned. `null` when nothing is exposed or nothing reaches.
 */
export function perceptionLines(state: CampaignState, reg: Registries): Directive | null {
  const lines = exposedKinds(state, reg).flatMap((ex) => {
    const w = perceptionWord(state, reg, ex.kind, bandOf(state, reg, ex));
    return w === null ? [] : [w.replace(/[.\s]+$/, '')];
  });
  return lines.length === 0 ? null : { id: `${PHYSICS_PREFIX}perception`, text: `What reaches the commander: ${lines.join('; ')}.`, expiresAfter: 'manual' };
}

/** Counted kisses that wait for the commander's count: how many she asked for and whether she has been made to start again. `null` otherwise. */
export function actLines(state: CampaignState, _reg: Registries): Directive | null {
  const act = state.scene?.act;
  if (!act) return null;
  const her = state.squad.find((u) => u.id === (state.scene!.participants[0]))?.displayName ?? 'She';
  const again = act.tries > 0 ? ' The count went wrong and starts again.' : '';
  return { id: `${PHYSICS_PREFIX}act`, text: `${her} has the commander count kisses for her: she asked for ${act.n}.${again}`, expiresAfter: 'manual' };
}

/** Sets or clears the derived `physics:` directive for the open scene (call with every context refresh). */
export function refreshPhysicsDirectives(builder: ContextBuilder, state: CampaignState | null, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith(PHYSICS_PREFIX) && d.expiresAfter === 'manual');
  const d = state ? physicsLines(state, reg) : null;
  if (d) builder.setDirective(d);
  const p = state ? perceptionLines(state, reg) : null;
  if (p) builder.setDirective(p);
  const a = state ? actLines(state, reg) : null;
  if (a) builder.setDirective(a);
}

/** Every `physics:` directive goes (the scene ended, the chat switched, no campaign). */
export function clearPhysicsDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith(PHYSICS_PREFIX));
}
