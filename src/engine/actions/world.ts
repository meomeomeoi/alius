import { registerDayEndStep } from '../calendar';
import { answerRequest, fallbackOutput, openRequest } from '../world/director';
import { TUNING } from '../tuning';
import { registerAction } from '../dispatch';
import { followRumor, registerMissionCompletedHook, runDeadlines } from '../world/missions';
import { onMissionCompleted } from '../world/spine';
import { seedWorld } from '../world/state';

// Importing this module registers the world actions (more are added by the expedition and mission modules).

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerAction('world/seed', (draft, _payload, ctx) => seedWorld(draft, ctx.registries));

registerAction('mission/dismiss', (draft, payload) => {
  const id = isObj(payload) ? payload.missionId : undefined;
  if (typeof id !== 'string') throw new Error('mission/dismiss needs { missionId }');
  const i = draft.missions.offered.findIndex((m) => m.id === id);
  if (i < 0) throw new Error(`Mission "${id}" is not on the board.`);
  const m = draft.missions.offered[i];
  if (m.source !== 'side' && m.source !== 'rumor') throw new Error('Command and story missions cannot be dismissed.');
  draft.missions.offered.splice(i, 1);
  return [{ type: 'mission_expired', missionId: id, reason: 'dismissed' }];
});

registerAction('rumor/follow', (draft, payload, ctx) => {
  const id = isObj(payload) ? payload.rumorId : undefined;
  if (typeof id !== 'string') throw new Error('rumor/follow needs { rumorId }');
  return followRumor(draft, ctx, id);
});

registerDayEndStep('mission_deadlines', runDeadlines);
registerMissionCompletedHook(onMissionCompleted);

// ---------------------------------------------------------------------------------------------
// Director: the model (or the fallback) answers a request the engine opened

registerAction('director/apply', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  const days = typeof p.beatCooldownDays === 'number' ? p.beatCooldownDays : undefined;
  return answerRequest(draft, ctx, typeof p.requestId === 'string' ? p.requestId : undefined, () => p.output, { cooldownDays: days });
});

registerAction('director/fallback', (draft, payload, ctx) => {
  const id = isObj(payload) && typeof payload.requestId === 'string' ? payload.requestId : undefined;
  return answerRequest(draft, ctx, id, () => fallbackOutput(draft, ctx.registries, ctx.rng), { fallback: true });
});

registerAction('director/request', (draft, payload) => {
  if (!isObj(payload) || payload.reason !== 'scout') throw new Error('Only a scout request can be opened by hand.');
  return openRequest(draft, 'scout');
});

/** An unanswered request is answered by the engine's own fallback first; then tonight's request opens. */
registerDayEndStep('director_tick', (draft, ctx) => {
  const events = [];
  const pending = draft.world.director?.pending;
  if (pending) {
    events.push(...answerRequest(draft, ctx, pending.id, () => fallbackOutput(draft, ctx.registries, ctx.rng), {
      cooldownDays: TUNING.director.beatCooldownDays, fallback: true,
    }));
  }
  events.push(...openRequest(draft, 'day_end'));
  return events;
});
