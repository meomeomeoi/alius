import { scapegoatView } from './ui/dilemma/scapegoat';
import './engine/actions/debug'; // registers debug/* actions
import './engine/actions/squad'; // registers squad/* actions
import './engine/actions/calendar'; // registers calendar/*, activity/* and commander/* actions
import './engine/actions/base'; // registers base/*, roster/* and squad/set_flavor actions
import './engine/actions/scene'; // registers scene/*, intents/*, proposal/*, memory/* actions and the P3 relation accounting
import './engine/actions/memory'; // registers memory/configure, pin, forget, edit (P3b)
import './engine/actions/comms'; // registers dm/*, night/* actions and the defect social hooks
import './engine/actions/combat'; // registers combat/* and campaign/set_difficulty actions
import './engine/actions/progression'; // registers squad/unlock_node, respec, set_loadout, release_breakdowns and the level-up hook
import './engine/actions/world'; // registers world/* actions
import './engine/actions/expedition'; // registers expedition/* actions
import './engine/actions/leash'; // registers leash/* actions and the weekly refresh (P6)
import './engine/actions/loyalty'; // registers scene/order, loyalty/* actions and the loyalty day step (P6)
import './engine/actions/discipline'; // registers the P9 discipline day step (after the loyalty step)
import './engine/actions/bonds'; // registers the P9d actions
import './engine/actions/personal'; // registers the P9c personal day step (after the bonds step)
import './engine/actions/immersion'; // P10b: her hand (and, after the personal step, her notes)
import './engine/actions/power'; // registers the P9b actions
import './engine/actions/dilemma'; // registers dilemma/* actions and the pacing step, after the loyalty step (P6)
import './engine/actions/arc'; // registers arc/decide and the medbay arc steps (P6)
import './engine/actions/items'; // registers item/* actions and the workshop hook
import './engine/actions/commander'; // registers commander/seed, set_profile and review_done (P7)
import './engine/actions/onboarding'; // registers onboarding/* actions (P11)
import './engine/actions/special'; // registers the P12 special-trait actions, after loyalty and personal
import './engine/actions/warden'; // registers the P13 LEASHSWAP actions, after special
import './engine/actions/generations'; // registers generation/* (failure records of model calls) and their day-end sweep (P14)
import './engine/actions/headStart'; // registers head_start/recap (P11b)
import './engine/actions/development'; // registers development/set_mode and the review actions (P14b)
import './engine/actions/blocking'; // registers blocking/set (P15a)
import './engine/actions/moments'; // registers moment/answer (P15a)
import './engine/actions/physics'; // registers the physics actions (P15a)
import './engine/actions/life'; // registers life/set_frequency and, later, the life and profile actions (P14c)
import './llm/calls/profileImport'; // registers the profile_import call type
import './llm/calls/commanderImport'; // registers the commander_import call type (P7)
import { sanitizeVignette, type VignetteInput } from './llm/calls/activityVignette'; // registers the activity_vignette call type
import { sanitizeEnemyFlavor, sanitizeGruntFlavor, type EnemyFlavorInput, type GruntFlavorInput } from './llm/calls/flavor'; // registers the flavor call type
import type { ContentError, Registries } from './content/types';
import { emptyRegistries } from './content/types';
import { dispatch as engineDispatch, type Action, type EngineEvent } from './engine/dispatch';
import type { CampaignState } from './engine/state/types';
import { unreadCount } from './engine/dms';
import { intimacySetting } from './engine/relations/gain';
import { activeRosterUnits } from './engine/economy';
import { generateEncounter } from './engine/combat/encounter';
import { defaultFormation, squadPower } from './engine/combat/stats';
import type { StartPayload } from './engine/combat/types';
import { Rng } from './engine/rng';
import { arcPaths } from './engine/arcs';
import { dilemmaOptions } from './engine/dilemma/flow';
import { isLiving } from './engine/economy';
import { checkLeash, leashCost } from './engine/leash/use';
import { leashLog } from './engine/leash/weekly';
import { loyalUnits } from './engine/loyalty/mutiny';
import { CONFRONTATION_KINDS } from './engine/loyalty/state';
import type { DecorPart, LeashKind } from './engine/state/types';
import { createDilemmas, type DilemmaController } from './loyalty/dilemmaController';
import { createLoyalty, type LoyaltyController } from './loyalty/loyaltyController';
import { clearDisciplineDirectives, disciplineDirectives } from './discipline/context';
import { createBonds, type BondsController } from './bonds/controller';
import { createPower, type PowerController } from './power/controller';
import { createPersonal, type PersonalController } from './personal/controller';
import { createSpecial, type SpecialController } from './special/controller';
import { createWarden } from './warden/controller';
import { createHeadStart } from './headStart/controller';
import { createDevelopment } from './development/controller';
import { createLife } from './life/controller';
import { clearLifeDirectives, refreshLifeDirectives } from './life/directives';
import { clearPersonalDirectives, refreshPersonalDirectives } from './personal/directives';
import { clearSpecialDirectives, refreshSpecialDirectives } from './special/directives';
import type { VoteChoice } from './power/deps';
import { renderVotePanel } from './ui/power/votePanel';
import { clearPowerDirectives, refreshPowerDirectives } from './power/directives';
import { createDiscipline, type DisciplineController } from './discipline/controller';
import { createOnboarding, type OnboardingController } from './onboarding/controller';
import { coachHints, isTutorialRun, lockedTabs, unlockedBetween } from './engine/onboarding';
import { TAB_IDS } from './ui/shell/tabs';
import { renderOnboardingCard } from './ui/onboarding/card';
import { renderRevealCard } from './ui/warden/revealCard';
import { renderEndScreen } from './ui/warden/endScreen';
import { renderRecapCard } from './ui/headStart/recapCard';
import type { GenerationUi } from './ui/generation/surface';
import { generationBadge } from './ui/shell/generationsSection';
import { renderOverrideChip } from './ui/warden/overrideChip';
import { wardenNotice } from './ui/warden/notices';
import { overrideOpen } from './engine/warden';
import { isQuietNight, slotIndex } from './engine/calendar';
import { restrictionReason } from './engine/discipline';
import { renderDilemma } from './ui/dilemma/dilemmaPanel';
import { fileLeashRequest } from './ui/leash/requestForm';
import { renderConfrontation } from './ui/loyalty/confrontation';
import { cutIn } from './ui/scene/cutIn';
import { renderCombatScreen, type CombatScreen } from './ui/combat/combatScreen';
import { renderInvTab } from './ui/inv/invTab';
import { ContextBuilder } from './llm/context';
import { runCompaction } from './scene/chronicle';
import { createComms, type Comms } from './scene/comms';
import { bondsDirectives, contentLine, EXPLICIT_CATEGORY } from './bonds/directives';
import { clearSceneDirectives, registerSceneContext } from './scene/context';
import { createMemoryController } from './scene/memoryController';
import { registerMemoryContext } from './scene/memoryContext';
import { registerDevelopmentContext } from './scene/developmentContext';
import { registerBlockingContext } from './scene/blockingContext';
import { clearBlockingDirectives, refreshBlockingDirectives } from './blocking/directives';
import { applyMomentDirectives, clearMomentDirectives } from './blocking/momentDirectives';
import { applyPhysicsDirectives, clearPhysicsDirectives, refreshPhysicsDirectives } from './blocking/physicsDirectives';
import { createStaging } from './blocking/controller';
import { wakeCard } from './ui/scene/wakeCard';
import { bellsFor, deviceTabLocks, muffled, sceneSettingsPatch } from './blocking/sync';
import { createSceneController, type SceneController, type SceneUiEvent, type StartOptions } from './scene/sceneController';
import type { FailReason } from './llm/orchestrator';
import { createEnvelope, type Envelope } from './llm/envelope';
import './llm/sites'; // P14: declares every generation site
import { getSettings } from './settings';
import type { Lorebook, StAdapter } from './st/adapter';
import { buildCampaign, type SetupResult } from './engine/setup';
import { commanderProfile } from './engine/commander/profile';
import { renderHandlerPanel } from './ui/special/handlerPanel';
import { HANDLER_VISIT_KIND } from './engine/special/state';
import { renderCommanderFile } from './ui/commander/commanderFile';
import { importCommander } from './setup/commander';
import { importProfile, resyncSectionsOffered } from './setup/profile';
import { defaultWorldOptions } from './engine/worldOptions';
import { Wizard, type WizardState } from './setup/wizard';
import { TUNING } from './engine/tuning';
import { renderSetupScreen } from './ui/setup/setupScreen';
import { renderSquadTab } from './ui/squad/squadTab';
import { portraitOptions, unitPortrait } from './ui/portrait/portrait';
import { renderOpsTab, type OpsTabCtx } from './ui/ops/opsTab';
import { renderMarks } from './ui/device/marks';
import { pickSkin } from './ui/device/skins';
import { createSound, type SoundId } from './ui/sound/sound';
import { renderHub } from './ui/hub/hubScreen';
import { endSlotBlock } from './ui/hub/model';
import { renderMapTab } from './ui/map/mapTab';
import { renderExpeditionScreen, type ExpeditionScreen } from './ui/expedition/expeditionScreen';
import './llm/calls/directorTick'; // registers the director_tick call type
import './llm/calls/expeditionRecap'; // registers the expedition_recap call type
import { registerWorldContext } from './world/context';
import { clearWorldDirectives, registerWorldOptionsContext, worldDirectives } from './world/optionsContext';
import { createDirector, type DirectorController } from './world/directorController';
import { createExpedition, type ExpeditionController } from './world/expeditionController';
import { renderBaseTab } from './ui/base/baseTab';
import { renderCommsTab } from './ui/comms/commsTab';
import { renderHomeTab } from './ui/home/homeTab';
import { unreadNotes } from './engine/notes';
import { motionReduced } from './ui/motion';
import { renderClaimCard } from './ui/personal/claimCard';
import { renderSecretCard } from './ui/personal/secretCard';
import { herPickView } from './ui/personal/obey';
import { renderWagerCard } from './ui/personal/wagerCard';
import type { EditView } from './ui/personal/chips';
import { renderLogTab } from './ui/log/logTab';
import { renderDoor, resetDoor } from './ui/night/door';
import { pickLocation } from './ui/scene/locationPicker';
import { renderSceneScreen, type SceneScreen } from './ui/scene/sceneScreen';
import { checkActivity, focusConfirm, type ActivityRequest } from './engine/activities';
import { analyzeAttrs } from './ui/analyze/mark';
import type { ResyncPatch, ResyncSection } from './engine/actions/squad';
import { pastimeProblem } from './engine/life/meetings';
import { temperamentOf } from './engine/life/state';
import { renderCalibration } from './ui/setup/calibration';
import { h } from './ui/dom';
import { renderKeepingFocus } from './ui/focus';
import {
  createSaver, exportCampaign, initCampaign as initCampaignInChat, loadCampaign, writeNewCampaign, METADATA_KEY, type LoadResult,
} from './st/persistence';
import { registerCoreProviders } from './analysis/providers/core';
import { memoryConfig } from './engine/memory/config';
import { vignetteMemory } from './engine/memory/inputs';
import { createShell, type ShellApi } from './ui/shell/shell';
import type { ToastKind, ToastOpts } from './ui/shell/toast';
import { VOICE_OF } from './ui/voice/sources';
import { dislikesOf, likesOf } from './engine/development/profile';

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
  pingMechanic(): Promise<PingResult>;
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
  /**
   * The hub's TALK: starts the talk activity with her and opens the scene at `locationId` without asking where.
   * Refused (with a toast, spending nothing) while a restriction, an open scene or the like stands in the way.
   */
  talkAt(unitId: string, locationId: string): Promise<boolean>;
  /**
   * P14c: a quiet hour with her (`life/time_together`): the slot is held and the scene opens at the pastime's place (origin `activity`, like
   * `talkAt`). Refused (with a toast, spending nothing) with `pastimeProblem`'s reason or while the slot cannot be spent.
   */
  life: { timeTogether(unitId: string, pastimeId: string): Promise<boolean> };
  /** The hub's END: after a confirmation, passes the slot (a quiet night is slept through instead). */
  endSlot(): Promise<void>;
  /** Recruits a grunt (BASE tab) and, if enabled, asks for a generated name and bio. */
  recruitGrunt(): Promise<EngineEvent[]>;
  /** P14: REROLL of a grunt's generated name (`flavor.grunt`, free). */
  rerollGrunt(unitId: string): Promise<void>;
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
  /** P14: the one place that asks the model: failure records, RETRY and REROLL. Controllers bind their sites' handlers here. */
  generations: Envelope;
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
  /** Dilemmas (P6): answers the requests the engine opens and takes the player's pick. */
  dilemmas: DilemmaController;
  /** Refusals, Leash directives and decision aftermath in scenes (P6). */
  loyalty: LoyaltyController;
  /** Stance and threat directives (P9). */
  discipline: DisciplineController;
  /** P9d: rule proposals (wording, delivery, the three answers). */
  bonds: BondsController;
  /** P9c: personal pressure: edits of the commander's messages, bookings, claims. */
  personal: PersonalController;
  /** P12: the wording of what the special traits decided (Secret Frequency fragments). */
  special: SpecialController;
  /** P9b: squad votes (the VOTE flow, ballot wording) and the grudge directives. */
  power: PowerController;
  /** P11: the prologue's scenes, coach hints and guided evening. */
  onboarding: OnboardingController;
  /**
   * Files a Leash request through the oversight form, then runs the action. Refused (with a toast) before the form
   * opens when it cannot apply; resolves false when withdrawn or refused by the engine.
   */
  fileLeash(kind: LeashKind, unitId: string): Promise<boolean>;
}

