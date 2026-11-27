import { MODEST_BOND } from '../bonds/profile';
import { registerAction, registerAfterAction, type EngineEvent } from '../dispatch';
import { EXPECTATION_FIELDS, lockedExpectation, mergeExpectations, validateExpectations, type ExpectationProfile } from '../dynamic/expectations';
import { mergePractice, validatePractice } from '../dynamic/profile';
import { contentAllowed } from '../bonds/content';
import { consumeSlots, registerDayEndStep } from '../calendar';
import { applyRelationDelta } from '../relationGain';
import { dynamicDayStep } from '../dynamic/dayStep';
import { holdFeed } from '../dynamic/feed';
import { revealKnown, signsFromEvents } from '../dynamic/knowledge';
import { installDynamicHooks } from '../dynamic/hooks';
import { dynamicOn, holdReason } from '../dynamic/gate';
import { answerReturn, commandKeptEnforced, restoreCommandKept } from '../dynamic/aftermath';
import { bypassLeash } from '../dynamic/bypass';
import { noteLeashOnHer } from '../dynamic/compromat';
import { requestTransfer } from '../dynamic/oversight';
import { answerClaim } from '../dynamic/domains';
import { decideOverHead } from '../dynamic/decide';
import { masteryFromEvents } from '../dynamic/mastery';
import { makeOffer, readComposition } from '../dynamic/offer';
import { registerEnforced, registerUndone } from '../discipline/record';
import { exitDynamic, EXIT_MEANS } from '../dynamic/exit';
import { frameRank } from '../blocking/state';
import { answerMilestone } from '../dynamic/milestones';
import { readMoments, resettleReading } from '../dynamic/reading';
import { mannerFeedLanded } from '../dynamic/mannerFeed';
import { regardFeed, regardFromEvents } from '../dynamic/regard';
import { questionEvents } from '../dynamic/shame';
import { dynamicOf } from '../dynamic/state';
import { noteQuirkRuns } from '../dynamic/quirks';
import { noteEvents } from '../dynamic/style';
import { registerEventLanded } from '../relations/effects';
import { practiceEnabled } from '../dynamic/profile';
import { seedHold } from '../dynamic/seeds';
import { dynamicSaltOf, newDynamicCampaign } from '../dynamic/state';
import { BYPASS_ROUTES, EXIT_ROUTES, FREQUENCIES, HOLDER_CAPS, MAY_HOLD, MOTIVES, PACES, PRACTICE_LOCK_FIELDS, SENSITIVITIES, type Motive } from '../dynamic/types';
import { TUNING } from '../tuning';
import type { Unit } from '../state/types';

// Importing this module registers the actions of the dynamic (P15): the practice and expectation profile edits first, the dynamic's own later.

/** A named unit by id, or a refusal: a practice and an expectation profile are a named soldier's (grunts have none). */
export function namedUnit(draft: { squad: Unit[] }, id: unknown, action: string): Unit {
  const unit = typeof id === 'string' ? draft.squad.find((u) => u.id === id) : undefined;
  if (!unit || unit.kind !== 'named') throw new Error(`${action} needs a named unit.`);
  return unit;
}

