import type { CampaignState, Fact } from '../../engine/state/types';
import { DYNAMIC_KNOWLEDGE_TAG } from '../../engine/dynamic/types';
import { registerKnowledgeRule, type KnowledgeRule } from '../knowledge';

/**
 * The dynamic's readings (P15). For now only the knowledge rule: the facts of the squad's knowledge (`suspects_close`, `suspects_dynamic`,
 * `knows_dynamic`) are written hidden from the commander, and turn visible once the observer and the commander have shared a scene or a DM after the
 * fact's day (she has shown it in the meantime). Everything else of the dynamic joins here through `Knowledge.dynamic` (Task 46).
 */

/** Has the observer been with the commander, in a scene or in a DM, on a day after this one? The scene on record, an ended scene's mark, the chronicle and the DMs are looked at. */
export function sharedAfter(state: CampaignState, observerId: string, day: number): boolean {
  const scene = state.scene;
  if (scene !== undefined && scene.day > day && scene.participants.includes(observerId)) return true;
  if ((state.memory.scenes ?? []).some((m) => (m.day ?? 0) > day && m.participants?.includes(observerId) === true)) return true;
  if (state.memory.chronicle.some((c) => c.kind === 'scene' && c.day > day && (c.audience === '*' || (Array.isArray(c.audience) && c.audience.includes(observerId))))) return true;
  return (state.dms[observerId] ?? []).some((m) => m.day > day);
}

/** A fact of the squad's knowledge shows only after she has been with the commander again; every other fact is none of this rule's business. */
export const dynamicKnowledgeRule: KnowledgeRule = {
  fact: (f: Fact, state) => !(f.hiddenFromCommander === true && f.tags.includes(DYNAMIC_KNOWLEDGE_TAG)) || sharedAfter(state, f.about[0], f.day),
};

/** Registers the knowledge rule and the readings (called from `registerCoreProviders`). */
export function registerDynamicProviders(): void {
  registerKnowledgeRule(dynamicKnowledgeRule);
}
