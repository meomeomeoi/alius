import type { Registries } from '../content/types';
import { frameRank } from '../engine/blocking/state';
import { aftermathRowOf } from '../engine/dynamic/aftermath';
import { hasCapability } from '../engine/dynamic/capabilities';
import { compromatOf } from '../engine/dynamic/compromat';
import { herPracticeLive, dynamicOn, holdersAtPlay } from '../engine/dynamic/gate';
import { leashBlockOf } from '../engine/dynamic/leashBlock';
import { frameEntry } from '../engine/dynamic/hold';
import { sceneProbe } from '../engine/dynamic/probes';
import { dynamicOf } from '../engine/dynamic/state';
import { reactionOf, type Reaction } from '../engine/dynamic/witness';
import { regardTone } from '../engine/dynamic/regard';
import { disappointedSince } from '../engine/dynamic/shame';
import { leadingStyle } from '../engine/dynamic/style';
import type { DynamicDomainEntry, DynamicMilestoneEntry, PracticeStyleEntry, ProbeAxisEntry } from '../engine/dynamic/types';
import { isLiving } from '../engine/economy';
import type { CampaignState, Unit } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import { describeOrder } from '../engine/warden';
import type { ContextBuilder, Directive } from '../llm/context';

const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const sentence = (text: string): string => clean(text).replace(/[.\s]+$/, '');

/**
 * What the main model is told about the dynamic (P15, plan R23). Every id starts with `dynamic:`; none starts with a prefix an older package
 * reserves. All of them are derived from the state on every refresh (never stored), so they follow a reload and a chat switch needs only
 * `clearDynamicDirectives`. They follow the prompt-hygiene rule: a probe line lasts one scene and goes once it is answered, a holder line holds
 * while she is in the room, none is a standing description of the commander, and none carries a number. They tell the model what SHE does and
 * expects; no line states what the commander feels and none gives the commander a pronoun (lore §0, Ruling E).
 */

/** The prefix of every directive of the dynamic (the holder, the probe, and later the offer, aftermath, Leash block, command, witness and disappointment lines). */
export const DYNAMIC_PREFIX = 'dynamic:';
export const PROBE_PREFIX = 'dynamic:probe:';
export const COMMAND_PREFIX = 'dynamic:command:';
export const WITNESS_PREFIX = 'dynamic:witness:';
export const AFTERMATH_PREFIX = 'dynamic:aftermath:';
export const LEASH_BLOCK_PREFIX = 'dynamic:leash_block:';
export const DISAPPOINTED_PREFIX = 'dynamic:disappointed:';
/** The line of an offer the commander made, for her next reply only (event-driven like P15a's `moment:`: `applyOfferDirectives`; a refresh leaves it alone). */
export const OFFER_PREFIX = 'dynamic:offer:';

/** Her style pair in words, the secondary's side named while it leads. */
function styleLine(state: CampaignState, reg: Registries, unit: Unit): string {
  const pair = unit.bond?.practice?.style;
  if (pair === undefined) return '';
  const label = (key: string): string => clean(String((reg.practiceStyles.get(key) as unknown as PracticeStyleEntry | undefined)?.label ?? key)).toLowerCase();
  const lead = leadingStyle(state, reg, unit.id);
  const base = pair.secondary === undefined ? `Her manner is ${label(pair.primary)}.` : `Her manner is ${label(pair.primary)}, with a ${label(pair.secondary)} streak.`;
  return lead.phaseLead === 'secondary' ? `${base} Her ${label(lead.key)} side comes through now.` : base;
}

/**
 * The directive of a holder who is in the room: at `play` or beyond, the frame, what she has claimed, her manner and what she waits to answer;
 * before the first frame, only the open milestone she waits on (her manner too), so the scene that carries it can bring it up.
 */
