import { registerAction } from '../dispatch';

// Importing this module registers the P13 LEASHSWAP actions. `app.ts` imports it after `actions/special`.

/** The commander acknowledged the WARDEN ASSIGNED notice (Veteran mode, or a skipped reveal scene). Once. */
registerAction('warden/revealed', (draft) => {
  const ls = draft.leashswap;
  if (!ls) throw new Error('warden/revealed: the campaign is not in the LEASHSWAP mode.');
  if (ls.revealed === true) throw new Error('warden/revealed: the warden was already revealed.');
  ls.revealed = true;
  return [{ type: 'warden_revealed' }];
});
