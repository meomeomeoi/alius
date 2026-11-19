import type { EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import { sanitizeRuleFlavor, type RuleFlavorInput } from '../llm/calls/flavor';
import type { BondsDeps } from './deps';

export type { BondsDeps } from './deps';

export interface BondsController {
  /** Reads the events of one dispatch: a new rule proposal is worded (setting on, model answers) and delivered. */
  onEvents(events: EngineEvent[]): void;
  /** [ACCEPT] or [REFUSE] on a delivered proposal. Toasts the reason and returns false when the engine refuses. */
  answerRule(ruleId: string, answer: 'accept' | 'refuse'): boolean;
  /** [NEGOTIATE]: the rule becomes `negotiating` and a private scene with her opens (her quarters). */
  negotiateRule(ruleId: string): Promise<boolean>;
  /** P14: REROLL of a delivered proposal's wording, before an answer (`flavor.rule`). */
  reword(ruleId: string): Promise<void>;
  /** The dossier's [SECRET] [KNOWN] [PUBLIC]: the commander sets how open the relationship is. Toasts the reason and returns false when the engine refuses. */
  setPublicity(unitId: string, level: 'secret' | 'known' | 'public'): boolean;
}

/**
 * The bonds half of a conversation (P9d): rule proposals reach the commander in her words (or the template's) as a DM, or
 * in the scene she is in, and the three answers go through the engine. The engine decides what is true; the directive of an
 * open proposal or negotiation comes from state (`bondsDirectives`), so nothing here has to be remembered.
 */
export function createBonds(deps: BondsDeps): BondsController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;

  const ruleOf = (id: string) => state()?.bonds?.rules.find((r) => r.id === id);

  // the `flavor.rule` site (key: the rule's id): a proposal in her words, delivered; a failure delivers the template text (a quiet record).
  // A delivered proposal nobody answered is worded again by RETRY or REROLL
  deps.generations.bind<RuleFlavorInput, string>('flavor.rule', {
    build(ruleId) {
      const s = state();
      const rule = ruleOf(ruleId);
      if (!s || !rule || rule.status !== 'proposed') return { expired: 'It was answered.' };
      const reg = deps.registries();
      const unit = s.squad.find((u) => u.id === rule.unitId);
      return {
        kind: 'rule', unitName: unit?.displayName ?? rule.unitId,
        stateHint: String(reg.relationshipStates.get(s.relations[rule.unitId]?.stateId ?? '')?.promptHint ?? ''), rule: rule.text,
      };
    },
    parse: (raw) => sanitizeRuleFlavor(raw)?.text ?? null,
    apply(ruleId, text) {
      const rule = ruleOf(ruleId);
      if (!rule) return { stale: true };
      const events = deps.app.dispatch({ type: rule.delivered ? 'bonds/reword_rule' : 'bonds/deliver_rule', payload: { ruleId, text } }, { expectChatId: chatId() });
      if (events.some((e) => e.type === 'error')) return { stale: true };
      deps.refreshContext();
      return 'ok';
    },
    fallback(ruleId) {
      const rule = ruleOf(ruleId);
      if (!rule) return false;
      if (rule.delivered) return true;
      const events = deps.app.dispatch({ type: 'bonds/deliver_rule', payload: { ruleId } }, { expectChatId: chatId() });
      if (events.some((e) => e.type === 'error')) return false;
      deps.refreshContext();
      return true;
    },
    committed: (ruleId) => (ruleOf(ruleId)?.status === 'proposed' ? null : 'It was answered.'),
  });

  /** Words one undelivered proposal and delivers it; a chat that changed meanwhile drops it (the next day end delivers the template text). */
  async function wordAndDeliver(ruleId: string, expect: string | undefined): Promise<void> {
    const rule = ruleOf(ruleId);
    if (!rule || rule.status !== 'proposed' || rule.delivered || chatId() !== expect) return;
    if (deps.settings().ruleWording) {
      await deps.generations.generate('flavor.rule', ruleId);
      return;
    }
    const events = deps.app.dispatch({ type: 'bonds/deliver_rule', payload: { ruleId } }, { expectChatId: expect });
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

  return {
    reword: async (ruleId) => { await deps.generations.reroll('flavor.rule', ruleId); },
    setPublicity(unitId, level) {
      const events = deps.app.dispatch({ type: 'bonds/set_publicity', payload: { unitId, level } }, { expectChatId: chatId() });
      const bad = events.find((e) => e.type === 'error');
      if (bad) {
        deps.toast('error', String(bad.message ?? bad.code));
        return false;
      }
      deps.refreshContext();
      return true;
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
