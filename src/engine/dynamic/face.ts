/**
 * P15b: which face of her a scene shows (spec §6, planning ruling 2). Who is present and whether they know decides it, not the frame: alone, or while a practice, a physics
 * or a moment of hers runs, her manner toward the commander (`dynamic`); before people who all know and before whom her `audience` lets her, her manner toward the commander and her
 * everyday self toward them (`dynamic_to_commander`); otherwise her everyday self (`everyday`), keeping up the appearance (`mask`) when someone who does not know is present and
 * there is no romance or it is secret. Derived from the state, never stored; draws nothing. The face rule applies to every holder (it is the one thing of P15b that does not need a
 * `manner`).
 */
import type { Registries } from '../../content/types';
import { momentsOf } from '../moments/state';
import { selectFewOf } from '../practice/audience';
import type { CampaignState } from '../state/types';
import { practiceOf } from './profile';
import { levelOf } from './knowledge';

export const FACES = ['dynamic', 'dynamic_to_commander', 'everyday', 'mask'] as const;
export type Face = (typeof FACES)[number];

/** The faces in which her manner shows toward the commander (the others show her everyday self or nothing of the dynamic). */
export const showsDynamic = (face: Face): boolean => face === 'dynamic' || face === 'dynamic_to_commander';

/**
 * Whether something of hers runs in the open scene: a contact physics she holds, a moment that is hers, or a practice that is on (a hold she keeps, a slap or a call of hers in this
 * scene, a demonstration she staged here, a punishment she was told to carry out in this scene). The things that run show the dynamic to whoever is there (P15's signs already count that).
 */
export function herRunning(state: CampaignState, unitId: string): boolean {
  const scene = state.scene;
  if (scene === undefined) return false;
  if (scene.physics?.holderId === unitId) return true;
  if (momentsOf(scene).open?.unitId === unitId) return true;
  const p = state.practices;
  if (p === undefined) return false;
  if (p.held?.by === unitId) return true;
  if (p.slap?.holderId === unitId && p.slap.sceneId === scene.id) return true;
  if (p.call?.holderId === unitId && p.call.sceneId === scene.id) return true;
  if (p.demonstrations.some((d) => d.holderId === unitId && d.status === 'open' && d.sceneId === scene.id)) return true;
  return p.punishments.some((x) => x.holderId === unitId && x.status === 'accepted' && x.voicedScene === scene.id);
}

/**
 * The face of the scene for `unitId`; `present` is who is there besides her and the commander (her own id and `commander` are ignored, so the scene's participant list may be passed
 * as it is). An empty list is `dynamic`.
 */
export function faceNow(state: CampaignState, reg: Registries, unitId: string, present: readonly string[]): Face {
  const others = present.filter((id) => id !== unitId && id !== 'commander');
  if (others.length === 0 || herRunning(state, unitId)) return 'dynamic';
  const rel = state.relations[unitId];
  const publicLevel = rel?.publicity?.level;
  const knowers = others.filter((id) => publicLevel === 'public' || levelOf(state, id, unitId) === 'knows_dynamic');
  if (knowers.length < others.length) return publicLevel === 'known' ? 'everyday' : 'mask'; // someone does not know: a secret or no romance keeps up the appearance
  const audience = practiceOf(state, reg, unitId)?.audience;
  if (audience === 'show_off' || audience === 'indifferent') return 'dynamic_to_commander';
  if (audience === 'select_few') {
    const few = selectFewOf(state, reg, unitId);
    return others.every((id) => few.includes(id)) ? 'dynamic_to_commander' : 'everyday';
  }
  return 'everyday';
}
