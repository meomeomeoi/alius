import { z } from 'zod';
import type { StAdapter } from '../../st/adapter';
import { MANIFEST_KEYS, sidecarSchema, type ArtSidecar } from '../scene/art';

/**
 * P10e-f: her stage folder (`characters/<her folder>/alius/`, read through the ST adapter) turned into what the art slots and
 * her look read. Setup data about a card, outside any campaign: no engine state, no rng, nothing remembered. A hand-edited,
 * broken file is skipped with one warning for the whole load; the other files and the game are unaffected.
 */

/** Her look: how she stands on the stage, her face point, her hand and her accent (`stage.json`). */
export interface StageSetup {
  /** Her scene sprite: a scale, and an offset in fractions of her sprite's height. */
  stand?: { scale: number; x: number; y: number };
  /** Her face point on her scene sprite (0–1 of the picture; the slap's). */
  face?: { x: number; y: number };
  /** A hand id of the registry (`handFonts`); one the registry does not know is skipped where it is read. */
  hand?: string;
  /** `#rrggbb`. */
  accent?: string;
}

export interface StageFolder {
  /** Keyed by the file key (`over`, `legs_astride.left`, …); `url` is the server path ST lists, used as given. */
  slots: Map<string, { url: string; sidecar: ArtSidecar }>;
  /** Her `stage.json`; null when it is absent or broken. */
  setup: StageSetup | null;
}

const offset = z.number().finite().min(-0.5).max(0.5);
const unit = z.number().finite().min(0).max(1);
export const stageSetupSchema = z.object({
  stand: z.object({ scale: z.number().finite().min(0.5).max(1.6), x: offset, y: offset }).optional(),
  face: z.object({ x: unit, y: unit }).optional(),
  hand: z.string().min(1).optional(),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
}); // unknown keys are dropped

/** The image types ST's sprite list returns. */
export const STAGE_IMAGE_EXT = /\.(png|webp|jpe?g|gif|avif)$/i;
/** The file of her look and the sidecar of a slot (never `<slot>.json`: ST's upload deletes every file of the same base name). */
export const STAGE_FILE = 'stage.json';
export const sidecarFile = (slotKey: string): string => `${slotKey}.fit.json`;

const issues = (e: z.ZodError): string => e.issues.map((i) => `${i.path.join('.') || '(file)'} ${i.message}`).join('; ');

/**
 * Reads the stage folder of every unit with a card, keyed by `cardRef`. Only pictures named by a slot key are taken (the
 * sidecar `<slotKey>.fit.json` beside each); `stage.json` is read for every card. A card with neither has no entry.
 */
export async function loadStageFolders(st: StAdapter, units: Array<{ id: string; cardRef?: string }>): Promise<Map<string, StageFolder>> {
  const out = new Map<string, StageFolder>();
  const problems: string[] = [];
  const cards = [...new Set(units.map((u) => u.cardRef).filter((c): c is string => typeof c === 'string' && c !== ''))];
  const read = await Promise.all(cards.map(async (card): Promise<StageFolder | null> => {
    const [files, rawSetup] = await Promise.all([st.listStageFiles(card), st.fetchStageJson(card, STAGE_FILE)]);
    const pictures = new Map<string, string>();
    for (const { file, url } of files) {
      if (!STAGE_IMAGE_EXT.test(file)) continue;
      const key = file.replace(/\.[^.]+$/, '');
      if (!MANIFEST_KEYS.includes(key) || pictures.has(key)) continue; // `wallpaper.png` is not a slot; a second type of one slot is ignored
      pictures.set(key, url);
    }
    const slots = new Map<string, { url: string; sidecar: ArtSidecar }>();
    await Promise.all([...pictures].map(async ([key, url]) => {
      const raw = await st.fetchStageJson(card, sidecarFile(key));
      let sidecar: ArtSidecar = {};
      if (raw !== null) {
        const parsed = sidecarSchema.safeParse(raw);
        if (parsed.success) sidecar = parsed.data;
        else problems.push(`${card} ${sidecarFile(key)}: ${issues(parsed.error)}`);
      }
      slots.set(key, { url, sidecar });
    }));
    let setup: StageSetup | null = null;
    if (rawSetup !== null) {
      const parsed = stageSetupSchema.safeParse(rawSetup);
      if (parsed.success) setup = parsed.data;
      else problems.push(`${card} ${STAGE_FILE}: ${issues(parsed.error)}`);
    }
    if (slots.size === 0 && rawSetup === null) return null;
    return { slots: new Map([...pictures.keys()].map((k) => [k, slots.get(k)!])), setup }; // in the folder's order
  }));
  cards.forEach((card, i) => { const folder = read[i]; if (folder !== null) out.set(card, folder); });
  if (problems.length > 0) console.warn(`[Alius] stage: ${problems.length} file(s) skipped — ${problems.join(' | ')}`);
  return out;
}
