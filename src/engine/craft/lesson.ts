/**
 * Slips teach (P16b, plan Task 4; spec sections 1.7 and 3, ruling 21). A slip gives no xp by itself. A slip followed in the same scene by her punishment
 * (`punishment_issued`), or by her naming the point, gives half the xp a clean success would (`lesson`). Whether she names the point is by style (`drill`,
 * `ritual` and `clinical` always, `cold` sometimes, `playful` as a joke, `cruel` never, the rest by a hash): decided by the engine from `craftRoll`, so a slip
 * draws nothing; what the point is comes from the `craftLessons` registry, read by `slip` / `kind` / `interaction`, never by id. The model words the line (the
 * directive `craft:lesson:<unitId>`), the engine counts the lesson. Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { CraftLessonEntry } from '../../content/schemas';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { styleOf } from '../dynamic/profile';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addCraftXp } from './book';
import { craftLive } from './gate';
import { craftRoll, type CraftKey } from './state';

/** A slip, as the craft reads it from an engine event. */
export interface Slip {
  type: 'physics_slip' | 'posture_slip';
  holderId: string;
  /** The event's own `kind` (a physics slip: `slip`, `skip`, `reflex`, `collapse`). */
  kind?: string;
  /** The physics it came from, when the event names it. */
  physicsId?: string;
}

/** The slip an event is, or `null` when it is not one (or names no holder). */
export function slipOf(draft: Pick<CampaignState, 'scene'>, e: EngineEvent): Slip | null {
  if ((e.type !== 'physics_slip' && e.type !== 'posture_slip') || typeof e.holderId !== 'string') return null;
  const physicsId = typeof e.physicsId === 'string' ? e.physicsId : e.type === 'physics_slip' ? draft.scene?.physics?.physicsId : undefined;
  return { type: e.type, holderId: e.holderId, ...(typeof e.kind === 'string' ? { kind: e.kind } : {}), ...(physicsId !== undefined ? { physicsId } : {}) };
}

/** The key a slip teaches: the endurance of the physics it came from when that physics has one, `posture` for a posture, else `stillness`. */
export function slipKey(reg: Registries, slip: Slip): CraftKey {
  if (slip.type === 'posture_slip') return 'posture';
  return slip.physicsId !== undefined && reg.contactPhysics.get(slip.physicsId)?.skill === true ? `endurance:${slip.physicsId}` : 'stillness';
}

/** The most specific lesson row for a slip: `kind` and `interaction` both, then one of them, then neither; registry order breaks a tie. `undefined` when no row matches. */
export function lessonRow(reg: Registries, slip: Slip): CraftLessonEntry | undefined {
  const interaction = slip.physicsId !== undefined ? String(reg.contactPhysics.get(slip.physicsId)?.interaction ?? '') : '';
  let best: CraftLessonEntry | undefined;
  let bestScore = -1;
  for (const row of reg.craftLessons.values() as IterableIterator<CraftLessonEntry>) {
    if (row.slip !== slip.type) continue;
    if (row.kind !== undefined && row.kind !== slip.kind) continue;
    if (row.interaction !== undefined && row.interaction !== interaction) continue;
    const score = (row.kind !== undefined ? 1 : 0) + (row.interaction !== undefined ? 1 : 0);
    if (score > bestScore) { best = row; bestScore = score; }
  }
  return best;
}

/**
 * How she names the point, by style (read through `styleOf`): `plain`, `joke` (`playful`) or `null` (she does not). `cold` names it when `craftRoll` is under
 * `lesson.cold`, every other style by `lesson.other`; `key` makes the answer one slip's own (it is stable for a day and the same key).
 */
