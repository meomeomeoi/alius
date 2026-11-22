import { clockText } from '../engine/calendar';
import { warnedInput } from '../engine/special/paranoia/premonitions';
import { dynamicIntentInput } from '../engine/dynamic/intents';
import { practiceIntentInput } from '../engine/practice/intents';
import { lifeIntentInput } from '../engine/life/intents';
import { disabledCategories, ownLimitLabels, rulesOf } from '../engine/bonds';
import { dmMode, threadOf } from '../engine/dms';
import { measureList } from '../engine/discipline';
import { openPromises } from '../engine/memory';
import { herDossier, herFacts, herJournal } from '../engine/memory/inputs';
import { affinityBand, attractionBand, stressBand, trustBand } from '../engine/relations/bands';
import { intimacyOf } from '../engine/relations/gain';
import type { CampaignState, Unit } from '../engine/state/types';
import { replyModeFor } from '../engine/dmBehaviours';
import { offerReplyLine } from '../dynamic/directives';
import { sanitizeDm, type DmReplyInput } from '../llm/calls/dmReply';
import { leakInput } from '../engine/special/frequency/leaks';
import { readIntentOutput, type IntentExtractInput, type IntentOutput } from '../llm/calls/intentExtract';
import { confidenceFloor } from '../engine/worldOptions';
import type { PersonalController } from '../personal/controller';
import type { SceneController, SceneDeps } from './sceneController';
import { dislikesOf, likesOf, valuesOf } from '../engine/development/profile';
import { developmentMode } from '../engine/development/state';

export interface Comms {
  /**
   * Sends a DM; she answers (or snaps, or leaves it on read), and her answer is read for intents. P9c: a soldier with access to the
   * commander's messages may edit it first: nothing is sent, the `edit` UI event carries the edited text, and `answerEdit` sends
   * the commander's choice. `interceptId` sends a kept edit; `skipIntercept` sends as it is (after a REVERT).
   */
  send(unitId: string, text: string, opts?: { interceptId?: string; skipIntercept?: boolean }): Promise<void>;
  /** KEEP or REVERT on the DM edit that waits; sends the kept or the original text. */
  answerEdit(keep: boolean): Promise<void>;
  /** After a slot transition: some units start a DM on their own. */
  onSlotAdvanced(): Promise<void>;
  /** P11: one unit writes first, without the roll (the guided evening). A no-op with unit DMs off or when nothing is generated. */
  initiate(unitId: string): Promise<void>;
  /**
   * P10b: one line through the closed door of an open knock. She answers once (a single model call in `door` mode), the exchange
   * is stored on the knock and read for intents like a DM; nothing goes into the DM thread. A failed call leaves the line said
   * with no answer. Resolves when it is over; every step is dispatched with the chat it started in.
   */
  throughDoor(text: string): Promise<void>;
  /** P14: REROLL of her last reply (`dm.reply`): the state before it comes back, she answers again and the answer is read. Does nothing when something happened since. */
  rerollLast(unitId: string): Promise<void>;
  /** P14: the key of her last reply and whether it can be rerolled (null: her thread does not end with an answer of hers to the commander). */
  replyState(unitId: string): { siteKey: string; reroll: { enabled: boolean; reason?: string } } | null;
  /** Opens the knock: starts the night scene with the unit at the door. */
  openNight(): Promise<void>;
  /** Ignores the knock: the entry's consequence applies and the day rolls over. */
  ignoreNight(): void;
}

export type CommsDeps = SceneDeps & { scene: Pick<SceneController, 'start'>; /** P9c: the level-4 edit of an outgoing DM. */ personal?: Pick<PersonalController, 'beforeSend' | 'answerEdit'> & Partial<Pick<PersonalController, 'onReply'>> };

const HISTORY = 6;

