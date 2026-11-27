/**
 * Which posture she names (P16b, plan Task 22a; spec ruling 25): when her set has room she picks a preset by her taste. The candidates are the presets (registry order) whose `meaning` meets the
 * list of her style (`TUNING.craft.posture.likes`; the primary's first, then the secondary's), that the content gate and her own limits allow (`postureAllowed`), whose humiliation her frame allows
 * (`humiliationByFrame`) and that are not hers yet. A preset the commander is in now that fits is named first (P16's way, kept). Her manner tilts the order: `order` +1 or more puts the stricter meanings first
 * (`strict`), `curiosity` +1 or more puts first a preset with a meaning she has none of. The pick is an index by `craftRoll` into what is left, so it is stable for the day and her set, and draws nothing.
 */
import type { Entry, Registries } from '../../content/types';
import { commanderPresetOf, presetOf, samePreset } from '../blocking';
import { styleOf } from '../dynamic/profile';
import { mannerOf } from '../dynamic/manner';
import { dynamicOf } from '../dynamic/state';
import { postureAllowed } from '../practice/postures';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { craftRoll } from './state';

const P = TUNING.craft.posture;
const meaningsOf = (preset: Entry): string[] => (Array.isArray(preset.meaning) ? preset.meaning.map(String) : []);

/** The presets she may name now, in the order the tilts leave them (the hash then picks among them). Empty when she has no style, or nothing fits. */
export function herCandidates(state: CampaignState, reg: Registries, holderId: string): Entry[] {
  const unit = state.squad.find((u) => u.id === holderId);
  const style = unit === undefined ? undefined : styleOf(unit);
  if (unit === undefined || style === undefined) return [];
  const frame = dynamicOf(state, holderId)?.frame;
  const cap = frame === undefined ? undefined : P.humiliationByFrame[frame];
  if (cap === undefined) return [];
  const mine = state.practices?.postures[holderId] ?? [];
  const likesOf = (s: string | undefined): readonly string[] => (s === undefined ? [] : P.likes[s] ?? []);
  const primary = likesOf(style.primary);
  const secondary = likesOf(style.secondary);
  const fits = (preset: Entry, likes: readonly string[]): boolean => meaningsOf(preset).some((m) => likes.includes(m));
  const ok = (preset: Entry): boolean => Number(preset.humiliation) <= cap && !mine.some((p) => samePreset(reg, p.postureId, String(preset.id))) && postureAllowed(state, reg, String(preset.id), holderId);
  const all = [...reg.servicePostures.values()].filter(ok);
  let list = [...all.filter((p) => fits(p, primary)), ...all.filter((p) => !fits(p, primary) && fits(p, secondary))];
  const manner = mannerOf(state, reg, holderId);
  if (manner !== null && manner.axes.curiosity >= 1) {
    const known = new Set(mine.flatMap((p) => meaningsOf((presetOf(reg, p.postureId) ?? { id: p.postureId }) as Entry)));
    list = [...list.filter((p) => meaningsOf(p).some((m) => !known.has(m))), ...list.filter((p) => !meaningsOf(p).some((m) => !known.has(m)))];
  }
  if (manner !== null && manner.axes.order >= 1) list = [...list.filter((p) => meaningsOf(p).some((m) => P.strict.includes(m))), ...list.filter((p) => !meaningsOf(p).some((m) => P.strict.includes(m)))];
  return list;
}

/**
 * The preset she names next, or `null` when nothing fits. A preset the commander holds that is among the candidates comes first; otherwise a hashed index over the first tier of the order (the tilts
 * put their choices first, so with a manner the pick is among the preferred ones: the head of the list as long as the tilt reaches).
 */
export function pickHerPosture(state: CampaignState, reg: Registries, holderId: string): string | null {
  const list = herCandidates(state, reg, holderId);
  if (list.length === 0) return null;
  const held = commanderPresetOf(state, reg)?.id;
  const heldRow = held === undefined ? undefined : list.find((p) => samePreset(reg, String(p.id), held));
  if (heldRow !== undefined) return String(heldRow.id);
  const manner = mannerOf(state, reg, holderId);
  const tilted = manner !== null && (manner.axes.order >= 1 || manner.axes.curiosity >= 1);
  const pool = tilted ? preferred(state, reg, holderId, list) : list;
  return String(pool[Math.min(pool.length - 1, Math.floor(craftRoll(state, holderId, `pick:${state.practices?.postures[holderId]?.length ?? 0}`) * pool.length))]!.id);
}

/** The head of the list the manner's tilts put first (a pick is among them), else the whole list. */
function preferred(state: CampaignState, reg: Registries, holderId: string, list: readonly Entry[]): Entry[] {
  const manner = mannerOf(state, reg, holderId)!;
  let pool = [...list];
  if (manner.axes.order >= 1) {
    const strict = pool.filter((p) => meaningsOf(p).some((m) => P.strict.includes(m)));
    if (strict.length > 0) pool = strict;
  }
  if (manner.axes.curiosity >= 1) {
    const known = new Set((state.practices?.postures[holderId] ?? []).flatMap((p) => meaningsOf((presetOf(reg, p.postureId) ?? { id: p.postureId }) as Entry)));
    const fresh = pool.filter((p) => meaningsOf(p).some((m) => !known.has(m)));
    if (fresh.length > 0) pool = fresh;
  }
  return pool;
}
