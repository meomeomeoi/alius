/**
 * Unasked care (P16b, plan Task 15; spec section 10, rulings 7 and 18). A free slot spent on her without her asking: the commander's dynamic rows of `blockingActivities` that
 * carry a `care` field (cleaning her boots, tidying her quarters, ...), given through the action `care/unasked { unitId, careId }`, one slot each.
 *
 * - Whether she notices is a hashed roll (`noticesCare`: `craftRoll` over her insight times the row's `care.notice`): the same on the same day, no draw. It is kept in
 *   `Relation.craft.cares` and stays hidden until she shows it: nothing the action says (an event, a toast) depends on it.
 * - She shows it when she next appears (a scene with her, a DM she sends): the noticed care lands (`landCares`) as the relation event `care_noticed` (its journal line and
 *   memory rule), and from `play` on it is favour, a `yielded` sample with the motive `her` and Regard; at `equal` it is only the noticing.
 * - The fourth shown care in 7 days, by a woman at `equal` on the hold band `testing` who has a manner block and is `regal` or curious, marks that care `named`: her line is offered once
 *   (`craft:named_service:<unitId>`). A line, not an event: no memory rule.
 *
 * Reads and writes only for a woman toward whom care is open (`careOpen`); draws nothing.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { consumeSlots } from '../calendar';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addFavour } from '../dynamic/favour';
import { holdBandOf } from '../dynamic/hold';
import { mannerOf } from '../dynamic/manner';
import { styleOf } from '../dynamic/profile';
import { regardRise } from '../dynamic/regard';
import { dynamicOf } from '../dynamic/state';
import { keyPlaceAt, heldNow } from '../practice/held';
import { practiceSample } from '../practice/sample';
import { applyEventToUnit } from '../relations/effects';
import type { EventIntent } from '../relations/intents';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { careOpen } from './gate';
import { craftRoll, type RelationCraft } from './state';

export type CareEntry = NonNullable<RelationCraft['cares']>[number];
export interface CareKind { id: string; notice: 'low' | 'high'; label: string; promptHint: string }

/** The cares there are: the commander's dynamic rows with a `care` field, in registry order. */
export function careKinds(reg: Registries): CareKind[] {
  const out: CareKind[] = [];
  for (const a of reg.blockingActivities.values()) {
    const care = (a as { care?: { notice?: 'low' | 'high' } }).care;
    if (care?.notice === undefined || a.actor !== 'commander' || a.scope !== 'dynamic') continue;
    out.push({ id: String(a.id), notice: care.notice, label: String(a.label), promptHint: String(a.promptHint) });
  }
  return out;
}

/** The chance she notices a care: its row's `care.notice` times her insight (`Unit.insight`), at most 1. */
export function careNoticeChance(state: Pick<CampaignState, 'squad'>, unitId: string, row: Pick<CareKind, 'notice'>): number {
  const insight = state.squad.find((u) => u.id === unitId)?.insight ?? 'mid';
  return Math.min(1, TUNING.craft.care.notice[row.notice] * TUNING.craft.care.insight[insight]);
}

/** Does she notice this care today? A hashed roll: the same for the same day and care, nothing drawn. */
export function noticesCare(state: Pick<CampaignState, 'squad' | 'dynamic' | 'day'>, unitId: string, row: Pick<CareKind, 'id' | 'notice'>): boolean {
  return craftRoll(state, unitId, `care|${state.day}|${row.id}`) < careNoticeChance(state, unitId, row);
}

/** The cares she showed within `nameDays` of `day` (noticed and landed), oldest first. */
export function shownCares(state: Pick<CampaignState, 'relations'>, unitId: string, day: number): CareEntry[] {
  return (state.relations[unitId]?.craft?.cares ?? []).filter((c) => c.noticed && c.voiced === true && day - c.day <= TUNING.craft.care.nameDays);
}

/**
 * May she name the service now: the shown cares of the week reach `nameAt`, none of them already named, she is at frame `equal` on the hold band `testing`, has a manner block and is
 * `regal` (read through `styleOf`) or curious (`mannerOf`: `curiosity` at `nameCuriosity` or more).
 */
export function namesService(state: CampaignState, reg: Registries, unitId: string): boolean {
  const T = TUNING.craft.care;
  const dyn = dynamicOf(state, unitId);
  const unit = state.squad.find((u) => u.id === unitId);
  if (dyn === undefined || unit === undefined || dyn.frame !== 'equal' || holdBandOf(reg, dyn.hold) !== T.nameBand) return false;
  const manner = mannerOf(state, reg, unitId);
  if (manner === null) return false;
  const style = styleOf(unit)?.primary;
  if (style !== 'regal' && manner.axes.curiosity < T.nameCuriosity) return false;
  const shown = shownCares(state, unitId, state.day);
  return shown.length >= T.nameAt && !shown.some((c) => c.named === true);
}

