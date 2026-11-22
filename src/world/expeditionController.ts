import { canAutoResolve } from '../engine/combat';
import type { StartPayload } from '../engine/combat/types';
import type { RoutePick } from '../engine/commander/checks';
import { choosesAgainstHer, ensureAsked } from '../practice/askHer';
import type { Action, EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import { reportLines, type Formation, type TreatKind } from '../engine/world/expedition';
import { sanitizeRecap, type RecapInput } from '../llm/calls/expeditionRecap';
import type { StartOptions } from '../scene/sceneController';
import type { WorldDeps } from './deps';

/** What the commander plans: a mission or a point of interest. `withoutCommand` (P16: `[ SEND THE SQUAD ]` on a kept alarm) sends the squad with no commander; the planner leaves the holder out. */
export type PlanTarget = ({ missionId: string } | { poi: { regionId: string; poiId: string } }) & { withoutCommand?: true };

export interface ExpeditionController {
  plan(target: PlanTarget): void;
  planning(): PlanTarget | null;
  cancelPlan(): void;
  launch(p: { unitIds: string[]; formation: Formation; supplies: number }): boolean;
  move(nodeId: string): void;
  choose(index: number, route?: RoutePick): void;
  treat(unitId: string, kind: TreatKind): void;
  setFormation(f: Formation): void;
  /** Starts the pending encounter as a P4 combat; `auto` is only requested when the fight can be auto-resolved. */
  fight(opts: { coverId?: string; auto?: boolean }): boolean;
  /** Takes the result of a finished fight into the run, once. */
  afterCombat(): void;
  retreat(): void;
  return(): void;
  requestRecap(): Promise<void>;
  acknowledge(): void;
  /** P9e: closes an event node a soldier decided on her own (`acknowledge` is the after-action report's). */
  ackHerCall(): void;
  /** P16: closes an event node the squad decided without the commander. */
  ackSquadCall(): void;
  debrief(unitIds: string[]): Promise<boolean>;
}

export function createExpedition(deps: WorldDeps & {
  startCombat(p: StartPayload): boolean;
  startScene(o: StartOptions): Promise<boolean>;
  /** P9b: runs a decision the squad votes on (the app's `power.requestVote`). Without it a gated launch is refused like any other. */
  requestVote?: (action: Action) => Promise<'ran' | 'dropped' | 'cancelled'>;
  /** P13: the warden's optional judge (the app's `warden`): an overridable action waits for it when the setting is on. */
  judge?: { needsJudge(action: Action): boolean; judgeThen(action: Action): Promise<EngineEvent[]> };
}): ExpeditionController {
  let target: PlanTarget | null = null;

  const state = (): CampaignState | null => deps.app.current().state;
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;

  /** Dispatches and shows a refusal as a toast; returns true when the engine accepted. */
  function act(type: string, payload: unknown = {}, expect?: string): { ok: boolean; events: EngineEvent[] } {
    const events = deps.app.dispatch({ type, payload }, { expectChatId: expect });
    const failed = events.find((e) => e.type === 'error');
    const voteNeeded = failed?.code === 'vote_needed' && deps.requestVote !== undefined; // the vote panel answers it, not a toast
    if (failed && failed.code !== 'chat_changed' && !voteNeeded && failed.handled !== true) deps.toast('error', String(failed.message ?? failed.code));
    return { ok: !failed, events };
  }

  // the `expedition.recap` site (key: the report id): the narrative recap of the last report; REROLL replaces it, a failure leaves the deterministic report
  deps.generations.bind<RecapInput, string>('expedition.recap', {
    build(reportId) {
      const s = state();
      const report = s?.lastExpedition;
      if (!s || !report || report.id !== reportId) return { expired: 'A newer report replaced it.' };
      const reg = deps.registries();
      const region = reg.regions.get(report.regionId);
      return {
        commanderName: s.commander.name,
        missionTitle: report.missionTitle,
        regionName: String(region?.name ?? report.regionId),
        environment: String(region?.environmentPrompt ?? ''),
        outcome: report.outcome,
        lines: reportLines(report, s, reg),
        ...(report.withoutCommand !== undefined ? { withoutCommand: true as const } : {}), // P16: the commander was not with the squad
        units: report.party.map((id) => {
          const u = s.squad.find((x) => x.id === id);
          return { name: u?.displayName ?? id, role: String(reg.roles.get(u?.roleId ?? '')?.name ?? u?.roleId ?? 'soldier') };
        }),
      };
    },
    parse: (raw) => sanitizeRecap(String(raw)),
    apply(reportId, text) {
      const { ok } = act('expedition/set_recap', { reportId, text }, chatId());
      return ok ? 'ok' : { stale: true };
    },
    committed: (reportId) => (state()?.lastExpedition?.id === reportId ? null : 'A newer report replaced it.'),
  });

  return {
    plan(t) { target = t; },
    planning: () => target,
    cancelPlan() { target = null; },

    launch(p) {
      if (!target) {
        deps.toast('error', 'Choose a mission or a point of interest first.');
        return false;
      }
      const payload = { ...target, unitIds: p.unitIds, formation: p.formation, supplies: p.supplies };
      // P13: the warden's judge reads the order first (a short model call); the plan stays until the launch has run
      const judged: Action = { type: 'expedition/start', payload };
      if (deps.judge?.needsJudge(judged)) {
        const planned = target;
        void deps.judge.judgeThen(judged).then((events) => { if (!events.some((e) => e.type === 'error') && events.length > 0 && target === planned) target = null; });
        return false;
      }
      const { ok, events } = act('expedition/start', payload);
      if (!ok && deps.requestVote && events.some((e) => e.type === 'error' && e.code === 'vote_needed')) {
        // P9b: the squad votes on a mission from the board; the plan stays until the vote has run the launch
        const planned = target;
        void deps.requestVote({ type: 'expedition/start', payload }).then((r) => { if (r === 'ran' && target === planned) target = null; });
        return false;
      }
      if (ok) target = null;
      return ok;
    },

    move(nodeId) { act('expedition/move', { nodeId }); },
    choose(index, route) {
      // P16: a card she pre-selects is asked at the choice; choosing against her pick says so (the engine charges it from the state)
      const pending = state()?.expedition?.pending;
      const ref = pending?.kind === 'event' ? pending.nodeId : '';
      ensureAsked(deps.app.dispatch, state(), deps.registries(), 'expedition', ref);
      const against = choosesAgainstHer(state(), deps.registries(), 'expedition', ref, index);
      act('expedition/choose', { option: index, ...(route ? { route } : {}), ...(against ? { againstHer: true } : {}) });
    },
    treat(unitId, kind) { act('expedition/treat', { unitId, kind }); },
    setFormation(formation) { act('expedition/set_formation', { formation }); },

    fight(opts) {
      const s = state();
      const exp = s?.expedition;
      if (!s || !exp || exp.phase !== 'combat' || exp.pending?.kind !== 'combat') {
        deps.toast('error', 'There is no fight waiting.');
        return false;
      }
      const payload: StartPayload = {
        encounter: exp.pending.encounter, formation: structuredClone(exp.formation), expedition: true, bankLoot: false,
        ...(opts.coverId !== undefined ? { coverId: opts.coverId } : {}),
      };
      if (!deps.startCombat(payload)) return false;
      if (opts.auto === true && canAutoResolve(s, deps.registries(), payload)) act('combat/auto', { on: true });
      return true;
    },

    afterCombat() {
      const s = state();
      const exp = s?.expedition;
      if (!s || !exp || exp.phase !== 'combat' || exp.pending?.kind !== 'combat' || s.combat) return;
      if (!s.lastCombat || s.lastCombat.id === exp.pending.prevCombatId) return;
      act('expedition/resolve_combat');
    },

    retreat() { act('expedition/retreat'); },
    return() { act('expedition/return'); },
    acknowledge() { act('expedition/ack_report'); },
    ackHerCall() { act('expedition/ack_her_call'); },
    ackSquadCall() { act('expedition/ack_squad_call'); },

    async requestRecap() {
      const report = state()?.lastExpedition;
      if (!report || report.recap !== undefined || !deps.settings().expeditionRecap) return;
      await deps.generations.generate('expedition.recap', report.id);
    },

    async debrief(unitIds) {
      const s = state();
      if (!s?.lastExpedition) {
        deps.toast('error', 'There is no expedition to talk about.');
        return false;
      }
      if (s.slot === 'night') {
        deps.toast('warn', 'Nobody is up to a debrief at night.');
        return false;
      }
      if (s.scene) {
        deps.toast('warn', 'A scene is already open: end it first.');
        return false;
      }
      if (unitIds.length === 0) {
        deps.toast('warn', 'Choose who to talk to.');
        return false;
      }
      const chat = chatId();
      const started = await deps.startScene({ locationId: 'garage', participants: unitIds, origin: 'debrief', consumesSlot: false });
      if (!started) return false;
      act('expedition/mark_debriefed', {}, chat);
      return true;
    },
  };
}
