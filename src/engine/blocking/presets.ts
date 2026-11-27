/**
 * P16b (Task 10): the posture presets as the blocking reads them. A base posture (`blockingPostures`, 13) is a position; a preset (`servicePostures`, 47) is a base with target states for
 * some points. An old name on a base (her named postures of P16 were base ids; a chip sets a base) reads as that base's default preset (`default: true`, one per base), which is
 * the same pose, so no save is migrated and nothing is written for an old name. Reads only; nothing here draws and nothing imports the craft or the practices.
 *
 * `blocking.commander.preset` is the preset the commander holds: set with the posture (`blocking/set` with `preset`, `posture/take`, her call), cleared when the base changes.
 */
import type { Entry, Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { entryAllowed, frameOf, sceneAffordances, supportRequired } from './gate';
import { COMMANDER, frameRank, type Frame } from './state';

/** The default preset of a base posture (`default: true`), or `undefined` for a base that has none. */
export function defaultPresetOf(reg: Registries, base: string): Entry | undefined {
  for (const p of reg.servicePostures.values()) if (p.base === base && p.default === true) return p;
  return undefined;
}

/**
 * The preset an id names: a preset id is that preset, a base id (an old name) is the base's default preset, anything else is `undefined`. A preset wins when an id is both (`all_fours`
 * is a base and the default preset of that base: the same posture).
 */
export function presetOf(reg: Registries, id: string | undefined): Entry | undefined {
  if (id === undefined) return undefined;
  return reg.servicePostures.get(id) ?? (reg.blockingPostures.has(id) ? defaultPresetOf(reg, id) : undefined);
}

/** The base posture an id stands on (a base id is its own base). */
export const baseOfPosture = (reg: Registries, id: string): string | undefined => (reg.servicePostures.get(id)?.base as string | undefined) ?? (reg.blockingPostures.has(id) ? id : undefined);

/** Are two names the same posture: both read through `presetOf` and land on one preset. */
export function samePreset(reg: Registries, a: string | undefined, b: string | undefined): boolean {
  const pa = presetOf(reg, a);
  return pa !== undefined && pa.id === presetOf(reg, b)?.id;
}

/** The presets of a base, in registry order. */
export const presetsOfBase = (reg: Registries, base: string): Entry[] => [...reg.servicePostures.values()].filter((p) => p.base === base);

/**
 * The preset the commander holds now: `blocking.commander.preset` when it is a preset of the posture held, else the default preset of that posture, else `undefined` (no posture set).
 * A stored preset of another base (the base moved under it) is never read.
 */
export function commanderPresetOf(state: Pick<CampaignState, 'scene'>, reg: Registries): Entry | undefined {
  const b = state.scene?.blocking?.[COMMANDER];
  if (b?.posture === undefined) return undefined;
  const held = b.preset !== undefined ? reg.servicePostures.get(b.preset) : undefined;
  return held !== undefined && held.base === b.posture ? held : defaultPresetOf(reg, b.posture);
}

interface Requires { frame?: Frame; affordances?: string[]; anchor?: string[]; items?: string[] }
const requiresOf = (preset: Entry): Requires => (preset.requires ?? {}) as Requires;

/**
 * May she have the commander take this preset at all: its content categories are on and none is among her limits (the gate reads the preset's `tags` as `contentTags`), and every one of
 * them is at the frame its `requires.frame` asks. This is the gate of her set and of her call; where the commander stands is `presetFits`.
 */
export function presetAllowed(state: CampaignState, reg: Registries, preset: Entry, unitIds: string[]): boolean {
  if (!entryAllowed(state, reg, { contentTags: preset.tags }, unitIds)) return false;
  const frame = requiresOf(preset).frame;
  return frame === undefined || unitIds.every((id) => frameRank(frameOf(state, id)) >= frameRank(frame));
}

/**
 * Why the commander cannot take this preset where she is, or `null`: the place offers what it needs (`requires.affordances`), the commander is at one of the places it names
 * (`requires.anchor`) and wears one of the items it names (`requires.items`).
 */
export function presetProblem(state: CampaignState, reg: Registries, preset: Entry): string | null {
  const r = requiresOf(preset);
  const have = sceneAffordances(state, reg);
  const missing = (r.affordances ?? []).find((a) => !have.has(a));
  if (missing !== undefined) return `This place has no ${missing}.`;
  const b = state.scene?.blocking?.[COMMANDER];
  if (r.anchor !== undefined && !r.anchor.includes(b?.anchor?.id ?? '')) return `${String(preset.label)} needs a place: ${r.anchor.map((a) => String(reg.blockingAnchors.get(a)?.label ?? a).toLowerCase()).join(' or ')}.`;
  if (r.items !== undefined) {
    const worn = new Set(Object.values(b?.worn ?? {}).map((w) => w?.id));
    if (!r.items.some((i) => worn.has(i))) return `${String(preset.label)} needs something worn: ${r.items.map((i) => String(reg.blockingItems.get(i)?.label ?? i).toLowerCase()).join(' or ')}.`;
  }
  return null;
}

/** Does the commander's current preset carry this contact (`supports`)? Read by the contact's id in the preset's list; a posture with no preset carries nothing. */
export function presetSupports(state: Pick<CampaignState, 'scene'>, reg: Registries, contactId: string): boolean {
  const supports = commanderPresetOf(state, reg)?.supports;
  return Array.isArray(supports) && (supports as string[]).includes(contactId);
}

/** May this contact be offered or staged as far as the postures go: it is not `supported`, no gate asks for the restriction, or the commander's preset carries it. */
export function contactCarried(state: CampaignState, reg: Registries, contact: Entry): boolean {
  if (contact.supported !== true || !supportRequired(state, reg)) return true;
  return presetSupports(state, reg, String(contact.id));
}
