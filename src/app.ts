import './engine/actions/debug'; // registers debug/* actions
import './engine/actions/squad'; // registers squad/* actions
import './engine/actions/calendar'; // registers calendar/*, activity/* and commander/* actions
import './engine/actions/base'; // registers base/*, roster/* and squad/set_flavor actions
import './engine/actions/scene'; // registers scene/*, intents/*, proposal/*, memory/* actions and the P3 relation accounting
import './engine/actions/comms'; // registers dm/*, night/* actions and the defect social hooks
import './engine/actions/combat'; // registers combat/* and campaign/set_difficulty actions
import './engine/actions/progression'; // registers squad/unlock_node, respec, set_loadout, release_breakdowns and the level-up hook
import './engine/actions/world'; // registers world/* actions
import './engine/actions/expedition'; // registers expedition/* actions
import './engine/actions/items'; // registers item/* actions and the workshop hook
import './llm/calls/profileImport'; // registers the profile_import call type
import { generateVignette } from './llm/calls/activityVignette'; // registers the activity_vignette call type
import { generateEnemyFlavor, generateGruntFlavor } from './llm/calls/flavor'; // registers the flavor call type
import type { ContentError, Registries } from './content/types';
import { emptyRegistries } from './content/types';
import { dispatch as engineDispatch, type Action, type EngineEvent } from './engine/dispatch';
import type { CampaignState } from './engine/state/types';
import { unreadCount } from './engine/dms';
import { intimacyOf } from './engine/relations/gain';
import { activeRosterUnits } from './engine/economy';
import { generateEncounter } from './engine/combat/encounter';
import { defaultFormation, squadPower } from './engine/combat/stats';
import type { StartPayload } from './engine/combat/types';
import { Rng } from './engine/rng';
import { renderCombatScreen, type CombatScreen } from './ui/combat/combatScreen';
import { renderInvTab } from './ui/inv/invTab';
import { ContextBuilder } from './llm/context';
import { runCompaction } from './scene/chronicle';
import { createComms, type Comms } from './scene/comms';
import { clearSceneDirectives, registerSceneContext } from './scene/context';
import { createSceneController, type SceneController, type SceneUiEvent, type StartOptions } from './scene/sceneController';
import { callLlm, type LlmResult } from './llm/orchestrator';
import { getSettings } from './settings';
import type { Lorebook, StAdapter } from './st/adapter';
import { buildCampaign, type SetupResult } from './engine/setup';
import { importProfile } from './setup/profile';
import { Wizard, type WizardState } from './setup/wizard';
import { renderSetupScreen } from './ui/setup/setupScreen';
import { renderSquadTab } from './ui/squad/squadTab';
import { renderOpsTab } from './ui/ops/opsTab';
import { renderMapTab } from './ui/map/mapTab';
import { renderExpeditionScreen, type ExpeditionScreen } from './ui/expedition/expeditionScreen';
import './llm/calls/directorTick'; // registers the director_tick call type
import './llm/calls/expeditionRecap'; // registers the expedition_recap call type
import { registerWorldContext } from './world/context';
import { createDirector, type DirectorController } from './world/directorController';
import { createExpedition, type ExpeditionController } from './world/expeditionController';
import { renderBaseTab } from './ui/base/baseTab';
import { renderCommsTab } from './ui/comms/commsTab';
import { renderLogTab } from './ui/log/logTab';
import { renderKnock } from './ui/night/knock';
import { pickLocation } from './ui/scene/locationPicker';
import { renderSceneScreen, type SceneScreen } from './ui/scene/sceneScreen';
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
  /**
   * Puts `snap` back as the campaign, but only while the current state is still `expectedCurrent` (nothing else
   * happened since). Used to undo the extraction of a swiped reply. Returns whether it replaced the state.
   */
  restoreSnapshot(snap: CampaignState, expectedCurrent: CampaignState): boolean;
  /** Starts a scene (P5 debriefs and events use this): dispatches `scene/start`, activates the members, shows the scene screen. */
  startScene(opts: StartOptions): Promise<boolean>;
  /**
   * Starts a combat (P5 expeditions use this): fills `allowRetry` from the easy-retry setting, dispatches `combat/start`
   * and shows the combat screen. Returns false (with a toast) when the engine refuses.
   */
  startCombat(opts: StartPayload): boolean;
  /** Scenes (P3): send, propose, end, resume. */
  scene: SceneController;
  /** PDA DMs and night knocks (P3). */
  comms: Comms;
  /** Expeditions (P5): planning, the run, fights, recap and debrief. */
  expedition: ExpeditionController;
  /** The director (P5): answers the requests the engine opens. */
  director: DirectorController;
  /** A story outcome offered a new unit: pick a character card (or take a grunt instead). */
  intakeUnit(): Promise<void>;
}