function replyInput(s: CampaignState, deps: CommsDeps, unit: Unit, mode: DmReplyInput['mode']): DmReplyInput {
  const rel = s.relations[unit.id];
  const st = deps.registries().relationshipStates.get(rel.stateId);
  return {
    unitName: unit.displayName, commanderName: s.commander.name, stateHint: String(st?.promptHint ?? ''),
    bands: { trust: trustBand(rel.trust), affinity: affinityBand(rel.affinity), attraction: attractionBand(rel.attraction), stress: stressBand(unit.stress) },
    // only what she knows: facts visible to her alone (half of a scene's retrieval), her dossier and her journal (P3b)
    recentFacts: herFacts(s, unit.id, [...likesOf(unit), ...dislikesOf(unit)]).map((f) => f.text),
    ...(herDossier(s, unit.id) !== '' ? { dossier: herDossier(s, unit.id) } : {}),
    ...(herJournal(s, deps.registries(), unit.id, true).length > 0 ? { journal: herJournal(s, deps.registries(), unit.id, true) } : {}),
    slotText: clockText(s.day, s.slot),
    history: threadOf(s, unit.id).slice(-HISTORY).map((m) => ({ from: m.from === 'commander' ? ('commander' as const) : ('unit' as const), text: m.text })),
    mode,
  };
}

