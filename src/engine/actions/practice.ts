import { registerWithdrawal } from '../bonds/content';
import { registerDayEndStep } from '../calendar';
import { registerAction, registerAfterAction } from '../dispatch';
import { taskChecksFromEvents } from '../practice/checks';
import { practiceDayStep } from '../practice/dayStep';
import { withdrawPractices } from '../practice/forget';
import { issuePractice } from '../practice/issue';
import type { ValidOutput } from '../practice/state';
import { answerTask, signTask } from '../practice/tasks';

// Importing this module registers what the practices (P16) hang on the lower layers and the actions of the package, as each task adds them. It is
// imported by `src/app.ts` after `actions/dynamic`, so the day step it registers runs after the dynamic's own.

// A content category switched off withdraws every open practice tagged with it, ends a hold that needs it and suspends a denial rule: no deltas.
registerWithdrawal(withdrawPractices);
// What a day does to the practices (R7): fallback of old requests, new requests, expiry; nothing while nobody holds.
registerDayEndStep('dm_rumors', practiceDayStep);
// What an event decides about an open task (a scene with her, a booking, a token, a DM, a run): the engine checks of R2.
registerAfterAction(taskChecksFromEvents);

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