export interface AppDeps {
  loadContent: () => Promise<{ registries: Registries; errors: ContentError[]; lorebook?: Lorebook | null }>;
  shellFactory?: typeof createShell;
  /** URL of a file shipped with the extension (the optional world map image). */
  assetUrl?: (path: string) => string;
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

  registerSceneContext(context, { registries: () => registries, settings: () => getSettings(st) });
  registerWorldContext(context, { registries: () => registries });

  /** The COMMS tab shows how many messages from units are unread. */
  function syncBadges(): void {
    shell.setTabBadge('comms', state ? unreadCount(state) : 0);
    // new story and command offers since the OPS tab was last shown
    const fresh = state ? state.missions.offered.filter((m) => (m.source === 'command' || m.source === 'story') && !seenOffers.has(m.id)).length : 0;
    shell.setTabBadge('ops', fresh);
  }
  const seenOffers = new Set<string>();

  /** The Romance and initiative settings are global; the pure engine reads them from the campaign. */
  function syncIntimacy(): void {
    if (!state || load.kind !== 'ok') return;
    const s = getSettings(st);
    const cur = intimacyOf(state);
    if (cur.romance === s.romance && cur.initiative === s.romanticInitiative) return;
    api.dispatch({ type: 'campaign/set_intimacy', payload: { romance: s.romance, initiative: s.romanticInitiative } }, { expectChatId: st.getActiveChat()?.chatId });
  }

  let sceneScreen: SceneScreen | null = null;
  /** True while the scene screen (or the night knock) is what the shell shows. */
  let onSceneScreen = false;
  let combatScreen: CombatScreen | null = null;
  /** True while the combat screen is what the shell shows. */
  let onCombatScreen = false;
  /** Enemy names being generated (one request per `enemyId|affixes` key at a time). */
  const namesInFlight = new Set<string>();
  const sceneApp = {
    dispatch: (a: Action, o?: { expectChatId?: string }) => api.dispatch(a, o),
    current: () => api.current(),
    context,
    refreshContext: applyContext,
  };
  const routeUi = (e: SceneUiEvent): void => sceneScreen?.handle(e);
  const sceneDeps = {
    st,
    app: sceneApp,
    restore: (before: CampaignState, expected: CampaignState) => api.restoreSnapshot(before, expected),
    registries: () => registries,
    settings: () => getSettings(st),
    toast: (kind: 'info' | 'warn' | 'error', text: string) => toast(kind, text),
    onUi: routeUi,
  };
  const scene = createSceneController(sceneDeps);
  const comms = createComms({ ...sceneDeps, scene });
  const worldDeps = {
    st,
    app: sceneApp,
    registries: () => registries,
    settings: () => getSettings(st),
    toast: (kind: 'info' | 'warn' | 'error', text: string) => toast(kind, text),
  };
  const director = createDirector(worldDeps);
  const expedition = createExpedition({ ...worldDeps, startCombat: (p) => api.startCombat(p), startScene: (o) => beginScene(o) });
  let expeditionScreen: ExpeditionScreen | null = null;
  /** True while the expedition screen is what the shell shows. */
  let onExpeditionScreen = false;
  /** The report a recap has been requested for and has not arrived yet. */
  let recapPendingFor: string | null = null;

  function showScene(): void {
    onSceneScreen = true;
    shell.showScreen('scene');
  }

  /** Where the player lands after a scene or a knock: the night knock if one is waiting, else the PDA. */
  function leaveScene(): void {
    sceneScreen?.dispose();
    sceneScreen = null;
    if (state && !state.scene && state.slot === 'night' && state.calendar.nightEvent) {
      showScene();
      return;
    }
    onSceneScreen = false;
    shell.showScreen('pda');
  }

