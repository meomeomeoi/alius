import { registerWithdrawal } from '../bonds/content';
import { withdrawPractices } from '../practice/forget';

// Importing this module registers what the practices (P16) hang on the lower layers; the actions themselves come with the tasks that
// need them (`practice/*`, none yet). It is imported by `src/app.ts` after `actions/dynamic`, so the day step it will register
// later runs after the dynamic's own.

// A content category switched off withdraws every open practice tagged with it, ends a hold that needs it and suspends a denial rule: no deltas.
registerWithdrawal(withdrawPractices);
