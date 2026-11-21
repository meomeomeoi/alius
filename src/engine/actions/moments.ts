import { blockingLive } from '../blocking';
import { registerAction } from '../dispatch';
import { answerMoment } from '../moments/answer';

// Importing this module registers `moment/answer` (P15a).

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `moment/answer { momentId, key, tone?, at? }`: a chip's answer to the open moment (the reading's own answer comes inside `intents/apply`).
 * `at` is the chat index it is made at (the scene controller's `stage` adds it; absent = the scene's read pointer), so a swipe of the reply
 * before it takes the answer back. A stale id or an unknown key is refused. Draws one chance only on an opposite answer.
 */
registerAction('moment/answer', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('moment/answer needs a payload');
  if (!draft.scene) throw new Error('moment/answer: no scene is open');
  if (!blockingLive(draft, ctx.registries)) throw new Error('moment/answer: the blocking is not live in this scene');
  const { momentId, key, tone, at } = payload;
  if (typeof momentId !== 'string' || typeof key !== 'string') throw new Error('moment/answer needs { momentId, key }');
  if (at !== undefined && (typeof at !== 'number' || !Number.isInteger(at) || at < 0)) throw new Error('moment/answer: at must be a non-negative integer (the chat index)');
  if (tone !== undefined && typeof tone !== 'string') throw new Error('moment/answer: tone must be a word');
  return answerMoment(draft, ctx, momentId, key, 'chip', tone, at !== undefined ? { at } : {});
});
