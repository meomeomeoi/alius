import type { EngineEvent } from '../engine/dispatch';
import { buildDilemmaDigest } from '../engine/dilemma/flow';
import { TUNING } from '../engine/tuning';
import { runDilemmaGenerate } from '../llm/calls/dilemmaGenerate';
import type { WorldDeps } from '../world/deps';

export interface DilemmaController {
  /** Answers the open dilemma request, if any. Safe to call often: one run per request id. */
  onRequested(): Promise<void>;
  /** The player's pick of a presented dilemma. Returns the engine's events (empty when nothing is waiting). */
  choose(index: number): EngineEvent[];
  busy(): boolean;
}

/**
 * The non-engine half of the two-phase dilemma: the engine opens a request in state, this layer asks the mechanic model
 * (up to two answers) and presents what the engine accepts; the setting off, no profile or a failed call mean the
 * template's authored block.
 */
export function createDilemmas(deps: WorldDeps): DilemmaController {
  const running = new Set<string>();
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;

  function answer(action: { type: string; payload: unknown }, chat: string | undefined): EngineEvent[] {
    const events = deps.app.dispatch(action, { expectChatId: chat });
    const failed = events.find((e) => e.type === 'error');
    // not worth a message: a chat switch, a fight in progress (answered when it ends), an answer after the request closed
    if (failed && failed.code !== 'chat_changed' && failed.code !== 'combat_open' && failed.message !== 'Stale dilemma answer.') {
      deps.toast('error', String(failed.message ?? failed.code));
    }
    const rejected = events.find((e) => e.type === 'dilemma_rejected');
    if (rejected && deps.settings().debug) {
      const list = (rejected.rejections as Array<{ reason: string }>).map((r) => r.reason);
      deps.toast('info', `Dilemma answer rejected: ${list.join('; ')}`);
    }
    return events;
  }

  async function onRequested(): Promise<void> {
    const first = deps.app.current().state?.dilemmas?.open;
    const chat = chatId();
    // request ids repeat from campaign to campaign: the chat is part of the key
    const key = `${chat ?? ''}:${first?.id ?? ''}`;
    if (!first || first.status !== 'requested' || running.has(key)) return;
    running.add(key);
    try {
      const settings = deps.settings();
      const fallback = (id: string): void => void answer({ type: 'dilemma/fallback', payload: { requestId: id } }, chat);
      if (!settings.dilemmasEnabled) return fallback(first.id);
      for (let attempt = 0; attempt < TUNING.dilemma.maxAttempts; attempt++) {
        const state = deps.app.current().state;
        const open = state?.dilemmas?.open;
        if (!state || !open || open.id !== first.id || open.status !== 'requested') return;
        const reg = deps.registries();
        const template = reg.dilemmaTemplates.get(open.templateId);
        if (!template) return fallback(open.id); // the engine resolves a vanished template
        const output = await runDilemmaGenerate({
          template: {
            id: open.templateId, scale: open.scale, brief: String((template.generate as { brief?: string } | undefined)?.brief ?? ''),
            optionCount: (template.optionCount as number | undefined) ?? 3,
            flagPerOption: (template.constraints as { flagPerOption?: boolean } | undefined)?.flagPerOption === true,
          },
          digest: buildDilemmaDigest(state, reg, open),
        }, { st: deps.st, settings });
        // the chat changed while the model thought: the answer belongs to another campaign; the request stays open
        if (chatId() !== chat) return;
        if (output === null) return fallback(open.id);
        const events = answer({ type: 'dilemma/present', payload: { requestId: open.id, output } }, chat);
        if (events.find((e) => e.type === 'dilemma_rejected')?.retry !== true) return;
      }
    } finally {
      running.delete(key);
    }
  }

  function choose(index: number): EngineEvent[] {
    const open = deps.app.current().state?.dilemmas?.open;
    if (!open || open.status !== 'presented') return [];
    const events = deps.app.dispatch({ type: 'dilemma/choose', payload: { id: open.id, index } });
    const failed = events.find((e) => e.type === 'error');
    if (failed && failed.message !== 'Stale dilemma answer.') deps.toast('error', String(failed.message ?? failed.code));
    return events;
  }

  return { onRequested, choose, busy: () => running.size > 0 };
}
