/**
 * P15b (spec §12.1): who a probe row is for. A row with `needs` takes places in her pool only when she has a `manner` and an alternative holds (`styles`: her primary now, a turn counted;
 * `drawnBy`; `manner` bounds on what she has become, not on the mood of the day; `likes`), two when an alternative that names `styles` holds, one for any other; a row with no `needs`
 * takes one, as it always did. Pure: it reads the state and draws nothing. The pool itself (`probePool`) and the pick are in `probes.ts`.
 */
import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { expectationsOf } from './expectations';
import { mannerOf } from './manner';
import { practiceOf, styleOf } from './profile';
import type { MannerAxis, ProbeAxisEntry } from './types';

const LIKE_RANK: Readonly<Record<string, number>> = { none: 0, tolerates: 1, indifferent: 1, dislikes: 0, enjoys: 2, craves: 3 };

/** Whether she likes `what` at least as much as `least` (a practice category through `practiceOf`; `worship.<targetId>` through her expectation profile, planning ruling 9). */
function likesAtLeast(state: CampaignState, reg: Registries, unitId: string, what: string, least: 'enjoys' | 'craves'): boolean {
  if (what.startsWith('worship.')) {
    const attitude = expectationsOf(state, reg, unitId).worship?.[what.slice('worship.'.length)]?.attitude;
    return attitude !== undefined && LIKE_RANK[attitude] >= LIKE_RANK[least];
  }
  const as = practiceOf(state, reg, unitId)?.categories[what]?.as;
  return as !== undefined && LIKE_RANK[as] >= LIKE_RANK[least];
}

/** How many places a probe row takes in her pool: 0, 1 or 2 (see the file's note). */
export function probePlaces(state: CampaignState, reg: Registries, unitId: string, row: ProbeAxisEntry): 0 | 1 | 2 {
  if (row.needs === undefined) return 1;
  const unit = state.squad.find((u) => u.id === unitId);
  const manner = mannerOf({ squad: state.squad }, reg, unitId); // no day: the mood is not part of who she is
  if (unit === undefined || manner === null) return 0;
  const primary = styleOf(unit)?.primary;
  let best: 0 | 1 | 2 = 0;
  for (const n of row.needs) {
    if (n.styles !== undefined && (primary === undefined || !n.styles.includes(primary))) continue;
    if (n.drawnBy !== undefined && !n.drawnBy.some((d) => manner.drawnBy.includes(d))) continue;
    if (n.manner !== undefined && !(Object.entries(n.manner) as Array<[MannerAxis, [number, number]]>).every(([a, [lo, hi]]) => manner.axes[a] >= lo && manner.axes[a] <= hi)) continue;
    if (n.likes !== undefined && !Object.entries(n.likes).every(([what, least]) => likesAtLeast(state, reg, unitId, what, least))) continue;
    best = n.styles !== undefined ? 2 : Math.max(best, 1) as 1 | 2;
    if (best === 2) break;
  }
  return best;
}

const rowsOf = (reg: Registries): ProbeAxisEntry[] => [...reg.probeAxes.values()].map((a) => a as unknown as ProbeAxisEntry);

/** Would any row with `needs` be hers (she has a manner and at least one such row takes places for her): the gate of the regal way in (the joke of the first time below her). */
export function matchesProbeRow(state: CampaignState, reg: Registries, unitId: string): boolean {
  return rowsOf(reg).some((r) => r.needs !== undefined && probePlaces(state, reg, unitId, r) > 0);
}

/** Is she moved by being admired: a row that carries `wakesOnPraise` takes places for her (spec §12.3, gated like §12.1). */
export function admiredBy(state: CampaignState, reg: Registries, unitId: string): boolean {
  return rowsOf(reg).some((r) => r.wakesOnPraise === true && probePlaces(state, reg, unitId, r) > 0);
}
