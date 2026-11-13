import { registerAction } from '../dispatch';
import { applyCommanderSetup, defaultCommanderSetup, validateCommanderSetup, type CommanderSetup } from '../commander/profile';

// Importing this module registers the P7 commander actions.

/**
 * Gives an older save its commander file, once: the defaults, `fileReviewed: false` (the app then shows the review
 * modal) and `metDay` for every relation (the earliest day the unit appears in its own record, there is no join day).
 * A no-op when the commander already has a body.
 */
registerAction('commander/seed', (draft) => {
  if (draft.commander.body !== undefined) return [];
  applyCommanderSetup(draft.commander, defaultCommanderSetup());
  draft.commander.fileReviewed = false;
  for (const rel of Object.values(draft.relations)) {
    if (rel.metDay !== undefined) continue;
    rel.metDay = Math.min(rel.stateSince, ...rel.history.map((h) => h.day));
  }
  return [{ type: 'commander_seeded' }];
});

registerAction('commander/review_done', (draft) => {
  draft.commander.fileReviewed = true;
  return [];
});

registerAction('commander/set_profile', (draft, payload, ctx) => {
  if (draft.commander.fileReviewed !== false) throw new Error('The commander file was already reviewed.');
  const c = (payload as { commander?: CommanderSetup } | undefined)?.commander;
  if (c === undefined) throw new Error('commander/set_profile needs { commander }');
  const problems = validateCommanderSetup(c, ctx.registries, { desireBondDefects: draft.settings.desireBondDefects === true });
  if (problems.length > 0) throw new Error(problems.join('; '));
  applyCommanderSetup(draft.commander, c);
  draft.commander.fileReviewed = true;
  return [{ type: 'commander_profile_set' }];
});

/** Mirrors the global setting `firstImpressionTau` into the campaign, which is what the pure engine reads. */
registerAction('campaign/set_first_impression_tau', (draft, payload) => {
  const days = typeof payload === 'object' && payload !== null ? (payload as { days?: unknown }).days : undefined;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error('campaign/set_first_impression_tau needs { days } from 1 to 30');
  }
  draft.settings.firstImpressionTau = days;
  return [];
});
