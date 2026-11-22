/**
 * Handing things over (P16, plan R17, spec §R.6): the commander puts something in a holder's hands of the commander's own accord: the device for a day (every message to another goes through her first), the key to
 * the quarters for some days (she may be in the commander's cabin at any slot) or the calendar for some days (she fills the commander's free slots). It is a severe accept from the commander's side: the card asks for
 * the words and the signature (`practice/hand_over` writes the card, the words and `practice/sign` give it), and what it means is for her to read: it cost the commander something after resistance, or it was only what
 * a commander who always yields does. Taking it back before the term is a refusal at severe. Nothing here draws: the key's roll is hashed (`keyPlaceAt`).
 */
import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { regardFall, regardRise } from '../dynamic/regard';
import { dynamicOf } from '../dynamic/state';
import { addSign } from '../dynamic/knowledge';
import { practiceOf } from '../dynamic/profile';
import { whereabouts } from '../hub';
import { book, bookingKindsFor } from '../personal/bookings';
import type { Booking, CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { cancelBookingsQuietly } from './forget';
import { keyPlaceAt } from './held';
import { practiceSample } from './sample';
import { HANDOVER_KINDS, type HandoverKind, type PracticeState, type Task } from './state';
import { refusePractice } from './tasks';

type Handover = PracticeState['handovers'][number];

const NUMBER_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'] as const;
const forWords = (days: number): string => `for ${NUMBER_WORDS[days] ?? 'several'} day${days === 1 ? '' : 's'}`;

/** The words of the card and the record: what is given and for how long, never a number and never a pronoun for the commander. */
function wordsOf(state: CampaignState, holderId: string, kind: HandoverKind, days: number): { text: string; summary: string } {
  const T = TUNING.practice.handover;
  const name = state.squad.find((u) => u.id === holderId)?.displayName ?? holderId;
  const fill = (line: string): string => line.replaceAll('{name}', name).replaceAll('{what}', T.what[kind]).replaceAll('{for}', forWords(days));
  return { text: fill(T.text), summary: fill(T.summary) };
}

/** The handover of this kind she has, or the card for one that waits. */
const standing = (state: CampaignState, holderId: string, kind: HandoverKind): Handover | undefined => state.practices?.handovers.find((h) => h.holderId === holderId && h.kind === kind);
const waiting = (state: CampaignState, holderId: string, kind: HandoverKind): Task | undefined => state.practices?.tasks.find((t) => t.holderId === holderId && t.handover === kind && t.status === 'offered');

/** Does the content this kind of handover needs allow it for her: every tag on and none among her own limits (the gate of the intercept for the device). */
export const handoverAllowed = (state: CampaignState, reg: Registries, holderId: string, kind: HandoverKind): boolean =>
  contentAllowed(state, reg, { contentTags: TUNING.practice.handover.contentTags[kind] }, holderId);

/**
 * Why the commander cannot hand this to her now, or `null`: no such kind, a number of days it cannot be given for (a device is one day, a key one to seven, a calendar one to three), a holder who is not holding, or one of that kind
 * that she has already or that waits for the words. Reads only.
 */
export function handoverProblem(state: CampaignState, reg: Registries, holderId: string, kind: unknown, days: unknown): string | null {
  if (typeof kind !== 'string' || !(HANDOVER_KINDS as readonly string[]).includes(kind)) return 'The commander can hand her the device, the key or the calendar.';
  const range = TUNING.practice.handover.days[kind as HandoverKind];
  if (typeof days !== 'number' || !Number.isInteger(days) || days < range.min || days > range.max) return `That is not a number of days it can be given for.`;
  if (!practiceLive(state, reg, holderId)) return 'She is not holding now.';
  if (!handoverAllowed(state, reg, holderId, kind as HandoverKind)) return 'Jealousy games are off.'; // the device is the intercept of P9c: its category, and her own limits
  if (standing(state, holderId, kind as HandoverKind) !== undefined || waiting(state, holderId, kind as HandoverKind) !== undefined) return 'She has that already.';
  return null;
}

/**
 * `practice/hand_over { holderId, kind, days }`: writes the card the commander says yes to (R17): a signed task of weight severe that names what it hands over; nothing is given until the words are said and it is
 * signed (`handOver`). The card waits a day. Throws with `handoverProblem`'s reason. Draws nothing.
 */
export function offerHandover(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, kind: unknown, days: unknown): EngineEvent[] {
  const why = handoverProblem(draft, ctx.registries, holderId, kind, days);
  if (why !== null) throw new Error(why);
  const k = kind as HandoverKind;
  const n = days as number;
  const { text, summary } = wordsOf(draft, holderId, k, n);
  const id = nextPracticeId(draft, 'pt');
  ensurePractices(draft).tasks.push({
    id, holderId, kind: 'task', tags: [], track: TUNING.practice.routine.track, tier: 1, stakes: 'severe', check: 'model', proof: 'none', text, summary, plain: true, status: 'offered', acceptForm: 'signed',
    day: draft.day, deadline: { day: draft.day + TUNING.practice.handover.cardDays }, handover: k, handoverDays: n,
  });
  return [{ type: 'task_issued', taskId: id, holderId, kind: 'task', handover: true, handoverKind: k }];
}

/**
 * The commander signed: it is hers now (R17). The handover is written (`practices.handovers`), `handover_given` says so (the memory rule remembers it for the pair), and her reading of it follows: after
 * resistance (readiness 0 or less) her Regard rises for what it cost and she reads a yield for her; after a commander who always yields (readiness above a half) `ritual`, `cold` and `regal` lose a little
 * respect, the others nothing. Called when the card's task opens.
 */
export function handOver(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, task: Pick<Task, 'id' | 'holderId' | 'handover' | 'handoverDays'>): EngineEvent[] {
  const reg = ctx.registries;
  const kind = task.handover!;
  const days = task.handoverDays ?? 1;
  const holderId = task.holderId;
  const id = nextPracticeId(draft, 'ph');
  ensurePractices(draft).handovers.push({ id, kind, holderId, untilDay: kind === 'calendar' ? draft.day + days : draft.day + days - 1, days, taskId: task.id });
  const events: EngineEvent[] = [{ type: 'handover_given', unitId: holderId, holderId, handoverId: id, kind, days }];
  const r = dynamicOf(draft, holderId)?.readOf.r;
  if (r !== undefined && r <= 0) {
    events.push(...regardRise(draft, reg, holderId, 'cost'), ...practiceSample(draft, reg, holderId, 'yielded', { motive: 'her' }));
  } else if (r !== undefined && r > 0.5) {
    const style = practiceOf(draft, reg, holderId)?.style.primary;
    if (style === 'ritual' || style === 'cold' || style === 'regal') events.push(...regardFall(draft, reg, holderId, 1, { witness: false, cause: 'handover' }));
  }
  return events;
}

/**
 * `practice/take_back { handoverId }`: the commander takes it back before the term is out: a refusal at stakes severe (the P9 path, `refused_demand` at extreme, hold by her frame, an offence at `role` or beyond),
 * and the handover ends (`handover_ended`, `taken_back`). Closes what exists: it needs no live holder (then it ends with no refusal). Throws for one that is gone.
 */
export function takeBack(draft: CampaignState, ctx: EngineCtx, handoverId: string): EngineEvent[] {
  const p = draft.practices;
  const h = p?.handovers.find((x) => x.id === handoverId);
  if (p === undefined || h === undefined) throw new Error('That handover is gone.');
  p.handovers = p.handovers.filter((x) => x !== h);
  if (h.kind === 'calendar') cancelBookingsQuietly(draft, bookingsOf(draft).filter((b) => b.practiceId === h.id && b.status === 'booked').map((b) => b.id)); // the days its sweep already filled: no second cost on top of the refusal
  const events: EngineEvent[] = [{ type: 'handover_ended', handoverId, holderId: h.holderId, kind: h.kind, reason: 'taken_back' }];
  if (practiceLive(draft, ctx.registries, h.holderId)) {
    const what = TUNING.practice.handover.what[h.kind];
    events.push(...refusePractice(draft, ctx, h.holderId, { ref: h.id, stakes: 'severe', summary: `took back ${what}` }));
  }
  return events;
}

const SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];
const bookingsOf = (state: CampaignState): Booking[] => state.personal?.bookings ?? [];