  /** After a (re)load: pick up an open scene, or leave the scene screen of another chat. */
  function adoptScene(): void {
    sceneScreen?.dispose();
    sceneScreen = null;
    // directives belong to one campaign's scene: never carry them into another chat
    clearSceneDirectives(context);
    context.clearMatching((d) => d.id === 'night' || d.id.startsWith('proposal:'));
    if (state?.scene) {
      scene.resume();
      showScene();
    } else if (onSceneScreen) {
      onSceneScreen = false;
      shell.showScreen('pda');
    }
  }

  async function beginScene(opts: StartOptions): Promise<boolean> {
    const chatId = st.getActiveChat()?.chatId;
    const ok = await scene.start(opts);
    if (!ok) {
      // an activity talk still holds its slot if the scene never opened: release it
      if (opts.origin === 'activity' && state?.calendar.pendingScene && !state.scene) {
        api.dispatch({ type: 'calendar/cancel_scene', payload: {} }, { expectChatId: chatId });
      }
      return false;
    }
    showScene();
    shell.open();
    return true;
  }

  /** `talk`: where, and who else? Cancelling gives the slot back. */
  async function offerScene(unitId: string): Promise<void> {
    const chatId = st.getActiveChat()?.chatId;
    if (!state) return;
    const pick = await pickLocation((o) => shell.modal(o), { registries, state, firstUnitId: unitId, candidates: state.squad });
    if (st.getActiveChat()?.chatId !== chatId) return;
    if (!pick) {
      api.dispatch({ type: 'calendar/cancel_scene', payload: {} }, { expectChatId: chatId });
      return;
    }
    await beginScene({ locationId: pick.locationId, participants: pick.participants, origin: 'activity' });
  }

  /** After a group meal: an optional scene with up to three of the squad that does not use a slot. */
  async function offerGroupScene(): Promise<void> {
    const chatId = st.getActiveChat()?.chatId;
    const s = state;
    if (!s) return;
    const named = (ids: string[]) => ids.map((id) => s.squad.find((u) => u.id === id)).filter((u) => u && u.kind === 'named' && u.status !== 'dead' && u.status !== 'deserted' && u.status !== 'terminated');
    // the squad lingering over the meal is the active roster; reserve and injured units are elsewhere
    const ids = [...new Set(named(s.roster.activeIds).map((u) => u!.id))].slice(0, 3);
    if (ids.length === 0) return;
    const answer = await shell.modal({
      title: 'Linger at the table?',
      body: 'The squad lingers over the meal. Talk with them? This does not use a slot.',
      actions: [{ label: 'Talk', value: 'yes' }, { label: 'Skip', value: 'no' }],
    });
    if (answer !== 'yes' || st.getActiveChat()?.chatId !== chatId) return;
    await beginScene({ locationId: 'mess_hall', participants: ids, origin: 'mess', consumesSlot: false });
  }

  /** What the events of one dispatch set in motion, after it has been committed. */
  function followUps(events: EngineEvent[]): void {
    const chatId = st.getActiveChat()?.chatId;
    const has = (t: string) => events.some((e) => e.type === t);
    const warn = (what: string) => (e: unknown) => console.warn(`[Alius] ${what} failed`, e);
    queueMicrotask(() => {
      if (st.getActiveChat()?.chatId !== chatId) return;
      if (has('commander_injured')) api.dispatch({ type: 'relations/commander_injured', payload: {} }, { expectChatId: chatId });
      if (has('night_started') && state?.slot === 'night' && !state.scene) {
        showScene();
        shell.open();
      }
      if (has('slot_advanced')) void comms.onSlotAdvanced().catch(warn('unit DMs'));
      if (has('director_requested') || (has('combat_ended') && state?.world.director?.pending)) void director.onRequested().catch(warn('director'));
      if (has('rumors_requested')) api.dispatch({ type: 'director/request', payload: { reason: 'scout' } }, { expectChatId: chatId });
      if (has('expedition_ended')) {
        showExpedition();
        shell.open();
        startRecap();
      }
      if (has('day_started')) void runCompaction({ st, app: sceneApp, settings: () => getSettings(st) }).catch(warn('chronicle compaction'));
    });
  }

