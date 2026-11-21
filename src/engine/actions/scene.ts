import { raiseTone, startTone } from '../bonds/scene';
import { factTextMax } from '../memory/config';
import { rollIntercepts } from '../special/frequency/intercepts';
import { returnNegotiations } from '../bonds/rules';
import { metAtScene } from '../personal/bookings';
import { rollSceneDiscovery } from '../personal/secrets';
import { clearSmother } from '../bonds/smother';
import { relieveAtSceneEnd } from '../bonds/want';
import { rollReveal } from '../bonds/publicity';
import { markDmViolation, markSceneViolation } from '../bonds/violations';
import { consumeSlots, registerDayEndStep } from '../calendar';
import type { Registries } from '../../content/types';
import { registerAction, type EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addChronicle, addFact, applyCompaction, nextId, revealCrime } from '../memory';
import { recordSceneRange } from '../memory/scenes';
import { applyIntents } from '../relations/apply';
import { showMoments, stampMoments, unstampMoments } from '../development/moments';
import { countCompanions } from '../development/habits';
import { startBlocking } from '../blocking/defaults';
import { noteBusy } from '../life/dayStep';
import { finishMeeting } from '../life/meetings';
import { endSceneNews } from '../life/news';
import { endSceneLife, startSceneLife } from '../life/opinions';
import { busySlot } from '../life/places';
import { restrictionReason, settleDefiance } from '../discipline';
import { installRelationAccounting } from '../relations/gain';
import { evaluateAutomatic, pushHistory } from '../relations/graph';
import { validateIntents } from '../relations/intents';
import { answerProposal, commanderProposal, rollDiscovery, type ProposalAnswer } from '../relations/proposals';
import { PROPOSAL_KINDS } from '../relations/vocab';
import type { CampaignState, SceneOrigin, SceneRecord } from '../state/types';
import { TUNING } from '../tuning';
import { argueEnded } from '../warden/override';

// Importing this module registers the scene, proposal and memory actions, installs P3's relation accounting
// (diminishing returns) in place of P2's default, and hooks the daily relationship pass into the day end.

installRelationAccounting();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ORIGINS: readonly SceneOrigin[] = ['activity', 'night', 'mess', 'event', 'debrief', 'prologue'];
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

