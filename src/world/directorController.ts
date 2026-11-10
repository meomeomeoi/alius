import type { EngineEvent } from '../engine/dispatch';
import { buildDigest } from '../engine/world/director';
import { runDirectorTick } from '../llm/calls/directorTick';
import type { WorldDeps } from './deps';

export type { WorldDeps } from './deps';

export interface DirectorController {
  /** Answers the open director request, if any. Safe to call often: one run per request id. */
  onRequested(): Promise<void>;
  busy(): boolean;
}

/**
 * The non-engine half of the two-phase director: the engine opens a request in state, this layer asks the mechanic
 * model (or, with the director off or a failed call, the engine's own fallback) and answers with one action.
 */
export function createDirector(deps: WorldDeps): DirectorController {
  const running = new Set<string>();
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;

  function answer(action: { type: string; payload: unknown }, chat: string | undefined): void {
    const events: EngineEvent[] = deps.app.dispatch(action, { expectChatId: chat });
    const failed = events.find((e) => e.type === 'error');
    // a chat switch or an answer that arrived after the request was closed is not worth a message
    if (failed && failed.code !== 'chat_changed' && failed.message !== 'Stale director answer.') {
      deps.toast('error', String(failed.message ?? failed.code));
    }
    const rejected = events.find((e) => e.type === 'director_rejected');
    if (rejected && deps.settings().debug) {
      const list = (rejected.rejected as Array<{ part: string; reason: string }>).map((r) => `${r.part}: ${r.reason}`);
      deps.toast('info', `Director answer rejected in part: ${list.join('; ')}`);
    }
  }

  async function onRequested(): Promise<void> {
    const state = deps.app.current().state;
    const pending = state?.world.director?.pending;
    if (!state || !pending || running.has(pending.id)) return;
    running.add(pending.id);
    const chat = chatId();
    try {
      const settings = deps.settings();
      if (!settings.directorEnabled) {
        answer({ type: 'director/fallback', payload: { requestId: pending.id } }, chat);
        return;
      }
      const output = await runDirectorTick(
        { digest: buildDigest(state, deps.registries()), reason: pending.reason },
        { st: deps.st, settings },
      );
      // the chat changed while the model thought: the answer belongs to another campaign; the request stays open
      if (chatId() !== chat) return;
      if (output === null) answer({ type: 'director/fallback', payload: { requestId: pending.id } }, chat);
      else answer({ type: 'director/apply', payload: { requestId: pending.id, output, beatCooldownDays: settings.beatCooldownDays } }, chat);
    } finally {
      running.delete(pending.id);
    }
  }

  return { onRequested, busy: () => running.size > 0 };
}
