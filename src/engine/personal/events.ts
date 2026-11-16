import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import type { Severity, CampaignState } from '../state/types';
import { pressureMultOf } from './gates';

/**
 * Applies one of the engine's own event types to her (through `computeDeltas`, so her defects and states count) and lets her
 * relationship state follow. `amplified` multiplies the deltas by her `pressureMult` (P9c: `rival_favoured`, `token_removed`,
 * `overrode_her`); a rule of the package says which events carry it.
 */
export function hitHer(
  draft: CampaignState, reg: Registries, unitId: string, type: string, severity: Severity, evidence: string, opts: { amplified?: boolean } = {},
): EngineEvent[] {
  const scale = opts.amplified === true ? pressureMultOf(draft, reg, unitId) : 1;
  const events = applyEventToUnit(draft, reg, unitId, { type, actor: 'commander', targets: [unitId], severity, evidence, confidence: 1 } as never, scale === 1 ? {} : { scale });
  events.push(...evaluateAutomatic(draft, reg, unitId));
  return events;
}
