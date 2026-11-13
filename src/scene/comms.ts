import { clockText } from '../engine/calendar';
import { threadOf } from '../engine/dms';
import { openPromises, retrieveFacts } from '../engine/memory';
import { affinityBand, attractionBand, stressBand, trustBand } from '../engine/relations/bands';
import { intimacyOf } from '../engine/relations/gain';
import type { CampaignState, Unit } from '../engine/state/types';
import { generateDm, type DmReplyInput } from '../llm/calls/dmReply';
import { extractIntents } from '../llm/calls/intentExtract';
import { confidenceFloor } from '../engine/worldOptions';
import type { SceneController, SceneDeps } from './sceneController';

export interface Comms {
  /** Sends a DM; she answers (or snaps, or leaves it on read), and her answer is read for intents. */
  send(unitId: string, text: string): Promise<void>;
  /** After a slot transition: some units start a DM on their own. */
  onSlotAdvanced(): Promise<void>;
  /** Opens the knock: starts the night scene with the unit at the door. */
  openNight(): Promise<void>;
  /** Ignores the knock: the entry's consequence applies and the day rolls over. */
  ignoreNight(): void;
}

export type CommsDeps = SceneDeps & { scene: Pick<SceneController, 'start'> };

const HISTORY = 6;

function replyInput(s: CampaignState, deps: CommsDeps, unit: Unit, mode: DmReplyInput['mode']): DmReplyInput {
  const rel = s.relations[unit.id];
  const st = deps.registries().relationshipStates.get(rel.stateId);
  return {
    unitName: unit.displayName, commanderName: s.commander.name, stateHint: String(st?.promptHint ?? ''),
    bands: { trust: trustBand(rel.trust), affinity: affinityBand(rel.affinity), attraction: attractionBand(rel.attraction), stress: stressBand(unit.stress) },
    // only what she knows: facts visible to her alone
    recentFacts: retrieveFacts(s, { participants: [unit.id], tags: [...unit.likes, ...unit.dislikes] }, 3).map((f) => f.text),
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

  /** Her answer is read for intents; proposals by the commander are not honoured here (her text was written before any verdict). */
  async function readExchange(expect: string | undefined, unitId: string, commanderText: string, reply: string): Promise<void> {
    const s = state();
    const unit = s?.squad.find((u) => u.id === unitId);
    const rel = s?.relations[unitId];
    if (!s || !unit || !rel || chatId() !== expect) return;
    const result = await extractIntents({
      commanderName: s.commander.name, channel: 'dm',
      exchange: [{ speaker: s.commander.name, text: commanderText }, { speaker: unit.displayName, text: reply }],
      units: [{ id: unitId, name: unit.displayName, values: { ...unit.values }, likes: unit.likes, dislikes: unit.dislikes, triggers: unit.triggers, stateId: rel.stateId, defectIds: unit.defects.map((d) => d.id) }],
      openPromises: openPromises(s, [unitId]).map((p) => ({ by: p.by === 'commander' ? s.commander.name : unit.displayName, to: p.to === 'commander' ? s.commander.name : unit.displayName, text: p.text })),
      romance: intimacyOf(s).romance,
    }, { st, settings: deps.settings() }, { minConfidence: confidenceFloor(deps.registries(), deps.settings().intentMinConfidence) }); // P8: the engine judges per unit
    if (!result || chatId() !== expect) return;
    const intents = { ...result.intents, proposals: result.intents.proposals.filter((p) => p.from !== 'commander') };
    const events = app.dispatch({ type: 'intents/apply', payload: { channel: 'dm', unitId, intents } }, { expectChatId: expect });
    for (const e of events) {
      if (e.type === 'proposal_offered') {
        const p = state()?.proposals?.find((x) => x.id === e.proposalId);
        if (p) deps.onUi({ type: 'chips', proposal: p });
      } else if (e.type === 'relation_changed') {
        deps.onUi({ type: 'pulse', unitId, axis: e.axis as 'trust' | 'affinity' | 'attraction', up: Number(e.delta) > 0, delta: Number(e.delta) });
      }
    }
    deps.onUi({ type: 'transcript' });
  }

  return {
    async send(unitId, text) {
      const expect = chatId();
      const events = app.dispatch({ type: 'dm/send', payload: { unitId, text } }, { expectChatId: expect });
      if (failed(events)) return;
      const mode = events.find((e) => e.type === 'dm_sent')?.mode;
      deps.onUi({ type: 'transcript' });
      if (mode === 'ignore') return; // left on read: no model call at all
      const s = state();
      const unit = s?.squad.find((u) => u.id === unitId);
      if (!s || !unit) return;
      const reply = await generateDm(replyInput(s, deps, unit, mode === 'snap' ? 'snap' : 'reply'), { st, settings: deps.settings() });
      if (reply === null || chatId() !== expect) return;
      const received = app.dispatch({ type: 'dm/receive', payload: { unitId, text: reply } }, { expectChatId: expect });
      if (failed(received)) return;
      deps.onUi({ type: 'transcript' });
      await readExchange(expect, unitId, text.trim(), reply);
    },

    async onSlotAdvanced() {
      if (!deps.settings().unitDms) return;
      const expect = chatId();
      const rolled = app.dispatch({ type: 'dm/roll_initiative', payload: {} }, { expectChatId: expect });
      if (failed(rolled)) return;
      const ids = (rolled.find((e) => e.type === 'dm_initiative')?.unitIds as string[] | undefined) ?? [];
      for (const unitId of ids) {
        const s = state();
        const unit = s?.squad.find((u) => u.id === unitId);
        if (!s || !unit || chatId() !== expect) return;
        const text = await generateDm(replyInput(s, deps, unit, 'initiate'), { st, settings: deps.settings() });
        if (text === null || chatId() !== expect) continue;
        const r = app.dispatch({ type: 'dm/receive', payload: { unitId, text, initiated: true } }, { expectChatId: expect });
        if (!failed(r)) deps.onUi({ type: 'transcript' });
      }
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
}