export function createComms(deps: CommsDeps): Comms {
  const { st, app } = deps;
  const state = (): CampaignState | null => app.current().state;
  const chatId = (): string | undefined => st.getActiveChat()?.chatId;
  const failed = (events: Array<{ type: string; code?: unknown; message?: unknown }>): boolean => {
    const e = events.find((x) => x.type === 'error');
    if (e && e.code !== 'chat_changed') deps.toast('error', String(e.message ?? e.code));
    return e !== undefined;
  };

  /** Reading runs started by a reply, by the key of the reply site: `send` and a reroll wait for them. */
  const reads = new Map<string, Promise<void>>();
  const splitKey = (key: string): [string, string] => {
    const at = key.indexOf(':');
    return [key.slice(0, at), key.slice(at + 1)];
  };
  const doorRef = (entryId: string): string => `door:${entryId}`;

  /** The model's input for reading one exchange (the commander's line and hers). */
  function readInput(s: CampaignState, unit: Unit, commanderText: string, reply: string): IntentExtractInput | null {
    const unitId = unit.id;
    const rel = s.relations[unitId];
    if (!rel) return null;
    const excluded = disabledCategories(s, deps.registries());
    const limitLabels = ownLimitLabels(unit, deps.registries());
    const ruleList = rulesOf(s).filter((r) => (r.status === 'active' || r.status === 'negotiating') && r.unitId === unitId).map((r) => ({ id: r.id, unitId: r.unitId, text: r.text, status: r.status as 'active' | 'negotiating' }));
    return {
      commanderName: s.commander.name, channel: 'dm',
      exchange: [{ speaker: s.commander.name, text: commanderText }, { speaker: unit.displayName, text: reply }],
      units: [{ id: unitId, name: unit.displayName, values: { ...valuesOf(unit) }, likes: likesOf(unit), dislikes: dislikesOf(unit), triggers: unit.triggers, stateId: rel.stateId, defectIds: unit.defects.map((d) => d.id) }],
      openPromises: openPromises(s, [unitId]).map((p) => ({ by: p.by === 'commander' ? s.commander.name : unit.displayName, to: p.to === 'commander' ? s.commander.name : unit.displayName, text: p.text })),
      romance: intimacyOf(s).romance, measures: measureList(deps.registries(), s),
      ...(excluded.length > 0 ? { excluded } : {}), ...(limitLabels.length > 0 ? { limits: { [unitId]: limitLabels } } : {}), // P9d
      ...(ruleList.length > 0 ? { rules: ruleList } : {}),
      ...(developmentMode(s) !== 'off' ? { reading: true as const } : {}), // P14b
      ...leakInput(s, deps.registries(), [unitId]), // P12: what the frequency caught about her (nothing without the trait)
      ...warnedInput(s, [unitId]), // P12: the units the commander has an open warning about
      ...lifeIntentInput(s, deps.registries(), [unitId], null, 'dm'), // P14c: her news and her hobbies only
      ...dynamicIntentInput(s, deps.registries(), [unitId], 'dm'), // P15: her probe, an open milestone, claim or offer (nothing while off or with no subject)
      ...practiceIntentInput(s, deps.registries(), [unitId], 'dm'), // P16: her open tasks, a punishment, a denial, a threat she may voice (nothing while she does not hold)
    };
  }

  /** Her answer is read for intents (site `dm.intents`, a quiet record when it fails); proposals by the commander are not honoured here (her text was written before any verdict). */
  async function readExchange(unitId: string, ref: string): Promise<void> {
    await deps.generations.generate('dm.intents', `${unitId}:${ref}`);
  }

  // `dm.intents` (key `<unitId>:<her reply id>` or `<unitId>:door:<knock id>`): the exchange is rebuilt from the thread or the knock
  deps.generations.bind<IntentExtractInput, IntentOutput>('dm.intents', {
    build(key) {
      const [unitId, ref] = splitKey(key);
      const s = state();
      const unit = s?.squad.find((u) => u.id === unitId);
      if (!s || !unit) return { expired: 'She is not here.' };
      let commanderText: string;
      let reply: string;
      if (ref.startsWith('door:')) {
        const entry = s.calendar.nightEvent;
        if (!entry || entry.id !== ref.slice('door:'.length) || entry.door?.reply === undefined) return { expired: 'The knock is over.' };
        commanderText = entry.door.said;
        reply = entry.door.reply;
      } else {
        const thread = threadOf(s, unitId);
        const at = thread.findIndex((m) => m.id === ref);
        if (at < 0) return { expired: 'That message is gone.' };
        if (at !== thread.length - 1) return { expired: 'A newer message came after it.' };
        const before = thread[at - 1];
        if (!before || before.from !== 'commander') return { expired: 'No message of the commander came before it.' };
        commanderText = before.text;
        reply = thread[at].text;
      }
      return readInput(s, unit, commanderText, reply) ?? { expired: 'She is not here.' };
    },
    // P8: the engine judges per unit
    parse: (raw, input) => readIntentOutput(raw, input, { minConfidence: confidenceFloor(deps.registries(), deps.settings().intentMinConfidence) }),
    apply(key, result) {
      const [unitId, ref] = splitKey(key);
      const expect = chatId();
      const intents = { ...result.intents, proposals: result.intents.proposals.filter((p) => p.from !== 'commander') };
      // P9: what the reading logs (a punishment, a threat) points back at her reply; a door exchange is not a DM message
      const lastId = ref.startsWith('door:') ? undefined : ref;
      const flagged = result.contentViolations.map((v) => v.category); // P9d: her reply depicts content that is off
      const events = app.dispatch({
        type: 'intents/apply',
        payload: { channel: 'dm', unitId, intents, ...(lastId ? { messageRef: `dm:${lastId}` } : {}), ...(flagged.length > 0 ? { violations: { categories: flagged } } : {}) },
      }, { expectChatId: expect });
      if (events.some((e) => e.type === 'error')) return { stale: true };
      for (const e of events) {
        if (e.type === 'proposal_offered') {
          const p = state()?.proposals?.find((x) => x.id === e.proposalId);
          if (p) deps.onUi({ type: 'chips', proposal: p });
        } else if (e.type === 'discipline_applied' || e.type === 'threat_registered') {
          deps.onUi({ type: 'discipline' });
        } else if (e.type === 'relation_changed') {
          deps.onUi({ type: 'pulse', unitId, axis: e.axis as 'trust' | 'affinity' | 'attraction', up: Number(e.delta) > 0, delta: Number(e.delta) });
        }
      }
      deps.onUi({ type: 'transcript' });
      return 'ok';
    },
  });

  // `dm.reply` (key `<unitId>:<the commander's message id>`): her answer to the last message of the thread; REROLL restores the state before it
  deps.generations.bind<DmReplyInput, string>('dm.reply', {
    build(key) {
      const [unitId, msgId] = splitKey(key);
      const s = state();
      const unit = s?.squad.find((u) => u.id === unitId);
      if (!s || !unit) return { expired: 'She is not here.' };
      const thread = threadOf(s, unitId);
      const at = thread.findIndex((m) => m.id === msgId && m.from === 'commander');
      if (at < 0) return { expired: 'That message is gone.' };
      if (at !== thread.length - 1) return { expired: 'Her thread moved on.' };
      const mode = dmMode(s, unitId);
      if (mode === 'ignore') return { expired: 'She left it on read.' };
      // P10b: a curt answer is decided before the call (a hash of the message she is about to send)
      const input = replyInput(s, deps, unit, replyModeFor(s, deps.registries(), unitId, mode === 'snap' ? 'snap' : 'reply'));
      // P15: an offer made in this thread was decided by the engine: her reply is told the answer (state only; nothing when no offer is open)
      const offer = input.mode === 'snap' ? null : offerReplyLine(s, deps.registries(), unitId);
      return offer === null ? input : { ...input, offer };
    },
    parse: (raw) => sanitizeDm(String(raw)),
    apply(key, reply, input) {
      const [unitId, msgId] = splitKey(key);
      const expect = chatId();
      const before = state();
      const commanderText = before ? threadOf(before, unitId).find((m) => m.id === msgId)?.text : undefined;
      if (!before || commanderText === undefined) return { stale: true };
      const received = app.dispatch({ type: 'dm/receive', payload: { unitId, text: reply, ...(input.mode === 'curt' ? { mode: 'curt' } : {}) } }, { expectChatId: expect });
      if (failed(received)) return { stale: true };
      deps.personal?.onReply?.(unitId, reply); // P9c: her first reply after a lost question wager answers it
      deps.onUi({ type: 'transcript' });
      const herId = threadOf(state()!, unitId).at(-1)?.id;
      if (herId === undefined) return 'ok';
      // the reading follows; the snapshot spans her reply and the reading, so a reroll never leaves deltas from words she no longer said
      const run = readExchange(unitId, herId).then(() => {
        const after = state();
        if (after && chatId() === expect) deps.generations.takeSnapshot('dm.reply', key, before, after);
      }).finally(() => reads.delete(key));
      reads.set(key, run);
      return 'ok';
    },
  });

  // `dm.initiate` (key `<unitId>:<day>:<slot>`): she writes first; a quiet record when it fails, expired when the slot has passed
  deps.generations.bind<DmReplyInput, string>('dm.initiate', {
    build(key) {
      const [unitId, when] = splitKey(key);
      const s = state();
      const unit = s?.squad.find((u) => u.id === unitId);
      if (!s || !unit) return { expired: 'She is not here.' };
      if (when !== `${s.day}:${s.slot}`) return { expired: 'That moment has passed.' };
      return replyInput(s, deps, unit, 'initiate');
    },
    parse: (raw) => sanitizeDm(String(raw)),
    apply(key, text) {
      const [unitId] = splitKey(key);
      const r = app.dispatch({ type: 'dm/receive', payload: { unitId, text, initiated: true } }, { expectChatId: chatId() });
      if (failed(r)) return { stale: true };
      deps.onUi({ type: 'transcript' });
      return 'ok';
    },
  });

  // `dm.door` (key: the knock's id): her one answer through the closed door; the exchange is read like a DM
  deps.generations.bind<DmReplyInput, string>('dm.door', {
    build(entryId) {
      const s = state();
      const entry = s?.calendar.nightEvent;
      const unit = s?.squad.find((u) => u.id === entry?.unitId);
      if (!s || !entry || !unit || entry.id !== entryId) return { expired: 'The knock is over.' };
      if (entry.door === undefined) return { expired: 'Nothing was said through the door.' };
      if (entry.door.reply !== undefined) return { expired: 'She answered already.' };
      // the line is not in the DM thread, so it joins her history here
      const input = replyInput(s, deps, unit, 'door');
      input.history = [...input.history, { from: 'commander', text: entry.door.said }];
      return input;
    },
    parse: (raw) => sanitizeDm(String(raw)),
    apply(entryId, reply) {
      const expect = chatId();
      const unitId = state()?.calendar.nightEvent?.unitId;
      const stored = app.dispatch({ type: 'night/door_reply', payload: { text: reply } }, { expectChatId: expect });
      if (failed(stored) || unitId === undefined) return { stale: true };
      const key = `${unitId}:${doorRef(entryId)}`;
      reads.set(key, readExchange(unitId, doorRef(entryId)).finally(() => reads.delete(key)));
      return 'ok';
    },
  });

  /** She writes first: generated from her state, delivered as an unread DM. A failure is a quiet record; nothing is stored. */
  async function initiateOne(unitId: string, expect: string | undefined): Promise<void> {
    const s = state();
    if (!s || chatId() !== expect || !s.squad.some((u) => u.id === unitId)) return;
    await deps.generations.generate('dm.initiate', `${unitId}:${s.day}:${s.slot}`);
  }

  const replyKeyOf = (s: CampaignState, unitId: string): string | null => {
    const thread = threadOf(s, unitId);
    const last = thread.at(-1);
    const prev = thread.at(-2);
    return last && prev && last.from === unitId && last.initiated !== true && prev.from === 'commander' ? `${unitId}:${prev.id}` : null;
  };

  const controller: Comms = {
    async send(unitId, text, opts) {
      const expect = chatId();
      if (deps.personal && opts?.interceptId === undefined && opts?.skipIntercept !== true) {
        const edit = await deps.personal.beforeSend(unitId, text);
        if (chatId() !== expect) return;
        if (edit.intercept) {
          deps.onUi({ type: 'edit', unitId, original: text, edited: edit.text, interceptId: edit.intercept.id, editorId: edit.intercept.editorId });
          return;
        }
      }
      const events = app.dispatch({ type: 'dm/send', payload: { unitId, text, ...(opts?.interceptId !== undefined ? { interceptId: opts.interceptId } : {}) } }, { expectChatId: expect });
      if (failed(events)) return;
      const mode = events.find((e) => e.type === 'dm_sent')?.mode;
      deps.onUi({ type: 'transcript' });
      if (mode === 'ignore') return; // left on read: no model call at all
      const sent = state();
      const sentId = sent ? threadOf(sent, unitId).at(-1)?.id : undefined;
      if (!sent || sentId === undefined || !sent.squad.some((u) => u.id === unitId)) return;
      const key = `${unitId}:${sentId}`;
      await deps.generations.generate('dm.reply', key);
      await reads.get(key); // her answer is read before this resolves
    },

    async answerEdit(keep) {
      const r = await deps.personal?.answerEdit(keep);
      if (!r) return;
      await controller.send(r.unitId, r.text, r.interceptId !== undefined ? { interceptId: r.interceptId } : { skipIntercept: true });
    },

    async onSlotAdvanced() {
      if (!deps.settings().unitDms) return;
      const expect = chatId();
      const rolled = app.dispatch({ type: 'dm/roll_initiative', payload: {} }, { expectChatId: expect });
      if (failed(rolled)) return;
      const ids = (rolled.find((e) => e.type === 'dm_initiative')?.unitIds as string[] | undefined) ?? [];
      for (const unitId of ids) {
        if (chatId() !== expect) return;
        await initiateOne(unitId, expect);
      }
    },

    async initiate(unitId) {
      if (!deps.settings().unitDms) return;
      await initiateOne(unitId, chatId());
    },

    async throughDoor(text) {
      const expect = chatId();
      const said = app.dispatch({ type: 'night/door_say', payload: { text } }, { expectChatId: expect });
      if (failed(said)) return;
      const entry = state()?.calendar.nightEvent;
      if (!entry || entry.door?.said === undefined) return;
      await deps.generations.generate('dm.door', entry.id);
      await reads.get(`${entry.unitId}:${doorRef(entry.id)}`);
    },

    async rerollLast(unitId) {
      const s = state();
      const key = s ? replyKeyOf(s, unitId) : null;
      if (key === null) return;
      await deps.generations.reroll('dm.reply', key);
      await reads.get(key);
    },

    replyState(unitId) {
      const s = state();
      const key = s ? replyKeyOf(s, unitId) : null;
      return key === null ? null : { siteKey: key, reroll: deps.generations.rerollState('dm.reply', key) };
    },

    async openNight() {
      const events = app.dispatch({ type: 'night/open', payload: {} }, { expectChatId: chatId() });
      if (failed(events)) return;
      const entry = events.find((e) => e.type === 'night_opened')?.entry as { id: string; unitId: string } | undefined;
      if (!entry) return;
      await deps.scene.start({ origin: 'night', locationId: 'quarters_commander', participants: [entry.unitId], nightEntryId: entry.id });
    },

    ignoreNight() {
      failed(app.dispatch({ type: 'night/ignore', payload: {} }, { expectChatId: chatId() }));
    },
  };
  return controller;
}
