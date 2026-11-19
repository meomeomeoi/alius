import type { Registries } from '../../content/types';
import type { CampaignState, DevMoment } from '../state/types';
import { axisEntry, axisKind, bondField } from './axes';
import { developmentOf } from './state';
import { TUNING } from '../tuning';

/**
 * Development moments (P14b §5), quiet: a discrete change is stamped with the next scene she is in (so that scene carries a one-time cue
 * and she shows it), and written into her dossier after it (`shownDay`). No toast, no cut-in. Nothing here draws or emits an event.
 */

/** `scene/start`: her moments and facts that have neither a scene nor a shown day join this scene. Only participants. */
export function stampMoments(draft: CampaignState, participants: string[], sceneId: string): void {
  for (const id of participants) {
    const dev = draft.squad.find((u) => u.id === id)?.development;
    if (!dev) continue;
    for (const item of [...dev.moments, ...dev.facts]) if (item.sceneId === undefined && item.shownDay === undefined) item.sceneId = sceneId;
  }
}

/** `scene/end`: what that scene stamped has been shown; it joins the dossier view. */
export function showMoments(draft: CampaignState, sceneId: string): void {
  for (const u of draft.squad) {
    const dev = u.development;
    if (!dev) continue;
    for (const item of [...dev.moments, ...dev.facts]) if (item.sceneId === sceneId && item.shownDay === undefined) item.shownDay = draft.day;
  }
}

/** `scene/abort`: the scene never happened, so what it stamped waits for the next one. */
export function unstampMoments(draft: CampaignState, sceneId: string): void {
  for (const u of draft.squad) {
    const dev = u.development;
    if (!dev) continue;
    for (const item of [...dev.moments, ...dev.facts]) if (item.sceneId === sceneId && item.shownDay === undefined) delete item.sceneId;
  }
}

/** Her moments the open scene carries (stamped for it, not shown yet). */
export function stampedMoments(state: CampaignState, unitId: string): DevMoment[] {
  const id = state.scene?.id;
  if (id === undefined) return [];
  return developmentOf(state.squad.find((u) => u.id === unitId) ?? {}).moments.filter((m) => m.sceneId === id && m.shownDay === undefined);
}

const DRAFT_MARK = /^\s*AUTHOR TO WRITE:\s*/i;

/** Did the moment move the axis up? Values compare numbers, bond fields their place on the scale, the lists their yes. */
function wentUp(m: DevMoment): boolean {
  const kind = axisKind(m.axis);
  if (kind === 'value') return Number(m.to) > Number(m.from);
  if (kind === 'bond') {
    const field = bondField(m.axis);
    const scale = field === null ? [] : (TUNING.development.scales[field] as readonly (string | boolean)[]).map(String);
    return scale.indexOf(m.to) > scale.indexOf(m.from);
  }
  return m.to === 'yes';
}

/** The words of one moment: the axis entry's `up` or `down` (the `{tag}` of a wildcard filled in), without the draft marker. */
function wordsOf(reg: Registries, m: DevMoment): string | null {
  const entry = axisEntry(reg, m.axis);
  if (!entry) return null;
  const tag = m.axis.slice(m.axis.indexOf(':') + 1);
  const name = axisKind(m.axis) === 'taste' ? String(reg.tastes.get(tag)?.name ?? tag) : tag.replace(/_/g, ' ');
  return (wentUp(m) ? entry.up : entry.down).replace(DRAFT_MARK, '').replace(/\{tag\}/g, name).trim();
}

export interface MomentDirective { id: string; text: string; expiresAfter: 'scene' }

/**
 * The one-time cue of a scene for a soldier whose change it carries (AUTHOR TO WRITE): behaviour first, never announced. `development:<unitId>`.
 * The commander is only "the commander" (lore §0); null when she carries nothing.
 */
export function momentDirective(state: CampaignState, reg: Registries, unitId: string): MomentDirective | null {
  const unit = state.squad.find((u) => u.id === unitId);
  const words = stampedMoments(state, unitId).map((m) => wordsOf(reg, m)).filter((w): w is string => w !== null && w !== '');
  if (!unit || words.length === 0) return null;
  return { id: `development:${unitId}`, text: `${unit.displayName} has changed lately: ${words.join('; ')}. Let it show in how she acts this scene; never announce it.`, expiresAfter: 'scene' };
}
