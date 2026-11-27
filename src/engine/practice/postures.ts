/**
 * Named postures and the call (P16, plan R14, depth revision): a holder who keeps a ritual (`ritual` as her primary or secondary style) or runs the household (`household_protocol`) gives the postures
 * the commander takes in her scenes names of her own, as many as her service track allows (level + 1). Later, in a scene with her at `role` or beyond, she may call one by its name and the commander
 * must take it in time: right and on time sets the posture and earns service xp; wrong or late is a slip (a trivial offence of hers). A name is the model's words and the engine's to keep: with a
 * pronoun for the commander, over 30 characters or empty, it is refused and the posture's own label stands. Nothing here draws: the call is a hashed roll (`practiceRoll`) and its pick is an index.
 */
import type { Registries } from '../../content/types';
import { checkChange, commanderPresetOf, COMMANDER, entryAllowed, frameRank, presetAllowed, presetOf, presetProblem, samePreset, setBlocking, type BlockingChange } from '../blocking';
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

/**
 * P16b (Task 10): her named postures are presets. `postureId` in her set and in the call is a preset id, or a base id (an old name, or a chip that set a base): both are read
 * through `presetOf` (a base reads as its default preset, the same pose), and two ids are one posture when they read as the same preset (`samePreset`).
 */
export { presetOf };

/**
 * What follows an answer that took her called posture in time (P16b: she may want it held): a hook (the craft registers one) answers the events of what it started, or `[]`. `info.postureId` is
 * the posture as stored in her set. The practices import nothing of the craft; with no hook registered nothing follows.
 */
type CallAnswered = (draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, info: { holderId: string; callId: string; postureId: string }) => EngineEvent[];
const answeredHooks: CallAnswered[] = [];
export function registerCallAnswered(fn: CallAnswered): void {
  if (!answeredHooks.includes(fn)) answeredHooks.push(fn);
}
const afterAnswer = (draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, info: Parameters<CallAnswered>[2]): EngineEvent[] => answeredHooks.flatMap((fn) => fn(draft, ctx, info));

/** The longest name a posture is given. */
export const POSTURE_NAME_MAX = 30;

/** The service track: the one a posture call feeds and whose level the set of postures grows with. */
const TRACK = TUNING.practice.routine.track;

/**
 * Does she keep named postures: a style in `TUNING.practice.posture.keepers` (`ritual`, and since P16b `drill` and `regal`) as her primary or secondary style, or the household protocol? Read by the style (through
 * `practiceOf`, a turn of it counts) and the capability, never by id.
 */
export function keepsPostures(state: CampaignState, reg: Registries, holderId: string): boolean {
  const style = practiceOf(state, reg, holderId)?.style;
  const keepers = TUNING.practice.posture.keepers;
  return (style !== undefined && (keepers.includes(style.primary) || (style.secondary !== undefined && keepers.includes(style.secondary)))) || hasCapability(state, reg, holderId, 'household_protocol');
}

/**
 * P16b plugs in here (Task 22a): which preset she names next by her taste, or `null`. The practices import nothing of the craft; with no hook registered, or every one answering `null`, she names only what
 * the commander is put in (`notePosture`). The first answer wins.
 */
export type PostureNamer = (state: CampaignState, reg: Registries, holderId: string) => string | null;
const namers: PostureNamer[] = [];
export function registerPostureNamer(fn: PostureNamer): void {
  if (!namers.includes(fn)) namers.push(fn);
}
function namerPick(state: CampaignState, reg: Registries, holderId: string): string | null {
  for (const fn of namers) {
    const id = fn(state, reg, holderId);
    if (id !== null) return id;
  }
  return null;
}

/**
 * The day step's part (Task 22a): each live holder who keeps named postures and whose set has room (her service level plus one) names the preset a hook picks by her taste. It is named by its label until
 * she names it (`posture_named` with no name: the controller asks for one), and her first call of it is a lesson (`taught`). A picked preset that is not allowed for her or that she has is never named. Nothing
 * without a hook. Draws nothing.
 */
