import type { CampaignState, ChronicleEntry, MemoryConfig, SceneMark } from '../state/types';
import { visibleToAll } from './audience';

/** Ended scenes whose chat range is remembered (the controller hides old ones; see `hideCandidates`). */
export const SCENE_MARKS_MAX = 50;

/** Remembers where an ended scene sits in the ST chat and whether its summary was stored; keeps the last 50. */
export function recordSceneRange(draft: CampaignState, mark: SceneMark): void {
  const marks = (draft.memory.scenes ??= []).filter((m) => m.sceneId !== mark.sceneId);
  marks.push({ ...mark });
  draft.memory.scenes = marks.slice(-SCENE_MARKS_MAX);
}

/** Week entries shown beside the recent days: 1, and 2 for a long memory (the spec has no field for it: it follows `chronicleDays`). */
const weekEntries = (cfg: Pick<MemoryConfig, 'chronicleDays'>): number => (cfg.chronicleDays >= 3 ? 2 : 1);

/**
 * "Recently in the unit": the day entries and scene lines of the last `chronicleDays` days (and today), plus the newest week
 * entries, whose audience includes every viewer. `'public'` (out of a scene) takes only what the whole squad knows (`'*'`).
 * An entry without an audience was written before P3b and never appears. Oldest first, one line each.
 */
export function recentLines(state: CampaignState, viewers: string[] | 'public', cfg: Pick<MemoryConfig, 'chronicleDays'>): string[] {
  const shown = (e: ChronicleEntry): boolean => (viewers === 'public' ? e.audience === '*' : visibleToAll(e.audience, viewers));
  const chronicle = state.memory.chronicle.filter(shown);
  const weeks = chronicle.filter((e) => e.kind === 'week').sort((a, b) => a.day - b.day).slice(-weekEntries(cfg));
  const days = chronicle.filter((e) => e.kind !== 'week' && e.day >= state.day - cfg.chronicleDays);
  const order = new Map(state.memory.chronicle.map((e, i) => [e.id, i]));
  days.sort((a, b) => a.day - b.day || order.get(a.id)! - order.get(b.id)!);
  return [
    ...weeks.map((e) => `Days ${e.day}–${e.toDay ?? e.day}: ${e.text}`),
    ...days.map((e) => `Day ${e.day}: ${e.text}`),
  ];
}