// A relation event that lands on a holder feeds her hold (R8); the hook is inert while the dynamic is off.
registerEventLanded(holdFeed);
// ... and a kept promise or a quiet meeting that lands on a woman is value outside the dynamic: her Regard rises (R18); nothing while off.
registerEventLanded((draft, reg, unitId, event) => regardFeed(draft, reg, unitId, event));
registerEventLanded(mannerFeedLanded); // P15b: care from the commander pulls her manner (accumulators only)
// Her days (R8): decay, the slow term, tracks and favour; after her life's step (this module is imported after `actions/life`), and nothing while off.
registerDayEndStep('dm_rumors', dynamicDayStep);
// Her place in the P15a stand-ins: frame, live scenes, physics style, what she holds until, what she expects (R10); every reader is null while off.
installDynamicHooks();
// A moment she was answered feeds her reading of the commander, never her hold (R10, user ruling R1); nothing while off.
registerAfterAction(readMoments);
// What the surfacing reads and no state keeps (an endurance gain, the crime revealed): noted from the events, only while on.
registerAfterAction(noteEvents);
// What the squad sees on the stage (an item or a contact of the dynamic, a visitor who walks in): instant knowledge for the witnesses (R14); nothing while off.
registerAfterAction(signsFromEvents);
// What a woman knows turns known to the commander once she has shown it in a scene or a DM: the flag goes (the prompt and `Knowledge` read the same one) (R14).
registerAfterAction((draft) => { revealKnown(draft); return []; });
// What a hold, a record, a feat and a won run do to her Regard (R18); hidden, never changes hold or frame; nothing while off.
registerAfterAction((draft, ctx, events) => regardFromEvents(draft, ctx.registries, events));
// Her question without a good answer (R19b): when it is asked the cooldowns start, and the answer moves her Regard by what her own style values; nothing while off.
registerAfterAction((draft, ctx, events) => questionEvents(draft, ctx, events));
// A Leash request the commander filed on a holder (done, denied or held by her own block) is something she saw and keeps (compromat); oversight's own is not the commander's doing.
registerAfterAction((draft, ctx, events) => {
  if (!dynamicOn(draft, ctx.registries)) return [];
  for (const e of events) {
    if (e.type !== 'leash_used' || e.by === 'oversight' || typeof e.unitId !== 'string') continue;
    const dyn = dynamicOf(draft, e.unitId);
    if (dyn !== undefined && frameRank(dyn.frame) >= frameRank('play')) noteLeashOnHer(draft, e.unitId);
  }
  return [];
});
// Every act of the commander's on a worship target is xp for that target with that woman; a level shows the zone (R20); nothing while off.
registerAfterAction((draft, ctx, events) => masteryFromEvents(draft, ctx, events));
// A severe enforcement on the one who kept the command (a bench, a brig, the Leash) ends the struggle for it (R15a); nothing for anyone else.
registerEnforced(commandKeptEnforced);
// ... and UNDO of that enforcement (a punishment read from dialogue) gives the struggle back (the Inverse carries what it took).
registerUndone(restoreCommandKept);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The lock names a patch touches: its top-level fields, and `categories.<id>` for each category it names. */
function patchedFields(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).flatMap((k) => (k === 'categories' && isObj(patch.categories) ? Object.keys(patch.categories).map((id) => `categories.${id}`) : [k]));
}

/**
 * `profile/set_practice { unitId, practice }`: `practice` holds some of her fields; the rest keep their values. `categories` holds only the
 * categories to change, each with some of `as` / `witness`; `style` holds `primary` and / or `secondary` (null drops the secondary). A
 * field in her locks refuses the whole set ("That field is locked."). The merged result must be a legal section, else the set is refused
 * with what is wrong. The engine never checks the edit lock: the UI gates the edit on it.
 */
registerAction('profile/set_practice', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; practice?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/set_practice');
  if (!isObj(p?.practice) || Object.keys(p.practice).length === 0) throw new Error('profile/set_practice needs at least one field.');
  const patch = p.practice;
  const unknown = Object.keys(patch).filter((k) => !(['categories', 'style', 'audience', 'inclination', 'fairness', 'hintStyle', 'drive', 'manner', 'drawnBy', 'everyday', 'contrast', 'quirks'] as string[]).includes(k));
  if (unknown.length > 0) throw new Error(`A practice has no field "${unknown[0]}".`);
  const locked = unit.practiceLocks ?? [];
  if (patchedFields(patch).some((f) => locked.includes(f))) throw new Error('That field is locked.');
  const merged = mergePractice(unit.bond?.practice, patch);
  const read = validatePractice(merged, ctx.registries);
  if (read.practice === undefined || read.issues.length > 0) throw new Error(read.issues.length > 0 ? read.issues.join('; ') : 'A practice needs a primary style.');
  if (unit.bond === undefined) unit.bond = { ...MODEST_BOND, ownLimits: { categories: [] } };
  unit.bond.practice = read.practice;
  return [];
});

