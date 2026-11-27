import { plainDraft } from '../content/draft';
import { isLiving } from '../engine/economy';
import { practiceLive } from '../engine/practice/gate';
import { holderQuarters } from '../engine/practice/held';
import { cardOf, practiceKindOf, requestOf } from '../engine/practice/issue';
import { PRACTICE_EVENT_TYPES, PRACTICE_KINDS, type PracticeRequest, type ValidOutput } from '../engine/practice/state';
import { sanitizePostureName, type PostureNameFlavorInput } from '../llm/calls/flavor';
import { buildPracticeInput, CARD_MAX, validatePracticeOutput, type PracticeGenerateInput } from '../engine/practice/validate';
import type { CampaignState, Unit } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import type { PracticeDeps } from './deps';
import { applyIssuedDirectives, clearPracticeDirectives, refreshPracticeDirectives } from './directives';
import { ensureAsked as ensureAskedClient } from './askHer';

export type { PracticeDeps } from './deps';

/** The site of her name for a posture (`flavor.posture_name`, declared in `src/llm/sites.ts`; the key is `<holder>|<posture>`). */
const POSTURE_SITE = 'flavor.posture_name';

/** The site of a kind of practice (`practice.<kind>`, declared in `src/llm/sites.ts`; the key is the request id). */
export const siteOf = (kind: string): string => `practice.${kind}`;

