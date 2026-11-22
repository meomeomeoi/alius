/**
 * P10e: the scene stage's memory. Everything keyed by a scene id (the looked-around position, the cards set aside, the open
 * curtain) or "used once" (the hints) is reset on a new scene and on a chat switch: scene ids repeat across campaigns.
 * The app calls `resetSceneStage()` beside `practice.onChatChanged()`; later tasks add their own caches here.
 */
import { resetLook } from './look';
import { resetHints } from './topLine';

export function resetSceneStage(): void {
  resetHints();
  resetLook();
}