/** Her scene-channel proposals do not outlive the scene: nobody could answer them (chips need the open scene). */
function expireSceneProposals(draft: import('../state/types').CampaignState, participants: string[]): import('../dispatch').EngineEvent[] {
  const ids = (draft.proposals ?? []).filter((x) => x.channel === 'scene' && participants.includes(x.unitId)).map((x) => x.id);
  if (ids.length === 0) return [];
  draft.proposals = (draft.proposals ?? []).filter((x) => !ids.includes(x.id));
  return [{ type: 'proposals_expired', ids }];
}

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
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > TUNING.scene.maxParticipants || !ids.every((x) => typeof x === 'string')) {
    throw new Error(`A scene has 1 to ${TUNING.scene.maxParticipants} participants.`);
  }
  if (new Set(ids).size !== ids.length) throw new Error('A participant was listed twice.');
  for (const id of ids as string[]) {
    const u = draft.squad.find((x) => x.id === id);
    if (!u || !isLiving(u)) throw new Error(`Participant "${id}" is not available.`);
    if (u.kind === 'grunt') throw new Error(`${u.displayName} is a grunt without a character card; grunts cannot take part in scenes.`);
    // P9: the brig and extra duty. A night knock is an event that happens to the commander, so it is not held back.
    const held = origin === 'night' ? null : restrictionReason(draft, id, 'scene');
    if (held) throw new Error(held);
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
    origin, consumesSlot: origin !== 'prologue' && payload.consumesSlot !== false, // P11: the prologue's scenes never cost a slot
    startIndex: start, readIndex: start, exchanges: 0,
    ...(typeof payload.nightEntryId === 'string' ? { nightEntryId: payload.nightEntryId } : {}),
  };
  draft.calendar.pendingScene ??= { unitId: participants[0], day: draft.day, slot: draft.slot };
  // P14c: a quiet meeting waiting for its scene: this scene is it (or the wait was stale); either way the wait is over
  const waiting = draft.life?.pending;
  if (waiting) {
    if (origin === 'activity' && participants.length === 1 && participants[0] === waiting.unitId && waiting.day === draft.day && waiting.slot === draft.slot) {
      draft.scene.pastime = { id: waiting.pastimeId, unitId: waiting.unitId };
    }
    delete draft.life!.pending;
  }
  // P15a: the P2 activity that opened the scene (given, or the one the place hosts for a talk) and her starting blocking activity (only while live)
  const hosted = origin === 'activity' && draft.scene.pastime === undefined ? [...reg.hubRooms.values()].find((r) => r.sceneLocationId === loc.id)?.activityIds : undefined;
  const activityId = typeof payload.activityId === 'string' && reg.activities.has(payload.activityId) ? payload.activityId : Array.isArray(hosted) ? String(hosted[0]) : undefined;
  if (activityId !== undefined) draft.scene.activityId = activityId;
  startBlocking(draft, reg);
  stampMoments(draft, participants, sceneId); // P14b: a quiet change of hers shows in this scene
  noteBusy(draft, participants); // P14c: they are with the commander this slot (a no-op while life is off)
  const topics = startSceneLife(draft, reg, { id: sceneId, locationId: loc.id, participants }, (id) => (origin === 'activity' ? draft.life?.busy.find((b) => b.unitId === id && b.slot === busySlot(draft.day, draft.slot) && b.activityId !== undefined)?.activityId : undefined)); // P14c: what the place and her week bring up (nothing while life is off)
  for (const id of participants) if (draft.relations[id]) draft.relations[id].contactDay = draft.day; // P9d: judges a daily-contact rule
  // P12: Secret Frequency listens once per present unit (nothing is drawn without the trait)
  const heard = rollIntercepts(draft, ctx, participants, { private: participants.length === 1, dm: false, sceneId });
  return [{ type: 'scene_started', sceneId, participants, locationId: loc.id }, ...startTone(draft, reg), ...metAtScene(draft, reg, participants), ...heard, ...topics]; // P9d: a romantic partner or a Want visit opens a romantic scene and decides its lead
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
    const events = applyIntents(draft, ctx, {
      channel: 'scene', participants: draft.scene.participants, intents: payload.intents, sceneId: draft.scene.id,
      ...(typeof payload.messageRef === 'string' ? { messageRef: payload.messageRef } : {}),
    });
    // the controller reports how far it has read, in the same step, so a rollback restores the pointer with the deltas
    if (typeof payload.readIndex === 'number' && Number.isInteger(payload.readIndex) && payload.readIndex >= 0) draft.scene.readIndex = payload.readIndex;
    // P9d: what the same reading found, stored on the scene so a swipe or an edit that rolls the reading back takes it too
    markSceneViolation(draft, ctx.registries, payload.violations);
    events.push(...raiseTone(draft, ctx.registries, payload.tone));
    return events;
  }
  if (payload.channel === 'dm') {
    const unit = draft.squad.find((u) => u.id === payload.unitId);
    if (!unit || unit.kind !== 'named' || !isLiving(unit)) throw new Error('intents/apply: a dm needs a named living unit');
    const events = applyIntents(draft, ctx, {
      channel: 'dm', participants: [unit.id], intents: payload.intents,
      ...(typeof payload.messageRef === 'string' ? { messageRef: payload.messageRef } : {}),
    });
    events.push(...rollDiscovery(draft, ctx.registries, ctx.rng, [unit.id]));
    markDmViolation(draft, ctx.registries, unit.id, payload.messageRef, payload.violations); // P9d
    return events;
  }
  throw new Error('intents/apply: channel must be "scene" or "dm"');
});

/**
 * Stores the facts a summary or a digest reports (validated like every model answer), known by the scene's participants and inside the
 * scene's cap of `factsPerScene` (a digest and the final summary share it).
 */
