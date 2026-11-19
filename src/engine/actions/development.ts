import './memory'; // the rumors spread first: the day step below runs after them
import { registerActivityHook } from '../activities';
import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { recordActivity } from '../development/appraisal';
import { developmentDayStep } from '../development/misread';
import { DEVELOPMENT_MODES } from '../development/state';
import type { DevelopmentMode } from '../state/types';

// Importing this module registers the character development actions (P14b).

/**
 * `development/set_mode { mode }`: the setting `characterDevelopment`. Turning it off keeps what she already became (the readers
 * still fold it in) and stops new recording, counting and reviewing.
 */
registerAction('development/set_mode', (draft, payload) => {
  const mode = (payload as { mode?: unknown } | undefined)?.mode;
  if (typeof mode !== 'string' || !DEVELOPMENT_MODES.includes(mode as DevelopmentMode)) throw new Error('Character development must be off, slow or normal.');
  draft.settings.characterDevelopment = mode;
  return [];
});

// The companion of an activity reads it (P14b); nothing is recorded while development is off.
registerActivityHook((draft, ctx, done) => (done.companionId ? recordActivity(draft, ctx.registries, done.companionId, done.activityId) : []));

// Revises the misread appraisals whose truth reached her, and drops the old ones (P14b); after `spreadRumors` (actions/memory, imported above).
registerDayEndStep('dm_rumors', developmentDayStep);
