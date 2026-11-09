import type { Registries } from '../content/types';
import { Rng } from './rng';
import type { CampaignState } from './state/types';

export type Action = { type: string; payload?: unknown };
export type EngineEvent = { type: string; [k: string]: unknown };

export interface EngineCtx {
  registries: Registries;
  rng: Rng;
}

/** Mutates `draft` (a private clone) and returns the events it produced. */
export type Handler = (draft: CampaignState, payload: unknown, ctx: EngineCtx) => EngineEvent[];

const handlers = new Map<string, Handler>();

/** Action families that may run while `state.expedition` is open. */
const EXPEDITION_OPEN_PREFIXES = ['expedition/', 'combat/', 'director/', 'debug/'];

export function registerAction(type: string, handler: Handler): void {
  if (handlers.has(type)) throw new Error(`Duplicate action type: ${type}`);
  handlers.set(type, handler);
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
  // while a combat is open only combat/* (and debug/*) may run: anything else would change what a retry rebuilds
  if (state.combat && !action.type.startsWith('combat/') && !action.type.startsWith('debug/')) {
    return { state, events: [{ type: 'error', code: 'combat_open', message: 'A combat is open: finish it first.' }] };
  }
  // an open expedition confines the campaign: its slots are spent once, on return (P5)
  if (state.expedition && !EXPEDITION_OPEN_PREFIXES.some((p) => action.type.startsWith(p))) {
    return {
      state,
      events: [{ type: 'error', code: 'expedition_open', message: 'An expedition is under way: finish or abandon it first.' }],
    };
  }
  const draft = structuredClone(state);
  const rng = new Rng(draft.rng);
  try {
    const events = handler(draft, action.payload, { registries, rng });
    draft.rng = rng.state;
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
