import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { applyFold, WORLD } from '../memory/fold';
import { spreadRumors } from '../memory/rumors';
import { clampMemoryField, factTextMax, MEMORY_NUMERIC_FIELDS, memoryConfig, OWN_MEMORY_FIELDS } from '../memory/config';
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
  const given = MEMORY_NUMERIC_FIELDS.filter((f) => f in payload && !(OWN_MEMORY_FIELDS as readonly string[]).includes(f));
  if (preset !== 'custom' && given.length > 0) throw new Error('memory/configure: numbers need preset "custom"');
  const next: { preset: MemoryPreset } & Partial<MemoryConfig> = { preset };
  if ('rumorMode' in payload) {
    if (payload.rumorMode !== 'plain' && payload.rumorMode !== 'model') throw new Error('memory/configure: rumorMode is plain or model');
    next.rumorMode = payload.rumorMode;
  } else {
    next.rumorMode = now.rumorMode;
  }
  for (const f of OWN_MEMORY_FIELDS) {
    const v = f in payload ? payload[f] : now[f];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`memory/configure: ${f} must be a number`);
    next[f] = clampMemoryField(f, v);
  }
  if (preset === 'custom') {
    for (const f of MEMORY_NUMERIC_FIELDS) {
      if ((OWN_MEMORY_FIELDS as readonly string[]).includes(f)) continue;
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
  const text = typeof p.text === 'string' ? p.text.trim().slice(0, factTextMax(draft)).trim() : '';
  if (text === '') throw new Error('memory/edit: empty text');
  fact.text = text;
  fact.edited = true;
  return [{ type: 'fact_edited', factId: fact.id }];
});

/**
 * `memory/fold { target, own, shared, factIds }`: the dossier of `target` (a unit id or `*`) and the facts it replaces. Refused unless
 * `factIds` is exactly the fold that is due now (`foldDue`), so an answer that arrives late folds nothing.
 */
registerAction('memory/fold', (draft, payload) => {
  if (!isObj(payload) || typeof payload.target !== 'string' || typeof payload.own !== 'string' || typeof payload.shared !== 'string'
    || !Array.isArray(payload.factIds) || !payload.factIds.every((x) => typeof x === 'string')) {
    throw new Error('memory/fold needs { target, own, shared, factIds }');
  }
  applyFold(draft, { target: payload.target, own: payload.own, shared: payload.shared, factIds: payload.factIds as string[] });
  return [{ type: 'memory_folded', target: payload.target, folded: draft.memory.dossiers![payload.target].folded }];
});

/** `memory/edit_dossier { target, own?, shared? }`: the player's edit of a dossier (the UI checks the edit lock). */
registerAction('memory/edit_dossier', (draft, payload) => {
  if (!isObj(payload) || typeof payload.target !== 'string') throw new Error('memory/edit_dossier needs { target, own?, shared? }');
  const target = payload.target;
  if (target !== WORLD && !draft.squad.some((u) => u.id === target && u.kind === 'named')) throw new Error(`memory/edit_dossier: unknown unit ${target}`);
  const parts = (['own', 'shared'] as const).filter((k) => k in payload);
  if (parts.length === 0 || parts.some((k) => typeof payload[k] !== 'string')) throw new Error('memory/edit_dossier needs own and/or shared as text');
  const d = ((draft.memory.dossiers ??= {})[target] ??= { own: '', shared: '', day: draft.day, folded: 0 });
  if (parts.includes('own')) d.own = String(payload.own).trim().slice(0, TUNING.memory.dossierOwnMax).trim();
  if (parts.includes('shared')) d.shared = String(payload.shared).trim().slice(0, TUNING.memory.dossierSharedMax).trim();
  return [{ type: 'dossier_edited', target }];
});

/** `memory/rumor_text { factId, text }`: the model's retelling of a rumor, stored once while the fact is still spreading. */
registerAction('memory/rumor_text', (draft, payload) => {
  const { fact, payload: p } = factOf(draft, payload, 'memory/rumor_text');
  const text = typeof p.text === 'string' ? p.text.trim().slice(0, factTextMax(draft)).trim() : '';
  if (text === '') throw new Error('memory/rumor_text: empty text');
  if (!fact.spread || fact.rumor) throw new Error('memory/rumor_text: that fact is not waiting for a retelling');
  fact.rumor = { text };
  return [{ type: 'rumor_told', factId: fact.id }];
});

/**
 * `memory/hidden { add?: [from, to][], clear?: true }`: the chat ranges Alius hid from the model (the runs `hideMessages` returned), so
 * that turning hiding off unhides exactly those. `clear` forgets them all (after they were unhidden), then `add` records new ones.
 */
registerAction('memory/hidden', (draft, payload) => {
  if (!isObj(payload) || (payload.add === undefined && payload.clear === undefined)) throw new Error('memory/hidden needs { add?, clear? }');
  if (payload.clear !== undefined && payload.clear !== true) throw new Error('memory/hidden: clear is true');
  const add = payload.add;
  if (add !== undefined) {
    const ok = Array.isArray(add) && add.every((r) => Array.isArray(r) && r.length === 2 && r.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0) && r[0] <= r[1]);
    if (!ok) throw new Error('memory/hidden: add is a list of [from, to] index pairs');
  }
  if (payload.clear === true) delete draft.memory.hidden;
  if (Array.isArray(add) && add.length > 0) draft.memory.hidden = [...(draft.memory.hidden ?? []), ...(add as Array<[number, number]>).map((r): [number, number] => [r[0], r[1]])];
  return [{ type: 'scenes_hidden', hidden: draft.memory.hidden?.length ?? 0 }];
});

// P3b: rumors spread inside the existing `dm_rumors` day-end step (the hook runs on a copy and draws nothing)
registerDayEndStep('dm_rumors', spreadRumors);
