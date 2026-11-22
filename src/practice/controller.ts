import { plainDraft } from '../content/draft';
import { isLiving } from '../engine/economy';
import { practiceLive } from '../engine/practice/gate';
import { requestOf } from '../engine/practice/issue';
import { PRACTICE_EVENT_TYPES, PRACTICE_KINDS, type PracticeRequest, type ValidOutput } from '../engine/practice/state';
import { buildPracticeInput, CARD_MAX, validatePracticeOutput, type PracticeGenerateInput } from '../engine/practice/validate';
import type { CampaignState, Unit } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import type { PracticeDeps } from './deps';
import { applyIssuedDirectives, clearPracticeDirectives, refreshPracticeDirectives } from './directives';

export type { PracticeDeps } from './deps';

/** The site of a kind of practice (`practice.<kind>`, declared in `src/llm/sites.ts`; the key is the request id). */
export const siteOf = (kind: string): string => `practice.${kind}`;

export interface PracticeController {
  /** The events of a settled dispatch: a new request is worded, a new task is delivered (a DM, or a directive while she is in the scene), and the directives follow the practices. */
  onEvents(events: Array<{ type: string; [k: string]: unknown }>): void;
  /** A scene opened: the directives of the holders in the room are set. */
  onSceneOpened(): void;
  /** The scene closed, or the chat changed: every directive of the practices goes. */
  onSceneClosed(): void;
  /** After a (re)load or a deployment: the requests that were waiting for words are worded now. */
  onLoaded(): void;
  /** REROLL of the words of a practice while the commander has not answered it (the key is the request id), and why it is not allowed. */
  reroll(requestId: string): Promise<void>;
  rerollState(requestId: string): { enabled: boolean; reason?: string };
  /**
   * ACCEPT, REFUSE or TALK on an offered task (`practice/answer_task`). TALK also opens a one-to-one scene with her (her quarters) unless she is in the open scene already. Toasts the
   * reason and answers false when the engine refuses ("Say it in your own words." for an accept that must be said).
   */
  answerTask(taskId: string, answer: 'accept' | 'refuse' | 'talk'): Promise<boolean>;
  /** The signature of a `signed` task whose words were said (`practice/sign`). Toasts the reason and answers false when the engine refuses. */
  sign(taskId: string): boolean;
  /** Waits for the call in flight (tests). */
  idle(): Promise<void>;
}

const OWN: readonly string[] = PRACTICE_EVENT_TYPES;
/** What ends a run or a fight: the requests that waited are worded now. */
const RESUME: readonly string[] = ['expedition_ended', 'combat_ended', 'expedition_abandoned', 'day_started'];

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

  /** The kind of a request, or of the card written for it, for the site's name. */
  const kindOf = (requestId: string): string | undefined => {
    const s = state();
    return s?.practices?.requests.find((r) => r.id === requestId)?.kind ?? s?.practices?.tasks.find((t) => t.requestId === requestId)?.kind;
  };

  /** Requests already asked for in this chat (a failure leaves the fallback in place; the day step is what falls back the rest). */
  const tried = new Set<string>();
  const triedKey = (id: string): string => `${chatId() ?? ''}|${id}`;
  let busy = false;

  /** Words the next waiting request (one call at a time), then the next. */
  async function run(): Promise<void> {
    const s = state();
    if (s === null || busy || s.combat || s.expedition || s.ended) return; // the engine refuses these while they are open
    const reg = deps.registries();
    const next = (s.practices?.requests ?? []).find((r) => !tried.has(triedKey(r.id)) && practiceLive(s, reg, r.holderId));
    if (next === undefined) return;
    tried.add(triedKey(next.id));
    busy = true;
    let stale = false;
    flight = (async () => {
      try {
        await Promise.resolve(); // never dispatch inside the dispatch that asked for this
        if (deps.settings().practiceWording === 'plain') issue(next.id); // no model call: the seed's own line
        else stale = (await deps.generations.generate(siteOf(next.kind), next.id)).kind === 'stale';
      } finally {
        busy = false;
      }
    })().finally(() => { flight = null; });
    await flight;
    if (!stale) return run(); // a chat switch ends the loop: the load of the other chat starts its own
  }

  /** Delivers a new task: a DM from her (or the sealed line), unless she is in the open scene (the card shows there, and the directive tells the model). */
  const delivered = new Set<string>();
  function deliver(taskId: string): void {
    const s = state();
    const task = s?.practices?.tasks.find((t) => t.id === taskId);
    if (s === null || task === undefined || task.status !== 'offered') return;
    const key = `${chatId() ?? ''}|${taskId}`;
    if (delivered.has(key) || s.scene?.participants.includes(task.holderId) === true || s.settings.unitDms !== true) return;
    if ((s.practices?.cold[task.holderId] ?? -1) >= s.day) return; // in her cold shoulder she writes nothing (the card is in her thread all the same)
    delivered.add(key);
    deps.app.dispatch({ type: 'dm/receive', payload: { unitId: task.holderId, text: plainDraft(task.sealed === true ? TUNING.practice.sealedLine : task.text), initiated: true } }, { expectChatId: chatId() });
  }

  return {
    onEvents(events) {
      let refresh = false;
      for (const e of events) {
        if (OWN.includes(e.type)) refresh = true;
        if (e.type === 'task_issued' && e.rerolled !== true && typeof e.taskId === 'string') deliver(e.taskId);
      }
      if (applyIssuedDirectives(deps.context, events, state(), deps.registries())) refresh = true;
      if (refresh) deps.refreshContext();
      if (events.some((e) => e.type === 'practice_requested' || RESUME.includes(e.type))) void run().catch(() => {});
    },
    onSceneOpened() {
      const s = state();
      if (s) refreshPracticeDirectives(deps.context, s, deps.registries());
      deps.refreshContext();
    },
    onSceneClosed() {
      clearPracticeDirectives(deps.context);
      deps.refreshContext();
    },
    onLoaded() {
      void run().catch(() => {});
    },
    async reroll(requestId) {
      const kind = kindOf(requestId);
      if (kind !== undefined) await deps.generations.reroll(siteOf(kind), requestId);
    },
    rerollState(requestId) {
      const kind = kindOf(requestId);
      return kind === undefined ? { enabled: false, reason: 'That practice is gone.' } : deps.generations.rerollState(siteOf(kind), requestId);
    },
    async answerTask(taskId, answer) {
      const s = state();
      const task = s?.practices?.tasks.find((t) => t.id === taskId);
      if (s === null || task === undefined) return false;
      const events = deps.app.dispatch({ type: 'practice/answer_task', payload: { taskId, answer } }, { expectChatId: chatId() });
      const bad = events.find((e) => e.type === 'error');
      if (bad) {
        deps.toast('error', String(bad.message ?? bad.code));
        return false;
      }
      if (answer === 'talk' && deps.startScene !== undefined && s.scene?.participants.includes(task.holderId) !== true) await deps.startScene({ locationId: 'quarters_unit', participants: [task.holderId], origin: 'event' });
      deps.refreshContext();
      return true;
    },
    sign(taskId) {
      const events = deps.app.dispatch({ type: 'practice/sign', payload: { taskId } }, { expectChatId: chatId() });
      const bad = events.find((e) => e.type === 'error');
      if (bad) {
        deps.toast('error', String(bad.message ?? bad.code));
        return false;
      }
      deps.refreshContext();
      return true;
    },
    async idle() { while (flight) await flight.catch(() => {}); },
  };
}
