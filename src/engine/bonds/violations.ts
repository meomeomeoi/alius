import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { flaggedCategories } from './content';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A scene keeps at most this many marks (a long scene cannot grow the save). */
const MARKS_MAX = 50;

/**
 * A reading flagged a reply of the open scene as depicting content that is switched off. `raw` is `{ index, categories }`;
 * categories that are on or unknown are dropped, nothing left means no mark, and a second reading of the same reply replaces
 * its mark. Stored on the scene, so a rollback of the reading (a swipe, an edit) takes the mark with it. Never throws.
 */
export function markSceneViolation(draft: CampaignState, reg: Registries, raw: unknown): void {
  const scene = draft.scene;
  if (!scene || !isObj(raw) || typeof raw.index !== 'number' || !Number.isInteger(raw.index) || raw.index < 0) return;
  const categories = flaggedCategories(draft, reg, raw.categories);
  if (categories.length === 0) return;
  const marks = (scene.violations ?? []).filter((v) => v.index !== raw.index);
  marks.push({ index: raw.index, categories });
  marks.sort((a, b) => a.index - b.index);
  scene.violations = marks.slice(-MARKS_MAX);
}

/** The same for a DM: `messageRef` is `dm:<message id>`, and only a message of hers can carry the mark. */
export function markDmViolation(draft: CampaignState, reg: Registries, unitId: string, messageRef: unknown, raw: unknown): void {
  if (typeof messageRef !== 'string' || !messageRef.startsWith('dm:') || !isObj(raw)) return;
  const categories = flaggedCategories(draft, reg, raw.categories);
  if (categories.length === 0) return;
  const message = (draft.dms[unitId] ?? []).find((m) => m.id === messageRef.slice(3) && m.from === unitId);
  if (message) message.violation = categories;
}
