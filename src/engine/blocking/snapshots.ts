/**
 * P15a: the state before each change to the blocking, so that a swipe, an edit or a delete takes back what came after a reply
 * (plan R7). Physics is never rolled back; only `blocking` (and, from Task 13, `moments`).
 */
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

/**
 * Takes back what changed after chat index `index`: the blocking (and the moments) go back to the state before the oldest change made
 * after it, and the log from there on is dropped. Returns whether anything was rolled back. Never touches physics (plan R7).
 */
export function rollbackAfter(draft: CampaignState, index: number): boolean {
  const scene = draft.scene;
  const log = scene?.stagingLog;
  if (!scene || !log) return false;
  const i = log.findIndex((e) => e.at > index);
  if (i < 0) return false;
  const snap = log[i]!;
  if (Object.keys(snap.blocking).length === 0) delete scene.blocking;
  else scene.blocking = structuredClone(snap.blocking);
  if (snap.moments !== undefined) scene.moments = structuredClone(snap.moments);
  else delete scene.moments;
  log.splice(i);
  if (log.length === 0) delete scene.stagingLog;
  return true;
}

/** Pushes a deep copy of what is about to change onto the log (newest last, capped). Call it before the change. */
export function pushLog(draft: CampaignState, at: number): void {
  const scene = draft.scene;
  if (!scene) return;
  const log = (scene.stagingLog ??= []);
  log.push({ at, blocking: structuredClone(scene.blocking ?? {}), ...(scene.moments !== undefined ? { moments: structuredClone(scene.moments) } : {}) });
  if (log.length > TUNING.blocking.logMax) log.splice(0, log.length - TUNING.blocking.logMax);
}
