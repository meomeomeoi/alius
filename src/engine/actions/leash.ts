import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { ensureLeash, refreshLeash } from '../leash/weekly';

// Importing this module registers the P6 Leash actions and day-end step (more are added by the use, loyalty and dilemma modules).

registerAction('leash/seed', (draft, _payload, ctx) => ensureLeash(draft, ctx.registries));

// Registered after P5's deadline step (actions/world), so a `leash −1` that lands on the refresh day belongs to the old week.
registerDayEndStep('mission_deadlines', (draft, ctx) => [...ensureLeash(draft, ctx.registries), ...refreshLeash(draft, ctx.registries)]);
