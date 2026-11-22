import { registerWithdrawal } from '../bonds/content';
import { registerDayEndStep } from '../calendar';
import { registerPracticeUndone } from '../discipline/record';
import { registerRestrictionReader } from '../discipline/restrictions';
import { registerAction, registerAfterAction } from '../dispatch';
import { reportTask, taskChecksFromEvents } from '../practice/checks';
import { practiceDayStep } from '../practice/dayStep';
import { withdrawPractices } from '../practice/forget';
import { issuePractice } from '../practice/issue';
import { offencesFromEvents, repickPunishmentRequests } from '../practice/offences';
import { noteThreat } from '../practice/threats';
import { answerPunishment, restorePractice, takeInstead, undoPractice } from '../practice/punish';
import { commanderRestrictionOf, unitRestrictionOf } from '../practice/restrict';
import type { ValidOutput } from '../practice/state';
import { answerTask, signTask } from '../practice/tasks';
import { registerCommanderRestriction } from '../warden/punish';

// Importing this module registers what the practices (P16) hang on the lower layers and the actions of the package, as each task adds them. It is
// imported by `src/app.ts` after `actions/dynamic`, so the day step it registers runs after the dynamic's own.

// A content category switched off withdraws every open practice tagged with it, ends a hold that needs it and suspends a denial rule: no deltas.
registerWithdrawal((draft, reg, changed) => {
  const events = withdrawPractices(draft, reg, changed);
  repickPunishmentRequests(draft, reg); // her punishment that was asked for with an entry that went gets another (or none): the offence is kept, the weight too
  return events;
});
// What a day does to the practices (R7): fallback of old requests, new requests, expiry; nothing while nobody holds.
registerDayEndStep('dm_rumors', practiceDayStep);
// What an event decides about an open task (a scene with her, a booking, a token, a DM, a run): the engine checks of R2.
registerAfterAction(taskChecksFromEvents);
// What she answers in what the lower layers said (a refusal at `role`, a refused milestone, an overruled countermand, a slip or a caught cheat in a run, a broken rule): her offences (R8).
registerAfterAction(offencesFromEvents);
// What she did that reads as a threat to the commander is remembered for the next exchange (R18): a yield right after it is fear.
registerAfterAction(noteThreat);

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

/** `practice/undo { punishmentId }`: UNDO of an accept or a refuse of her discipline, as P9's (R8). Closes what exists, so it needs no live holder. */
registerAction('practice/undo', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.punishmentId !== 'string') throw new Error('practice/undo needs { punishmentId }.');
  return undoPractice(draft, ctx, payload.punishmentId);
});
