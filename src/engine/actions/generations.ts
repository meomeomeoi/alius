import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { CLOSE_OUTCOMES, closeRecords, expireRecord, generationSweep, readFailure, recordFailure, type CloseOutcome } from '../generations';

// Importing this module registers the failure records of model calls (P14): generation/failed, generation/close, generation/expire,
// and the day-end sweep of expired ones. None of them draws from the rng.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerAction('generation/failed', (draft, payload) => recordFailure(draft, readFailure(payload)));

registerAction('generation/close', (draft, payload) => {
  if (!isObj(payload) || !(CLOSE_OUTCOMES as readonly unknown[]).includes(payload.outcome)) throw new Error('generation/close needs an outcome of applied, dropped or kept_fallback');
  const outcome = payload.outcome as CloseOutcome;
  if (typeof payload.id === 'string' && payload.id !== '') return closeRecords(draft, { id: payload.id }, outcome);
  if (typeof payload.siteId === 'string' && payload.siteId !== '' && typeof payload.key === 'string' && payload.key !== '') {
    return closeRecords(draft, { siteId: payload.siteId, key: payload.key }, outcome);
  }
  throw new Error('generation/close needs { id } or { siteId, key }');
});

registerAction('generation/expire', (draft, payload) => {
  if (!isObj(payload) || typeof payload.id !== 'string' || typeof payload.why !== 'string') throw new Error('generation/expire needs { id, why }');
  return expireRecord(draft, payload.id, payload.why);
});

// the last hook of the last pluggable step: the sweep only touches `generations`, so the order among the others does not matter
registerDayEndStep('dm_rumors', generationSweep);
