import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { runDeadlines } from '../world/missions';
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

registerDayEndStep('mission_deadlines', runDeadlines);
