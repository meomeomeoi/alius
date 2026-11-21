/**
 * P15a: the state before each change to the blocking, so that a swipe, an edit or a delete takes back what came after a reply
 * (plan R7). Physics is never rolled back; only `blocking` (and, from Task 13, `moments`).
 */
import type { CampaignState } from '../state/types';
import type { StagingSnapshot, WornSlot } from './state';
import { TUNING } from '../tuning';

/**
 * Takes back what changed after chat index `index`: the blocking (and the moments) go back to the state before the oldest change made
 * after it, and the log from there on is dropped. Returns whether anything was rolled back. Never touches physics (plan R7): while a hold runs nothing is taken back, so the run never loses its contact.
 */
export function rollbackAfter(draft: CampaignState, index: number): boolean {
  const scene = draft.scene;
  const log = scene?.stagingLog;
  if (!scene || !log) return false;
  if (scene.physics) return false; // a hold is never rolled back, and what it stands on (its contact, its item) stays with it
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
export function pushLog(draft: CampaignState, at: number, meta: Pick<StagingSnapshot, 'person' | 'field' | 'value' | 'source'> = {}): void {
  const scene = draft.scene;
  if (!scene) return;
  const log = (scene.stagingLog ??= []);
  log.push({ at, blocking: structuredClone(scene.blocking ?? {}), ...(scene.moments !== undefined ? { moments: structuredClone(scene.moments) } : {}), ...meta, exchange: scene.exchanges });
  if (log.length > TUNING.blocking.logMax) log.splice(0, log.length - TUNING.blocking.logMax);
}

/**
 * Takes a value out of every snapshot of the log: what the engine removed quietly (the stop word, the end of a hold, a category switched
 * off, her waking) must not come back when a later swipe, edit or delete restores an older snapshot whole (review finding C1). `drop` says
 * which worn item, contact or activity goes.
 */
export function scrubLog(draft: CampaignState, drop: (kind: 'item' | 'contact' | 'activity', id: string, person: string) => boolean): void {
  for (const snap of draft.scene?.stagingLog ?? []) {
    for (const [person, rec] of Object.entries(snap.blocking)) {
      for (const [slot, w] of Object.entries(rec.worn ?? {})) if (w && drop('item', w.id, person)) delete rec.worn![slot as WornSlot];
      if (rec.worn && Object.keys(rec.worn).length === 0) delete rec.worn;
      if (rec.contact && drop('contact', rec.contact.id, person)) delete rec.contact;
      if (rec.activity !== undefined && drop('activity', rec.activity, person)) delete rec.activity;
      if (Object.keys(rec).length === 0) delete snap.blocking[person];
    }
  }
}
