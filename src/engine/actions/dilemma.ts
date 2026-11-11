import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { chooseDilemma, fallbackDilemma, openDilemma, pacingStep, presentDilemma } from '../dilemma/flow';
import type { DilemmaContext } from '../dilemma/types';
import './loyalty'; // registered first: pacing runs after the loyalty day step

// Importing this module registers the dilemma actions and the pacing step.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerDayEndStep('director_tick', pacingStep);

registerAction('dilemma/request', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  if (typeof p.templateId !== 'string' || typeof p.context !== 'string') throw new Error('dilemma/request needs { templateId, context }');
  return openDilemma(draft, ctx, { templateId: p.templateId, context: p.context as DilemmaContext });
});

registerAction('dilemma/present', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  return presentDilemma(draft, ctx, p.requestId, p.output);
});

registerAction('dilemma/fallback', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  return fallbackDilemma(draft, ctx, p.requestId);
});

registerAction('dilemma/choose', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  return chooseDilemma(draft, ctx, p.id, p.index);
});
