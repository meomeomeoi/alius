/**
 * Shame without a narrator (P15, plan R19b, spec §16.5): the commander's fall in a woman's eyes is shown through people, never through a voice of the game.
 *  - Disappointment: a named woman who is not a holder, whose Trust was 60 or more, and whose Regard falls across a band within 14 days, does not argue. She
 *    stops coming for advice (her habits of respect lapse), the memory keeps it hidden from the commander, and in a scene with a holder her line says she
 *    speaks to the holder (`dynamic:disappointed:<unitId>`, in `src/dynamic/directives.ts`; it forbids a lecture).
 *  - The question without a good answer: a `her_question` moment from a woman whose Regard fell in the last 14 days and is not gone, or who knows of a holder's dynamic and
 *    dislikes it. Ripe for her (`registerRipeSource`) at most once in 14 days for one woman and once a week overall; none of the three answers is scored as right,
 *    and her Regard moves a little by what her own style values.
 *  - The nickname's tone (`nicknameTone`, `reputationDayStep`) follows the squad's average Regard.
 * Hidden throughout: no number reaches a panel or a prompt. Draws nothing.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { lapseHabits } from '../development/habits';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicOn } from './gate';
import { styleOf } from './profile';
import { regardBandRank, regardOf, regardRise, squadRegardAverage } from './regard';
import { dynamicOf } from './state';
import { dynamicTerm } from './witness';

export { squadRegardAverage };

type Ctx = Pick<EngineCtx, 'registries'>;
const R = TUNING.regard;

/** A named unit in service who does not hold anything over the commander (a holder is at `play` or beyond). */
function nonHolder(state: CampaignState, unitId: string): boolean {
  const unit = state.squad.find((u) => u.id === unitId);
  const frame = dynamicOf(state, unitId)?.frame;
  return unit !== undefined && unit.kind === 'named' && isLiving(unit) && (frame === undefined || frameRank(frame) < frameRank('play'));
}

const noted = (draft: CampaignState): NonNullable<NonNullable<CampaignState['dynamic']>['noted']> => (draft.dynamic!.noted ??= {});

// ---------------------------------------------------------------------------------------------
// Disappointment

/**
 * A fall of her Regard from `from` to `to` (the regard watcher): she is disappointed when she is a woman who holds nothing, her Trust is at least
 * `disappointment.trust`, and the value now stands in a lower band than it did when the fall of the last `disappointment.days` days began. Emits `disappointed`
 * (the memory rule writes the hidden fact), lapses her habits of respect and starts the line of her directive. The span starts over after it. Draws nothing.
 */
export function checkDisappointment(draft: CampaignState, ctx: Ctx, unitId: string, from: number, to: number): EngineEvent[] {
  const reg = ctx.registries;
  if (draft.dynamic === undefined || !dynamicOn(draft, reg) || to >= from || !nonHolder(draft, unitId)) return [];
  (noted(draft).regardFell ??= {})[unitId] = draft.day;
  const marks = (noted(draft).regardMark ??= {});
  let mark = marks[unitId];
  if (mark === undefined || draft.day - mark.day > R.disappointment.days) mark = marks[unitId] = { day: draft.day, value: from };
  if (regardBandRank(reg, to) <= regardBandRank(reg, mark.value)) return [];
  marks[unitId] = { day: draft.day, value: to };
  if ((draft.relations[unitId]?.trust ?? 0) < R.disappointment.trust) return [];
  (noted(draft).disappointed ??= {})[unitId] = draft.day;
  lapseHabits(draft, reg, unitId, R.lapse.tag, R.lapse.days);
  return [{ type: 'disappointed', unitId }];
}

/** The day she was disappointed, while her line lasts (`disappointment.days`); otherwise `undefined`. */
export function disappointedSince(state: CampaignState, unitId: string): number | undefined {
  const day = state.dynamic?.noted?.disappointed?.[unitId];
  return day !== undefined && state.day - day <= R.disappointment.days ? day : undefined;
}

// ---------------------------------------------------------------------------------------------
// The question

/** Whether her Regard fell within the last `disappointment.days` days and is still above the lowest band. */
function falling(state: CampaignState, reg: Registries, unitId: string): boolean {
  const day = state.dynamic?.noted?.regardFell?.[unitId];
  return day !== undefined && state.day - day <= R.disappointment.days && regardBandRank(reg, regardOf(state, reg, unitId)) < Math.max(0, reg.regardBands.size - 1);
}

/**
 * Whether the engine calls her question ripe (R19b): she is a woman who holds nothing, her Regard is falling but above the lowest band, or she knows of a holder's
 * dynamic and dislikes it (`dynamicTerm`); and she was not asked `question.cooldownDays` days ago, nor anyone `question.weekDays` days ago. Pure.
 */
export function questionRipe(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!dynamicOn(state, reg) || !nonHolder(state, unitId)) return false;
  const q = state.dynamic?.noted?.question;
  if (q?.by[unitId] !== undefined && state.day - q.by[unitId] < R.question.cooldownDays) return false;
  if (q?.day !== undefined && state.day - q.day < R.question.weekDays) return false;
  return falling(state, reg, unitId) || dynamicTerm(state, reg, unitId) > 0;
}

/** The reader the moments' ripe hook gets (`registerRipeSource`): `her_question` for the woman it is ripe for. */
export const ripeQuestions = (state: CampaignState, reg: Registries, unitId: string): string[] => (questionRipe(state, reg, unitId) ? ['her_question'] : []);

/** The question was asked (the moment fired): the two cooldowns start and the event says so. Any `her_question` counts, whoever called it ripe. */
export function noteQuestionAsked(draft: CampaignState, ctx: Ctx, events: readonly EngineEvent[]): EngineEvent[] {
  if (draft.dynamic === undefined || !dynamicOn(draft, ctx.registries)) return [];
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type !== 'moment_fired' || e.sourceId !== 'her_question' || typeof e.unitId !== 'string') continue;
    const q = (noted(draft).question ??= { by: {} });
    q.day = draft.day;
    q.by[e.unitId] = draft.day;
    out.push({ type: 'regard_question_asked', unitId: e.unitId, ...(typeof e.momentId === 'string' ? { momentId: e.momentId } : {}) });
  }
  return out;
}

/**
 * Her answer (`moment_answered` of `her_question`): none is scored as right, but her Regard moves a little by her own profile: the answer key her primary style
 * values (`question.valued`: the honest one for `clinical`, the gentle one for `affectionate`) raises it by `question.gain`; every other answer leaves it. Draws nothing.
 */
export function answerQuestion(draft: CampaignState, ctx: Ctx, unitId: string, key: string): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  const primary = unit === undefined ? undefined : styleOf(unit)?.primary;
  if (primary === undefined || R.question.valued[primary] !== key) return [];
  return regardRise(draft, ctx.registries, unitId, 'value', R.question.gain);
}

/** The after-action step of the moment's two events. */
export function questionEvents(draft: CampaignState, ctx: Ctx, events: readonly EngineEvent[]): EngineEvent[] {
  if (!dynamicOn(draft, ctx.registries)) return [];
  const out = noteQuestionAsked(draft, ctx, events);
  for (const e of events) if (e.type === 'moment_answered' && e.sourceId === 'her_question' && typeof e.unitId === 'string') out.push(...answerQuestion(draft, ctx, e.unitId, String(e.key)));
  return out;
}