function holderDirective(state: CampaignState, reg: Registries, unit: Unit): Directive | null {
  const dyn = dynamicOf(state, unit.id);
  const frame = dyn === undefined ? undefined : frameEntry(reg, dyn.frame);
  const waiting = state.dynamic?.open.milestones.find((m) => m.unitId === unit.id);
  const asking = state.dynamic?.open.claims.find((c) => c.unitId === unit.id);
  const holds = dyn !== undefined && frameRank(dyn.frame) >= frameRank('play');
  if (dyn === undefined || frame === undefined || (!holds && waiting === undefined)) return null;
  const name = unit.displayName;
  const claimed = dyn.domains
    .map((d) => (reg.dynamicDomains.get(d.id) as unknown as DynamicDomainEntry | undefined)?.promptHint)
    .filter((h): h is string => typeof h === 'string')
    .map(sentence);
  const milestone = waiting === undefined ? undefined : (reg.dynamicMilestones.get(waiting.milestoneId) as unknown as DynamicMilestoneEntry | undefined);
  const override = state.dynamic?.override;
  const arguing = override !== undefined && override.unitId === unit.id && state.scene !== undefined && override.arguing === state.scene.id ? override : undefined;
  const regard = holds ? regardTone(state, reg, unit.id) : null;
  const refused = dyn.refusals.some((day) => state.day - day <= TUNING.dynamic.directives.refusalDays);
  // her compromat is hers: she knows it whether or not the commander does (the player's view, `Knowledge`, is not what this reads); the newest few, no count
  const kept = compromatOf(state, unit.id).slice(-3).map((f) => sentence(f.text.replace(/^AUTHOR TO WRITE:\s*/, ''))).filter((t) => t !== '');
  const parts = [
    ...(holds ? [`${name} holds the lead with the commander: ${sentence(frame.promptHint)}.`] : []),
    ...(holds && claimed.length > 0 ? [`What she has claimed: ${claimed.join('; ')}.`] : []),
    styleLine(state, reg, unit),
    ...(regard !== null ? [`Her tone toward the commander: ${sentence(regard)}.`] : []), // the tone word only: Regard is hers and never a number
    ...(milestone !== undefined ? [`${holds ? 'She' : name} is waiting for the commander's answer to something she asked: ${sentence(milestone.promptHint)}.`] : []),
    ...(holds && asking !== undefined ? [`She is waiting for the commander's answer to something she asked: ${asking.domainId === undefined ? 'that the commander give way to her' : sentence(String((reg.dynamicDomains.get(asking.domainId) as unknown as DynamicDomainEntry | undefined)?.promptHint ?? 'a part of the commander\'s life'))}.`] : []),
    ...(arguing !== undefined ? [`${name} has overridden the commander's order: ${sentence(describeOrder(state, reg, arguing.order))}. She wants: ${sentence(arguing.altLabel)}. She can be talked round only by a real compromise.`] : []),
    ...(holds && refused ? ['She has not forgotten a recent refusal and will answer it in her own way.'] : []),
    ...(holds && kept.length > 0 ? [`She holds something over the commander, and uses it only when it serves her, never all at once: ${kept.join('; ')}.`] : []),
    'Show it in how she acts and speaks; never name it as a mechanic.',
  ];
  return { id: `${DYNAMIC_PREFIX}${unit.id}`, expiresAfter: 'scene', text: parts.filter((p) => p !== '').join(' ') };
}

/** The directive of her pending probe while she is present: a small, deniable gesture on one axis, never named. */
function probeDirective(reg: Registries, unit: Unit, axisId: string): Directive {
  const axis = reg.probeAxes.get(axisId) as unknown as ProbeAxisEntry | undefined;
  const label = clean(String(axis?.label ?? axisId));
  const hint = axis === undefined ? '' : ` (she ${sentence(axis.promptHint)})`;
  return {
    id: `${PROBE_PREFIX}${unit.id}`, expiresAfter: 'scene',
    text: `In this scene ${unit.displayName} tests, small and deniable, whether the commander yields on ${label}${hint}; never name it.`,
  };
}

/**
 * Derived directives for the women in the scene (`present`):
 *  - `dynamic:<unitId>`: she holds at `play` or beyond: the frame's line, what she has claimed, her manner (the secondary named while it leads),
 *    and an answer she is waiting for (an open milestone, a recent refusal); before the first frame, only an open milestone.
 *  - `dynamic:probe:<unitId>`: her probe is pending (at most one a scene); gone when it is answered or lapses.
 *  - `dynamic:leash_block:<unitId>`: she is in the room and holds the commander's Leash requests: she answers for anything filed on the device.
 *  - `dynamic:command:<unitId>`: she holds the command and someone else is in the room: who gives the orders now. Her own line, while the argument over her override is the scene, adds what she overrode.
 *  - `dynamic:witness:<observerId>`: she suspects (cautious) or knows (her reaction by profile) a holder's dynamic and is in the room.
 * Nothing while the dynamic is off.
 */
export function dynamicDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  if (!dynamicOn(state, reg)) return [];
  const out: Directive[] = [];
  const units = present
    .map((id) => state.squad.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined && u.kind === 'named' && isLiving(u) && herPracticeLive(state, u.id));
  for (const unit of units) {
    const holder = holderDirective(state, reg, unit);
    if (holder !== null) out.push(holder);
  }
  const probe = sceneProbe(state, units.map((u) => u.id));
  if (probe !== undefined) out.push(probeDirective(reg, units.find((u) => u.id === probe.unitId)!, probe.probe.axis));
  for (const unit of units) {
    const line = aftermathDirective(state, reg, unit);
    if (line !== null) out.push(line);
  }
  out.push(...leashBlockDirectives(state, reg, present));
  out.push(...commandDirectives(state, reg, present));
  out.push(...witnessDirectives(state, reg, present));
  out.push(...disappointedDirectives(state, present));
  return out;
}

