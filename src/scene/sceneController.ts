import type { Registries } from '../content/types';
import type { EngineEvent } from '../engine/dispatch';
import { openPromises } from '../engine/memory';
import { intimacyOf } from '../engine/relations/gain';
import type { ProposalAnswer } from '../engine/relations/proposals';
import type { CampaignState, PendingProposal, SceneOrigin, Unit } from '../engine/state/types';
import { pickEmotion } from '../llm/calls/emotionPick';
import { extractIntents, type IntentExtractInput } from '../llm/calls/intentExtract';
import { summarizeScene } from '../llm/calls/sceneSummary';
import type { AliusSettings } from '../settings';
import type { ChatMessage, StAdapter } from '../st/adapter';
import type { AliusApp } from '../app';
import { clearSceneDirectives, sceneDirectives } from './context';
import { answerDirective, nightDirective, proposalDirective } from './directives';

/** What the scene screen needs to react to. */
export type SceneUiEvent =
  | { type: 'pulse'; unitId: string; axis: 'trust' | 'affinity' | 'attraction'; up: boolean; delta: number }
  | { type: 'sprite'; unitId: string; label: string }
  | { type: 'chips'; proposal: PendingProposal }
  | { type: 'cut_in'; kind: string }
  | { type: 'pacing' }
  | { type: 'transcript' };

export type Toast = (kind: 'info' | 'warn' | 'error', text: string) => void;

export interface SceneDeps {
  st: StAdapter;
  app: Pick<AliusApp, 'dispatch' | 'current' | 'context' | 'refreshContext'>;
  /** Replaces the campaign with `before` only if the current state is still `expectedCurrent`. */
  restore(before: CampaignState, expectedCurrent: CampaignState): boolean;
  registries: () => Registries;
  settings: () => AliusSettings;
  toast: Toast;
  onUi: (e: SceneUiEvent) => void;
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
  /** The commander proposes something; the engine decides at once and the result becomes a directive for her next reply. */
  propose(kind: string, unitId?: string): void;
  answer(proposalId: string, answer: ProposalAnswer): void;
  end(): Promise<void>;
  transcript(): ChatMessage[];
  /** A message was swiped or deleted in ST: undo the last extraction if it was for that reply, then re-extract. */
  onSwipe(index: number): void;
  /** After a reload or chat change with an open scene: members, directives and the transcript. */
  resume(): void;
  /** Resolves when background work (a swipe re-extraction) has finished. */
  idle(): Promise<void>;
  dispose(): void;
}

/** At most this many new messages go into one extraction. */
const EXTRACT_MAX_MESSAGES = 8;

export const DEBUG_NOT_ROLLED_BACK = 'Not rolled back: something changed since.';