function storeSceneFacts(draft: CampaignState, reg: Registries, scene: Pick<SceneRecord, 'id' | 'day' | 'participants'>, raw: unknown[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  const facts = validateIntents({ facts: raw }, { participants: scene.participants, squad: draft.squad, factTextMax: factTextMax(draft) }).facts;
  const room = Math.max(0, TUNING.memory.factsPerScene - draft.memory.facts.filter((x) => x.sceneId === scene.id).length);
  for (const f of facts.slice(0, room)) {
    addFact(draft, {
      about: Array.isArray(f.about) ? f.about : [f.about], text: f.text, tags: f.tags, importance: f.importance, day: scene.day,
      sceneId: scene.id, knownBy: [...scene.participants],
    });
    if (f.tags.includes('crime') && f.about === 'commander') events.push(...revealCrime(draft, reg, scene.participants));
  }
  return events;
}

registerAction('scene/end', (draft, payload, ctx) => {
  const scene = draft.scene;
  if (!scene) throw new Error('scene/end: no scene is open');
  const reg = ctx.registries;
  const events = [];
  showMoments(draft, scene.id); // P14b: what this scene carried has been shown; it joins her dossier view
  events.push(...countCompanions(draft, reg, scene.participants)); // P14b: who spent the scene together
  const summary = isObj(payload) && isObj(payload.summary) ? payload.summary : undefined;

  const names = scene.participants.map((id) => draft.squad.find((u) => u.id === id)?.displayName ?? id).join(', ');
  const line = typeof summary?.chronicle === 'string' ? summary.chronicle.trim().slice(0, CHRONICLE_LINE_MAX).trim() : '';
  // P3b: the line is known to who was there ('*' when that is the whole living squad); the chat range is kept for the digest and for hiding
  const living = draft.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id);
  const everyone = living.length > 0 && living.every((id) => scene.participants.includes(id));
  addChronicle(draft, {
    kind: 'scene', day: scene.day, sceneId: scene.id, slot: scene.slot, audience: everyone ? '*' : [...scene.participants],
    text: line !== '' ? line : `${String(reg.locations.get(scene.locationId)?.name ?? scene.locationId)}: ${names} talked.`,
  });
  const endIndex = isObj(payload) ? payload.endIndex : undefined;
  if (typeof endIndex === 'number' && Number.isInteger(endIndex) && endIndex >= scene.startIndex) {
    // P14: a scene that ended with no summary keeps its day, place and people, so a late summary (`scene/late_summary`) can still be stored
    recordSceneRange(draft, {
      sceneId: scene.id, from: scene.startIndex, to: endIndex, summarized: summary !== undefined,
      ...(summary === undefined ? { day: scene.day, locationId: scene.locationId, participants: [...scene.participants] } : {}),
    });
  }

  if (summary && Array.isArray(summary.facts)) events.push(...storeSceneFacts(draft, reg, scene, summary.facts));

  events.push(...relieveAtSceneEnd(draft, scene)); // P9d: a romantic or intimate scene with her lowers her Want
  events.push(...returnNegotiations(draft, scene.participants)); // P9d: a negotiation nobody finished is a proposal again
  events.push(...rollDiscovery(draft, reg, ctx.rng, scene.participants));
  events.push(...rollReveal(draft, reg, ctx.rng, scene.participants)); // P9d: a secret relationship may come out with others present
  events.push(...rollSceneDiscovery(draft, ctx, scene.participants)); // P9c: a squad secret may come out (insight, a slip)
  events.push(...expireSceneProposals(draft, scene.participants));
  // P9: a defiance nobody answered in this scene settles now
  events.push(...settleDefiance(draft, ctx, { sceneId: scene.id }));
  for (const id of scene.participants) events.push(...clearSmother(draft, id)); // P9d: a scene with her ends her hold
  events.push(...finishMeeting(draft, ctx, scene)); // P14c: a quiet meeting applies now (an aborted scene applies nothing)
  events.push(...endSceneNews(draft, scene.participants)); // P14c: what she had to tell and did not is gone
  endSceneLife(draft, scene.participants); // P14c: what the scene triggered and picked is gone
  // P15a: what her blocking activity was counts for her hobby (the scene's blocking, moments and log go with the scene)
  for (const id of scene.participants) {
    const doing = scene.blocking?.[id]?.activity;
    if (doing !== undefined) noteBusy(draft, [id], undefined, doing);
  }
  delete draft.scene;
  delete draft.calendar.pendingScene;
  events.push({ type: 'scene_ended', sceneId: scene.id, consumed: scene.consumesSlot });
  events.push(...argueEnded(draft, ctx, scene.id)); // P13: the argument with the warden ends: a compromise runs the order, none leaves COMPLY and DEFY
  if (scene.consumesSlot) events.push(...consumeSlots(draft, 1, ctx));
  return events;
});

/**
 * P14: the summary of a scene that ended without one (the model failed) arrives later. It replaces the fallback line of that scene in
 * the chronicle (keeping who knew it; a line already compacted is left alone), stores the facts inside the scene's cap, and marks the
 * scene summarized. Draws nothing. Needs a mark that kept the scene's day and people (`scene/end` writes them while no summary exists).
 */
