import type { Registries } from '../content/types';
import type { Action, EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import type { AliusSettings } from '../settings';
import type { Envelope } from '../llm/envelope';
import type { StAdapter } from '../st/adapter';

export type Toast = (kind: 'info' | 'warn' | 'error', text: string) => void;

/** What the world controllers need from the app. They never import the UI and reach ST only through `StAdapter`. */
export interface WorldDeps {
  st: StAdapter;
  app: {
    /** Answers to work that awaited something must pass `expectChatId` (the chat it started in). */
    dispatch(a: Action, o?: { expectChatId?: string }): EngineEvent[];
    current(): { state: CampaignState | null };
  };
  registries: () => Registries;
  settings: () => AliusSettings;
  /** P14: the envelope every model call runs through; a controller binds its sites on creation. */
  generations: Envelope;
  /** P9d: the content exclusion line a prose call appends to its system prompt. */
  contentLine?: () => string;
  toast: Toast;
}
