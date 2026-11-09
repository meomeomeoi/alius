import { compactionDue, fallbackCompaction } from '../engine/memory';
import { compactChronicle } from '../llm/calls/chronicleCompact';
import type { SceneDeps } from './sceneController';

const MAX_STEPS = 60;

/**
 * Compacts old chronicle lines while something is due: scene lines of past days into day entries, full weeks into week
 * entries. Without the model (setting off, no answer) the lines are joined, so nothing is lost. Stops at the first rejection
 * (for example because the chat changed while the model was writing).
 */
export async function runCompaction(deps: Pick<SceneDeps, 'st' | 'app' | 'settings'>): Promise<void> {
  const expect = deps.st.getActiveChat()?.chatId;
  for (let step = 0; step < MAX_STEPS; step++) {
    const s = deps.app.current().state;
    const due = s ? compactionDue(s) : null;
    if (!s || !due) return;
    const lines = due.entries.map((e) => e.text);
    const modelText = deps.settings().chronicleCompaction ? await compactChronicle({ kind: due.kind, lines }, { st: deps.st, settings: deps.settings() }) : null;
    const text = modelText ?? fallbackCompaction(due.entries);
    if (text === '') return;
    const events = deps.app.dispatch(
      { type: 'memory/compact', payload: { kind: due.kind, day: due.day, ...(due.toDay !== undefined ? { toDay: due.toDay } : {}), text } },
      { expectChatId: expect },
    );
    if (events.some((e) => e.type === 'error')) return;
  }
}
