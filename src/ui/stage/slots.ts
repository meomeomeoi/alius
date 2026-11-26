import { ART_SLOT_IDS, type ArtSidecar, type ArtSlotId, type ArtSlots } from '../scene/art';
import type { StageFolder } from './load';

/**
 * P10e-f: every file key of her stage folder and what the setup screen says about it. A slot key is an art slot id or one of the
 * two files of `legs_astride` as a pair. Rendering and setup only: no engine state, no rng.
 */
export type SlotKey = ArtSlotId | 'legs_astride.left' | 'legs_astride.right';

export interface SlotInfo {
  label: string;
  /** The prototype whose panel defines the slot's fit (`docs/prototypes/<file>`, its "copy the fit"). */
  prototype: string;
  /** The instrument that reads it (its `registerInstrument` id; `slap` is the slap overlay). */
  instrument: string;
  /** The slot carries zones (the prototypes' marker). */
  zones: boolean;
  /** The art slot the file belongs to (the two pair files belong to `legs_astride`). */
  slot: ArtSlotId;
  /** The sidecar says how many feet the picture holds (`feet`, `shown`): set, the slot counts as fitted. */
  feet?: true;
  /** Listed and editable only while the setting `showExplicitSlots` is on. */
  explicit?: true;
}

/**
 * One row per slot key. The prototypes (README and each panel's "copy the fit"): `over` is weight.html's slot (gulp.html reads it too),
 * `over_explicit` gulp.html's reading of it with weight's sidecar; `face_close` slap.html's; the seated legs, the feet on the floor and
 * the sole her_activity.html's frame (the sole: its service game); `legs_astride` throne.html's; the shoes shoe.html's.
 */
export const SLOT_INFO: Readonly<Record<SlotKey, SlotInfo>> = {
  over: { label: 'over (from below)', prototype: 'weight.html', instrument: 'weight', zones: false, slot: 'over' },
  over_explicit: { label: 'over, explicit', prototype: 'weight.html', instrument: 'gulp', zones: false, slot: 'over_explicit', explicit: true },
  face_close: { label: 'face close', prototype: 'slap.html', instrument: 'slap', zones: false, slot: 'face_close' },
  'legs_seated.rest': { label: 'legs seated, at rest', prototype: 'her_activity.html', instrument: 'her_activity', zones: false, slot: 'legs_seated.rest' },
  'legs_seated.foot_raised': { label: 'legs seated, foot raised', prototype: 'her_activity.html', instrument: 'her_activity', zones: false, slot: 'legs_seated.foot_raised' },
  legs_astride: { label: 'legs astride', prototype: 'throne.html', instrument: 'her_activity', zones: false, slot: 'legs_astride', feet: true },
  'legs_astride.left': { label: 'legs astride, left', prototype: 'throne.html', instrument: 'her_activity', zones: false, slot: 'legs_astride', feet: true },
  'legs_astride.right': { label: 'legs astride, right', prototype: 'throne.html', instrument: 'her_activity', zones: false, slot: 'legs_astride', feet: true },
  sole_close: { label: 'sole close', prototype: 'her_activity.html', instrument: 'her_activity', zones: true, slot: 'sole_close' },
  feet_floor: { label: 'feet on the floor', prototype: 'her_activity.html', instrument: 'her_activity', zones: false, slot: 'feet_floor' },
  'shoe_close.boots': { label: 'boots from above', prototype: 'shoe.html', instrument: 'shoe', zones: true, slot: 'shoe_close.boots', feet: true },
  'shoe_close.heels': { label: 'heels from above', prototype: 'shoe.html', instrument: 'shoe', zones: true, slot: 'shoe_close.heels', feet: true },
  'shoe_sole.boots': { label: 'boot soles', prototype: 'shoe.html', instrument: 'shoe', zones: true, slot: 'shoe_sole.boots', feet: true },
  'shoe_sole.heels': { label: 'heel soles', prototype: 'shoe.html', instrument: 'shoe', zones: true, slot: 'shoe_sole.heels', feet: true },
};

/** Every slot key in the list's order (the pair files beside `legs_astride`); the same set as the resolver's `MANIFEST_KEYS`. */
export const SLOT_KEYS = Object.keys(SLOT_INFO) as readonly SlotKey[];

export type SlotState = 'none' | 'picture' | 'fitted' | 'zoned';
/** The words of the states in the list. */
export const SLOT_STATE_WORD: Readonly<Record<SlotState, string>> = { none: '—', picture: 'picture', fitted: 'fitted', zoned: 'zoned' };

/** The slot keys shown with the setting as it is (`over_explicit` only while `showExplicitSlots` is on). */
export const visibleSlotKeys = (showExplicit: boolean): SlotKey[] => SLOT_KEYS.filter((k) => showExplicit || SLOT_INFO[k].explicit !== true);
/** The art slots counted in her `n / 12` (11 without `over_explicit`). */
export const visibleSlots = (showExplicit: boolean): ArtSlotId[] => ART_SLOT_IDS.filter((s) => showExplicit || SLOT_INFO[s].explicit !== true);

/**
 * Her picture of a key: her folder first, then the manifest (read through the resolver, explicit allowed: this is setup, not play).
 * The resolver answers `legs_astride` with the pair when both pair files exist: the single key then has none of its own there.
 */
function pictureOf(folder: StageFolder | undefined, art: ArtSlots, unitId: string, key: SlotKey): { sidecar: ArtSidecar } | null {
  const own = folder?.slots.get(key);
  if (own) return own;
  if (key === 'legs_astride.left' || key === 'legs_astride.right') {
    const got = art.get(unitId, 'legs_astride');
    if (!got?.pair) return null;
    const { feet: _pair, ...sidecar } = got.sidecar; // the resolver writes `feet: 'pair'` for two files: the files say it, not a fit
    return { sidecar };
  }
  const got = art.get(unitId, key, { explicit: true });
  if (got === null) return null;
  return key === 'legs_astride' && got.pair ? null : got;
}

/** The state of one slot key: `fitted` = the sidecar has `fit` (or `feet` for a slot that says its feet); `zoned` = it has zones and the slot takes them. */
export function slotState(folder: StageFolder | undefined, art: ArtSlots, unitId: string, key: SlotKey): SlotState {
  const pic = pictureOf(folder, art, unitId, key);
  if (pic === null) return 'none';
  const info = SLOT_INFO[key];
  const { sidecar } = pic;
  if (info.zones && sidecar.zones !== undefined && Object.keys(sidecar.zones).length > 0) return 'zoned';
  if (sidecar.fit !== undefined || (info.feet === true && sidecar.feet !== undefined)) return 'fitted';
  return 'picture';
}

/** How many of her art slots hold a picture (`legs_astride` counts as filled with its single file or its pair). */
export function slotsFilled(folder: StageFolder | undefined, art: ArtSlots, unitId: string, showExplicit: boolean): number {
  const keys = visibleSlotKeys(showExplicit);
  return visibleSlots(showExplicit).filter((slot) => keys.some((k) => SLOT_INFO[k].slot === slot && slotState(folder, art, unitId, k) !== 'none')).length;
}
