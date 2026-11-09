import { consumeSlots, registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { isLiving } from '../economy';
import { addChronicle, addFact, applyCompaction, nextId, revealCrime } from '../memory';
import { applyIntents } from '../relations/apply';
import { installRelationAccounting } from '../relations/gain';
import { evaluateAutomatic, pushHistory } from '../relations/graph';
import { validateIntents } from '../relations/intents';
import { answerProposal, commanderProposal, rollDiscovery, type ProposalAnswer } from '../relations/proposals';
import { PROPOSAL_KINDS } from '../relations/vocab';
import type { SceneOrigin } from '../state/types';
import { TUNING } from '../tuning';

// Importing this module registers the scene, proposal and memory actions, installs P3's relation accounting
// (diminishing returns) in place of P2's default, and hooks the daily relationship pass into the day end.

installRelationAccounting();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ORIGINS: readonly SceneOrigin[] = ['activity', 'night', 'mess', 'event', 'debrief'];
const CHRONICLE_LINE_MAX = 240;

/** Once a day: units under extreme stress get a `stress_high` mark; every unit is re-evaluated (catches P2's axis changes). */
registerDayEndStep('dm_rumors', (draft, ctx) => {
  const events = [];
  for (const u of draft.squad.filter(isLiving)) {
    if (u.stress >= 80) pushHistory(draft, u.id, { day: draft.day, kind: 'event', type: 'stress_high' });
    events.push(...evaluateAutomatic(draft, ctx.registries, u.id));
  }
  return events;
});

registerAction('scene/start', (draft, payload, ctx) => {
  const reg = ctx.registries;
  if (!isObj(payload)) throw new Error('scene/start needs a payload');
  if (draft.scene) throw new Error('A scene is already open.');
  const origin = payload.origin as SceneOrigin;
  if (!ORIGINS.includes(origin)) throw new Error(`scene/start: unknown scene origin "${String(payload.origin)}"`);
  const start = payload.startIndex;
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 0) throw new Error('scene/start: startIndex must be a non-negative integer');
  const loc = typeof payload.locationId === 'string' ? reg.locations.get(payload.locationId) : undefined;
  if (!loc) throw new Error(`scene/start: unknown location "${String(payload.locationId)}"`);
  const slots = loc.slots as string[] | undefined;
  if (slots && !slots.includes(draft.slot)) throw new Error(`${String(loc.name)} is not available in the ${draft.slot} (slot).`);
  const ids = payload.participants;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || !ids.every((x) => typeof x === 'string')) {
    throw new Error('A scene has 1 to 3 participants.');
  }
  if (new Set(ids).size !== ids.length) throw new Error('A participant was listed twice.');
  for (const id of ids as string[]) {
    const u = draft.squad.find((x) => x.id === id);
    if (!u || !isLiving(u)) throw new Error(`Participant "${id}" is not available.`);
    if (u.kind === 'grunt') throw new Error(`${u.displayName} is a grunt without a character card; grunts cannot take part in scenes.`);
  }
  const participants = ids as string[];
  const pending = draft.calendar.pendingScene;
  if (origin === 'activity') {
    if (!pending || pending.unitId !== participants[0]) throw new Error('The conversation (talk) for this scene is not open.');
  } else if (pending) {
    throw new Error('A conversation is still open; end it first.');
  }
  if (origin === 'night' && draft.slot !== 'night') throw new Error('Night scenes only start in the Night slot.');

  const sceneId = nextId(draft, 's');
  draft.scene = {
    id: sceneId, day: draft.day, slot: draft.slot, locationId: loc.id, participants, mode: participants.length > 1 ? 'group' : 'private',
    origin, consumesSlot: payload.consumesSlot !== false, startIndex: start, exchanges: 0,
    ...(typeof payload.nightEntryId === 'string' ? { nightEntryId: payload.nightEntryId } : {}),
  };
  draft.calendar.pendingScene ??= { unitId: participants[0], day: draft.day, slot: draft.slot };
  return [{ type: 'scene_started', sceneId, participants, locationId: loc.id }];
});

registerAction('scene/exchange', (draft) => {
  if (!draft.scene) throw new Error('scene/exchange: no scene is open');
  draft.scene.exchanges += 1;
  return [{ type: 'scene_exchange', exchanges: draft.scene.exchanges }];
});

registerAction('intents/apply', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('intents/apply needs a payload');
  if (payload.channel === 'scene') {
    if (!draft.scene) throw new Error('intents/apply: no scene is open');
    return applyIntents(draft, ctx, { channel: 'scene', participants: draft.scene.participants, intents: payload.intents, sceneId: draft.scene.id });
  }
  if (payload.channel === 'dm') {
    const unit = draft.squad.find((u) => u.id === payload.unitId);
    if (!unit || unit.kind !== 'named' || !isLiving(unit)) throw new Error('intents/apply: a dm needs a named living unit');
    const events = applyIntents(draft, ctx, { channel: 'dm', participants: [unit.id], intents: payload.intents });
    events.push(...rollDiscovery(draft, ctx.registries, ctx.rng, [unit.id]));
    return events;
  }
  throw new Error('intents/apply: channel must be "scene" or "dm"');
});

