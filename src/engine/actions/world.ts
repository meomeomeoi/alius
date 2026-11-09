import { registerAction } from '../dispatch';
import { seedWorld } from '../world/state';

// Importing this module registers the world actions (more are added by the expedition and mission modules).

registerAction('world/seed', (draft, _payload, ctx) => seedWorld(draft, ctx.registries));
