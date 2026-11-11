import type { SocialStat } from '../social';
import type { WorldEffect } from '../world/types';

/** Where a dilemma can come from (P6). The content schema checks `dilemmaTemplates[].contexts` against this list. */
export const DILEMMA_CONTEXTS = ['expedition_event', 'base', 'mission_outcome', 'defect_arc', 'director'] as const;
export type DilemmaContext = (typeof DILEMMA_CONTEXTS)[number];

export type DilemmaScale = 'minor' | 'major' | 'defining';
export type Magnitude = 'small' | 'medium' | 'large';

/** One choice of a presented dilemma. Every number in `effects` came from the engine's magnitude table, never from a model. */
export interface DilemmaOption {
  label: string;
  /** Greyed out below this social rank. */
  requires?: { stat: SocialStat; rank: number };
  /** A seeded social check at choice time; on failure the option's non-cost effects are dropped. */
  check?: { stat: SocialStat; rank: number };
  effects: WorldEffect[];
  /** Magnitudes of the generated effects (empty for authored options). */
  magnitudes: Magnitude[];
}

/** The dilemma that is waiting for an answer (`dilemmas.open`). */
export interface DilemmaState {
  id: string;
  templateId: string;
  scale: DilemmaScale;
  context: DilemmaContext;
  day: number;
  status: 'requested' | 'presented';
  attempts: number;
  /** Named units present when it was opened (display names are looked up, never stored as ids in prompts). */
  units: string[];
  threadId?: string;
  beatId: string;
  title?: string;
  setup?: string;
  options?: DilemmaOption[];
  source?: 'model' | 'fallback';
}
