/**
 * P10e: the 47 presets of docs/content/blocking.md §7.3 as the mannequin reads them (a base and point states; an item or an
 * anchor hint where the row's words name one). The registry has no presets yet (P16b brings them): this is only the contact
 * sheet's list and the mannequin's test corpus. The spec says "48"; the table has 47 rows and this fixture has all of them.
 */
import type { DialPose } from '../../../src/ui/scene/dial/points';

export interface DialPreset extends DialPose {
  id: string;
}

const p = (id: string, base: string, points: DialPose['points'], extra: Partial<Pick<DialPose, 'item' | 'hint' | 'hogtie'>> = {}): DialPreset => ({ id, base, points, ...extra });

export const PRESETS: DialPreset[] = [
  // everyday
  p('at_ease', 'standing', { torso: 'upright', arms: 'at_sides' }),
  p('leaning_wall', 'standing', { arms: 'crossed' }, { hint: 'wall' }),
  p('seated_desk', 'sitting', { torso: 'forward', arms: 'desk_flat' }, { hint: 'desk' }),
  p('cross_legged', 'sitting_floor', { knees: 'apart', arms: 'on_thighs_down' }),
  p('lying_bunk', 'lying_back', {}),
  // protocol and waiting
  p('attention', 'standing_attention', { torso: 'upright', arms: 'at_sides', head: 'up', gaze: 'straight' }),
  p('parade_rest', 'standing', { arms: 'behind_back', gaze: 'down' }),
  p('at_her_side', 'standing', { arms: 'clasped_front', gaze: 'down' }),
  p('facing_wall', 'standing', { arms: 'behind_back' }, { hint: 'wall' }),
  p('wall_sit', 'crouching', { hips: 'raised', arms: 'at_sides' }, { hint: 'wall' }),
  p('arms_out', 'standing', { arms: 'out_sideways' }),
  // kneeling
  p('kneel_upright', 'kneeling_upright', { hips: 'raised', knees: 'together', arms: 'on_thighs_down', head: 'up', gaze: 'down' }),
  p('kneel_rest', 'kneeling_sitting', { hips: 'on_heels', arms: 'on_thighs_down', gaze: 'down' }),
  p('kneel_open', 'kneeling_upright', { knees: 'apart', arms: 'on_thighs_up', head: 'up', gaze: 'down' }),
  p('kneel_hands_behind', 'kneeling_upright', { arms: 'behind_back', torso: 'forward' }),
  p('kneel_hands_behind_head', 'kneeling_upright', { arms: 'behind_head' }),
  p('kneel_present', 'kneeling_upright', { arms: 'forward_palms_up' }),
  p('kneel_throat', 'kneeling_upright', { head: 'back', gaze: 'closed' }),
  p('kneel_at_door', 'kneeling_sitting', {}),
  p('kneel_at_feet', 'kneeling_sitting', {}, { hint: 'feet' }),
  p('kneel_holding', 'kneeling_upright', { arms: 'holding' }, { item: 'tray' }),
  // lower
  p('bow', 'bowing', { head: 'to_floor', arms: 'on_floor' }),
  p('bow_to_feet', 'bowing', { head: 'to_floor', arms: 'on_floor' }, { hint: 'feet' }),
  p('all_fours', 'all_fours', { torso: 'level', head: 'bowed' }),
  p('table', 'all_fours', { torso: 'level' }),
  p('prostrate', 'lying_front', { arms: 'forward_palms_up' }),
  p('lying_back_open', 'lying_back', { arms: 'out_sideways', gaze: 'at_her' }),
  // pet
  p('pet_sit', 'kneeling_sitting', { arms: 'on_floor' }),
  p('beg', 'kneeling_upright', { arms: 'paws' }),
  p('curled_at_feet', 'curled', {}, { hint: 'feet' }),
  // rest and display
  p('sit_floor_beside', 'sitting_floor', { arms: 'at_sides' }),
  p('presented', 'standing', { arms: 'behind_head', knees: 'apart', gaze: 'down' }),
  // hard: kneeling variations
  p('kneel_on_hands', 'kneeling_sitting', { arms: 'under_knees' }),
  p('kneel_forehead_wall', 'kneeling_upright', { arms: 'behind_back' }, { hint: 'wall' }),
  p('kneel_arched', 'kneeling_upright', { torso: 'arched', arms: 'on_ankles', head: 'back' }),
  p('kneel_mouth_hold', 'kneeling_upright', { arms: 'at_sides' }),
  p('light_bearer', 'kneeling_upright', { arms: 'lamp' }, { item: 'lamp' }),
  p('tiptoe_hands_head', 'standing', { feet: 'on_toes', arms: 'behind_head', gaze: 'down' }),
  // hard: below the floor
  p('bow_hands_behind', 'bowing', { head: 'to_floor', arms: 'behind_back' }),
  p('chest_down_hips_up', 'bowing', { torso: 'bent', hips: 'raised', arms: 'on_floor', head: 'to_floor' }),
  p('bent_over', 'standing', { torso: 'bent', arms: 'desk_flat' }, { hint: 'desk' }),
  p('head_offered', 'lying_side', { head: 'to_floor' }),
  // hard: object
  p('doormat', 'lying_front', {}),
  p('ottoman_curl', 'curled', { arms: 'tucked' }),
  // hard: pet and restraint
  p('pet_belly_up', 'lying_back', { arms: 'paws', knees: 'apart' }),
  p('hogtied', 'lying_side', { torso: 'arched', arms: 'bound' }, { hogtie: true }),
  p('cage_curl', 'curled', {}),
];

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
