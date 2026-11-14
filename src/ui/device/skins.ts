import type { Entry, Registries } from '../../content/types';
import { traitIds } from '../../engine/commander/traits';
import type { CampaignState } from '../../engine/state/types';

/** The one fixed skin id: what shows when nothing else applies (overview P4: data, not ids, with this exception). */
export const FALLBACK_SKIN = 'ccp_standard';

/** Used only when a pack ships no skins at all; the core pack's `ccp_standard` is the same. */
const BUILT_IN: Entry = {
  id: FALLBACK_SKIN, name: 'CCP standard issue', description: 'Corporate-surplus handheld.', kind: 'css', cssPreset: 'ccp_standard',
  ledColor: '#ffb000', accent: '#d8cb98', label: 'CCP-PDA MK.III',
};

/**
 * The casing the PDA wears. Precedence: a valid `override` (the SYS choice) → a skin bound to one of the commander's
 * traits → to an unlock flag (world or commander) → to the commander's corporation → `ccp_standard`. Ties go to the
 * registry order. Without a campaign only the override counts.
 */
export function pickSkin(state: CampaignState | null, reg: Registries, override: string): Entry {
  const skins = [...reg.deviceSkins.values()];
  const chosen = override ? reg.deviceSkins.get(override) : undefined;
  if (chosen) return chosen;
  const fallback = reg.deviceSkins.get(FALLBACK_SKIN) ?? BUILT_IN;
  if (!state) return fallback;
  const bound = (key: 'traitId' | 'unlockFlag' | 'corporationId', holds: (v: string) => boolean): Entry | undefined =>
    skins.find((s) => {
      const v = (s.bindTo as Record<string, string | undefined> | undefined)?.[key];
      return typeof v === 'string' && holds(v);
    });
  const traits = traitIds(state);
  const flags = new Set([...state.world.flags, ...state.commander.flags]);
  return bound('traitId', (v) => traits.includes(v))
    ?? bound('unlockFlag', (v) => flags.has(v))
    ?? bound('corporationId', (v) => v === state.commander.corporationId)
    ?? fallback;
}

const pct = (part: number, whole: number): string => `${+((part / whole) * 100).toFixed(3)}%`;

/**
 * Where the screen sits inside an `image` skin, in percent of the frame, so it stays on the cut-out however large the
 * frame is drawn. `null` for a css skin (its screen is laid out by the stylesheet).
 */
export function screenBox(skin: Entry): { left: string; top: string; width: string; height: string } | null {
  const size = skin.frameSize as { w: number; h: number } | undefined;
  const rect = skin.screenRect as { x: number; y: number; w: number; h: number } | undefined;
  if (skin.kind !== 'image' || !size || !rect) return null;
  return { left: pct(rect.x, size.w), top: pct(rect.y, size.h), width: pct(rect.w, size.w), height: pct(rect.h, size.h) };
}