export function namePostures(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  if (namers.length === 0) return [];
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const u of draft.squad) {
    const holderId = u.id;
    if (!practiceLive(draft, reg, holderId) || !keepsPostures(draft, reg, holderId)) continue;
    const mine = draft.practices?.postures[holderId] ?? [];
    if (mine.length >= postureCap(draft, holderId)) continue;
    const pick = namerPick(draft, reg, holderId);
    if (pick === null || !postureAllowed(draft, reg, pick, holderId) || mine.some((p) => samePreset(reg, p.postureId, pick))) continue;
    ensurePractices(draft).postures[holderId] = [...mine, { postureId: pick, name: labelOf(reg, pick), day: draft.day, taught: true }];
    out.push({ type: 'posture_named', unitId: holderId, holderId, postureId: pick });
  }
  return out;
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

/** What a posture is called until she names it: the preset's label, or the base's (an old name keeps the base's own label). */
const labelOf = (reg: Registries, postureId: string): string => String(reg.servicePostures.get(postureId)?.label ?? reg.blockingPostures.get(postureId)?.label ?? postureId);

/**
 * May she name or call this posture now. A preset id passes the preset's gate (its categories on and not among her limits, the frame it needs). An old name on a base (a base id that is not
 * also a preset's) is gated on the base entry alone, as P16 did: the default preset it reads as brings its own tags, which must not take an old name away from a save.
 */
export const postureAllowed = (state: CampaignState, reg: Registries, postureId: string, holderId: string): boolean => {
  if (isOldName(reg, postureId)) return entryAllowed(state, reg, reg.blockingPostures.get(postureId) ?? {}, [holderId]);
  const preset = presetOf(reg, postureId);
  return preset !== undefined && presetAllowed(state, reg, preset, [holderId]);
};

/** Is this id an old name: a base posture that no preset carries as its own id (`all_fours` is both, and the preset wins)? */
export const isOldName = (reg: Registries, postureId: string): boolean => reg.blockingPostures.has(postureId) && !reg.servicePostures.has(postureId);

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
    if (!reg.blockingPostures.has(e.value)) continue;
    // a chip sets a base (an old name); a preset set with it (`posture/take`, her call, a chip with `preset`) is named by the preset
    const id = typeof e.preset === 'string' && reg.servicePostures.has(e.preset) ? e.preset : e.value;
    for (const holderId of scene.participants) {
      if (!practiceLive(draft, reg, holderId) || !keepsPostures(draft, reg, holderId) || !postureAllowed(draft, reg, id, holderId)) continue;
      const mine = ensurePractices(draft).postures[holderId] ?? [];
      if (mine.some((p) => samePreset(reg, p.postureId, id)) || mine.length >= postureCap(draft, holderId)) continue;
      ensurePractices(draft).postures[holderId] = [...mine, { postureId: id, name: labelOf(reg, id), day: draft.day }];
      out.push({ type: 'posture_named', unitId: holderId, holderId, postureId: id });
    }
  }
  return out;
}

