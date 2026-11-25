/**
 * P10e: the scene stage's memory. Everything keyed by a scene id (the looked-around position, the cards set aside, the open
 * curtain) or "used once" (the hints) is reset on a new scene and on a chat switch: scene ids repeat across campaigns.
 * The app calls `resetSceneStage()` beside `practice.onChatChanged()`; a module with such memory registers with `onStageReset`
 * (or is called here directly), so nothing keyed by a scene id outlives its campaign.
 */
import { resetInstruments } from '../instruments/host';
import { resetSlap } from '../instruments/slap/slap';
import { resetDock } from './dock';
import { resetLook } from './look';
import { resetHints } from './topLine';

const hooks = new Set<() => void>();

/** Registers something to forget on a reset (the open curtain closes); returns how to unregister. */
export function onStageReset(fn: () => void): () => void {
  hooks.add(fn);
  return () => void hooks.delete(fn);
}

export function resetSceneStage(): void {
  resetHints();
  resetLook();
  resetDock();
  resetInstruments(); // P10e-e: a chat switch stops the instrument (nothing it scheduled runs or dispatches into the new chat) and forgets a failed mount
  resetSlap(); // P10e-e Task 12: and the slap (no late answer into the new chat); the cheek is scene memory, forgotten
  for (const fn of [...hooks]) fn();
}
