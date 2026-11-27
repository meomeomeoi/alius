/**
 * The `vindictive` holder's sentence (P16b, plan Task 21; spec section 11, ruling 6). A holder whose style (primary or secondary) is `vindictive`, while her craft runs, who has read the commander's file
 * (`knows_crime`), sets a sentence at a day step: a term in days by the crime (its echo row's `days`: `crimeEchoes`, read by the row's `crime` field), `sentence_set`. A slip of the commander toward her
 * adds `TUNING.craft.sentence.extend` days (`sentence_extended`); at its end it is served (`sentence_served`) and Regard rises by a closing rise for dignity. While it runs, the echo of the crime acts
 * by effect type: `give_up` (her punishments put privileges first, and a booking of another woman is given up each week), `through_her` (every message to another passes through her: the forced editor),
 * `experiment` (a task of hers from the experiment seeds each week), `obey_day` (a day of obedience to her each week), `answer_first` (the rule of answering to her first, proposed once), `tithe` (PLYX or
 * credits each week). Which echo it is stays hidden until it has acted. A served sentence is never set again. Nothing is written for a holder who is not a live `vindictive` holder who knows the crime,
 * and nothing here draws: a week is `floor((day - start) / weekDays)`.
 */
import { plainDraft } from '../../../content/draft';
import type { CrimeEchoEntry } from '../../../content/schemas';
import type { Registries } from '../../../content/types';
import { deliverRule, proposeRuleHashed } from '../../bonds/rules';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { regardRise } from '../../dynamic/regard';
import { personalOf } from '../../personal/state';
import { handoverAllowed } from '../../practice/handover';
import { cancelBookingsQuietly } from '../../practice/forget';
import { registerOffenceNoted, registerPunishmentTilt } from '../../practice/offences';
import { requestPractice } from '../../practice/request';
import { taskRoom } from '../../practice/tasks';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { craftHolders, craftLive } from '../gate';
import { craftRoll } from '../state';
import { hasStyle } from './slots';

export const VINDICTIVE_STYLE = 'vindictive';
const T = TUNING.craft.sentence;

type Sentence = NonNullable<NonNullable<CampaignState['relations'][string]['craft']>['sentence']>;
type EchoEffect = CrimeEchoEntry['effects'][number];

/** The echo row of the commander's crime, by its `crime` field (registry order, the first). */
export const echoOf = (reg: Registries, crimeId: string): CrimeEchoEntry | undefined =>
  ([...reg.crimeEchoes.values()] as unknown as CrimeEchoEntry[]).find((e) => e.crime === crimeId);

/** The effects of the echo of a sentence (none for a crime with no row). */
export const effectsOf = (reg: Registries, sentence: Pick<Sentence, 'crimeId'>): EchoEffect[] => echoOf(reg, sentence.crimeId)?.effects ?? [];

/** Does the sentence's echo act by this effect type? */
export const hasEcho = (reg: Registries, sentence: Pick<Sentence, 'crimeId'>, type: EchoEffect['type']): boolean => effectsOf(reg, sentence).some((fx) => fx.type === type);

/** Her sentence while it runs (set and not yet served), or `undefined`. */
export function sentenceOf(state: Pick<CampaignState, 'relations'>, unitId: string): Sentence | undefined {
  const s = state.relations[unitId]?.craft?.sentence;
  return s !== undefined && s.servedDay === undefined ? s : undefined;
}

/** The days of her term left, counted from today (0 on the last day). */
export const daysLeft = (state: Pick<CampaignState, 'day'>, sentence: Sentence): number => Math.max(0, sentence.until - state.day);

const isVindictive = (state: CampaignState, reg: Registries, unitId: string): boolean => craftLive(state, reg, unitId) && hasStyle(state, unitId, VINDICTIVE_STYLE);

/** The punishments her sentence puts first: the `punish` lists of the effects of its echo (a running sentence of a live holder only), else `null` (P16's turns are as they were). */
function tilt(state: CampaignState, reg: Registries, holderId: string): readonly string[] | null {
  const sentence = sentenceOf(state, holderId);
  if (sentence === undefined || !isVindictive(state, reg, holderId)) return null;
  const types = effectsOf(reg, sentence).flatMap((fx) => fx.punish ?? []);
  return types.length === 0 ? null : types;
}

/** A slip of the commander toward her adds days to the term (a reader of P16's offences): at most once a day, however many slips that day. */
function extend(draft: CampaignState, _ctx: Pick<EngineCtx, 'registries'>, holderId: string): EngineEvent[] {
  const sentence = sentenceOf(draft, holderId);
  if (sentence === undefined || !isVindictive(draft, _ctx.registries, holderId) || sentence.extendedDay === draft.day) return []; // once a day, however many slips
  sentence.extendedDay = draft.day;
  sentence.until += T.extend;
  sentence.extended += T.extend;
  return [{ type: 'sentence_extended', unitId: holderId, holderId, days: T.extend }];
}

/** Plugs the sentence into the practices (the punishment tilt, the slip). Idempotent. */
export function installSentenceHooks(): void {
  registerPunishmentTilt(tilt);
  registerOffenceNoted((draft, ctx, holderId) => extend(draft, ctx, holderId));
}

