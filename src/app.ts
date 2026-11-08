import './engine/actions/debug'; // registers debug/* actions
import './engine/actions/squad'; // registers squad/* actions
import './engine/actions/calendar'; // registers calendar/*, activity/* and commander/* actions
import './engine/actions/base'; // registers base/*, roster/* and squad/set_flavor actions
import './llm/calls/profileImport'; // registers the profile_import call type
import { generateVignette } from './llm/calls/activityVignette'; // registers the activity_vignette call type
import { generateGruntFlavor } from './llm/calls/flavor'; // registers the flavor call type
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
import { renderSquadTab } from './ui/squad/squadTab';
import { renderOpsTab } from './ui/ops/opsTab';
import { renderBaseTab } from './ui/base/baseTab';
import type { ActivityRequest } from './engine/activities';
import { RESYNC_SECTIONS, type ResyncPatch, type ResyncSection } from './engine/actions/squad';
import { renderCalibration } from './ui/setup/calibration';
import { h } from './ui/dom';
import { renderKeepingFocus } from './ui/focus';
import {
  createSaver, initCampaign as initCampaignInChat, loadCampaign, writeNewCampaign, METADATA_KEY, type LoadResult,
} from './st/persistence';
import { createShell, type ShellApi } from './ui/shell/shell';
import type { ToastKind } from './ui/shell/toast';

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
  /** Does an activity (OPS tab). Shows the error, or — with a companion and vignettes on — a short generated vignette. */
  performActivity(req: ActivityRequest): Promise<EngineEvent[]>;
  /** Recruits a grunt (BASE tab) and, if enabled, asks for a generated name and bio. */
  recruitGrunt(): Promise<EngineEvent[]>;
  upgradeFacility(facilityId: string): EngineEvent[];
  /** Credits → supplies. */
  requisition(supplies: number): EngineEvent[];
  setRoster(activeIds: string[]): EngineEvent[];
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
  let setup: { wizard: Wizard; chatId: string | null; createdGroupId?: string } | null = null;

  const toast = (kind: ToastKind, text: string) => shell.toast(kind, text);

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

  /** One deployment at a time: a second click or call must not create a second group and campaign. */
  let deploying = false;
  async function deployCampaign(r: SetupResult, target: 'new_group' | 'current_group'): Promise<boolean> {
    if (deploying) {
      toast('error', 'A deployment is already running.');
      return false;
    }
    deploying = true;
    try {
      return await deployOnce(r, target);
    } finally {
      deploying = false;
    }
  }

  /** The key the adapter's setChatLorebook writes; restored if the deployment fails after binding. */
  const WORLD_INFO_KEY = 'world_info';

  async function deployOnce(r: SetupResult, target: 'new_group' | 'current_group'): Promise<boolean> {
    const fail = (text: string): false => {
      toast('error', text);
      return false;
    };
    // the rule the form was filled in under (the wizard pins it when it opens), not whatever SYS says now
    const desireBondDefects = setup?.wizard.desireBondDefects ?? getSettings(st).desireBondDefects;

    // 1. build and validate before anything outside Alius is touched
    const built = buildCampaign(r, registries, {
      desireBondDefects,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    if (!built.ok) return fail(built.errors[0]);
    const avatars = r.units.map((u) => u.cardRef);

    // 2. the target chat
    let targetChatId: string;
    const activeBefore = target === 'current_group' ? st.getGroupMembers().filter((m) => m.active).map((m) => m.avatar) : null;
    /** Best effort: put the group's active/inactive flags back if the deployment fails afterwards. */
    const restoreMembers = async () => {
      if (!activeBefore || st.getActiveChat()?.chatId !== targetChatId) return;
      try {
        await st.setMembersActive(activeBefore);
      } catch (e) {
        console.warn('[Alius] could not restore group members', e);
      }
    };
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
        let groupId: string | undefined = setup?.createdGroupId;
        try {
          let opened = false;
          if (groupId) {
            // a retry after a failure: use the group made last time instead of creating another
            opened = await st.openGroup(groupId).catch(() => false);
            if (opened) await st.addGroupMembers(avatars);
            else groupId = undefined;
          }
          if (!groupId) {
            groupId = await st.createGroupChat({ name: `Alius: ${r.commanderName.trim()}`, members: avatars });
            if (setup) setup.createdGroupId = groupId;
            opened = await st.openGroup(groupId);
          }
          if (!opened) throw new Error('SillyTavern refused to open it');
        } catch (e) {
          return fail(`Could not open the new group chat: ${errText(e)}`);
        }
        const chat = st.getActiveChat();
        if (!chat || chat.groupId !== groupId) return fail('Could not open the new group chat: it is not the active chat.');
        targetChatId = chat.chatId;
      }

      // 3. exactly the selected cards take part (in the target chat only)
      if (st.getActiveChat()?.chatId !== targetChatId) return fail('The open chat changed during deployment; nothing was written.');
      await st.setMembersActive(avatars);
    } catch (e) {
      return fail(`Deployment failed: ${errText(e)}`);
    }

    // 4. lorebook: installed unless a lorebook of that name exists (the player may have edited it)
    let bound = false;
    let previousLore: unknown;
    const restoreLorebook = () => {
      if (bound && st.getActiveChat()?.chatId === targetChatId) st.writeMetadata(WORLD_INFO_KEY, previousLore);
    };
    if (lorebook) {
      try {
        if (!st.listLorebooks().includes(lorebook.name)) await st.saveLorebook(lorebook);
        // never bind into another chat if the player switched while the lorebook was saved
        if (st.getActiveChat()?.chatId === targetChatId) {
          previousLore = st.readMetadata(WORLD_INFO_KEY);
          st.setChatLorebook(lorebook.name);
          bound = true;
        }
      } catch (e) {
        toast('warn', `Lorebook not installed: ${errText(e)}`);
      }
    }

    // 5. the campaign itself
    try {
      const written = await writeNewCampaign(st, built.state, targetChatId);
      if (!written.ok) {
        restoreLorebook();
        await restoreMembers();
        return fail(
          written.reason === 'exists' ? 'This chat already has an Alius campaign.'
          : written.reason === 'chat_changed' ? 'The open chat changed during deployment; nothing was written.'
          : written.reason === 'not_group' ? 'Alius campaigns need a group chat.'
          : 'Open a chat first.',
        );
      }
    } catch (e) {
      restoreLorebook();
      await restoreMembers();
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

  const RESYNC_LABELS: Record<ResyncSection, string> = {
    role: 'Role (stats and HP are reset if it changes)',
    values: 'Values',
    tags: 'Likes, dislikes and triggers',
    signature: 'Signature skill',
    defects: 'Defects',
  };

  /** Re-imports chosen sections from the unit's card and applies the player's choices via squad/resync. */
  async function resyncUnit(unitId: string): Promise<void> {
    const unit = state?.squad.find((u) => u.id === unitId);
    if (!state || !unit?.cardRef) return;
    const startChatId = st.getActiveChat()?.chatId;
    const desireBond = state.settings.desireBondDefects === true;

    // 1. which sections
    const boxes = RESYNC_SECTIONS.map((s) => h('input', { type: 'checkbox', 'data-section': s, checked: true }) as HTMLInputElement);
    const picker = await shell.modal({
      title: 'Re-sync from card',
      body: h('div', {},
        h('p', {}, 'Choose what to re-import from the character card. Relationship numbers are never changed.'),
        ...RESYNC_SECTIONS.map((s, i) => h('label', { class: 'alius-check' }, boxes[i], ` ${RESYNC_LABELS[s]}`))),
      actions: [{ label: 'Import', value: 'go' }, { label: 'Cancel', value: 'cancel' }],
    });
    if (picker !== 'go') return;
    const sections = RESYNC_SECTIONS.filter((_, i) => boxes[i].checked);
    if (sections.length === 0) return toast('warn', 'Choose at least one section to re-sync.');

    // 2. a one-unit wizard does the import and the preselection; it starts from the unit's current profile
    const wizard = new Wizard(
      {
        registries,
        desireBondDefects: desireBond,
        // the first call imports every re-sync section, a "regenerate" asks for one
        importer: (avatar, wanted) =>
          importProfile(avatar, wanted.length > 1 ? [...sections] : wanted, {
            st, settings: { ...getSettings(st), desireBondDefects: desireBond }, registries,
          }),
        onChange: () => {},
      },
      { personaName: '', canBindCurrent: false },
    );
    wizard.toggleUnit({ avatar: unit.cardRef, name: unit.displayName });
    wizard.update(0, {
      roleId: unit.roleId,
      signature: { ...unit.signatureSkill },
      defects: unit.defects.map((d) => ({ id: d.id, origin: d.origin ?? '' })),
      secondDefect: unit.defects.length > 1,
      values: { ...unit.values },
      likes: [...unit.likes],
      dislikes: [...unit.dislikes],
      triggers: [...unit.triggers],
    });
    wizard.calibrate(0);

    // 3. the player reviews the candidates
    const body = h('div', { class: 'alius-calibration' });
    const draw = () =>
      renderCalibration(body, {
        draft: wizard.state.units[0],
        registries,
        desireBondDefects: desireBond,
        sections: [...sections],
        onUpdate: (p) => wizard.update(0, p),
        onRegenerate: (s) => wizard.regenerate(0, s),
        onManual: () => wizard.setManual(0),
      });
    wizard.subscribe(() => renderKeepingFocus(body, draw));
    draw();
    const answer = await shell.modal({
      title: `Re-sync ${unit.displayName}`,
      body,
      actions: [{ label: 'Apply', value: 'apply' }, { label: 'Cancel', value: 'cancel' }],
    });
    const draft = wizard.state.units[0];
    wizard.dispose();
    if (answer !== 'apply') return;
    if (draft.status === 'loading') return toast('warn', 'The import is still running; wait for it to finish.');

    // 4. apply, in the chat the flow started in
    const c = draft.choice;
    const patch: ResyncPatch = {};
    if (sections.includes('role') && c.roleId) patch.roleId = c.roleId;
    if (sections.includes('values')) patch.values = c.values;
    if (sections.includes('tags')) Object.assign(patch, { likes: c.likes, dislikes: c.dislikes, triggers: c.triggers });
    if (sections.includes('signature') && c.signature) patch.signature = c.signature;
    if (sections.includes('defects')) patch.defects = c.defects;
    const current: ResyncPatch = {
      roleId: unit.roleId, values: unit.values, likes: unit.likes, dislikes: unit.dislikes, triggers: unit.triggers,
      signature: unit.signatureSkill, defects: unit.defects.map((d) => ({ id: d.id, origin: d.origin ?? '' })),
    };
    const unchanged = (Object.keys(patch) as Array<keyof ResyncPatch>).every(
      (k) => JSON.stringify(patch[k]) === JSON.stringify(current[k]),
    );
    if (unchanged) return toast('info', `Nothing changed${draft.notice ? ` (${draft.notice})` : ''}.`);
    const events = api.dispatch({ type: 'squad/resync', payload: { unitId, patch } }, { expectChatId: startChatId });
    const failed = events.find((e) => e.type === 'error');
    if (failed) toast('error', String(failed.message ?? failed.code));
    else toast('info', `${unit.displayName} re-synced from the card.`);
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
    const desireBond = getSettings(st).desireBondDefects; // pinned for the whole form
    const wizard = new Wizard(
      {
        registries,
        desireBondDefects: desireBond,
        importer: (avatar, sections) =>
          importProfile(avatar, sections, { st, settings: { ...getSettings(st), desireBondDefects: desireBond }, registries }),
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

  /** Toasts for what happened while the day ran; errors are the caller's to report. */
  function reportEvents(events: EngineEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'supply_shortage':
          toast('warn', `Supply shortage: ${String(e.missing)} short. Stress and affinity suffer.`);
          break;
        case 'trust_penalty_event':
          toast('warn', `${String(e.streak)} days of shortage: trust in the commander drops.`);
          break;
        case 'facility_upgraded':
          toast('info', `${String(registries.facilities.get(String(e.facilityId))?.name ?? e.facilityId)} upgraded to level ${String(e.level)}.`);
          break;
        case 'unit_recovered':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} has recovered.`);
          break;
        case 'scene_requested':
          toast('info', 'Scenes are not available yet; conversations arrive with a later update.');
          break;
        case 'day_started':
          toast('info', `Day ${String(e.day)}.`);
          break;
      }
    }
  }

  /** Dispatches in the chat that is open now and shows the first error, if any. */
  function act(action: Action): EngineEvent[] {
    const events = api.dispatch(action, { expectChatId: st.getActiveChat()?.chatId });
    const failed = events.find((e) => e.type === 'error');
    if (failed) toast('error', String(failed.message ?? failed.code));
    return events;
  }

  const SHORT_NAME = (reg: Registries, registry: 'roles' | 'defects', id: string): string => String(reg[registry].get(id)?.name ?? id);

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
      onResync: (id) => void resyncUnit(id),
    }),
  );
  shell.registerTab('ops', (host) =>
    renderOpsTab(host, {
      getState: () => state,
      getLoad: () => load,
      registries,
      onDo: (req) => void api.performActivity(req),
      onRequisition: (n) => api.requisition(n),
    }),
  );
  shell.registerTab('base', (host) =>
    renderBaseTab(host, {
      getState: () => state,
      getLoad: () => load,
      registries,
      onUpgrade: (id) => api.upgradeFacility(id),
      onRecruit: () => void api.recruitGrunt(),
      onSetRoster: (ids) => api.setRoster(ids),
    }),
  );

  const api: AliusApp = {
    context,
    shell,
    refreshContext: applyContext,
    replaceState,
    openSetup,
    deployCampaign,
    setupState: () => setup?.wizard.state ?? null,

    async performActivity(req) {
      const chatId = st.getActiveChat()?.chatId;
      const events = act({ type: 'activity/do', payload: req });
      const done = events.find((e) => e.type === 'activity_done');
      const settings = getSettings(st);
      if (done?.vignette !== true || !settings.activityFlavor || !state) return events;
      const unit = state.squad.find((u) => u.id === done.companionId);
      const activity = registries.activities.get(String(done.activityId));
      if (!unit || !activity) return events;
      const text = await generateVignette(
        {
          activityName: String(activity.name),
          commanderName: state.commander.name,
          unitName: unit.displayName,
          unitRole: SHORT_NAME(registries, 'roles', unit.roleId),
          likes: unit.likes,
          defectNames: unit.defects.map((d) => SHORT_NAME(registries, 'defects', d.id)),
        },
        { st, settings },
      );
      // the commander may have switched chats while the model was writing
      if (text && st.getActiveChat()?.chatId === chatId) toast('story', text);
      return events;
    },

    async recruitGrunt() {
      const chatId = st.getActiveChat()?.chatId;
      const events = act({ type: 'base/recruit_grunt', payload: {} });
      const recruited = events.find((e) => e.type === 'grunt_recruited');
      const settings = getSettings(st);
      if (!recruited || !settings.gruntFlavor || !state) return events;
      const unit = state.squad.find((u) => u.id === recruited.unitId);
      if (!unit) return events;
      const flavor = await generateGruntFlavor(
        {
          kind: 'grunt',
          designation: unit.designation ?? unit.displayName,
          roleName: SHORT_NAME(registries, 'roles', unit.roleId),
          defectName: SHORT_NAME(registries, 'defects', unit.defects[0]?.id ?? ''),
        },
        { st, settings },
      );
      if (flavor) {
        // cosmetic: if the chat changed or the engine refuses, the grunt simply keeps its designation
        const r = api.dispatch({ type: 'squad/set_flavor', payload: { unitId: unit.id, ...flavor } }, { expectChatId: chatId });
        if (!r.some((e) => e.type === 'error')) toast('info', `${unit.designation ?? unit.id} goes by ${flavor.name}.`);
      }
      return events;
    },

    upgradeFacility(facilityId) {
      const events = act({ type: 'base/upgrade', payload: { facilityId } });
      const started = events.find((e) => e.type === 'upgrade_started');
      if (started) {
        toast('info', `${String(registries.facilities.get(facilityId)?.name ?? facilityId)}: upgrade started (${String(started.days)} days).`);
      }
      return events;
    },

    requisition(supplies) {
      const events = act({ type: 'base/requisition', payload: { supplies } });
      const done = events.find((e) => e.type === 'requisitioned');
      if (done) toast('info', `Requisitioned ${String(done.supplies)} supplies for ${String(done.credits)} credits.`);
      return events;
    },

    setRoster: (activeIds) => act({ type: 'roster/set_active', payload: { activeIds } }),

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
        // the day-end pipeline asks for a save: do not wait for the debounce
        if (r.events.some((e) => e.type === 'autosave')) void saver?.flush().catch((e) => console.warn('[Alius] autosave failed', e));
      }
      reportEvents(r.events);
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
  return api;
}
