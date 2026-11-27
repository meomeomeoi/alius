/**
 * Named postures and the call (P16, plan R14, depth revision): a holder who keeps a ritual (`ritual` as her primary or secondary style) or runs the household (`household_protocol`) gives the postures
 * the commander takes in her scenes names of her own, as many as her service track allows (level + 1). Later, in a scene with her at `role` or beyond, she may call one by its name and the commander
 * must take it in time: right and on time sets the posture and earns service xp; wrong or late is a slip (a trivial offence of hers). A name is the model's words and the engine's to keep: with a
 * pronoun for the commander, over 30 characters or empty, it is refused and the posture's own label stands. Nothing here draws: the call is a hashed roll (`practiceRoll`) and its pick is an index.
 */
import type { Registries } from '../../content/types';
import { checkChange, COMMANDER, entryAllowed, frameRank, setBlocking, type BlockingChange } from '../blocking';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { hasCapability } from '../dynamic/capabilities';
import { hasCommanderPronoun } from '../dynamic/pronoun';
import { practiceOf } from '../dynamic/profile';
import { bendBy } from '../dynamic/manner';
import { dynamicOf } from '../dynamic/state';
import { addTrackXp } from '../dynamic/tracks';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { noteOffence } from './offences';
import { practiceRoll } from './state';

/** The longest name a posture is given. */
export const POSTURE_NAME_MAX = 30;

/** The service track: the one a posture call feeds and whose level the set of postures grows with. */
const TRACK = TUNING.practice.routine.track;

/** Does she keep named postures: a ritual as her primary or secondary style, or the household protocol? Read by the style and the capability, never by id. */
export function keepsPostures(state: CampaignState, reg: Registries, holderId: string): boolean {
  const style = practiceOf(state, reg, holderId)?.style;
  return style?.primary === 'ritual' || style?.secondary === 'ritual' || hasCapability(state, reg, holderId, 'household_protocol');
}

/** How many postures she names: her level in the service track plus one. */
export const postureCap = (state: CampaignState, holderId: string): number => (dynamicOf(state, holderId)?.tracks[TRACK]?.level ?? 0) + 1;

/**
 * A name the engine accepts: the model's words with markup and control characters stripped and the spaces gathered; `null` when it is empty, over `POSTURE_NAME_MAX` characters or gives the commander
 * a pronoun (never cut or rewritten: the label stands instead).
 */
export function cleanPostureName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text === '' || text.length > POSTURE_NAME_MAX || hasCommanderPronoun(text) ? null : text;
}

const labelOf = (reg: Registries, postureId: string): string => String(reg.blockingPostures.get(postureId)?.label ?? postureId);

/**
 * The after-action that names postures (registered by `actions/practice.ts`): a posture set on the commander (`blocking_changed`, field `posture`) in a scene with a holder who keeps named postures
 * adds it to her set, if it is new, her set has room and the posture is allowed for her (`entryAllowed`). It is named by its label until she names it; `posture_named` with no name tells the controller
 * to ask for one. Nothing for a holder who is not live.
 */
export function notePosture(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const scene = draft.scene;
  if (scene === undefined) return [];
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type !== 'blocking_changed' || e.person !== COMMANDER || e.field !== 'posture' || typeof e.value !== 'string') continue;
    const entry = reg.blockingPostures.get(e.value);
    if (entry === undefined) continue;
    for (const holderId of scene.participants) {
      if (!practiceLive(draft, reg, holderId) || !keepsPostures(draft, reg, holderId) || !entryAllowed(draft, reg, entry, [holderId])) continue;
      const mine = ensurePractices(draft).postures[holderId] ?? [];
      if (mine.some((p) => p.postureId === e.value) || mine.length >= postureCap(draft, holderId)) continue;
      ensurePractices(draft).postures[holderId] = [...mine, { postureId: e.value, name: labelOf(reg, e.value), day: draft.day }];
      out.push({ type: 'posture_named', unitId: holderId, holderId, postureId: e.value });
    }
  }
  return out;
}

/** Her name for one of her postures (`practice/name_posture`): the model's words when the engine accepts them, else the posture's label. Throws for a posture that is not in her set or a holder who is not live. */
export function namePosture(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, postureId: string, name?: string): EngineEvent[] {
  if (!practiceLive(draft, ctx.registries, holderId)) throw new Error('She is not holding now.');
  const entry = draft.practices?.postures[holderId]?.find((p) => p.postureId === postureId);
  if (entry === undefined) throw new Error('That posture is not one of hers.');
  entry.name = cleanPostureName(name) ?? labelOf(ctx.registries, postureId);
  return [{ type: 'posture_named', unitId: holderId, holderId, postureId, name: entry.name }];
}