/**
 * Who edits a message of the commander's now because of a sentence (the forced editor, `through_her`): a live holder whose running sentence echoes by `through_her`, for a message to someone else, while the
 * device may be used that way (the intercept's own category and her limits). The first in squad order, else `null`. Reads only.
 */
export function sentenceEditor(state: CampaignState, reg: Registries, toUnitId?: string): string | null {
  for (const id of craftHolders(state, reg)) {
    const sentence = sentenceOf(state, id);
    if (id === toUnitId || sentence === undefined || !hasStyle(state, id, VINDICTIVE_STYLE) || !hasEcho(reg, sentence, 'through_her') || !handoverAllowed(state, reg, id, 'device')) continue;
    return id;
  }
  return null;
}

/** Takes the next booking of another woman (the earliest still booked) out of the calendar, quietly: a hold that ends with no cost to the commander. */
function giveUpBooking(draft: CampaignState, holderId: string): boolean {
  const next = (draft.personal?.bookings ?? []).filter((b) => b.status === 'booked' && b.unitId !== holderId).sort((a, b) => a.day - b.day || ['morning', 'afternoon', 'evening'].indexOf(a.slot) - ['morning', 'afternoon', 'evening'].indexOf(b.slot))[0];
  if (next === undefined) return false;
  cancelBookingsQuietly(draft, [next.id]);
  return true;
}

/** What one week of the term does, by the effect type of the echo. Returns the events and whether the echo acted. */
function weekly(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, fx: EchoEffect): { events: EngineEvent[]; acted: boolean } {
  const reg = ctx.registries;
  switch (fx.type) {
    case 'give_up':
      return { events: [], acted: giveUpBooking(draft, holderId) };
    case 'through_her':
      return { events: [], acted: true };
    case 'experiment': {
      if (!taskRoom(draft, reg, holderId) || (draft.practices?.requests ?? []).some((r) => r.holderId === holderId)) return { events: [], acted: false };
      const events = requestPractice(draft, ctx, holderId, 'task', { echo: 'experiment' });
      return { events, acted: events.length > 0 };
    }
    case 'obey_day': {
      const personal = personalOf(draft);
      if (personal.obedience !== undefined && personal.obedience.day > draft.day) return { events: [], acted: false }; // one is waiting already
      personal.obedience = { unitId: holderId, day: draft.day + 1, who: 'commander' };
      return { events: [], acted: true };
    }
    case 'answer_first': {
      const proposed = proposeRuleHashed(draft, reg, holderId, craftRoll(draft, holderId, 'sentence:rule'), { practice: true, echo: 'answer_first' });
      const proposal = proposed.find((e) => e.type === 'rule_proposed');
      if (proposal === undefined) return { events: [], acted: false };
      const rule = draft.bonds!.rules.find((r) => r.id === proposal.ruleId)!;
      return { events: [...proposed, ...deliverRule(draft, rule.id, plainDraft(rule.text))], acted: true };
    }
    case 'tithe': {
      const resource = draft.resources.plyx >= fx.plyx && fx.plyx > 0 ? 'plyx' : 'credits';
      const want = resource === 'plyx' ? fx.plyx : fx.credits;
      const taken = Math.min(want, draft.resources[resource]);
      if (!(taken > 0)) return { events: [], acted: false };
      draft.resources[resource] -= taken;
      return { events: [{ type: 'resource_changed', resource, amount: -taken }], acted: true };
    }
  }
}

/**
 * The day step (at the end of `draft.day`): a live `vindictive` holder who knows the crime and has no sentence sets one; a running one serves out (`sentence_served`, a closing rise of Regard for dignity)
 * or has its week's echo act (once for each week of the term, from the day it was set; a week where it found nothing to act on is tried again the next day). Nothing for a woman who is not live (the sentence waits).
 */
export function vindictiveDayStep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const unitId of craftHolders(draft, reg)) {
    if (!hasStyle(draft, unitId, VINDICTIVE_STYLE)) continue;
    const rel = draft.relations[unitId]!;
    const crimeId = draft.commander.crimeId;
    if (rel.craft?.sentence === undefined) {
      if (crimeId === null || !rel.flags.includes('knows_crime')) continue;
      const days = echoOf(reg, crimeId)?.days ?? T.defaultDays;
      (rel.craft ??= {}).sentence = { crimeId, start: draft.day, until: draft.day + days, extended: 0 };
      events.push({ type: 'sentence_set', unitId, holderId: unitId, days });
    }
    const sentence = sentenceOf(draft, unitId);
    if (sentence === undefined) continue;
    if (draft.day >= sentence.until) {
      sentence.servedDay = draft.day;
      events.push({ type: 'sentence_served', unitId, holderId: unitId }, ...regardRise(draft, reg, unitId, 'dignity', TUNING.regard.rise.dignity * T.closing));
      continue;
    }
    const week = Math.floor((draft.day - sentence.start) / T.weekDays);
    if (week <= (sentence.week ?? -1)) continue;
    let acted = false; // a week that found nothing to act on (no booking to give up, no room for a task, nothing to take) is tried again the next day
    for (const fx of effectsOf(reg, sentence)) {
      const done = weekly(draft, ctx, unitId, fx);
      events.push(...done.events);
      acted ||= done.acted;
    }
    if (acted) {
      sentence.week = week;
      sentence.landed = true;
    }
  }
  return events;
}
