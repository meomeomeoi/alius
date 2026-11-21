/**
 * P15a: the state before each change to the blocking, so that a swipe, an edit or a delete takes back what came after a reply
 * (plan R7). Physics is never rolled back; only `blocking` (and, from Task 13, `moments`).
 */
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

/** Pushes a deep copy of what is about to change onto the log (newest last, capped). Call it before the change. */
export function pushLog(draft: CampaignState, at: number): void {
  const scene = draft.scene;
  if (!scene) return;
  const log = (scene.stagingLog ??= []);
  log.push({ at, blocking: structuredClone(scene.blocking ?? {}), ...(scene.moments !== undefined ? { moments: structuredClone(scene.moments) } : {}) });
  if (log.length > TUNING.blocking.logMax) log.splice(0, log.length - TUNING.blocking.logMax);
}