/**
 * `dynamic/quirk_sync {}` (P15b): notes that a run of hers was seen in the open scene, which a derived directive cannot know (it is what makes the `after` quirk due once the run ends). The controller
 * dispatches it only while `quirkSyncDue`; it writes nothing, and emits nothing, otherwise.
 */
registerAction('dynamic/quirk_sync', (draft, _payload, ctx) => {
  noteQuirkRuns(draft, ctx.registries);
  return [];
});

/** `profile/lock_practice { unitId, field, on }`: a locked field is kept by a re-sync and by drift, and shows a padlock. A field is one of `PRACTICE_LOCK_FIELDS` or `categories.<id>`. */
registerAction('profile/lock_practice', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; field?: unknown; on?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/lock_practice');
  const field = typeof p?.field === 'string' ? p.field : '';
  const category = field.startsWith('categories.') ? field.slice('categories.'.length) : undefined;
  if (!(PRACTICE_LOCK_FIELDS as readonly string[]).includes(field) && !(category !== undefined && ctx.registries.contentCategories.has(category))) {
    throw new Error(`A practice field is ${PRACTICE_LOCK_FIELDS.join(', ')} or categories.<id>.`);
  }
  if (typeof p?.on !== 'boolean') throw new Error('profile/lock_practice needs on: true or false.');
  const locks = (unit.practiceLocks ?? []).filter((f) => f !== field);
  if (p.on) locks.push(field);
  if (locks.length > 0) unit.practiceLocks = locks;
  else delete unit.practiceLocks;
  return [];
});


// ---------------------------------------------------------------------------------------------
// The expectation profile

/** The lock names an expectation patch touches: `worship.<id>` and `moments.<id>` for those two fields, the top-level field for the rest. */
function expectationFields(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).flatMap((k) => ((k === 'worship' || k === 'moments') && isObj(patch[k]) ? Object.keys(patch[k] as object).map((id) => `${k}.${id}`) : [k]));
}

/**
 * `profile/set_expectation { unitId, patch }`: `patch` holds some fields of her profile; `worship` and `moments` merge per id, every other
 * field is replaced whole, and `null` removes a field or an id. A field in her locks refuses the whole set ("That field is locked."), a
 * worship target that is closed in this campaign is refused, and the merged result must be a legal profile. The engine never checks the edit
 * lock: the UI gates the edit on it.
 */
registerAction('profile/set_expectation', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; patch?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/set_expectation');
  if (!isObj(p?.patch) || Object.keys(p.patch).length === 0) throw new Error('profile/set_expectation needs at least one field.');
  const patch = p.patch;
  const unknown = Object.keys(patch).filter((k) => !(EXPECTATION_FIELDS as readonly string[]).includes(k));
  if (unknown.length > 0) throw new Error(`An expectation profile has no field "${unknown[0]}".`);
  if (expectationFields(patch).some((f) => lockedExpectation(unit, f))) throw new Error('That field is locked.');
  const merged = mergeExpectations(unit.expectations, patch);
  const read = validateExpectations(merged, ctx.registries, { unitId: unit.id });
  if (read.issues.length > 0) throw new Error(read.issues.join('; '));
  if (isObj(patch.worship)) {
    for (const [id, entry] of Object.entries(patch.worship)) {
      const target = ctx.registries.worshipTargets.get(id);
      if (entry !== null && target !== undefined && !contentAllowed(draft, ctx.registries, target, unit.id)) throw new Error(`"${target.label ?? id}" is closed in this campaign.`);
    }
  }
  if (read.expectations === undefined) delete unit.expectations;
  else unit.expectations = read.expectations as ExpectationProfile;
  return [];
});

