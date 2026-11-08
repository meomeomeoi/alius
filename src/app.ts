import './engine/actions/debug'; // registers debug/* actions
import './llm/calls/profileImport'; // registers the profile_import call type
import type { ContentError, Registries } from './content/types';
import { emptyRegistries } from './content/types';
import { dispatch as engineDispatch, type Action, type EngineEvent } from './engine/dispatch';
import type { CampaignState } from './engine/state/types';
import { ContextBuilder } from './llm/context';
import { callLlm, type LlmResult } from './llm/orchestrator';
import { getSettings } from './settings';
import type { Lorebook, StAdapter } from './st/adapter';
import { buildCampaign, type SetupResult } from './engine/setup';
import { importProfile } from './setup/profile';
import { Wizard, type WizardState } from './setup/wizard';
import { renderSetupScreen } from './ui/setup/setupScreen';
import { renderOpsPlaceholder, renderSquadTab } from './ui/squad/squadTab';
import {
  createSaver, initCampaign as initCampaignInChat, loadCampaign, writeNewCampaign, METADATA_KEY, type LoadResult,
} from './st/persistence';
import { createShell, type ShellApi } from './ui/shell/shell';

export interface AliusApp {
  start(): Promise<void>;
  current(): { load: LoadResult; state: CampaignState | null };
  /**
   * Applies an action to the open campaign. Callers that await something first (an LLM call)
   * must pass `expectChatId` — the chat the work started in; if the open chat differs the
   * action is dropped with a `chat_changed` error event instead of landing in another campaign.
   */
  dispatch(action: Action, opts?: { expectChatId?: string }): EngineEvent[];
  initCampaign(): Promise<void>;
  pingMechanic(): Promise<LlmResult<{ pong: true; echo: string }>>;
  /** Replaces the whole campaign (state editor, import). Refused for read-only campaigns. */
  replaceState(state: CampaignState): void;
  /** Later packages register context providers and directives here. */
  context: ContextBuilder;
  /** Re-renders the injected context after providers or directives changed. */
  refreshContext(): void;
  shell: ShellApi;
  /** Opens the CCP intake wizard (refused in a read-only campaign chat). */
  openSetup(): void;
  /** Builds the campaign from a finished wizard, creates or binds the group chat and writes the state. */
  deployCampaign(r: SetupResult, target: 'new_group' | 'current_group'): Promise<boolean>;
  /** The open wizard's state, or null when no setup is in progress. */
  setupState(): WizardState | null;
}

