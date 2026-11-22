/**
 * ASK HER (P16, plan R22, spec §R.7): on a choice the commander decides (a dilemma, a ballot the commander casts, an expedition event) the commander may ask the one who holds the commander what she would pick.
 * Her pick is the engine's and has no draw: the option whose effects on her score highest (a dilemma: P9c's `herPick`; an expedition event: the same rule over the party), her ballot on a vote (else `for`),
 * or nothing when nothing touches her (she leaves it to the commander). Choosing her pick is free; choosing another costs `overrode_her` (hold falls through P15's feed) and, when she pre-selects (frame `rule` with
 * the command), an offence `countermand_overruled`. The pick is kept in `practices.asked` until the choice is made. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { hasCapability } from '../dynamic/capabilities';
import { dynamicOf } from '../dynamic/state';
import { computeDeltas } from '../relations/deltas';
import { eventOptions } from '../world/expedition';
import { obedienceOf, overrideHer, herPick } from '../personal/obedience';
import type { CampaignState, Vote } from '../state/types';
import { ensurePractices, practiceHolders } from './gate';
import { noteOffence } from './offences';
import type { PracticeState } from './state';

export type AskedContext = 'dilemma' | 'expedition' | 'vote';
export type Asked = NonNullable<PracticeState['asked']>;
export type AskedIndex = Asked['index'];

/** The one the commander asks: the live holder with the highest hold (the first in squad order on a tie). `null` while nobody holds the commander. Reads only. */
export function herChooser(state: CampaignState, reg: Registries): string | null {
  const holders = practiceHolders(state, reg);
  let best: { id: string; hold: number } | null = null;
  for (const id of holders) {
    const hold = dynamicOf(state, id)?.hold ?? 0;
    if (best === null || hold > best.hold) best = { id, hold };
  }
  return best?.id ?? null;
}

/** Does she pre-select (R22): her frame is `rule` and she holds the command (`countermand`)? Reads only. */
export const preselects = (state: CampaignState, reg: Registries, holderId: string): boolean => dynamicOf(state, holderId)?.frame === 'rule' && hasCapability(state, reg, holderId, 'countermand');

/**
 * The option of the pending expedition event she would pick: among the options `eventOptions` leaves open, the one whose `unit_event` effects on her sum the highest Trust and Affinity (through `computeDeltas`),
 * counting only a unit in the party. An option that does not touch her does not count; with none touching her there is no pick (`null`). A tie goes to the earlier option. Reads only.
 */
export function herOptionPick(state: CampaignState, reg: Registries, holderId: string): number | null {
  const exp = state.expedition;
  const pending = exp?.pending;
  if (exp === undefined || pending?.kind !== 'event' || !exp.party.includes(holderId)) return null;
  const fixed = reg.dilemmaTemplates.get(pending.templateId)?.fixed as { options?: Array<{ effects: Array<{ type: string; event?: string; severity?: string; targets?: string; valueAxes?: Array<{ axis: string; direction: string }> }> }> } | undefined;
  const shown = eventOptions(state, reg);
  let best: { index: number; score: number } | null = null;
  (fixed?.options ?? []).forEach((option, index) => {
    if (shown[index]?.disabled !== null) return;
    let touched = false;
    let score = 0;
    for (const fx of option.effects) {
      if (fx.type !== 'unit_event') continue;
      touched = true;
      const d = computeDeltas(state, reg, holderId, {
        type: fx.event, actor: 'commander', targets: [holderId], severity: fx.severity, evidence: 'her pick', confidence: 1,
        ...(fx.valueAxes ? { valueAxes: fx.valueAxes.map((a) => ({ axis: a.axis as never, direction: a.direction })) } : {}),
      } as never);
      score += d.trust + d.affinity;
    }
    if (touched && (best === null || score > best.score)) best = { index, score };
  });
  return best === null ? null : (best as { index: number }).index;
}

/** How she voted on this vote (`for` or `against`); `for` when she has no ballot or abstained. Reads only. */
export function herBallot(_state: CampaignState, _reg: Registries, holderId: string, vote: Vote): 'for' | 'against' {
  const ballot = vote.ballots.find((b) => b.unitId === holderId);
  return ballot !== undefined && ballot.vote === 'against' ? 'against' : 'for';
}