/** The first booking kind that fits a slot among the ones her tier allows (registry order), else the held kind (the commander's slot is hers, whatever she does with it). `undefined` when the pack has neither. */
function kindFor(state: CampaignState, reg: Registries, holderId: string, slot: Slot): string | undefined {
  const fit = bookingKindsFor(state, reg, holderId).find((k) => k.slot === slot);
  if (fit !== undefined) return String(fit.id);
  const held = [...reg.bookingKinds.values()].find((k) => k.held === true);
  return held === undefined ? undefined : String(held.id);
}

/**
 * The day step's part (R7.7), at the end of `draft.day`: the calendar she has books every free slot of tomorrow with her (`book`, `source: 'practice'`, `practiceId` her handover), once a day; then what runs out with
 * today ends (`handover_ended`, `ran_out`). A free slot is one nobody has booked. Nothing for no handover. Draws nothing.
 */
export function handoverSweep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const p = draft.practices;
  if (p === undefined || p.handovers.length === 0) return [];
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  const tomorrow = draft.day + 1;
  for (const h of p.handovers) {
    if (h.kind !== 'calendar' || h.untilDay < tomorrow || !practiceLive(draft, reg, h.holderId)) continue;
    for (const slot of SLOTS) {
      if (bookingsOf(draft).some((b) => b.day === tomorrow && b.slot === slot && (b.status === 'booked' || b.status === 'played'))) continue;
      const kindId = kindFor(draft, reg, h.holderId, slot);
      if (kindId === undefined) continue;
      events.push(...book(draft, ctx, { unitId: h.holderId, kindId, day: tomorrow, slot, source: 'practice' }));
      bookingsOf(draft).at(-1)!.practiceId = h.id;
    }
  }
  for (const h of [...p.handovers]) {
    if (h.untilDay > draft.day) continue;
    p.handovers = p.handovers.filter((x) => x !== h);
    events.push({ type: 'handover_ended', handoverId: h.id, holderId: h.holderId, kind: h.kind, reason: 'ran_out' });
  }
  return events;
}