/** Her name for one of her postures (`practice/name_posture`): the model's words when the engine accepts them, else the posture's label. Throws for a posture that is not in her set or a holder who is not live. */
export function namePosture(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, postureId: string, name?: string): EngineEvent[] {
  if (!practiceLive(draft, ctx.registries, holderId)) throw new Error('She is not holding now.');
  const entry = draft.practices?.postures[holderId]?.find((p) => samePreset(ctx.registries, p.postureId, postureId));
  if (entry === undefined) throw new Error('That posture is not one of hers.');
  entry.name = cleanPostureName(name) ?? labelOf(ctx.registries, entry.postureId);
  return [{ type: 'posture_named', unitId: holderId, holderId, postureId: entry.postureId, name: entry.name }];
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
    const mine = (draft.practices?.postures[holderId] ?? []).filter((p) => postureAllowed(draft, reg, p.postureId, holderId)); // one whose category went off since it was named is not called
    if (mine.length < 2) continue;
    const key = `${scene.id}:${scene.exchanges}`;
    if (practiceRoll(draft, holderId, `call:${key}`) >= TUNING.practice.posture.callChance) continue;
    const now = commanderPresetOf(draft, reg)?.id; // the preset held (a base held reads as its default preset)
    const others = mine.filter((p) => presetOf(reg, p.postureId)?.id !== now);
    const pool = others.length > 0 ? others : mine;
    const pick = pool[Math.min(pool.length - 1, Math.floor(practiceRoll(draft, holderId, `call:pick:${key}`) * pool.length))];
    const id = nextPracticeId(draft, 'pc');
    const taught = pick.taught === true; // her first call of a posture she introduced is a lesson
    ensurePractices(draft).call = { id, holderId, postureId: pick.postureId, sceneId: scene.id, at: scene.exchanges, ...(taught ? { taught: true as const } : {}) };
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
  if (postureId !== undefined && !(draft.practices!.postures[call.holderId] ?? []).some((p) => samePreset(reg, p.postureId, postureId))) throw new Error('That posture is not one of hers.');
  delete draft.practices!.call;
  const base = { callId, unitId: call.holderId, holderId: call.holderId, postureId: call.postureId } as const;
  if (call.taught === true) { // the lesson is over once she has called it (a miss included)
    const entry = draft.practices!.postures[call.holderId]?.find((p) => samePreset(reg, p.postureId, call.postureId));
    if (entry !== undefined) delete entry.taught;
  }
  if ((!samePreset(reg, postureId, call.postureId) || late) && call.taught === true) return [{ type: 'posture_called', ...base, taught: true, missed: true }]; // a lesson: no slip
  if (!samePreset(reg, postureId, call.postureId) || late) {
    return [{ type: 'posture_slip', ...base, ...(late ? { late: true } : {}) }, ...noteOffence(draft, ctx, call.holderId, { kind: 'posture_slip', ref: callId, stakes: 'trivial', day: draft.day })];
  }
  // a preset id sets its base and itself; an old name on a base sets the base alone (the same pose, and nothing new written)
  const preset = reg.servicePostures.get(call.postureId);
  const change: BlockingChange = { person: COMMANDER, field: 'posture', value: (preset?.base as string | undefined) ?? call.postureId, ...(preset !== undefined ? { preset: preset.id } : {}) };
  const after = { holderId: call.holderId, callId, postureId: call.postureId };
  if (samePreset(reg, commanderPresetOf(draft, reg)?.id, call.postureId)) return [{ type: 'posture_called', ...base, taken: true }, ...addTrackXp(draft, reg, call.holderId, TRACK, TUNING.practice.posture.xp), ...afterAnswer(draft, ctx, after)];
  if (draft.scene === undefined || checkChange(draft, reg, change) !== null || (!isOldName(reg, call.postureId) && presetOf(reg, call.postureId) !== undefined && presetProblem(draft, reg, presetOf(reg, call.postureId)!) !== null)) return [{ type: 'posture_called', ...base, void: true }];
  return [
    { type: 'posture_called', ...base, taken: true },
    ...setBlocking(draft, ctx, change, { at, source: 'chip' }),
    ...addTrackXp(draft, reg, call.holderId, TRACK, TUNING.practice.posture.xp),
    ...afterAnswer(draft, ctx, after),
  ];
}

/** The call goes with the scene it was made in (registered after-action on `scene_ended` and `scene_aborted`). */
export function callsFromEvents(draft: CampaignState, events: readonly EngineEvent[]): EngineEvent[] {
  const call = draft.practices?.call;
  if (call !== undefined && events.some((e) => (e.type === 'scene_ended' || e.type === 'scene_aborted') && e.sceneId === call.sceneId)) delete draft.practices!.call;
  return [];
}
