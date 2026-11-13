import { DESCRIBED_REGISTRIES } from '../content/schemas';
import type { Entry, Registries, RegistryName } from '../content/types';

/** Registries whose entries the player can see: the 20 that carry `description`, plus the glossary. */
export const PLAYER_VISIBLE: readonly RegistryName[] = [...DESCRIBED_REGISTRIES, 'glossary'];

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** `term ?? name ?? label ?? id`. */
export function entryTitle(_registry: RegistryName, entry: Entry): string {
  return text(entry.term) ?? text(entry.name) ?? text(entry.label) ?? entry.id;
}

/**
 * The static text of an entry: `description ?? summary ?? fallback`. Fallbacks: defects show their
 * upside and downside, signatures their `mechanic`, clocks their `label`, flags their `description`.
 * `null` when the entry carries nothing to show.
 */
export function entryText(registry: RegistryName, entry: Entry): string | null {
  if (registry === 'glossary') return text(entry.short);
  const direct = text(entry.description) ?? text(entry.summary);
  if (direct) return direct;
  switch (registry) {
    case 'defects': {
      const parts = [
        text(entry.upside) && `Upside: ${entry.upside as string}`,
        text(entry.downside) && `Downside: ${entry.downside as string}`,
      ].filter((p): p is string => !!p);
      return parts.length ? parts.join(' · ') : null;
    }
    case 'signatures':
      return text(entry.mechanic);
    case 'clocks':
      return text(entry.label);
    default:
      return null;
  }
}

/** Player-visible entries with nothing to show (the content check behind SYS › Debug › Content warnings). */
export function missingDescriptions(reg: Registries): Array<{ registry: RegistryName; id: string }> {
  const out: Array<{ registry: RegistryName; id: string }> = [];
  for (const registry of PLAYER_VISIBLE) {
    for (const [id, entry] of reg[registry]) {
      if (entryText(registry, entry) === null) out.push({ registry, id });
    }
  }
  return out;
}

/**
 * The glossary id that explains a setting: `setting_<key in snake_case>`. Content ids are lower-case
 * (`ID_PATTERN`), settings keys are camelCase: `showRawValues` → `setting_show_raw_values`.
 */
export function settingGlossaryId(key: string): string {
  return `setting_${key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`;
}
