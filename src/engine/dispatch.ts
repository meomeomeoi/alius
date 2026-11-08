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
