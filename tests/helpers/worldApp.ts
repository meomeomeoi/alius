import { vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { canAutoResolve } from '../../src/engine/combat';
import { dispatch, type Action, type EngineEvent } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import type { StartPayload } from '../../src/engine/combat/types';
import type { WorldDeps } from '../../src/world/directorController';
import './world';

export interface WorldHarness {
  st: FakeStAdapter;
  deps: WorldDeps;
  log: Action[];
  toasts: Array<{ kind: string; text: string }>;
  state(): CampaignState;
  setState(f: (s: CampaignState) => void): void;
  settings: AliusSettings;
  startCombat: ReturnType<typeof vi.fn>;
  startScene: ReturnType<typeof vi.fn>;
  switchChat(id: string): void;
  app(): WorldDeps['app'];
}

/** A tiny stand-in for the app: it runs the real engine, refuses answers meant for another chat, and logs every action. */
export function worldHarness(reg: Registries, initial: CampaignState, over: Partial<AliusSettings> = {}): WorldHarness {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  let state = structuredClone(initial);
  const log: Action[] = [];
  const toasts: Array<{ kind: string; text: string }> = [];
  const settings: AliusSettings = { ...DEFAULT_SETTINGS, ...over };
  const app = {
    dispatch(a: Action, o?: { expectChatId?: string }): EngineEvent[] {
      if (o?.expectChatId !== undefined && o.expectChatId !== st.getActiveChat()?.chatId) {
        return [{ type: 'error', code: 'chat_changed', message: 'The chat changed.' }];
      }
      log.push(a);
      const r = dispatch(state, a, reg);
      state = r.state;
      return r.events;
    },
    current: () => ({ state }),
  };
  const startCombat = vi.fn((p: StartPayload): boolean => {
    const events = app.dispatch({ type: 'combat/start', payload: { ...p, allowRetry: false } });
    return !events.some((e) => e.type === 'error');
  });
  const startScene = vi.fn(async (_o: unknown): Promise<boolean> => true);
  const deps: WorldDeps = {
    st, app, registries: () => reg, settings: () => settings,
    toast: (kind, text) => { toasts.push({ kind, text }); },
  };
  return {
    st, deps, log, toasts, settings, startCombat, startScene,
    state: () => state,
    setState: (f) => { const s = structuredClone(state); f(s); state = s; },
    app: () => app,
    switchChat: (id) => { st.chat = { chatId: id, isGroup: true, groupId: 'g' }; },
  };
}

export { canAutoResolve };
