import { smotherActive } from '../engine/bonds';
import type { EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import { generateRuleFlavor } from '../llm/calls/flavor';
import type { BondsDeps } from './deps';

export type { BondsDeps } from './deps';

export interface BondsController {
  /** Reads the events of one dispatch: a new rule proposal is worded (setting on, model answers) and delivered. */
  onEvents(events: EngineEvent[]): void;
  /** [ACCEPT] or [REFUSE] on a delivered proposal. Toasts the reason and returns false when the engine refuses. */
  answerRule(ruleId: string, answer: 'accept' | 'refuse'): boolean;
  /** [NEGOTIATE]: the rule becomes `negotiating` and a private scene with her opens (her quarters). */
  negotiateRule(ruleId: string): Promise<boolean>;
  /**
   * A new slot began: while a smother holds, her scene takes the first free one (her quarters, origin `event`); the scene's end
   * ends the hold. Nothing happens in the Night, with a scene, a fight, an expedition or a night knock already open.
   */
  onSlotAdvanced(): Promise<boolean>;
}

/**
 * The bonds half of a conversation (P9d): rule proposals reach the commander in her words (or the template's) as a DM, or
 * in the scene she is in, and the three answers go through the engine. The engine decides what is true; the directive of an
 * open proposal or negotiation comes from state (`bondsDirectives`), so nothing here has to be remembered.
 */
export function createBonds(deps: BondsDeps): BondsController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;

  /** Words one undelivered proposal and delivers it; a chat that changed meanwhile drops it (the next day end delivers the template text). */
  async function wordAndDeliver(ruleId: string, expect: string | undefined): Promise<void> {
    const s = state();
    const rule = s?.bonds?.rules.find((r) => r.id === ruleId);
    if (!s || !rule || rule.status !== 'proposed' || rule.delivered) return;
    const reg = deps.registries();
    let text: string | undefined;
    if (deps.settings().ruleWording) {
      const unit = s.squad.find((u) => u.id === rule.unitId);
      try {
        text = (await generateRuleFlavor({
          kind: 'rule', unitName: unit?.displayName ?? rule.unitId,
          stateHint: String(reg.relationshipStates.get(s.relations[rule.unitId]?.stateId ?? '')?.promptHint ?? ''), rule: rule.text,
        }, { st: deps.st, settings: deps.settings(), contentLine: deps.contentLine })) ?? undefined;
      } catch {
        text = undefined; // a failed call never blocks the proposal: the template text is used
      }
    }
    if (chatId() !== expect) return;
    const events = deps.app.dispatch({ type: 'bonds/deliver_rule', payload: { ruleId, ...(text !== undefined ? { text } : {}) } }, { expectChatId: expect });
    if (!events.some((e) => e.type === 'error')) deps.refreshContext();
  }

  function answer(ruleId: string, how: 'accept' | 'negotiate' | 'refuse'): boolean {
    const events = deps.app.dispatch({ type: 'bonds/answer_rule', payload: { ruleId, answer: how } }, { expectChatId: chatId() });
    const bad = events.find((e) => e.type === 'error');
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    deps.refreshContext();
    return true;
  }

  let opening = false;

  return {
    async onSlotAdvanced() {
      const s = state();
      const hold = s ? smotherActive(s) : null;
      if (!s || !hold || opening || !deps.startScene) return false;
      if (s.slot === 'night' || s.scene || s.combat || s.expedition || s.calendar.pendingScene || s.calendar.nightEvent) return false;
      opening = true;
      try {
        const ok = await deps.startScene({ locationId: 'quarters_unit', participants: [hold.unitId], origin: 'event' });
        deps.refreshContext();
        return ok;
      } finally {
        opening = false;
      }
    },
    onEvents(events) {
      for (const e of events) if (e.type === 'rule_proposed' && typeof e.ruleId === 'string') void wordAndDeliver(e.ruleId, chatId()).catch(() => {});
    },
    answerRule: (ruleId, how) => answer(ruleId, how),
    async negotiateRule(ruleId) {
      const unitId = state()?.bonds?.rules.find((r) => r.id === ruleId)?.unitId;
      if (!unitId || !deps.startScene || !answer(ruleId, 'negotiate')) return false;
      const ok = await deps.startScene({ locationId: 'quarters_unit', participants: [unitId], origin: 'event' });
      deps.refreshContext();
      return ok;
    },
  };
}
