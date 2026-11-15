import { setCategories } from '../bonds/content';
import { registerAction } from '../dispatch';

// Importing this module registers the P9d actions (`content/set_categories` now; the lead, rule and publicity actions follow).

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The player switches content categories on or off (SYS, setup). Applies from the next generation; draws no rng. */
registerAction('content/set_categories', (draft, payload, ctx) => {
  if (!isObj(payload) || !Array.isArray(payload.enabled) || payload.enabled.some((x) => typeof x !== 'string')) {
    throw new Error('content/set_categories needs { enabled: string[] }');
  }
  return setCategories(draft, ctx.registries, payload.enabled as string[]);
});