registerAction('scene/late_summary', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.sceneId !== 'string' || !isObj(payload.summary)) throw new Error('scene/late_summary needs { sceneId, summary }');
  const mark = draft.memory.scenes?.find((m) => m.sceneId === payload.sceneId);
  if (!mark || mark.summarized || mark.participants === undefined || mark.day === undefined) throw new Error('scene/late_summary: that scene is not waiting for a summary');
  const summary = payload.summary as Record<string, unknown>;
  const line = typeof summary.chronicle === 'string' ? summary.chronicle.trim().slice(0, CHRONICLE_LINE_MAX).trim() : '';
  const entry = draft.memory.chronicle.find((e) => e.kind === 'scene' && e.sceneId === mark.sceneId);
  const replaced = line !== '' && entry !== undefined;
  if (replaced) entry.text = line;
  const events: EngineEvent[] = [];
  if (Array.isArray(summary.facts)) events.push(...storeSceneFacts(draft, ctx.registries, { id: mark.sceneId, day: mark.day, participants: mark.participants }, summary.facts));
  mark.summarized = true;
  delete mark.day;
  delete mark.locationId;
  delete mark.participants;
  return [{ type: 'scene_summarized_late', sceneId: mark.sceneId, replaced }, ...events];
});

registerAction('scene/abort', (draft, _payload, ctx) => {
  const scene = draft.scene;
  if (!scene) throw new Error('scene/abort: no scene is open');
  const settled = settleDefiance(draft, ctx, { sceneId: scene.id });
  unstampMoments(draft, scene.id); // P14b: the scene never happened
  endSceneLife(draft, scene.participants); // P14c: what it triggered and picked is gone
  delete draft.scene;
  // an activity talk keeps its hold so the app can cancel it with `calendar/cancel_scene`
  if (scene.origin !== 'activity') delete draft.calendar.pendingScene;
  return [{ type: 'scene_aborted', sceneId: scene.id }, ...settled, ...expireSceneProposals(draft, scene.participants), ...argueEnded(draft, ctx, scene.id)];
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
  return answerProposal(draft, ctx.registries, { proposalId: payload.proposalId, answer: payload.answer as ProposalAnswer, condition: payload.condition });
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

/**
 * `scene/digest { text, upTo, facts }` (P3b): the model's account of a long scene so far. Needs an open scene and an `upTo` (an index
 * into the ST chat) past the last digest's (or the scene's start). The text is cut to `digestMax`; the facts are stored as at scene end.
 */
registerAction('scene/digest', (draft, payload, ctx) => {
  const scene = draft.scene;
  if (!scene) throw new Error('scene/digest: no scene is open');
  if (!isObj(payload) || typeof payload.text !== 'string' || typeof payload.upTo !== 'number' || !Number.isInteger(payload.upTo) || !Array.isArray(payload.facts)) {
    throw new Error('scene/digest needs { text, upTo, facts }');
  }
  const text = payload.text.trim().slice(0, TUNING.memory.digestMax).trim();
  if (text === '') throw new Error('scene/digest: empty text');
  if (payload.upTo <= (scene.digest?.upTo ?? scene.startIndex)) throw new Error('scene/digest: that digest is not newer than the last one');
  scene.digest = { text, upTo: payload.upTo };
  return [{ type: 'scene_digested', sceneId: scene.id, upTo: payload.upTo }, ...storeSceneFacts(draft, ctx.registries, scene, payload.facts)];
});

registerAction('memory/compact', (draft, payload) => {
  if (!isObj(payload)) throw new Error('memory/compact needs a payload');
  const { kind, day, toDay, text, audience } = payload;
  if ((kind !== 'day' && kind !== 'week') || typeof day !== 'number' || typeof text !== 'string' || (toDay !== undefined && typeof toDay !== 'number')) {
    throw new Error('memory/compact needs { kind, day, toDay?, audience?, text }');
  }
  if (audience !== undefined && audience !== '*' && !(Array.isArray(audience) && audience.every((x) => typeof x === 'string'))) {
    throw new Error('memory/compact: audience is "*" or a list of unit ids');
  }
  const entry = applyCompaction(draft, { kind, day, toDay, text, ...(audience !== undefined ? { audience: audience as string[] | '*' } : {}) });
  return [{ type: 'chronicle_compacted', kind, day, toDay: entry.toDay ?? null }];
});

