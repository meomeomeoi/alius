import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { wardenDayStep } from '../warden/dayStep';
import { setAgenda } from '../warden/agenda';
import { answerOverride, argueStarted } from '../warden/override';
import { commanderDies, DEATH_CAUSES, type DeathCause } from '../warden/death';

// Importing this module registers the P13 LEASHSWAP actions. `app.ts` imports it after `actions/special`.

/** The commander acknowledged the WARDEN ASSIGNED notice (Veteran mode, or a skipped reveal scene). Once. */
registerAction('warden/revealed', (draft) => {
  const ls = draft.leashswap;
  if (!ls) throw new Error('warden/revealed: the campaign is not in the LEASHSWAP mode.');
  if (ls.revealed === true) throw new Error('warden/revealed: the warden was already revealed.');
  ls.revealed = true;
  return [{ type: 'warden_revealed' }];
});

/**
 * The model's agenda replaces the fallback, once, while no override has fired. The controller sends the normalized list; the engine
 * validates it again and decides which expectation is known. Draws no rng.
 */
registerAction('warden/agenda', (draft, payload, ctx) => {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as { expectations?: unknown };
  return setAgenda(draft, ctx.registries, p.expectations);
});

/**
 * The app found no usable day-start snapshot to rewind to (none, or another chat's): the death ends the campaign instead, for the
 * cause of the `commander_died` event it was told about. Allowed while a combat or an expedition is open (`dispatch`).
 */
registerAction('warden/no_snapshot', (draft, payload, ctx) => {
  const cause = (payload as { cause?: unknown } | null | undefined)?.cause;
  if (!DEATH_CAUSES.includes(cause as DeathCause)) throw new Error('warden/no_snapshot: the cause is `terminated` or `executed`.');
  return commanderDies(draft, ctx, cause as DeathCause, { forceEnd: true });
});

const EPILOGUE_MAX = 2400;

/** The epilogue of a closed campaign, stored once (written by the model, or the chronicle lines under a fixed heading). */
registerAction('campaign/epilogue', (draft, payload) => {
  if (!draft.ended) throw new Error('campaign/epilogue: the campaign is not closed.');
  if (draft.ended.epilogue !== undefined) throw new Error('campaign/epilogue: the epilogue is already written.');
  const text = (payload as { text?: unknown } | null | undefined)?.text;
  if (typeof text !== 'string' || text.trim() === '') throw new Error('campaign/epilogue: the text is empty.');
  if (text.length > EPILOGUE_MAX) throw new Error(`campaign/epilogue: at most ${EPILOGUE_MAX} characters.`);
  draft.ended.epilogue = text.trim();
  return [{ type: 'epilogue_written' }];
});

/** Manual-test hook: the commander dies now (`cause`: `terminated`, the default, or `executed`). Works only in the mode. */
registerAction('debug/kill_commander', (draft, payload, ctx) => {
  const cause = (payload as { cause?: unknown } | null | undefined)?.cause ?? 'terminated';
  if (!DEATH_CAUSES.includes(cause as DeathCause)) throw new Error('debug/kill_commander: the cause is `terminated` or `executed`.');
  return commanderDies(draft, ctx, cause as DeathCause);
});

/**
 * The commander answers the warden's open override: `{ overrideId, answer: 'comply' | 'argue' | 'defy' }`. A stale or unknown id is refused
 * and nothing runs. Allowed while a combat or an expedition is open (the override may belong to either).
 */
registerAction('warden/answer', (draft, payload, ctx) => {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as { overrideId?: unknown; answer?: unknown };
  return answerOverride(draft, ctx, p.overrideId, p.answer);
});

/** The ARGUE scene with her alone has opened: the override remembers it (`{ sceneId }`). Refused while compelled or after she has heard the commander out. */
registerAction('warden/argue_started', (draft, payload) => argueStarted(draft, (payload as { sceneId?: unknown } | null | undefined)?.sceneId));

// the warden's day step runs inside `director_tick`, after the hooks registered before it
registerDayEndStep('director_tick', wardenDayStep);
