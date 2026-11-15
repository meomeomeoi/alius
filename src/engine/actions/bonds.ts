import { setCategories } from '../bonds/content';
import { followLead, setSceneLimit } from '../bonds/scene';
import { registerAction } from '../dispatch';

// Importing this module registers the P9d actions (`content/set_categories` now; the lead, rule and publicity actions follow).

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** FOLLOW: the commander follows her lead (once per scene). Draws no rng. */
registerAction('bonds/follow', (draft, _payload, ctx) => followLead(draft, ctx));

/** SET A LIMIT: a boundary for this scene, in the fiction. Draws no rng. */
registerAction('bonds/limit', (draft, payload) => {
  if (!isObj(payload) || typeof payload.text !== 'string') throw new Error('bonds/limit needs { text }');
  return setSceneLimit(draft, payload.text);
});

/** The player switches content categories on or off (SYS, setup). Applies from the next generation; draws no rng. */
registerAction('content/set_categories', (draft, payload, ctx) => {
  if (!isObj(payload) || !Array.isArray(payload.enabled) || payload.enabled.some((x) => typeof x !== 'string')) {
    throw new Error('content/set_categories needs { enabled: string[] }');
  }
  return setCategories(draft, ctx.registries, payload.enabled as string[]);
});
