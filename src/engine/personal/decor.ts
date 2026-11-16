import type { Registries } from '../../content/types';
import { activeRules } from '../bonds/rules';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { fnv1a } from '../hub';
import type { CampaignState, Decor, DecorPart } from '../state/types';
import { TUNING } from '../tuning';
import { accessCan, deviceAccess } from './access';
import { hitHer } from './events';
import { personalOf } from './state';

export const DECOR_PARTS: readonly DecorPart[] = ['sticker', 'wallpaper', 'contact'];

/** The level-`n` rule of `deviceAccessRules` (its text lists), or undefined. */
function ruleOfLevel(reg: Registries, level: number): Record<string, unknown> | undefined {
  return [...reg.deviceAccessRules.values()].find((r) => Number(r.level) === level);
}

/** Her decor as it shows now: `null` when she has none, or once the fade after a break-up is over. A faded one is still returned. */
export function decorOf(state: Pick<CampaignState, 'personal' | 'day'>, unitId: string): Decor | null {
  const d = state.personal?.decor?.[unitId];
  if (!d) return null;
  return d.fadedUntil !== undefined && state.day > d.fadedUntil ? null : d;
}

/** The wallpaper belongs to one unit at a time: the one with decor (not faded) that still has the part and the highest Affinity (ties: squad order). */
export function wallpaperUnit(state: Pick<CampaignState, 'personal' | 'day' | 'squad' | 'relations'>): string | null {
  let best: { id: string; affinity: number } | null = null;
  for (const u of state.squad) {
    const d = decorOf(state, u.id);
    if (!d || d.fadedUntil !== undefined || !d.parts.includes('wallpaper') || !isLiving(u)) continue;
    const affinity = state.relations[u.id]?.affinity ?? -Infinity;
    if (best === null || affinity > best.affinity) best = { id: u.id, affinity };
  }
  return best?.id ?? null;
}

/** Pinned notes (level 2): per unit with access ≥ 2 her active rules and one authored line, picked by day and unit (nothing is stored). */
export function pinnedNotes(state: CampaignState, reg: Registries): Array<{ unitId: string; lines: string[] }> {
  const authored = (ruleOfLevel(reg, 2)?.notes as string[] | undefined) ?? [];
  const out: Array<{ unitId: string; lines: string[] }> = [];
  for (const u of state.squad) {
    if (u.kind !== 'named' || !accessCan(state, reg, u.id, 'notes')) continue;
    const lines = activeRules(state, u.id).map((r) => r.text);
    if (authored.length > 0) lines.push(authored[fnv1a(`${state.day}|${u.id}`) % authored.length].replaceAll('{name}', u.displayName));
    if (lines.length > 0) out.push({ unitId: u.id, lines });
  }
  return out;
}

/** The commander peels one part off her decor: `decor_removed` (minor) on her, and the part stays off for `regrowDays`. */
export function removeDecor(draft: CampaignState, ctx: EngineCtx, unitId: string, part: DecorPart): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  const decor = draft.personal?.decor?.[unitId];
  if (!unit || unit.kind !== 'named' || !isLiving(unit) || !decor) throw new Error('There is nothing of hers to peel.');
  if (!DECOR_PARTS.includes(part) || !decor.parts.includes(part)) throw new Error('There is nothing of hers to peel there.');
  decor.parts = decor.parts.filter((p) => p !== part);
  (decor.removed ??= {})[part] = draft.day;
  return [...hitHer(draft, ctx.registries, unitId, 'decor_removed', 'minor', 'peeled her decor'), { type: 'decor_removed_by_commander', unitId, part }];
}

/**
 * The decor part of the day step (no draw): places decor the first day she has level 1 (all three parts, a contact name picked
 * by her id), puts back a part peeled `regrowDays` ago, fades the decor of a unit whose access fell to 0 for `fadeDays` and
 * deletes it after that; access coming back clears the fade.
 */
export function decorDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const u of draft.squad) {
    if (u.kind !== 'named') continue;
    const has = draft.personal?.decor?.[u.id];
    const access = deviceAccess(draft, reg, u.id);
    if (!has) {
      if (access < 1) continue;
      const names = (ruleOfLevel(reg, 1)?.contactNames as string[] | undefined) ?? ['{name}'];
      (personalOf(draft).decor ??= {})[u.id] = {
        since: draft.day, parts: [...DECOR_PARTS], contactName: names[fnv1a(u.id) % names.length].replaceAll('{name}', u.displayName),
      };
      events.push({ type: 'decor_placed', unitId: u.id });
    } else if (access >= 1) {
      delete has.fadedUntil;
      for (const [part, day] of Object.entries(has.removed ?? {}) as Array<[DecorPart, number]>) {
        if (day + TUNING.personal.decor.regrowDays > draft.day) continue;
        delete has.removed![part];
        has.parts = DECOR_PARTS.filter((p) => has.parts.includes(p) || p === part);
      }
      if (has.removed && Object.keys(has.removed).length === 0) delete has.removed;
    } else if (has.fadedUntil === undefined) {
      has.fadedUntil = draft.day + TUNING.personal.decor.fadeDays;
      events.push({ type: 'decor_faded', unitId: u.id, until: has.fadedUntil });
    } else if (draft.day > has.fadedUntil) {
      delete draft.personal!.decor![u.id];
    }
  }
  return events;
}
