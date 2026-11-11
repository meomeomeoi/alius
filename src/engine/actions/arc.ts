import { registerActivityHook } from '../activities';
import { arcActivityHook, decideArc, type ArcPath } from '../arcs';
import { registerAction } from '../dispatch';

// Importing this module registers the defect-arc action and its medbay hook (P6).

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerActivityHook(arcActivityHook);

registerAction('arc/decide', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  if (typeof p.unitId !== 'string' || typeof p.defectId !== 'string' || typeof p.path !== 'string') {
    throw new Error('arc/decide needs { unitId, defectId, path, compel? }');
  }
  return decideArc(draft, ctx, { unitId: p.unitId, defectId: p.defectId, path: p.path as ArcPath, compel: p.compel === true });
});