/**
 * The holder whose hand is on the commander's device today (a device handover that stands), other than the one the message is for; `null` when nobody has it. The first in the order they were given. She must be live
 * (the dynamic not opted out, something she practises on, a frame of `play` or beyond) and the device must still pass the gate of the intercept (`jealousy_games` on and not among her limits). Reads only.
 */
export function deviceHolderOf(state: CampaignState, reg: Registries, toUnitId?: string): string | null {
  const h = state.practices?.handovers.find((x) => x.kind === 'device' && x.untilDay >= state.day && x.holderId !== toUnitId && practiceLive(state, reg, x.holderId) && handoverAllowed(state, reg, x.holderId, 'device'));
  return h?.holderId ?? null;
}

/**
 * The after-action of the key (registered by `actions/practice.ts`): when a slot or a day begins and a holder with the key is in the commander's cabin by the hashed roll (`keyPlaceAt`: the hub puts her there),
 * every other unit at the hub sees her come out: `leaving_quarters` for each. Once a slot. Nothing without a key.
 */
export function keySeen(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  if (!events.some((e) => e.type === 'slot_advanced' || e.type === 'day_started')) return [];
  const keys = (draft.practices?.handovers ?? []).filter((h) => h.kind === 'key' && h.untilDay >= draft.day);
  if (keys.length === 0) return [];
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  const here = reg.hubRooms.size === 0 ? [] : whereabouts(draft, reg);
  for (const h of keys) {
    if (!practiceLive(draft, reg, h.holderId) || !keyPlaceAt(draft, h.holderId, draft.day, draft.slot)) continue;
    for (const w of here) {
      if (w.unitId === h.holderId || w.roomId === null) continue;
      out.push(...addSign(draft, ctx, w.unitId, h.holderId, 'leaving_quarters'));
    }
  }
  return out;
}

