import { isLiving } from '../../engine/economy';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/** The reading of `glossary:head_start` (P11b): how long the squad has known the commander and who arrived today. No hidden value is read. */
function headStartProvider(_s: Subject, env: AnalyzeEnv, _k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const hs = state.headStart;
  if (!hs) return { lines: ['No head start.'] };
  const known = new Set(hs.units.map((u) => u.unitId));
  const arrivals = state.squad.filter((u) => u.kind === 'named' && !known.has(u.id) && isLiving(u)).map((u) => u.displayName);
  return { lines: [`The squad has known the commander for ${hs.days} days.`, ...(arrivals.length > 0 ? [`New arrivals: ${arrivals.join(', ')}.`] : [])] };
}

/** Registered by `registerCoreProviders`. */
export function registerHeadStartProviders(): void {
  registerAnalyzeProvider('glossary:head_start', headStartProvider);
}
