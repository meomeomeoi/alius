import type { RoutePick } from '../engine/commander/checks';
import type { Action, EngineEvent } from '../engine/dispatch';
import { buildDilemmaDigest } from '../engine/dilemma/flow';
import type { DilemmaGenerateInput } from '../llm/calls/dilemmaGenerate';
import type { WorldDeps } from '../world/deps';

export interface DilemmaController {
  /** Answers the open dilemma request, if any. Safe to call often: one run per request id. */
  onRequested(): Promise<void>;
  /** The player's pick of a presented dilemma. Returns the engine's events (empty when nothing is waiting). */
  choose(index: number, route?: RoutePick): EngineEvent[];
  busy(): boolean;
}

/**
 * The non-engine half of the two-phase dilemma: the engine opens a request in state, this layer asks the mechanic model
 * (up to two answers) and presents what the engine accepts; the setting off, no profile or a failed call mean the
 * template's authored block.
 */
export function createDilemmas(deps: WorldDeps & {
  /** P9b: runs a decision the squad votes on (the app's `power.requestVote`). Without it a gated answer is refused like any other. */
  requestVote?: (action: Action) => Promise<'ran' | 'dropped' | 'cancelled'>;
  /** P13: the warden's optional judge (the app's `warden`): an overridable action waits for it when the setting is on. */
  judge?: { needsJudge(action: Action): boolean; judgeThen(action: Action): Promise<EngineEvent[]> };
}): DilemmaController {
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

  /** Requests the controller is writing right now: an answer to one of these is dropped if the card was shown meanwhile (by the engine's own block). */
  const writing = new Set<string>();
  const requestOf = (id: string) => {
    const open = deps.app.current().state?.dilemmas?.open;
    return open && open.id === id ? open : undefined;
  };

  // the `dilemma.generate` site (key: the dilemma id): the model writes the decision while it is `requested` (`dilemma/present`), or words it
  // again while it is on the card and unanswered (`dilemma/reword`: RETRY of the authored block, REROLL). A failure shows the authored block
  deps.generations.bind<DilemmaGenerateInput, unknown>('dilemma.generate', {
    build(id) {
      const state = deps.app.current().state;
      const open = state ? requestOf(id) : undefined;
      if (!state || !open) return { expired: 'The decision was made.' };
      if (open.context === 'scapegoat') return { expired: 'This decision is never worded by a model.' }; // authored and presented at once
      if (writing.has(id) && open.status !== 'requested') return { expired: 'The decision was shown meanwhile.' };
      const reg = deps.registries();
      const template = reg.dilemmaTemplates.get(open.templateId);
      if (!template) return { expired: 'That decision has no template any more.' };
      return {
        template: {
          id: open.templateId, scale: open.scale, brief: String((template.generate as { brief?: string } | undefined)?.brief ?? ''),
          optionCount: (template.optionCount as number | undefined) ?? 3,
          flagPerOption: (template.constraints as { flagPerOption?: boolean } | undefined)?.flagPerOption === true,
        },
        digest: buildDilemmaDigest(state, reg, open),
      };
    },
    apply(id, output) {
      const open = requestOf(id);
      if (!open) return { stale: true };
      const events = answer(open.status === 'requested'
        ? { type: 'dilemma/present', payload: { requestId: id, output } }
        : { type: 'dilemma/reword', payload: { id, output } }, chatId());
      if (events.some((e) => e.type === 'error')) return { stale: true };
      const rejected = events.find((e) => e.type === 'dilemma_rejected');
      if (!rejected) return 'ok';
      const why = (rejected.rejections as Array<{ reason: string }>).map((r) => r.reason).join('; ');
      // the engine asks for one more try only on a first rejection of a request; otherwise it has shown its own block or kept the old one
      return rejected.retry === true ? { rejected: why } : { rejected: why, final: true };
    },
    // the card must show: the authored block now (the request is waiting); one that is on the card already (the engine gave up) stands
    fallback(id) {
      const open = requestOf(id);
      if (!open) return false;
      if (open.status === 'requested') return !answer({ type: 'dilemma/fallback', payload: { requestId: id } }, chatId()).some((e) => e.type === 'error');
      return open.source !== 'model';
    },
    committed(id) {
      const open = requestOf(id);
      if (!open) return 'It was answered.';
      return open.status === 'presented' ? null : 'It is still being written.';
    },
  });

  async function onRequested(): Promise<void> {
    const first = deps.app.current().state?.dilemmas?.open;
    const chat = chatId();
    // request ids repeat from campaign to campaign: the chat is part of the key
    const key = `${chat ?? ''}:${first?.id ?? ''}`;
    // a scapegoat case is authored and presented at once: the model is never asked
    if (!first || first.status !== 'requested' || first.context === 'scapegoat' || running.has(key)) return;
    running.add(key);
    writing.add(first.id);
    try {
      const fallback = (id: string): void => void answer({ type: 'dilemma/fallback', payload: { requestId: id } }, chat);
      if (!deps.settings().dilemmasEnabled) return fallback(first.id);
      const out = await deps.generations.generate('dilemma.generate', first.id);
      // the engine resolves a template that vanished from the content
      if (out.kind === 'expired' && chatId() === chat && requestOf(first.id)?.status === 'requested') fallback(first.id);
    } finally {
      running.delete(key);
      writing.delete(first.id);
    }
  }

  function choose(index: number, route?: RoutePick): EngineEvent[] {
    const open = deps.app.current().state?.dilemmas?.open;
    if (!open || open.status !== 'presented') return [];
    const action = { type: 'dilemma/choose', payload: { id: open.id, index, ...(route ? { route } : {}) } };
    if (deps.judge?.needsJudge(action)) {
      void deps.judge.judgeThen(action); // P13: the warden's judge reads the choice first (a short model call)
      return [];
    }
    const events = deps.app.dispatch(action);
    const failed = events.find((e) => e.type === 'error');
    if (failed?.code === 'vote_needed' && deps.requestVote) {
      void deps.requestVote(action); // P9b: the squad votes on who answers for it first
      return [];
    }
    if (failed && failed.message !== 'Stale dilemma answer.') deps.toast('error', String(failed.message ?? failed.code));
    return events;
  }

  return { onRequested, choose, busy: () => running.size > 0 };
}
