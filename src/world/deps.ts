import type { Registries } from '../content/types';
import type { Action, EngineEvent } from '../engine/dispatch';
import type { CampaignState } from '../engine/state/types';
import type { AliusSettings } from '../settings';
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
  toast: Toast;
}
