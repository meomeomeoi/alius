import { plainDraft } from '../content/draft';
import type { Registries } from '../content/types';
import { presetOf, samePreset } from '../engine/blocking';
import { craftLive } from '../engine/craft/gate';
import { craftRoll } from '../engine/craft/state';
import { isLiving } from '../engine/economy';
import type { CampaignState } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import type { ContextBuilder, Directive } from '../llm/context';

/**
 * What the main model is told about the craft (P16b, plan Task 6). Every id starts with `craft:`; no other package uses that prefix. The lines are derived from the state on every
 * refresh (a chat switch needs only `clearCraftDirectives`), triggered, worded "if it fits, once" and gone once voiced or once the scene ends (P14c section 0): none is a standing
 * description of the commander, none carries a number, none gives the commander a pronoun or a feeling, and each passes `plainDraft`. A hidden value is never in one: the lesson's
 * point is told only for the one reply that follows the slip, and a record is told as a hold, never as a time.
 */
export const CRAFT_PREFIX = 'craft:';
/** The point she may name after a slip, for her next reply only (derived from `Relation.craft.lesson`, which holds it until the exchange has passed). */
export const LESSON_PREFIX = 'craft:lesson:';
/** A record she may bring up, or ask the commander to beat (scene). */
export const RECORD_PREFIX = 'craft:record:';
/** The posture she has the commander hold now, while a posture hold is open (P16b, Task 13). */
export const POSTURE_PREFIX = 'craft:posture:';

const NEVER_NAME = 'Never name it as a mechanic.';

/** A line of prose: draft marker, control characters and digits gone (no directive carries a number). */
const phrase = (text: string): string => plainDraft(text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\d+/g, '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');

/** The lesson she may voice: while the exchange of the slip has not passed, in the scene it happened in, for a woman who is in the room and still craft-live. */
function lessonDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const scene = state.scene;
  if (scene === undefined) return [];
  const out: Directive[] = [];
  for (const id of present) {
    const lesson = state.relations[id]?.craft?.lesson;
    const unit = state.squad.find((u) => u.id === id);
    if (lesson === undefined || unit === undefined || unit.kind !== 'named' || !isLiving(unit) || !craftLive(state, reg, id)) continue;
    if (lesson.scene !== scene.id || scene.exchanges > lesson.exchange) continue;
    out.push({
      id: `${LESSON_PREFIX}${id}`, expiresAfter: 'next_reply',
      text: `AUTHOR TO WRITE: After the slip, ${unit.displayName} may name the point that failed${lesson.joke === true ? ', as a joke in her own way' : ''}: ${phrase(lesson.words)}. Say it in her own words, only if it fits, and only once. ${NEVER_NAME}`,
    });
  }
  return out;
}

/** The label of the physics a record was set in, as "the weight hold"; a key that is no physics reads as "the hold". */
const holdWord = (reg: Registries, key: string): string => {
  const physics = reg.contactPhysics.get(key);
  return physics !== undefined ? `the ${String(physics.label).toLowerCase()} hold` : 'the hold';
};

/**
 * A record she may bring up (`craft:record:<unitId>`): once a scene, by a hash of the day and the scene, and only for a record that is younger than `record.freshDays` (the freshest one is
 * told, as a hold and never as a time). She may brag of it, or ask the commander to beat it.
 */
function recordDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const scene = state.scene;
  if (scene === undefined) return [];
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    const records = state.relations[id]?.craft?.records;
    if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || records === undefined || !craftLive(state, reg, id)) continue;
    const fresh = Object.entries(records).filter(([, r]) => state.day - r.day <= TUNING.craft.record.freshDays && r.longest >= TUNING.craft.record.minSeconds).sort((a, b) => b[1].day - a[1].day)[0];
    if (fresh === undefined || craftRoll(state, id, `record:${scene.id}`) >= TUNING.craft.record.bringUp) continue;
    out.push({
      id: `${RECORD_PREFIX}${id}`, expiresAfter: 'scene',
      text: `AUTHOR TO WRITE: ${unit.displayName} may bring up the longest the commander has managed in ${holdWord(reg, fresh[0])}, or ask the commander to beat it, only if it fits and only once in this scene. Give no figure. ${NEVER_NAME}`,
    });
  }
  return out;
}

/** What a load she added lets her do, in words with no number (the settling-in modifiers, read by kind). AUTHOR TO WRITE. */
const LOAD_CLAUSE: Record<string, string> = {
  count: 'She may count the time aloud',
  no_duration: 'She does not say how long it will last',
  speech_rule: 'She may demand silence, or only a plain yes',
  combined: 'She may add something else to bear',
  new_posture: 'She may change the posture once it is held',
};

/**
 * The posture she has the commander hold, while the hold is open (`craft:posture:<unitId>`, for the one woman who runs it and is in the room, craft-live): her name for it when she gave one
 * (read through the preset, so an old base name counts), else the preset's label, and the preset's own words for what it looks like. She may correct a point she sees drifting, if it fits, once.
 * The planned end, a hidden end and the settling-in count are never in it; a load she added is a clause of what she may do, never a figure.
 */
function postureDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const run = state.practices?.postureRun;
  const unit = run === undefined ? undefined : state.squad.find((u) => u.id === run.holderId);
  if (run === undefined || unit === undefined || unit.kind !== 'named' || !isLiving(unit) || !present.includes(run.holderId) || !craftLive(state, reg, run.holderId)) return [];
  const preset = presetOf(reg, run.presetId);
  if (preset === undefined) return [];
  const hers = state.practices?.postures[run.holderId]?.find((p) => samePreset(reg, p.postureId, preset.id))?.name;
  const load = run.load !== undefined ? LOAD_CLAUSE[run.load] : undefined;
  return [{
    id: `${POSTURE_PREFIX}${run.holderId}`, expiresAfter: 'scene',
    text: `AUTHOR TO WRITE: ${unit.displayName} has the commander holding a posture, ${hers !== undefined ? `which she calls "${phrase(hers)}"` : phrase(String(preset.label))}: ${phrase(String(preset.promptHint))}. If it fits, she may correct a point she sees drifting, and only once.${load !== undefined ? ` ${load}, only if it fits.` : ''} ${NEVER_NAME}`,
  }];
}

/** Every craft directive that holds now for the women in the room; nothing without the craft. A draft text reaches the model without its marker. */
export function craftDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  return [...lessonDirectives(state, reg, present), ...recordDirectives(state, reg, present), ...postureDirectives(state, reg, present)].map((d) => ({ ...d, text: plainDraft(d.text) }));
}

/** Drops every craft directive (a chat switch, the end of a scene). */
export function clearCraftDirectives(builder: Pick<ContextBuilder, 'clearMatching'>): void {
  builder.clearMatching((d) => d.id.startsWith(CRAFT_PREFIX));
}

/** Sets the derived directives and drops the ones that no longer hold; without a state it only clears. */
export function refreshCraftDirectives(builder: Pick<ContextBuilder, 'clearMatching' | 'setDirective'>, state: CampaignState | null, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith(CRAFT_PREFIX));
  if (state === null) return;
  for (const d of craftDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
