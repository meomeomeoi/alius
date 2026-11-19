import type { CampaignState } from '../state/types';

/**
 * The leaf of LEASHSWAP (P13): the mode block, its types and the readers every other module uses. It imports only types and
 * `tuning`, so `activities`, `dilemma/flow`, `combat/*`, `power/*` and `leash/use` can read it without a cycle. Absent
 * `CampaignState.leashswap` is the default mode: no warden, no override, no co-sign, and a commander who cannot die.
 */

/** What happens when the commander dies. Chosen at setup, never changed. */
export type DeathRule = 'rewind_day' | 'campaign_end';
export const DEATH_RULES: readonly DeathRule[] = ['rewind_day', 'campaign_end'];

/** The closed vocabulary of what a warden expects. Read by kind, never by registry id. */
export const EXPECTATION_KINDS = ['protect_squad', 'no_civilian_harm', 'meet_quota', 'obey_oversight', 'keep_me_close', 'no_romance_with_others', 'personal'] as const;
export type ExpectationKind = (typeof EXPECTATION_KINDS)[number];

/** One thing she expects. An unknown one (`known: false`) never reaches an event, a toast, a panel or a reading. */
export interface Expectation {
  id: string;
  kind: ExpectationKind;
  /** 0–1; the weights of an agenda sum to 1 (to 0.01). */
  weight: number;
  source: 'card' | 'values' | 'corporate';
  known: boolean;
  /** `personal` only. */
  text?: string;
}

/** What the commander tried to do that she may override (P13 §3). */
export type WardenOrder =
  | { kind: 'activity'; activityId: string; companionId?: string; unitIds?: string[] }
  | { kind: 'roster'; activeIds: string[] }
  | { kind: 'expedition'; missionId?: string; unitIds: string[] }
  | { kind: 'dilemma'; index: number }
  | { kind: 'combat_order'; orderId: string; targetCid?: string };

/** An override that waits for COMPLY / ARGUE / DEFY. A stale one (another day or slot) is dropped. */
export interface OpenOverride {
  id: string;
  order: WardenOrder;
  expectationId: string;
  /** What she wants instead; `null` = hold (nothing happens, no slot is spent). */
  alternative: WardenOrder | null;
  altLabel: string;
  /** The payload of the action that was overridden (without its `wardenChecked` flag), so COMPLY and DEFY can run it. */
  payload?: Record<string, unknown>;
  day: number;
  slot: string;
  context: 'base' | 'combat' | 'dilemma';
  /** The scene id of an ARGUE in progress. */
  arguing?: string;
  /** An ARGUE scene ended without a compromise: only COMPLY and DEFY remain. */
  argued?: true;
}

/** A restriction on the commander (`no_leave`: no activity with a companion; `no_dms`: no messages). */
export interface CommanderRestriction { what: 'no_leave' | 'no_dms'; untilDay: number }

/** One punishment of the commander, newest 20 kept. */
export interface PunishRecord { punishmentId: string; day: number; severity: number }

/** Her state while she holds the leash. */
export interface WardenState {
  unitId: string;
  assignedBy: 'player' | 'corporation' | 'oversight';
  sinceDay: number;
  expectations: Expectation[];
  /** `fallback` until the model's agenda replaces it, once. */
  agenda: 'pending' | 'model' | 'fallback';
  /** 0–100, start 60: her verdict on the commander's compliance. */
  satisfaction: number;
  /** 0–100, start 0: accumulated open disobedience. */
  defiance: number;
  warnings: Array<{ level: 1 | 2; day: number }>;
  leashLeft: number;
  leashRefreshDay: number;
  /** An override has fired at least once: the agenda is in play and the model may no longer replace it. */
  overrideFired?: true;
  override?: OpenOverride;
  /** The Leash on the commander: only COMPLY is accepted at the next override. */
  compelled?: boolean;
  restrictions: CommanderRestriction[];
  punishLog: PunishRecord[];
}

/** The hidden clock and the intrigue bookkeeping (hidden from every event, toast and reading). */
export interface IntrigueState {
  suspicion: number;
  /** Counter behind kompromat lines. */
  seq: number;
  /** The last day each unit was asked to be an ally. */
  lastAllyDay: Record<string, number>;
  hack: { step: number };
  discovered: number;
}

export const REMOVAL_ROUTES = ['hack', 'report', 'death'] as const;
export interface RemovalState { route: (typeof REMOVAL_ROUTES)[number]; day: number; clockId: string }

/** The mode block. */
export interface LeashswapState {
  deathRule: DeathRule;
  /** Absent while there is none: during the investigation, or after a cleared verdict. */
  warden?: WardenState;
  intrigue: IntrigueState;
  removal?: RemovalState;
  remote?: { sinceDay: number };
  status: 'held' | 'investigation' | 'free';
  /** The reveal card (Veteran mode) was shown. */
  revealed?: true;
}

/** The ended campaign (any mode; only P13 writes it now). */
export interface EndedState { day: number; cause: 'terminated' | 'executed'; epilogue?: string }

export const newIntrigue = (): IntrigueState => ({ suspicion: 0, seq: 0, lastAllyDay: {}, hack: { step: 0 }, discovered: 0 });

export const newLeashswap = (deathRule: DeathRule): LeashswapState => ({ deathRule, status: 'held', intrigue: newIntrigue() });

export const leashswapOf = (state: Pick<CampaignState, 'leashswap'>): LeashswapState | null => state.leashswap ?? null;

/** Is the campaign in the LEASHSWAP mode? (The mode is read by state, never by a world option or trait id.) */
export const isLeashswap = (state: Pick<CampaignState, 'leashswap'>): boolean => state.leashswap !== undefined;

/** She, while she holds the leash: null unless the status is `held` and a warden exists. */
export function wardenOf(state: Pick<CampaignState, 'leashswap'>): WardenState | null {
  const ls = state.leashswap;
  return ls !== undefined && ls.status === 'held' && ls.warden !== undefined ? ls.warden : null;
}

export const wardenUnitId = (state: Pick<CampaignState, 'leashswap'>): string | null => wardenOf(state)?.unitId ?? null;

/** The default death rule for a combat difficulty: `story` and `normal` rewind the day, `hard` ends the campaign. */
export const defaultDeathRule = (difficulty: string): DeathRule => (difficulty === 'hard' ? 'campaign_end' : 'rewind_day');

/**
 * A unit leaves the service: an open override that names her goes, and so does her ally mark. The removal itself (the
 * investigation) is `wardenGone`'s business, not this leaf's.
 */
export function forgetWarden(draft: CampaignState, unitId: string): void {
  const ls = draft.leashswap;
  if (!ls) return;
  delete ls.intrigue.lastAllyDay[unitId];
  const w = ls.warden;
  if (w && w.unitId === unitId) delete w.override;
}
