import { registerWithdrawal } from '../bonds/content';
import { registerDayEndStep } from '../calendar';
import { registerMomentTrigger } from '../moments/live';
import { registerPracticeUndone } from '../discipline/record';
import { registerRestrictionReader } from '../discipline/restrictions';
import { registerAction, registerAfterAction, registerVoteGate } from '../dispatch';
import { reportTask, taskChecksFromEvents } from '../practice/checks';
import { practiceDayStep } from '../practice/dayStep';
import { answerDemonstration, demonstrationsFromEvents } from '../practice/demonstration';
import { holdSweep } from '../practice/hold';
import { issuePractice } from '../practice/issue';
import { offencesFromEvents, withdrawAndRepick } from '../practice/offences';
import { punishVoteDecision } from '../power/punishGate';
import { askPermission, herDemandLive, itemRulesFromEvents, permissionLive } from '../practice/denial';
import { callPosture, callsFromEvents, namePosture, notePosture, takePosture } from '../practice/postures';
import { confess, momentGapFavour, serviceFromEvents } from '../practice/service';
import { noteThreat } from '../practice/threats';
import { answerPunishment, restorePractice, takeInstead, undoPractice, voiceWaitingPunishments } from '../practice/punish';
import { commanderRestrictionOf, unitRestrictionOf } from '../practice/restrict';
import type { ValidOutput } from '../practice/state';
import { answerTask, signTask } from '../practice/tasks';
import { registerCommanderRestriction } from '../warden/punish';

// Importing this module registers what the practices (P16) hang on the lower layers and the actions of the package, as each task adds them. It is
// imported by `src/app.ts` after `actions/dynamic`, so the day step it registers runs after the dynamic's own.

// A content category switched off withdraws every open practice tagged with it, ends a hold that needs it and suspends a denial rule: no deltas.
registerWithdrawal(withdrawAndRepick); // and her punishment that was asked for with an entry that went gets another (or none): the offence is kept, the weight too
// What a day does to the practices (R7): fallback of old requests, new requests, expiry; nothing while nobody holds.
registerDayEndStep('dm_rumors', practiceDayStep);
// What an event decides about an open task (a scene with her, a booking, a token, a DM, a run): the engine checks of R2.
registerAfterAction(taskChecksFromEvents);
// A scene at the stage after GO is her demonstration; when it ends the audience knows and the outcomes land. A service activity before another holder is a demonstration of one (R9).
registerAfterAction(demonstrationsFromEvents);
// What she answers in what the lower layers said (a refusal at `role`, a refused milestone, an overruled countermand, a slip or a caught cheat in a run, a broken rule): her offences (R8).
registerAfterAction(offencesFromEvents);
// What she did that reads as a threat to the commander is remembered for the next exchange (R18): a yield right after it is fear.
registerAfterAction(noteThreat);
// Her verdict on the commander's service (a pair of activities in the scene, anticipation, the scene's end) and what a moment she asked moves in her favour (R10).
registerAfterAction(serviceFromEvents);
registerAfterAction(momentGapFavour);
// What the commander wears can put a rule in force (the `rule` channel of P15a: a chastity item names the permission rule), and takes it away with the item or the scene (R13).
registerAfterAction(itemRulesFromEvents);
// Two moment sources are live because of what a holder has asked (R13): her demand waits for an answer; a permission rule stands while the commander is in contact with her.
registerMomentTrigger('permission', permissionLive);
registerMomentTrigger('her_demand', herDemandLive);
// Named postures (R14): a posture set on the commander in her scene is named by her, and now and then she calls one by its name; the call goes with the scene.
registerAfterAction(notePosture);
registerAfterAction(callPosture);
registerAfterAction((draft, _ctx, events) => callsFromEvents(draft, events));
// The hold of the commander (R11): it ends at its last slot, and at once when she leaves service, is hurt, goes on a run, stops being live or the category goes off.
registerAfterAction(holdSweep);
// A punishment she was given in a DM is told to the model in the first scene with her, once.
registerAfterAction(voiceWaitingPunishments);

// What her discipline stands in the way of: the commander's messages, free time and rooms, and a scene with her in her cold shoulder. The warden's own restrictions come first.
registerCommanderRestriction(commanderRestrictionOf);
registerRestrictionReader(unitRestrictionOf);
// UNDO of an answer to her discipline: P9's `revertInverse` puts the numbers back, this puts what the practices took back (R8).
registerPracticeUndone(restorePractice);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `practice/issue { requestId, output? }`: writes the practice of a request. `output` is the validated card the controller got from the model; none means the
 * fallback line. Refused for a request that is gone, a card of another kind, or a holder who is not holding.
 */
registerAction('practice/issue', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.requestId !== 'string') throw new Error('practice/issue needs { requestId }.');
  const output = payload.output === undefined ? 'fallback' : (payload.output as ValidOutput);
  return issuePractice(draft, ctx, payload.requestId, output);
});

/** `practice/answer_task { taskId, answer }`: ACCEPT, REFUSE or TALK on an offered task (R6). ACCEPT on a `words` or `signed` task throws: only the intent opens it. */
registerAction('practice/answer_task', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.taskId !== 'string' || (payload.answer !== 'accept' && payload.answer !== 'refuse' && payload.answer !== 'talk')) throw new Error('practice/answer_task needs { taskId, answer }.');
  return answerTask(draft, ctx, payload.taskId, payload.answer);
});