/** `profile/lock_expectation { unitId, field, on }`: a field is a top-level field, `worship.<targetId>` or `moments.<sourceId>`. A locked field is kept by a re-sync and by drift. */
registerAction('profile/lock_expectation', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; field?: unknown; on?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/lock_expectation');
  const field = typeof p?.field === 'string' ? p.field : '';
  const [head, id] = field.split('.');
  const known = (EXPECTATION_FIELDS as readonly string[]).includes(head)
    && (id === undefined || (head === 'worship' && ctx.registries.worshipTargets.has(id)) || (head === 'moments' && ctx.registries.momentSources.has(id)));
  if (!known) throw new Error(`An expectation field is ${EXPECTATION_FIELDS.join(', ')}, worship.<target> or moments.<source>.`);
  if (typeof p?.on !== 'boolean') throw new Error('profile/lock_expectation needs on: true or false.');
  const locks = (unit.expectationLocks ?? []).filter((f) => f !== field);
  if (p.on) locks.push(field);
  if (locks.length > 0) unit.expectationLocks = locks;
  else delete unit.expectationLocks;
  return [];
});


// ---------------------------------------------------------------------------------------------
// The campaign setup of the dynamic (R3)

/**
 * `dynamic/set_setup { holders?, pace?, frequency?, seeds? }`: SYS, mid-campaign. The block is created here (a salt from the rng as it stands,
 * nothing drawn) while a practice category is on; with none on and no block, the call is refused. Lowering `holders` ends nothing: a holder
 * keeps her place, and only new probes, offers and milestones out of `equal` are gated by it. `seeds` is the full list of seeded units: a unit
 * newly in it must be able to hold (the cap aside) and gets the head start once; one that leaves it keeps what she has. Never a frame.
 */
registerAction('dynamic/set_setup', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { holders?: unknown; pace?: unknown; frequency?: unknown; seeds?: unknown };
  if (p.holders !== undefined && !(HOLDER_CAPS as readonly unknown[]).includes(p.holders)) throw new Error('Holders must be 0, 1, 2, 3 or any.');
  if (p.pace !== undefined && !(PACES as readonly unknown[]).includes(p.pace)) throw new Error('The pace must be slow, normal or fast.');
  if (p.frequency !== undefined && !(FREQUENCIES as readonly unknown[]).includes(p.frequency)) throw new Error('The frequency must be rare, normal or often.');
  if (p.seeds !== undefined && (!Array.isArray(p.seeds) || p.seeds.some((id) => typeof id !== 'string'))) throw new Error('Seeds must be a list of unit ids.');
  const reg = ctx.registries;
  if (draft.dynamic === undefined) {
    if (!practiceEnabled(reg, draft.content?.enabled)) throw new Error('Switch a practice category on first: the dynamic needs one.');
    const d = TUNING.dynamic.defaults;
    draft.dynamic = newDynamicCampaign(dynamicSaltOf(draft.rng), { holders: d.holders, pace: d.pace, frequency: d.frequency, units: {} });
  }
  const setup = draft.dynamic.setup;
  if (p.holders !== undefined) setup.holders = p.holders as typeof setup.holders;
  if (p.pace !== undefined) setup.pace = p.pace as typeof setup.pace;
  if (p.frequency !== undefined) setup.frequency = p.frequency as typeof setup.frequency;
  const events: EngineEvent[] = [];
  if (p.seeds !== undefined) {
    const seeds = [...new Set(p.seeds as string[])];
    if (setup.holders !== 'any' && seeds.length > setup.holders) throw new Error(`At most ${setup.holders} seeded units (has ${seeds.length}).`);
    for (const id of seeds) {
      const unit = namedUnit(draft, id, 'dynamic/set_setup');
      const was = setup.units[id]?.seeded === true;
      const why = was ? null : holdReason(draft, reg, id, { ignoreCap: true, seeded: true });
      if (why !== null) throw new Error(`${unit.displayName} cannot hold: ${why}.`);
    }
    for (const [id, entry] of Object.entries(setup.units)) if (!seeds.includes(id) && entry.seeded) { delete entry.seeded; delete entry.startFrame; }
    for (const id of seeds) {
      const first = setup.units[id]?.seeded !== true;
      setup.units[id] = { ...setup.units[id], seeded: true };
      if (first) events.push(...seedHold(draft, reg, id));
    }
    for (const [id, entry] of Object.entries(setup.units)) if (Object.keys(entry).length === 0) delete setup.units[id];
  }
  return events;
});

