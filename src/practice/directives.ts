import { plainDraft } from '../content/draft';
import type { Registries } from '../content/types';
import { isLiving } from '../engine/economy';
import { witnessOf } from '../engine/dynamic/witness';
import { temperamentOf } from '../engine/life/state';
import { practiceLive } from '../engine/practice/gate';
import { protocolRules } from '../engine/practice/service';
import type { Task } from '../engine/practice/state';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder, Directive } from '../llm/context';

/**
 * What the main model is told about the practices (P16, plan R23). Every id starts with `practice:`; no other package uses that prefix. The lines are derived from the
 * state on every refresh (a chat switch needs only `clearPracticeDirectives`) except `practice:issued:`, which is event-driven and lasts one reply. They follow the
 * prompt-hygiene rule: a line lasts the scene or the next reply, none is a standing description of the commander, none carries a number, none gives the commander a
 * pronoun or a feeling, and each passes `plainDraft`. The summary of a practice is what is told, never its words; a sealed one is only "a sealed task".
 */
export const PRACTICE_PREFIX = 'practice:';
/** The tasks she expects, while she is in the room (scene). */
export const TASKS_PREFIX = 'practice:tasks:';
/** The rules of address and conduct she has set, while she is in the room (scene). */
export const PROTOCOL_PREFIX = 'practice:protocol:';
/** A third party who is in the room: what a holder asked of the commander that involves her. */
export const TARGET_PREFIX = 'practice:target:';
/** Her discipline the commander has just accepted, while she is in the room: what she carries out, shown or only reported. Told in one scene only (the one it was answered in, or the first with her after a DM answer). */
export const PUNISHMENT_PREFIX = 'practice:punishment:';
/** The demonstration she is staging, while it is on (scene). */
export const DEMONSTRATION_PREFIX = 'practice:demonstration:';
/** What she has just asked of the commander, for her next reply only (event-driven: a refresh leaves it alone). */
export const ISSUED_PREFIX = 'practice:issued:';

/** How an onlooker takes to what the holder leads in, as prose (never the word of a mechanic). */
const WITNESS_PHRASE: Readonly<Record<string, string>> = { drawn: 'is drawn to it', indifferent: 'is unmoved by it', dislikes: 'is put off by it' };

const NEVER_NAME = 'Show it in how she acts and speaks; never name it as a mechanic.';

/** A summary as a line of prose: draft marker, control characters and digits gone (no directive carries a number). */
const phrase = (text: string): string => plainDraft(text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\d+/g, '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');

/** What a task is called to the model: its summary, or "a sealed task" while it is sealed. */
const taskLine = (t: Pick<Task, 'sealed' | 'summary'>): string => (t.sealed === true ? 'a sealed task' : phrase(t.summary));

/** The holders who are in the room: named, living, and live (`practiceLive`). */
function holdersIn(state: CampaignState, reg: Registries, present: readonly string[]) {
  return present.flatMap((id) => {
    const unit = state.squad.find((u) => u.id === id);
    return unit !== undefined && unit.kind === 'named' && isLiving(unit) && practiceLive(state, reg, id) ? [unit] : [];
  });
}

/**
 * Derived directives for the women in the scene (`present`):
 *  - `practice:tasks:<holderId>`: she holds, and has tasks open that the commander accepted: what she expects, by summary (a sealed one as "a sealed task").
 *  - `practice:target:<unitId>`: someone in the room is the third party of a task that is open (a holder asked the commander for something that involves her): what was asked,
 *    by summary, and her own stance toward what the holder leads in (her `witness` word), so that she reacts as she would.
 * Nothing while nobody in the room holds and nobody is a target. The event-driven `practice:issued:` line is `issuedDirective`.
 */
