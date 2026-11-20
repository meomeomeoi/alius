import { registerAction } from '../dispatch';
import { LIFE_MODES, ensureLife } from '../life/state';
import type { LifeMode } from '../state/types';

// Importing this module registers the actions of her life (P14c).

/**
 * `life/set_frequency { mode }`: the setting `lifeEvents`. The first time it is turned on, the block is made with the salt of every
 * chance (a hash of the rng as it stands; nothing is drawn). Turning it off keeps what was written (the facts, the hobbies, the opinions)
 * and stops every new pick, practice, queueing and opinion.
 */
registerAction('life/set_frequency', (draft, payload) => {
  const mode = (payload as { mode?: unknown } | undefined)?.mode;
  if (typeof mode !== 'string' || !LIFE_MODES.includes(mode as LifeMode)) throw new Error('Life events must be off, rare, normal or often.');
  draft.settings.lifeEvents = mode;
  if (mode !== 'off') ensureLife(draft);
  return [{ type: 'life_frequency_set', mode }];
});
