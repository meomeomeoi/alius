import { plainDraft } from '../content/draft';
import type { Registries } from '../content/types';
import { presetOf, samePreset } from '../engine/blocking';
import { careKinds } from '../engine/craft/care';
import { feetOfDay } from '../engine/craft/feet';
import { footContactLive } from '../engine/craft/intents';
import { craftLive, careOpen } from '../engine/craft/gate';
import { craftRoll } from '../engine/craft/state';
import { styleOf } from '../engine/dynamic/profile';
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

/** What she saw the commander do for her unasked, for her next reply only (Task 15; derived from the care that landed in this scene). */
export const CARE_PREFIX = 'craft:care:';
/** The line she may say when it is the fourth time in the week (`care.nameAt`), once (Task 15). */
export const NAMED_PREFIX = 'craft:named_service:';

/** How her feet are today, while her feet are what the scene is about (Task 16; derived from `feetOfDay`, never from what the commander did for them). */
export const FEET_PREFIX = 'craft:feet:';

/** What she may show when the commander did for her what she was about to ask (Task 17), for her next reply only. */
export const ANTICIPATE_PREFIX = 'craft:anticipate:';

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

/** How she shows that she saw it, by her style (AUTHOR TO WRITE; no figure, no pronoun for the commander). A style it has no row of reads `plain`. */
const CARE_WAY: Record<string, string> = {
  affectionate: 'warmly, with a thanks that makes no speech of it', playful: 'with amusement, teasing that she saw', cold: 'briefly, as a remark about the thing itself and never as thanks',
  cruel: 'as an observation that could be taken as a threat or a compliment', possessive: 'as if it were only what is owed to her', ritual: 'with a small, formal acknowledgement',
  clinical: 'as a flat note of what was done and how well', drill: 'in the manner of a check: noted', obsessive: 'too exactly: she has seen how it was done',
  regal: 'as an acknowledgement from a throne', vindictive: 'sparingly: she saw it, and keeps it', plain: 'in her own way',
};

/**
 * What she may show of the care she noticed (`craft:care:<unitId>`): once, in the scene where it landed (`Relation.craft.cares[].scene`), for a woman in the room toward whom care is
 * open. When that care let her name the service, it is the line `craft:named_service:<unitId>` instead. Gone when the scene ends.
 */
function careDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const scene = state.scene;
  if (scene === undefined) return [];
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    const cares = (state.relations[id]?.craft?.cares ?? []).filter((c) => c.voiced === true && c.scene === scene.id);
    if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || cares.length === 0 || !careOpen(state, reg, id)) continue;
    if (cares.some((c) => c.named === true)) {
      out.push({
        id: `${NAMED_PREFIX}${id}`, expiresAfter: 'scene',
        text: `AUTHOR TO WRITE: ${unit.displayName} may say, in her own way and only if it fits, that it is the fourth time this week the commander has done something for her unasked, and ask whether she asked for it. Say it only once. ${NEVER_NAME}`,
      });
      continue;
    }
    const last = [...cares].sort((a, b) => b.day - a.day)[0]!;
    const hint = careKinds(reg).find((r) => r.id === last.careId)?.promptHint;
    const way = CARE_WAY[styleOf(unit)?.primary ?? 'plain'] ?? CARE_WAY.plain!;
    out.push({
      id: `${CARE_PREFIX}${id}`, expiresAfter: 'scene',
      text: `AUTHOR TO WRITE: While ${unit.displayName} was out the commander did something for her unasked${hint !== undefined ? ` (${phrase(hint)})` : ''}. She may show that she saw it, ${way}, only if it fits and only once. ${NEVER_NAME}`,
    });
  }
  return out;
}

/** How she shows that she saw it coming, by her style (AUTHOR TO WRITE; no figure, no pronoun for the commander). */
const ANTICIPATE_WAY: Record<string, string> = {
  affectionate: 'with a small smile that says she noticed', playful: 'with a grin, as if caught wanting it', cold: 'with a short nod and nothing more', cruel: 'as if the commander had only done what was owed',
  possessive: 'as if it were hers by right', ritual: 'with a small formal nod', clinical: 'with a flat note that it was the right thing', drill: 'with a curt "noted"',
  obsessive: 'with a look that has seen exactly how it was done', regal: 'with the slight acknowledgement of a throne', vindictive: 'sparingly: she saw it, and keeps it', plain: 'in her own way',
};

/**
 * What she may show of the service the commander staged before she had to ask (`craft:anticipate:<unitId>`): for the reply that follows (while the exchange it was staged in has not passed),
 * once, in the scene it happened in, worded by her style. Derived from `Relation.craft.anticipate`.
 */
function anticipateDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const scene = state.scene;
  if (scene === undefined) return [];
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    const mark = state.relations[id]?.craft?.anticipate;
    if (unit === undefined || mark === undefined || unit.kind !== 'named' || !isLiving(unit) || !craftLive(state, reg, id)) continue;
    if (mark.scene !== scene.id || scene.exchanges > mark.exchange) continue;
    const hint = reg.blockingActivities.get(mark.activityId)?.promptHint;
    const way = ANTICIPATE_WAY[styleOf(unit)?.primary ?? 'plain'] ?? ANTICIPATE_WAY.plain!;
    out.push({
      id: `${ANTICIPATE_PREFIX}${id}`, expiresAfter: 'next_reply',
      text: `AUTHOR TO WRITE: The commander did for ${unit.displayName} what she was about to ask${hint !== undefined ? ` (${phrase(String(hint))})` : ''}, before she had to. She may show that she saw it coming, ${way}, only if it fits and only once. ${NEVER_NAME}`,
    });
  }
  return out;
}

/** The state of her feet in words (AUTHOR TO WRITE; no figure). */
const FEET_WORDS: Record<string, string> = {
  fresh: 'rested and clean', worn: 'tired from the boots and a little damp', hot: 'hot and damp after training', sore: 'sore from the run, with a blister or a callus', bare: 'bare after the day, in her own quarters',
};

/**
 * The day of her feet (`craft:feet:<unitId>`): while a foot contact is live with her in the open scene, a craft-live woman in the room may let it show how her feet are today, once.
 * It is the engine's derived state (`feetOfDay`); it says nothing of what was done for them.
 */
function feetDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  if (state.scene === undefined) return [];
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || !craftLive(state, reg, id) || !footContactLive(state, reg, id)) continue;
    const feet = feetOfDay(state, reg, id);
    out.push({
      id: `${FEET_PREFIX}${id}`, expiresAfter: 'scene',
      text: `AUTHOR TO WRITE: ${unit.displayName}'s feet today are ${FEET_WORDS[feet.state] ?? FEET_WORDS.fresh}${feet.state === 'bare' ? '' : `, in her ${feet.footwear}`}. She may let it show, only if it fits and only once. ${NEVER_NAME}`,
    });
  }
  return out;
}

/** Every craft directive that holds now for the women in the room; nothing without the craft. A draft text reaches the model without its marker. */
export function craftDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  return [...lessonDirectives(state, reg, present), ...recordDirectives(state, reg, present), ...postureDirectives(state, reg, present), ...careDirectives(state, reg, present), ...feetDirectives(state, reg, present), ...anticipateDirectives(state, reg, present)].map((d) => ({ ...d, text: plainDraft(d.text) }));
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