/** `dynamic/set_unit { unitId, mayHold?, sensitivity? }`: what the setup says about one named unit (the spec's `dynamic/set_may_hold`, widened). Needs the block. */
registerAction('dynamic/set_unit', (draft, payload) => {
  const p = (payload ?? {}) as { unitId?: unknown; mayHold?: unknown; sensitivity?: unknown };
  const unit = namedUnit(draft, p.unitId, 'dynamic/set_unit');
  if (p.mayHold === undefined && p.sensitivity === undefined) throw new Error('dynamic/set_unit needs mayHold or sensitivity.');
  if (p.mayHold !== undefined && !(MAY_HOLD as readonly unknown[]).includes(p.mayHold)) throw new Error('May hold must be yes, no or auto.');
  if (p.sensitivity !== undefined && !(SENSITIVITIES as readonly unknown[]).includes(p.sensitivity)) throw new Error('Sensitivity must be sluggish, normal or lively.');
  if (draft.dynamic === undefined) throw new Error('The dynamic is not set up: use dynamic/set_setup first.');
  const entry = { ...draft.dynamic.setup.units[unit.id] };
  if (p.mayHold !== undefined) {
    if (p.mayHold === 'auto') delete entry.mayHold;
    else entry.mayHold = p.mayHold as typeof entry.mayHold;
  }
  if (p.sensitivity !== undefined) {
    if (p.sensitivity === 'normal') delete entry.sensitivity;
    else entry.sensitivity = p.sensitivity as typeof entry.sensitivity;
  }
  if (Object.keys(entry).length === 0) delete draft.dynamic.setup.units[unit.id];
  else draft.dynamic.setup.units[unit.id] = entry;
  return [];
});


// ---------------------------------------------------------------------------------------------
// Her reading (R10)

/**
 * `dynamic/declare { unitId, motive }`: the commander says what drives the position (from the milestone conversation, or later the "what do you
 * feel?" question). It needs her block; it sets her `declared` motive at weight `declaration.start`, and the weight fades each day, so deeds outweigh
 * it over time. Her region settles with the same hysteresis (no new sample).
 */
registerAction('dynamic/declare', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { unitId?: unknown; motive?: unknown };
  if (!dynamicOn(draft, ctx.registries)) throw new Error('The dynamic is off.');
  const unit = namedUnit(draft, p.unitId, 'dynamic/declare');
  if (!(MOTIVES as readonly unknown[]).includes(p.motive)) throw new Error(`A motive is ${MOTIVES.join(', ')}.`);
  const dyn = dynamicOf(draft, unit.id);
  if (dyn === undefined) throw new Error(`${unit.displayName} has no dynamic with the commander.`);
  dyn.declared = { motive: p.motive as Motive, weight: TUNING.position.declaration.start, day: draft.day };
  const shift = resettleReading(dyn).region;
  return shift === undefined ? [] : [{ type: 'position_shifted', unitId: unit.id, from: shift.from, to: shift.to }];
});


// ---------------------------------------------------------------------------------------------
// Her milestone (R11)

/**
 * `dynamic/answer_milestone { milestoneId, answer }`: the card's ACCEPT or REFUSE on her open milestone (the open id, `dm<n>`). The words of the
 * commander do the same through the intents `milestone_accepted` / `milestone_refused`, and the two paths make the same events. A milestone that
 * is not open is refused with nothing changed. Draws nothing.
 */
registerAction('dynamic/answer_milestone', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { milestoneId?: unknown; answer?: unknown };
  if (typeof p.milestoneId !== 'string') throw new Error('dynamic/answer_milestone needs a milestoneId.');
  if (p.answer !== 'accept' && p.answer !== 'refuse') throw new Error('The answer must be accept or refuse.');
  return answerMilestone(draft, ctx, p.milestoneId, p.answer, 'card');
});


// ---------------------------------------------------------------------------------------------
// Her claim (R12)

/**
 * `dynamic/answer_claim { claimId, answer }`: the card's YIELD, REFUSE or TALK on her open claim (the open id, `dc<n>`; a domain she asks for, or
 * her submit card at `rule`). A claim that is not open is refused with nothing changed. TALK changes nothing in the engine: the card opens a scene
 * with her, and a compromise reached there (`compromise_reached { claimId }`) yields the domain for a week. Draws nothing.
 */