export interface PracticeController {
  /** The events of a settled dispatch: a new request is worded, a new task is delivered (a DM, or a directive while she is in the scene), and the directives follow the practices. */
  onEvents(events: Array<{ type: string; [k: string]: unknown }>): void;
  /** A scene opened: the directives of the holders in the room are set. */
  onSceneOpened(): void;
  /** The scene closed, or the chat changed: every directive of the practices goes. */
  onSceneClosed(): void;
  /** A chat was loaded (a switch, a reload, a new campaign): every directive goes with her verdict, and what was asked for and delivered is forgotten (ids repeat across campaigns). */
  onChatChanged(): void;
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
  /**
   * ACCEPT, NEGOTIATE or REFUSE on her discipline (`practice/answer_punishment`). NEGOTIATE also opens a one-to-one scene with her (her quarters) unless she is in the open scene already.
   * Toasts the reason and answers false when the engine refuses.
   */
  answerPunishment(punishmentId: string, answer: 'accept' | 'negotiate' | 'refuse'): Promise<boolean>;
  /**
   * DO IT, TAKE IT INSTEAD or REFUSE on her order to punish a soldier (`practice/take_instead`). Toasts the reason and answers false when the engine refuses. DO IT on a measure the squad votes on
   * answers false at once and goes through the squad vote (`requestVote`); the order closes when the vote carries it.
   */
  takeInstead(punishmentId: string, answer: 'do_it' | 'take_it' | 'refuse'): boolean;
  /**
   * GO or REFUSE on her demonstration card (`practice/answer_demonstration`). GO opens the group scene the engine describes (her and the units on the card, at the stage, costing the slot); a scene
   * that would not open is toasted and the card stays to be pressed again. Toasts the reason and answers false when the engine refuses.
   */
  answerDemonstration(demonstrationId: string, answer: 'go' | 'refuse'): Promise<boolean>;
  /** UNDO of an answer to her discipline (`practice/undo`). Toasts the reason and answers false when the engine refuses. */
  undoPunishment(punishmentId: string): boolean;
  /** `[ ASK TO BE LET GO ]` while the commander is held (`practice/ask_release`). Toasts the reason and answers false when the engine refuses. */
  askRelease(): boolean;
  /**
   * ACCEPT, ARGUE or DEFY on her `keep` (`practice/answer_alarm`). ARGUE opens the one-exchange scene the engine describes (her quarters, no slot); DEFY, for a launch, goes on with the launch
   * that was refused. Toasts the reason and answers false when the engine refuses.
   */
  answerAlarm(alarmId: string, answer: 'accept' | 'argue' | 'defy'): Promise<boolean>;
  /** `[ SEND THE SQUAD ]` on a kept alarm of a launch or a deadline: opens the expedition setup for that mission without the commander. Answers false when nothing can be opened. */
  sendSquad(alarmId: string): boolean;
  /** A chip step of her ceremony, or the number of a number step (`practice/ceremony_step`). Toasts the reason and answers false when the engine refuses. */
  ceremonyStep(punishmentId: string, step: string, number?: number): boolean;
  /** The commander's answer to the slap that is open (`practice/slap_answer`): none, braced or flinched. An answer for a slap that is gone is dropped without a word. */
  slapAnswer(slapId: string, result: 'none' | 'braced' | 'flinched'): boolean;
  /** `[ ASK HER ]` on a dilemma, a vote or an expedition event that is open (`practice/ask_her`): her pick comes back and is marked on the card. Toasts the reason and answers false when the engine refuses. */
  askHer(context: 'dilemma' | 'expedition' | 'vote', ref: string): boolean;
  /** A card she pre-selects is asked the moment the commander chooses on it (silent): her pick is written so that choosing against it can be charged. */
  ensureAsked(context: 'dilemma' | 'expedition' | 'vote', ref: string): void;
  /** `[ GIVE HER … ]` sent from the composer (`practice/hand_over`): the card the commander says yes to appears. Toasts the reason and answers false when the engine refuses. */
  handOver(holderId: string, kind: string, days: number): boolean;
  /** `[ TAKE BACK … ]` (`practice/take_back`): a refusal at severe. Toasts the reason and answers false when the engine refuses. */
  takeBack(handoverId: string): boolean;
  /** `[ ASK FOR A TASK ]` / `[ ASK FOR PUNISHMENT ]` (`practice/ask`). Toasts the reason and answers false when the engine refuses. */
  ask(unitId: string, what: 'task' | 'punishment'): boolean;
  /** `[ I DIDN'T ]` on her routine (`practice/confess`). Toasts the reason and answers false when the engine refuses. */
  confess(taskId: string): boolean;
  /** `[ ASK PERMISSION ]` (`practice/ask_permission`). Toasts the reason and answers false when the engine refuses. */
  askPermission(holderId: string): boolean;
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
        if (s.practices?.requests.some((r) => r.id === key) === true) return null; // still waiting for its words
        const card = cardOf(s, key); // a reroll is allowed while the card is `offered`, whatever the list it is in
        if (card === undefined) return 'That practice is gone.';
        return card.status === 'offered' ? null : 'It was answered.';
      },
    });
  }

  // the `flavor.posture_name` site: the posture's label already stands, so a failure leaves it; the engine reads the name again (`cleanPostureName`) like any other
  const postureKey = (holderId: string, postureId: string): string => `${holderId}|${postureId}`;
  deps.generations.bind<PostureNameFlavorInput, string>(POSTURE_SITE, {
    build(key) {
      const [holderId, postureId] = key.split('|');
      const s = state();
      const unit = s?.squad.find((u) => u.id === holderId);
      const reg = deps.registries();
      const preset = reg.servicePostures.get(postureId); // P16b: a preset is named by its label and the base it stands on; an old name on a base by the base's own
      const entry = preset ?? reg.blockingPostures.get(postureId);
      if (s === null || unit === undefined || entry === undefined || s.practices?.postures[holderId]?.some((p) => p.postureId === postureId) !== true) return { expired: 'That posture is gone.' };
      const base = preset !== undefined ? String(reg.blockingPostures.get(String(preset.base))?.label ?? preset.base).toLowerCase() : undefined;
      return { kind: 'posture_name', name: unit.displayName, posture: String(entry.label), hint: String(entry.promptHint ?? ''), ...(base !== undefined ? { base } : {}) };
    },
    parse: (raw) => sanitizePostureName(raw),
    apply(key, name) {
      const [holderId, postureId] = key.split('|');
      const err = deps.app.dispatch({ type: 'practice/name_posture', payload: { holderId, postureId, name } }, { expectChatId: chatId() }).find((e) => e.type === 'error');
      if (err === undefined) return 'ok';
      return STALE_CODES.includes(String(err.code)) || /not one of hers|not holding/.test(String(err.message)) ? { stale: true as const } : { rejected: String(err.message ?? 'The name was refused.') };
    },
    fallback(key) {
      const [holderId, postureId] = key.split('|');
      return !deps.app.dispatch({ type: 'practice/name_posture', payload: { holderId, postureId } }, { expectChatId: chatId() }).some((e) => e.type === 'error');
    },
  });

  /** A posture was just named with no name: she is asked for hers (nothing with plain wording: the label stands). */
  function askPostureName(holderId: string, postureId: string): void {
    if (deps.settings().practiceWording === 'plain') return;
    void deps.generations.generate(POSTURE_SITE, postureKey(holderId, postureId)).catch(() => {});
  }

  /** The kind of a request, or of the card written for it, for the site's name. */
  const kindOf = (requestId: string): string | undefined => {
    const s = state();
    return s === null ? undefined : practiceKindOf(s, requestId);
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

  /** Delivers a demonstration she wants to stage: a DM from her with her words, unless she is in the open scene, her DMs are off or she is giving the cold shoulder (the card shows all the same). */
  function deliverDemonstration(id: string): void {
    const s = state();
    const d = s?.practices?.demonstrations.find((x) => x.id === id);
    if (s === null || d === undefined || d.status !== 'offered') return;
    const key = `${chatId() ?? ''}|${id}`;
    if (delivered.has(key) || s.scene?.participants.includes(d.holderId) === true || s.settings.unitDms !== true || (s.practices?.cold[d.holderId] ?? -1) >= s.day) return;
    delivered.add(key);
    deps.app.dispatch({ type: 'dm/receive', payload: { unitId: d.holderId, text: plainDraft(d.text), initiated: true } }, { expectChatId: chatId() });
  }

  /** Delivers her discipline (or her order about a soldier): a DM from her, unless she is in the open scene, her DMs are off or she is giving the cold shoulder. */
  function deliverPunishment(punishmentId: string): void {
    const s = state();
    const p = s?.practices?.punishments.find((x) => x.id === punishmentId);
    if (s === null || p === undefined || p.status !== 'offered') return;
    const key = `${chatId() ?? ''}|${punishmentId}`;
    if (delivered.has(key) || s.scene?.participants.includes(p.holderId) === true || s.settings.unitDms !== true || (s.practices?.cold[p.holderId] ?? -1) >= s.day) return;
    delivered.add(key);
    deps.app.dispatch({ type: 'dm/receive', payload: { unitId: p.holderId, text: plainDraft(p.sealed === true ? TUNING.practice.sealedLine : p.text), initiated: true } }, { expectChatId: chatId() });
  }

  /** Her kindness (a slot given back, a relaxed protocol, relief, a gift, a softer next punishment) is told in a short DM from her: nothing in a scene (a day end has none), her DMs off or her cold shoulder. */
  function deliverKindness(holderId: string, kind: string): void {
    const s = state();
    const line = (TUNING.practice.kindness.lines as Record<string, string | undefined>)[kind];
    if (s === null || line === undefined || s.scene?.participants.includes(holderId) === true || s.settings.unitDms !== true || (s.practices?.cold[holderId] ?? -1) >= s.day) return;
    deps.app.dispatch({ type: 'dm/receive', payload: { unitId: holderId, text: plainDraft(line), initiated: true } }, { expectChatId: chatId() });
  }

  /** The error of a dispatch, toasted; whether there was none. */
  function ok(events: Array<{ type: string; [k: string]: unknown }>): boolean {
    const bad = events.find((e) => e.type === 'error');
    if (bad) deps.toast('error', String(bad.message ?? bad.code));
    return bad === undefined;
  }

  return {
    onEvents(events) {
      let refresh = false;
      for (const e of events) {
        if (OWN.includes(e.type)) refresh = true;
        if (e.type === 'task_issued' && e.rerolled !== true && e.handover !== true && typeof e.taskId === 'string') { if (e.kind === 'demonstration') deliverDemonstration(e.taskId); else deliver(e.taskId); }
        if (e.type === 'punishment_issued' && e.rerolled !== true && typeof e.punishmentId === 'string') deliverPunishment(e.punishmentId);
        if (e.type === 'posture_named' && e.name === undefined && typeof e.holderId === 'string' && typeof e.postureId === 'string') askPostureName(e.holderId, e.postureId);
        if (e.type === 'favour_kindness' && typeof e.holderId === 'string' && typeof e.kind === 'string') deliverKindness(e.holderId, e.kind);
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
      clearPracticeDirectives(deps.context, { keepVerdict: true });
      deps.refreshContext();
    },
    onChatChanged() {
      tried.clear();
      delivered.clear();
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
      const at = holderQuarters(deps.registries());
      if (answer === 'talk' && deps.startScene !== undefined && at !== null && s.scene?.participants.includes(task.holderId) !== true) await deps.startScene({ locationId: at, participants: [task.holderId], origin: 'event', consumesSlot: false });
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
    async answerPunishment(punishmentId, answer) {
      const s = state();
      const p = s?.practices?.punishments.find((x) => x.id === punishmentId);
      if (s === null || p === undefined) return false;
      if (!ok(deps.app.dispatch({ type: 'practice/answer_punishment', payload: { punishmentId, answer } }, { expectChatId: chatId() }))) return false;
      const at = holderQuarters(deps.registries());
      if (answer === 'negotiate' && deps.startScene !== undefined && at !== null && s.scene?.participants.includes(p.holderId) !== true) await deps.startScene({ locationId: at, participants: [p.holderId], origin: 'event', consumesSlot: false });
      deps.refreshContext();
      return true;
    },
    async answerDemonstration(demonstrationId, answer) {
      const d = state()?.practices?.demonstrations.find((x) => x.id === demonstrationId);
      if (d === undefined) return false;
      const events = deps.app.dispatch({ type: 'practice/answer_demonstration', payload: { demonstrationId, answer } }, { expectChatId: chatId() });
      if (!ok(events)) return false;
      const scene = answer === 'go' ? (events.find((e) => e.type === 'task_answered' && e.answer === 'go')?.scene as { locationId: string; participants: string[]; origin: 'event'; consumesSlot?: boolean } | undefined) : undefined;
      if (scene !== undefined && deps.startScene !== undefined && !(await deps.startScene(scene))) {
        deps.toast('error', 'The scene did not open.');
        deps.refreshContext();
        return false;
      }
      deps.refreshContext();
      return true;
    },
    takeInstead(punishmentId, answer) {
      const action = { type: 'practice/take_instead', payload: { punishmentId, answer } };
      const events = deps.app.dispatch(action, { expectChatId: chatId() });
      // P9b: DO IT imposes a measure the squad may vote on: the vote runs first, and the order is closed by the dispatch that carries it
      if (events.some((e) => e.type === 'error' && e.code === 'vote_needed') && deps.requestVote !== undefined) {
        void deps.requestVote(action).then((r) => { if (r === 'ran') deps.refreshContext(); });
        return false;
      }
      const done = ok(events);
      if (done) deps.refreshContext();
      return done;
    },
    undoPunishment(punishmentId) {
      const done = ok(deps.app.dispatch({ type: 'practice/undo', payload: { punishmentId } }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    askRelease() {
      const done = ok(deps.app.dispatch({ type: 'practice/ask_release', payload: {} }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    async answerAlarm(alarmId, answer) {
      const alarm = state()?.practices?.alarm;
      if (alarm === undefined || alarm.id !== alarmId) return false;
      const events = deps.app.dispatch({ type: 'practice/answer_alarm', payload: { alarmId, answer } }, { expectChatId: chatId() });
      if (!ok(events)) return false;
      const scene = answer === 'argue' ? (events.find((e) => e.type === 'hold_alarm' && e.phase === 'argue')?.scene as { locationId: string; participants: string[]; origin: 'event'; consumesSlot?: boolean } | undefined) : undefined;
      if (scene !== undefined && deps.startScene !== undefined && !(await deps.startScene(scene))) deps.toast('error', 'The scene did not open.');
      if (answer === 'defy' && alarm.kind === 'launch') ok(deps.app.dispatch({ type: 'expedition/start', payload: alarm.payload }, { expectChatId: chatId() })); // the launch that was refused goes on
      deps.refreshContext();
      return true;
    },
    sendSquad(alarmId) {
      const alarm = state()?.practices?.alarm;
      const p = alarm?.payload as { missionId?: unknown; poi?: unknown } | undefined;
      const target = typeof p?.missionId === 'string' ? { missionId: p.missionId } : p?.poi !== undefined ? { poi: p.poi as { regionId: string; poiId: string } } : undefined;
      if (alarm === undefined || alarm.id !== alarmId || target === undefined || deps.openPlanner === undefined) {
        deps.toast('error', 'The squad cannot be sent from here.');
        return false;
      }
      deps.openPlanner(target);
      return true;
    },
    ceremonyStep(punishmentId, step, number) {
      const done = ok(deps.app.dispatch({ type: 'practice/ceremony_step', payload: { punishmentId, step, ...(number !== undefined ? { number } : {}) } }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    slapAnswer(slapId, result) {
      const events = deps.app.dispatch({ type: 'practice/slap_answer', payload: { slapId, result } }, { expectChatId: chatId() });
      const bad = events.find((e) => e.type === 'error');
      if (bad !== undefined && /no slap|is gone|chat_changed/.test(`${String(bad.message)} ${String(bad.code)}`)) return false; // the moment passed: nobody is told
      if (bad !== undefined) { deps.toast('error', String(bad.message ?? bad.code)); return false; }
      deps.refreshContext();
      return true;
    },
    ensureAsked(context, ref) {
      ensureAskedClient(deps.app.dispatch, state(), deps.registries(), context, ref, chatId());
    },
    askHer(context, ref) {
      const done = ok(deps.app.dispatch({ type: 'practice/ask_her', payload: { context, ref } }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    handOver(holderId, kind, days) {
      const done = ok(deps.app.dispatch({ type: 'practice/hand_over', payload: { holderId, kind, days } }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    takeBack(handoverId) {
      const done = ok(deps.app.dispatch({ type: 'practice/take_back', payload: { handoverId } }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    ask(unitId, what) {
      const done = ok(deps.app.dispatch({ type: 'practice/ask', payload: { unitId, what } }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    confess(taskId) {
      const done = ok(deps.app.dispatch({ type: 'practice/confess', payload: { taskId } }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    askPermission(holderId) {
      const done = ok(deps.app.dispatch({ type: 'practice/ask_permission', payload: { holderId } }, { expectChatId: chatId() }));
      if (done) deps.refreshContext();
      return done;
    },
    async idle() { while (flight) await flight.catch(() => {}); },
  };
}
