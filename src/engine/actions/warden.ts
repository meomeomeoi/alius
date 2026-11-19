import { registerAction } from '../dispatch';
import { setAgenda } from '../warden/agenda';

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
