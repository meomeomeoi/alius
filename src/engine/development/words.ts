import type { Registries } from '../../content/types';
import type { Unit } from '../state/types';
import { TUNING } from '../tuning';
import { axisEntry, axisKind, bondField } from './axes';
import { valuesOf } from './profile';
import { developmentOf } from './state';

/** Her changes in words (P14b): what the since-joining block, the DEVELOPMENT view and the readings say. No numbers, no pronoun for the commander. */

const DRAFT_MARK = /^\s*AUTHOR TO WRITE:\s*/i;

/** The registry words of an axis moving up or down, the draft marker removed and the `{tag}` of a wildcard filled in; null when no entry words it. */
export function axisWords(reg: Registries, axis: string, up: boolean, value?: string): string | null {
  const entry = axisEntry(reg, axis);
  if (!entry) return null;
  const tag = axis.slice(axis.indexOf(':') + 1);
  const name = axisKind(axis) === 'taste' ? String(reg.tastes.get(tag)?.name ?? tag) : tag.replace(/_/g, ' ');
  // P15b: the turn of her style names the style she turned to (`value`, the moment's `to`)
  const style = String(reg.practiceStyles.get(value ?? '')?.label ?? value ?? 'another style').toLowerCase();
  const words = (up ? entry.up : entry.down).replace(DRAFT_MARK, '').replace(/\{tag\}/g, name).replace(/\{style\}/g, style).trim();
  return words === '' ? null : words;
}

export interface ChangedAxis { axis: string; up: boolean; words: string }

/**
 * The axes where she now differs from her file: a value that moved a whole step, a bond field one place or more from the import, a like, a
 * dislike or a taste gained or lost. Registry-read by `kind`, in a fixed order (values, bond fields, likes, dislikes, tastes). Pure.
 */
export function changedAxes(unit: Pick<Unit, 'values' | 'bond' | 'development'>, reg: Registries): ChangedAxis[] {
  const dev = developmentOf(unit);
  const out: ChangedAxis[] = [];
  const add = (axis: string, up: boolean): void => {
    const words = axisWords(reg, axis, up);
    if (words !== null) out.push({ axis, up, words });
  };
  const eff = valuesOf(unit);
  for (const a of Object.keys(unit.values) as Array<keyof Unit['values']>) if (eff[a] !== unit.values[a]) add(`value:${a}`, eff[a] > unit.values[a]); // P14b: raw profile
  if (unit.bond !== undefined && dev.bond) { // P14b: raw profile
    for (const key of ['bond:attachment', 'bond:desire', 'bond:caretaker', 'bond:lead_style']) {
      const field = bondField(key)!;
      const now = dev.bond[field];
      if (now === undefined || now === unit.bond[field]) continue; // P14b: raw profile
      const scale = TUNING.development.scales[field] as readonly (string | boolean)[];
      add(key, scale.indexOf(now) > scale.indexOf(unit.bond[field])); // P14b: raw profile
    }
  }
  for (const [kind, field] of [['like', 'likes'], ['dislike', 'dislikes'], ['taste', 'tastes']] as const) {
    for (const t of dev.gained?.[field] ?? []) add(`${kind}:${t}`, true);
    for (const t of dev.lost?.[field] ?? []) add(`${kind}:${t}`, false);
  }
  return out;
}
