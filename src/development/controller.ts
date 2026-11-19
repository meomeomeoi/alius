import { enabledCategories } from '../engine/bonds/content';
import { momentDirective } from '../engine/development/moments';
import { effectiveProfile } from '../engine/development/profile';
import { eligibleAxes, fallbackReview, reviewCommitted, reviewDue, undoReview, unitDue, type ReviewValue } from '../engine/development/review';
import { developmentOf } from '../engine/development/state';
import type { CampaignState, Unit } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import { readReview, type DevelopmentReviewInput } from '../llm/calls/developmentReview';
import type { DevelopmentDeps } from './deps';

export type { DevelopmentDeps } from './deps';

const SITE = 'development.review';

export interface DevelopmentController {
  /** After a settled dispatch: asks for one due review (one call per run; the next unit waits for the next run). */
  run(): Promise<void>;
  /** A scene opened: each participant whose quiet change the scene carries gets a one-time cue. */
  onSceneOpened(): void;
  onSceneClosed(): void;
  /** P14: REROLL of a unit's last review (before she has shown it) and why it is not allowed. */
  reroll(unitId: string): Promise<void>;
  rerollState(unitId: string): { enabled: boolean; reason?: string };
  /** Waits for the call in flight (tests). */
  idle(): Promise<void>;
}

/**
 * The model-facing half of character development (P14b): after a dispatch settles it asks for the weekly review of one due soldier
 * through the envelope (site `development.review`, key = her id, quiet) and dispatches `development/review` with the answer, or the
 * engine's own fallback review (nudges only) when the call fails or no profile is set. Quiet: no toast and no chip beyond the quiet
 * record. The state is the truth: the input is rebuilt from it every time and an answer for another chat is dropped.
 */
export function createDevelopment(deps: DevelopmentDeps): DevelopmentController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;
  let flight: Promise<void> | null = null;

  /** A redo (a retry after the fallback, a REROLL) replaces the last review; a unit that is due again starts a new one. */
  const isRedo = (s: CampaignState, unitId: string): boolean => !unitDue(s, unitId) && s.squad.find((u) => u.id === unitId)?.development?.lastApplied !== undefined;

  /** The state as it was when the review ran: a redo reads the batch the last review took. */
  function before(s: CampaignState, unitId: string): CampaignState {
    if (!isRedo(s, unitId)) return s;
    const c = structuredClone(s);
    undoReview(c, unitId);
    return c;
  }

  function reviewInput(s: CampaignState, unit: Unit): DevelopmentReviewInput {
    const reg = deps.registries();
    const card = unit.cardRef === undefined ? null : deps.st.getCharacterCard(unit.cardRef);
    const p = effectiveProfile(unit);
    const bond = unit.bond === undefined || p.bond === null ? undefined : { leadStyle: p.bond.leadStyle, attachment: p.bond.attachment, desire: p.bond.desire, caretaker: p.bond.caretaker }; // P14b: raw profile (only whether a bond was imported)
    const on = new Set(enabledCategories(s));
    return {
      unitId: unit.id, name: unit.displayName,
      card: [card?.description, card?.personality].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' ').slice(0, TUNING.development.cardMax),
      profile: { values: { ...p.values }, likes: p.likes, dislikes: p.dislikes, tastes: p.tastes.map((t) => String(reg.tastes.get(t)?.name ?? t)), ...(bond ? { bond } : {}) },
      anchors: [...developmentOf(unit).anchors],
      axes: eligibleAxes(s, reg, unit),
      experiences: developmentOf(unit).pending.map((a) => a.summary),
      facts: developmentOf(unit).facts.map((f) => f.text),
      categories: [...reg.contentCategories.values()].filter((c) => on.has(String(c.id))).map((c) => ({ id: String(c.id), label: String(c.label) })),
    };
  }

  function dispatchReview(unitId: string, review: ReviewValue, source: 'model' | 'fallback') {
    const s = state();
    const redo = s !== null && isRedo(s, unitId);
    return deps.app.dispatch({ type: 'development/review', payload: { unitId, review, source, ...(redo ? { replace: true } : {}) } }, { expectChatId: chatId() });
  }

  deps.generations.bind<DevelopmentReviewInput, ReviewValue>(SITE, {
    build(key) {
      const s = state();
      const unit = s?.squad.find((u) => u.id === key);
      if (!s || !unit || unit.kind !== 'named') return { expired: 'She is no longer here.' };
      if (isRedo(s, key)) {
        const why = reviewCommitted(s, key);
        if (why !== null) return { expired: why };
      } else if (!unitDue(s, key)) return { expired: 'She has nothing to review.' };
      const view = before(s, key);
      return reviewInput(view, view.squad.find((u) => u.id === key)!);
    },
    parse: (raw, input) => readReview(raw, input),
    apply(key, value) {
      const err = dispatchReview(key, value, 'model').find((e) => e.type === 'error');
      if (!err) return 'ok';
      return err.code === 'chat_changed' ? { stale: true } : { rejected: String(err.message ?? 'The review was refused.') };
    },
    fallback(key) {
      const s = state();
      if (!s) return false;
      const view = before(s, key);
      return !dispatchReview(key, fallbackReview(view, deps.registries(), key), 'fallback').some((e) => e.type === 'error');
    },
    committed(key) {
      const s = state();
      return s ? reviewCommitted(s, key) : 'This campaign is closed.';
    },
  });

  async function run(): Promise<void> {
    const s = state();
    if (!s || flight) return;
    const due = reviewDue(s, deps.registries());
    if (due === null) return;
    flight = (async () => { await deps.generations.generate(SITE, due); })().finally(() => { flight = null; });
    await flight;
  }

  const clear = (): void => deps.context.clearMatching((d) => d.id.startsWith('development:'));

  return {
    run,
    onSceneOpened() {
      const s = state();
      if (!s?.scene) return;
      for (const id of s.scene.participants) {
        const d = momentDirective(s, deps.registries(), id);
        if (d) deps.context.setDirective(d);
      }
      deps.refreshContext();
    },
    onSceneClosed() {
      clear();
      deps.refreshContext();
    },
    reroll: async (unitId) => { await deps.generations.reroll(SITE, unitId); },
    rerollState: (unitId) => deps.generations.rerollState(SITE, unitId),
    async idle() { while (flight) await flight.catch(() => {}); },
  };
}