/** The answer of the connection test (SYS › PING): the echo, or why the call failed (`describeFailure` words it). */
export type PingResult = { ok: true; echo: string } | { ok: false; reason: FailReason; detail: string };

export interface AppDeps {
  loadContent: () => Promise<{ registries: Registries; errors: ContentError[]; lorebook?: Lorebook | null; art?: { hub: string[] } }>;
  shellFactory?: typeof createShell;
  /** URL of a file shipped with the extension (the optional world map image). */
  assetUrl?: (path: string) => string;
  /** How long the oversight form's "review" takes (default 1800 ms, 0 with reduced motion); tests pass 0. */
  leashDelayMs?: number;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createApp(st: StAdapter, deps: AppDeps): AliusApp {
  registerCoreProviders(); // P7a: the readings of the analysis panel
  const context = new ContextBuilder();
  let registries: Registries = emptyRegistries();
  let contentErrors: ContentError[] = [];
  let lorebook: Lorebook | null = null;
  /** The hub art the packs declare (extension-relative paths); none declared = the blueprint, nothing requested. */
  let hubArt: string[] = []; // installed into new campaigns by deployCampaign (P1 Task 8)
  let load: LoadResult = { kind: 'none' };
  let state: CampaignState | null = null;
  let saver: ReturnType<typeof createSaver> | null = null;
  let started = false;
  /** The open intake wizard and the chat it was opened in (the only chat that "bind" may write to). */
  let setup: { wizard: Wizard; chatId: string | null; createdGroupId?: string } | null = null;

  const toast = (kind: ToastKind, text: string, opts?: ToastOpts) => shell.toast(kind, text, opts);
  /** What the corporation's oversight office says: Leash requests, outcomes and the weekly refill. */
  const OVERSIGHT: ToastOpts = { voice: VOICE_OF.oversight };

  const corporationName = (s: CampaignState): string | undefined => {
    const id = s.commander.corporationId;
    return id ? (registries.corporations.get(id)?.name as string | undefined) : undefined;
  };

  function applyContext(): void {
    // P8: the world directives follow the open scene, the days known and a live option change, so they are refreshed with every render
    if (state) {
      worldDirectives(context, state, registries);
      disciplineDirectives(context, state, registries); // P9: the stance of every unit in the open scene replaces her band text
      bondsDirectives(context, state, registries); // P9d: the content exclusion and the present units' own limits
      refreshPowerDirectives(context, state, registries); // P9b: a unit the commander overruled in a vote may push back
      refreshPersonalDirectives(context, state, registries); // P9c: courting, a claim, peeled decor and a booking
      refreshSpecialDirectives(context, state, registries); // P12: a soldier who senses static around the commander
      refreshLifeDirectives(context, state, registries); // P14c: news she has for the commander (a derived `life:` directive, gone once told)
      refreshBlockingDirectives(context, state, registries); // P15a: the limits and the point of view of the blocking (nothing while it is not live)
      refreshPhysicsDirectives(context, state, registries); // P15a: her rhythm, what she expects and the last stretch of a running hold
    } else {
      clearBlockingDirectives(context);
      clearMomentDirectives(context);
      clearPhysicsDirectives(context);
      clearLifeDirectives(context);
      clearPersonalDirectives(context);
      clearSpecialDirectives(context);
      clearPowerDirectives(context);
      bondsDirectives(context, null, registries);
      clearWorldDirectives(context);
      clearDisciplineDirectives(context);
    }
    context.apply(st, state, getSettings(st).contextTokenCap, state ? memoryConfig(state).memoryTokens : 0); // P3b: the memory share of the block
  }

  registerSceneContext(context, { registries: () => registries, settings: () => getSettings(st) });
  registerWorldContext(context, { registries: () => registries });
  registerBlockingContext(context, { registries: () => registries }); // P15a: the [BLOCKING] block (scene group, priority 88, core)
  registerDevelopmentContext(context, { registries: () => registries }); // P14b: the since-joining block (memory group, priority 68)
  registerMemoryContext(context, { registries: () => registries, settings: () => getSettings(st) }); // P3b: dossier, journal, facts, promises, recent, DM recap
  registerWorldOptionsContext(context, { registries: () => registries });

  /** The COMMS tab shows how many messages from units are unread. */
  /** P11: the tabs the prologue has not opened yet read OFFLINE (no campaign, an old one or a finished prologue: all open). */
  function syncLocks(): void {
    const locked = deviceTabLocks(state, registries, TAB_IDS, state ? lockedTabs(state, registries) : new Set<string>()); // P15a: the device is out of reach while hands are busy or the face is covered
    for (const id of TAB_IDS) shell.setTabLocked(id, locked.has(id));
  }

  /** P15a: the muffle follows the commander's ears and a bell rings on a move (nothing before the sound exists or without a state). */
  function syncSound(events: EngineEvent[]): void {
    sound.setMuffle(muffled(state, registries));
    for (const id of bellsFor(events, state, registries)) sound.play(id as SoundId);
  }

  /** P11: a tab that just came online says so, in the terminal voice. */
  function announceUnlocks(before: CampaignState, after: CampaignState): void {
    for (const row of unlockedBetween(before, after, registries)) toast('info', String(row.notice), { voice: VOICE_OF.toast });
  }

  function syncBadges(): void {
    syncLocks();
    shell.setTabBadge('comms', state ? unreadCount(state) : 0);
    shell.setTabBadge('home', state ? unreadNotes(state) : 0); // P10b: notes nobody has read
    // new story and command offers since the OPS tab was last shown
    const fresh = state ? state.missions.offered.filter((m) => (m.source === 'command' || m.source === 'story') && !seenOffers.has(m.id)).length : 0;
    shell.setTabBadge('ops', fresh);
    shell.setTabBadge('sys', generationBadge(state)); // P14: failed generations that wait for a retry
  }
  const seenOffers = new Set<string>();

  /** The Romance and initiative settings are global; the pure engine reads them from the campaign. */
  function syncIntimacy(): void {
    if (!state || load.kind !== 'ok') return;
    const s = getSettings(st);
    const cur = intimacySetting(state); // the stored setting, not the vow's override
    if (cur.romance === s.romance && cur.initiative === s.romanticInitiative) return;
    api.dispatch({ type: 'campaign/set_intimacy', payload: { romance: s.romance, initiative: s.romanticInitiative } }, { expectChatId: st.getActiveChat()?.chatId });
  }

  /** The beat cooldown is a global setting; the pure engine reads its mirror in the campaign. */
  function syncBeatCooldown(): void {
    if (!state || load.kind !== 'ok') return;
    const days = getSettings(st).beatCooldownDays;
    if (state.settings.beatCooldownDays === days) return;
    api.dispatch({ type: 'campaign/set_beat_cooldown', payload: { days } }, { expectChatId: st.getActiveChat()?.chatId });
  }

  /** P15a: the scene settings (moment frequency, real-time physics, …) are global; the pure engine reads their mirror in the campaign. */
  function syncSceneSettings(): void {
    if (!state || load.kind !== 'ok') return;
    const patch = sceneSettingsPatch(state, getSettings(st));
    if (patch === null) return;
    api.dispatch({ type: 'campaign/set_scene_settings', payload: patch }, { expectChatId: st.getActiveChat()?.chatId });
  }

  /** P14c: whether units may start DMs is a global setting; the engine decides the channel of her news with its mirror in the campaign. */
  function syncUnitDms(): void {
    if (!state || load.kind !== 'ok') return;
    const on = getSettings(st).unitDms;
    if (state.settings.unitDms === on) return;
    api.dispatch({ type: 'campaign/set_unit_dms', payload: { on } }, { expectChatId: st.getActiveChat()?.chatId });
  }

  /** P7: the first-impression decay is a global setting; the pure engine reads its mirror in the campaign. */
  function syncFirstImpressionTau(): void {
    if (!state || load.kind !== 'ok') return;
    const days = getSettings(st).firstImpressionTau;
    if (state.settings.firstImpressionTau === days) return;
    api.dispatch({ type: 'campaign/set_first_impression_tau', payload: { days } }, { expectChatId: st.getActiveChat()?.chatId });
  }

  /** P8: the confidence setting is global; the pure engine moves the disposition floors with its mirror in the campaign. */
  function syncMinConfidence(): void {
    if (!state || load.kind !== 'ok') return;
    const value = getSettings(st).intentMinConfidence;
    if (state.settings.intentMinConfidence === value) return;
    api.dispatch({ type: 'campaign/set_min_confidence', payload: { value } }, { expectChatId: st.getActiveChat()?.chatId });
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
  /** P9c: the DM edit that waits for KEEP or REVERT (the COMMS tab shows it); set by the `edit` UI event and by a reload that finds one. */
  let pendingEdit: EditView | null = null;
  const routeUi = (e: SceneUiEvent): void => {
    if (e.type === 'edit') {
      pendingEdit = { id: e.interceptId, editorId: e.editorId, toUnitId: e.unitId, original: e.original, edited: e.edited };
      shell.open();
      shell.showTab('comms');
      shell.refresh();
      return;
    }
    sceneScreen?.handle(e);
  };
  const generations = createEnvelope({
    st,
    settings: () => getSettings(st),
    registries: () => registries,
    state: () => state,
    chatId: () => st.getActiveChat()?.chatId,
    dispatch: (a, o) => api.dispatch(a, o),
    restoreSnapshot: (snap, expected) => api.restoreSnapshot(snap, expected),
    contentLine: () => contentLine(state, registries),
    toast: (kind, text) => toast(kind, text),
  });
  // P14: what every surface needs to draw its failure chips and REROLL buttons (its buttons call the envelope)
  const genUi: GenerationUi = {
    generations,
    modal: async (o) => {
      // a modal cancels the open one: the decision's own modal would be lost under the retry menu opened from its chip
      const reopen = dilemmaModalOpen;
      const answer = await shell.modal(o);
      if (reopen && state?.dilemmas?.open) {
        dilemmaModalOpen = false;
        openDilemmaModal();
      }
      return answer;
    },
    settings: () => getSettings(st),
    toast: (kind, text) => toast(kind, text),
    redraw: () => { drawDilemma(); shell.refresh(); },
  };
  // the sites the app itself owns (no controller): the vignette after a companion activity, a grunt's name, an enemy's name
  generations.bind<VignetteInput, string>('activity.vignette', {
    build(key) {
      const [activityId, unitId, day, slot] = key.split(':');
      const s = state;
      const unit = s?.squad.find((u) => u.id === unitId);
      const activity = registries.activities.get(activityId);
      if (!s || !unit || !activity) return { expired: 'She is not here.' };
      if (slotIndex(s.day, s.slot) - slotIndex(Number(day), slot as CampaignState['slot']) > 1) return { expired: 'That moment has passed.' }; // the activity itself spent a slot
      return {
        activityName: String(activity.name),
        commanderName: s.commander.name,
        unitName: unit.displayName,
        unitRole: SHORT_NAME(registries, 'roles', unit.roleId),
        likes: likesOf(unit),
        defectNames: unit.defects.map((d) => SHORT_NAME(registries, 'defects', d.id)),
        memory: vignetteMemory(s, registries, unit.id, [...likesOf(unit), ...dislikesOf(unit)]), // P3b: two facts about her and her journal
      };
    },
    parse: (raw) => sanitizeVignette(String(raw)),
    apply(_key, text) {
      toast('story', text);
      return 'ok';
    },
  });

  // the connection test of SYS (no record: the toast says what happened)
  generations.bind<string, { pong: true; echo: string }>('sys.ping', { build: (key) => key, apply: () => 'ok' });

  generations.bind<GruntFlavorInput, { name: string; bio: string }>('flavor.grunt', {
    build(unitId) {
      const unit = state?.squad.find((u) => u.id === unitId);
      if (!state || !unit || unit.kind !== 'grunt' || unit.status === 'dead') return { expired: 'She left service.' };
      return {
        kind: 'grunt',
        designation: unit.designation ?? unit.displayName,
        roleName: SHORT_NAME(registries, 'roles', unit.roleId),
        defectName: SHORT_NAME(registries, 'defects', unit.defects[0]?.id ?? ''),
      };
    },
    parse: (raw) => sanitizeGruntFlavor(raw),
    apply(unitId, flavor) {
      // cosmetic: if the chat changed or the engine refuses, the grunt simply keeps her name
      const unit = state?.squad.find((u) => u.id === unitId);
      const r = api.dispatch({ type: 'squad/set_flavor', payload: { unitId, ...flavor } }, { expectChatId: st.getActiveChat()?.chatId });
      if (r.some((e) => e.type === 'error')) return { stale: true };
      toast('info', `${unit?.designation ?? unitId} goes by ${flavor.name}.`);
      return 'ok';
    },
    committed: (unitId) => (state?.squad.some((u) => u.id === unitId && u.kind === 'grunt' && u.status !== 'dead') ? null : 'She left service.'),
  });

  generations.bind<EnemyFlavorInput, { name: string }>('flavor.enemy', {
    build(nameKey) {
      const c = state?.combat?.combatants.find((x) => x.side === 'enemy' && x.enemyId && x.nameKey === nameKey);
      if (!state || !c || !c.enemyId || state.enemyNames?.[nameKey]) return { expired: 'It is named already.' };
      const affixes = (nameKey.split('|')[1] ?? '').split(',').filter((a) => a !== '');
      const tpl = registries.enemies.get(c.enemyId);
      return {
        kind: 'enemy',
        archetypeName: String(tpl?.name ?? c.enemyId),
        categoryName: String(registries.enemyCategories.get(String(tpl?.categoryId))?.name ?? ''),
        affixNames: affixes.map((a) => String(registries.affixes.get(a)?.adjective ?? a)),
      };
    },
    parse: (raw) => sanitizeEnemyFlavor(raw),
    apply(key, r) {
      const events = api.dispatch({ type: 'combat/set_enemy_name', payload: { key, name: r.name } }, { expectChatId: st.getActiveChat()?.chatId });
      return events.some((e) => e.type === 'error') ? { stale: true } : 'ok';
    },
  });

  /** P3b: folds old facts into dossiers, retells rumors, digests long scenes. */
  const memory = createMemoryController({ st, app: sceneApp, settings: () => getSettings(st), registries: () => registries, generations });
  const sceneDeps = {
    st,
    app: sceneApp,
    memory,
    restore: (before: CampaignState, expected: CampaignState) => api.restoreSnapshot(before, expected),
    generations,
    registries: () => registries,
    settings: () => getSettings(st),
    contentLine: () => contentLine(state, registries), // P9d: the same text as the `content` directive, for the prose calls
    toast: (kind: 'info' | 'warn' | 'error', text: string) => toast(kind, text),
    onUi: routeUi,
    onUnitReply: (unitId: string, text: string) => { personal.onReply(unitId, text); }, // P9c: her first reply answers a question she lost
    onCommanderLine: (text: string) => { life.onCommanderLine(text); }, // P14c: a keyword in the commander's line brings a topic up (her opinions)
  };
  const scene = createSceneController(sceneDeps);
  // P15a: the real-time layer of the contact physics: its segments run on their own clock and never wait for the model
  const staging = createStaging({
    app: sceneApp, registries: () => registries, settings: () => getSettings(st), generations,
    scene: { replyPending: () => scene.replyPending(), end: () => scene.end() },
    now: () => Date.now(), toast: (kind, text) => toast(kind, text),
  });
  const stagingClock = setInterval(() => staging.tick(Date.now()), 250) as unknown as { unref?: () => void };
  stagingClock.unref?.(); // never keeps a process alive on its own
  const comms = createComms({ ...sceneDeps, scene, personal: { beforeSend: (u, t) => personal.beforeSend(u, t), answerEdit: (k) => personal.answerEdit(k), onReply: (u, t) => personal.onReply(u, t) } });
  const worldDeps = {
    st,
    app: sceneApp,
    registries: () => registries,
    settings: () => getSettings(st),
    generations,
    contentLine: () => contentLine(state, registries),
    toast: (kind: 'info' | 'warn' | 'error', text: string) => toast(kind, text),
  };
  const director = createDirector(worldDeps);
  const dilemmas = createDilemmas({ ...worldDeps, requestVote: (a) => power.requestVote(a), judge: { needsJudge: (a) => warden.needsJudge(a), judgeThen: (a) => warden.judgeThen(a) } });
  const loyalty = createLoyalty({ ...worldDeps, context, refreshContext: applyContext });
  const power = createPower({
    ...worldDeps, context, refreshContext: applyContext,
    // the VOTE panel (P9b): a modal in the corporate voice; closing it unanswered cancels the vote
    startScene: (o) => beginScene(o),
    showVote: (vote, lines) => new Promise<VoteChoice>((resolve) => {
      const host = h('div');
      let answered = false;
      const answer = (c: VoteChoice): void => {
        if (answered) return;
        answered = true;
        shell.closeModal?.();
        resolve(c);
      };
      const s = state;
      if (!s) { resolve({ choice: 'cancel' }); return; }
      renderVotePanel(host, vote, lines, {
        state: s, registries,
        onCarry: () => answer({ choice: 'carry' }),
        onDrop: () => answer({ choice: 'accept' }),
        onOverrule: (means, punish) => answer({ choice: 'overrule', means, ...(punish !== undefined ? { punish } : {}) }),
      });
      shell.open();
      void shell.modal({ title: 'SQUAD VOTE', body: host, actions: [] }).then(() => {
        if (!answered) { answered = true; resolve({ choice: 'cancel' }); }
      });
    }),
  });
  const special = createSpecial({
    ...worldDeps, context, refreshContext: applyContext,
    notice: (kind, text, title, source) => toast(kind, text, { voice: VOICE_OF[source], title }), // P12: the device's own readout
    cutIn: (text) => { const root = document.getElementById('alius-shell'); if (root) cutIn(root, 'frequency', text); },
  });
  const warden = createWarden({
    ...worldDeps, context, refreshContext: applyContext,
    // P13: a rewind puts the day-start state back, then everything that hangs on the state (the scene, the combat, the modals) is picked up afresh
    act: (a) => act(a), // P13: the judged action goes through the app's own path (votes, refusal toasts)
    startScene: (o) => beginScene(o), // P13: the ARGUE scene with the warden
    restore: (snap, expected) => {
      if (!api.restoreSnapshot(snap, expected)) return false;
      afterLoad();
      return true;
    },
  }); // P13: the warden's agenda, the day-start snapshot, the rewind and the epilogue
  const headStart = createHeadStart({ ...worldDeps, context, refreshContext: applyContext }); // P11b: the recap of the first weeks and the first scene's opening
  const development = createDevelopment({ ...worldDeps, context, refreshContext: applyContext }); // P14b: the weekly review of how she has changed
  const life = createLife({ ...worldDeps, context, refreshContext: applyContext }); // P14c: her DMs and notes about what happened to her, and her news directives
  const discipline = createDiscipline({ ...worldDeps, context, refreshContext: applyContext, startScene: (o) => beginScene(o), requestVote: (a) => power.requestVote(a) });
  const bonds = createBonds({ ...worldDeps, context, refreshContext: applyContext, startScene: (o) => beginScene(o) });
  const personal = createPersonal({
    ...worldDeps, context, refreshContext: applyContext, startScene: (o) => beginScene(o),
    // a wager was decided: its result card (who won, what the game showed, what the stake did)
    onWagerResult: (result) => {
      const s = state;
      if (!s) return;
      const host = h('div');
      host.append(renderWagerCard(s, registries, result));
      shell.open();
      void shell.modal({ title: 'WAGER', body: host, actions: [{ label: '[ OK ]', value: 'ok' }] });
    },
    // she claimed the commander in public: the card is answered at once (LET IT STAND or REFUSE PUBLICLY)
    onClaim: (unitId) => {
      const s = state;
      const claim = [...(s?.personal?.claims ?? [])].reverse().find((c) => c.unitId === unitId);
      if (!s || !claim) return;
      const host = h('div');
      const done = (): void => { shell.closeModal?.(); };
      host.append(renderClaimCard(s, registries, claim, {
        onLetStand: (id) => { personal.answerClaim(id, false); done(); },
        onRefuse: (id) => { personal.answerClaim(id, true); done(); },
      }));
      shell.open();
      void shell.modal({ title: 'CLAIMED', body: host, actions: [] });
    },
    // a squad secret came out: its card is answered at once (or after a reload, until it is)
    onSecretFound: (secretId) => {
      const s = state;
      const secret = s?.personal?.secrets?.find((x) => x.id === secretId);
      if (!s || !secret || secret.status !== 'found') return;
      const host = h('div');
      host.append(renderSecretCard(s, registries, secret, (choice, id) => { shell.closeModal?.(); personal.answerSecret(id, choice); }));
      shell.open();
      void shell.modal({ title: 'SQUAD SECRET', body: host, actions: [] });
    },
    // an edited request (P9c): the commander keeps the edit (nothing is filed) or reverts it
    confirmEdit: async (p) => {
      shell.open();
      const answer = await shell.modal({
        title: `EDITED BY ${p.editorName.toUpperCase()}`, body: p.text,
        actions: [{ label: '[ KEEP ]', value: 'keep' }, { label: '[ REVERT ]', value: 'revert' }],
      });
      return answer === 'keep' ? 'keep' : 'revert';
    },
  });
  /** P9d: the three answers to a rule proposal, from a scene or the COMMS thread. */
  const answerRule = (ruleId: string, how: 'accept' | 'negotiate' | 'refuse'): void => {
    if (how === 'negotiate') void bonds.negotiateRule(ruleId).then((ok) => { if (ok) shell.open(); });
    else void bonds.answerRule(ruleId, how);
  };
  const onboarding = createOnboarding({
    ...worldDeps, context, refreshContext: applyContext, startScene: (o) => beginScene(o), modal: (o) => shell.modal(o),
    endScene: async () => {
      await scene.end();
      leaveScene();
    },
    startOpening: () => scene.opening(),
    initiateDm: (unitId) => comms.initiate(unitId),
    talkAt: (unitId, locationId) => api.talkAt(unitId, locationId),
    debrief: (unitIds) => expedition.debrief(unitIds),
    openExpedition: (missionId) => {
      if (missionId !== undefined) expedition.plan({ missionId });
      showExpedition();
      shell.open();
    },
    // after a reload the card offers RESUME SCENE: the screen is the scene's, as `adoptScene` leaves it
    resumeScene: () => {
      scene.resume();
      showScene();
      shell.open();
    },
  });
  const expedition = createExpedition({ ...worldDeps, startCombat: (p) => api.startCombat(p), startScene: (o) => beginScene(o), requestVote: (a) => power.requestVote(a), judge: { needsJudge: (a) => warden.needsJudge(a), judgeThen: (a) => warden.judgeThen(a) } });
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
    shell.showScreen('hub');
  }

  /** After a (re)load: pick up an open scene, or leave the scene screen of another chat. */
  function adoptScene(): void {
    sceneScreen?.dispose();
    sceneScreen = null;
    // directives belong to one campaign's scene: never carry them into another chat
    clearSceneDirectives(context);
    context.clearMatching((d) => d.id === 'night' || d.id.startsWith('proposal:') || d.id.startsWith('ask:'));
    loyalty.onSceneClosed(); // refusal, band, trauma and aftermath directives belong to one scene of one campaign (P6)
    discipline.onSceneClosed(); // so do the stance and threat directives (P9)
    onboarding.onSceneClosed(); // and the prologue's goal and wrap directives (P11)
    headStart.onSceneClosed(); // and the head start's opening line (P11b)
    development.onSceneClosed(); // and a quiet change's cue (P14b)
    life.onSceneClosed(); // and what she had to tell (P14c); the chat switch also forgets which items were asked for
    if (state?.scene) {
      scene.resume();
      loyalty.onSceneOpened();
      discipline.onSceneOpened();
      onboarding.onSceneOpened();
      headStart.onSceneOpened();
      development.onSceneOpened();
      life.onSceneOpened();
      showScene();
    } else if (state && state.slot === 'night' && state.calendar.nightEvent && confrontationNight(state)) {
      showScene(); // a confrontation is waiting: its panel comes back after a reload
    } else if (onSceneScreen) {
      onSceneScreen = false;
      shell.showScreen('hub');
    }
    onboarding.onLoaded(); // the guide's first DM, if a reload lost it (P11)
    warden.onLoaded(); // P13: the agenda of a campaign just built or reloaded, and the reveal directive
    headStart.onLoaded(); // P11b: the recap of the first weeks, once
    void personal.onLoaded().then((ok) => { if (ok) shell.open(); }).catch((e) => console.warn('[Alius] booking failed', e)); // P9c: a booking that came due while the game was closed
    pendingEdit = null; // P9c: an edit of another chat is not this one's; a waiting one comes back from the state, freshly worded
    void personal.pendingEdit().then((edit) => { if (edit) { pendingEdit = edit; shell.refresh(); } }).catch((e) => console.warn('[Alius] edit failed', e));
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
    loyalty.onSceneOpened();
    discipline.onSceneOpened();
    onboarding.onSceneOpened();
    headStart.onSceneOpened();
    development.onSceneOpened();
    life.onSceneOpened();
    showScene();
    shell.open();
    return true;
  }

  /** The room the hub's TALK was pressed in: the next `offerScene` takes it instead of asking (used once). */
  let presetLocation: string | null = null;

  /** `talk`: where, and who else? Cancelling gives the slot back. */
  async function offerScene(unitId: string): Promise<void> {
    const chatId = st.getActiveChat()?.chatId;
    if (!state) return;
    const preset = presetLocation;
    presetLocation = null;
    const pick = preset !== null
      ? { locationId: preset, participants: [unitId] }
      : await pickLocation((o) => shell.modal(o), { registries, state, firstUnitId: unitId, candidates: state.squad });
    if (st.getActiveChat()?.chatId !== chatId) return;
    if (!pick) {
      api.dispatch({ type: 'calendar/cancel_scene', payload: {} }, { expectChatId: chatId });
      return;
    }
    await beginScene({ locationId: pick.locationId, participants: pick.participants, origin: 'activity' });
  }

  /** After a group meal: an optional scene with up to four of the squad that does not use a slot. */
  async function offerGroupScene(): Promise<void> {
    const chatId = st.getActiveChat()?.chatId;
    const s = state;
    if (!s) return;
    const named = (ids: string[]) => ids.map((id) => s.squad.find((u) => u.id === id)).filter((u) => u && u.kind === 'named' && u.status !== 'dead' && u.status !== 'deserted' && u.status !== 'terminated' && restrictionReason(s, u.id, 'scene') === null);
    // the squad lingering over the meal is the active roster; reserve and injured units are elsewhere
    const ids = [...new Set(named(s.roster.activeIds).map((u) => u!.id))].slice(0, TUNING.scene.maxParticipants);
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
      if (has('dilemma_requested')) {
        if (state?.dilemmas?.open?.context !== 'expedition_event') openDilemmaModal();
        void dilemmas.onRequested().catch(warn('dilemma'));
      }
      if (has('dilemma_presented') && state?.dilemmas?.open?.context !== 'expedition_event') openDilemmaModal();
      if (has('dilemma_resolved')) {
        loyalty.onEvents(events);
        suggestTalk(events);
      }
      if (has('expedition_event')) requestExpeditionDilemma(events);
      if (has('combat_ended')) {
        if (state?.dilemmas?.open?.status === 'requested') void dilemmas.onRequested().catch(warn('dilemma'));
        resolveMutinyIfDue();
      }
      if (events.some((e) => e.type === 'desertion_attempt' && e.at === 'mission_start')) openConfrontationModal();
      for (const e of events) {
        if (e.type === 'mutiny_escaped') {
          const gone = [String(e.unitId), ...((e.sympathizers as string[] | undefined) ?? [])];
          for (const id of gone) removeFromChat(id, `${state?.squad.find((u) => u.id === id)?.displayName ?? 'A unit'} HAS DESERTED`);
        }
        if (e.type === 'unit_deserted') removeFromChat(String(e.unitId), `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} HAS DESERTED`);
        if (e.type === 'unit_terminated') removeFromChat(String(e.unitId), `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} DEACTIVATED`);
      }
      staging.onEvents(events); // P15a: a hold that starts asks for her cues and gets its first segment; a blackout ends the scene
      if (applyMomentDirectives(context, events, state, registries) || applyPhysicsDirectives(context, events, state, registries)) applyContext(); // P15a: the tension of a moment, or what the commander chose, for her next reply
      discipline.onEvents(events);
      bonds.onEvents(events); // P9d: a new rule proposal is worded and delivered
      personal.onEvents(events); // P9c: a clash of bookings, a claim, a peeled decor
      power.onEvents(events); // P9b: a grudge that starts or ends changes the scene directives
      special.onEvents(events); // P12: a new frequency fragment is worded
      warden.onEvents(events); // P13: a new warden is asked for her agenda
      development.onEvents(events); // P14b: a formed habit may be worded
      life.onEvents(events); // P14c: news delivered, gone stale or told changes the directives
      onboarding.onEvents(events); // the line-up and first words: the cap question and the step completing when the scene closes (P11)
      if (has('campaign_ended')) {
        shell.showScreen('hub'); // P13: the END screen takes the hub's place; nothing else of the campaign can change now
        shell.open();
      }
      if (has('scene_ended') && state?.lastWake && !state.scene) {
        // P15a: a blackout cut the scene: where the commander came to, shown once
        const card = wakeCard(state, registries);
        if (card) void shell.modal({ title: 'You come to', body: card, actions: [{ label: 'OK', value: 'ok' }] }).then(() => api.dispatch({ type: 'physics/wake_seen', payload: {} }, { expectChatId: chatId }));
      }
      if (has('scene_ended') || has('scene_aborted')) {
        loyalty.onSceneClosed();
        discipline.onSceneClosed();
        headStart.onSceneClosed();
        development.onSceneClosed();
        life.onSceneClosed();
      }
      if (has('commander_injured')) api.dispatch({ type: 'relations/commander_injured', payload: {} }, { expectChatId: chatId });
      if (has('night_started') && state?.slot === 'night' && !state.scene) {
        showScene();
        shell.open();
      }
      if (has('slot_advanced')) void comms.onSlotAdvanced().catch(warn('unit DMs'));
      if (has('slot_advanced')) void discipline.onSlotAdvanced().catch(warn('demands'));
      if (has('slot_advanced')) void personal.onSlotAdvanced().then((ok) => { if (ok) shell.open(); }).catch(warn('booking')); // P9c: a booking she made opens its scene (the smother hold's too)
      if (has('director_requested') || (has('combat_ended') && state?.world.director?.pending)) void director.onRequested().catch(warn('director'));
      if (has('rumors_requested')) api.dispatch({ type: 'director/request', payload: { reason: 'scout' } }, { expectChatId: chatId });
      if (has('expedition_ended')) {
        showExpedition();
        shell.open();
        startRecap();
      }
      if (has('day_started')) void runCompaction({ st, app: sceneApp, settings: () => getSettings(st), generations }).catch(warn('chronicle compaction'));
      // P3b: what the memory owes after any change (a fold is due, a rumor waits for its retelling); one fold per run, so a fold asks again
      if (events.length > 0 && !has('error')) void memory.run().catch(warn('memory'));
      if (events.length > 0 && !has('error')) void development.run().catch(warn('development')); // P14b: one due review per run (quiet)
      if (events.length > 0 && !has('error')) void life.run().catch(warn('life')); // P14c: one waiting DM or note of hers per run (quiet)
      if (has('memory_folded')) setTimeout(() => void memory.run().catch(warn('memory')), 0);
    });
  }

  /** The scene screen, or the night knock when the Night slot waits for an answer. */
  function renderSceneView(host: HTMLElement): void {
    sceneScreen?.dispose();
    sceneScreen = null;
    const s = state;
    if (s?.scene) {
      sceneScreen = renderSceneScreen(host, {
        controller: scene, getState: () => state, registries, st, settings: () => getSettings(st), onEnded: leaveScene, sound,
        assetUrl: deps.assetUrl, // P10c: backdrops live in the extension folder
        generation: genUi,
        onOrder: (unitId) => loyalty.order(unitId),
        onCompel: (unitId) => void api.fileLeash('compel', unitId),
        onPunish: (unitId, measure, days) => void discipline.punish(unitId, measure, days),
        onUndoDiscipline: (id) => void discipline.undo(id),
        onAnswerDemand: (id, answer) => void discipline.answerDemand(id, answer),
        onAnswerRule: answerRule,
        onStage: (action) => { scene.stage(action); }, // P15a: a BLOCKING chip goes through the scene controller (the swipe rebases on it)
        physics: { // P15a: the hold panel's inputs go to the staging controller, never through `stage` (a hold is not rolled back by a swipe)
          input: (i) => staging.input(i), endSegment: () => staging.endSegment(), stopWord: () => staging.stopWord(), skip: (st) => staging.skip(st), stimulus: (w, k, d) => staging.stimulus(w, k, d), act: (k) => staging.act(k), finishCounted: (n) => staging.finishCounted(n), cue: (k, b) => staging.cue(k, b), beat: () => staging.beat(),
          keystroke: () => staging.keystroke(), typed: (chars, beat) => staging.typed(chars, beat),
          onTap: () => { const failed = api.dispatch({ type: 'physics/signal', payload: {} }, { expectChatId: st.getActiveChat()?.chatId }).find((e) => e.type === 'error'); if (failed) toast('warn', String(failed.message ?? failed.code)); },
        },
        onPastime: (_unitId, pastimeId) => { // P14c: the "let's ..." of the scene; the pastime's own checks refuse what does not fit
          const events = api.dispatch({ type: 'life/pastime_in_scene', payload: { pastimeId } }, { expectChatId: st.getActiveChat()?.chatId });
          const failed = events.find((e) => e.type === 'error');
          if (failed) toast('warn', String(failed.message ?? failed.code));
          else sceneScreen?.refresh();
        },
      });
      return;
    }
    const entry = s && s.slot === 'night' ? s.calendar.nightEvent : undefined;
    if (s && entry && confrontationNight(s)) {
      renderConfrontationPanel(host);
      return;
    }
    if (s && entry) {
      // P10b: a knock that is not a confrontation is the night door (one exchange through it, a timer, a silhouette)
      const drawDoor = (): void => {
        const now = state;
        const current = now && now.slot === 'night' ? now.calendar.nightEvent : undefined;
        if (!now || !current || now.scene || confrontationNight(now)) return;
        const unit = now.squad.find((u) => u.id === current.unitId);
        const settings = getSettings(st);
        renderDoor(host, {
          entry: current, unitName: unit?.displayName ?? 'Someone',
          ...(unit ? { silhouette: () => unitPortrait(st, unit, { palette: settings.palette, dither: false, size: 220 }) } : {}),
          seconds: settings.doorTimer, motion: !motionReduced(settings), readable: settings.readableMode, sound,
          onOpen: () => void comms.openNight().then(() => { if (state?.scene) showScene(); }),
          onSay: (text) => comms.throughDoor(text),
          onSilent: () => {
            comms.ignoreNight();
            leaveScene();
          },
          onChanged: drawDoor,
        });
      };
      drawDoor();
      return;
    }
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO SCENE OPEN'),
      h('button', { type: 'button', class: 'alius-btn', onclick: leaveScene }, '[ BACK ]')));
  }


  // ---------------------------------------------------------------------------------------------- dilemmas and loyalty (P6)

  /** A decision that is waiting at the base is a modal over the PDA; inside a run the expedition screen shows it. */
  let dilemmaHost: HTMLElement | null = null;
  let dilemmaModalOpen = false;

  /** Renders the open base dilemma into its host, or closes the modal when nothing is waiting. */
  function drawDilemma(): void {
    const s = state;
    const open = s?.dilemmas?.open;
    if (!s || !open || open.context === 'expedition_event') {
      if (dilemmaModalOpen) shell.closeModal?.();
      dilemmaModalOpen = false;
      dilemmaHost = null;
      return;
    }
    dilemmaHost ??= h('div');
    renderDilemma(dilemmaHost, {
      title: open.title ?? 'DECISION', setup: open.setup ?? '', scale: open.scale, waiting: open.status === 'requested',
      options: dilemmaOptions(s, registries), onChoose: (i, route) => void dilemmas.choose(i, route),
      unitName: (id) => s.squad.find((u) => u.id === id)?.displayName ?? id,
      scapegoat: scapegoatView(s, registries),
      herPick: herPickView(s, registries), // P9c: a day the commander obeys her
      generation: { ui: genUi, state: s, id: open.id },
    });
  }

  function openDilemmaModal(): void {
    if (reviewOpen) return; // shown again when the review closes
    drawDilemma();
    if (!dilemmaHost || dilemmaModalOpen) return;
    dilemmaModalOpen = true;
    shell.open();
    void shell.modal({ title: 'DECISION', body: dilemmaHost, actions: [] }).then(() => { dilemmaModalOpen = false; });
  }

  /** After a decision that moved people: name them and offer a talk (it does not use a slot). */
  function suggestTalk(events: EngineEvent[]): void {
    const resolved = events.find((e) => e.type === 'dilemma_resolved' && Array.isArray(e.affected) && e.affected.length > 0);
    const s = state;
    if (!resolved || !s || s.scene || s.combat || s.expedition) return;
    const ids = (resolved.affected as string[]).filter((id) => {
      const u = s.squad.find((x) => x.id === id);
      return u !== undefined && u.kind === 'named' && isLiving(u) && restrictionReason(s, id, 'scene') === null; // not the one in the brig
    }).slice(0, TUNING.scene.maxParticipants);
    if (ids.length === 0) return;
    const names = ids.map((id) => s.squad.find((u) => u.id === id)!.displayName).join(', ');
    toast('info', `Your decision "${String(resolved.title)}" moved ${names}.`);
    const chatId = st.getActiveChat()?.chatId;
    void shell.modal({
      title: 'Talk it over?',
      body: `${names} reacted to what you decided. Talk with them now? This does not use a slot.`,
      actions: [{ label: '[ TALK ]', value: 'talk' }, { label: 'Later', value: 'later' }],
    }).then((answer) => {
      if (answer === 'talk' && st.getActiveChat()?.chatId === chatId) {
        void beginScene({ locationId: 'mess_hall', participants: ids, origin: 'event', consumesSlot: false });
      }
    });
  }

  /** A pinned expedition event that generates becomes a dilemma (the expedition screen shows it). */
  function requestExpeditionDilemma(events: EngineEvent[]): void {
    const ev = events.find((e) => e.type === 'expedition_event');
    if (!ev || !getSettings(st).dilemmasEnabled) return;
    const template = registries.dilemmaTemplates.get(String(ev.templateId));
    if (template?.generate === undefined || state?.dilemmas?.open) return;
    api.dispatch({ type: 'dilemma/request', payload: { templateId: String(ev.templateId), context: 'expedition_event' } }, { expectChatId: st.getActiveChat()?.chatId });
  }

  /** The night entry is a desertion, mutiny or return waiting for its panel. */
  function confrontationNight(s: CampaignState): boolean {
    const entry = s.calendar.nightEvent;
    if (entry?.kind === HANDLER_VISIT_KIND) return true; // P12: the handler's visit has its own panel too
    const open = s.disloyalty?.open;
    return entry !== undefined && open !== undefined && open.unitId === entry.unitId && (CONFRONTATION_KINDS as readonly string[]).includes(entry.kind);
  }

  /** What follows an answer to a confrontation: the panel again while it is still open, else back to the PDA (or the next knock). */
  function afterConfrontation(close?: () => void): void {
    const still = state?.disloyalty?.open;
    if (still) {
      // a modal body is rendered once (and a Suppress form replaces the modal): bring the panel back
      if (still.at === 'mission_start') openConfrontationModal();
      else shell.refresh();
      return;
    }
    close?.();
    if (onSceneScreen) leaveScene();
    else shell.refresh();
  }

  /** Fills `host` with the panel of the open confrontation. */
  function renderConfrontationPanel(host: HTMLElement, close?: () => void): void {
    const s = state;
    if (s?.calendar.nightEvent?.kind === HANDLER_VISIT_KIND) {
      // P12: the rival corporation's handler at the gate: one answer for every item, then the night is spent
      const visitId = s.special?.debts?.visit?.id ?? '';
      renderHandlerPanel(host, {
        state: s, reg: registries,
        onAnswer: (answers) => void special.answerVisit(visitId, answers).then((ok) => {
          if (!ok) return;
          close?.();
          if (onSceneScreen) leaveScene();
          else shell.refresh();
        }),
      });
      return;
    }
    const open = s?.disloyalty?.open;
    if (!s || !open) return;
    const unit = s.squad.find((u) => u.id === open.unitId);
    const name = unit?.displayName ?? 'Someone';
    const entry = s.calendar.nightEvent?.id === open.nightEntryId ? s.calendar.nightEvent : undefined;
    const answer = (type: string, payload?: unknown) => {
      act({ type, payload });
      afterConfrontation(close);
    };
    renderConfrontation(host, {
      kind: open.kind, unitName: name,
      framing: entry?.framing ?? (open.kind === 'desertion' ? `${name} is about to walk out.` : open.kind === 'mutiny' ? `${name} is about to attack.` : `${name} is at the gate.`),
      talkTried: open.talkTried === true,
      ranks: { authority: s.commander.socialStats.authority, empathy: s.commander.socialStats.empathy },
      leashLeft: s.leash.authorizationsLeft,
      canFight: open.kind === 'mutiny' && loyalUnits(s, open.unitId).length > 0,
      canTakeBack: s.squad.filter(isLiving).length >= s.roster.capacity ? `The barracks are full (${s.roster.capacity} beds).` : null,
      onTalk: (stat) => answer('loyalty/talk_down', { stat }),
      onLetGo: () => answer('loyalty/let_go'),
      onSuppress: () => void api.fileLeash('suppress', open.unitId).then(() => afterConfrontation(close)),
      onFight: () => fightMutiny(open.unitId),
      onYield: () => answer('loyalty/yield'),
      onTakeBack: () => answer('loyalty/take_back'),
      onTurnAway: () => answer('loyalty/turn_away'),
    });
  }

  /** A desertion that stops a departure is a modal over whatever screen is up. */
  function openConfrontationModal(): void {
    const open = state?.disloyalty?.open;
    if (!open || open.at !== 'mission_start' || reviewOpen) return;
    const host = h('div');
    const close = () => shell.closeModal?.();
    renderConfrontationPanel(host, close);
    shell.open();
    void shell.modal({ title: open.kind === 'mutiny' ? 'MUTINY' : 'DESERTION', body: host, actions: [] });
  }

  /** [FIGHT]: the loyal units stand with the commander in the default formation, the first one covers him. */
  function fightMutiny(unitId: string): void {
    const s = state;
    if (!s) return;
    const ids = loyalUnits(s, unitId).slice(0, 4);
    const formation = defaultFormation(s, registries, ids);
    const events = act({ type: 'loyalty/fight', payload: { formation, coverId: ids[0], allowRetry: getSettings(st).easyRetry } });
    if (events.some((e) => e.type === 'error')) return;
    showCombat();
    shell.open();
    combatScreen?.handle(events);
    requestEnemyNames();
  }

  /** A finished mutiny fight is resolved exactly once; the engine refuses a second try. */
  function resolveMutinyIfDue(): void {
    const open = state?.disloyalty?.open;
    if (open?.kind !== 'mutiny' || open.combatId === undefined || state?.combat || state?.lastCombat?.id !== open.combatId) return;
    act({ type: 'loyalty/resolve_mutiny' });
  }

  /** A unit that left the unit for good is no longer a member of the group chat. */
  function removeFromChat(unitId: string, text: string): void {
    const unit = state?.squad.find((u) => u.id === unitId);
    if (unit?.cardRef) {
      const keep = st.getGroupMembers().filter((m) => m.active && m.avatar !== unit.cardRef).map((m) => m.avatar);
      void st.setMembersActive(keep).catch((e) => console.warn('[Alius] could not update the group members', e));
    }
    void saver?.flush().catch((e) => console.warn('[Alius] save failed', e));
    const root = document.getElementById('alius-shell');
    if (root) cutIn(root, 'leash', text);
  }

  const nextLeashNo = (s: CampaignState): number => (s.leash.seq ?? Math.max(0, ...leashLog(s).map((e) => e.no))) + 1;
  const KIND_WORD: Record<LeashKind, string> = { compel: 'COMPEL', suppress: 'SUPPRESS', terminate: 'TERMINATE' };

  /** Why a Leash request cannot be filed right now, or null. Nothing is asked of the player before this. */
  function leashProblem(s: CampaignState, kind: LeashKind, unitId: string): string | null {
    if (kind === 'compel') {
      if (!s.scene?.participants.includes(unitId) || !(s.scene.refusals ?? []).some((r) => r.unitId === unitId)) {
        return 'There is no refused order to compel: give an order in a scene first.';
      }
    } else if (kind === 'suppress') {
      const open = s.disloyalty?.open;
      if (!open || open.unitId !== unitId || (open.kind !== 'desertion' && open.kind !== 'mutiny')) return 'Nothing is happening that needs to be suppressed.';
    }
    return checkLeash(s, registries, kind, unitId);
  }

  async function fileLeash(kind: LeashKind, unitId: string): Promise<boolean> {
    const s = state;
    const unit = s?.squad.find((u) => u.id === unitId);
    if (!s || !unit) {
      toast('warn', 'No such unit.');
      return false;
    }
    const why = leashProblem(s, kind, unitId);
    if (why) {
      toast('warn', why);
      return false;
    }
    const chatId = st.getActiveChat()?.chatId;
    // P9c: a soldier with access to the commander's messages may stop the request before it is filed (KEEP: nothing is filed)
    if ((await personal.beforeRequest('leash')).cancelled || st.getActiveChat()?.chatId !== chatId) return false;
    const cause = kind === 'terminate' ? s.disloyalty?.units[unitId]?.cause : undefined;
    const filed = await fileLeashRequest(shell, {
      kind, unitName: unit.displayName, no: nextLeashNo(s), left: s.leash.authorizationsLeft,
      ...(kind !== 'terminate' ? { cost: leashCost(s, registries, unitId, kind) } : {}),
      ...(cause ? { cause: cause.kind === 'attack' ? 'ATTACKED THE UNIT' : 'REPEATED DESERTION ATTEMPTS' } : {}),
      showNumbers: getSettings(st).showRawValues, delayMs: deps.leashDelayMs, settings: getSettings(st), corporation: corporationName(s), onVerdict: () => sound.play('stamp'),
      ...(kind === 'terminate' ? { verdict: 'UNDER REVIEW' } : {}),
    });
    if (!filed || st.getActiveChat()?.chatId !== chatId) return false;
    if (kind === 'compel') return loyalty.compel(unitId);
    const events = act({ type: kind === 'suppress' ? 'leash/suppress' : 'leash/terminate', payload: { unitId } });
    if (events.some((e) => e.type === 'error')) return false;
    if (events.some((e) => e.type === 'leash_used' && e.outcome === 'denied')) toast('warn', `Oversight denied the termination of ${unit.displayName}.`, OVERSIGHT);
    return true;
  }

  /** A path she refuses is forced through the Leash: the form first, then the decision. */
  async function decideArc(unitId: string, defectId: string, path: string, compel: boolean): Promise<void> {
    const s = state;
    const unit = s?.squad.find((u) => u.id === unitId);
    if (!s || !unit) return;
    const chatId = st.getActiveChat()?.chatId;
    if (compel) {
      const why = checkLeash(s, registries, 'compel', unitId);
      if (why) return void toast('warn', why);
      const filed = await fileLeashRequest(shell, {
        kind: 'compel', unitName: unit.displayName, no: nextLeashNo(s), left: s.leash.authorizationsLeft, cost: leashCost(s, registries, unitId, 'compel'),
        cause: `FORCED ${path.toUpperCase()} OF A DEFECT`, showNumbers: getSettings(st).showRawValues, delayMs: deps.leashDelayMs, settings: getSettings(st), corporation: corporationName(s), onVerdict: () => sound.play('stamp'),
      });
      if (!filed || st.getActiveChat()?.chatId !== chatId) return;
    }
    const events = act({ type: 'arc/decide', payload: { unitId, defectId, path, compel } });
    if (!events.some((e) => e.type === 'error') && events.some((e) => e.type === 'arc_decided')) toast('info', `${unit.displayName} takes the ${path} path.`);
    else if (!events.some((e) => e.type === 'error') && compel) toast('warn', 'The Leash burst failed: nothing was decided.');
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
      else shell.showScreen('hub'); // the run ended with the fight: the report follows
      return;
    }
    shell.showScreen('hub');
  }

  /** After a (re)load: an open combat is shown again, a combat screen of another chat is left. */
  function adoptCombat(): void {
    combatScreen?.dispose();
    combatScreen = null;
    if (state?.combat) showCombat();
    else if (onCombatScreen) {
      onCombatScreen = false;
      shell.showScreen('hub');
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
      onCompel: () => void combatDo('combat/compel'),
      onPresence: () => void combatDo('combat/presence'),
      coach: coachCtx,
    });
  }

  // ---------------------------------------------------------------------------------------------- expeditions (P5)

  /** P11: the tutorial's tips for the combat and expedition screens; dismissing one is the only onboarding action a run allows. */
  const coachCtx = {
    hints: (screen: 'combat' | 'expedition') => (state ? coachHints(state, registries, screen) : []),
    onSeen: (hintId: string) => void act({ type: 'onboarding/hint_seen', payload: { hintId } }),
  };

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
    shell.showScreen('hub');
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
      onDilemmaChoose: (index, route) => void dilemmas.choose(index, route),
      coach: coachCtx,
      generation: genUi,
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
      shell.showScreen('hub');
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
    for (const c of cs.combatants) {
      if (c.side !== 'enemy' || !c.enemyId) continue;
      const key = c.nameKey;
      const affixes = (key.split('|')[1] ?? '').split(',').filter((a) => a !== '');
      if (affixes.length === 0 || s.enemyNames?.[key] || namesInFlight.has(key)) continue;
      namesInFlight.add(key);
      void generations.generate('flavor.enemy', key)
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

  /**
   * `reload()` + `afterLoad()` for the open chat. A save that passes `migrate` (a shape check only) can still break the load deep inside;
   * then the campaign opens read-only with the reason (nothing is written back, the next chat opens normally) instead of leaving
   * Alius broken in this chat.
   */
  function openCampaign(): void {
    const stored = st.readMetadata(METADATA_KEY); // what the chat held before the load wrote anything (a seed, a sync)
    try {
      reload();
      afterLoad();
    } catch (e) {
      console.error('[Alius] opening the campaign failed', e);
      saver?.dispose();
      saver = null;
      if (st.readMetadata(METADATA_KEY) !== stored) st.writeMetadata(METADATA_KEY, stored); // the failed load leaves the save as it was
      state = null;
      const chat = st.getActiveChat();
      load = chat ? { kind: 'readonly', reason: `the campaign could not be opened (${errText(e)})`, chatId: chat.chatId } : { kind: 'none' };
      context.clearMatching(() => true);
      try {
        applyContext();
      } catch {
        // nothing of the broken campaign may reach the prompt; a failure here leaves the cleared context
      }
      toast('error', `Alius could not open this campaign: ${errText(e)}. It stays read-only; nothing is overwritten.`);
    }
  }

  /** The chat whose "commander file incomplete" modal was already shown in this session (it never loops). */
  let reviewShownFor: string | null = null;
  /** The review modal is on screen: the decision and confrontation modals wait (a new modal cancels the open one). */
  let reviewOpen = false;

  /**
   * An older campaign has a default commander file (`commander/seed`) and asks the player once to review it: CONFIRM applies
   * the form, SKIP keeps the defaults and never asks again; closing the modal leaves it for the next session.
   */
  async function reviewCommanderFile(): Promise<void> {
    if (!state || load.kind !== 'ok' || state.commander.fileReviewed !== false) return;
    const chatId = load.chatId;
    if (reviewShownFor === chatId) return;
    reviewShownFor = chatId;
    const desireBond = state.settings.desireBondDefects === true;
    const wizard = new Wizard(
      {
        registries,
        desireBondDefects: desireBond,
        importer: async () => ({ kind: 'manual', reason: 'not used here' }),
        commanderImporter: () => importCommander(st, { settings: { ...getSettings(st), desireBondDefects: desireBond }, registries, generations }),
        onChange: () => {},
      },
      { personaName: state.commander.name, canBindCurrent: false },
    );
    const p = commanderProfile(state);
    wizard.state.commander = { body: { ...p.body }, expression: p.expression, seasoning: p.seasoning, traits: { regular: [...p.traits.regular] } };
    const body = h('div', { class: 'alius-cmdr' });
    const draw = () =>
      renderCommanderFile(body, {
        value: wizard.state.commander, registries, desireBondDefects: desireBond, corporationId: state?.commander.corporationId ?? null,
        onChange: (c) => {
          if (c.kind === 'body') wizard.setBody(c.stat, c.value);
          else if (c.kind === 'expression') wizard.setExpression(c.value);
          else if (c.kind === 'seasoning') wizard.setSeasoning(c.value);
          else wizard.toggleTrait(c.id);
        },
        onPrefill: () => wizard.prefillFromPersona(), onRandom: () => wizard.randomCommander(), importStatus: wizard.state.commanderImport,
      });
    wizard.subscribe(() => renderKeepingFocus(body, draw));
    draw();
    reviewOpen = true;
    try {
      const answer = await shell.modal({
        title: 'Commander file incomplete — review',
        body: h('div', {}, h('p', {}, "This campaign began before the commander had a body, an expression and traits. Review the commander's file, or skip to keep the defaults."), body),
        actions: [{ label: 'Confirm', value: 'confirm' }, { label: 'Skip', value: 'skip' }],
      });
      const commander = structuredClone(wizard.state.commander);
      wizard.dispose();
      if (answer !== 'confirm' && answer !== 'skip') return;
      if (st.getActiveChat()?.chatId !== chatId) return; // the player moved to another chat meanwhile
      const events = answer === 'confirm'
        ? api.dispatch({ type: 'commander/set_profile', payload: { commander } }, { expectChatId: chatId })
        : api.dispatch({ type: 'commander/review_done', payload: {} }, { expectChatId: chatId });
      const failed = events.find((e) => e.type === 'error');
      if (failed) toast('error', String(failed.message ?? failed.code));
      else if (answer === 'confirm') toast('info', 'Commander file updated.');
    } finally {
      // whatever was waiting behind the review (a decision, a confrontation) comes back now
      reviewOpen = false;
      if (st.getActiveChat()?.chatId === chatId) {
        openDilemmaModal();
        openConfrontationModal();
        reopenSecretIfFree();
      }
    }
  }

  /**
   * P9d: a campaign without a content choice (a save from before P9d, an import) gets one now, once: `explicit_scenes` when the
   * old global switch is on, else nothing. The choice is stored even when empty, so the switch is never read again.
   */
  function carryOverContent(): void {
    if (load.kind !== 'ok' || !state || state.content !== undefined) return;
    api.dispatch({ type: 'content/set_categories', payload: { enabled: getSettings(st).explicitContent ? [EXPLICIT_CATEGORY] : [] } }, { expectChatId: load.chatId });
  }

  /** Everything that follows a (re)load of the campaign: context, badge, scene and the intimacy mirror. */
  function afterLoad(): void {
    resetDoor(); // P10b: night entry ids repeat across campaigns, so a deadline or a draft never carries over
    // a scene or next-reply directive belongs to one moment of one campaign (a page reload loses them too): the controllers and
    // applyContext below re-derive what still holds; manual directives are their owners' to refresh
    context.clearMatching((d) => d.expiresAfter !== 'manual');
    // a save from before P5 has no world yet: seed it, then everything else sees a complete state
    if (load.kind === 'ok' && state && state.world.seeded !== true) {
      api.dispatch({ type: 'world/seed', payload: {} }, { expectChatId: load.chatId });
    }
    // a save from before P6 has no Leash week yet: seed it once
    if (load.kind === 'ok' && state && state.leash.seeded !== true) {
      api.dispatch({ type: 'leash/seed', payload: {} }, { expectChatId: load.chatId });
    }
    // a save from before P7 has no commander file yet: seed it once (the review modal follows in the UI)
    if (load.kind === 'ok' && state && state.commander.body === undefined) {
      api.dispatch({ type: 'commander/seed', payload: {} }, { expectChatId: load.chatId });
    }
    carryOverContent();
    applyContext();
    syncBadges();
    adoptScene();
    adoptCombat();
    adoptExpedition();
    syncIntimacy();
    syncBeatCooldown();
    syncSceneSettings();
    syncUnitDms();
    syncFirstImpressionTau();
    syncMinConfidence();
    if (state?.world.director?.pending) void director.onRequested().catch((e) => console.warn('[Alius] director failed', e));
    // dilemmas and confrontations that were open when the campaign was saved come back as they were
    shell.closeModal?.(); // a modal of the previous chat must not act on this campaign
    dilemmaHost = null;
    dilemmaModalOpen = false;
    overrideModalOpen = false; // its close settles later, as a microtask: the flag is reset here and the stale close ignored
    overrideModalSeq++;
    // the review comes first: a modal that opens while it is up would cancel it (and the reverse), so the others wait for it
    void reviewCommanderFile().catch((e) => console.warn('[Alius] commander review failed', e));
    if (state?.dilemmas?.open) {
      if (state.dilemmas.open.context !== 'expedition_event') openDilemmaModal();
      if (state.dilemmas.open.status === 'requested') void dilemmas.onRequested().catch((e) => console.warn('[Alius] dilemma failed', e));
    }
    openConfrontationModal();
    showOverrideModal(); // P13: an override that was waiting when the campaign was saved
    reopenSecretIfFree(); // P9c: a secret that was found and never answered asks again, after the modal of the previous chat closed
  }

  /** P9c: the card of a found, unanswered secret, unless another modal of this campaign is up (a new modal cancels the open one). */
  function reopenSecretIfFree(): void {
    if (reviewOpen || dilemmaModalOpen || overrideModalOpen) return;
    if (state?.disloyalty?.open?.at === 'mission_start') return; // the confrontation modal is up
    personal.reopenSecrets();
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
    void saver!.flush().catch((e) => console.warn('[Alius] saving the replaced campaign failed', e));
    carryOverContent();
    applyContext();
    syncBadges();
    shell.refresh();
  }

  /**
   * SYS › Import and the state editor's Apply: the state replaces the campaign and is then picked up like a load, so an imported open
   * scene, fight or run resumes, an unseeded older export is seeded, and nothing of the replaced campaign (a plan, offers seen, revert
   * snapshots, its directives and modals) carries over. `replaceState` alone stays the plain setter.
   */
  function adoptState(next: CampaignState): void {
    replaceState(next);
    if (state !== next) return; // refused (no chat, not a group, read-only)
    expedition.cancelPlan();
    seenOffers.clear();
    generations.clearSnapshots();
    afterLoad();
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
    tastes: 'How she reads the commander (tastes)',
    disposition: 'How hard or kind she is for this world (disposition offset)',
    stances: 'Her stance toward the world\'s norms',
    bond: 'Bond profile: how she leads, bonds and what she will not do',
    development: 'What the card says holds firm in her and how well she reads people (anchors and insight; what she has become is kept)',
    temperament: 'Temperament: how much she talks, how steady she is and what her humor is like (a field you locked is kept)',
    hobbies: 'Hobbies and aptitudes: what she does for herself and what she is gifted or hopeless at (a hobby she has keeps its progress)',
    opinions: 'Strong opinions: the stands her card takes (one she has voiced or changed her mind about is kept)',
  };

  /** Re-imports chosen sections from the unit's card and applies the player's choices via squad/resync. */
  async function resyncUnit(unitId: string): Promise<void> {
    const unit = state?.squad.find((u) => u.id === unitId);
    if (!state || !unit?.cardRef) return;
    const startChatId = st.getActiveChat()?.chatId;
    const desireBond = state.settings.desireBondDefects === true;
    const temperament = temperamentOf(state, unitId); // P14c: read now, the state can change while the player chooses

    // P8: the world the unit lives in; the stances section only makes sense while some norm is not neutral
    const world = state.world.options ?? defaultWorldOptions(registries);
    const offered = resyncSectionsOffered(registries, world);

    // 1. which sections
    const boxes = offered.map((s) => h('input', { type: 'checkbox', 'data-section': s, checked: true }) as HTMLInputElement);
    // P14b: a re-sync keeps what she has become; this resets it (off by default)
    const resetBox = h('input', { type: 'checkbox', 'data-reset-development': unitId }) as HTMLInputElement;
    // P14c: the same for her life: her hobbies, her opinions and what is kept of her days
    const resetLifeBox = h('input', { type: 'checkbox', 'data-reset-life': unitId }) as HTMLInputElement;
    const picker = await shell.modal({
      title: 'Re-sync from card',
      body: h('div', {},
        h('p', {}, 'Choose what to re-import from the character card. Relationship numbers are never changed.'),
        ...offered.map((s, i) => h('label', { class: 'alius-check' }, boxes[i], ` ${RESYNC_LABELS[s]}`)),
        h('label', { class: 'alius-check', ...analyzeAttrs('glossary:character_development') }, resetBox, ' Reset development: forget what she has become since joining'),
        h('label', { class: 'alius-check', ...analyzeAttrs('glossary:life_events') }, resetLifeBox, ' Reset life: forget her hobbies, her opinions and what happened off-screen')),
      actions: [{ label: 'Import', value: 'go' }, { label: 'Cancel', value: 'cancel' }],
    });
    if (picker !== 'go') return;
    const sections = offered.filter((_, i) => boxes[i].checked);
    if (sections.length === 0) return toast('warn', 'Choose at least one section to re-sync.');

    // 2. a one-unit wizard does the import and the preselection; it starts from the unit's current profile
    const wizard = new Wizard(
      {
        registries,
        desireBondDefects: desireBond,
        // the first call imports every re-sync section, a "regenerate" asks for one
        importer: (avatar, wanted) =>
          importProfile(avatar, wanted.length > 1 ? [...sections] : wanted, {
            st, settings: { ...getSettings(st), desireBondDefects: desireBond }, registries, generations, world, bond: unit.bond ?? null,
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
      values: { ...unit.values }, // P14b: raw profile (the re-sync review compares against the import)
      likes: [...unit.likes], // P14b: raw profile
      dislikes: [...unit.dislikes], // P14b: raw profile
      triggers: [...unit.triggers],
      tastes: [...(unit.commanderTastes ?? [])], // P14b: raw profile
      ...(unit.dispositionOffset !== undefined ? { dispositionOffset: unit.dispositionOffset } : {}),
      ...(unit.dispositionReason !== undefined ? { dispositionReason: unit.dispositionReason } : {}),
      ...(unit.worldStances !== undefined ? { worldStances: structuredClone(unit.worldStances) } : {}),
      ...(unit.bond !== undefined ? { bond: structuredClone(unit.bond) } : {}),
      temperament, // P14c: the words she has now (the defaults when none is stored)
      ...(unit.hobbies !== undefined ? { hobbies: unit.hobbies.map((x) => x.id) } : {}), // P14c: raw profile
      ...(unit.aptitudes !== undefined ? { aptitudes: structuredClone(unit.aptitudes) } : {}), // P14c: raw profile
      ...(unit.opinions !== undefined ? { opinions: Object.fromEntries(Object.entries(unit.opinions).map(([t, o]) => [t, { position: o.position, ...(o.text ? { text: o.text } : {}) }])) } : {}), // P14c: raw profile
    });
    wizard.calibrate(0);

    // 3. the player reviews the candidates
    const body = h('div', { class: 'alius-calibration' });
    const draw = () =>
      renderCalibration(body, {
        draft: wizard.state.units[0],
        registries,
        desireBondDefects: desireBond,
        world,
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
    if (sections.includes('tastes')) patch.commanderTastes = c.tastes;
    if (sections.includes('disposition')) {
      patch.dispositionOffset = c.dispositionOffset ?? 0;
      patch.dispositionReason = c.dispositionReason ?? '';
    }
    if (sections.includes('stances')) patch.worldStances = c.worldStances ?? {};
    if (sections.includes('bond') && c.bond) patch.bond = c.bond;
    if (sections.includes('development')) {
      patch.anchors = c.anchors ?? [];
      patch.insight = c.insight ?? 'mid';
    }
    if (sections.includes('temperament') && c.temperament) patch.temperament = c.temperament; // P14c: raw temperament (the setup choice, not a unit)
    if (sections.includes('hobbies')) {
      patch.hobbies = c.hobbies ?? [];
      if (c.aptitudes) patch.aptitudes = c.aptitudes;
    }
    if (sections.includes('opinions')) patch.opinions = c.opinions ?? {};
    const current: ResyncPatch = {
      ...(unit.bond !== undefined ? { bond: unit.bond } : {}),
      dispositionOffset: unit.dispositionOffset ?? 0, dispositionReason: unit.dispositionReason ?? '', worldStances: unit.worldStances ?? {},
      roleId: unit.roleId, values: unit.values, likes: unit.likes, dislikes: unit.dislikes, triggers: unit.triggers, // P14b: raw profile
      signature: unit.signatureSkill, defects: unit.defects.map((d) => ({ id: d.id, origin: d.origin ?? '' })),
      commanderTastes: unit.commanderTastes ?? [], // P14b: raw profile
      anchors: unit.development?.anchors ?? [], insight: unit.insight ?? 'mid',
      temperament, // P14c
      hobbies: (unit.hobbies ?? []).map((x) => x.id), // P14c: raw profile
      ...(unit.aptitudes !== undefined ? { aptitudes: unit.aptitudes } : {}),
      opinions: Object.fromEntries(Object.entries(unit.opinions ?? {}).map(([t, o]) => [t, { position: o.position, ...(o.text ? { text: o.text } : {}) }])), // P14c: raw profile
    };
    const unchanged = (Object.keys(patch) as Array<keyof ResyncPatch>).every(
      (k) => JSON.stringify(patch[k]) === JSON.stringify(current[k]),
    );
    if (unchanged && !resetBox.checked && !resetLifeBox.checked) return toast('info', `Nothing changed${draft.notice ? ` (${draft.notice})` : ''}.`);
    const events = api.dispatch({ type: 'squad/resync', payload: { unitId, patch, ...(resetBox.checked ? { resetDevelopment: true } : {}), ...(resetLifeBox.checked ? { resetLife: true } : {}) } }, { expectChatId: startChatId });
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
          importProfile(avatar, sections, { st, settings: { ...getSettings(st), desireBondDefects: desireBond }, registries, generations, world: s.world.options ?? defaultWorldOptions(registries) }),
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
        world: s.world.options ?? defaultWorldOptions(registries),
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
        explicitContent: getSettings(st).explicitContent, // P9d: carried into CONTENT as `explicit_scenes`
        importer: (avatar, sections, world) =>
          importProfile(avatar, sections, { st, settings: { ...getSettings(st), desireBondDefects: desireBond }, registries, generations, world }),
        commanderImporter: () => importCommander(st, { settings: { ...getSettings(st), desireBondDefects: desireBond }, registries, generations }),
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
        settings: () => getSettings(st),
        sound,
        modal: (o) => shell.modal(o),
        onCancel: () => {
          if (setup?.wizard === wizard) endSetup();
          shell.showScreen('hub');
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
  /** P13: the warden's override waits for an answer: a corporate-voice modal with the chip (one at a time; it comes back when an order is refused until it is answered). */
  let overrideModalOpen = false;
  /** Which override modal is the current one: a closed modal of an earlier load must not clear the flag of a newer one. */
  let overrideModalSeq = 0;
  function showOverrideModal(): void {
    if (overrideModalOpen || !state || !overrideOpen(state) || load.kind !== 'ok') return;
    overrideModalOpen = true;
    const mine = ++overrideModalSeq;
    const host = h('div', { class: 'alius-override-modal' });
    renderOverrideChip(host, state, registries, (answer) => {
      shell.closeModal?.();
      void warden.answer(answer);
    });
    shell.open();
    void shell.modal({ title: 'WARDEN OVERRIDE', body: host, actions: [] }).then(() => { if (overrideModalSeq === mine) overrideModalOpen = false; });
  }

  function reportEvents(events: EngineEvent[]): void {
    // P13: the warden's moves (a warning, a punishment, the Leash, a denied request) are the corporation's notices
    for (const e of events) {
      const n = state ? wardenNotice(e, state, registries) : null;
      if (!n) continue;
      toast(n.kind, n.text, { voice: VOICE_OF.warden_notice, title: n.title });
      const root = document.getElementById('alius-shell');
      if (n.cutIn && root) cutIn(root, 'warden', n.title);
    }
    if (events.some((e) => e.type === 'warden_override')) setTimeout(showOverrideModal, 0);
    if (events.some((e) => e.type === 'error' && typeof e.message === 'string' && e.message.startsWith('The warden has overridden an order'))) setTimeout(showOverrideModal, 0);
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
        case 'morning_lost':
          toast('warn', 'You slept through the morning.');
          break;
        case 'quiet_night_started':
          toast('info', 'A quiet night: nobody knocks. Sleep, or spend it awake.');
          break;
        case 'body_trained':
          toast('info', e.raised ? `Your ${String(e.stat)} has improved.` : `Body training: ${String(e.stat)}${Number(e.value) >= 5 ? ' cannot grow any further' : ' is a little better'}.`);
          break;
        case 'delegate_remark':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'She'} does it, with a remark about being asked.`);
          break;
        case 'delegate_demand':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'She'} does it, and will want something for it.`);
          break;
        case 'delegate_refused':
          toast('warn', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'She'} refuses.`);
          break;
        case 'commander_covered':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A friend'} covers for you after the long run.`);
          break;
        case 'commander_exhausted':
          toast('warn', 'You are exhausted: tomorrow morning is lost.');
          break;
        case 'commander_scarred':
          toast('warn', e.stat ? `The fight left a scar: your ${String(e.stat)} is worse for it.` : 'The fight left a scar. You are not the same.');
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
        case 'leash_changed':
          toast('warn', `Leash authorizations: ${String(e.left)} left.`, OVERSIGHT);
          break;
        case 'leash_used': {
          const who = state?.squad.find((u) => u.id === e.unitId)?.displayName ?? String(e.unitId);
          toast('info', `Oversight request #${String(e.no).padStart(4, '0')}: ${KIND_WORD[e.kind as LeashKind] ?? String(e.kind)} ${who} — ${String(e.outcome)}.`, OVERSIGHT);
          break;
        }
        case 'leash_refreshed':
          toast('info', `A new week: ${String(e.left)} Leash authorizations.`, OVERSIGHT);
          break;
        case 'loyalty_sign': {
          const who = state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit';
          if (e.kind === 'fact') toast('warn', `${who} is giving the squad cause for concern.`);
          else if (e.kind === 'talk') toast('info', `${who} wants to talk. She will knock tonight.`);
          break;
        }
        case 'arc_unlocked':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} wants to talk about her defect.`);
          break;
        case 'arc_completed':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'}: the ${String(e.path)} is complete.`);
          break;
        case 'deserter_returned': {
          const who = state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A deserter';
          toast(e.stance === 'ally' ? 'info' : 'warn', e.stance === 'ally' ? `${who} is back at the gate.` : `${who} has been seen with armed deserters.`);
          break;
        }
        case 'unit_deserted':
          toast('warn', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} has deserted.`);
          break;
        case 'unit_terminated':
          toast('warn', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} was terminated through the Leash.`);
          break;
        case 'mutiny_subdued':
          toast('info', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} was put down: the mutiny is over.`);
          break;
        case 'mutiny_escaped':
          toast('warn', `${state?.squad.find((u) => u.id === e.unitId)?.displayName ?? 'A unit'} got away with the mutineers.`);
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
  /** P10b: peeling a part of her decor (a sticker, the wallpaper, the contact name) asks first; only PEEL dispatches `device/remove_decor`. */
  async function confirmPeel(unitId: string, part: DecorPart): Promise<void> {
    const name = state?.squad.find((u) => u.id === unitId)?.displayName ?? 'her';
    const chatId = st.getActiveChat()?.chatId;
    const answer = await shell.modal({
      title: `PEEL HER ${part.toUpperCase()}?`,
      body: `${name} put it there. She will notice it is gone.`,
      actions: [{ label: '[ PEEL ]', value: 'peel' }, { label: '[ KEEP ]', value: 'keep' }],
    });
    if (answer !== 'peel' || st.getActiveChat()?.chatId !== chatId) return;
    act({ type: 'device/remove_decor', payload: { unitId, part } });
  }

  function act(action: Action): EngineEvent[] {
    const events = api.dispatch(action, { expectChatId: st.getActiveChat()?.chatId });
    const failed = events.find((e) => e.type === 'error');
    if (failed?.code === 'vote_needed') {
      // P9b: the squad votes on this decision: the VOTE panel opens and carries the action out when it is allowed
      void power.requestVote(action);
      return events;
    }
    if (failed) toast('error', String(failed.message ?? failed.code));
    return events;
  }

  const SHORT_NAME = (reg: Registries, registry: 'roles' | 'defects', id: string): string => String(reg[registry].get(id)?.name ?? id);

  const sound = createSound({ settings: () => getSettings(st), registries: () => registries, assetUrl: deps.assetUrl });
  const shell = (deps.shellFactory ?? createShell)({
    sound,
    generation: genUi,
    st,
    getState: () => state,
    getLoad: () => load,
    replaceState: adoptState, // SYS import and the state editor: a replaced campaign is picked up like a load (0.1 audit)
    getContentErrors: () => contentErrors,
    analyze: { registries: () => registries },
    lastBuild: () => context.lastBuild(), // P3b: the fill indicator of SYS › MEMORY
    skin: () => ({ skin: pickSkin(state, registries, getSettings(st).deviceSkin), assetUrl: deps.assetUrl }),
    marks: (layer) => {
      if (state) renderMarks(layer, state, registries, pickSkin(state, registries, getSettings(st).deviceSkin));
      else layer.replaceChildren();
    },
    debugTools,
    dispatch: (action) => api.dispatch(action, { expectChatId: st.getActiveChat()?.chatId }),
    onSettingsChanged: () => {
      syncIntimacy();
      syncBeatCooldown();
      syncSceneSettings();
      syncUnitDms();
      syncFirstImpressionTau();
      syncMinConfidence();
    },
  });

  shell.registerTab('home', (host) =>
    renderHomeTab(host, {
      getState: () => state,
      registries,
      st,
      settings: () => getSettings(st),
      onReadNote: (id) => void act({ type: 'notes/read', payload: { id } }),
      onPeel: (unitId, part) => void confirmPeel(unitId, part),
      rule: { accept: (id) => answerRule(id, 'accept'), negotiate: (id) => answerRule(id, 'negotiate'), refuse: (id) => answerRule(id, 'refuse') },
      warden: { avatar: (u) => unitPortrait(st, u, portraitOptions(getSettings(st), 40)), showRaw: getSettings(st).showRawValues, onAnswer: (a) => void warden.answer(a),
        onIntrigue: (action, unitId) => void act({ type: 'intrigue/act', payload: { action, ...(unitId !== undefined ? { unitId } : {}) } }), onReport: () => void act({ type: 'intrigue/report', payload: {} }),
        generation: genUi, onRerollAgenda: () => warden.rerollAgenda() }, // P13: the WARDEN panel and its INTRIGUE section (P14: REROLL of her agenda)
    }),
  );
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
      onLeash: (unitId, kind) => void api.fileLeash(kind, unitId),
      onArc: (unitId, defectId, path, compel) => void decideArc(unitId, defectId, path, compel),
      arcPaths: (unitId, defectId) => (state ? arcPaths(state, registries, unitId, defectId) : []),
      canTerminate: (unitId) => (state ? checkLeash(state, registries, 'terminate', unitId) : 'No campaign.'),
      onPunish: (unitId, measure, days) => void discipline.punish(unitId, measure, days),
      onSetPublicity: (unitId, level) => void bonds.setPublicity(unitId, level),
      onSetHand: (unitId, handId) => void act({ type: 'squad/set_hand', payload: { unitId, handId } }),
      onSetQuarters: (unitId, styleId) => void act({ type: 'squad/set_quarters', payload: { unitId, styleId } }),
      onEndorse: () => void power.endorse(),
      onAskFirst: (unitId, on) => void power.askFirst(unitId, on).then((ok) => { if (ok) shell.open(); }),
      onChallenge: (stat) => void power.challenge(stat).then((ok) => { if (ok) shell.open(); }),
      onPeel: (unitId, part) => void confirmPeel(unitId, part), // P9c, P10b: asks first
      onCancelBooking: (id) => void personal.cancelBooking(id),
      onWager: (unitId, choice) => void personal.challenge({ unitId, ...choice }),
      onWear: (id) => void personal.wearToken(id),
      onTakeOff: (id) => void personal.takeOffToken(id),
      // P3b: the MEMORY block of each unit (pin, forget, and with the edit lock off edit)
      development: { dispatch: (a) => act(a), onChanged: () => shell.refresh() }, // P14b: HOLD and fact editing
      life: { dispatch: (a) => act(a), onChanged: () => shell.refresh() }, // P14c: temperament, hobbies and opinions (the edit lock gates the controls)
      memory: {
        dispatch: (a) => act(a),
        confirm: async (text) => (await shell.modal({ title: 'FORGET', body: text, actions: [{ label: '[ FORGET ]', value: 'yes' }, { label: '[ CANCEL ]', value: 'no' }] })) === 'yes',
        onChanged: () => shell.refresh(),
      },
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
      onReadNote: (id) => void act({ type: 'notes/read', payload: { id } }), // P10b
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
  /** What the OPS tab and the hub's room panels (the same activity cards) need. */
  const opsCtx = (): OpsTabCtx => ({
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
    onSleep: () => void act({ type: 'calendar/sleep', payload: {} }),
    onTimeTogether: (unitId, pastimeId) => void api.life.timeTogether(unitId, pastimeId), // P14c: a quiet hour with her
    onCountermand: (answer) => void power.answerCountermand(answer), // P9b: the squad leader's countermand
    onCancelBooking: (id) => void personal.cancelBooking(id), // P9c: the schedule
    onKeepBooking: (id) => void personal.resolveConflict({ bookingId: id }),
    onSettleBooking: (day, slot) => void personal.resolveConflict({ day, slot, settle: true }),
    onIntake: () => void api.intakeUnit(),
    onOpenReport: () => {
      showExpedition();
      shell.open();
    },
  });
  shell.registerTab('ops', (host) => {
    for (const m of state?.missions.offered ?? []) seenOffers.add(m.id);
    shell.setTabBadge('ops', 0);
    renderOpsTab(host, opsCtx());
  });
  /** P13: downloads the campaign file (the END screen's only button; the same file as SYS › Export campaign). */
  function exportCurrent(): void {
    if (!state) return;
    const url = URL.createObjectURL(new Blob([exportCampaign(state)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `alius-campaign-day${state.day}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  shell.registerHub((host, device) => {
    // P13: a closed campaign shows the END screen in place of the hub
    if (state?.ended) return renderEndScreen(host, state, { onExport: exportCurrent, generation: genUi });
    return renderHub(host, device, {
      getState: () => state,
      getLoad: () => load,
      registries,
      settings: () => getSettings(st),
      assetUrl: deps.assetUrl,
      art: { hub: hubArt },
      generation: genUi,
      lastScene: { state: () => scene.summaryRerollState(), run: () => scene.rerollSummary() },
      ops: opsCtx(),
      headStartCard: (host) => { if (state && load.kind !== 'readonly') renderRecapCard(host, { state, registries, generation: genUi, onReroll: () => headStart.rerollRecap(), rerollState: () => headStart.rerollState() }); }, // P11b: THE FIRST WEEKS
      overrideChip: (host) => { if (state && load.kind !== 'readonly') renderOverrideChip(host, state, registries, (a) => void warden.answer(a)); }, // P13: the warden's open override
      onboardingCard: (host) => {
        if (!state) return;
        renderOnboardingCard(host, { state, registries, controller: onboarding, readOnly: load.kind === 'readonly' });
        // P13: the one-time WARDEN ASSIGNED notice (a campaign whose prologue does not play the reveal scene)
        if (load.kind !== 'readonly') renderRevealCard(host, state, registries, () => void act({ type: 'warden/revealed', payload: {} }));
      },
      onTalk: (unitId, locationId) => void api.talkAt(unitId, locationId),
      onEndSlot: () => void api.endSlot(),
      onOpenPda: (tab) => (tab ? shell.showTab(tab) : shell.setDevice(true)),
      avatar: (unit) => unitPortrait(st, unit, portraitOptions(getSettings(st), 40)),
      onReadNote: (id) => void act({ type: 'notes/read', payload: { id } }), // P10b
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
      onSetRations: (mode) => void act({ type: 'rations/set', payload: { mode } }),
      generation: genUi,
    }),
  );

  shell.registerTab('comms', (host) =>
    renderCommsTab(host, {
      getState: () => state,
      registries,
      onSend: (unitId, text) => void comms.send(unitId, text),
      onUndoDiscipline: (id) => void discipline.undo(id),
      onAnswerDemand: (id, answer) => void discipline.answerDemand(id, answer),
      onTalkDemand: (id) => void discipline.talkDemand(id).then((ok) => { if (ok) shell.open(); }),
      onAnswerRule: answerRule,
      onRead: (unitId) => {
        const unit = state?.dms[unitId];
        if (unit?.some((m) => m.from !== 'commander' && !m.read)) api.dispatch({ type: 'dm/read', payload: { unitId } }, { expectChatId: st.getActiveChat()?.chatId });
      },
      onAnswer: (proposalId, answer, condition) => void act({ type: 'proposal/answer', payload: { proposalId, answer, ...(condition !== undefined ? { condition } : {}) } }),
      personal: {
        onAnswerToken: (offerId, accept) => void personal.answerToken(offerId, accept),
        onAnswerWager: (wagerId, accept) => void personal.answerWager(wagerId, accept),
        onPlayWager: (wagerId, pick) => void personal.playWager(wagerId, pick),
        onAnswerQuestion: (wagerId, text) => void personal.answerQuestion(wagerId, text),
      },
      edit: () => pendingEdit,
      onAnswerEdit: (keep) => {
        pendingEdit = null;
        void comms.answerEdit(keep).then(() => shell.refresh());
      },
      avatar: (unit) => unitPortrait(st, unit, portraitOptions(getSettings(st), 32)),
      motion: () => !motionReduced(getSettings(st)), // P10b: the typing indicator
      generation: genUi,
      reply: { state: (unitId) => comms.replyState(unitId), run: (unitId) => comms.rerollLast(unitId) },
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
    generations,
    scene,
    comms,
    expedition,
    director,
    dilemmas,
    loyalty,
    discipline,
    bonds,
    power,
    personal,
    special,
    onboarding,
    fileLeash,
    intakeUnit,
    startScene: beginScene,
    startCombat(opts) {
      if (!state) {
        toast('error', 'No Alius campaign in this chat.');
        return false;
      }
      const chatId = st.getActiveChat()?.chatId;
      // P11: a combat of the tutorial run can always be retried (stress and injuries still count)
      const payload: StartPayload = { ...opts, allowRetry: getSettings(st).easyRetry || isTutorialRun(state, registries) };
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
      // P12: a one-way focus (burning the frequency implant) asks first; nothing is spent on a no
      const question = focusConfirm(registries, req);
      if (question !== null && state && checkActivity(state, registries, req) === null) {
        const answer = await shell.modal({ title: 'ONE WAY', body: question, actions: [{ label: '[ BURN IT ]', value: 'yes' }, { label: '[ KEEP IT ]', value: 'no' }] });
        if (answer !== 'yes' || st.getActiveChat()?.chatId !== chatId) return [];
      }
      const action: Action = { type: 'activity/do', payload: req };
      const doneDay = state?.day ?? 0;
      const doneSlot = state?.slot ?? 'morning';
      const events = warden.needsJudge(action) ? await warden.judgeThen(action) : act(action); // P13: the warden's optional judge
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
      if (!unit || !registries.activities.has(String(done.activityId))) return events;
      // the vignette belongs to the slot the activity was done in (it expires when that slot has passed)
      await generations.generate('activity.vignette', `${String(done.activityId)}:${unit.id}:${doneDay}:${doneSlot}`);
      return events;
    },

    async talkAt(unitId, locationId) {
      const s = state;
      const talk = [...registries.activities.values()].find((a) => a.startsScene === true && a.companion === 'required' && a.pastime !== true);
      if (!s || load.kind !== 'ok' || !talk || !s.squad.some((u) => u.id === unitId)) return false;
      const why = endSlotBlock(s) ?? restrictionReason(s, unitId, 'scene');
      if (why) {
        toast('warn', why);
        return false;
      }
      presetLocation = locationId;
      try {
        const events = await api.performActivity({ activityId: String(talk.id), companionId: unitId });
        return events.some((e) => e.type === 'scene_requested') && state?.scene !== undefined;
      } finally {
        presetLocation = null;
      }
    },

    life: {
      async timeTogether(unitId, pastimeId) {
        const chatId = st.getActiveChat()?.chatId;
        const s = state;
        if (!s || load.kind !== 'ok') return false;
        const why = endSlotBlock(s) ?? pastimeProblem(s, registries, unitId, pastimeId);
        if (why) {
          toast('warn', why);
          return false;
        }
        const action: Action = { type: 'life/time_together', payload: { unitId, pastimeId } };
        const events = warden.needsJudge(action) ? await warden.judgeThen(action) : api.dispatch(action, { expectChatId: chatId }); // P13: her optional judge, like any activity
        const failed = events.find((e) => e.type === 'error');
        if (failed) {
          toast('error', String(failed.message ?? failed.code));
          return false;
        }
        const waiting = state?.life?.pending;
        if (!events.some((e) => e.type === 'scene_requested') || !waiting || waiting.unitId !== unitId) return false; // the order was countermanded or overridden
        return beginScene({ locationId: waiting.locationId, participants: [unitId], origin: 'activity' });
      },
    },

    async endSlot() {
      const chatId = st.getActiveChat()?.chatId;
      const s = state;
      if (!s || load.kind !== 'ok') return;
      const why = endSlotBlock(s);
      if (why) {
        toast('warn', why);
        return;
      }
      const slot = s.slot;
      const answer = await shell.modal({
        title: `End the ${slot}?`,
        body: `End the ${slot} without doing anything?`,
        actions: [{ label: `[ END ${slot.toUpperCase()} ]`, value: 'end' }, { label: 'Cancel', value: 'cancel' }],
      });
      const now = state;
      if (answer !== 'end' || !now || st.getActiveChat()?.chatId !== chatId) return;
      // a quiet night is slept through; every other slot is passed
      act(isQuietNight(now) ? { type: 'calendar/sleep', payload: {} } : { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'pass' } });
    },

    async recruitGrunt() {
      const chatId = st.getActiveChat()?.chatId;
      // P9c: the same for a recruit order
      if ((await personal.beforeRequest('recruit')).cancelled || st.getActiveChat()?.chatId !== chatId) return [];
      const events = act({ type: 'base/recruit_grunt', payload: {} });
      const recruited = events.find((e) => e.type === 'grunt_recruited');
      const settings = getSettings(st);
      if (!recruited || !settings.gruntFlavor || !state) return events;
      const unit = state.squad.find((u) => u.id === recruited.unitId);
      if (!unit) return events;
      await generations.generate('flavor.grunt', unit.id);
      return events;
    },

    async rerollGrunt(unitId) {
      await generations.reroll('flavor.grunt', unitId);
    },

    upgradeFacility(facilityId) {
      const action: Action = { type: 'base/upgrade', payload: { facilityId } };
      const told = (days: unknown): void => toast('info', `${String(registries.facilities.get(facilityId)?.name ?? facilityId)}: upgrade started (${String(days)} days).`);
      const events = api.dispatch(action, { expectChatId: st.getActiveChat()?.chatId });
      if (events.some((e) => e.type === 'error' && e.code === 'vote_needed')) {
        // P9b: the squad votes first; the upgrade is told once the vote has run it
        void power.requestVote(action).then((r) => {
          if (r === 'ran') told(state?.base.upgrades?.find((u) => u.facilityId === facilityId)?.daysLeft ?? '?');
        });
        return events;
      }
      const failed = events.find((e) => e.type === 'error');
      if (failed) toast('error', String(failed.message ?? failed.code));
      const started = events.find((e) => e.type === 'upgrade_started');
      if (started) told(started.days);
      return events;
    },

    requisition(supplies) {
      const events = act({ type: 'base/requisition', payload: { supplies } });
      const done = events.find((e) => e.type === 'requisitioned');
      if (done) toast('info', `Requisitioned ${String(done.supplies)} supplies for ${String(done.credits)} credits.`);
      return events;
    },

    setRoster: (activeIds) => {
      const action: Action = { type: 'roster/set_active', payload: { activeIds } };
      if (warden.needsJudge(action)) {
        void warden.judgeThen(action); // P13: the warden's judge reads the roster first (a short model call)
        return [];
      }
      return act(action);
    },

    async start() {
      getSettings(st); // normalizes extension settings
      try {
        const r = await deps.loadContent();
        registries = r.registries;
        lorebook = r.lorebook ?? null;
        hubArt = r.art?.hub ?? [];
        contentErrors = r.errors;
      } catch (e) {
        contentErrors = [{ pack: '(loader)', file: '', path: '', message: errText(e) }];
      }
      if (contentErrors.length > 0) {
        for (const e of contentErrors) console.warn(`[Alius] content: ${e.pack} ${e.file} ${e.path} — ${e.message}`);
        toast('warn', `Content: ${contentErrors.length} error(s) — see SYS › debug`);
      }

      openCampaign();

      if (!started) {
        started = true;
        st.on('chat_changed', () => {
          // a plan and the "seen" offers belong to one campaign (ids such as m1 repeat in every one)
          expedition.cancelPlan();
          seenOffers.clear();
          generations.clearSnapshots(); // a revert snapshot belongs to one campaign
          staging.reset(); // P15a: a hold's clock, inputs and cue pool belong to one chat
          openCampaign();
          staging.resume();
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
      const before = state;
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
      if (r.state !== before) announceUnlocks(before, r.state);
      applyContext();
      syncBadges();
      syncSound(r.events); // P15a: muffled under a hood, a bell on every move of a bell collar
      drawDilemma();
      // a blocked action brings the waiting decision back (the player may have dismissed its modal)
      if (r.events.some((e) => e.type === 'error' && e.code === 'dilemma_open')) openDilemmaModal();
      // likewise a departure refused for the desertion that is waiting at the gate
      if (r.events.some((e) => e.type === 'error' && /deal with it first/.test(String(e.message)))) openConfrontationModal();
      shell.refresh();
      followUps(r.events);
      return r.events;
    },

    restoreSnapshot(snap, expectedCurrent) {
      if (!state || state !== expectedCurrent || load.kind !== 'ok') return false;
      state = snap;
      load = { kind: 'ok', state: snap, chatId: load.chatId };
      saver?.save(snap);
      syncMinConfidence(); // the snapshot may carry the mirror of an older setting (P8)
      applyContext();
      syncBadges();
      syncSound([]);
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
      const out = await generations.generate<{ pong: true; echo: string }>('sys.ping', 'alius', { noRecord: true });
      if (out.kind === 'applied') {
        toast('info', `pong: ${out.value.echo}`);
        return { ok: true as const, echo: out.value.echo };
      }
      const failed = out.kind === 'failed' ? out : { reason: 'invalid_output' as const, detail: 'the test was dropped' };
      toast('error', `Ping failed: ${failed.reason} — ${failed.detail}`);
      return { ok: false as const, reason: failed.reason, detail: failed.detail };
    },
  };
  return api;
}
