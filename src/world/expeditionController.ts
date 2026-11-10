import { canAutoResolve } from '../engine/combat';
import type { StartPayload } from '../engine/combat/types';
import type { EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import { reportLines, type Formation, type TreatKind } from '../engine/world/expedition';
import { generateRecap } from '../llm/calls/expeditionRecap';
import type { StartOptions } from '../scene/sceneController';
import type { WorldDeps } from './deps';

export type PlanTarget = { missionId: string } | { poi: { regionId: string; poiId: string } };

export interface ExpeditionController {
  plan(target: PlanTarget): void;
  planning(): PlanTarget | null;
  cancelPlan(): void;
  launch(p: { unitIds: string[]; formation: Formation; supplies: number }): boolean;
  move(nodeId: string): void;
  choose(index: number): void;
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
  debrief(unitIds: string[]): Promise<boolean>;
}

export function createExpedition(deps: WorldDeps & {
  startCombat(p: StartPayload): boolean;
  startScene(o: StartOptions): Promise<boolean>;
}): ExpeditionController {
  let target: PlanTarget | null = null;

  const state = (): CampaignState | null => deps.app.current().state;
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;

  /** Dispatches and shows a refusal as a toast; returns true when the engine accepted. */
  function act(type: string, payload: unknown = {}, expect?: string): { ok: boolean; events: EngineEvent[] } {
    const events = deps.app.dispatch({ type, payload }, { expectChatId: expect });
    const failed = events.find((e) => e.type === 'error');
    if (failed && failed.code !== 'chat_changed') deps.toast('error', String(failed.message ?? failed.code));
    return { ok: !failed, events };
  }

  return {
    plan(t) { target = t; },
    planning: () => target,
    cancelPlan() { target = null; },

    launch(p) {
      if (!target) {
        deps.toast('error', 'Choose a mission or a point of interest first.');
        return false;
      }
      const { ok } = act('expedition/start', { ...target, unitIds: p.unitIds, formation: p.formation, supplies: p.supplies });
      if (ok) target = null;
      return ok;
    },

    move(nodeId) { act('expedition/move', { nodeId }); },
    choose(index) { act('expedition/choose', { option: index }); },
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

    async requestRecap() {
      const s = state();
      const report = s?.lastExpedition;
      const settings = deps.settings();
      if (!s || !report || report.recap !== undefined || !settings.expeditionRecap) return;
      const reg = deps.registries();
      const chat = chatId();
      const region = reg.regions.get(report.regionId);
      const commander = s.commander.name;
      const text = await generateRecap({
        commanderName: commander,
        missionTitle: report.missionTitle,
        regionName: String(region?.name ?? report.regionId),
        environment: String(region?.environmentPrompt ?? ''),
        outcome: report.outcome,
        lines: reportLines(report, s, reg),
        units: report.party.map((id) => {
          const u = s.squad.find((x) => x.id === id);
          return { name: u?.displayName ?? id, role: String(reg.roles.get(u?.roleId ?? '')?.name ?? u?.roleId ?? 'soldier') };
        }),
      }, { st: deps.st, settings });
      if (text === null || chatId() !== chat || state()?.lastExpedition?.id !== report.id) return;
      act('expedition/set_recap', { reportId: report.id, text }, chat);
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
