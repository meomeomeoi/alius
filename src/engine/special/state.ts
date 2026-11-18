import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

/**
 * The leaf of the special-trait module (P12): reading and writing `CampaignState.special` with nothing but types imported,
 * so `social`, `calendar`, `combat/effects` and `loyalty/*` can read it without a cycle. The fields are filled by the
 * tasks that own them (frequency, paranoia, debts); until then each block is empty.
 */

/** What an intercept can be about: a closed vocabulary, read from live state (P12 §1). */
export const CANDIDATE_KINDS = ['stance', 'impunity', 'demand', 'loyalty', 'fact', 'attraction', 'refusal', 'secret'] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

/**
 * One fragment the commander overheard. `true` says whether it was undistorted; it never leaves the engine (no event, toast,
 * reading or panel carries it). `value` is the engine's key (a stance, a band, an id, or `none`), `text` the worded fragment.
 */
export interface Intercepted {
  id: string;
  unitId: string;
  day: number;
  kind: CandidateKind;
  value: string;
  true: boolean;
  partial: boolean;
  refId?: string;
  sceneId?: string;
  text?: string;
}

/** Secret Frequency: what the commander overheard and who is suspicious. */
export interface FrequencyState {
  /** The newest `TUNING.special.frequency.logMax` intercepts. */
  intercepts: Intercepted[];
  /** Counter behind the intercept ids. */
  seq: number;
  /** Her suspicion 0–100 (engine only, hidden). */
  suspicion: Record<string, number>;
  /** The day of the last DM roll per unit (a DM rolls once a day). */
  dmDay: Record<string, number>;
  /** Set once the implant is burned out: no more intercepts. */
  burnedDay?: number;
  /** The hidden spreading fact written at the first discovery. */
  factId?: string;
  /** Units whose discovery has been announced (the knowledge rule shows `knows_frequency` only for these). */
  discovered?: string[];
  staticFired?: string[];
}

export const newFrequency = (): FrequencyState => ({ intercepts: [], seq: 0, suspicion: {}, dmDay: {} });

/** What a premonition can be about: the four warnings the commander gets early. */
export const PREMONITION_ABOUT = ['doubt', 'desertion', 'mutiny', 'defiance'] as const;
export type PremonitionAbout = (typeof PREMONITION_ABOUT)[number];

/**
 * A warning that reached the commander early. `real` says whether the engine could really see it coming; it never leaves the engine
 * (no event, toast, panel or reading carries it) and a false one looks exactly like a real one. `acted` closes it.
 */
export interface Premonition {
  id: string;
  unitId: string;
  about: PremonitionAbout;
  day: number;
  expiresDay: number;
  real: boolean;
  acted?: 'preempted' | 'false';
}

/** The days after acting on a real warning, during which the talk-down is easier. */
export interface Preempt { unitId: string; untilDay: number; about: PremonitionAbout }

/** Bloom-induced Paranoia: premonitions, preempt windows and the last nightmare. */
export interface ParanoiaState {
  premonitions: Premonition[];
  /** Counter behind the premonition ids. */
  seq: number;
  preempt?: Preempt[];
  lastNightmareDay?: number;
}

export const newParanoia = (): ParanoiaState => ({ premonitions: [], seq: 0 });

/** The kinds of intel the handler buys (one item per fact the engine can give). */
export const INTEL_KINDS = ['mission_done', 'base', 'spine', 'squad', 'plan'] as const;
export type IntelKind = (typeof INTEL_KINDS)[number];

/** One thing the commander may sell: a stable id `kind:refId` and its label. */
export interface IntelItem { id: string; kind: IntelKind; refId: string; label: string }

/** How the commander answers one item. */
export const INTEL_ANSWERS = ['truth', 'partial', 'false', 'withhold'] as const;
export type IntelAnswer = (typeof INTEL_ANSWERS)[number];

/** A consequence of sold intel that has not landed yet. `strength` is 1 for a truth and 0.5 for a partial one. */
export interface Scheduled { id: string; itemId: string; kind: IntelKind; dueDay: number; strength: 1 | 0.5; refId: string; /** The item was a lie: it lands no consequence, only a draw whether the handler found out. */ falsified?: true }

/** A region the rival knows the squad will go to: a run there is ambushed until `untilDay`. */
export interface Exposure { regionId: string; untilDay: number; strength: 1 | 0.5 }