registerAction('dynamic/answer_claim', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { claimId?: unknown; answer?: unknown };
  if (typeof p.claimId !== 'string') throw new Error('dynamic/answer_claim needs a claimId.');
  if (p.answer !== 'yield' && p.answer !== 'refuse' && p.answer !== 'talk') throw new Error('The answer must be yield, refuse or talk.');
  return answerClaim(draft, ctx, p.claimId, p.answer);
});


// ---------------------------------------------------------------------------------------------
// Leaving (R15)

/**
 * `dynamic/exit { unitId, route, toUnitId?, means? }`: the commander ends what she holds with her, by `abrupt`, `negotiated` (a scene; it
 * waits for a compromise, or ends abruptly from the same card), `transfer` (to another holder: `toUnitId`) or `force` (`means`: `discipline`, `leash`,
 * or `transfer_request`, which oversight takes up later). A forced exit never runs its means: the card runs it first through its own path (the squad's
 * vote, the warden's co-sign, the warnings) and the exit only checks, from state, that it was done on her today ("Do it first: ..." otherwise).
 * Always allowed for a dynamic at `play` or beyond; a refusal changes nothing. The only way to make an exit clean is a compromise in the scene (`compromise_reached { exitId }`), never a payload.
 */
registerAction('dynamic/exit', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { unitId?: unknown; route?: unknown; toUnitId?: unknown; means?: unknown };
  const unit = namedUnit(draft, p.unitId, 'dynamic/exit');
  if (!(EXIT_ROUTES as readonly unknown[]).includes(p.route)) throw new Error(`An exit is ${EXIT_ROUTES.join(', ')}.`);
  if (p.toUnitId !== undefined && typeof p.toUnitId !== 'string') throw new Error('toUnitId must be a unit id.');
  if (p.means !== undefined && !(EXIT_MEANS as readonly unknown[]).includes(p.means)) throw new Error(`A means is ${EXIT_MEANS.join(', ')}.`);
  return exitDynamic(draft, ctx, unit.id, p.route as (typeof EXIT_ROUTES)[number], {
    ...(p.toUnitId !== undefined ? { toUnitId: p.toUnitId as string } : {}), ...(p.means !== undefined ? { means: p.means as (typeof EXIT_MEANS)[number] } : {}),
  });
});


// ---------------------------------------------------------------------------------------------
// Her return offer (R15b)

/**
 * `dynamic/answer_return { answer }`: the card's ACCEPT or REFUSE on her return offer (the only one open). Accepting re-kindles the dynamic (the
 * frame is `play` again, her hold at the band the terms name); refusing ends the aftermath and the pair remembers it. Nothing open is refused with
 * nothing changed. Draws nothing.
 */
registerAction('dynamic/answer_return', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { answer?: unknown };
  if (p.answer !== 'accept' && p.answer !== 'refuse') throw new Error('The answer must be accept or refuse.');
  return answerReturn(draft, ctx, p.answer);
});


// ---------------------------------------------------------------------------------------------
// Going around the Leash block (R16)

/**
 * `dynamic/bypass_leash { route, kind, unitId, allyId? }`: files the request `kind` on `unitId` around the holder's block: through the comms terminal
 * (costs the slot), by a reset with a technical ally, or through another soldier (`allyId`). One discovery draw; a discovered one is a defiance
 * toward her. A refusal (no block, no ally, a request that cannot be filed) changes nothing. The combat compel has no bypass.
 */
