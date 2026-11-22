import { offerLabel, type OfferComposition } from '../engine/dynamic/offer';
import { DYNAMIC_EVENT_TYPES } from '../engine/dynamic/types';
import type { CampaignState } from '../engine/state/types';
import type { DynamicDeps } from './deps';
import { clearDynamicDirectives, refreshDynamicDirectives } from './directives';

export type { DynamicDeps } from './deps';

export interface DynamicController {
  /** The events of a settled dispatch: one of the dynamic's own (a probe issued, a band or a frame crossed, a position shifted, ...) changes what the model is told. */
  onEvents(events: Array<{ type: string; [k: string]: unknown }>): void;
  /** A scene opened: the directives of each present woman who holds, or whose probe is pending, are set. */
  onSceneOpened(): void;
  /** The scene closed, or the chat changed: every directive of the dynamic goes. */
  onSceneClosed(): void;
  /** `[ ACCEPT ]` or `[ REFUSE ]` on her open milestone (the open id). Toasts the reason and returns false when the engine refuses. */
  answerMilestone(milestoneId: string, answer: 'accept' | 'refuse'): boolean;
  /** `[ YIELD ]` or `[ REFUSE ]` on her open claim (the open id). Toasts the reason and returns false when the engine refuses. */
  answerClaim(claimId: string, answer: 'yield' | 'refuse'): boolean;
  /** `[ ACCEPT ]` or `[ REFUSE ]` on her return offer (the only one open). Toasts the reason and returns false when the engine refuses. */
  answerReturn(answer: 'accept' | 'refuse'): boolean;
  /** `[ TALK ]` on her open claim: opens a one-to-one scene with her (her quarters) while the claim stays open. False when it is not open or no scene can open. */
  talk(claimId: string): Promise<boolean>;
  /**
   * `[ SEND ]` of the offer composer: dispatches `dynamic/offer` (through the scene controller's `stage` when she is in the open scene, directly otherwise), then says the offer as the
   * commander's act, in the scene or in her thread, so that she answers it. Toasts the reason and answers false when the engine refuses; nothing is said then.
   */
  offer(unitId: string, composition: OfferComposition, askInReturn: boolean): Promise<boolean>;
}

const OWN: readonly string[] = DYNAMIC_EVENT_TYPES;

/**
 * The model-facing half of the dynamic (P15): its directives are derived from the state on every refresh (`refreshDynamicDirectives`, called
 * by the app's context pass), so the controller only has to push a refresh when something of the dynamic happened, set them when a scene opens
 * and drop them when it closes or the chat switches. It asks for no model call of its own and dispatches nothing.
 */
export function createDynamic(deps: DynamicDeps): DynamicController {
  const state = (): CampaignState | null => deps.app.current().state;
  return {
    onEvents(events) {
      if (events.some((e) => OWN.includes(e.type))) deps.refreshContext();
    },
    onSceneOpened() {
      const s = state();
      if (s) refreshDynamicDirectives(deps.context, s, deps.registries());
      deps.refreshContext();
    },
    onSceneClosed() {
      clearDynamicDirectives(deps.context);
      deps.refreshContext();
    },
    answerMilestone(milestoneId, answer) {
      const events = deps.app.dispatch({ type: 'dynamic/answer_milestone', payload: { milestoneId, answer } }, { expectChatId: deps.st.getActiveChat()?.chatId });
      const bad = events.find((e) => e.type === 'error');
      if (bad) {
        deps.toast('error', String(bad.message ?? bad.code));
        return false;
      }
      deps.refreshContext();
      return true;
    },
    answerClaim(claimId, answer) {
      const events = deps.app.dispatch({ type: 'dynamic/answer_claim', payload: { claimId, answer } }, { expectChatId: deps.st.getActiveChat()?.chatId });
      const bad = events.find((e) => e.type === 'error');
      if (bad) {
        deps.toast('error', String(bad.message ?? bad.code));
        return false;
      }
      deps.refreshContext();
      return true;
    },
    answerReturn(answer) {
      const events = deps.app.dispatch({ type: 'dynamic/answer_return', payload: { answer } }, { expectChatId: deps.st.getActiveChat()?.chatId });
      const bad = events.find((e) => e.type === 'error');
      if (bad) {
        deps.toast('error', String(bad.message ?? bad.code));
        return false;
      }
      deps.refreshContext();
      return true;
    },
    async offer(unitId, composition, askInReturn) {
      const s = state();
      if (!s) return false;
      const reg = deps.registries();
      const inScene = s.scene?.participants.includes(unitId) === true;
      const action = { type: 'dynamic/offer', payload: { unitId, composition, ...(askInReturn ? { askInReturn: true } : {}) } };
      const events = inScene && deps.stage !== undefined ? deps.stage(action) : deps.app.dispatch(action, { expectChatId: deps.st.getActiveChat()?.chatId });
      const bad = events.find((e) => e.type === 'error');
      if (bad) {
        deps.toast('error', String(bad.message ?? bad.code));
        return false;
      }
      deps.refreshContext();
      const what = composition.flatMap((c) => c.ids.map((id) => offerLabel(reg, c.tab, id).toLowerCase())).join(' and ');
      const line = `*offers ${what}${askInReturn ? ', asking something in return' : ''}.*`; // the commander's act, in the commander's voice
      if (inScene) void deps.sayInScene?.(line)?.catch?.(() => {});
      else void deps.sayInDm?.(unitId, line)?.catch?.(() => {});
      return true;
    },
    async talk(claimId) {
      const claim = state()?.dynamic?.open.claims.find((c) => c.id === claimId);
      if (claim === undefined || deps.startScene === undefined) return false;
      const ok = await deps.startScene({ locationId: 'quarters_unit', participants: [claim.unitId], origin: 'event' });
      if (ok) deps.refreshContext();
      return ok;
    },
  };
}
