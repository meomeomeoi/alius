import { registerAction } from '../dispatch';
import { clampMemoryField, MEMORY_NUMERIC_FIELDS, memoryConfig } from '../memory/config';
import type { MemoryConfig, MemoryPreset } from '../state/types';
import { TUNING } from '../tuning';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const PRESETS: MemoryPreset[] = ['short', 'normal', 'long', 'custom'];

/**
 * `memory/configure { preset } | { preset: 'custom', …fields }`. A named preset takes its table row; `custom` keeps what
 * is already in force and overrides the given numbers (each clamped to `MEMORY_RANGES`). `rumorMode` and `hideScenesAfter`
 * are the player's own choices: they are kept across presets and may be given with any preset. The engine does not check
 * the edit lock; the UI does.
 */
registerAction('memory/configure', (draft, payload) => {
  if (!isObj(payload) || !PRESETS.includes(payload.preset as MemoryPreset)) throw new Error('memory/configure needs { preset: short | normal | long | custom }');
  const preset = payload.preset as MemoryPreset;
  const now = memoryConfig(draft);
  const given = MEMORY_NUMERIC_FIELDS.filter((f) => f in payload && f !== 'hideScenesAfter');
  if (preset !== 'custom' && given.length > 0) throw new Error('memory/configure: numbers need preset "custom"');
  const next: { preset: MemoryPreset } & Partial<MemoryConfig> = { preset };
  if ('rumorMode' in payload) {
    if (payload.rumorMode !== 'plain' && payload.rumorMode !== 'model') throw new Error('memory/configure: rumorMode is plain or model');
    next.rumorMode = payload.rumorMode;
  } else {
    next.rumorMode = now.rumorMode;
  }
  const hide = 'hideScenesAfter' in payload ? payload.hideScenesAfter : now.hideScenesAfter;
  if (typeof hide !== 'number' || !Number.isFinite(hide)) throw new Error('memory/configure: hideScenesAfter must be a number');
  next.hideScenesAfter = clampMemoryField('hideScenesAfter', hide);
  if (preset === 'custom') {
    for (const f of MEMORY_NUMERIC_FIELDS) {
      if (f === 'hideScenesAfter') continue;
      const v = f in payload ? payload[f] : now[f];
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`memory/configure: ${f} must be a number`);
      next[f] = clampMemoryField(f, v);
    }
  }
  draft.memory.config = next;
  return [{ type: 'memory_configured', preset }];
});

const factOf = (draft: Parameters<Parameters<typeof registerAction>[1]>[0], payload: unknown, who: string) => {
  if (!isObj(payload) || typeof payload.factId !== 'string') throw new Error(`${who} needs { factId }`);
  const fact = draft.memory.facts.find((f) => f.id === payload.factId);
  if (!fact) throw new Error(`${who}: unknown fact ${payload.factId}`);
  return { fact, payload };
};

registerAction('memory/pin', (draft, payload) => {
  const { fact, payload: p } = factOf(draft, payload, 'memory/pin');
  if (typeof p.pinned !== 'boolean') throw new Error('memory/pin needs { factId, pinned }');
  if (p.pinned) fact.pinned = true;
  else delete fact.pinned;
  return [{ type: 'fact_pinned', factId: fact.id, pinned: p.pinned }];
});

registerAction('memory/forget', (draft, payload) => {
  const { fact } = factOf(draft, payload, 'memory/forget');
  draft.memory.facts = draft.memory.facts.filter((f) => f.id !== fact.id);
  return [{ type: 'fact_forgotten', factId: fact.id }];
});

registerAction('memory/edit', (draft, payload) => {
  const { fact, payload: p } = factOf(draft, payload, 'memory/edit');
  const text = typeof p.text === 'string' ? p.text.trim().slice(0, TUNING.memory.factTextMax).trim() : '';
  if (text === '') throw new Error('memory/edit: empty text');
  fact.text = text;
  fact.edited = true;
  return [{ type: 'fact_edited', factId: fact.id }];
});
