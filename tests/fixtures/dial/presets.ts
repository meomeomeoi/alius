/**
 * P10e: the 47 presets of docs/content/blocking.md section 7.3 as the mannequin reads them (a base and point states; an item or an anchor hint where the row's words name one).
 * P16b Task 9: they are the registry `content/core/servicePostures.json` now; this file only reads it (so the contact sheet, the prototype's dial kit and the mannequin tests
 * keep the same corpus). The spec says "48"; the table has 47 rows and so has the registry.
 */
import servicePostures from '../../../content/core/servicePostures.json';
import type { DialPose } from '../../../src/ui/scene/dial/points';

export interface DialPreset extends DialPose {
  id: string;
}

type Row = { id: string; base: string; points: DialPose['points']; item?: DialPose['item']; hint?: DialPose['hint']; hogtie?: true };

export const PRESETS: DialPreset[] = (servicePostures as unknown as Row[]).map((r) => ({
  id: r.id, base: r.base, points: r.points,
  ...(r.item !== undefined ? { item: r.item } : {}), ...(r.hint !== undefined ? { hint: r.hint } : {}), ...(r.hogtie === true ? { hogtie: true as const } : {}),
}));

const byId = (id: string): DialPreset => {
  const found = PRESETS.find((x) => x.id === id);
  if (!found) throw new Error(`no preset ${id}`);
  return found;
};

/** The spike's five drift states: the target posture, what the body does instead, and the joint that glows. */
export interface DriftCase {
  id: string;
  target: DialPose;
  actual: DialPose;
  hot: Array<'shoulders' | 'elbows' | 'hips' | 'knees' | 'head' | 'gaze'>;
}
const drift = (id: string, from: string, change: DialPose['points'], hot: DriftCase['hot']): DriftCase => {
  const t = byId(from);
  return { id, target: t, actual: { ...t, points: { ...t.points, ...change } }, hot };
};
export const DRIFTS: DriftCase[] = [
  drift('hips_sink', 'kneel_upright', { hips: 'on_heels' }, ['hips']),
  drift('arms_drop', 'kneel_hands_behind_head', { arms: 'at_sides' }, ['elbows']),
  drift('gaze_rises', 'kneel_upright', { gaze: 'at_her' }, ['gaze']),
  drift('knees_apart', 'kneel_upright', { knees: 'apart' }, ['knees']),
  drift('torso_slumps', 'kneel_upright', { torso: 'forward' }, ['shoulders']),
];
