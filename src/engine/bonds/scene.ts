import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { intimacyOf } from '../relations/gain';
import type { CampaignState, SceneRecord } from '../state/types';

const TONE_RANK: Record<NonNullable<SceneRecord['tone']>, number> = { romantic: 1, intimate: 2 };

/**
 * A reading says the scene has turned `romantic` or `intimate`: the scene's tone goes up to it and never down (`intimate` is
 * above `romantic`). Ignored with romance off and in a group scene with more than one named unit, where there is no one
 * partner a tone could be about. Anything but the two words changes nothing. Draws no rng.
 */
export function raiseTone(draft: CampaignState, _reg: Registries, tone: unknown): EngineEvent[] {
  const scene = draft.scene;
  if (!scene || (tone !== 'romantic' && tone !== 'intimate')) return [];
  if (!intimacyOf(draft).romance) return [];
  const named = scene.participants.filter((id) => draft.squad.find((u) => u.id === id)?.kind === 'named').length;
  if (named > 1) return [];
  if (scene.tone !== undefined && TONE_RANK[scene.tone] >= TONE_RANK[tone]) return [];
  scene.tone = tone;
  return [{ type: 'scene_tone', tone }];
}
