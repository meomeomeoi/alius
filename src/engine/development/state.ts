import type { CampaignState, Development, DevelopmentMode, Unit } from '../state/types';

/**
 * The leaf of character development (P14b): the state shape, its readers and the mode, with nothing but types imported, so the
 * profile readers (`bondOf`, `effectiveValues`) can use it without a cycle. Mirrored state: it never reads a registry.
 */
export type { Appraisal, AppraisalRole, DevFact, DevMoment, Development, DevelopmentMode, Harm, Initiator, Insight, Outcome, Reading, ReviewInverse, Wanted } from '../state/types';

export const DEVELOPMENT_MODES: readonly DevelopmentMode[] = ['off', 'slow', 'normal'];

/** The setting `characterDevelopment`: absent or invalid = off (an old save, or a test campaign, records nothing). */
export function developmentMode(state: Pick<CampaignState, 'settings'>): DevelopmentMode {
  const m = state.settings.characterDevelopment;
  return m === 'slow' || m === 'normal' ? m : 'off';
}

const EMPTY: Readonly<Development> = Object.freeze({
  drift: Object.freeze({}), acc: Object.freeze({}), anchors: Object.freeze([]) as unknown as string[], counters: Object.freeze({}),
  pending: Object.freeze([]) as unknown as never[], facts: Object.freeze([]) as unknown as never[], moments: Object.freeze([]) as unknown as never[],
  habits: Object.freeze([]) as unknown as string[], nextId: 0,
});

/** What she has become so far; the empty default (never written back) when nothing has happened yet. */
export function developmentOf(unit: Pick<Unit, 'development'>): Readonly<Development> {
  return unit.development ?? EMPTY;
}

/** Writes the empty block on first use and returns the stored one. */
export function ensureDevelopment(unit: Pick<Unit, 'development'>): Development {
  return (unit.development ??= { drift: {}, acc: {}, anchors: [], counters: {}, pending: [], facts: [], moments: [], habits: [], nextId: 0 });
}

/** The next id of her development records: `ap<n>`, `df<n>`, `dm<n>` (one counter per unit). */
export function nextDevId(dev: Development, prefix: 'ap' | 'df' | 'dm'): string {
  const n = dev.nextId;
  dev.nextId = n + 1;
  return `${prefix}${n}`;
}
