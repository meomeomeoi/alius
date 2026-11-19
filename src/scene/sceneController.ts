import type { Registries } from '../content/types';
import { warnedInput } from '../engine/special/paranoia/premonitions';
import type { EngineEvent } from '../engine/dispatch';
import { disabledCategories, ownLimitLabels, rulesOf } from '../engine/bonds';
import { measureList } from '../engine/discipline';
import { openPromises } from '../engine/memory';
import { factTextMax } from '../engine/memory/config';
import { intimacyOf } from '../engine/relations/gain';
import type { ProposalAnswer } from '../engine/relations/proposals';
import type { CampaignState, PendingProposal, SceneOrigin, Unit } from '../engine/state/types';
import { readEmotion } from '../llm/calls/emotionPick';
import { leakInput } from '../engine/special/frequency/leaks';
import { conspireInput, expectationInput, overrideInput } from '../engine/warden';
import { readIntentOutput, type ExpressionLabel, type IntentExtractInput } from '../llm/calls/intentExtract';
import { confidenceFloor } from '../engine/worldOptions';
import { readSceneSummary, type SceneSummary, type SceneSummaryInput } from '../llm/calls/sceneSummary';
import { MOVED_REASON, type Envelope } from '../llm/envelope';
import { openRecords } from '../engine/generations';
import type { AliusSettings } from '../settings';
import type { ChatMessage, StAdapter } from '../st/adapter';
import type { AliusApp } from '../app';
import { askDirective } from '../bonds/directives';
import { clearSceneDirectives, sceneDirectives } from './context';
import { answerDirective, nightDirective, proposalDirective } from './directives';
import type { MemoryController } from './memoryController';
import { dislikesOf, likesOf, valuesOf } from '../engine/development/profile';

/** What the scene screen needs to react to. */
export type SceneUiEvent =
  | { type: 'pulse'; unitId: string; axis: 'trust' | 'affinity' | 'attraction'; up: boolean; delta: number }
  | { type: 'sprite'; unitId: string; label: string }
  | { type: 'chips'; proposal: PendingProposal }
  | { type: 'cut_in'; kind: string }
  | { type: 'pacing' }
  | { type: 'transcript' }
  /** P9: a punishment or a threat was logged, or one was undone: the chips are drawn from the state again. */
  | { type: 'discipline' }
  /** P9c: a soldier with access to the commander's messages edited this one before it went out; KEEP or REVERT (`comms.answerEdit`) decides. */
  | { type: 'edit'; unitId: string; original: string; edited: string; interceptId: string; editorId: string };

export type Toast = (kind: 'info' | 'warn' | 'error', text: string) => void;

export interface SceneDeps {
  st: StAdapter;
  app: Pick<AliusApp, 'dispatch' | 'current' | 'context' | 'refreshContext'>;
  /** Replaces the campaign with `before` only if the current state is still `expectedCurrent`. */
  restore(before: CampaignState, expectedCurrent: CampaignState): boolean;
  registries: () => Registries;
  settings: () => AliusSettings;
  /** P9d: the content exclusion line a prose call appends to its system prompt. */
  contentLine?: () => string;
  toast: Toast;
  /** P14: the envelope every model call runs through; the controller binds its sites (`scene.intents`, `scene.summary`, `emotion.pick`) on creation. */
  generations: Envelope;
  onUi: (e: SceneUiEvent) => void;
  /** P9c: a line a soldier of the scene said in the last exchange (her first reply after a lost question wager answers it). */
  onUnitReply?: (unitId: string, text: string) => void;
  /** P3b: the memory controller; after each reply the scene asks it for a digest, and `end()` waits for one in flight. */
  memory?: Pick<MemoryController, 'digestIfDue' | 'idle'>;
}

export interface StartOptions {
  locationId: string;
  participants: string[];
  origin: SceneOrigin;
  consumesSlot?: boolean;
  nightEntryId?: string;
}

export interface SceneController {
  start(opts: StartOptions): Promise<boolean>;
  send(text: string): Promise<void>;
  /** The group speaks first (a scene whose goal is set before the commander says anything). Not an exchange: nothing is counted. */
  opening(): Promise<void>;
  /** The commander proposes something; the engine decides at once and the result becomes a directive for her next reply. */
  propose(kind: string, unitId?: string): void;
  /** P9d: FOLLOW (the commander follows her lead, once per scene), ASK (what does she want) and SET A LIMIT (a boundary for this scene). */
  follow(): void;
  ask(): void;
  limit(text: string): void;
  /** `condition` is the text of an `accept_condition` answer (P9c). */
  answer(proposalId: string, answer: ProposalAnswer, condition?: string): void;
  end(): Promise<void>;
  /** P14: REROLL of the last exchange's reading (`scene.intents`): the swipe undo, then the same lines are read again. */
  rerollLast(): Promise<void>;
  /** Whether REROLL of the last reading is possible, and why not. */
  rerollState(): { enabled: boolean; reason?: string };
  /** P14: REROLL of the summary of the scene that ended last (`scene.summary`): reopens it while nothing else happened and ends it with a new summary. */
  rerollSummary(): Promise<void>;
  summaryRerollState(): { enabled: boolean; reason?: string };
  /** Rewrites a message of the scene in the chat. If it belongs to the last exchange, that exchange's extraction is undone and read again. */
  edit(index: number, text: string): Promise<void>;
  /** A message was edited in the chat itself (not through `edit`). */
  onEdited(index: number): void;
  /** Asks the chat to stop the generation in progress. */
  stop(): void;
  transcript(): ChatMessage[];
  /** A message was swiped or deleted in ST: undo the last extraction if it was for that reply, then re-extract. */
  onSwipe(index: number): void;
  /** After a reload or chat change with an open scene: members, directives and the transcript. */
  resume(): void;
  /** Resolves when background work (a swipe re-extraction) has finished. */
  idle(): Promise<void>;
  dispose(): void;
}