export function practiceDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const out: Directive[] = [];
  for (const unit of holdersIn(state, reg, present)) {
    const open = (state.practices?.tasks ?? []).filter((t) => t.holderId === unit.id && t.kind === 'task' && t.status === 'open').map(taskLine).filter((s) => s !== '');
    if (open.length === 0) continue;
    out.push({ id: `${TASKS_PREFIX}${unit.id}`, expiresAfter: 'scene', text: plainDraft(`${unit.displayName} expects the commander to see to: ${open.join('; ')}. She may ask after them. ${NEVER_NAME}`) });
  }
  for (const unit of holdersIn(state, reg, present)) {
    const forms = protocolRules(state, reg, unit.id).filter((r) => r.status === 'active').map((r) => phrase(r.text)).filter((t) => t !== '');
    if (forms.length === 0) continue;
    out.push({ id: `${PROTOCOL_PREFIX}${unit.id}`, expiresAfter: 'scene', text: plainDraft(`${unit.displayName} holds the commander to these standing forms of address and conduct: ${forms.join('; ')}. She notices a slip and may remark on it. ${NEVER_NAME}`) });
  }
  for (const unit of holdersIn(state, reg, present)) {
    const done = (state.practices?.punishments ?? []).filter((x) => x.holderId === unit.id && x.forUnitId === undefined && x.status === 'accepted' && x.answeredDay === state.day && (x.voicedScene === undefined || x.voicedScene === state.scene?.id));
    if (done.length === 0) continue;
    const shown = (state.content?.enabled ?? []).includes('physical_discipline_shown');
    const lines = done.map((x) => {
      const physical = (reg.holderPunishments.get(x.entryId)?.effects as Array<{ type: string }> | undefined)?.some((e) => e.type === 'physical' || e.type === 'slap') === true;
      const how = !physical ? '' : shown ? ' It is shown as it happens.' : ' It is only reported, in a line, and never shown.';
      const crowd = (x.audienceIds ?? []).map((id) => state.squad.find((u) => u.id === id)?.displayName ?? id);
      const before = crowd.length > 0 ? ` It is done before ${crowd.join(' and ')}, who watch.` : '';
      return `${unit.displayName} carries out the punishment she gave the commander: ${phrase(x.summary)}.${how}${before}`;
    });
    out.push({ id: `${PUNISHMENT_PREFIX}${unit.id}`, expiresAfter: 'scene', text: plainDraft(`${lines.join(' ')} ${NEVER_NAME}`) });
  }
  for (const unit of holdersIn(state, reg, present)) {
    const staged = (state.practices?.demonstrations ?? []).filter((d) => d.holderId === unit.id && d.status === 'open' && d.sceneId !== undefined && d.sceneId === state.scene?.id);
    if (staged.length === 0) continue;
    const lines = staged.map((d) => {
      const watchers = [...d.audienceIds, ...(d.narrated ?? [])].map((id) => state.squad.find((u) => u.id === id)).filter((u) => u !== undefined);
      const stance = watchers.map((w) => `${w.displayName} ${WITNESS_PHRASE[witnessOf(state, reg, w.id, unit.id)] ?? 'is unmoved by it'}`);
      const voice = temperamentOf(state, unit.id).talkativeness !== 'silent' ? ' Others address her, and she answers for the commander.' : '';
      return `${unit.displayName} is showing the commander's service before others: ${phrase(d.summary)}.${stance.length > 0 ? ` Watching: ${stance.join('; ')}.` : ''}${voice}`;
    });
    out.push({ id: `${DEMONSTRATION_PREFIX}${unit.id}`, expiresAfter: 'scene', text: plainDraft(`${lines.join(' ')} ${NEVER_NAME}`) });
  }
  for (const id of present) {
    const target = state.squad.find((u) => u.id === id);
    if (target === undefined || target.kind !== 'named' || !isLiving(target)) continue;
    const asked = (state.practices?.tasks ?? []).filter((t) => t.kind === 'task' && t.status === 'open' && t.targetUnitId === id && t.holderId !== id && practiceLive(state, reg, t.holderId));
    if (asked.length === 0) continue;
    const lines = asked.flatMap((t) => {
      const holder = state.squad.find((u) => u.id === t.holderId);
      const what = taskLine(t);
      return holder === undefined || what === '' ? [] : [`${holder.displayName} asked the commander for this, which involves ${target.displayName}: ${what}. Her own stance toward what ${holder.displayName} leads in: ${witnessOf(state, reg, id, t.holderId)}.`];
    });
    if (lines.length > 0) out.push({ id: `${TARGET_PREFIX}${id}`, expiresAfter: 'scene', text: plainDraft(`${lines.join(' ')} She reacts as she would. ${NEVER_NAME}`) });
  }
  return out;
}

/**
 * The line a new practice sets, or `null` for any other event: what she has just asked of the commander, for her next reply only. A sealed one says only that she handed over
 * a sealed envelope. Only for a holder who is in the open scene (a practice delivered as a DM has its message instead).
 */