registerAction('scene/end', (draft, payload, ctx) => {
  const scene = draft.scene;
  if (!scene) throw new Error('scene/end: no scene is open');
  const reg = ctx.registries;
  const events = [];
  const summary = isObj(payload) && isObj(payload.summary) ? payload.summary : undefined;

  const names = scene.participants.map((id) => draft.squad.find((u) => u.id === id)?.displayName ?? id).join(', ');
  const line = typeof summary?.chronicle === 'string' ? summary.chronicle.trim().slice(0, CHRONICLE_LINE_MAX).trim() : '';
  addChronicle(draft, {
    kind: 'scene', day: scene.day, sceneId: scene.id,
    text: line !== '' ? line : `${String(reg.locations.get(scene.locationId)?.name ?? scene.locationId)}: ${names} talked.`,
  });

  if (summary && Array.isArray(summary.facts)) {
    const facts = validateIntents({ facts: summary.facts }, { participants: scene.participants, squad: draft.squad }).facts;
    for (const f of facts.slice(0, TUNING.memory.factsPerScene)) {
      addFact(draft, {
        about: Array.isArray(f.about) ? f.about : [f.about], text: f.text, tags: f.tags, importance: f.importance, day: scene.day,
        sceneId: scene.id, knownBy: [...scene.participants],
      });
      if (f.tags.includes('crime')) events.push(...revealCrime(draft, reg, scene.participants));
    }
  }

  events.push(...rollDiscovery(draft, reg, ctx.rng, scene.participants));
  delete draft.scene;
  delete draft.calendar.pendingScene;
  events.push({ type: 'scene_ended', sceneId: scene.id, consumed: scene.consumesSlot });
  if (scene.consumesSlot) events.push(...consumeSlots(draft, 1, ctx));
  return events;
});

registerAction('scene/abort', (draft) => {
  const scene = draft.scene;
  if (!scene) throw new Error('scene/abort: no scene is open');
  delete draft.scene;
  // an activity talk keeps its hold so the app can cancel it with `calendar/cancel_scene`
  if (scene.origin !== 'activity') delete draft.calendar.pendingScene;
  return [{ type: 'scene_aborted', sceneId: scene.id }];
});

registerAction('proposal/commander', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string') throw new Error('proposal/commander needs { unitId, kind, channel }');
  if (!(PROPOSAL_KINDS as readonly string[]).includes(payload.kind as string)) throw new Error(`proposal/commander: unknown kind "${String(payload.kind)}"`);
  if (payload.channel !== 'scene' && payload.channel !== 'dm') throw new Error('proposal/commander: channel must be "scene" or "dm"');
  if (payload.channel === 'scene' && !draft.scene?.participants.includes(payload.unitId)) {
    throw new Error('proposal/commander: she is not in the open scene');
  }
  return commanderProposal(draft, ctx.registries, { unitId: payload.unitId, kind: payload.kind as string, channel: payload.channel });
});

registerAction('proposal/answer', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.proposalId !== 'string') throw new Error('proposal/answer needs { proposalId, answer }');
  return answerProposal(draft, ctx.registries, { proposalId: payload.proposalId, answer: payload.answer as ProposalAnswer });
});

registerAction('campaign/set_intimacy', (draft, payload) => {
  if (!isObj(payload)) throw new Error('campaign/set_intimacy needs a payload');
  if (typeof payload.romance !== 'boolean') throw new Error('campaign/set_intimacy: romance must be a boolean');
  if (payload.initiative !== 'low' && payload.initiative !== 'med' && payload.initiative !== 'high') {
    throw new Error('campaign/set_intimacy: initiative must be low, med or high');
  }
  draft.settings.intimacy = { romance: payload.romance, initiative: payload.initiative };
  return [{ type: 'intimacy_changed', romance: payload.romance, initiative: payload.initiative }];
});

registerAction('memory/compact', (draft, payload) => {
  if (!isObj(payload)) throw new Error('memory/compact needs a payload');
  const { kind, day, toDay, text } = payload;
  if ((kind !== 'day' && kind !== 'week') || typeof day !== 'number' || typeof text !== 'string' || (toDay !== undefined && typeof toDay !== 'number')) {
    throw new Error('memory/compact needs { kind, day, toDay?, text }');
  }
  const entry = applyCompaction(draft, { kind, day, toDay, text });
  return [{ type: 'chronicle_compacted', kind, day, toDay: entry.toDay ?? null }];
});

