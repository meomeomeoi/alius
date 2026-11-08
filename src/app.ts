import './engine/actions/debug'; // registers debug/* actions
import type { ContentError, Registries } from './content/types';
import { emptyRegistries } from './content/types';
import { dispatch as engineDispatch, type Action, type EngineEvent } from './engine/dispatch';
import type { CampaignState } from './engine/state/types';
import { ContextBuilder } from './llm/context';
import { callLlm, type LlmResult } from './llm/orchestrator';
import { getSettings } from './settings';
import type { StAdapter } from './st/adapter';
import {
  createSaver, initCampaign as initCampaignInChat, loadCampaign, type LoadResult,
} from './st/persistence';
import { createShell, type ShellApi } from './ui/shell/shell';

export interface AliusApp {
  start(): Promise<void>;
  current(): { load: LoadResult; state: CampaignState | null };
  dispatch(action: Action): EngineEvent[];
  initCampaign(): Promise<void>;
  pingMechanic(): Promise<LlmResult<{ pong: true; echo: string }>>;
  /** Replaces the whole campaign (state editor, import). Refused for read-only campaigns. */
  replaceState(state: CampaignState): void;
  /** Later packages register context providers and directives here. */
  context: ContextBuilder;
  /** Re-renders the injected context after providers or directives changed. */
  refreshContext(): void;
  shell: ShellApi;
}

export interface AppDeps {
  loadContent: () => Promise<{ registries: Registries; errors: ContentError[] }>;
  shellFactory?: typeof createShell;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createApp(st: StAdapter, deps: AppDeps): AliusApp {
  const context = new ContextBuilder();
  let registries: Registries = emptyRegistries();
  let contentErrors: ContentError[] = [];
  let load: LoadResult = { kind: 'none' };
  let state: CampaignState | null = null;
  let saver: ReturnType<typeof createSaver> | null = null;
  let started = false;

  const toast = (kind: 'info' | 'warn' | 'error', text: string) => shell.toast(kind, text);

  function applyContext(): void {
    context.apply(st, state, getSettings(st).contextTokenCap);
  }

  /** Re-reads the campaign of the open chat. */
  function reload(): void {
    saver?.dispose();
    saver = null;
    load = loadCampaign(st);
    state = load.kind === 'ok' ? load.state : null;
    if (load.kind === 'ok') saver = createSaver(st, load.chatId);
    if (load.kind === 'readonly') toast('warn', `Alius campaign in this chat is read-only: ${load.reason}`);
  }

  function replaceState(next: CampaignState): void {
    const chat = st.getActiveChat();
    if (!chat) return toast('warn', 'Open a chat first.');
    if (!chat.isGroup) return toast('warn', 'Alius campaigns need a group chat.');
    if (load.kind === 'readonly') return toast('error', 'This campaign is read-only; it cannot be replaced.');
    if (load.kind !== 'ok' || load.chatId !== chat.chatId) {
      saver?.dispose();
      saver = createSaver(st, chat.chatId);
    }
    load = { kind: 'ok', state: next, chatId: chat.chatId };
    state = next;
    saver!.save(next);
    void saver!.flush();
    applyContext();
    shell.refresh();
  }

  const TEST_DIRECTIVE = { id: 'debug_test', text: 'TEST DIRECTIVE: this line must appear in the prompt.', expiresAfter: 'manual' } as const;
  const debugTools = [
    { label: 'Set test directive', run: () => { context.setDirective(TEST_DIRECTIVE); applyContext(); } },
    { label: 'Clear test directive', run: () => { context.clearDirective(TEST_DIRECTIVE.id); applyContext(); } },
    { label: 'Clear all injections', run: () => context.apply(st, null, 0) },
  ];

  const shell = (deps.shellFactory ?? createShell)({
    st,
    getState: () => state,
    getLoad: () => load,
    replaceState,
    getContentErrors: () => contentErrors,
    debugTools,
  });

  return {
    context,
    shell,
    refreshContext: applyContext,
    replaceState,

    async start() {
      getSettings(st); // normalizes extension settings
      try {
        const r = await deps.loadContent();
        registries = r.registries;
        contentErrors = r.errors;
      } catch (e) {
        contentErrors = [{ pack: '(loader)', file: '', path: '', message: errText(e) }];
      }
      if (contentErrors.length > 0) {
        for (const e of contentErrors) console.warn(`[Alius] content: ${e.pack} ${e.file} ${e.path} — ${e.message}`);
        toast('warn', `Content: ${contentErrors.length} error(s) — see SYS › debug`);
      }

      reload();
      applyContext();

      if (!started) {
        started = true;
        st.on('chat_changed', () => {
          reload();
          applyContext();
          shell.refresh();
        });
        st.on('message_received', () => {
          context.onReplyReceived();
          applyContext();
        });
      }
    },

    current: () => ({ load, state }),

    dispatch(action) {
      if (!state) {
        return load.kind === 'readonly'
          ? [{ type: 'error', code: 'read_only', message: 'Campaign is read-only.' }]
          : [{ type: 'error', code: 'no_campaign', message: 'No Alius campaign in this chat.' }];
      }
      const r = engineDispatch(state, action, registries);
      if (r.state !== state) {
        state = r.state;
        saver?.save(state);
      }
      applyContext();
      shell.refresh();
      return r.events;
    },

    async initCampaign() {
      const r = initCampaignInChat(st, { seed: Math.floor(Math.random() * 2 ** 31), commanderName: 'Commander' });
      if (!r.ok) {
        if (r.reason === 'not_group') toast('warn', 'Alius campaigns need a group chat.');
        else if (r.reason === 'no_chat') toast('warn', 'Open a chat first.');
        else if (load.kind === 'readonly') toast('error', 'This chat has unreadable Alius data and is read-only; nothing was changed.');
        else toast('info', 'This chat already has an Alius campaign.');
        return;
      }
      reload();
      applyContext();
      shell.refresh();
      toast('info', 'Alius campaign initialized.');
    },

    async pingMechanic() {
      const r = await callLlm<{ pong: true; echo: string }>('ping', 'alius', { st, settings: getSettings(st) });
      if (r.ok) toast('info', `pong: ${r.value.echo}`);
      else toast('error', `Ping failed: ${r.reason} — ${r.detail}`);
      return r;
    },
  };
}