export function issuedDirective(event: { type: string; [k: string]: unknown }, state: CampaignState, reg: Registries): Directive | null {
  if (event.type === 'punishment_issued') return punishmentIssuedDirective(event, state, reg);
  if (event.type !== 'task_issued' || typeof event.taskId !== 'string') return null;
  if (event.kind === 'demonstration') return demonstrationIssuedDirective(event.taskId, state, reg);
  const task = state.practices?.tasks.find((t) => t.id === event.taskId);
  const unit = task === undefined ? undefined : state.squad.find((u) => u.id === task.holderId);
  if (task === undefined || unit === undefined || state.scene?.participants.includes(unit.id) !== true || !practiceLive(state, reg, unit.id)) return null;
  const what = task.sealed === true ? `${unit.displayName} hands the commander a sealed envelope and waits for it to be opened.` : `${unit.displayName} has just asked the commander for something: ${taskLine(task)}. She waits for the answer.`;
  return { id: `${ISSUED_PREFIX}${unit.id}`, expiresAfter: 'next_reply', text: plainDraft(`${what} ${NEVER_NAME}`) };
}

/** What she has just proposed to show before others, for her next reply only. Only for a holder who is in the open scene. */
function demonstrationIssuedDirective(id: string, state: CampaignState, reg: Registries): Directive | null {
  const d = state.practices?.demonstrations.find((x) => x.id === id);
  const unit = d === undefined ? undefined : state.squad.find((u) => u.id === d.holderId);
  if (d === undefined || unit === undefined || state.scene?.participants.includes(unit.id) !== true || !practiceLive(state, reg, unit.id)) return null;
  return { id: `${ISSUED_PREFIX}${unit.id}`, expiresAfter: 'next_reply', text: plainDraft(`${unit.displayName} has just told the commander she wants to show the commander's service before others: ${phrase(d.summary)}. She waits for the answer. ${NEVER_NAME}`) };
}

/** What she has just told the commander about a punishment (or an order about a soldier), for her next reply only. Only for a holder who is in the open scene. */
function punishmentIssuedDirective(event: { type: string; [k: string]: unknown }, state: CampaignState, reg: Registries): Directive | null {
  const p = typeof event.punishmentId === 'string' ? state.practices?.punishments.find((x) => x.id === event.punishmentId) : undefined;
  const unit = p === undefined ? undefined : state.squad.find((u) => u.id === p.holderId);
  if (p === undefined || unit === undefined || state.scene?.participants.includes(unit.id) !== true || !practiceLive(state, reg, unit.id)) return null;
  const soldier = p.forUnitId === undefined ? undefined : state.squad.find((u) => u.id === p.forUnitId);
  const what = p.sealed === true ? `${unit.displayName} hands the commander a sealed envelope and waits for it to be opened.`
    : soldier !== undefined ? `${unit.displayName} has just told the commander what she wants done about ${soldier.displayName}: ${phrase(p.summary)}. She waits to see whether the commander does it, takes it, or refuses.`
      : `${unit.displayName} has just told the commander the consequence of what was broken: ${phrase(p.summary)}. She waits for the answer.`;
  return { id: `${ISSUED_PREFIX}${unit.id}`, expiresAfter: 'next_reply', text: plainDraft(`${what} ${NEVER_NAME}`) };
}

/** Sets the directives the events of one dispatch call for. Returns whether any was set. */
export function applyIssuedDirectives(builder: ContextBuilder, events: ReadonlyArray<{ type: string; [k: string]: unknown }>, state: CampaignState | null, reg: Registries): boolean {
  if (state === null) return false;
  let any = false;
  for (const e of events) {
    const d = issuedDirective(e, state, reg);
    if (d !== null) {
      builder.setDirective(d);
      any = true;
    }
  }
  return any;
}

/** Drops every directive this layer owns (a chat switch, no campaign, a scene that closed). */
export function clearPracticeDirectives(builder: Pick<ContextBuilder, 'clearMatching'>): void {
  builder.clearMatching((d) => d.id.startsWith(PRACTICE_PREFIX));
}

/** Sets the derived directives and drops the ones that no longer hold; without a state it only clears. The issued line is event-driven and lives out its reply. */
export function refreshPracticeDirectives(builder: Pick<ContextBuilder, 'clearMatching' | 'setDirective'>, state: CampaignState | null, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith(PRACTICE_PREFIX) && !d.id.startsWith(ISSUED_PREFIX));
  if (state === null) return;
  for (const d of practiceDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
