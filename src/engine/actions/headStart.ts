import { registerAction } from '../dispatch';
import { applyRecap } from '../headStart/recap';

// Importing this module registers the head start action (P11b).

/**
 * `head_start/recap { units: [{ unitId, moments: [{ kind, text }] }], chronicle, source }`: the texts of the first weeks, from the model
 * or from the templates. The first one writes the facts (through the `head_start_moment` rules) and the chronicle paragraph; a later
 * one replaces the texts while no scene has started. The engine never reads the texts for numbers.
 */
registerAction('head_start/recap', (draft, payload, ctx) => applyRecap(draft, ctx.registries, payload));
