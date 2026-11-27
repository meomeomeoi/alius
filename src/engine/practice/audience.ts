/**
 * Who may be shown a demonstration and who watches it (P16, plan R9): the gate of her profile (`demonstrationGate`) and the audience by her appetite (`pickAudience`). Split from
 * `demonstration.ts` so that the validator can read both without importing the writers. Reads only; draws nothing (the whereabouts are derived, the leader and the close units are
 * read from the state).
 */
import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { frameRank } from '../blocking/state';
import { isClose } from '../dynamic/knowledge';
import { practiceOf } from '../dynamic/profile';
import { dynamicOf } from '../dynamic/state';
import { whereaboutAt } from '../hub';
import { leaderOf } from '../power/state';
import type { CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { practiceLive } from './gate';
import { atBase } from './offences';

/** A demonstration that shows her hold in a way that lowers the commander before others is humbling (it needs `public_humiliation`, and only it is seen outside). */
export const HUMBLING_TAG = 'public_humiliation';
export const isHumbling = (tags: readonly string[]): boolean => tags.includes(HUMBLING_TAG);

/** Where a demonstration for a slot is staged: the mess hall in the evening, else her quarters (`TUNING.practice.demonstration.stage`). */
export function stageOf(slot: Slot): string {
  const S = TUNING.practice.demonstration.stage;
  return S[slot] ?? S.other;
}

/** The hub room that hosts a location (read by `sceneLocationId`), if the pack has one. */
const roomOfLocation = (reg: Registries, locationId: string): string | undefined => [...reg.hubRooms.values()].find((r) => r.sceneLocationId === locationId)?.id;

/**
 * Her few (`select_few`): the squad's leader and the units close to the commander, living named units other than her, at base. One set for `pickAudience` and for P15b's face of a scene
 * (`faceNow`: before whom she shows her manner). Reads only.
 */
export function selectFewOf(state: CampaignState, _reg: Registries, holderId: string): string[] {
  const leaderId = leaderOf(state)?.id;
  return atBase(state, holderId).filter((id) => id === leaderId || isClose(state, id));
}

/**
 * Who would watch, by her `audience` (R9): `select_few` the squad's leader and the units close to the commander, `show_off` the units whose whereabout at the stage slot is the stage room
 * (every unit at base when the pack has no such room); `private_only`, `indifferent` and a profile that says nothing, nobody. Always living named units other than her, at base.
 * At most `cardsMax` are on the card (squad order); the rest are narrated as present at the stage.
 */
export function pickAudience(state: CampaignState, reg: Registries, holderId: string, slot: Slot): { cards: string[]; narrated: string[] } {
  const audience = practiceOf(state, reg, holderId)?.audience;
  const base = atBase(state, holderId);
  let pool: string[] = [];
  if (audience === 'select_few') {
    pool = selectFewOf(state, reg, holderId);
  } else if (audience === 'show_off') {
    const room = roomOfLocation(reg, stageOf(slot));
    pool = room === undefined ? base : base.filter((id) => whereaboutAt(state, reg, id, state.day, slot).roomId === room);
  }
  const max = TUNING.practice.demonstration.cardsMax;
  return { cards: pool.slice(0, max), narrated: pool.slice(max) };
}

/**
 * Whether she may stage a demonstration now, as the reason it is refused or `null` when it may be (R9). Her `audience` must not be `private_only` or `indifferent`; her frame is `play`
 * or beyond, and `role` or beyond for a card above tier 2; every tag of the card must be switched on and not among her limits (a humbling one needs `public_humiliation`, one of
 * service alone needs `service`); someone must be there to watch. Without a card it is the gate of the holder (some form could still stand: the seeds are gated by content already).
 */
export function demonstrationGate(state: CampaignState, reg: Registries, holderId: string, card?: { tags: readonly string[]; tier?: number }): string | null {
  if (!practiceLive(state, reg, holderId)) return 'She is not holding now.';
  const audience = practiceOf(state, reg, holderId)?.audience;
  if (audience === undefined || audience === 'private_only') return 'She keeps it private.';
  if (audience === 'indifferent') return 'She does not stage it.';
  const frame = dynamicOf(state, holderId)?.frame ?? 'equal';
  if (frameRank(frame) < frameRank('play')) return 'Her hold is too light for it.';
  if (card?.tier !== undefined && card.tier > 2 && frameRank(frame) < frameRank('role')) return 'Her hold is too light for something that heavy.';
  const tags = card?.tags ?? [];
  if (card === undefined ? !['service', HUMBLING_TAG].some((t) => contentAllowed(state, reg, { contentTags: [t] }, holderId)) : tags.length === 0 || tags.some((t) => !contentAllowed(state, reg, { contentTags: [t] }, holderId))) {
    return 'That is not switched on.';
  }
  const watchers = pickAudience(state, reg, holderId, TUNING.practice.demonstration.slot);
  return watchers.cards.length + watchers.narrated.length === 0 ? 'Nobody would see it.' : null;
}
