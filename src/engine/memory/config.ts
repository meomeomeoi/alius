import type { CampaignState, MemoryConfig, MemoryPreset } from '../state/types';

export type { MemoryConfig, MemoryPreset };

/** The numbers that are the player's own choice, not part of a preset: kept when the preset changes, never locked. */
export const OWN_MEMORY_FIELDS = ['hideScenesAfter', 'factTextMax'] as const;

/** The numeric fields a campaign can tune (the rest of `MemoryConfig` is a choice). */
export type MemoryNumericField = Exclude<keyof MemoryConfig, 'rumorMode'>;

/** P3b spec §1. Named presets; `custom` starts from `normal`. */
export const MEMORY_PRESETS: Record<Exclude<MemoryPreset, 'custom'>, MemoryConfig> = Object.freeze({
  short: Object.freeze({
    factsMax: 80, foldAfterDays: 4, recencyBase: 0.7, retrievalK: 5, memoryTokens: 350, journalLines: 2, dmLines: 2, chronicleDays: 1,
    rumorMode: 'plain', hideScenesAfter: 0, factTextMax: 200,
  } as MemoryConfig),
  normal: Object.freeze({
    factsMax: 160, foldAfterDays: 7, recencyBase: 0.8, retrievalK: 6, memoryTokens: 550, journalLines: 3, dmLines: 3, chronicleDays: 2,
    rumorMode: 'plain', hideScenesAfter: 0, factTextMax: 200,
  } as MemoryConfig),
  long: Object.freeze({
    factsMax: 320, foldAfterDays: 14, recencyBase: 0.9, retrievalK: 8, memoryTokens: 900, journalLines: 5, dmLines: 5, chronicleDays: 3,
    rumorMode: 'plain', hideScenesAfter: 0, factTextMax: 200,
  } as MemoryConfig),
});

/** Every custom number is clamped to its range (draft numbers; the spec names none). */
export const MEMORY_RANGES: Record<MemoryNumericField, [number, number]> = Object.freeze({
  factsMax: [40, 600],
  foldAfterDays: [1, 60],
  recencyBase: [0.5, 0.95],
  retrievalK: [2, 16],
  memoryTokens: [150, 2000],
  journalLines: [0, 8],
  dmLines: [0, 8],
  chronicleDays: [0, 7],
  hideScenesAfter: [0, 20],
  factTextMax: [100, 400],
}) as Record<MemoryNumericField, [number, number]>;

export const MEMORY_NUMERIC_FIELDS = Object.keys(MEMORY_RANGES) as MemoryNumericField[];

export function clampMemoryField(field: MemoryNumericField, value: number): number {
  const [min, max] = MEMORY_RANGES[field];
  const v = Math.min(max, Math.max(min, value));
  return field === 'recencyBase' ? Math.round(v * 100) / 100 : Math.round(v);
}

/** The effective configuration: a campaign without `memory.config` (every old save) reads `normal`. */
export function memoryConfig(state: CampaignState): MemoryConfig & { preset: MemoryPreset } {
  const stored = state.memory.config;
  const preset: MemoryPreset = stored?.preset ?? 'normal';
  const out: MemoryConfig = { ...MEMORY_PRESETS[preset === 'custom' ? 'normal' : preset] };
  if (stored) {
    // a named preset keeps only the two choices; `custom` also keeps its tuned numbers
    if (stored.rumorMode === 'plain' || stored.rumorMode === 'model') out.rumorMode = stored.rumorMode;
    for (const f of OWN_MEMORY_FIELDS) if (typeof stored[f] === 'number' && Number.isFinite(stored[f])) out[f] = clampMemoryField(f, stored[f]);
    if (preset === 'custom') {
      for (const f of MEMORY_NUMERIC_FIELDS) {
        const v = stored[f];
        if (typeof v === 'number' && Number.isFinite(v)) out[f] = clampMemoryField(f, v);
      }
    }
  }
  return { ...out, preset };
}

/** The longest text a fact keeps in this campaign (P11b: a memory setting; 200 unless the player changed it). */
export const factTextMax = (state: CampaignState): number => memoryConfig(state).factTextMax;