/** The line of her aftermath while its stage runs (`dynamic:aftermath:<unitId>`): the stage's `directive`, with her name; one line, gone with the aftermath. */
function aftermathDirective(state: CampaignState, reg: Registries, unit: Unit): Directive | null {
  const a = dynamicOf(state, unit.id)?.aftermath;
  const row = a === undefined ? undefined : aftermathRowOf(reg, a.kind);
  const stage = a === undefined ? undefined : row?.stages[a.stage];
  if (stage === undefined) return null;
  return { id: `${AFTERMATH_PREFIX}${unit.id}`, expiresAfter: 'scene', text: `${sentence(stage.directive.replaceAll('{name}', unit.displayName))}. Show it in how she acts and speaks; never name it as a mechanic.` };
}

/**
 * A woman who lost respect for the commander without a word (`dynamic:disappointed:<unitId>`, R19b): while her disappointment lasts and a holder is in the room
 * with her, she turns to the holder rather than the commander, and does not lecture. Her Regard is nowhere in it, and neither is a number.
 */
function disappointedDirectives(state: CampaignState, present: string[]): Directive[] {
  const holders = holdersAtPlay(state);
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    const holder = state.squad.find((u) => present.includes(u.id) && u.id !== id && holders.includes(u.id));
    if (unit === undefined || holder === undefined || unit.kind !== 'named' || !isLiving(unit) || disappointedSince(state, id) === undefined) continue;
    out.push({
      id: `${DISAPPOINTED_PREFIX}${id}`, expiresAfter: 'scene',
      text: `AUTHOR TO WRITE: ${unit.displayName} has stopped turning to the commander for advice; when she speaks she addresses ${holder.displayName}. She does not argue and does not lecture: she is simply quieter and more distant with the commander. Show it in how she acts and speaks; never name it as a mechanic.`,
    });
  }
  return out;
}

/** What she does about it, in her own words, once she knows (R14): by her reaction. No line states what the commander feels. */
const REACTION_LINE: Readonly<Record<Reaction, (holder: string) => string>> = {
  drawn: (h) => `AUTHOR TO WRITE: She is drawn to it: she watches ${h} with interest and may ask about it.`,
  indifferent: () => 'AUTHOR TO WRITE: She does not care either way: it is no business of hers, and she treats it so.',
  dislikes: (h) => `AUTHOR TO WRITE: She dislikes it and lets it show in how she speaks to ${h} and to the commander; she may say it plainly.`,
  respects: (h) => `AUTHOR TO WRITE: She holds a place of her own and respects ${h}'s claim.`,
  competes: (h) => `AUTHOR TO WRITE: She holds a place of her own and resents ${h}'s; she competes for what ${h} holds.`,
};

/**
 * What a woman who has noticed or learned of a holder's dynamic does in the scene (`dynamic:witness:<observerId>`): at `suspects_dynamic` she is
 * cautious (hints and small questions, nothing outright), at `knows_dynamic` she reacts by her profile. One line per observer, a sentence for each holder
 * she has a level for. She need not practise anything herself. The commander is the one in the scene, so a woman present is with the commander
 * (and with the holder when she is there too).
 */
function witnessDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const rows = state.dynamic?.knowledge ?? {};
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || rows[id] === undefined) continue;
    const lines: string[] = [];
    for (const [holderId, rec] of Object.entries(rows[id])) {
      const holder = state.squad.find((u) => u.id === holderId);
      if (holder === undefined || !isLiving(holder) || dynamicOf(state, holderId) === undefined) continue;
      if (rec.level === 'suspects_dynamic') {
        lines.push(`AUTHOR TO WRITE: ${unit.displayName} suspects that ${holder.displayName} has something over the commander and gives the orders when the two are alone. She is cautious: she hints and asks small questions, and says nothing outright.`);
      } else if (rec.level === 'knows_dynamic') {
        lines.push(`AUTHOR TO WRITE: ${unit.displayName} knows that ${holder.displayName} holds authority over the commander. ${REACTION_LINE[reactionOf(state, reg, id, holderId)](holder.displayName)}`);
      }
    }
    if (lines.length > 0) out.push({ id: `${WITNESS_PREFIX}${id}`, expiresAfter: 'scene', text: [...lines, 'Show it in how she acts and speaks; never name it as a mechanic.'].join(' ') });
  }
  return out;
}