/** Is she with the commander in this slot (in a scene with the commander, holding the commander, or in the commander's cabin by her key)? */
export function withCommander(state: CampaignState, unitId: string): boolean {
  return state.scene?.participants.includes(unitId) === true || heldNow(state)?.by === unitId || keyPlaceAt(state, unitId, state.day, state.slot);
}

/** Why the commander cannot do this care now, or `null`. (A due booking is the dispatch guard's.) */
export function careReason(state: CampaignState, reg: Registries, unitId: string, careId: string): string | null {
  const row = careKinds(reg).find((r) => r.id === careId);
  if (row === undefined) return 'That is not something to do for her unasked.';
  if (!careOpen(state, reg, unitId)) return 'There is nothing between the commander and her yet that makes this a kindness.';
  if (state.scene) return 'A conversation is open.';
  if (state.calendar.pendingScene) return 'A talk is waiting for its scene.';
  if (state.expedition) return 'The squad is out.';
  if (state.dilemmas?.open?.status === 'presented') return 'A decision is waiting.';
  if (state.calendar.nightEvent) return 'Someone is at the door.';
  if (state.slot === 'night') return 'Not at night.';
  if (heldNow(state) !== null && heldNow(state)?.by !== unitId) return 'The commander is held: a slot is not the commander\'s to spend.';
  if (withCommander(state, unitId)) return 'She is with the commander: it would not be unasked.';
  if ((state.relations[unitId]?.craft?.cares ?? []).some((c) => c.careId === careId && c.day === state.day)) return `${row.label} was done today.`;
  return null;
}

/** Forgets the cares older than `keepDays`; nothing is written while there are none. */
function prune(draft: CampaignState, unitId: string): void {
  const craft = draft.relations[unitId]?.craft;
  if (craft?.cares === undefined) return;
  craft.cares = craft.cares.filter((c) => draft.day - c.day <= TUNING.craft.care.keepDays);
  if (craft.cares.length === 0) delete craft.cares;
}

/**
 * The commander does something for her unasked: one slot, the care written for the day with her hidden noticing, and `care_unasked` (the same whether she noticed or not). Throws with the
 * reason when it cannot be done. Draws no rng.
 */
export function giveCare(draft: CampaignState, ctx: EngineCtx, unitId: string, careId: string): EngineEvent[] {
  const reason = careReason(draft, ctx.registries, unitId, careId);
  if (reason !== null) throw new Error(reason);
  const row = careKinds(ctx.registries).find((r) => r.id === careId)!;
  const craft = ((draft.relations[unitId]!).craft ??= {});
  (craft.cares ??= []).push({ day: draft.day, careId, noticed: noticesCare(draft, unitId, row) });
  prune(draft, unitId);
  return [{ type: 'care_unasked', unitId, careId }, ...consumeSlots(draft, 1, ctx)];
}

/**
 * She shows what she noticed (a scene with her opens, or she writes): each noticed care that has not landed lands as `care_noticed` (a relation event: its journal line and its
 * memory rule); from `play` on it is also favour, a `yielded` sample with the motive `her` and Regard. Then, if the week's shown cares and her way allow it, the latest of them is
 * marked `named` (`namesService`): her line is offered once, in this scene. Nothing for a woman toward whom care is not open; draws nothing.
 */
export function landCares(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, sceneId: string): EngineEvent[] {
  const reg = ctx.registries;
  const cares = draft.relations[unitId]?.craft?.cares;
  if (cares === undefined || !careOpen(draft, reg, unitId)) return [];
  prune(draft, unitId);
  const events: EngineEvent[] = [];
  const dyn = dynamicOf(draft, unitId);
  const from = frameRank('play');
  for (const c of draft.relations[unitId]?.craft?.cares ?? []) {
    if (!c.noticed || c.voiced === true) continue;
    c.voiced = true;
    c.scene = sceneId;
    events.push({ type: 'care_noticed', unitId, careId: c.careId });
    events.push(...applyEventToUnit(draft, reg, unitId, { type: 'care_noticed', actor: 'commander', targets: [unitId], severity: 'minor', evidence: 'she saw what the commander did for her', confidence: 1 } as EventIntent));
    if (dyn !== undefined && frameRank(dyn.frame) >= from) {
      addFavour(draft, unitId, TUNING.craft.care.favour);
      events.push(...practiceSample(draft, reg, unitId, 'yielded', { motive: 'her' }));
      events.push(...regardRise(draft, reg, unitId, 'value', TUNING.regard.value.min));
    }
  }
  if (namesService(draft, reg, unitId)) {
    const last = [...shownCares(draft, unitId, draft.day)].sort((a, b) => b.day - a.day).find((c) => c.scene === sceneId);
    if (last !== undefined) last.named = true;
  }
  return events;
}
