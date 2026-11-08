import { registerAction } from '../dispatch';

// Importing this module registers the debug actions.
registerAction('debug/noop', () => []);

registerAction('debug/roll', (_draft, payload, ctx) => {
  const sides = (payload as { sides?: unknown } | undefined)?.sides;
  if (typeof sides !== 'number' || !Number.isInteger(sides) || sides < 1) {
    throw new Error('debug/roll requires an integer payload.sides >= 1');
  }
  return [{ type: 'rolled', value: ctx.rng.int(1, sides) }];
});
