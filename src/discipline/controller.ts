import type { EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import { commandStance, stanceEntry } from '../engine/discipline';
import { generateDemandFlavor } from '../llm/calls/flavor';
import { clearDisciplineDirectives, disciplineDirectives, reputationDirectives } from './context';
import type { DisciplineDeps } from './deps';
import { measureLabel, nicknameDirective, punishDirective, threatDirective } from './directives';
import { patienceDirective } from '../bonds/directives';

export type { DisciplineDeps } from './deps';

export interface DisciplineController {
  /** Reads the events of one dispatch: a threat becomes a directive, a lapse and (in debug mode) a sabotage a toast. */
  onEvents(events: EngineEvent[]): void;
  onSceneOpened(): void;
  onSceneClosed(): void;
  /** The menu path: imposes a measure (and the days of a brig) on a unit. Toasts and returns false when the engine refuses. */
  punish(unitId: string, measure: string, days?: number): boolean;
  /** After a slot change: rolls for demands, words each new one (when the setting is on and the model answers) and delivers it. */
  onSlotAdvanced(): Promise<void>;
  /** [GRANT] or [REFUSE]. Toasts the reason and returns false when the engine refuses. */
  answerDemand(demandId: string, answer: 'grant' | 'refuse'): boolean;
  /** [TALK]: opens a private scene with her (her quarters) while the demand stays open. */
  talkDemand(demandId: string): Promise<boolean>;
  /** UNDO — not what I meant: an application read from dialogue or a threat. Toasts and returns false when it cannot be undone. */
  undo(id: string): boolean;
}

/**
 * The discipline half of a scene (P9): the stance text of every present unit and what she makes of a threat, as hard
 * directives for the main model. The engine decides what is true; this layer only words it. Nothing here reaches the
 * mechanic model.
 */
export function createDiscipline(deps: DisciplineDeps): DisciplineController {
  const nameOf = (unitId: string): string => deps.app.current().state?.squad.find((u) => u.id === unitId)?.displayName ?? unitId;

  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;
  const syncDirectives = (): void => {
    const s = state();
    if (s?.scene) disciplineDirectives(deps.context, s, deps.registries());
    deps.refreshContext();
  };

  /** Words one undelivered demand (setting on, model answers) and delivers it; a chat that changed meanwhile drops it (the day end delivers it). */
  async function wordAndDeliver(demandId: string, expect: string | undefined): Promise<void> {
    const s = state();
    const demand = s?.discipline?.demands.find((d) => d.id === demandId);
    if (!s || !demand || demand.status !== 'undelivered') return;
    const reg = deps.registries();
    let text: string | undefined;
    if (deps.settings().demandWording) {
      const stance = commandStance(s, reg, demand.unitId);
      const unit = s.squad.find((u) => u.id === demand.unitId);
      try {
        text = (await generateDemandFlavor({
          kind: 'demand', unitName: unit?.displayName ?? demand.unitId, stateHint: String(reg.relationshipStates.get(s.relations[demand.unitId]?.stateId ?? '')?.promptHint ?? ''),
          stanceName: String((stance === null ? undefined : stanceEntry(reg, stance)?.name) ?? ''), demand: demand.text,
        }, { st: deps.st, settings: deps.settings(), contentLine: deps.contentLine })) ?? undefined;
      } catch {
        text = undefined; // a failed call never blocks the demand: the template text is used
      }
    }
    if (chatId() !== expect) return;
    const events = deps.app.dispatch({ type: 'demand/deliver', payload: { demandId, ...(text !== undefined ? { text } : {}) } }, { expectChatId: expect });
    if (events.some((e) => e.type === 'error')) return;
    syncDirectives();
  }

  async function onSlotAdvanced(): Promise<void> {
    const expect = chatId();
    const s = state();
    if (!s || s.expedition || s.combat || s.dilemmas?.open?.status === 'presented') return;
    const events = deps.app.dispatch({ type: 'demand/roll', payload: {} }, { expectChatId: expect });
    if (events.some((e) => e.type === 'error')) return;
    for (const e of events) if (e.type === 'demand_opened') await wordAndDeliver(String(e.demandId), expect);
  }

  function answerDemand(demandId: string, answer: 'grant' | 'refuse'): boolean {
    const asked = state()?.discipline?.demands.find((d) => d.id === demandId);
    const postponed = answer === 'refuse' && asked !== undefined && deps.registries().demandTemplates.get(asked.templateId)?.kind === 'desire';
    const events = deps.app.dispatch({ type: 'demand/answer', payload: { demandId, answer } }, { expectChatId: chatId() });
    const bad = events.find((e) => e.type === 'error');
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    // P9d: POSTPONE on her want: she knows she was asked to wait, for her next reply in the scene
    if (postponed && asked && state()?.scene?.participants.includes(asked.unitId)) deps.context.setDirective(patienceDirective(asked.unitId, nameOf(asked.unitId)));
    syncDirectives();
    return true;
  }

  async function talkDemand(demandId: string): Promise<boolean> {
    const demand = state()?.discipline?.demands.find((d) => d.id === demandId && d.status === 'open');
    if (!demand || !deps.startScene) return false;
    const ok = await deps.startScene({ locationId: 'quarters_unit', participants: [demand.unitId], origin: 'event' });
    if (ok) syncDirectives();
    return ok;
  }

  function onEvents(events: EngineEvent[]): void {
    let set = false;
    for (const e of events) {
      if (e.type === 'threat_registered' && (e.channel ?? 'scene') === 'scene') { // a DM reply never reads the context, so the directive would leak into the next scene
        const unitId = String(e.unitId);
        deps.context.setDirective(threatDirective(unitId, nameOf(unitId), measureLabel(deps.registries(), String(e.measure)), e.believed === true));
        set = true;
      } else if (e.type === 'delegate_demand' && typeof e.demandId === 'string') {
        // a favor she did on credit (a delegate one band short): her demand is worded and delivered like any other
        void wordAndDeliver(e.demandId, chatId()).catch(() => {});
      } else if (e.type === 'demand_opened' && typeof e.demandId === 'string' && state()?.discipline?.demands.some((d) => d.id === e.demandId && deps.registries().demandTemplates.get(d.templateId)?.kind === 'desire')) {
        // P9d: her want arrives from the day end (the daily roll never opens it): worded and delivered like any other demand
        void wordAndDeliver(e.demandId, chatId()).catch(() => {});
      } else if (e.type === 'threat_lapsed') {
        deps.toast('info', `A threat lapsed: ${nameOf(String(e.unitId))} saw the commander back down.`);
      } else if (e.type === 'covert_sabotage' && deps.settings().debug) {
        deps.toast('info', `Covert sabotage (${String(e.kind)}).`); // nobody is named: the squad does not know who did it either
      }
    }
    if (set) deps.refreshContext();
  }

  function onSceneOpened(): void {
    const state = deps.app.current().state;
    if (!state?.scene) return;
    disciplineDirectives(deps.context, state, deps.registries());
    introduceNickname(state);
    reputationDirectives(deps.context, deps.app.current().state ?? state, deps.registries());
    deps.refreshContext();
  }

  /** A nickname waits for a private scene: the unit in it says it for the first time (the engine makes it active). */
  function introduceNickname(state: CampaignState): void {
    const only = state.scene?.participants.length === 1 ? state.scene.participants[0] : undefined;
    if (only === undefined || !state.commander.reputation?.pending) return;
    if (state.squad.find((u) => u.id === only)?.kind !== 'named') return;
    const events = deps.app.dispatch({ type: 'reputation/introduce', payload: { unitId: only } });
    const given = events.find((e) => e.type === 'nickname_given');
    if (!given) return;
    deps.context.setDirective(nicknameDirective(nameOf(only), String(given.name)));
  }

  function onSceneClosed(): void {
    clearDisciplineDirectives(deps.context);
    deps.refreshContext();
  }

  const failure = (events: EngineEvent[]): EngineEvent | undefined => events.find((e) => e.type === 'error');

  /** What follows a punishment from the menu: her next reply reacts (she is in the room) or a toast says it was done. */
  function announcePunish(unitId: string, measure: string): void {
    const state = deps.app.current().state;
    const reg = deps.registries();
    const name = nameOf(unitId);
    const label = measureLabel(reg, measure);
    if (state?.scene?.participants.includes(unitId)) {
      // she is in the room: her next reply reacts to it, in the stance she is in now
      const stance = commandStance(state, reg, unitId);
      deps.context.setDirective(punishDirective(unitId, name, label, String(stance === null ? '' : stanceEntry(reg, stance)?.name ?? stance)));
      deps.refreshContext();
    } else {
      deps.toast('info', `The commander imposed ${label} on ${name}.`);
    }
  }

  function punish(unitId: string, measure: string, days?: number): boolean {
    const action = { type: 'discipline/punish', payload: { unitId, measure, ...(days !== undefined ? { days } : {}) } };
    const events = deps.app.dispatch(action);
    const bad = failure(events);
    if (bad?.code === 'vote_needed' && deps.requestVote) {
      // P9b: a mild punishment goes to a squad vote first; the announcement follows once the vote has run it
      void deps.requestVote(action).then((r) => { if (r === 'ran') announcePunish(unitId, measure); });
      return false;
    }
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    announcePunish(unitId, measure);
    return true;
  }

  function undo(id: string): boolean {
    const unitId = deps.app.current().state?.discipline?.applications.find((a) => a.id === id)?.unitId
      ?? deps.app.current().state?.discipline?.threats.find((t) => t.id === id)?.unitId;
    const events = deps.app.dispatch({ type: 'discipline/undo', payload: { id } });
    const bad = failure(events);
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    if (unitId !== undefined) {
      deps.context.clearDirective(`discipline:${unitId}`);
      if (id.startsWith('th')) deps.context.clearDirective(`threat:${unitId}`);
    }
    deps.refreshContext();
    deps.toast('info', 'Undone.');
    return true;
  }

  return { onEvents, onSceneOpened, onSceneClosed, punish, undo, onSlotAdvanced, answerDemand, talkDemand };
}
