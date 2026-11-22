import { isLiving } from '../engine/economy';
import { practiceLive } from '../engine/practice/gate';
import { requestOf } from '../engine/practice/issue';
import { PRACTICE_KINDS, type PracticeRequest, type ValidOutput } from '../engine/practice/state';
import { buildPracticeInput, CARD_MAX, validatePracticeOutput, type PracticeGenerateInput } from '../engine/practice/validate';
import type { CampaignState, Unit } from '../engine/state/types';
import type { PracticeDeps } from './deps';

export type { PracticeDeps } from './deps';

/** The site of a kind of practice (`practice.<kind>`, declared in `src/llm/sites.ts`; the key is the request id). */
export const siteOf = (kind: string): string => `practice.${kind}`;

export interface PracticeController {
  /** Waits for the call in flight (tests). */
  idle(): Promise<void>;
}

/** Error codes that mean the moment passed: the answer is dropped silently, the request stays and the day step falls back. */
const STALE_CODES: readonly string[] = ['chat_changed', 'combat_open', 'expedition_open', 'campaign_ended'];

/**
 * The model-facing half of the practices (P16): it words a request through the P14 envelope (`practice.<kind>` sites, key = the request id) and dispatches `practice/issue`
 * with the validated card, or with none (the fallback line). The state is the truth: the input is rebuilt from it every time, an answer for another chat is dropped and a
 * request that is gone says nothing. Every dispatch carries `expectChatId`. The engine reads the card again (`validatePracticeOutput`) and never reads its `text`.
 */
export function createPractice(deps: PracticeDeps): PracticeController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;
  let flight: Promise<void> | null = null as Promise<void> | null;

  /** The request (or the card it wrote, while it is still offered) and her, or why the moment has passed. */
  function waiting(s: CampaignState | null, key: string): { expired: string } | { expired?: undefined; request: PracticeRequest; unit: Unit } {
    const found = s === null ? undefined : requestOf(s, deps.registries(), key);
    const unit = s?.squad.find((u) => u.id === found?.request.holderId);
    if (s === null || found === undefined || unit === undefined || unit.kind !== 'named' || !isLiving(unit)) return { expired: 'That practice is gone.' };
    if (!practiceLive(s, deps.registries(), unit.id)) return { expired: 'She is not holding now.' };
    return { request: found.request, unit };
  }

  function inputOf(s: CampaignState | null, key: string): PracticeGenerateInput | { expired: string } {
    const w = waiting(s, key);
    if (w.expired !== undefined) return { expired: w.expired };
    const card = w.unit.cardRef === undefined ? null : deps.st.getCharacterCard(w.unit.cardRef);
    const digest = [card?.description, card?.personality].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' ').slice(0, CARD_MAX);
    return buildPracticeInput(s!, deps.registries(), w.request, digest);
  }

  /** The result of a dispatch as an envelope answer: the moment passed (drop it), or the engine said no. */
  function settle(events: Array<{ type: string; [k: string]: unknown }>) {
    const err = events.find((e) => e.type === 'error');
    if (err === undefined) return 'ok' as const;
    const message = String(err.message ?? 'The practice was refused.');
    if (STALE_CODES.includes(String(err.code)) || /is gone|not holding/.test(message)) return { stale: true as const };
    return { rejected: message, ...(/another kind/.test(message) ? { final: true as const } : {}) };
  }

  const issue = (key: string, output?: ValidOutput) => deps.app.dispatch({ type: 'practice/issue', payload: { requestId: key, ...(output !== undefined ? { output } : {}) } }, { expectChatId: chatId() });

  for (const kind of PRACTICE_KINDS) {
    deps.generations.bind<PracticeGenerateInput, ValidOutput>(siteOf(kind), {
      build: (key) => inputOf(state(), key),
      parse(raw, input) {
        const s = state();
        const found = s === null ? undefined : requestOf(s, deps.registries(), input.requestId);
        return s !== null && found !== undefined ? (validatePracticeOutput(s, deps.registries(), found.request, raw)?.output ?? null) : null;
      },
      apply: (key, value) => settle(issue(key, value)),
      fallback(key) {
        const s = state();
        if (s === null || requestOf(s, deps.registries(), key) === undefined) return false;
        return !issue(key).some((e) => e.type === 'error');
      },
      committed(key) {
        const s = state();
        if (s === null) return 'That practice is gone.';
        return requestOf(s, deps.registries(), key) !== undefined ? null : 'It was answered.';
      },
    });
  }

  return {
    async idle() { while (flight) await flight.catch(() => {}); },
  };
}