  /** The scene screen, or the night knock when the Night slot waits for an answer. */
  function renderSceneView(host: HTMLElement): void {
    sceneScreen?.dispose();
    sceneScreen = null;
    const s = state;
    if (s?.scene) {
      sceneScreen = renderSceneScreen(host, {
        controller: scene, getState: () => state, registries, st, settings: () => getSettings(st), onEnded: leaveScene,
      });
      return;
    }
    const entry = s && s.slot === 'night' ? s.calendar.nightEvent : undefined;
    if (s && entry) {
      renderKnock(host, {
        entry, unitName: s.squad.find((u) => u.id === entry.unitId)?.displayName ?? 'Someone',
        onOpen: () => void comms.openNight().then(() => { if (state?.scene) showScene(); }),
        onIgnore: () => {
          comms.ignoreNight();
          leaveScene();
        },
      });
      return;
    }
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO SCENE OPEN'),
      h('button', { type: 'button', class: 'alius-btn', onclick: leaveScene }, '[ BACK ]')));
  }

  // ---------------------------------------------------------------------------------------------- combat (P4)

  function showCombat(): void {
    onCombatScreen = true;
    shell.showScreen('combat');
  }

  /** CONTINUE after a combat: back to the PDA. The result stays in `state.lastCombat` for P5. */
  function leaveCombat(): void {
    combatScreen?.dispose();
    combatScreen = null;
    onCombatScreen = false;
    if (state?.expedition) {
      // a fight of an expedition: its result becomes part of the run (once), then the run goes on
      expedition.afterCombat();
      if (state?.expedition) showExpedition();
      else shell.showScreen('pda'); // the run ended with the fight: the report follows
      return;
    }
    shell.showScreen('pda');
  }

  /** After a (re)load: an open combat is shown again, a combat screen of another chat is left. */
  function adoptCombat(): void {
    combatScreen?.dispose();
    combatScreen = null;
    if (state?.combat) showCombat();
    else if (onCombatScreen) {
      onCombatScreen = false;
      shell.showScreen('pda');
    }
  }

  /** Dispatches a combat action in the open chat; cut-ins and the like go to the screen. */
  function combatDo(type: string, payload?: unknown): EngineEvent[] {
    const events = act({ type, payload });
    combatScreen?.handle(events);
    return events;
  }

  function renderCombatView(host: HTMLElement): void {
    combatScreen?.dispose();
    combatScreen = null;
    if (!state?.combat && !state?.lastCombat) {
      host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO COMBAT'),
        h('button', { type: 'button', class: 'alius-btn', onclick: leaveCombat }, '[ BACK ]')));
      return;
    }
    combatScreen = renderCombatScreen(host, {
      getState: () => state,
      registries,
      st,
      settings: () => getSettings(st),
      onAct: (action) => void combatDo('combat/act', { action }),
      onOrder: (orderId, targetCid) => void combatDo('combat/order', { orderId, ...(targetCid ? { targetCid } : {}) }),
      onAuto: (on) => void combatDo('combat/auto', { on }),
      onRetry: () => void combatDo('combat/retry'),
      onAccept: () => void combatDo('combat/accept'),
      onRetreat: () => void combatDo('combat/retreat'),
      onClose: leaveCombat,
    });
  }

  // ---------------------------------------------------------------------------------------------- expeditions (P5)

  function showExpedition(): void {
    onExpeditionScreen = true;
    shell.showScreen('expedition');
  }

  function leaveExpedition(): void {
    expeditionScreen?.dispose();
    expeditionScreen = null;
    onExpeditionScreen = false;
    // a return through the Evening can end in the Night: the knock that is waiting must not be lost behind the report
    if (state && !state.scene && state.slot === 'night' && state.calendar.nightEvent) {
      showScene();
      return;
    }
    shell.showScreen('pda');
  }

  function renderExpeditionView(host: HTMLElement): void {
    expeditionScreen?.dispose();
    expeditionScreen = renderExpeditionScreen(host, {
      getState: () => state,
      registries,
      settings: () => getSettings(st),
      controller: expedition,
      onClose: leaveExpedition,
      recapPending: () => recapPendingFor !== null && recapPendingFor === state?.lastExpedition?.id,
    });
  }

  /** After a (re)load: an open run is shown again (an open fight comes first) and a finished fight is taken into it. */
  function adoptExpedition(): void {
    expeditionScreen?.dispose();
    expeditionScreen = null;
    if (state?.expedition) {
      if (!state.combat) showExpedition();
      expedition.afterCombat();
    } else if (onExpeditionScreen) {
      onExpeditionScreen = false;
      shell.showScreen('pda');
    }
  }

  /** Asks for the narrative recap of the report just written (once; the screen shows COMPILING… meanwhile). */
  function startRecap(): void {
    const report = state?.lastExpedition;
    if (!report || report.recap !== undefined || !getSettings(st).expeditionRecap) return;
    recapPendingFor = report.id;
    void expedition.requestRecap()
      .catch((e) => console.warn('[Alius] expedition recap failed', e))
      .finally(() => {
        if (recapPendingFor === report.id) recapPendingFor = null;
        shell.refresh();
      });
  }

  /** Optional generated names for affixed enemies: one request per key, never blocks or changes the combat. */
  function requestEnemyNames(): void {
    const s = state;
    const cs = s?.combat;
    const settings = getSettings(st);
    if (!s || !cs || !settings.enemyFlavor) return;
    const chatId = st.getActiveChat()?.chatId;
    for (const c of cs.combatants) {
      if (c.side !== 'enemy' || !c.enemyId) continue;
      const key = c.nameKey;
      const affixes = (key.split('|')[1] ?? '').split(',').filter((a) => a !== '');
      if (affixes.length === 0 || s.enemyNames?.[key] || namesInFlight.has(key)) continue;
      namesInFlight.add(key);
      const tpl = registries.enemies.get(c.enemyId);
      void generateEnemyFlavor(
        {
          kind: 'enemy',
          archetypeName: String(tpl?.name ?? c.enemyId),
          categoryName: String(registries.enemyCategories.get(String(tpl?.categoryId))?.name ?? ''),
          affixNames: affixes.map((a) => String(registries.affixes.get(a)?.adjective ?? a)),
        },
        { st, settings },
      )
        .then((r) => {
          if (r) api.dispatch({ type: 'combat/set_enemy_name', payload: { key, name: r.name } }, { expectChatId: chatId });
        })
        .catch(() => {})
        .finally(() => namesInFlight.delete(key));
    }
  }

  /** Debug tool: a generated danger-1 encounter against the active roster (nothing banked, no expedition). */
  function combatDrill(): void {
    if (!state) return toast('warn', 'No campaign loaded.');
    if (state.combat) return toast('warn', 'A combat is already open.');
    const roster = activeRosterUnits(state);
    if (roster.length === 0) return toast('warn', 'The active roster is empty.');
    const ids = roster.map((u) => u.id);
    const encounter = generateEncounter(state, registries, new Rng(state.rng), {
      table: { categories: Object.fromEntries([...registries.enemyCategories.keys()].map((id) => [id, 1])) },
      danger: 1,
      squadPower: squadPower(state, registries, ids),
    });
    api.startCombat({ encounter, formation: defaultFormation(state, registries, ids), expedition: false, bankLoot: false });
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

  /** Everything that follows a (re)load of the campaign: context, badge, scene and the intimacy mirror. */
  function afterLoad(): void {
    // a save from before P5 has no world yet: seed it, then everything else sees a complete state
    if (load.kind === 'ok' && state && state.world.seeded !== true) {
      api.dispatch({ type: 'world/seed', payload: {} }, { expectChatId: load.chatId });
    }
    applyContext();
    syncBadges();
    adoptScene();
    adoptCombat();
    adoptExpedition();
    syncIntimacy();
    if (state?.world.director?.pending) void director.onRequested().catch((e) => console.warn('[Alius] director failed', e));
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
    syncBadges();
    shell.refresh();
  }

  const TEST_DIRECTIVE = { id: 'debug_test', text: 'TEST DIRECTIVE: this line must appear in the prompt.', expiresAfter: 'manual' } as const;
  const debugTools = [
    { label: 'Set test directive', run: () => { context.setDirective(TEST_DIRECTIVE); applyContext(); } },
    { label: 'Clear test directive', run: () => { context.clearDirective(TEST_DIRECTIVE.id); applyContext(); } },
    { label: 'Clear all injections', run: () => context.apply(st, null, 0) },
    { label: 'Combat drill', run: () => combatDrill() },
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
    afterLoad();
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

  /** A story outcome offered a new unit: pick a card (calibrated like a re-sync), or take a grunt instead. */
  async function intakeUnit(): Promise<void> {
    const s = state;
    if (!s || (s.world.incomingUnits ?? 0) < 1) return toast('warn', 'No unit is waiting for intake.');
    const chatId = st.getActiveChat()?.chatId;
    const inSquad = new Set(s.squad.map((u) => u.cardRef));
    const characters = st.listCharacters().filter((c) => !inSquad.has(c.avatar));

    const select = h('select', { name: 'intake-card', 'aria-label': 'Character card' },
      ...characters.map((c) => h('option', { value: c.avatar }, c.name))) as HTMLSelectElement;
    const choice = await shell.modal({
      title: 'New unit',
      body: h('div', {},
        h('p', {}, 'Command has assigned a new unit. Choose her character card, or decline and take a grunt instead.'),
        ...(characters.length > 0 ? [select] : [h('p', { class: 'alius-dim' }, 'Every available character card is already in the squad.')])),
      actions: [
        ...(characters.length > 0 ? [{ label: 'Review', value: 'pick' }] : []),
        { label: 'DECLINE — TAKE A GRUNT', value: 'decline' },
        { label: 'Cancel', value: 'cancel' },
      ],
    });
    if (st.getActiveChat()?.chatId !== chatId) return;
    if (choice === 'decline') {
      act({ type: 'squad/decline_incoming', payload: {} });
      return;
    }
    if (choice !== 'pick') return;
    const card = characters.find((c) => c.avatar === select.value);
    if (!card) return;

    const desireBond = s.settings.desireBondDefects === true;
    const wizard = new Wizard(
      {
        registries,
        desireBondDefects: desireBond,
        importer: (avatar, sections) =>
          importProfile(avatar, sections, { st, settings: { ...getSettings(st), desireBondDefects: desireBond }, registries }),
        onChange: () => {},
      },
      { personaName: '', canBindCurrent: false },
    );
    wizard.toggleUnit(card);
    wizard.calibrate(0);
    const body = h('div', { class: 'alius-calibration' });
    const draw = () =>
      renderCalibration(body, {
        draft: wizard.state.units[0],
        registries,
        desireBondDefects: desireBond,
        onUpdate: (p) => wizard.update(0, p),
        onRegenerate: (section) => wizard.regenerate(0, section),
        onManual: () => wizard.setManual(0),
      });
    wizard.subscribe(() => renderKeepingFocus(body, draw));
    draw();
    const answer = await shell.modal({
      title: `New unit: ${card.name}`,
      body,
      actions: [{ label: 'Accept', value: 'apply' }, { label: 'Cancel', value: 'cancel' }],
    });
    const draft = wizard.state.units[0];
    wizard.dispose();
    if (answer !== 'apply') return;
    if (st.getActiveChat()?.chatId !== chatId) return;
    if (draft.status === 'loading') return toast('warn', 'The import is still running; wait for it to finish.');
    const { roleId, signature, ...rest } = draft.choice;
    if (!roleId || !signature) return toast('warn', `${card.name}: calibration is incomplete.`);

    const events = act({
      type: 'squad/add_named',
      payload: { unit: { cardRef: draft.avatar, displayName: draft.displayName, roleId, signature, ...structuredClone(rest) } },
    });
    if (events.some((e) => e.type === 'error')) return;
    try {
      await st.addGroupMembers([draft.avatar]);
    } catch (e) {
      toast('warn', `${card.name} joined the squad but could not be added to the group chat: ${errText(e)}`);
      return;
    }
    toast('info', `${card.name} joined the squad.`);
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
          toast('warn', `Supply shortage: ${String(e.missing)} short.${Number(e.hit) > 0 ? ' Stress and affinity suffer.' : ''}`);
          break;
        case 'trust_penalty_event':
          toast('warn', `${String(e.streak)} days of shortage: trust in the commander drops.`);
          break;
        case 'facility_upgraded':
          toast('info', `${String(registries.facilities.get(String(e.facilityId))?.name ?? e.facilityId)} upgraded to level ${String(e.level)}.`);
          break;
        case 'level_up':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} reached level ${String(e.level)}.`);
          break;
        case 'item_crafted':
          toast('info', `Crafted ${String(registries.items.get(String(e.itemId))?.name ?? e.itemId)} [${String(e.rarity)}].`);
          break;
        case 'unit_recovered':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} has recovered.`);
          break;
        case 'day_started':
          toast('info', `Day ${String(e.day)}.`);
          break;
        case 'mission_offered':
          if (e.source === 'command' || e.source === 'story') toast('info', `New ${String(e.source)} mission: ${String(e.title)}.`);
          break;
        case 'mission_failed':
          toast('warn', `Mission failed: ${String(e.title)}.`);
          break;
        case 'clock_filled':
          if (state?.world.clocks.find((c) => c.id === e.clockId)?.visibleToPlayer) toast('warn', `${String(e.label)} has filled.`);
          break;
        case 'beat_completed':
          toast('info', 'A story milestone was reached.');
          break;
        case 'clearance_raised':
          toast('info', `Clearance raised to tier ${String(e.tier)}.`);
          break;
        case 'incoming_unit_offered':
          toast('info', 'A new unit is waiting for intake (OPS).');
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
    dispatch: (action) => api.dispatch(action, { expectChatId: st.getActiveChat()?.chatId }),
    onSettingsChanged: syncIntimacy,
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
      onUnlock: (unitId, nodeId) => void act({ type: 'squad/unlock_node', payload: { unitId, nodeId } }),
      onRespec: (unitId) => void act({ type: 'squad/respec', payload: { unitId } }),
      onSetLoadout: (unitId, skillIds) => void act({ type: 'squad/set_loadout', payload: { unitId, skillIds } }),
      onEquip: (unitId, uid) => void act({ type: 'item/equip', payload: { unitId, uid } }),
      onUnequip: (unitId, slot) => void act({ type: 'item/unequip', payload: { unitId, slot } }),
    }),
  );
  shell.registerTab('inv', (host) =>
    renderInvTab(host, {
      getState: () => state,
      registries,
      onEquip: (unitId, uid) => void act({ type: 'item/equip', payload: { unitId, uid } }),
      onCraft: (recipeId) => void act({ type: 'item/craft', payload: { recipeId } }),
      onUpgrade: (uid) => void act({ type: 'item/upgrade', payload: { uid } }),
      onReroll: (uid, affixIndex) => void act({ type: 'item/reroll', payload: { uid, affixIndex } }),
      onDismantle: (uid) => void act({ type: 'item/dismantle', payload: { uid } }),
    }),
  );
  shell.registerScreen('combat', renderCombatView, {
    refresh: () => {
      if ((state?.combat || state?.lastCombat) && combatScreen) {
        combatScreen.refresh();
        return true;
      }
      return false;
    },
  });
  shell.registerTab('ops', (host) => {
    for (const m of state?.missions.offered ?? []) seenOffers.add(m.id);
    shell.setTabBadge('ops', 0);
    renderOpsTab(host, {
      getState: () => state,
      getLoad: () => load,
      registries,
      onDo: (req) => void api.performActivity(req),
      onRequisition: (n) => api.requisition(n),
      onPlan: (missionId) => {
        expedition.plan({ missionId });
        showExpedition();
        shell.open();
      },
      onDismiss: (missionId) => void act({ type: 'mission/dismiss', payload: { missionId } }),
      onFollowRumor: (rumorId) => void act({ type: 'rumor/follow', payload: { rumorId } }),
      onIntake: () => void api.intakeUnit(),
      onOpenReport: () => {
        showExpedition();
        shell.open();
      },
    });
  });
  shell.registerTab('map', (host) =>
    renderMapTab(host, {
      getState: () => state,
      getLoad: () => load,
      registries,
      mapImageUrl: deps.assetUrl?.('content/core/map/world.png') ?? null,
      onPlan: (target) => {
        expedition.plan(target);
        showExpedition();
        shell.open();
      },
    }),
  );
  shell.registerScreen('expedition', renderExpeditionView, {
    refresh: () => {
      if (!expeditionScreen) return false;
      expeditionScreen.refresh();
      return true;
    },
  });
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

  shell.registerTab('comms', (host) =>
    renderCommsTab(host, {
      getState: () => state,
      registries,
      onSend: (unitId, text) => void comms.send(unitId, text),
      onRead: (unitId) => {
        const unit = state?.dms[unitId];
        if (unit?.some((m) => m.from !== 'commander' && !m.read)) api.dispatch({ type: 'dm/read', payload: { unitId } }, { expectChatId: st.getActiveChat()?.chatId });
      },
      onAnswer: (proposalId, answer) => void act({ type: 'proposal/answer', payload: { proposalId, answer } }),
    }),
  );
  shell.registerTab('log', (host) => renderLogTab(host, { getState: () => state }));
  shell.registerScreen('scene', renderSceneView, {
    refresh: () => {
      if (state?.scene && sceneScreen) {
        sceneScreen.refresh();
        return true;
      }
      return false;
    },
  });

  const api: AliusApp = {
    context,
    shell,
    scene,
    comms,
    expedition,
    director,
    intakeUnit,
    startScene: beginScene,
    startCombat(opts) {
      if (!state) {
        toast('error', 'No Alius campaign in this chat.');
        return false;
      }
      const chatId = st.getActiveChat()?.chatId;
      const payload: StartPayload = { ...opts, allowRetry: getSettings(st).easyRetry };
      const events = api.dispatch({ type: 'combat/start', payload }, { expectChatId: chatId });
      const failed = events.find((e) => e.type === 'error');
      if (failed) {
        toast('error', String(failed.message ?? failed.code));
        return false;
      }
      showCombat();
      shell.open();
      combatScreen?.handle(events);
      requestEnemyNames();
      return true;
    },
    refreshContext: applyContext,
    replaceState,
    openSetup,
    deployCampaign,
    setupState: () => setup?.wizard.state ?? null,

    async performActivity(req) {
      const chatId = st.getActiveChat()?.chatId;
      const events = act({ type: 'activity/do', payload: req });
      if (events.some((e) => e.type === 'workshop_opened')) {
        shell.showTab('inv');
        shell.open();
      }
      const requested = events.find((e) => e.type === 'scene_requested');
      if (requested) await offerScene(String(requested.unitId));
      else if (events.some((e) => e.type === 'group_scene_offered')) await offerGroupScene();
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
      afterLoad();

      if (!started) {
        started = true;
        st.on('chat_changed', () => {
          reload();
          afterLoad();
          shell.refresh();
        });
        st.on('message_received', () => {
          // proposal directives lapse when their unit answers (the scene controller handles those)
          context.onReplyReceived((d) => d.id.startsWith('proposal:'));
          applyContext();
        });
        // a swiped or deleted reply: undo its extraction if it was the last one applied
        st.on('message_swiped', (i) => scene.onSwipe(Number(i)));
        st.on('message_deleted', (i) => scene.onSwipe(Number(i)));
        st.on('message_edited', (i) => scene.onEdited(Number(i)));
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
        // the day-end pipeline asks for a save: do not wait for the debounce; neither does a combat, so a reload
        // (or a chat switch) mid-fight resumes at the same turn
        if (r.events.some((e) => e.type === 'autosave' || e.type.startsWith('combat_') || e.type.startsWith('expedition_'))) {
          void saver?.flush().catch((e) => console.warn('[Alius] autosave failed', e));
        }
      }
      reportEvents(r.events);
      applyContext();
      syncBadges();
      shell.refresh();
      followUps(r.events);
      return r.events;
    },

    restoreSnapshot(snap, expectedCurrent) {
      if (!state || state !== expectedCurrent || load.kind !== 'ok') return false;
      state = snap;
      load = { kind: 'ok', state: snap, chatId: load.chatId };
      saver?.save(snap);
      applyContext();
      syncBadges();
      shell.refresh();
      return true;
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
      afterLoad();
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
