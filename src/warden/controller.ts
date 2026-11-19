import type { EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import { EXPECTATION_KINDS, normalizeAgenda, wardenOf } from '../engine/warden';
import { generateAgenda, type WardenAgendaInput } from '../llm/calls/wardenAgenda';
import { REVEAL_DIRECTIVE, wardenDirectives } from './directives';
import type { WardenDeps } from './deps';

export type { WardenDeps } from './deps';

export interface WardenController {
  /** Reads the events of one dispatch: a new warden is asked for her agenda; the reveal directive follows the state. */
  onEvents(events: EngineEvent[]): void;
  /** After a (re)load or a deployment (a built campaign has no event stream): asks for the agenda once if she still has the fallback. */
  onLoaded(): void;
}

const CARD_MAX = 600;

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
    deps.context.clearMatching((d) => d.id === REVEAL_DIRECTIVE);
    if (s) for (const d of wardenDirectives(s, deps.registries())) deps.context.setDirective(d);
    deps.refreshContext();
  }

  async function ask(): Promise<void> {
    const s = state();
    const w = s ? wardenOf(s) : null;
    const expect = chatId();
    if (!s || !w || w.agenda !== 'fallback' || w.overrideFired === true) return;
    const key = `${expect ?? ''}:${w.unitId}:${w.sinceDay}`;
    if (asked.has(key)) return;
    asked.add(key);
    const unit = s.squad.find((u) => u.id === w.unitId);
    if (!unit) return;
    const reg = deps.registries();
    const card = unit.cardRef === undefined ? null : deps.st.getCharacterCard(unit.cardRef);
    const corpId = s.commander.corporationId;
    const corp = corpId === null ? undefined : reg.corporations.get(corpId);
    const input: WardenAgendaInput = {
      name: unit.displayName,
      card: [card?.description, card?.personality].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' ').slice(0, CARD_MAX),
      values: { ...unit.values },
      corporation: corp ? `${String(corp.name)}: ${String(corp.summary)}` : 'The corporation.',
      kinds: [...EXPECTATION_KINDS],
    };
    let shape: unknown;
    try {
      shape = await generateAgenda(input, { st: deps.st, settings: deps.settings() });
    } catch {
      return; // fail soft: the fallback stands
    }
    if (chatId() !== expect) return; // a late answer for another chat
    const list = normalizeAgenda((shape as { expectations?: unknown } | null)?.expectations, reg);
    if (list === null) return;
    deps.app.dispatch({ type: 'warden/agenda', payload: { expectations: list } }, { expectChatId: expect });
  }

  return {
    onEvents(events) {
      if (events.some((e) => e.type === 'warden_assigned')) void ask().catch(() => {});
      if (events.some((e) => e.type === 'warden_revealed' || e.type === 'warden_assigned' || e.type === 'onboarding_step_completed' || e.type === 'onboarding_step_skipped' || e.type === 'onboarding_done')) refreshDirectives();
    },
    onLoaded() {
      void ask().catch(() => {});
      refreshDirectives();
    },
  };
}
