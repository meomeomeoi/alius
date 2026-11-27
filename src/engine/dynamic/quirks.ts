/**
 * P15b: her quirks (spec §5): two or three small ways she has in the dynamic, each `{ when, text }`. They reach the prompt by trigger only, once, and leave once the model reported
 * them (`quirk_voiced`), by P14c's rule of prompt hygiene. What is due is derived from the state: `switch` while her manner shows and nothing of hers has run in the scene, `during`
 * (and `address`, the first `during` of a scene) while a practice, a physics or a moment of hers runs, `after` once one ran in the scene and none runs now. The one thing that cannot be
 * derived, that a run was seen, is the scene's note (`dynamic.quirkScene`, written by `noteQuirkRuns`); what was voiced is written by `markQuirkVoiced`. The note is keyed by the
 * scene id and a scene with another id starts empty. Draws nothing.
 */
import type { Registries } from '../../content/types';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { faceNow, herRunning, showsDynamic } from './face';
import { dynamicOn, herPracticeLive } from './gate';
import { practiceOf } from './profile';
import { QUIRK_WHEN, type QuirkWhen } from './types';

/** How a due quirk is introduced in the line (the author's words; the quirk's own text follows). */
export const QUIRK_PHRASE: Readonly<Record<QuirkWhen, string>> = {
  switch: 'As the scene turns private with the commander',
  during: 'While it runs',
  after: 'As it ends',
  address: 'In how she addresses the commander',
};

export interface QuirkDue { unitId: string; when: QuirkWhen; text: string }

/** The unit's note for this scene, or `undefined` (nothing noted, or the note is of another scene). */
function noteOf(state: CampaignState, unitId: string): { voiced: QuirkWhen[]; ran?: true } | undefined {
  const book = state.dynamic?.quirkScene;
  return state.scene !== undefined && book?.sceneId === state.scene.id ? book.units[unitId] : undefined;
}

/** Her quirks, when she has any and is live in a scene with the commander. */
function quirksOf(state: CampaignState, reg: Registries, unitId: string) {
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || !herPracticeLive(state, unitId)) return [];
  return practiceOf(state, reg, unitId)?.quirks ?? [];
}

/**
 * The quirks that are due now, each unit's in `QUIRK_WHEN` order, one text per kind (the first she has of it). `present` defaults to the scene's participants. Nothing while the dynamic
 * is off, with no scene with her, or while the face of the scene does not show her manner.
 */
export function quirksDue(state: CampaignState, reg: Registries, present: readonly string[] = state.scene?.participants ?? []): QuirkDue[] {
  if (!dynamicOn(state, reg) || state.scene === undefined) return [];
  const out: QuirkDue[] = [];
  for (const id of present) {
    if (!state.scene.participants.includes(id)) continue;
    const quirks = quirksOf(state, reg, id);
    if (quirks.length === 0 || !showsDynamic(faceNow(state, reg, id, present))) continue;
    const note = noteOf(state, id);
    const running = herRunning(state, id);
    const ran = note?.ran === true;
    const now: Record<QuirkWhen, boolean> = { switch: !running && !ran, during: running, address: running, after: !running && ran };
    for (const when of QUIRK_WHEN) {
      if (!now[when] || note?.voiced.includes(when) === true) continue;
      const quirk = quirks.find((q) => q.when === when);
      if (quirk !== undefined) out.push({ unitId: id, when, text: quirk.text });
    }
  }
  return out;
}

/** The units in the scene with quirks whose run is on and not yet noted. */
function unnoted(state: CampaignState, reg: Registries): string[] {
  if (!dynamicOn(state, reg) || state.dynamic === undefined || state.scene === undefined) return [];
  return state.scene.participants.filter((id) => herRunning(state, id) && noteOf(state, id)?.ran !== true && quirksOf(state, reg, id).length > 0);
}

/** Whether `noteQuirkRuns` would write something (the controller dispatches the sync only then, so it never loops). */
export const quirkSyncDue = (state: CampaignState, reg: Registries): boolean => unnoted(state, reg).length > 0;

/** The note of this scene, created empty (and replacing a note of another scene). */
function bookOf(draft: CampaignState): NonNullable<NonNullable<CampaignState['dynamic']>['quirkScene']> {
  const x = draft.dynamic!;
  if (x.quirkScene?.sceneId !== draft.scene!.id) x.quirkScene = { sceneId: draft.scene!.id, units: {} };
  return x.quirkScene;
}

/** Notes that a run of hers was seen in this scene (it is what makes `after` due once it ends). Writes only for a unit with quirks whose run is on. Returns whether it wrote. */
export function noteQuirkRuns(draft: CampaignState, reg: Registries): boolean {
  const ids = unnoted(draft, reg);
  if (ids.length === 0) return false;
  const book = bookOf(draft);
  for (const id of ids) (book.units[id] ??= { voiced: [] }).ran = true;
  return true;
}

/** Notes that the model reported a quirk of hers as voiced: only one that is due now (so a stale or unknown report writes nothing). Returns whether it wrote. */
export function markQuirkVoiced(draft: CampaignState, reg: Registries, unitId: string, when: unknown): boolean {
  if (typeof when !== 'string' || !(QUIRK_WHEN as readonly string[]).includes(when)) return false;
  if (!quirksDue(draft, reg).some((q) => q.unitId === unitId && q.when === when)) return false;
  (bookOf(draft).units[unitId] ??= { voiced: [] }).voiced.push(when as QuirkWhen);
  return true;
}
