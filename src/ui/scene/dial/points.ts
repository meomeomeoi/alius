/**
 * P10e: the commander's body as the posture dial reads it: seven points with a few states each (docs/content/blocking.md §7.1).
 * A base posture (the 13 of `blockingPostures`) is a row of default states; a preset (P16b's, later) is a base plus a few
 * states. Pure data: nothing here knows about drawing.
 */
export type Torso = 'upright' | 'forward' | 'arched' | 'level' | 'bent';
export type Hips = 'raised' | 'on_heels' | 'to_floor';
export type Knees = 'together' | 'apart';
export type Arms =
  | 'at_sides' | 'behind_back' | 'behind_head' | 'on_thighs_down' | 'on_thighs_up' | 'forward_palms_up' | 'out_sideways' | 'raised'
  | 'holding' | 'on_floor' | 'on_ankles' | 'under_knees' | 'bound' | 'crossed' | 'clasped_front' | 'paws' | 'tucked' | 'lamp' | 'desk_flat';
export type Head = 'up' | 'bowed' | 'back' | 'to_floor';
export type Gaze = 'down' | 'at_her' | 'straight' | 'closed';
export type Feet = 'flat' | 'on_toes';

export interface PointStates {
  torso?: Torso;
  hips?: Hips;
  knees?: Knees;
  arms?: Arms;
  head?: Head;
  gaze?: Gaze;
  feet?: Feet;
}

/** What the dial draws: a base, the point states on top of its defaults, and the hints of an item or an anchor. */
export interface DialPose {
  base: string;
  points: PointStates;
  item?: 'tray' | 'lamp';
  hint?: 'wall' | 'desk' | 'feet';
  hogtie?: true;
}

/** The default point states of each base posture (the 13 of `content/core/blockingPostures.json`). */
export const BASE_POINTS: Record<string, PointStates> = {
  standing: { torso: 'upright', knees: 'together', arms: 'at_sides', head: 'up', gaze: 'straight', feet: 'flat' },
  standing_attention: { torso: 'upright', knees: 'together', arms: 'at_sides', head: 'up', gaze: 'straight', feet: 'flat' },
  sitting: { torso: 'upright', knees: 'together', arms: 'on_thighs_down', head: 'up', gaze: 'straight', feet: 'flat' },
  sitting_floor: { torso: 'upright', knees: 'together', arms: 'on_thighs_down', head: 'up', gaze: 'straight', feet: 'flat' },
  kneeling_upright: { torso: 'upright', hips: 'raised', knees: 'together', arms: 'on_thighs_down', head: 'up', gaze: 'straight', feet: 'flat' },
  kneeling_sitting: { torso: 'upright', hips: 'on_heels', knees: 'together', arms: 'on_thighs_down', head: 'up', gaze: 'straight', feet: 'flat' },
  bowing: { torso: 'bent', hips: 'on_heels', knees: 'together', arms: 'on_floor', head: 'to_floor', gaze: 'down', feet: 'flat' },
  all_fours: { torso: 'level', hips: 'raised', knees: 'together', arms: 'on_floor', head: 'up', gaze: 'down', feet: 'flat' },
  crouching: { torso: 'forward', hips: 'on_heels', knees: 'together', arms: 'at_sides', head: 'up', gaze: 'straight', feet: 'flat' },
  lying_back: { torso: 'upright', knees: 'together', arms: 'at_sides', head: 'up', gaze: 'straight', feet: 'flat' },
  lying_front: { torso: 'upright', knees: 'together', arms: 'at_sides', head: 'up', gaze: 'down', feet: 'flat' },
  lying_side: { torso: 'upright', knees: 'together', arms: 'at_sides', head: 'up', gaze: 'straight', feet: 'flat' },
  curled: { torso: 'forward', knees: 'together', arms: 'tucked', head: 'bowed', gaze: 'down', feet: 'flat' },
};

/** The dial's pose of a base posture (its default point states); null for an unknown base. */
export function poseOf(baseId: string): DialPose | null {
  const points = BASE_POINTS[baseId];
  return points ? { base: baseId, points } : null;
}
