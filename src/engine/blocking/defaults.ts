/**
 * P15a: the blocking a scene starts with (plan R6). Only while it is live, and only through the gates: in a quiet meeting the pastime's
 * `herActivity` and `commanderActivity` when they are blocking activities of the right actor; else her first activity whose
 * `fromActivities` has the activity that opened the scene; else nothing (she reads as attending, which is never rendered).
 */
import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { setQuietly } from './blocking';
import { blockingLive } from './gate';
import { COMMANDER } from './state';

export function startBlocking(draft: CampaignState, reg: Registries): void {
  const scene = draft.scene;
  if (!scene || !blockingLive(draft, reg)) return;
  const set = (person: string, value: unknown, actor: 'her' | 'commander'): boolean =>
    typeof value === 'string' && reg.blockingActivities.get(value)?.actor === actor && setQuietly(draft, reg, { person, field: 'activity', value });
  const pastime = scene.pastime ? reg.pastimes.get(scene.pastime.id) : undefined;
  if (pastime && scene.pastime) {
    set(scene.pastime.unitId, pastime.herActivity, 'her');
    set(COMMANDER, pastime.commanderActivity, 'commander');
    return;
  }
  const first = scene.participants[0];
  if (scene.activityId === undefined || first === undefined) return;
  for (const a of reg.blockingActivities.values()) {
    if (a.actor === 'her' && Array.isArray(a.fromActivities) && (a.fromActivities as string[]).includes(scene.activityId) && set(first, a.id, 'her')) return;
  }
}
