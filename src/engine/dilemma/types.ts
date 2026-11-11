/** Where a dilemma can come from (P6). The content schema checks `dilemmaTemplates[].contexts` against this list. */
export const DILEMMA_CONTEXTS = ['expedition_event', 'base', 'mission_outcome', 'defect_arc', 'director'] as const;
export type DilemmaContext = (typeof DILEMMA_CONTEXTS)[number];
