import type { EngineEvent } from '../engine/dispatch';
import { publicRecent, worldDossier } from '../engine/memory/inputs';
import { buildDigest } from '../engine/world/director';
import type { DirectorTickInput } from '../llm/calls/directorTick';
import { openRecords } from '../engine/generations';
import type { WorldDeps } from './deps';

export type { WorldDeps } from './deps';

export interface DirectorController {
  /** Answers the open director request, if any. Safe to call often: one run per request id. */
  onRequested(): Promise<void>;
  /** P14: USE FALLBACK on a failed tick: the engine plans the world now (the request was held open for a RETRY). */
  useFallback(): void;
  busy(): boolean;
}

/** The text of a held record whose request the day end answered with the engine's own plan. */
export const DAY_ENDED = 'The day ended: the engine planned the world.';

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
    // not worth a message: a chat switch, an answer after the request was closed, a fight in progress (it is retried when the fight ends)
    if (failed && failed.code !== 'chat_changed' && failed.code !== 'combat_open' && failed.message !== 'Stale director answer.') {
      deps.toast('error', String(failed.message ?? failed.code));
    }
    const rejected = events.find((e) => e.type === 'director_rejected');
    if (rejected && deps.settings().debug) {
      const list = (rejected.rejected as Array<{ part: string; reason: string }>).map((r) => `${r.part}: ${r.reason}`);
      deps.toast('info', `Director answer rejected in part: ${list.join('; ')}`);
    }
  }

  // the `director.tick` site (key: the request id): a failed tick is HELD, the request stays open for RETRY or USE FALLBACK, and the day end
  // plans the world with the engine's own fallback as before
  deps.generations.bind<DirectorTickInput, unknown>('director.tick', {
    build(requestId) {
      const state = deps.app.current().state;
      const pending = state?.world.director?.pending;
      if (!state || !pending || pending.id !== requestId) return { expired: DAY_ENDED };
      return { digest: buildDigest(state, deps.registries()), reason: pending.reason, recent: publicRecent(state), worldDossier: worldDossier(state) }; // P3b: public memory only
    },
    apply(requestId, output) {
      const events = deps.app.dispatch({ type: 'director/apply', payload: { requestId, output, beatCooldownDays: deps.settings().beatCooldownDays } }, { expectChatId: chatId() });
      const failed = events.find((e) => e.type === 'error');
      // a chat switch, an answer after the request was closed and a fight in progress (it is retried when the fight ends) are not worth a message
      if (failed) {
        if (failed.code !== 'chat_changed' && failed.code !== 'combat_open' && failed.message !== 'Stale director answer.') deps.toast('error', String(failed.message ?? failed.code));
        return { stale: true };
      }
      const rejected = events.find((e) => e.type === 'director_rejected');
      if (rejected && deps.settings().debug) {
        const list = (rejected.rejected as Array<{ part: string; reason: string }>).map((r) => `${r.part}: ${r.reason}`);
        deps.toast('info', `Director answer rejected in part: ${list.join('; ')}`);
      }
      return 'ok';
    },
  });

  /** Records of requests the day end has already answered with the fallback plan expire, saying so. */
  function expireStale(pendingId: string | undefined, chat: string | undefined): void {
    const state = deps.app.current().state;
    if (!state) return;
    for (const r of openRecords(state, { siteId: 'director.tick' })) {
      if (r.key !== pendingId) deps.app.dispatch({ type: 'generation/expire', payload: { id: r.id, why: DAY_ENDED } }, { expectChatId: chat });
    }
  }

  async function onRequested(): Promise<void> {
    const state = deps.app.current().state;
    const pending = state?.world.director?.pending;
    const chat = chatId();
    expireStale(pending?.id, chat);
    // request ids repeat from campaign to campaign: the chat is part of the key
    const key = `${chat ?? ''}:${pending?.id ?? ''}`;
    if (!state || !pending || running.has(key)) return;
    running.add(key);
    try {
      const settings = deps.settings();
      if (!settings.directorEnabled) {
        answer({ type: 'director/fallback', payload: { requestId: pending.id } }, chat);
        return;
      }
      const out = await deps.generations.generate('director.tick', pending.id);
      // no mechanic profile: nothing a retry could change, the engine plans the world at once (as with the director off)
      if (out.kind === 'failed' && out.reason === 'no_profile' && chatId() === chat) answer({ type: 'director/fallback', payload: { requestId: pending.id } }, chat);
    } finally {
      running.delete(key);
    }
  }

  function useFallback(): void {
    const state = deps.app.current().state;
    const pending = state?.world.director?.pending;
    if (!state || !pending) return;
    const chat = chatId();
    answer({ type: 'director/fallback', payload: { requestId: pending.id } }, chat);
    deps.app.dispatch({ type: 'generation/close', payload: { siteId: 'director.tick', key: pending.id, outcome: 'kept_fallback' } }, { expectChatId: chat });
  }

  return { onRequested, useFallback, busy: () => running.size > 0 };
}