/** What is open to be asked about: the open dilemma, the open vote (passed or failed) or the pending expedition event, by id; `null` when `ref` is not one of them now. */
export function choiceOpen(state: CampaignState, context: AskedContext, ref: string): boolean {
  if (context === 'dilemma') return state.dilemmas?.open?.id === ref && state.dilemmas.open.status === 'presented';
  if (context === 'vote') {
    const open = state.power?.votes.open;
    return open?.id === ref && (open.status === 'passed' || open.status === 'failed');
  }
  const pending = state.expedition?.pending;
  return state.expedition?.phase === 'event' && pending?.kind === 'event' && pending.nodeId === ref && pending.herCall === undefined && pending.squadCall === undefined && state.dilemmas?.open?.context !== 'expedition_event';
}

/** Her pick on what is open: an option index, `for` / `against` on a vote, or `null` (nothing touches her). Reads only. */
export function herPickFor(state: CampaignState, reg: Registries, holderId: string, context: AskedContext, ref: string): AskedIndex {
  if (context === 'dilemma') return herPick(state, reg, holderId);
  if (context === 'expedition') return herOptionPick(state, reg, holderId);
  const open = state.power?.votes.open;
  return open === undefined || open.id !== ref ? null : herBallot(state, reg, holderId, open);
}

/**
 * `practice/ask_her { context, ref }`: the commander asks the one who holds the commander what she would pick on what is open (R22). Her pick is written on `practices.asked` (`index: null` when nothing touches her;
 * `preselected` when she pre-selects). Throws with no live holder or with a card that is not open. Asking again on the same card answers the same. Draws nothing.
 */
export function askHer(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, context: unknown, ref: unknown): EngineEvent[] {
  const reg = ctx.registries;
  if (context !== 'dilemma' && context !== 'expedition' && context !== 'vote') throw new Error('Ask her about a decision, a vote or an event.');
  if (typeof ref !== 'string' || !choiceOpen(draft, context, ref)) throw new Error('There is nothing open to ask her about.');
  const holderId = herChooser(draft, reg);
  if (holderId === null) throw new Error('Nobody holds the commander now.');
  const index = herPickFor(draft, reg, holderId, context, ref);
  ensurePractices(draft).asked = { context, ref, index, holderId, ...(preselects(draft, reg, holderId) ? { preselected: true as const } : {}) };
  return [{ type: 'her_asked', unitId: holderId, holderId, context, ref, index }];
}

/**
 * The after-action of the choice (registered by `actions/practice.ts`): when what the commander asked her about is decided, the pick is spent. The decision is compared with it: her own pick, or a card
 * she left to the commander, is free; another costs `overrode_her` (moderate) and the Record an override costs, and, when she pre-selected, an offence `countermand_overruled`. A day of obedience
 * (P9c) has its own charge for the same choice: nothing is charged twice. A card that closed without a choice (the day ended, a vote replaced) just drops the pick.
 */
export function askedChoices(draft: CampaignState, ctx: EngineCtx, events: readonly EngineEvent[]): EngineEvent[] {
  const asked = draft.practices?.asked;
  if (asked === undefined) return [];
  let decision: number | 'for' | 'against' | 'gone' | undefined;
  for (const e of events) {
    if (asked.context === 'dilemma' && e.type === 'dilemma_resolved' && e.id === asked.ref && typeof e.option === 'number') decision = e.option;
    else if (asked.context === 'expedition' && e.type === 'expedition_choice' && e.nodeId === asked.ref && e.squadCall !== true && typeof e.option === 'number') decision = e.option;
    else if (asked.context === 'vote' && e.voteId === asked.ref) {
      if (e.type === 'vote_overruled' || (e.type === 'vote_carried' && e.overruled !== true)) decision = 'for';
      else if (e.type === 'vote_dropped') decision = e.reason === 'commander' ? 'against' : 'gone';
    }
  }
  if (decision === undefined) return [];
  delete draft.practices!.asked;
  if (decision === 'gone' || asked.index === null || decision === asked.index) return [];
  const ob = obedienceOf(draft);
  const events2: EngineEvent[] = [];
  if (!(ob?.who === 'commander' && ob.unitId === asked.holderId)) events2.push(...overrideHer(draft, ctx, asked.holderId, 'chose against her pick'));
  if (asked.preselected === true) events2.push(...noteOffence(draft, ctx, asked.holderId, { kind: 'countermand_overruled', ref: asked.ref, stakes: 'minor', day: draft.day }));
  return events2;
}

/** The day end drops a pick whose card is gone (R22): what is not open any more cannot be chosen against her. */
export function expireAsked(draft: CampaignState): void {
  const asked = draft.practices?.asked;
  if (asked !== undefined && !choiceOpen(draft, asked.context, asked.ref)) delete draft.practices!.asked;
}
