import type { Registries } from '../content/types';
import type { Action, EngineEvent } from '../engine/dispatch';
import { choiceOpen, herChooser, herPickFor, preselects, type AskedContext } from '../engine/practice/askHer';
import type { CampaignState } from '../engine/state/types';

/**
 * ASK HER on the client side (P16, plan R22): what the controllers of the three choices do around the choose action. A card she pre-selects is not asked by a press: her pick is written (`practice/ask_her`)
 * the moment the commander chooses, so that the engine can charge what choosing against her costs. Nothing is written for a card nobody holds the commander for.
 */
export type Dispatch = (action: Action, opts?: { expectChatId?: string }) => EngineEvent[];

/** Writes her pick for a card she pre-selects, if it is not written yet. Silent; nothing for a card that is not open or nobody pre-selecting. */
export function ensureAsked(dispatch: Dispatch, state: CampaignState | null, reg: Registries, context: AskedContext, ref: string, chatId?: string): void {
  if (state === null || !choiceOpen(state, context, ref)) return;
  const rec = state.practices?.asked;
  if (rec !== undefined && rec.context === context && rec.ref === ref) return;
  const holderId = herChooser(state, reg);
  if (holderId === null || !preselects(state, reg, holderId)) return;
  dispatch({ type: 'practice/ask_her', payload: { context, ref } }, { expectChatId: chatId });
}

/** Is this choice against her pick (she was asked, or pre-selects, and has a pick that is another)? The engine reads it from the state itself; the client says it with `againstHer`. */
export function choosesAgainstHer(state: CampaignState | null, reg: Registries, context: AskedContext, ref: string, choice: number | 'for' | 'against'): boolean {
  if (state === null) return false;
  const rec = state.practices?.asked;
  if (rec !== undefined && rec.context === context && rec.ref === ref) return rec.index !== null && rec.index !== choice;
  const holderId = herChooser(state, reg);
  if (holderId === null || !preselects(state, reg, holderId) || !choiceOpen(state, context, ref)) return false;
  const pick = herPickFor(state, reg, holderId, context, ref);
  return pick !== null && pick !== choice;
}
