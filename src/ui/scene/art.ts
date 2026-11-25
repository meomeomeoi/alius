import { z } from 'zod';
import type { Registries } from '../../content/types';
import { contentAllowed, type ContentHolder } from '../../engine/bonds/content';

/**
 * P10e-e: the art slots. The author's own pictures of a unit (never committed: they live in `content/local/art/`, listed by
 * `content/local/art/art.json`), each with the sidecar the prototypes' "copy the fit" buttons give. An instrument asks for a
 * unit's picture per slot and falls back (her sprite, the automatic zones, the ASCII stage) when the answer is null. Empty
 * until chunk (f) builds the setup screen. No rng, no network: a file is a path under the extension.
 */
export const ART_SLOT_IDS = [
  'over', 'over_explicit', 'face_close', 'legs_seated.rest', 'legs_seated.foot_raised', 'legs_astride', 'sole_close', 'feet_floor',
  'shoe_close.boots', 'shoe_close.heels', 'shoe_sole.boots', 'shoe_sole.heels',
] as const;
export type ArtSlotId = (typeof ART_SLOT_IDS)[number];

/** The two files of `legs_astride` with `feet: 'pair'` (her left and her right leg in two pictures). */
const PAIR_KEYS = ['legs_astride.left', 'legs_astride.right'] as const;
const MANIFEST_KEYS: readonly string[] = [...ART_SLOT_IDS, ...PAIR_KEYS];

/** Zones are points `[x, y]`, circles `[x, y, r]` or ellipses `[x, y, rx, ry, rot]` in the picture's own 0–1 coordinates; two feet in one picture carry one set per foot. */
type ZoneSet = Record<string, number[]>;
export interface ArtSidecar {
  fit?: Record<string, number>;
  zones?: ZoneSet | { right: ZoneSet; left: ZoneSet };
  feet?: 'one' | 'pair' | 'two';
  shown?: 'left' | 'right';
  face?: { x: number; y: number };
}

export interface ArtPicture {
  url: string;
  sidecar: ArtSidecar;
  /** `legs_astride` with `feet: 'pair'`: her two legs as two files (`url` is the left one). */
  pair?: { left: string; right: string };
}

export interface ArtGate {
  /** `explicit_scenes` is on for her (`explicitArtAllowed`); without it `over_explicit` is null. */
  explicit?: boolean;
}

export interface ArtSlots {
  get(unitId: string, slot: ArtSlotId, gate?: ArtGate): ArtPicture | null;
}

const num = z.number().finite();
const zoneSet = z.record(z.string(), z.array(num).min(2).max(5));
const sidecarSchema = z.object({
  fit: z.record(z.string(), num).optional(),
  zones: z.union([z.object({ right: zoneSet, left: zoneSet }), zoneSet]).optional(),
  feet: z.enum(['one', 'pair', 'two']).optional(),
  shown: z.enum(['left', 'right']).optional(),
  face: z.object({ x: num, y: num }).optional(),
}); // unknown keys (the prototypes' `slot`, `kind`) are dropped
/** A relative path under `content/local/art/`: no scheme, no root, no `..`, no backslash. */
const fileSchema = z.string().min(1).refine((f) => !/^[a-z][a-z0-9+.-]*:/i.test(f) && !f.startsWith('/') && !f.includes('\\') && !f.split('/').includes('..'), 'not a path under content/local/art');
const entrySchema = z.object({ file: fileSchema, sidecar: sidecarSchema.optional() });

export const ART_ROOT = 'content/local/art/';

/** May her `over_explicit` picture be shown? `explicit_scenes` on in the campaign and not among her own limits. */
export function explicitArtAllowed(state: ContentHolder, reg: Registries, unitId: string): boolean {
  return contentAllowed(state, reg, { contentTags: ['explicit_scenes'] }, unitId);
}

/**
 * The resolver. `manifest` is `content/local/art/art.json` (absent, null or not an object = no art): `{ [unitKey]: { [slot]: { file, sidecar? } } }`,
 * keyed by the unit's card avatar file name (stable across campaigns). A malformed entry is skipped, and the problems are logged once.
 */
export function createArtSlots(manifest: unknown, assetUrl: (p: string) => string, unitKey: (unitId: string) => string | null): ArtSlots {
  const byUnit = new Map<string, Map<string, { file: string; sidecar: ArtSidecar }>>();
  const problems: string[] = [];
  if (manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest)) {
    for (const [key, slots] of Object.entries(manifest as Record<string, unknown>)) {
      if (slots === null || typeof slots !== 'object' || Array.isArray(slots)) { problems.push(`${key}: not an object`); continue; }
      const kept = new Map<string, { file: string; sidecar: ArtSidecar }>();
      for (const [slot, raw] of Object.entries(slots as Record<string, unknown>)) {
        if (!MANIFEST_KEYS.includes(slot)) { problems.push(`${key}.${slot}: unknown slot`); continue; }
        const parsed = entrySchema.safeParse(raw);
        if (!parsed.success) { problems.push(`${key}.${slot}: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(entry)'} ${i.message}`).join('; ')}`); continue; }
        kept.set(slot, { file: parsed.data.file, sidecar: parsed.data.sidecar ?? {} });
      }
      if (kept.size > 0) byUnit.set(key, kept);
    }
  }
  if (problems.length > 0) console.warn(`[Alius] art: ${problems.length} entr${problems.length === 1 ? 'y' : 'ies'} skipped — ${problems.join(' | ')}`);
  const urlOf = (file: string) => assetUrl(ART_ROOT + file);
  return {
    get(unitId, slot, gate) {
      if (slot === 'over_explicit' && gate?.explicit !== true) return null;
      const key = unitKey(unitId);
      const slots = key === null ? undefined : byUnit.get(key);
      if (slots === undefined) return null;
      const entry = slots.get(slot);
      if (slot === 'legs_astride') {
        const left = slots.get(PAIR_KEYS[0]), right = slots.get(PAIR_KEYS[1]);
        if (left !== undefined && right !== undefined && (entry === undefined || entry.sidecar.feet === 'pair')) {
          return { url: urlOf(left.file), sidecar: { ...(entry?.sidecar ?? left.sidecar), feet: 'pair' }, pair: { left: urlOf(left.file), right: urlOf(right.file) } };
        }
      }
      return entry === undefined ? null : { url: urlOf(entry.file), sidecar: entry.sidecar };
    },
  };
}