/** `practice/sign { taskId }`: the signature of a `signed` task whose words were said. */
registerAction('practice/sign', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.taskId !== 'string') throw new Error('practice/sign needs { taskId }.');
  return signTask(draft, ctx, payload.taskId);
});

/** `practice/report { taskId }`: the commander says a task is done (a DM-report task, or one the engine checks whose proof is a report). */
registerAction('practice/report', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.taskId !== 'string') throw new Error('practice/report needs { taskId }.');
  return reportTask(draft, ctx, payload.taskId);
});

/**
 * `practice/answer_demonstration { demonstrationId, answer: 'go' | 'refuse' }`: GO on a demonstration card says the scene to open (the event `task_answered` carries `scene`: where, who comes, that it costs the slot;
 * the controller opens it), REFUSE is a refusal at its stakes (R9). Throws for one that is gone, answered or hers while she is not holding.
 */
registerAction('practice/answer_demonstration', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.demonstrationId !== 'string' || (payload.answer !== 'go' && payload.answer !== 'refuse')) throw new Error('practice/answer_demonstration needs { demonstrationId, answer }.');
  return answerDemonstration(draft, ctx, payload.demonstrationId, payload.answer).events;
});

/** `practice/answer_punishment { punishmentId, answer }`: ACCEPT, NEGOTIATE or REFUSE on her discipline (R8). */
registerAction('practice/answer_punishment', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.punishmentId !== 'string' || (payload.answer !== 'accept' && payload.answer !== 'negotiate' && payload.answer !== 'refuse')) throw new Error('practice/answer_punishment needs { punishmentId, answer }.');
  return answerPunishment(draft, ctx, payload.punishmentId, payload.answer);
});

/** `practice/take_instead { punishmentId, answer }`: DO IT, TAKE IT INSTEAD or REFUSE on her order to punish a soldier (R8). */
registerAction('practice/take_instead', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.punishmentId !== 'string' || (payload.answer !== 'do_it' && payload.answer !== 'take_it' && payload.answer !== 'refuse')) throw new Error('practice/take_instead needs { punishmentId, answer }.');
  return takeInstead(draft, ctx, payload.punishmentId, payload.answer);
});

/**
 * DO IT on her order is the commander imposing a P9 measure on a soldier: the squad votes on it exactly as it does on `discipline/punish` (P9b: the gate is the only way to make an
 * action votable, and a decision the squad votes on is never skipped by another route). TAKE IT INSTEAD and REFUSE are not that decision.
 */
registerVoteGate('practice/take_instead', (state, payload, reg) => {
  if (!isObj(payload) || payload.answer !== 'do_it' || typeof payload.punishmentId !== 'string') return null;
  const order = state.practices?.punishments.find((x) => x.id === payload.punishmentId && x.forUnitId !== undefined);
  return order === undefined ? null : punishVoteDecision(reg, order.forUnitId!, order.entryId);
});

/** `practice/undo { punishmentId }`: UNDO of an accept or a refuse of her discipline, as P9's (R8). Closes what exists, so it needs no live holder. */
registerAction('practice/undo', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.punishmentId !== 'string') throw new Error('practice/undo needs { punishmentId }.');
  return undoPractice(draft, ctx, payload.punishmentId);
});

/** `practice/confess { taskId }`: `[ I DIDN'T ]` on her routine: the commander tells her it was not done today (an offence one weight lighter than a reported one, R10). */
registerAction('practice/confess', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.taskId !== 'string') throw new Error("practice/confess needs { taskId }.");
  return confess(draft, ctx, payload.taskId);
});

/** `practice/ask_permission { holderId }`: `[ ASK PERMISSION ]` (R13). Her answer is the engine's (style, favour, Want, frame) and is told to the model for her next reply. Throws with no rule of hers that asks for permission. */
registerAction('practice/ask_permission', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.holderId !== 'string') throw new Error('practice/ask_permission needs { holderId }.');
  return askPermission(draft, ctx, payload.holderId);
});

/**
 * `practice/take_posture { callId, postureId?, late, at? }`: the commander answers her call (R14). The right posture in time is set on the commander and earns service xp; a wrong or late one (or none) is a slip. `late` is the
 * UI's word that the time ran out (there is no timer with the order interaction off); `at` is the chat index the scene controller stages it at (the staging log's, as a chip's).
 */
registerAction('practice/take_posture', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.callId !== 'string' || typeof payload.late !== 'boolean' || (payload.postureId !== undefined && typeof payload.postureId !== 'string')) throw new Error('practice/take_posture needs { callId, postureId?, late }.');
  const at = typeof payload.at === 'number' && Number.isInteger(payload.at) && payload.at >= 0 ? payload.at : draft.scene?.exchanges ?? 0;
  return takePosture(draft, ctx, payload.callId, payload.postureId, payload.late, at);
});

/** `practice/name_posture { holderId, postureId, name? }`: her name for one of her postures (the model's, when the engine accepts it; else the posture's label). */
registerAction('practice/name_posture', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.holderId !== 'string' || typeof payload.postureId !== 'string' || (payload.name !== undefined && typeof payload.name !== 'string')) throw new Error('practice/name_posture needs { holderId, postureId, name? }.');
  return namePosture(draft, ctx, payload.holderId, payload.postureId, payload.name);
});