export interface AppDeps {
  loadContent: () => Promise<{ registries: Registries; errors: ContentError[]; lorebook?: Lorebook | null }>;
  shellFactory?: typeof createShell;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createApp(st: StAdapter, deps: AppDeps): AliusApp {
  const context = new ContextBuilder();
  let registries: Registries = emptyRegistries();
  let contentErrors: ContentError[] = [];
  let lorebook: Lorebook | null = null; // installed into new campaigns by deployCampaign (P1 Task 8)
  let load: LoadResult = { kind: 'none' };
  let state: CampaignState | null = null;
  let saver: ReturnType<typeof createSaver> | null = null;
  let started = false;
  /** The open intake wizard and the chat it was opened in (the only chat that "bind" may write to). */
  let setup: { wizard: Wizard; chatId: string | null } | null = null;

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

  function endSetup(): void {
    setup?.wizard.dispose();
    setup = null;
  }

  async function deployCampaign(r: SetupResult, target: 'new_group' | 'current_group'): Promise<boolean> {
    const fail = (text: string): false => {
      toast('error', text);
      return false;
    };
    const settings = getSettings(st);

    // 1. build and validate before anything outside Alius is touched
    const built = buildCampaign(r, registries, {
      desireBondDefects: settings.desireBondDefects,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    if (!built.ok) return fail(built.errors[0]);
    const avatars = r.units.map((u) => u.cardRef);

    // 2. the target chat
    let targetChatId: string;
    try {
      if (target === 'current_group') {
        const chat = st.getActiveChat();
        if (!chat || !chat.isGroup) return fail('Open a group chat first.');
        if (setup?.chatId && chat.chatId !== setup.chatId) {
          return fail('The open chat changed since the intake form was opened. Switch back or choose "Create a new group chat".');
        }
        if (st.readMetadata(METADATA_KEY) !== undefined) return fail('This chat already has an Alius campaign.');
        await st.addGroupMembers(avatars);
        targetChatId = chat.chatId;
      } else {
        let groupId: string;
        try {
          groupId = await st.createGroupChat({ name: `Alius: ${r.commanderName.trim()}`, members: avatars });
          if (!(await st.openGroup(groupId))) throw new Error('SillyTavern refused to open it');
        } catch (e) {
          return fail(`Could not open the new group chat: ${errText(e)}`);
        }
        const chat = st.getActiveChat();
        if (!chat || chat.groupId !== groupId) return fail('Could not open the new group chat: it is not the active chat.');
        targetChatId = chat.chatId;
      }

      // 3. exactly the selected cards take part
      await st.setMembersActive(avatars);
    } catch (e) {
      return fail(`Deployment failed: ${errText(e)}`);
    }

    // 4. lorebook: installed unless a lorebook of that name exists (the player may have edited it)
    if (lorebook) {
      try {
        if (!st.listLorebooks().includes(lorebook.name)) await st.saveLorebook(lorebook);
        st.setChatLorebook(lorebook.name);
      } catch (e) {
        toast('warn', `Lorebook not installed: ${errText(e)}`);
      }
    }

    // 5. the campaign itself
    try {
      const written = await writeNewCampaign(st, built.state, targetChatId);
      if (!written.ok) {
        return fail(
          written.reason === 'exists' ? 'This chat already has an Alius campaign.'
          : written.reason === 'chat_changed' ? 'The open chat changed during deployment; nothing was written.'
          : written.reason === 'not_group' ? 'Alius campaigns need a group chat.'
          : 'Open a chat first.',
        );
      }
    } catch (e) {
      return fail(`Could not save the campaign: ${errText(e)}`);
    }

    // 6. land on Day 1
    endSetup();
    reload();
    applyContext();
    shell.showScreen('pda');
    shell.showTab('squad');
    toast('info', 'Deployment confirmed. Day 1, Morning.');
    return true;
  }

  function openSetup(): void {
    if (load.kind === 'readonly') {
      toast('error', 'This chat has unreadable Alius data and is read-only; a new campaign cannot be started here.');
      return;
    }
    if (registries.starts.size === 0 || registries.crimes.size === 0) {
      toast('error', 'Content failed to load; a campaign cannot be started. See SYS > debug.');
      return;
    }
    endSetup();
    const chat = st.getActiveChat();
    const wizard = new Wizard(
      {
        registries,
        desireBondDefects: getSettings(st).desireBondDefects,
        importer: (avatar, sections) => importProfile(avatar, sections, { st, settings: getSettings(st), registries }),
        onChange: () => {},
      },
      { personaName: st.getPersonaName(), canBindCurrent: !!chat?.isGroup && load.kind === 'none' },
    );
    setup = { wizard, chatId: chat?.chatId ?? null };
    shell.registerScreen('setup', (host) => {
      renderSetupScreen(host, {
        wizard,
        registries,
        st,
        modal: (o) => shell.modal(o),
        onCancel: () => {
          if (setup?.wizard === wizard) endSetup();
          shell.showScreen('pda');
        },
        onConfirm: async (r, target) => {
          await deployCampaign(r, target);
        },
      });
    });
    shell.showScreen('setup');
    shell.open();
  }

  const shell = (deps.shellFactory ?? createShell)({
    st,
    getState: () => state,
    getLoad: () => load,
    replaceState,
    getContentErrors: () => contentErrors,
    debugTools,
  });

  shell.registerTab('squad', (host) =>
    renderSquadTab(host, {
      st,
      getState: () => state,
      getLoad: () => load,
      registries,
      settings: () => getSettings(st),
      onNewCampaign: openSetup,
    }),
  );
  shell.registerTab('ops', (host) => renderOpsPlaceholder(host, () => state));

  return {
    context,
    shell,
    refreshContext: applyContext,
    replaceState,
    openSetup,
    deployCampaign,
    setupState: () => setup?.wizard.state ?? null,

    async start() {
      getSettings(st); // normalizes extension settings
      try {
        const r = await deps.loadContent();
        registries = r.registries;
        lorebook = r.lorebook ?? null;
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

    dispatch(action, opts) {
      if (opts?.expectChatId !== undefined && st.getActiveChat()?.chatId !== opts.expectChatId) {
        return [{ type: 'error', code: 'chat_changed', message: 'The open chat changed; the action was dropped.' }];
      }
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
