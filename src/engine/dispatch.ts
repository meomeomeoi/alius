import type { Registries } from '../content/types';
import { recordLedger } from './ledger';
import { rememberEvents } from './memory/remember';
import { bookingGuard } from './personal/bookings';
import { votingOn } from './power/options';
import { carryVote, voteFor } from './power/votes';
import { Rng } from './rng';
import { wardenArgueStart } from './warden/state';
import type { CampaignState, VoteKind } from './state/types';

export type Action = { type: string; payload?: unknown };
export type EngineEvent = { type: string; [k: string]: unknown };

export interface EngineCtx {
  registries: Registries;
  rng: Rng;
}

/** Mutates `draft` (a private clone) and returns the events it produced. */
export type Handler = (draft: CampaignState, payload: unknown, ctx: EngineCtx) => EngineEvent[];

const handlers = new Map<string, Handler>();

/** P11: dismissing a coach hint touches nothing but `onboarding.hintsSeen`, so it may run while a combat or an expedition is open. */
const ONBOARDING_HINT = 'onboarding/hint_seen';

/** Action families that may run while `state.expedition` is open. */
/** `relations/commander_injured` is the night-visit roll after a Commander Crisis, which can only happen inside a run. */
/** P10b: reading a note and choosing a hand (P10c: and her room style) (`notes/read`, `squad/set_hand`) change nothing but the note and the hand, and HOME is the default tab while the squad is out. */
const EXPEDITION_OPEN_PREFIXES = ['expedition/', 'combat/', 'director/', 'debug/', 'dilemma/', 'relations/commander_injured', ONBOARDING_HINT, 'content/', 'notes/read', 'squad/set_hand', 'squad/set_quarters'];

/** Actions that spend time or start something: refused while a presented dilemma waits for its answer (P6). */
/** P13: a closed campaign (`ended`) runs only these: `debug/*` and the epilogue. P14: a failed generation can be recorded, closed or expired on a closed campaign (the epilogue's own call). */
const ENDED_OK_PREFIXES = ['debug/', 'campaign/epilogue', 'generation/'];
/** P13: allowed while a combat or an expedition is open (the death that closes the campaign, and its epilogue, must always be able to run). */
const ALWAYS_OPEN = ['warden/no_snapshot', 'campaign/epilogue', 'warden/answer', 'generation/failed', 'generation/close', 'generation/expire'];
const BLOCKED_BY_DILEMMA = ['activity/', 'calendar/consume_slot', 'scene/start', 'expedition/start', 'intrigue/act'];

/** P13: runs another action's handler on the same draft (the warden's COMPLY and DEFY re-run the order that was overridden). Throws when the action is unknown. */
export function runHandler(type: string, draft: CampaignState, payload: unknown, ctx: EngineCtx): EngineEvent[] {
  const handler = handlers.get(type);
  if (!handler) throw new Error(`Unknown action ${type}`);
  return handler(draft, payload, ctx);
}

export function registerAction(type: string, handler: Handler): void {
  if (handlers.has(type)) throw new Error(`Duplicate action type: ${type}`);
  handlers.set(type, handler);
}

/** P9b: what a gated action decides, for the squad vote it needs (`null`: this call is not a votable decision). */
export type VoteGate = (state: CampaignState, payload: unknown, reg: Registries) => { kind: VoteKind; subject: string } | null;
const gates = new Map<string, VoteGate>();

/** P9b: while voting is on, an action with a gate that matches is refused (`vote_needed`) until its payload names a usable vote. */
export function registerVoteGate(actionType: string, gate: VoteGate): void {
  if (gates.has(actionType)) throw new Error(`Duplicate vote gate: ${actionType}`);
  gates.set(actionType, gate);
}

/**
 * Pure reducer: never mutates `state`. On unknown action or handler failure the
 * original state is returned together with an `error` event.
 */
export function dispatch(
  state: CampaignState,
  action: Action,
  registries: Registries,
): { state: CampaignState; events: EngineEvent[] } {
  const handler = handlers.get(action.type);
  if (!handler) {
    return { state, events: [{ type: 'error', code: 'unknown_action', action: action.type }] };
  }
  // P13: a closed campaign is read-only
  if (state.ended && !ENDED_OK_PREFIXES.some((p) => action.type.startsWith(p))) {
    return { state, events: [{ type: 'error', code: 'campaign_ended', message: 'The campaign is closed.' }] };
  }
  // while a combat is open only combat/* (and debug/*) may run: anything else would change what a retry rebuilds
  if (state.combat && !action.type.startsWith('combat/') && !action.type.startsWith('debug/') && action.type !== ONBOARDING_HINT && !ALWAYS_OPEN.includes(action.type)) {
    return { state, events: [{ type: 'error', code: 'combat_open', message: 'A combat is open: finish it first.' }] };
  }
  // an open expedition confines the campaign: its slots are spent once, on return (P5)
  if (state.expedition && !EXPEDITION_OPEN_PREFIXES.some((p) => action.type.startsWith(p)) && !ALWAYS_OPEN.includes(action.type)) {
    return {
      state,
      events: [{ type: 'error', code: 'expedition_open', message: 'An expedition is under way: finish or abandon it first.' }],
    };
  }
  if (state.dilemmas?.open?.status === 'presented' && BLOCKED_BY_DILEMMA.some((p) => action.type.startsWith(p)) && !wardenArgueStart(state, action)) {
    return { state, events: [{ type: 'error', code: 'dilemma_open', message: 'A decision is waiting: answer it first.' }] };
  }
  // P9c: a slot she booked and can keep is hers: go to her or cancel the booking
  const booked = bookingGuard(state, action);
  if (booked) return { state, events: [{ type: 'error', ...booked }] };
  // P9b: a decision the squad votes on does not run without a passed or overruled vote for exactly this decision
  let voteId: string | undefined;
  const gate = gates.get(action.type);
  if (gate && votingOn(state, registries)) {
    const decision = gate(state, action.payload, registries);
    if (decision) {
      const named = (action.payload as { voteId?: unknown } | null | undefined)?.voteId;
      if (!voteFor(state, decision.kind, decision.subject, named)) {
        // a refusal the action would give anyway comes first: no vote (and no overrule) should be paid for an action that cannot run
        try {
          handler(structuredClone(state), action.payload, { registries, rng: new Rng(state.rng) });
        } catch (e) {
          return { state, events: [{ type: 'error', code: 'handler_failed', message: e instanceof Error ? e.message : String(e) }] };
        }
        return { state, events: [{ type: 'error', code: 'vote_needed', kind: decision.kind, subject: decision.subject }] };
      }
      voteId = named as string;
    }
  }
  const draft = structuredClone(state);
  const rng = new Rng(draft.rng);
  try {
    const events = handler(draft, action.payload, { registries, rng });
    if (voteId !== undefined) events.push(...carryVote(draft, voteId, { registries })); // the vote is spent once, in the same state
    draft.rng = rng.state;
    try {
      rememberEvents(draft, events, registries); // P3b: engine events become facts; memory never fails a valid action
    } catch {
      // a rule that cannot be applied costs only its own fact
    }
    try {
      recordLedger(state, draft, action.type);
    } catch {
      // the ledger is a convenience for readings: a state it cannot read must never fail a valid action
    }
    return { state: draft, events };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { state, events: [{ type: 'error', code: 'handler_failed', message }] };
  }
}

export function snapshot(state: CampaignState): string {
  return JSON.stringify(state);
}

export function restore(snap: string): CampaignState {
  return JSON.parse(snap) as CampaignState;
}