/** Web of Debts: the handler, the intel exchange and the two suspicion clocks (all hidden from the player). */
export interface DebtsState {
  corporationId: string;
  handlerId: string;
  lastVisitDay?: number;
  /** Counter behind the visit ids `hv<n>`. */
  visitSeq: number;
  /** The visit that waits for an answer (its items are fixed when it is rolled). */
  visit?: { id: string; day: number; items: IntelItem[] };
  /** Ids of the items already answered (not offered again). */
  answered: string[];
  handlerSuspicion: number;
  handlerPressure: number;
  oversightSuspicion: number;
  scheduled: Scheduled[];
  exposures: Exposure[];
  ended?: 'leaked' | 'confessed' | 'fled';
  /** The unit who found out first (a `debts_unit` case). */
  discoveredBy?: string;
  /** Cases waiting for another dilemma to close (oversight, or a unit). */
  caseQueue?: Array<{ kind: 'oversight' } | { kind: 'unit'; unitId: string }>;
}

/** The night entry of the handler's visit: it has its own panel, like a confrontation, and belongs to no unit. */
export const HANDLER_VISIT_KIND = 'handler_visit';
export const HANDLER_UNIT = '@handler';
/** Night kinds answered from their own panel (`night/open`, `night/ignore` and the door refuse them). The loyalty kinds are `CONFRONTATION_KINDS` (a test pins that they are all here). */
export const OWN_PANEL_KINDS: readonly string[] = ['desertion', 'mutiny', 'deserter_return', HANDLER_VISIT_KIND];
export const isOwnPanelNight = (entry: { kind: string }): boolean => OWN_PANEL_KINDS.includes(entry.kind);

/** The special state, created by `seedSpecialTraits` (a save without it reads as nothing intercepted, foreseen or owed). */
export interface SpecialState {
  frequency?: FrequencyState;
  paranoia?: ParanoiaState;
  debts?: DebtsState;
}

/** The special state, created empty on first write. */
export function specialOf(draft: CampaignState): SpecialState {
  return (draft.special ??= {});
}

/**
 * A unit leaves the service (deserted, terminated, dead): everything the special state holds about her goes, so nothing is
 * suspected, foreseen, owed or scheduled for her later. Each system adds its own part as it is built.
 */
export function forgetSpecial(draft: CampaignState, unitId: string): void {
  const debts = draft.special?.debts;
  if (debts) {
    debts.scheduled = debts.scheduled.filter((x) => !(x.kind === 'squad' && x.refId === unitId));
    if (debts.discoveredBy === unitId) delete debts.discoveredBy;
    if (debts.caseQueue) debts.caseQueue = debts.caseQueue.filter((c) => !(c.kind === 'unit' && c.unitId === unitId));
  }
  const par = draft.special?.paranoia;
  if (par) {
    par.premonitions = par.premonitions.filter((x) => x.unitId !== unitId);
    if (par.preempt) par.preempt = par.preempt.filter((x) => x.unitId !== unitId);
  }
  const f = draft.special?.frequency;
  if (f) {
    f.intercepts = f.intercepts.filter((x) => x.unitId !== unitId);
    delete f.suspicion[unitId];
    delete f.dmDay[unitId];
    if (f.staticFired) f.staticFired = f.staticFired.filter((id) => id !== unitId);
    if (f.discovered) f.discovered = f.discovered.filter((id) => id !== unitId);
  }
}

/** Does the unit hold anything in the special state (so the day step knows a dead unit still has something to drop)? */
export function holdsSpecial(state: Pick<CampaignState, 'special'>, unitId: string): boolean {
  const par = state.special?.paranoia;
  if (par && (par.premonitions.some((x) => x.unitId === unitId) || par.preempt?.some((x) => x.unitId === unitId) === true)) return true;
  const f = state.special?.frequency;
  return f !== undefined && (f.intercepts.some((x) => x.unitId === unitId) || f.suspicion[unitId] !== undefined || f.dmDay[unitId] !== undefined
    || f.staticFired?.includes(unitId) === true || f.discovered?.includes(unitId) === true);
}

/**
 * The talk-down chance added while a real doubt or desertion warning was acted on (0 or 0.15). Reads the state alone: the loyalty
 * code has no registry to hand.
 */
export function preemptBonus(state: Pick<CampaignState, 'special' | 'day'>, unitId: string): number {
  const hit = state.special?.paranoia?.preempt?.some((x) => x.unitId === unitId && x.untilDay >= state.day && (x.about === 'doubt' || x.about === 'desertion'));
  return hit ? TUNING.special.paranoia.preemptBonus : 0;
}
