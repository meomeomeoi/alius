import type { Attachment, Harm, Initiator, Insight, LeadStyle, Outcome, Reading, Severity, ValueAxis, Wanted, AppraisalRole } from '../state/types';

/** Registry entry shapes of character development (P14b). Plain types that match the zod schemas in `content/schemas.ts`. */
export type { Reading };

export type AxisKind = 'value' | 'bond' | 'taste' | 'like' | 'dislike';

/** `developmentAxes`: the words of one drifting field. `id` is an axis key (`value:mercy`) or a wildcard (`like:*`). `up` and `down` read "more X than her file says". */
export interface DevelopmentAxisEntry {
  id: string;
  kind: AxisKind;
  up: string;
  down: string;
  description: string;
}

export type TargetWord = 'her' | 'commander' | 'unit' | 'squad';

/** `developmentRules`: what an appraised event adds to which accumulators. Read by `match` and `by`, never by id. */
export interface DevelopmentRuleEntry {
  id: string;
  match: { kind?: string[]; role?: AppraisalRole[]; target?: TargetWord[]; wanted?: Wanted[]; initiator?: Initiator[]; harm?: Harm[]; outcome?: Outcome[] };
  by?: { values?: Partial<Record<ValueAxis, '+' | '-'>>; caretaker?: boolean; leadStyle?: LeadStyle[]; attachment?: Attachment[]; insight?: Insight[] };
  push: Array<{ axis: string; amount: number }>;
  contentTags?: string[];
  description: string;
}

/** `habits`: a counter that reaches `threshold` forms the habit. */
export interface HabitEntry {
  id: string;
  counter: { kind: 'activity' | 'companion' | 'region'; id?: string };
  threshold: number;
  fallback: string;
  effect?: { type: 'unit_stress' | 'unit_xp'; amount: number; activityId: string };
  contentTags?: string[];
  description: string;
}

/** The reading an `eventDeltas`, `activities` or `dilemmaTemplates` row may carry for an event no model read. */
export type RegistryReading = Reading;
export type { Severity };
