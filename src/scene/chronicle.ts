import { compactionDue, fallbackCompaction } from '../engine/memory';
import type { ChronicleCompactInput } from '../llm/calls/chronicleCompact';
import { readCompaction } from '../llm/calls/chronicleCompact';
import type { SceneDeps } from './sceneController';

const MAX_STEPS = 60;

/**
 * Compacts old chronicle lines while something is due: scene lines of past days into day entries, full weeks into week
 * entries. Without the model (setting off, no answer) the lines are joined, so nothing is lost: the `chronicle.compact` site's
 * fallback (P14: no record, nothing for a retry to change). Stops at the first rejection (for example because the chat changed
 * while the model was writing).
 */
export async function runCompaction(deps: Pick<SceneDeps, 'st' | 'app' | 'settings' | 'generations'>): Promise<void> {
  const expect = deps.st.getActiveChat()?.chatId;
  const dispatchDue = (text: string): boolean => {
    const due = deps.app.current().state ? compactionDue(deps.app.current().state!) : null;
    if (!due || text === '') return false;
    const events = deps.app.dispatch(
      { type: 'memory/compact', payload: { kind: due.kind, day: due.day, ...(due.toDay !== undefined ? { toDay: due.toDay } : {}), ...(due.audience !== undefined ? { audience: due.audience } : {}), text } },
      { expectChatId: expect },
    );
    return !events.some((e) => e.type === 'error');
  };
  const keyOf = (due: { kind: string; day: number }): string => `${due.kind}:${due.day}`;

  deps.generations.bind<ChronicleCompactInput, string>('chronicle.compact', {
    build(key) {
      const s = deps.app.current().state;
      const due = s ? compactionDue(s) : null;
      if (!due || keyOf(due) !== key) return { expired: 'Nothing is waiting to be compacted.' };
      return { kind: due.kind, lines: due.entries.map((e) => e.text) };
    },
    parse: (raw) => readCompaction(String(raw)),
    apply: (_key, text) => (dispatchDue(text) ? 'ok' : { stale: true }),
    fallback() {
      const s = deps.app.current().state;
      const due = s ? compactionDue(s) : null;
      return due !== null && dispatchDue(fallbackCompaction(due.entries));
    },
  });

  for (let step = 0; step < MAX_STEPS; step++) {
    const s = deps.app.current().state;
    const due = s ? compactionDue(s) : null;
    if (!s || !due) return;
    if (!deps.settings().chronicleCompaction || due.entries.length === 0) {
      if (!dispatchDue(fallbackCompaction(due.entries))) return; // the joined lines; an empty text or a refusal ends the run
      continue;
    }
    const out = await deps.generations.generate('chronicle.compact', keyOf(due));
    if (out.kind === 'applied' || (out.kind === 'failed' && out.fallbackApplied)) continue;
    return;
  }
}