/** One extraction call reads at most this many new messages; longer backlogs are read chunk by chunk. */
const EXTRACT_MAX_MESSAGES = 8;
/** At most this many chunks per pass (older lines beyond that are skipped, never re-read). */
const EXTRACT_MAX_CHUNKS = 6;

export const DEBUG_NOT_ROLLED_BACK = 'Not rolled back: something changed since.';

export function createSceneController(deps: SceneDeps): SceneController {
  const { st, app } = deps;
  /** First chat index not yet read by `intent_extract`. */
  let extracted = 0;
  /** The last applied extraction, so a swipe of its reply can undo exactly that. */
  let lastApply: { lastReplyIndex: number; from: number; to: number; before: CampaignState; after: CampaignState; directives: string[] } | null = null;
  /** P14: the scene whose summary succeeded last (the key of its REROLL). */
  let summaryKey: string | null = null;
  /** True while `intent_extract` runs; a swipe during it cannot be rolled back (nothing applied yet), so it is noted. */
  let extracting = false;
  const swipedWhileExtracting = new Set<number>();
  let awaitingReextract = false;
  let pending = false;
  /** The send in flight (reply, extraction, sprites); `end()` waits for it so an exchange is never applied twice. */
  let inflight: Promise<void> | null = null;
  /** The opening in flight (the group speaking first); a message typed meanwhile waits for it. */
  let openingRun: Promise<void> | null = null;
  /** The scene the group was already asked to open (scene ids repeat across campaigns: `start` forgets it). */
  let openedScene: string | null = null;
  let disposed = false;
  let background: Promise<void> = Promise.resolve();

  const state = (): CampaignState | null => app.current().state;
  const chatId = (): string | undefined => st.getActiveChat()?.chatId;
  const debug = (text: string): void => {
    if (deps.settings().debug) deps.toast('info', text);
  };
  const unitById = (s: CampaignState, id: string): Unit | undefined => s.squad.find((u) => u.id === id);
  const unitByAvatar = (s: CampaignState, avatar: string | undefined): Unit | undefined =>
    avatar === undefined ? undefined : s.squad.find((u) => u.cardRef === avatar);

  function dispatch(action: { type: string; payload?: unknown }, expect: string | undefined): EngineEvent[] {
    const events = app.dispatch(action, { expectChatId: expect });
    const failed = events.find((e) => e.type === 'error');
    if (failed && failed.code !== 'chat_changed') deps.toast('error', String(failed.message ?? failed.code));
    return events;
  }

  /** Maps what the engine did to what the screen shows and sets directives for proposal results. */
  function reflect(events: EngineEvent[], extremeKinds: string[] = []): string[] {
    const set: string[] = [];
    const s = state();
    if (!s) return set;
    for (const e of events) {
      switch (e.type) {
        case 'relation_changed':
          deps.onUi({ type: 'pulse', unitId: String(e.unitId), axis: e.axis as 'trust' | 'affinity' | 'attraction', up: Number(e.delta) > 0, delta: Number(e.delta) });
          break;
        case 'relation_state_changed':
          deps.onUi({ type: 'cut_in', kind: `state:${String(e.to)}` });
          break;
        case 'discipline_applied':
        case 'threat_registered':
        case 'discipline_undone':
          deps.onUi({ type: 'discipline' });
          break;
        case 'proposal_offered': {
          const p = s.proposals?.find((x) => x.id === e.proposalId);
          if (p) deps.onUi({ type: 'chips', proposal: p });
          break;
        }
        case 'proposal_resolved': {
          const unit = unitById(s, String(e.unitId));
          if (!unit) break;
          const result = e.receptive === true ? ({ receptive: true } as const) : ({ receptive: false, reason: e.reason } as never);
          app.context.setDirective(proposalDirective(unit.id, unit.displayName, String(e.kind), result));
          set.push(`proposal:${unit.id}`);
          break;
        }
      }
    }
    for (const kind of extremeKinds) deps.onUi({ type: 'cut_in', kind });
    app.refreshContext();
    return set;
  }

  const avatarsOf = (s: CampaignState, ids: string[]): string[] =>
    ids.map((id) => unitById(s, id)?.cardRef).filter((a): a is string => typeof a === 'string');

  function setSceneContext(s: CampaignState): void {
    sceneDirectives(app.context, s, deps.settings());
    const scene = s.scene;
    const entry = s.calendar.nightEvent;
    if (scene?.origin === 'night' && entry && (scene.nightEntryId === undefined || scene.nightEntryId === entry.id)) {
      const name = unitById(s, entry.unitId)?.displayName ?? 'She';
      app.context.setDirective(nightDirective(name, entry.framing));
    }
    app.refreshContext();
  }

  /** P9d: what the extraction is told about content: the categories that are off, and each unit's own limits (labels only). */
  function contentInput(s: CampaignState, participants: string[]): Pick<IntentExtractInput, 'excluded' | 'limits'> {
    const reg = deps.registries();
    const excluded = disabledCategories(s, reg);
    const limits: Record<string, string[]> = {};
    for (const id of participants) {
      const labels = unitById(s, id) ? ownLimitLabels(unitById(s, id)!, reg) : [];
      if (labels.length > 0) limits[id] = labels;
    }
    // P9d: the rules she lives by (and any being negotiated) so the reading can say whether one was kept or broken
    const rules = rulesOf(s).filter((r) => (r.status === 'active' || r.status === 'negotiating') && participants.includes(r.unitId)).map((r) => ({ id: r.id, unitId: r.unitId, text: r.text, status: r.status as 'active' | 'negotiating' }));
    return { ...(excluded.length > 0 ? { excluded } : {}), ...(Object.keys(limits).length > 0 ? { limits } : {}), ...(rules.length > 0 ? { rules } : {}) };
  }

  function unitInput(s: CampaignState, id: string): IntentExtractInput['units'][number] | null {
    const u = unitById(s, id);
    const rel = s.relations[id];
    if (!u || !rel) return null;
    return { id, name: u.displayName, values: { ...valuesOf(u) }, likes: likesOf(u), dislikes: dislikesOf(u), triggers: u.triggers, stateId: rel.stateId, defectIds: u.defects.map((d) => d.id) };
  }

  /**
   * Reads the not-yet-extracted messages, chunk by chunk, and applies what the mechanic model reports. Returns whether
   * anything applied. A failed chunk stops the pass without advancing the read pointer, so the next pass re-reads it.
   */
  async function extract(expect: string | undefined): Promise<boolean> {
    let applied = false;
    const first = st.getChatMessages(extracted);
    if (first.length > EXTRACT_MAX_CHUNKS * EXTRACT_MAX_MESSAGES) extracted = first[first.length - EXTRACT_MAX_CHUNKS * EXTRACT_MAX_MESSAGES].index;
    for (let chunk = 0; chunk < EXTRACT_MAX_CHUNKS; chunk++) {
      const s0 = state();
      if (!s0?.scene) return applied;
      const messages = st.getChatMessages(extracted).slice(0, EXTRACT_MAX_MESSAGES);
      if (messages.length === 0) return applied;
      const lastReply = [...messages].reverse().find((m) => !m.isUser);
      const nextPointer = messages[messages.length - 1].index + 1;
      if (!lastReply) {
        extracted = nextPointer;
        continue;
      }
      if (!(await extractChunk(s0, messages, lastReply, nextPointer, expect))) return applied;
      applied = true;
    }
    return applied;
  }

  const chunkKey = (sceneId: string, from: number, to: number): string => `${sceneId}:${from}-${to}`;
  const parseChunkKey = (key: string): { sceneId: string; from: number; to: number } | null => {
    const m = /^(.*):(\d+)-(\d+)$/.exec(key);
    return m ? { sceneId: m[1], from: Number(m[2]), to: Number(m[3]) } : null;
  };
  const chunkMessages = (k: { from: number; to: number }): ChatMessage[] => st.getChatMessages(k.from).filter((m) => m.index <= k.to);

  /** The model's input for the lines of one chunk: who is present and what the engine wants reported (rebuilt from the state, never stored). */
  function intentInput(s0: CampaignState, messages: ChatMessage[]): IntentExtractInput {
    const scene = s0.scene!;
    const units = scene.participants.map((id) => unitInput(s0, id)).filter((u): u is NonNullable<typeof u> => u !== null);
    const nm = (id: string) => (id === 'commander' ? s0.commander.name : unitById(s0, id)?.displayName ?? id);
    return {
      commanderName: s0.commander.name, channel: 'scene',
      exchange: messages.map((m) => ({ speaker: m.isUser ? s0.commander.name : m.name, text: m.text })),
      units, openPromises: openPromises(s0, scene.participants, scene.participants).map((p) => ({ by: nm(p.by), to: nm(p.to), text: p.text })),
      factTextMax: factTextMax(s0), romance: intimacyOf(s0).romance, measures: measureList(deps.registries(), s0),
      ...contentInput(s0, scene.participants),
      ...leakInput(s0, deps.registries(), scene.participants), // P12: what the frequency caught about those present (nothing without the trait)
      ...warnedInput(s0, scene.participants), // P12: the units the commander has an open warning about
      ...overrideInput(s0, deps.registries(), scene.participants), // P13: the warden's open override, while she is present
      ...expectationInput(s0, deps.registries(), scene.participants), // P13: her expectations, while she is present
      ...conspireInput(s0, deps.registries(), scene.participants), // P13: who the commander may enlist against her, while she is not present
    };
  }

  /** A chunk that fails again with more lines in it replaces the older failure of the same start: one record per start, never one per exchange. */
  function dropSuperseded(_s0: CampaignState, sceneId: string, from: number, key: string): void {
    const now = state();
    for (const r of now ? openRecords(now, { siteId: 'scene.intents' }) : []) {
      const k = parseChunkKey(r.key);
      if (k && k.sceneId === sceneId && k.from === from && r.key !== key) app.dispatch({ type: 'generation/close', payload: { id: r.id, outcome: 'dropped' } }, { expectChatId: chatId() });
    }
  }

  async function extractChunk(
    s0: CampaignState, messages: ChatMessage[], _lastReply: ChatMessage, _nextPointer: number, expect: string | undefined,
  ): Promise<boolean> {
    const scene = s0.scene!;
    for (const m of messages) {
      if (m.isUser) continue;
      const speaker = scene.participants.map((id) => unitById(s0, id)).find((u) => u !== undefined && u.displayName === m.name);
      if (speaker) deps.onUnitReply?.(speaker.id, m.text);
    }
    const key = chunkKey(scene.id, extracted, messages[messages.length - 1].index);
    const from = extracted;
    swipedWhileExtracting.clear();
    extracting = true;
    let outcome: Awaited<ReturnType<Envelope['generate']>>;
    try {
      outcome = await deps.generations.generate('scene.intents', key);
    } finally {
      extracting = false;
    }
    if (disposed || chatId() !== expect) return false; // a late answer for another chat
    if (outcome.kind === 'failed') {
      debug('Intent extraction failed; nothing changed.');
      dropSuperseded(s0, scene.id, from, key);
    }
    return outcome.kind === 'applied';
  }

  // the `scene.intents` site: the reading of one chunk of lines (key `<sceneId>:<from>-<to>`)
  deps.generations.bind<IntentExtractInput, ReturnType<typeof readIntentOutput>>('scene.intents', {
    build(key) {
      const k = parseChunkKey(key);
      const s0 = state();
      if (!k || !s0?.scene || s0.scene.id !== k.sceneId) return { expired: 'The scene is over.' };
      if (extracted > k.to) return { expired: 'Those lines were read already.' };
      const messages = chunkMessages(k);
      if (messages.length === 0) return { expired: 'Those lines are no longer in the chat.' };
      return intentInput(s0, messages);
    },
    // P8: the lowest disposition floor moved by the setting; the engine then judges each unit
    parse: (raw, input) => readIntentOutput(raw, input, { minConfidence: confidenceFloor(deps.registries(), deps.settings().intentMinConfidence) }),
    apply(key, result) {
      const k = parseChunkKey(key);
      if (!k || disposed) return { stale: true };
      const messages = chunkMessages(k);
      const lastReply = [...messages].reverse().find((m) => !m.isUser);
      if (!lastReply) return { stale: true };
      if (messages.some((m) => swipedWhileExtracting.has(m.index))) {
        // the reply was swiped while it was being read: drop this reading; the new reply is read when it arrives
        swipedWhileExtracting.clear();
        awaitingReextract = true;
        debug('A reply was swiped while it was being read; the reading was dropped.');
        return { stale: true };
      }
      const expect = chatId();
      const from = extracted;
      const nextPointer = k.to + 1;
      const before = state();
      if (!before || !before.scene) return { stale: true };
      // P9d: a flagged reply and a tone the reading found go in with the same step, so a rollback takes them too
      const flaggedHere = result.contentViolations.map((v) => v.category);
      if (flaggedHere.length > 0) debug(`Content flagged on reply ${lastReply.index}: ${flaggedHere.join(', ')}.`);
      const events = dispatch({
        type: 'intents/apply',
        payload: {
          channel: 'scene', intents: result.intents, readIndex: nextPointer, messageRef: `chat:${lastReply.index}`,
          ...(flaggedHere.length > 0 ? { violations: { index: lastReply.index, categories: flaggedHere } } : {}),
          ...(result.sceneTone !== null ? { tone: result.sceneTone } : {}),
        },
      }, expect);
      if (events.some((e) => e.type === 'error')) return { stale: true };
      const after = state();
      extracted = nextPointer;
      // P8: an extreme event that was dropped for every unit shows no cut-in
      const landed = (events.find((e) => e.type === 'intents_applied')?.landed as string[] | undefined) ?? result.intents.events.map((e) => e.type);
      const directives = reflect(events, result.intents.events.filter((e) => e.severity === 'extreme' && landed.includes(e.type)).map((e) => e.type));
      if (after && after !== before) lastApply = { lastReplyIndex: lastReply.index, from, to: k.to, before, after, directives };
      if (deps.settings().spriteMode === 'emotion_pick') {
        for (const em of result.emotions) deps.onUi({ type: 'sprite', unitId: em.unitId, label: em.label });
      }
      // the lines this reading covers are read: a failure of a smaller chunk inside them (the envelope closes this key's own) is over
      const now = state();
      for (const r of now ? openRecords(now, { siteId: 'scene.intents' }) : []) {
        const o = parseChunkKey(r.key);
        if (o && o.sceneId === k.sceneId && o.from >= k.from && o.to <= k.to && r.key !== key) app.dispatch({ type: 'generation/close', payload: { id: r.id, outcome: 'applied' } }, { expectChatId: expect });
      }
      debug(`Extracted ${result.intents.events.length} event(s).`);
      return 'ok';
    },
    // REROLL: the exchange that was read last, while nothing else changed (the same rule as a swipe)
    canUndo(key) {
      const la = lastApply;
      const s0 = state();
      if (!la || !s0?.scene || chunkKey(s0.scene.id, la.from, la.to) !== key) return 'Nothing was read there.';
      return state() === la.after ? null : MOVED_REASON;
    },
    undo(key) {
      const la = lastApply;
      const s0 = state();
      if (!la || !s0?.scene || chunkKey(s0.scene.id, la.from, la.to) !== key) return 'Nothing was read there.';
      if (s0 !== la.after || !deps.restore(la.before, la.after)) return MOVED_REASON;
      lastApply = null;
      extracted = la.from;
      for (const id of la.directives) app.context.clearDirective(id);
      app.refreshContext();
      return null;
    },
  });

  // the `emotion.pick` site: one sprite label for her last line (a failure writes nothing: the native sprite stands)
  deps.generations.bind<{ unitName: string; text: string }, ExpressionLabel>('emotion.pick', {
    build(unitId) {
      const s0 = state();
      const unit = s0 ? unitById(s0, unitId) : undefined;
      const scene = s0?.scene;
      if (!s0 || !scene || !unit) return { expired: 'She is not in the scene.' };
      const last = [...st.getChatMessages(Math.min(scene.startIndex, st.chatLength()))].reverse().find((m) => !m.isUser && m.avatar === unit.cardRef);
      return last ? { unitName: unit.displayName, text: last.text } : { expired: 'She has not spoken.' };
    },
    parse: (raw) => readEmotion(raw),
    apply(unitId, label) {
      deps.onUi({ type: 'sprite', unitId, label });
      return 'ok';
    },
  });

  async function showSprites(replies: ChatMessage[], extractedNow: boolean): Promise<void> {
    const s = state();
    if (!s) return;
    const mode = deps.settings().spriteMode;
    const latest = new Map<string, ChatMessage>();
    for (const r of replies) if (r.avatar) latest.set(r.avatar, r);
    for (const [avatar, msg] of latest) {
      const unit = unitByAvatar(s, avatar);
      if (!unit) continue;
      if (mode === 'native') {
        const label = await st.getLastExpression(avatar).catch(() => null);
        if (label) deps.onUi({ type: 'sprite', unitId: unit.id, label });
      } else if (!extractedNow) {
        await deps.generations.generate('emotion.pick', unit.id);
      }
    }
  }

  /** One exchange: send, read the group's replies, extract, draw sprites. The caller has set `pending`. */
  async function sendNow(t: string): Promise<void> {
    const expect = chatId();
    awaitingReextract = false;
    try {
      const before = st.chatLength();
      try {
        await st.sendUserMessage(t);
      } catch (e) {
        deps.toast('error', `Could not send: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      if (disposed || chatId() !== expect || !state()?.scene) return;
      if (!st.getChatMessages(before).some((m) => !m.isUser)) {
        // /trigger gives up quietly after 10 s when ST is still busy; the group may also simply have chosen nobody
        deps.toast('warn', 'No reply arrived. The chat may still be busy generating, or no group member was chosen to answer. Press STOP, wait a moment, then use ↻ to regenerate.');
        deps.onUi({ type: 'transcript' });
        return;
      }
      const events = dispatch({ type: 'scene/exchange', payload: {} }, expect);
      const exchanges = Number(events.find((e) => e.type === 'scene_exchange')?.exchanges ?? 0);
      deps.onUi({ type: 'transcript' });
      const settings = deps.settings();
      const due =
        settings.intentMode === 'exchange' || (settings.intentMode === 'every_n' && exchanges > 0 && exchanges % settings.intentEveryN === 0);
      const applied = due ? await extract(expect) : false;
      await showSprites(st.getChatMessages(before).filter((m) => !m.isUser), applied);
      // P3b: a long scene is digested while it runs, in the background (the next message does not wait for it)
      if (deps.memory) background = background.then(() => deps.memory!.digestIfDue()).catch(() => {});
      if (exchanges >= settings.scenePacing) deps.onUi({ type: 'pacing' });
      deps.onUi({ type: 'transcript' });
    } finally {
      pending = false;
    }
  }

  /** Index of a message this controller is editing right now (its `message_edited` event is ours to handle). */
  let selfEdit: number | null = null;

  /**
   * A message of the scene changed. If it is part of the last extracted exchange, that extraction is undone and the
   * exchange is read again; an older message keeps whatever was already read from it.
   */
  function handleEdited(index: number): void {
    const la = lastApply;
    deps.onUi({ type: 'transcript' });
    if (extracting) {
      swipedWhileExtracting.add(index);
      return;
    }
    if (!la || index < la.from || index > la.lastReplyIndex) {
      if (index < extracted) debug('That message has already been read; what was taken from it stays.');
      return;
    }
    awaitingReextract = false;
    controller.onSwipe(la.lastReplyIndex);
    if (!awaitingReextract) return; // not rolled back (something changed since): onSwipe said so
    awaitingReextract = false;
    const expect = chatId();
    background = background.then(async () => {
      if (!state()?.scene || chatId() !== expect) return;
      await extract(expect);
      deps.onUi({ type: 'transcript' });
    });
  }

  const lastIntentsKey = (): string | null => {
    const scene = state()?.scene;
    return lastApply && scene ? chunkKey(scene.id, lastApply.from, lastApply.to) : null;
  };

  /** What follows a scene that ended: the scene's directives go, and the whole living squad is active in the chat again. */
  async function afterEnd(expect: string | undefined): Promise<void> {
    if (chatId() === expect) {
      clearSceneDirectives(app.context);
      app.context.clearDirective('night');
      const now = state();
      app.context.clearMatching((d) => d.id.startsWith('proposal:') || d.id.startsWith('ask:'));
      app.refreshContext();
      const living = (now?.squad ?? []).filter((u) => u.kind === 'named' && u.status !== 'dead' && u.status !== 'deserted' && u.status !== 'terminated');
      try {
        await st.setMembersActive(living.map((u) => u.cardRef).filter((a): a is string => typeof a === 'string'));
      } catch (e) {
        deps.toast('warn', `Could not re-activate the squad in the group chat: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    deps.onUi({ type: 'transcript' });
  }

  /** The input of a scene summary: of the open scene, or (a late summary) of an ended one whose mark kept its range, day and people. */
  function summaryInput(s: CampaignState, sceneId: string): SceneSummaryInput | { expired: string } {
    const reg = deps.registries();
    const names = (ids: string[]) => ids.map((id) => ({ id, name: unitById(s, id)?.displayName ?? id }));
    const excluded = disabledCategories(s, reg);
    const scene = s.scene;
    if (scene && scene.id === sceneId) {
      const flaggedIndexes = new Set((scene.violations ?? []).map((v) => v.index));
      // P3b: a scene that was digested is summarized from the digest and what came after it, not from the whole chat
      const digest = scene.digest;
      const tail = st.getChatMessages(Math.min(digest ? digest.upTo + 1 : scene.startIndex, st.chatLength())).map((m) => ({
        speaker: m.isUser ? s.commander.name : m.name, text: m.text, ...(flaggedIndexes.has(m.index) ? { flagged: true as const } : {}),
      }));
      return {
        location: String(reg.locations.get(scene.locationId)?.name ?? scene.locationId),
        participants: names(scene.participants),
        transcript: digest ? [{ speaker: 'Digest of the scene so far', text: digest.text }, ...tail] : tail,
        ...(excluded.length > 0 ? { excluded } : {}),
        factTextMax: factTextMax(s),
      };
    }
    const mark = s.memory.scenes?.find((m) => m.sceneId === sceneId);
    if (!mark) return { expired: 'That scene is no longer remembered.' };
    if (mark.summarized) return { expired: 'That scene has its summary already.' };
    if (mark.participants === undefined || mark.locationId === undefined) return { expired: 'That scene ended before late summaries existed.' };
    if (st.chatLength() <= mark.to) return { expired: 'The chat is shorter than that scene.' };
    return {
      location: String(reg.locations.get(mark.locationId)?.name ?? mark.locationId),
      participants: names(mark.participants),
      transcript: st.getChatMessages(mark.from).filter((m) => m.index <= mark.to).map((m) => ({ speaker: m.isUser ? s.commander.name : m.name, text: m.text })),
      ...(excluded.length > 0 ? { excluded } : {}),
      factTextMax: factTextMax(s),
    };
  }

  // the `scene.summary` site (key: the scene id): the summary ends the open scene; a failure ends it with a plain line and a record, and a
  // later RETRY or REROLL stores the summary through `scene/late_summary` (an ended scene) or `scene/end` (the scene reopened by REROLL)
  deps.generations.bind<SceneSummaryInput, SceneSummary>('scene.summary', {
    build(sceneId) {
      const s0 = state();
      return s0 ? summaryInput(s0, sceneId) : { expired: 'No campaign is open.' };
    },
    parse: (raw, input) => readSceneSummary(raw as never, input),
    apply(sceneId, summary) {
      const expect = chatId();
      const before = state();
      if (!before) return { stale: true };
      // P9d: the summary only reports; it never marks the UI
      if (summary.contentViolations.length > 0) debug(`Scene summary flagged excluded content: ${summary.contentViolations.map((v) => v.category).join(', ')}.`);
      if (before.scene?.id === sceneId) {
        const events = dispatch({ type: 'scene/end', payload: { summary, endIndex: st.chatLength() - 1 } }, expect); // P3b: the chat range of the scene
        const after = state();
        if (events.some((e) => e.type === 'error') || !after) return { stale: true };
        deps.generations.takeSnapshot('scene.summary', sceneId, before, after);
        summaryKey = sceneId;
        return 'ok';
      }
      const events = dispatch({ type: 'scene/late_summary', payload: { sceneId, summary } }, expect);
      return events.some((e) => e.type === 'error') ? { stale: true } : 'ok';
    },
    fallback(sceneId) {
      const open = state()?.scene;
      if (!open || open.id !== sceneId) return false;
      const events = dispatch({ type: 'scene/end', payload: { endIndex: st.chatLength() - 1 } }, chatId());
      return !events.some((e) => e.type === 'error');
    },
  });

  const controller: SceneController = {
    async start(opts) {
      const expect = chatId();
      const s = state();
      if (!s) return false;
      extracted = st.chatLength();
      openedScene = null;
      lastApply = null;
      awaitingReextract = false;
      const events = dispatch({
        type: 'scene/start',
        payload: { locationId: opts.locationId, participants: opts.participants, origin: opts.origin, consumesSlot: opts.consumesSlot, startIndex: extracted, nightEntryId: opts.nightEntryId },
      }, expect);
      if (events.some((e) => e.type === 'error')) return false;
      try {
        await st.setMembersActive(avatarsOf(s, opts.participants));
      } catch (e) {
        dispatch({ type: 'scene/abort', payload: {} }, expect);
        if (opts.origin === 'activity') dispatch({ type: 'calendar/cancel_scene', payload: {} }, expect);
        deps.toast('error', `Could not start the scene: the group chat refused the change (${e instanceof Error ? e.message : String(e)}).`);
        return false;
      }
      const now = state();
      if (now) setSceneContext(now);
      deps.onUi({ type: 'transcript' });
      return true;
    },

    send(text) {
      // typed while the group is still speaking first: it goes out when they have finished, never thrown away
      if (text.trim() !== '' && pending && openingRun) return openingRun.then(() => controller.send(text));
      if (text.trim() === '' || pending || !state()?.scene) return Promise.resolve();
      pending = true;
      const run = sendNow(text.trim());
      inflight = run;
      void run.finally(() => {
        if (inflight === run) inflight = null;
      });
      return run;
    },

    opening() {
      const scene = state()?.scene;
      if (pending || !scene) return Promise.resolve();
      // once per scene, and never into a scene that already has messages (a reload finds it either way)
      if (openedScene === scene.id || st.getChatMessages(Math.min(scene.startIndex, st.chatLength())).length > 0) return Promise.resolve();
      openedScene = scene.id;
      pending = true;
      const run = (async () => {
        const expect = chatId();
        try {
          const before = st.chatLength();
          try {
            await st.triggerReplies();
          } catch (e) {
            deps.toast('error', `Could not start the conversation: ${e instanceof Error ? e.message : String(e)}`);
            return;
          }
          if (disposed || chatId() !== expect || !state()?.scene) return;
          const replies = st.getChatMessages(before).filter((m) => !m.isUser);
          deps.onUi({ type: 'transcript' });
          if (replies.length === 0) {
            deps.toast('warn', 'Nobody spoke first. Say something to start, or use ↻ to try again.');
            return;
          }
          await showSprites(replies, false);
          deps.onUi({ type: 'transcript' });
        } finally {
          pending = false;
        }
      })();
      inflight = run;
      openingRun = run;
      void run.finally(() => {
        if (inflight === run) inflight = null;
        if (openingRun === run) openingRun = null;
      });
      return run;
    },

    propose(kind, unitId) {
      const s = state();
      const target = unitId ?? s?.scene?.participants[0];
      if (!s?.scene || !target) return;
      const events = dispatch({ type: 'proposal/commander', payload: { unitId: target, kind, channel: 'scene' } }, chatId());
      if (!events.some((e) => e.type === 'error')) reflect(events);
    },
    follow() {
      const s = state();
      if (!s?.scene?.lead) return;
      const events = dispatch({ type: 'bonds/follow', payload: {} }, chatId());
      if (!events.some((e) => e.type === 'error')) {
        reflect(events);
        app.refreshContext();
      }
    },
    ask() {
      const s = state();
      const lead = s?.scene?.lead;
      const unit = lead ? unitById(s!, lead.unitId) : undefined;
      if (!lead || !unit) return;
      app.context.setDirective(askDirective(unit.id, unit.displayName));
      app.refreshContext();
    },
    limit(text) {
      const s = state();
      if (!s?.scene?.lead || text.trim() === '') return;
      const events = dispatch({ type: 'bonds/limit', payload: { text } }, chatId());
      if (!events.some((e) => e.type === 'error')) {
        deps.onUi({ type: 'transcript' });
        app.refreshContext();
      }
    },
    answer(proposalId, answer, condition) {
      const s = state();
      const p = s?.proposals?.find((x) => x.id === proposalId);
      const events = dispatch({ type: 'proposal/answer', payload: { proposalId, answer, ...(condition !== undefined ? { condition } : {}) } }, chatId());
      if (events.some((e) => e.type === 'error')) return;
      if (p && s) {
        const unit = unitById(s, p.unitId);
        if (unit && p.from === 'unit') app.context.setDirective(answerDirective(unit.id, unit.displayName, p.kind, answer, condition));
      }
      reflect(events);
    },

    async end() {
      // an exchange still being read must finish first, or it would be applied twice (here and by this flush)
      await inflight?.catch(() => {});
      await deps.memory?.idle(); // P3b: a digest in flight lands before the summary reads the scene
      const expect = chatId();
      const s = state();
      const scene = s?.scene;
      if (!s || !scene) return;
      pending = true;
      try {
        // whatever the batched modes (or an earlier failure) left unread
        if (st.getChatMessages(extracted).some((m) => !m.isUser)) await extract(expect);
        // the summary call, its fallback (the scene still ends, with a plain line) and the record of a failure are the envelope's
        await deps.generations.generate('scene.summary', scene.id);
      } finally {
        pending = false;
        lastApply = null;
        awaitingReextract = false;
        await afterEnd(expect);
      }
    },

    rerollLast: async () => {
      const key = lastIntentsKey();
      if (key === null) return;
      const out = await deps.generations.reroll('scene.intents', key);
      if (out.kind === 'applied') deps.onUi({ type: 'transcript' });
    },

    rerollState: () => {
      const key = lastIntentsKey();
      return key === null ? { enabled: false, reason: 'Nothing was read yet.' } : deps.generations.rerollState('scene.intents', key);
    },

    async rerollSummary() {
      const key = summaryKey;
      if (key === null) return;
      const expect = chatId();
      pending = true;
      try {
        await deps.generations.reroll('scene.summary', key); // reopens the scene from the snapshot, then ends it again with the new summary
      } finally {
        pending = false;
        const now = state();
        if (now?.scene) controller.resume(); // the reroll failed after the reopening: the scene is open again, as it was
        else await afterEnd(expect);
      }
    },

    summaryRerollState: () => (summaryKey === null ? { enabled: false, reason: 'No scene has ended yet.' } : deps.generations.rerollState('scene.summary', summaryKey)),

    transcript() {
      const scene = state()?.scene;
      if (!scene) return [];
      return st.getChatMessages(Math.min(scene.startIndex, st.chatLength()));
    },

    async edit(index, text) {
      const t = text.trim();
      if (t === '' || !state()?.scene) return;
      selfEdit = index;
      try {
        await st.editMessage(index, t);
      } catch (e) {
        deps.toast('error', `Could not edit the message: ${e instanceof Error ? e.message : String(e)}`);
        return;
      } finally {
        selfEdit = null;
      }
      handleEdited(index);
    },

    onEdited(index) {
      if (selfEdit === index) return; // our own edit: `edit` handles it
      handleEdited(index);
    },

    stop() {
      st.stopGeneration();
    },

    onSwipe(index) {
      if (extracting) {
        swipedWhileExtracting.add(index);
        return;
      }
      const la = lastApply;
      if (!la || index !== la.lastReplyIndex) return;
      lastApply = null;
      const current = state();
      if (current !== la.after || !deps.restore(la.before, la.after)) {
        debug(DEBUG_NOT_ROLLED_BACK);
        return;
      }
      extracted = la.from;
      awaitingReextract = true;
      for (const id of la.directives) app.context.clearDirective(id);
      app.refreshContext();
      debug('Swipe: the extraction for that reply was undone.');
    },

    resume() {
      const s = state();
      if (!s?.scene) return;
      // continue reading where the last applied extraction stopped, so lines said before the reload are not lost
      extracted = Math.min(s.scene.readIndex ?? st.chatLength(), st.chatLength());
      lastApply = null;
      void st.setMembersActive(avatarsOf(s, s.scene.participants)).catch((e) => deps.toast('warn', `Could not restore the scene members: ${e instanceof Error ? e.message : String(e)}`));
      setSceneContext(s);
      deps.onUi({ type: 'transcript' });
    },

    idle: () => background,

    dispose() {
      disposed = true;
    },
  };

  // a proposal directive lapses only when the unit it is about has answered (not when her neighbour in a group does)
  st.on('message_received', (i) => {
    const s = state();
    if (!s?.scene || disposed) return;
    const m = st.getChatMessages(Number(i))[0];
    const unit = m && !m.isUser ? unitByAvatar(s, m.avatar) : undefined;
    if (!unit) return;
    app.context.clearDirective(`proposal:${unit.id}`);
    app.refreshContext();
  });

  // a swiped or regenerated reply arrives: read it once the chat has finished generating
  st.on('generation_ended', () => {
    if (!awaitingReextract || disposed) return;
    awaitingReextract = false;
    const expect = chatId();
    background = background.then(async () => {
      if (!state()?.scene || chatId() !== expect) return;
      const applied = await extract(expect);
      if (applied) deps.onUi({ type: 'transcript' });
    });
  });

  return controller;
}