registerAction('dynamic/bypass_leash', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { route?: unknown; kind?: unknown; unitId?: unknown; allyId?: unknown };
  if (!(BYPASS_ROUTES as readonly unknown[]).includes(p.route)) throw new Error(`A bypass is ${BYPASS_ROUTES.join(', ')}.`);
  if (p.kind !== 'compel' && p.kind !== 'suppress' && p.kind !== 'terminate') throw new Error('A request is compel, suppress or terminate.');
  if (typeof p.unitId !== 'string') throw new Error('dynamic/bypass_leash needs a unitId.');
  if (p.allyId !== undefined && typeof p.allyId !== 'string') throw new Error('allyId must be a unit id.');
  if (!dynamicOn(draft, ctx.registries)) throw new Error('The dynamic is off.');
  return bypassLeash(draft, ctx, { route: p.route as (typeof BYPASS_ROUTES)[number], kind: p.kind, unitId: p.unitId, ...(p.allyId !== undefined ? { allyId: p.allyId } : {}) });
});

/**
 * `dynamic/request_transfer { unitId }`: the commander files the oversight request to move her out, the means of a forced exit that spends no authorization
 * (`dynamic/exit { route: 'force', means: 'transfer_request' }` reads it from the state, for today). Needs her dynamic at `play` or beyond. Costs her Trust
 * (`TUNING.dynamic.transferRequest`) and a slot, once a day, never during an open conversation (user ruling 2026-11-22). Draws nothing.
 */
registerAction('dynamic/request_transfer', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { unitId?: unknown };
  const unit = namedUnit(draft, p.unitId, 'dynamic/request_transfer');
  if (!dynamicOn(draft, ctx.registries)) throw new Error('The dynamic is off.');
  const dyn = dynamicOf(draft, unit.id);
  if (dyn === undefined || frameRank(dyn.frame) < frameRank('play')) throw new Error(`${unit.displayName} holds nothing over the commander that oversight could move her from.`);
  // user ruling 2026-11-22: filing it costs her Trust and the commander's time, once a day, never inside an open conversation
  if (draft.calendar.pendingScene) throw new Error('A conversation is still open: end it before filing anything.');
  if ((draft.dynamic?.oversight?.requests ?? []).some((r) => r.unitId === unit.id && r.day === draft.day)) throw new Error(`The request about ${unit.displayName} is already filed today.`);
  const events = requestTransfer(draft, unit.id);
  const lost = applyRelationDelta(draft, unit.id, 'trust', -TUNING.dynamic.transferRequest.trust, 'transfer_request');
  if (lost !== 0) events.push({ type: 'relation_changed', unitId: unit.id, axis: 'trust', delta: lost, applied: lost });
  events.push(...consumeSlots(draft, TUNING.dynamic.transferRequest.slots, ctx));
  return events;
});


// ---------------------------------------------------------------------------------------------
// Offering yourself (R20)

/**
 * `dynamic/offer { unitId, composition, askInReturn? }`: the commander offers herself to a woman (`composition`: one or two entries under their tabs, as the composer lists
 * them; `askInReturn`: the composer's toggle). Her answer is the engine's (`makeOffer`), with the effects listed there; the action refuses what the composer would not list, a
 * woman who cannot hold and a third entry, with nothing changed. In a scene it goes through `SceneController.stage`, in a DM straight through. Draws only the claim an accepted offer of time or a part can become.
 */
registerAction('dynamic/offer', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { unitId?: unknown; composition?: unknown; askInReturn?: unknown };
  const unit = namedUnit(draft, p.unitId, 'dynamic/offer');
  return makeOffer(draft, ctx, unit.id, readComposition(p.composition), { askInReturn: p.askInReturn === true });
});

// An offer made in a scene lapses with it (the day end drops the rest): the scene's end closes what the model has not confirmed.
registerAfterAction((draft, _ctx, events) => {
  const x = draft.dynamic;
  if (x === undefined || x.open.offers.length === 0) return [];
  for (const e of events) if (e.type === 'scene_ended' || e.type === 'scene_aborted') x.open.offers = x.open.offers.filter((o) => o.sceneId !== e.sceneId);
  return [];
});

/** P10e-e 24b: `physics/decide { runId, kind, ref? }`: a decision of her hour's script, applied through her command capability (refused without it). */
registerAction('physics/decide', (draft, payload, ctx) => {
  if (typeof payload !== 'object' || payload === null) throw new Error('physics/decide needs a payload');
  return decideOverHead(draft, ctx, payload as Record<string, unknown>);
});
