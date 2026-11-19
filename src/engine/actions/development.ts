import './memory'; // the rumors spread first: the day step below runs after them
import { registerActivityHook } from '../activities';
import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { recordActivity } from '../development/appraisal';
import { countActivity, habitEffect } from '../development/habits';
import { developmentDayStep } from '../development/misread';
import { applyReview, reviewCommitted, undoReview, type ReviewValue } from '../development/review';
import { DEVELOPMENT_MODES, developmentMode } from '../development/state';
import { isLiving } from '../economy';
import { TUNING } from '../tuning';
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
registerActivityHook((draft, ctx, done) => {
  if (!done.companionId) return [];
  const reg = ctx.registries;
  const events = recordActivity(draft, reg, done.companionId, done.activityId);
  // a habit she already has acts first; this activity's count may form the next one
  const unit = draft.squad.find((u) => u.id === done.companionId);
  if (unit) {
    for (const fx of habitEffect(draft, reg, unit.id, done.activityId)) {
      if (fx.type === 'unit_xp') {
        unit.xp += fx.amount;
        events.push({ type: 'xp_gained', unitId: unit.id, amount: fx.amount });
      } else {
        const next = Math.min(100, Math.max(0, unit.stress + fx.amount));
        events.push({ type: 'stress_changed', unitId: unit.id, delta: next - unit.stress });
        unit.stress = next;
      }
    }
  }
  events.push(...countActivity(draft, reg, done.companionId, done.activityId));
  return events;
});

// Revises the misread appraisals whose truth reached her, and drops the old ones (P14b); after `spreadRumors` (actions/memory, imported above).
registerDayEndStep('dm_rumors', developmentDayStep);

/**
 * `development/review { unitId, review, source, replace? }`: applies a review (the model's, or the engine's fallback) after
 * validating every shift again. `replace` takes the last review back first (a REROLL) and is refused once she has shown it.
 */
registerAction('development/review', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; review?: unknown; source?: unknown; replace?: unknown } | undefined;
  if (developmentMode(draft) === 'off') throw new Error('Character development is off.');
  const unit = typeof p?.unitId === 'string' ? draft.squad.find((u) => u.id === p.unitId) : undefined;
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) throw new Error('development/review needs a named living unit.');
  if (p?.source !== 'model' && p?.source !== 'fallback') throw new Error('development/review: the source is model or fallback.');
  const r = p.review as { shifts?: unknown; facts?: unknown } | undefined;
  if (typeof r !== 'object' || r === null || !Array.isArray(r.shifts) || !Array.isArray(r.facts)) throw new Error('development/review needs { review: { shifts, facts } }.');
  if (p.replace === true) {
    const why = reviewCommitted(draft, unit.id);
    if (why !== null) throw new Error(why);
    undoReview(draft, unit.id);
  }
  return applyReview(draft, ctx.registries, unit.id, r as ReviewValue, p.source);
});

/**
 * `development/edit_fact { unitId, factId, text, byModel? }`: the player rewrites one of her development facts (marked `edited`, which keeps it
 * from being pushed out), or the model words a habit (`byModel`: the text is replaced and the fact stays unedited). Cut to 140 characters.
 */
registerAction('development/edit_fact', (draft, payload) => {
  const p = payload as { unitId?: unknown; factId?: unknown; text?: unknown; byModel?: unknown } | undefined;
  const dev = typeof p?.unitId === 'string' ? draft.squad.find((u) => u.id === p.unitId)?.development : undefined;
  const fact = dev?.facts.find((f) => f.id === p?.factId);
  if (!dev || !fact) throw new Error('She has no such line.');
  const text = typeof p?.text === 'string' ? p.text.replace(/\s+/g, ' ').trim().slice(0, TUNING.development.factTextMax).trim() : '';
  if (text === '') throw new Error('A line cannot be empty.');
  fact.text = text;
  if (p?.byModel !== true) fact.edited = true;
  return [];
});