/** The line of the holder who holds the commander's Leash requests, while she is in the room (`dynamic:leash_block:<unitId>`). No number, no chance. */
function leashBlockDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const holderId = leashBlockOf(state, reg);
  const holder = holderId === null || !present.includes(holderId) ? undefined : state.squad.find((u) => u.id === holderId);
  return holder === undefined ? [] : [{
    id: `${LEASH_BLOCK_PREFIX}${holder.id}`, expiresAfter: 'scene',
    text: `AUTHOR TO WRITE: ${holder.displayName} holds the commander's Leash requests: nothing is filed on the device without her say, and she may refuse to sign it. Show it in how she speaks about the device; never name it as a mechanic.`,
  }];
}

/** What the other women in the room hear while a holder gives the orders (`dynamic:command:<holderId>`): only with someone else present to address her. */
function commandDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const others = (id: string): boolean => state.squad.some((u) => u.id === id && isLiving(u));
  return state.squad
    .filter((u) => u.kind === 'named' && isLiving(u) && hasCapability(state, reg, u.id, 'countermand') && present.some((id) => id !== u.id && others(id)))
    .map((u): Directive => ({ id: `${COMMAND_PREFIX}${u.id}`, expiresAfter: 'scene', text: `${u.displayName} gives the orders now; the squad starts to address her as the one in command.` }));
}

/** What she does with each answer (`dynamic:offer:<unitId>`); she answers in character, and the line says nothing of what the commander feels. AUTHOR TO WRITE. */
const OFFER_LINE: Readonly<Record<string, (name: string) => string>> = {
  accepted: (n) => `${n} takes it up, in her own manner.`,
  corrected: (n) => `${n} does not take it as offered: she says what she wants instead, in her own words.`,
  mocked: (n) => `${n} mocks it, in her own manner.`,
  refused: (n) => `${n} turns it down, in her own manner.`,
  tonight: (n) => `${n} puts it off: tonight, she says, not now.`,
};

/**
 * The directive an offer sets, or `null` for any other event: what the commander offered, how she takes it (the engine decided; the line carries only the word) and, with
 * `[ASK IN RETURN]`, that something is asked in return. It lasts one reply (`next_reply`). With the holder cap reached she turns it down kindly. No number, no pronoun for the commander.
 */
export function offerDirective(event: { type: string; [k: string]: unknown }, state: CampaignState, reg: Registries): Directive | null {
  if (event.type !== 'offer_made' || !dynamicOn(state, reg)) return null;
  const unit = state.squad.find((u) => u.id === event.unitId);
  const answer = String(event.answer);
  const say = OFFER_LINE[answer];
  if (unit === undefined || say === undefined) return null;
  const named = typeof event.corrected === 'string' ? reg.worshipTargets.get(event.corrected) : undefined;
  const parts = [
    `The commander offers ${sentence(String(event.what ?? 'something'))} to ${unit.displayName}${event.conditions === true ? ', and asks something in return' : ''}.`,
    event.kind === true ? `${unit.displayName} turns it down kindly; she is not looking for that from the commander.` : say(unit.displayName),
    ...(answer === 'corrected' && named !== undefined ? [`What she wants is the commander's attention to her ${sentence(String(named.label)).toLowerCase()}.`] : []),
    'Show it in how she acts and speaks; never name it as a mechanic.',
  ];
  return { id: `${OFFER_PREFIX}${unit.id}`, expiresAfter: 'next_reply', text: parts.join(' ') };
}

/** Sets the directives the events of one dispatch call for. Returns whether any was set. */
export function applyOfferDirectives(builder: ContextBuilder, events: ReadonlyArray<{ type: string; [k: string]: unknown }>, state: CampaignState | null, reg: Registries): boolean {
  if (state === null) return false;
  let any = false;
  for (const e of events) {
    const d = offerDirective(e, state, reg);
    if (d !== null) {
      builder.setDirective(d);
      any = true;
    }
  }
  return any;
}

/** Drops every directive this layer owns (a chat switch, no campaign, a scene that closed). */
export function clearDynamicDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith(DYNAMIC_PREFIX));
}

/** Sets the derived directives and drops the ones that no longer hold; without a state it only clears. Called on every refresh. The offer line is event-driven and lives out its reply. */
export function refreshDynamicDirectives(builder: ContextBuilder, state: CampaignState | null, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith(DYNAMIC_PREFIX) && !d.id.startsWith(OFFER_PREFIX));
  if (state === null) return;
  for (const d of dynamicDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