export function lessonWay(state: CampaignState, holderId: string, key: string): 'plain' | 'joke' | null {
  const unit = state.squad.find((u) => u.id === holderId);
  const style = unit !== undefined ? styleOf(unit)?.primary : undefined;
  const L = TUNING.craft.lesson;
  if (style !== undefined && L.never.includes(style)) return null;
  if (style !== undefined && L.joke.includes(style)) return 'joke';
  if (style !== undefined && L.always.includes(style)) return 'plain';
  const chance = style === 'cold' ? L.cold : L.other;
  return craftRoll(state, holderId, `lesson:${key}`) < chance ? 'plain' : null;
}

/** Does she name the point after this slip: a row exists for it, the holder is craft-live and her style says so. */
export function lessonDue(state: CampaignState, reg: Registries, holderId: string, slip: Slip, key = slip.type): boolean {
  return craftLive(state, reg, holderId) && lessonRow(reg, slip) !== undefined && lessonWay(state, holderId, key) !== null;
}

/** Pays one lesson: half the xp of a clean phase to what the slip teaches, once, and says so. */
function pay(draft: CampaignState, reg: Registries, holderId: string, key: CraftKey, via: 'named' | 'punished'): EngineEvent[] {
  const xp = Math.round(TUNING.craft.xp.lesson * TUNING.craft.xp.phase * 100) / 100;
  const paid = addCraftXp(draft, reg, key, xp, 'lesson');
  return paid.length === 0 ? [] : [{ type: 'lesson', unitId: holderId, key, xp, via }, ...paid];
}

/** Drops the slips and the point of a scene that is over (or a chat that changed): they are only ever the open scene's. */
function sweep(draft: CampaignState): void {
  const scene = draft.scene?.id;
  for (const rel of Object.values(draft.relations)) {
    const c = rel.craft;
    if (c === undefined) continue;
    if (c.slips !== undefined) {
      c.slips = c.slips.filter((x) => x.scene === scene && x.day === draft.day);
      if (c.slips.length === 0) delete c.slips;
    }
    if (c.lesson !== undefined && c.lesson.scene !== scene) delete c.lesson;
  }
}

/**
 * The craft's reading of an action's events for lessons: a slip of a craft-live holder either earns a lesson at once (she names the point: the point is kept for
 * her next reply) or waits for her punishment in the same scene; her `punishment_issued` pays every slip that waited. Writes only for a craft-live holder.
 */
export function noteSlips(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  sweep(draft);
  const scene = draft.scene;
  if (scene === undefined) return [];
  const out: EngineEvent[] = [];
  let n = 0;
  for (const e of events) {
    const slip = slipOf(draft, e);
    if (slip !== null) {
      if (!craftLive(draft, reg, slip.holderId) || !scene.participants.includes(slip.holderId)) continue;
      const key = slipKey(reg, slip);
      const row = lessonRow(reg, slip);
      const way = row !== undefined ? lessonWay(draft, slip.holderId, `${scene.id}:${scene.exchanges}:${n++}:${slip.type}:${slip.kind ?? ''}`) : null;
      const craft = ((draft.relations[slip.holderId]!).craft ??= {});
      if (row !== undefined && way !== null) {
        const pick = row.words[Math.floor(craftRoll(draft, slip.holderId, `lesson:words:${scene.id}:${scene.exchanges}:${n}`) * row.words.length)]!;
        craft.lesson = { point: row.point, words: pick, ...(way === 'joke' ? { joke: true as const } : {}), scene: scene.id, exchange: scene.exchanges };
        out.push(...pay(draft, reg, slip.holderId, key, 'named'));
      } else (craft.slips ??= []).push({ key, scene: scene.id, day: draft.day });
    } else if (e.type === 'punishment_issued' && typeof e.unitId === 'string') {
      const waiting = draft.relations[e.unitId]?.craft?.slips;
      if (waiting === undefined || !craftLive(draft, reg, e.unitId)) continue;
      const mine = waiting.filter((x) => x.scene === scene.id && x.day === draft.day);
      delete draft.relations[e.unitId]!.craft!.slips;
      for (const w of mine) out.push(...pay(draft, reg, e.unitId, w.key as CraftKey, 'punished'));
    }
  }
  return out;
}
