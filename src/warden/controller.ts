import type { Action, EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import { EXPECTATION_KINDS, argueAvailable, describeOrder, normalizeAgenda, orderOfAction, overrideOpen, wardenOf } from '../engine/warden';
import { readJudgement, type WardenJudged, type WardenJudgeInput } from '../llm/calls/wardenJudge';
import { worldDossier } from '../engine/memory/inputs';
import { fallbackEpilogue, sanitizeEpilogue, type EpilogueInput } from '../llm/calls/epilogue';
import type { WardenAgendaInput } from '../llm/calls/wardenAgenda';
import { isLeashswap } from '../engine/warden';
import { readDayStart, writeDayStart } from '../st/persistence';
import { whereabouts } from '../engine/hub';
import { sceneLocation } from '../onboarding/controller';
import { WARDEN_DERIVED, wardenDirectives } from './directives';
import type { WardenDeps } from './deps';
import { valuesOf } from '../engine/development/profile';

export type { WardenDeps } from './deps';

export interface WardenController {
  /** Reads the events of one dispatch: a new warden is asked for her agenda; the reveal directive follows the state. */
  onEvents(events: EngineEvent[]): void;
  /**
   * After a (re)load or a deployment (a built campaign has no event stream): writes the day-start snapshot if there is none for this
   * chat, asks for the agenda once if she still has the fallback and writes a closed campaign's epilogue if it has none.
   */
  onLoaded(): void;
  /** [ARGUE] outside combat: opens the private scene with her alone; resolves whether it opened. The override then waits for a compromise or the scene's end. */
  argue(): Promise<boolean>;
  /** The commander's answer to the warden's open override (the chip's buttons). ARGUE outside combat opens the scene; the rest is `warden/answer`. Toasts a refusal. */
  answer(answer: 'comply' | 'argue' | 'defy'): Promise<boolean>;
  /** Would the judge be asked about this action? Only with the setting on, a personal expectation of hers, and an out-of-combat overridable action. */
  needsJudge(action: Action): boolean;
  /** P14: REROLL of the epilogue (the END screen, `warden.epilogue`, free) and the second try at her agenda while it is still the fallback (`warden.agenda`). */
  rerollEpilogue(): Promise<void>;
  rerollAgenda(): Promise<void>;
  /**
   * Asks the judge (when `needsJudge`) which of her personal expectations the order touches, attaches the answer as `wardenJudged` and dispatches.
   * A failed call dispatches without it; a chat that changed meanwhile drops the action.
   */
  judgeThen(action: Action): Promise<EngineEvent[]>;
}

const CARD_MAX = 600;
/** The chronicle lines the epilogue is written from: the newest this many with `audience: '*'`. */
const EPILOGUE_LINES = 60;

/**
 * The model-facing half of the warden (P13): it proposes her agenda once and nothing else in chunk (a). The engine validates every
 * kind and sets every number; a failed, late or invalid answer leaves the fallback agenda that is already in the state, silently. An
 * answer for another chat is dropped.
 */
export function createWarden(deps: WardenDeps): WardenController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;
  /** Agenda requests already made, by chat and warden (a new warden of the same chat is asked afresh). */
  const asked = new Set<string>();

  function refreshDirectives(): void {
    const s = state();
    deps.context.clearMatching((d) => WARDEN_DERIVED.includes(d.id));
    if (s) for (const d of wardenDirectives(s, deps.registries())) deps.context.setDirective(d);
    deps.refreshContext();
  }

  const agendaKey = (w: { unitId: string; sinceDay: number }): string => `${w.unitId}:${w.sinceDay}`;
  const CLOSED = 'The campaign is closed.';

  /** The agenda request of a warden: her card, values and the corporation (rebuilt from the state, never stored). */
  function agendaInput(s: CampaignState, unitId: string): WardenAgendaInput | null {
    const unit = s.squad.find((u) => u.id === unitId);
    if (!unit) return null;
    const reg = deps.registries();
    const card = unit.cardRef === undefined ? null : deps.st.getCharacterCard(unit.cardRef);
    const corpId = s.commander.corporationId;
    const corp = corpId === null ? undefined : reg.corporations.get(corpId);
    return {
      name: unit.displayName,
      card: [card?.description, card?.personality].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' ').slice(0, CARD_MAX),
      values: { ...valuesOf(unit) },
      corporation: corp ? `${String(corp.name)}: ${String(corp.summary)}` : 'The corporation.',
      kinds: [...EXPECTATION_KINDS],
    };
  }

  // the `warden.agenda` site (key `<unitId>:<sinceDay>`): her expectations, asked once while the agenda is the fallback. A failure is a quiet
  // record and the fallback agenda stands; a second try is allowed until an override has fired or the agenda is set
  deps.generations.bind<WardenAgendaInput, unknown[]>('warden.agenda', {
    build(key) {
      const s = state();
      const w = s ? wardenOf(s) : null;
      if (!s || s.ended || !w || agendaKey(w) !== key || w.agenda !== 'fallback' || w.overrideFired === true) return { expired: 'Her agenda is no longer the fallback.' };
      return agendaInput(s, w.unitId) ?? { expired: 'She is not here.' };
    },
    parse: (raw) => normalizeAgenda((raw as { expectations?: unknown } | null)?.expectations, deps.registries()),
    apply(_key, list) {
      const events = deps.app.dispatch({ type: 'warden/agenda', payload: { expectations: list } }, { expectChatId: chatId() });
      return events.some((e) => e.type === 'error') ? { stale: true } : 'ok';
    },
    fallback: () => true, // the fallback agenda is already in the state
    committed(key) {
      const s = state();
      const w = s ? wardenOf(s) : null;
      return s && w && agendaKey(w) === key && w.agenda === 'fallback' && w.overrideFired !== true && !s.ended ? null : 'Her agenda is set.';
    },
  });

  async function ask(): Promise<void> {
    const s = state();
    const w = s ? wardenOf(s) : null;
    const expect = chatId();
    if (!s || s.ended || !w || w.agenda !== 'fallback' || w.overrideFired === true) return; // a closed campaign asks for nothing
    const key = `${expect ?? ''}:${w.unitId}:${w.sinceDay}`;
    if (asked.has(key)) return;
    asked.add(key);
    await deps.generations.generate('warden.agenda', agendaKey(w));
  }

  /** The state at the start of this day, with where the ST chat stood (written only in the mode). */
  function snapshot(): void {
    const s = state();
    const expect = chatId();
    if (!s || expect === undefined || !isLeashswap(s) || s.ended) return;
    writeDayStart(deps.st, { chatId: expect, day: s.day, chatLength: deps.st.chatLength(), state: structuredClone(s) });
  }

  /** The commander died under `rewind_day`: back to the start of the day, the scenes since hidden from the chat. No snapshot of this chat → the campaign ends. */
  async function rewind(cause: string): Promise<void> {
    const expect = chatId();
    const s = state();
    if (!s || expect === undefined) return;
    const snap = readDayStart(deps.st);
    const fallBack = (): void => {
      deps.app.dispatch({ type: 'warden/no_snapshot', payload: { cause } }, { expectChatId: expect });
    };
    // a missing or foreign snapshot (another chat's), or a state with no mode: nothing to rewind to
    if (!snap || snap.chatId !== expect || !isLeashswap(snap.state) || !deps.restore(structuredClone(snap.state), s)) return fallBack();
    const length = deps.st.chatLength();
    deps.toast('info', `REWIND — day ${snap.day} begins again.`);
    if (length - 1 < snap.chatLength) return; // the chat is no longer than it was: nothing to hide
    const runs = await deps.st.hideMessages(snap.chatLength, length - 1); // the chat is still this one: nothing awaited since the restore
    if (chatId() !== expect || runs.length === 0) return; // never write into another chat
    deps.app.dispatch({ type: 'memory/hidden', payload: { add: runs } }, { expectChatId: expect });
  }

  const epilogueInput = (s: CampaignState): EpilogueInput | null => {
    if (!s.ended) return null;
    const lines = s.memory.chronicle.filter((c) => c.audience === '*').slice(-EPILOGUE_LINES).map((c) => c.text);
    return { cause: s.ended.cause, day: s.ended.day, lines, dossier: worldDossier(s) };
  };

  // the `warden.epilogue` site (key `epilogue`): the closed campaign's epilogue, written by the model or (fallback) the public lines under a
  // heading, with a record; RETRY or REROLL write a new one over it
  deps.generations.bind<EpilogueInput, string>('warden.epilogue', {
    build() {
      const s = state();
      const input = s ? epilogueInput(s) : null;
      return input ?? { expired: 'The campaign is open again.' };
    },
    parse: (raw) => sanitizeEpilogue(String(raw)),
    apply(_key, text) {
      const written = state()?.ended?.epilogue !== undefined;
      const events = deps.app.dispatch({ type: 'campaign/epilogue', payload: { text, ...(written ? { replace: true } : {}) } }, { expectChatId: chatId() });
      return events.some((e) => e.type === 'error') ? { stale: true } : 'ok';
    },
    fallback(_key, input) {
      if (!input || state()?.ended?.epilogue !== undefined) return false;
      const events = deps.app.dispatch({ type: 'campaign/epilogue', payload: { text: fallbackEpilogue(input) } }, { expectChatId: chatId() });
      return !events.some((e) => e.type === 'error');
    },
    committed: () => (state()?.ended ? null : 'The campaign is open again.'),
  });

  /** The epilogue of a closed campaign: the model's, or the public lines under a heading. Once per chat. */
  async function epilogue(): Promise<void> {
    const s = state();
    const expect = chatId();
    if (!s?.ended || s.ended.epilogue !== undefined) return;
    const key = `${expect ?? ''}:epilogue`;
    if (asked.has(key)) return;
    asked.add(key);
    await deps.generations.generate('warden.epilogue', 'epilogue');
  }

  /** The scene of the argument: her room's location when it is open this slot, else the first location that is. */
  async function argue(): Promise<boolean> {
    const s = state();
    const expect = chatId();
    const w = s ? wardenOf(s) : null;
    if (!s || !w || !argueAvailable(s)) return false;
    const reg = deps.registries();
    const room = whereabouts(s, reg).find((x) => x.unitId === w.unitId)?.roomId;
    const locationId = sceneLocation(s, reg, { locationId: room ? String(reg.hubRooms.get(room)?.sceneLocationId ?? '') : undefined });
    if (!(await deps.startScene({ locationId, participants: [w.unitId], origin: 'event', consumesSlot: false })) || chatId() !== expect) return false;
    const sceneId = state()?.scene?.id;
    if (sceneId === undefined) return false;
    const events = deps.app.dispatch({ type: 'warden/argue_started', payload: { sceneId } }, { expectChatId: expect });
    const failed = events.find((e) => e.type === 'error');
    if (failed && failed.code !== 'chat_changed') deps.toast('error', String(failed.message ?? failed.code));
    refreshDirectives();
    return failed === undefined;
  }

  const personalOf = (s: CampaignState) => wardenOf(s)?.expectations.filter((x) => x.kind === 'personal' && x.text !== undefined) ?? [];

  function needsJudge(action: Action): boolean {
    const s = state();
    return s !== null && deps.settings().wardenJudge === true && orderOfAction(action) !== null && personalOf(s).length > 0 && s.combat === undefined;
  }

  /** The orders being judged, by action type (the site's key): `build` rebuilds the input from the order and the state. */
  const judging = new Map<string, Action>();

  // the `warden.judge` site (key: the action's type): which of her personal expectations an order touches; a failure dispatches without it (no record)
  deps.generations.bind<WardenJudgeInput, WardenJudged>('warden.judge', {
    build(actionType) {
      const s = state();
      const action = judging.get(actionType);
      const order = action ? orderOfAction(action) : null;
      if (!s || !action || !order || !needsJudge(action)) return { expired: 'There is nothing to judge.' };
      return { order: describeOrder(s, deps.registries(), order), expectations: personalOf(s).map((x) => ({ id: x.id, text: x.text! })) };
    },
    parse: (raw, input) => readJudgement(raw as WardenJudged, input),
    apply: () => 'ok', // the judgement is the outcome's value
  });

  async function judgeThen(action: Action): Promise<EngineEvent[]> {
    const expect = chatId();
    const send = (a: Action): EngineEvent[] => (deps.act ? deps.act(a) : deps.app.dispatch(a, { expectChatId: expect }));
    const s = state();
    const order = orderOfAction(action);
    if (!s || !order || !needsJudge(action)) return send(action);
    judging.set(action.type, action);
    let judged: WardenJudged | null = null;
    let out: Awaited<ReturnType<typeof deps.generations.generate<WardenJudged>>>;
    try {
      out = await deps.generations.generate<WardenJudged>('warden.judge', action.type);
    } finally {
      judging.delete(action.type);
    }
    if (out.kind === 'applied') judged = out.value;
    if (chatId() !== expect) return [];
    const payload = typeof action.payload === 'object' && action.payload !== null ? action.payload : {};
    return send(judged !== null && judged.conflict !== 'none' ? { ...action, payload: { ...payload, wardenJudged: judged } } : action);
  }

  async function answer(a: 'comply' | 'argue' | 'defy'): Promise<boolean> {
    const s = state();
    const expect = chatId();
    const ov = s ? overrideOpen(s) : null;
    if (!s || !ov) return false;
    if (a === 'argue' && ov.context !== 'combat') return argue();
    const events = deps.app.dispatch({ type: 'warden/answer', payload: { overrideId: ov.id, answer: a } }, { expectChatId: expect });
    const failed = events.find((e) => e.type === 'error');
    if (failed && failed.code !== 'chat_changed') deps.toast('error', String(failed.message ?? failed.code));
    refreshDirectives();
    return failed === undefined;
  }

  return {
    argue, answer, needsJudge, judgeThen,
    rerollEpilogue: async () => { await deps.generations.reroll('warden.epilogue', 'epilogue'); },
    rerollAgenda: async () => {
      const w = state() ? wardenOf(state()!) : null;
      if (w) await deps.generations.reroll('warden.agenda', agendaKey(w));
    },
    onEvents(events) {
      if (events.some((e) => e.type === 'warden_assigned')) void ask().catch(() => {});
      if (events.some((e) => e.type === 'day_started')) snapshot();
      const dead = events.find((e) => e.type === 'commander_died' && e.rule === 'rewind_day');
      if (dead) void rewind(String(dead.cause)).catch(() => {});
      if (events.some((e) => e.type === 'campaign_ended')) void epilogue().catch(() => {});
      if (events.some((e) => e.type.startsWith('warden_') || e.type.startsWith('override_') || e.type.startsWith('scene_') || e.type.startsWith('onboarding_step_') || e.type === 'onboarding_done')) refreshDirectives();
    },
    onLoaded() {
      const s = state();
      if (s?.ended) void epilogue().catch(() => {});
      else if (s && isLeashswap(s)) {
        const snap = readDayStart(deps.st);
        if (!snap || snap.chatId !== chatId()) snapshot(); // right after buildCampaign: the first day's start
      }
      void ask().catch(() => {});
      refreshDirectives();
    },
  };
}