/** The time she gives to take the posture she calls, by her style (`ritual` and `drill` have their own; every other style the same). */
export function postureWindowMs(state: CampaignState, reg: Registries, holderId: string): number {
  const T = TUNING.practice.posture.windowMs;
  const style = practiceOf(state, reg, holderId)?.style.primary;
  const base = style === 'ritual' ? T.ritual : style === 'drill' ? T.drill : T.other;
  return bendBy(state, reg, holderId, 'tempo', base, { scale: -TUNING.manner.scale }); // P15b: a sudden holder (tempo up) gives less time
}

/**
 * The after-action that calls a posture (registered by `actions/practice.ts`): after an `intents/apply` in a scene with a holder at `role` or beyond who has two named postures and no call open,
 * by the hashed roll `practiceRoll(her, 'call:<scene>:<exchange>')` under `callChance`, she calls one of them (an index by `practiceRoll`, never the one the commander is in already when there is another).
 * `practices.call` is the open call; `posture_called` tells the controller. One call a holder at a time.
 */
export function callPosture(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const scene = draft.scene;
  if (scene === undefined || !events.some((e) => e.type === 'intents_applied') || draft.practices?.call !== undefined) return [];
  const reg = ctx.registries;
  for (const holderId of scene.participants) {
    if (!practiceLive(draft, reg, holderId) || frameRank(dynamicOf(draft, holderId)?.frame ?? 'equal') < frameRank('role')) continue;
    const mine = (draft.practices?.postures[holderId] ?? []).filter((p) => { const entry = reg.blockingPostures.get(p.postureId); return entry !== undefined && entryAllowed(draft, reg, entry, [holderId]); }); // one whose category went off since it was named is not called
    if (mine.length < 2) continue;
    const key = `${scene.id}:${scene.exchanges}`;
    if (practiceRoll(draft, holderId, `call:${key}`) >= TUNING.practice.posture.callChance) continue;
    const now = scene.blocking?.[COMMANDER]?.posture;
    const others = mine.filter((p) => p.postureId !== now);
    const pool = others.length > 0 ? others : mine;
    const pick = pool[Math.min(pool.length - 1, Math.floor(practiceRoll(draft, holderId, `call:pick:${key}`) * pool.length))];
    const id = nextPracticeId(draft, 'pc');
    ensurePractices(draft).call = { id, holderId, postureId: pick.postureId, sceneId: scene.id, at: scene.exchanges };
    return [{ type: 'posture_called', callId: id, unitId: holderId, holderId, postureId: pick.postureId, sceneId: scene.id }];
  }
  return [];
}

/**
 * The commander answers her call (`practice/take_posture { callId, postureId?, late }`): the right posture in time sets it on the commander (a chip's change, `at` the chat index) and earns service xp;
 * a wrong one, a late one (the UI says so when the time ran out) or none is a slip: `posture_slip` and a trivial offence of hers. A posture the commander cannot take now (held in place, no standing
 * when movement is limited) ends the call with neither. Throws for a call that is gone or another's, a posture that is not in her set, or a holder who is not live.
 */
export function takePosture(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, callId: string, postureId: string | undefined, late: boolean, at: number): EngineEvent[] {
  const reg = ctx.registries;
  const call = draft.practices?.call;
  if (call === undefined || call.id !== callId) throw new Error('That call is gone.');
  if (!practiceLive(draft, reg, call.holderId)) throw new Error('She is not holding now.');
  if (postureId !== undefined && !(draft.practices!.postures[call.holderId] ?? []).some((p) => p.postureId === postureId)) throw new Error('That posture is not one of hers.');
  delete draft.practices!.call;
  const base = { callId, unitId: call.holderId, holderId: call.holderId, postureId: call.postureId } as const;
  if (postureId !== call.postureId || late) {
    return [{ type: 'posture_slip', ...base, ...(late ? { late: true } : {}) }, ...noteOffence(draft, ctx, call.holderId, { kind: 'posture_slip', ref: callId, stakes: 'trivial', day: draft.day })];
  }
  const change: BlockingChange = { person: COMMANDER, field: 'posture', value: call.postureId };
  if (draft.scene?.blocking?.[COMMANDER]?.posture === call.postureId) return [{ type: 'posture_called', ...base, taken: true }, ...addTrackXp(draft, reg, call.holderId, TRACK, TUNING.practice.posture.xp)];
  if (draft.scene === undefined || checkChange(draft, reg, change) !== null) return [{ type: 'posture_called', ...base, void: true }];
  return [
    { type: 'posture_called', ...base, taken: true },
    ...setBlocking(draft, ctx, change, { at, source: 'chip' }),
    ...addTrackXp(draft, reg, call.holderId, TRACK, TUNING.practice.posture.xp),
  ];
}

/** The call goes with the scene it was made in (registered after-action on `scene_ended` and `scene_aborted`). */
export function callsFromEvents(draft: CampaignState, events: readonly EngineEvent[]): EngineEvent[] {
  const call = draft.practices?.call;
  if (call !== undefined && events.some((e) => (e.type === 'scene_ended' || e.type === 'scene_aborted') && e.sceneId === call.sceneId)) delete draft.practices!.call;
  return [];
}
