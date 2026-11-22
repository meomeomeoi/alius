/**
 * Unfairness (P16, plan R16, spec §R.10): a holder whose `fairness` allows it (and whose mood sharpens it) now and then does something the commander cannot answer with a fair account. Each day step
 * a live holder has her day's chance (`unfairChance`); a hit picks one of four kinds from what could happen now: `no_guilt` (a punishment for nothing: a request with the offence `unfair`, her
 * fact hidden from the commander), `double_standard` (she breaks what she demands, in her next scene), `cancelled_reward` (her next kept task gives no hold) or `moved_goal` (her next hold runs
 * one slot past its end). The three that wait are kept in `practices.unfair` until a scene, a kept task or a hold uses them, or a week goes by. Nothing here draws: every chance and pick is `practiceRoll`.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { practiceOf } from '../dynamic/profile';
import { temperamentOf } from '../life/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, practiceHolders, practiceLive } from './gate';
import { pickHolderPunishment, punishmentOpen, severityOf, severityOfEntry } from './offences';
import { requestPractice } from './request';
import { practiceRoll, UNFAIR_KINDS, type UnfairKind } from './state';

/** Her chance of doing something unfair on a day step: by her `fairness` (R.12), one and a half times for a moody one. 0 for `fair` and for a unit with no profile. Reads only. */
export function unfairChance(state: CampaignState, reg: Registries, holderId: string): number {
  const T = TUNING.practice.unfairness;
  const fairness = practiceOf(state, reg, holderId)?.fairness;
  const base = fairness === undefined ? 0 : T[fairness] ?? 0;
  return Math.min(1, base * (temperamentOf(state, holderId).volatility === 'moody' ? T.moody : 1));
}

/** The unfairness she has in hand and has not used (optionally of one kind). */
export function pendingUnfair(state: Pick<CampaignState, 'practices'>, holderId: string, kind?: UnfairKind): NonNullable<NonNullable<CampaignState['practices']>['unfair']>[string] | undefined {
  const rec = state.practices?.unfair?.[holderId];
  return rec !== undefined && rec.used !== true && (kind === undefined || rec.kind === kind) ? rec : undefined;
}

/** Uses up what she had in hand of this kind: whether there was one. */
export function takeUnfair(draft: CampaignState, holderId: string, kind: UnfairKind): boolean {
  const rec = pendingUnfair(draft, holderId, kind);
  if (rec === undefined) return false;
  rec.used = true;
  delete rec.sceneId;
  return true;
}

/** The weight a punishment without guilt takes: the offence is a minor one. */
const MINOR = { stakes: 'minor' } as const;

/** What could be done to the commander now, in the order of `UNFAIR_KINDS` (a punishment that could be given; a hold that could be moved needs `restraint`). Reads only. */
export function possibleUnfair(state: CampaignState, reg: Registries, holderId: string): UnfairKind[] {
  const on = state.content?.enabled ?? [];
  return UNFAIR_KINDS.filter((kind) => {
    if (kind === 'no_guilt') return !punishmentOpen(state, holderId) && pickHolderPunishment(state, reg, holderId, severityOf(state, reg, holderId, MINOR)) !== null;
    if (kind === 'moved_goal') return on.includes('restraint');
    return true;
  });
}

/**
 * Does one unfair thing (R16). `no_guilt` writes a request for a punishment of hers with the offence `unfair` (a minor one the engine picked an entry for; no repeat is entered), `unfair: true` on the
 * offence so the issued event and her hidden fact carry it. The other three are kept in `practices.unfair` for what will use them. Returns the request's events (none for the three that wait). Draws nothing.
 */
export function applyUnfair(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, kind: UnfairKind): EngineEvent[] {
  const reg = ctx.registries;
  const p = ensurePractices(draft);
  const unfair = (p.unfair ??= {});
  if (kind !== 'no_guilt') {
    unfair[holderId] = { kind, day: draft.day };
    return [];
  }
  const severity = severityOf(draft, reg, holderId, MINOR);
  const entryId = pickHolderPunishment(draft, reg, holderId, severity);
  if (entryId === null) return [];
  unfair[holderId] = { kind, day: draft.day, used: true };
  return requestPractice(draft, ctx, holderId, 'punishment', { offence: { kind: 'unfair', stakes: 'minor', day: draft.day, unfair: true }, severity: severityOfEntry(reg, entryId) ?? severity, entryId, unfair: 'no_guilt' });
}

/**
 * The day step's unfairness (R7.6): what is used up or stale goes (a record of an earlier day that is used, one that waited longer than `TUNING.practice.unfair.days`); then each live holder with nothing in hand
 * has her day's chance (`practiceRoll(her, 'unfair')`) and, on a hit, one of what could happen now by `practiceRoll(her, 'unfair:kind')`. Nothing for a holder who is not live, and nothing written for nobody live.
 */
export function unfairSweep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const unfair = draft.practices?.unfair;
  if (unfair !== undefined) {
    for (const [id, rec] of Object.entries(unfair)) if ((rec.used === true && rec.day < draft.day) || draft.day - rec.day > TUNING.practice.unfair.days) delete unfair[id];
    if (Object.keys(unfair).length === 0) delete draft.practices!.unfair;
  }
  const events: EngineEvent[] = [];
  for (const holderId of practiceHolders(draft, reg)) {
    if (pendingUnfair(draft, holderId) !== undefined || draft.practices?.unfair?.[holderId]?.day === draft.day) continue;
    if (practiceRoll(draft, holderId, 'unfair') >= unfairChance(draft, reg, holderId)) continue;
    const kinds = possibleUnfair(draft, reg, holderId);
    if (kinds.length === 0) continue;
    events.push(...applyUnfair(draft, ctx, holderId, kinds[Math.min(kinds.length - 1, Math.floor(practiceRoll(draft, holderId, 'unfair:kind') * kinds.length))]));
  }
  return events;
}

/** `her_test` is live for a holder while she has a double standard in hand and the commander is in a scene with her (R16): pointing it out is answered through that moment. */
export function herTestLive(state: CampaignState, reg: Registries, unitId: string): boolean {
  return practiceLive(state, reg, unitId) && pendingUnfair(state, unitId, 'double_standard') !== undefined && state.scene?.participants.includes(unitId) === true;
}

/**
 * The after-action of the double standard (registered by `actions/practice.ts`): the first scene that opens with her carries it (`sceneId`), that scene's end uses it up, and a scene that is aborted gives it back
 * for the next. Nothing while none is in hand.
 */
export function doubleStandardFromEvents(draft: CampaignState, _ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const unfair = draft.practices?.unfair;
  if (unfair === undefined) return [];
  for (const e of events) {
    if (e.type === 'scene_started' && Array.isArray(e.participants)) {
      for (const id of e.participants as string[]) {
        const rec = pendingUnfair(draft, id, 'double_standard');
        if (rec !== undefined && rec.sceneId === undefined) rec.sceneId = String(e.sceneId);
      }
    } else if (e.type === 'scene_ended' || e.type === 'scene_aborted') {
      for (const [id, rec] of Object.entries(unfair)) {
        if (rec.kind !== 'double_standard' || rec.sceneId === undefined || rec.sceneId !== e.sceneId) continue;
        if (e.type === 'scene_ended') takeUnfair(draft, id, 'double_standard');
        else delete rec.sceneId;
      }
    }
  }
  return [];
}