export function createSceneController(deps: SceneDeps): SceneController {
  const { st, app } = deps;
  /** First chat index not yet read by `intent_extract`. */
  let extracted = 0;
  /** The last applied extraction, so a swipe of its reply can undo exactly that. */
  let lastApply: { lastReplyIndex: number; from: number; before: CampaignState; after: CampaignState } | null = null;
  let awaitingReextract = false;
  let pending = false;
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
  function reflect(events: EngineEvent[], extremeKinds: string[] = []): void {
    const s = state();
    if (!s) return;
    for (const e of events) {
      switch (e.type) {
        case 'relation_changed':
          deps.onUi({ type: 'pulse', unitId: String(e.unitId), axis: e.axis as 'trust' | 'affinity' | 'attraction', up: Number(e.delta) > 0, delta: Number(e.delta) });
          break;
        case 'relation_state_changed':
          deps.onUi({ type: 'cut_in', kind: `state:${String(e.to)}` });
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
          break;
        }
      }
    }
    for (const kind of extremeKinds) deps.onUi({ type: 'cut_in', kind });
    app.refreshContext();
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

  function unitInput(s: CampaignState, id: string): IntentExtractInput['units'][number] | null {
    const u = unitById(s, id);
    const rel = s.relations[id];
    if (!u || !rel) return null;
    return { id, name: u.displayName, values: { ...u.values }, likes: u.likes, dislikes: u.dislikes, triggers: u.triggers, stateId: rel.stateId, defectIds: u.defects.map((d) => d.id) };
  }

  /** Reads the not-yet-extracted messages and applies what the mechanic model reports. Returns whether it applied. */
  async function extract(expect: string | undefined): Promise<boolean> {
    const s0 = state();
    const scene = s0?.scene;
    if (!s0 || !scene) return false;
    const all = st.getChatMessages(extracted);
    const messages = all.slice(-EXTRACT_MAX_MESSAGES);
    const lastReply = [...messages].reverse().find((m) => !m.isUser);
    if (!lastReply) return false;
    const units = scene.participants.map((id) => unitInput(s0, id)).filter((u): u is NonNullable<typeof u> => u !== null);
    const nm = (id: string) => (id === 'commander' ? s0.commander.name : unitById(s0, id)?.displayName ?? id);
    const input: IntentExtractInput = {
      commanderName: s0.commander.name, channel: 'scene',
      exchange: messages.map((m) => ({ speaker: m.isUser ? s0.commander.name : m.name, text: m.text })),
      units, openPromises: openPromises(s0, scene.participants).map((p) => ({ by: nm(p.by), to: nm(p.to), text: p.text })),
      romance: intimacyOf(s0).romance,
    };
    const result = await extractIntents(input, { st, settings: deps.settings() });
    if (disposed || chatId() !== expect) return false; // a late answer for another chat
    if (!result) {
      debug('Intent extraction failed; nothing changed.');
      return false;
    }
    const from = extracted;
    const before = state();
    if (!before || !before.scene) return false;
    const events = dispatch({ type: 'intents/apply', payload: { channel: 'scene', intents: result.intents } }, expect);
    if (events.some((e) => e.type === 'error')) return false;
    const after = state();
    extracted = st.chatLength();
    if (after && after !== before) lastApply = { lastReplyIndex: lastReply.index, from, before, after };
    reflect(events, result.intents.events.filter((e) => e.severity === 'extreme').map((e) => e.type));
    if (deps.settings().spriteMode === 'emotion_pick') {
      for (const em of result.emotions) deps.onUi({ type: 'sprite', unitId: em.unitId, label: em.label });
    }
    debug(`Extracted ${result.intents.events.length} event(s).`);
    return true;
  }

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
        const label = await pickEmotion({ unitName: unit.displayName, text: msg.text }, { st, settings: deps.settings() });
        if (label) deps.onUi({ type: 'sprite', unitId: unit.id, label });
      }
    }
  }

  const controller: SceneController = {
    async start(opts) {
      const expect = chatId();
      const s = state();
      if (!s) return false;
      extracted = st.chatLength();
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

    async send(text) {
      const t = text.trim();
      const expect = chatId();
      if (t === '' || pending || !state()?.scene) return;
      pending = true;
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
        app.context.onReplyReceived();
        const events = dispatch({ type: 'scene/exchange', payload: {} }, expect);
        const exchanges = Number(events.find((e) => e.type === 'scene_exchange')?.exchanges ?? 0);
        deps.onUi({ type: 'transcript' });
        const settings = deps.settings();
        const due =
          settings.intentMode === 'exchange' || (settings.intentMode === 'every_n' && exchanges > 0 && exchanges % settings.intentEveryN === 0);
        const applied = due ? await extract(expect) : false;
        await showSprites(st.getChatMessages(before).filter((m) => !m.isUser), applied);
        if (exchanges >= settings.scenePacing) deps.onUi({ type: 'pacing' });
        deps.onUi({ type: 'transcript' });
      } finally {
        pending = false;
      }
    },

    propose(kind, unitId) {
      const s = state();
      const target = unitId ?? s?.scene?.participants[0];
      if (!s?.scene || !target) return;
      const events = dispatch({ type: 'proposal/commander', payload: { unitId: target, kind, channel: 'scene' } }, chatId());
      if (!events.some((e) => e.type === 'error')) reflect(events);
    },

    answer(proposalId, answer) {
      const s = state();
      const p = s?.proposals?.find((x) => x.id === proposalId);
      const events = dispatch({ type: 'proposal/answer', payload: { proposalId, answer } }, chatId());
      if (events.some((e) => e.type === 'error')) return;
      if (p && s) {
        const unit = unitById(s, p.unitId);
        if (unit && p.from === 'unit') app.context.setDirective(answerDirective(unit.id, unit.displayName, p.kind, answer));
      }
      reflect(events);
    },

    async end() {
      const expect = chatId();
      const s = state();
      const scene = s?.scene;
      if (!s || !scene) return;
      pending = true;
      try {
        // whatever the batched modes (or an earlier failure) left unread
        if (st.getChatMessages(extracted).some((m) => !m.isUser)) await extract(expect);
        const names = (ids: string[]) => ids.map((id) => ({ id, name: unitById(s, id)?.displayName ?? id }));
        const summary = await summarizeScene({
          location: String(deps.registries().locations.get(scene.locationId)?.name ?? scene.locationId),
          participants: names(scene.participants),
          transcript: st.getChatMessages(Math.min(scene.startIndex, st.chatLength())).map((m) => ({ speaker: m.isUser ? s.commander.name : m.name, text: m.text })),
        }, { st, settings: deps.settings() });
        if (disposed || chatId() !== expect) return;
        dispatch({ type: 'scene/end', payload: summary ? { summary } : {} }, expect);
      } finally {
        pending = false;
        lastApply = null;
        awaitingReextract = false;
        if (chatId() === expect) {
          clearSceneDirectives(app.context);
          app.context.clearDirective('night');
          const now = state();
          for (const u of now?.squad ?? []) app.context.clearDirective(`proposal:${u.id}`);
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
    },

    transcript() {
      const scene = state()?.scene;
      if (!scene) return [];
      return st.getChatMessages(Math.min(scene.startIndex, st.chatLength()));
    },

    onSwipe(index) {
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
      app.refreshContext();
      debug('Swipe: the extraction for that reply was undone.');
    },

    resume() {
      const s = state();
      if (!s?.scene) return;
      extracted = st.chatLength();
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
