/**
 * What the model is asked and what the engine accepts back (P16, plan R5). `buildPracticeInput` rebuilds the request's input from the state (pure: no number of
 * hold, favour or Regard, no disabled category, none of her limits); `validatePracticeOutput` reads the model's card field by field, clamping or rejecting each (the
 * engine owns every number and never reads `text`). A rejection is `null`: the fallback line runs, never a half-issued practice. Draws nothing.
 */
import type { PracticeSeedEntry } from '../../content/schemas';
import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { wantBandOf, type WantBand } from '../bonds/want';
import { capabilitiesOf } from '../dynamic/capabilities';
import { practiceOf } from '../dynamic/profile';
import { dynamicOf } from '../dynamic/state';
import { hasCommanderPronoun } from '../dynamic/pronoun';
import { trackLevel, trackOpen } from '../dynamic/tracks';
import { impunityBand, impunityOf } from '../discipline/impunity';
import type { CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { eligibleUnits } from './gate';
import { punishmentEntryFor, severityOfEntry } from './offences';
import { seedPool, seedRows, stakesCeilingOf } from './seeds';
import { CHECK_KINDS, OFFENCE_WORDS, PROOFS, severityWord, STAKES, stakeRank, type CheckKind, type PracticeKind, type PracticeRequest, type Proof, type Stake, type ValidOutput } from './state';

/** What the model is told (R5). Every number is a word; the only digits are the day and the deadline range. Rebuilt from the state every time, never stored. */
export interface PracticeGenerateInput {
  /** The request this is for (the key of its generation). */
  requestId: string;
  kind: PracticeKind;
  holder: { id: string; name: string };
  /** Her card, cut to `CARD_MAX` by the controller (the engine has no card). */
  card: string;
  frame: 'play' | 'role' | 'rule';
  style: { primary: string; secondary?: string };
  /** What she has claimed, as words. */
  claims: string[];
  /** The tracks that are open for her with her level in each as a word. */
  tracks: Array<{ id: string; label: string; level: string }>;
  /** The categories that stand for her: switched on, not among her limits, and she practises them (`as`). */
  categories: Array<{ id: string; label: string; as: string }>;
  /** Some things are hers to refuse (never which). */
  hasLimits: boolean;
  recent: string[];
  context: { day: number; slot: Slot; openTasks: string[]; want: WantBand; impunity: string; present: Array<{ id: string; name: string }> };
  /** The units a card may name (ids for `checkArg` and `audienceIds`): living named soldiers other than her. */
  units: Array<{ id: string; name: string }>;
  frequency: string;
  /** Her active relation rules, for a `rule_kept_until` check. */
  rules: Array<{ id: string; text: string }>;
  seeds: Array<{ id: string; gist: string; stakes: Stake; check: CheckKind }>;
  /** A punishment's entry and what it answers, as words (R5): the engine picked both; the model words it. */
  punishment?: { label: string; weight: 'light' | 'heavy' | 'harsh'; offence: string };
  limits: { stakes: Stake; tierCap: string; deadlineDays: { min: number; max: number } };
}

/** The longest card the controller sends. */
export const CARD_MAX = 600;

const LEVEL_WORDS = ['none yet', 'a beginner', 'practised', 'experienced', 'deep', 'complete'] as const;
const TIER_WORDS = ['none', 'one', 'two', 'three', 'four', 'five'] as const;

/** What a capability means, in words the model may read (never a name of a mechanic). */
const CAPABILITY_WORDS: Readonly<Record<string, string>> = Object.freeze({
  booking_uncapped: 'books the commander freely', book_ahead: 'books the commander ahead', body_conditions: 'sets conditions on the commander\'s body',
  device_floor: 'holds the commander\'s device', leash_block: 'answers for the commander\'s Leash requests', household_protocol: 'keeps a household protocol',
  second_place: 'holds second place', relation_rules: 'sets rules between the commander and others', booking_consent: 'must be asked for the commander\'s evenings',
  countermand: 'countermands the commander\'s orders', co_leader: 'leads beside the commander',
});

const clean = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export { eligibleUnits };

/** Her active rules (a `rule_kept_until` check names one). */
function activeRules(state: CampaignState, holderId: string): Array<{ id: string; text: string }> {
  return (state.bonds?.rules ?? []).filter((r) => r.unitId === holderId && r.status === 'active').map((r) => ({ id: r.id, text: clean(r.text) }));
}

/**
 * The model's input for a request: her style and frame, what she claims, the open tracks and the categories that stand, whether anything is hers to refuse, her recent
 * forms, the day, her open tasks, her Want and Impunity as bands, who is present, the 3 to 6 seeds as examples and what the engine will clamp. `card` is her card digest
 * (the controller reads it; the engine has none). Pure; a category that is off or among her limits is not named anywhere.
 */
export function buildPracticeInput(state: CampaignState, reg: Registries, request: PracticeRequest, card = ''): PracticeGenerateInput {
  const holderId = request.holderId;
  const unit = state.squad.find((u) => u.id === holderId)!;
  const view = practiceOf(state, reg, holderId);
  const dyn = dynamicOf(state, holderId);
  const frame = dyn?.frame === 'rule' || dyn?.frame === 'role' ? dyn.frame : 'play';
  const label = (id: string): string => String(reg.contentCategories.get(id)?.label ?? id);
  const seeds = request.seedIds.map((id) => seedRows(reg).find((s) => s.id === id)).filter((s): s is PracticeSeedEntry => s !== undefined);
  const unitName = (id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
  const limits = unit.bond?.ownLimits.categories ?? [];
  return {
    requestId: request.id,
    kind: request.kind,
    holder: { id: holderId, name: unit.displayName },
    card: clean(card).slice(0, CARD_MAX),
    frame,
    style: view === null ? { primary: 'cold' } : { primary: view.style.primary, ...(view.style.secondary !== undefined ? { secondary: view.style.secondary } : {}) },
    claims: capabilitiesOf(state, reg, holderId).map((c) => CAPABILITY_WORDS[c] ?? c),
    tracks: [...reg.dynamicTracks.values()].filter((t) => trackOpen(state, reg, holderId, t.id)).map((t) => ({ id: t.id, label: String(t.label ?? t.id), level: LEVEL_WORDS[trackLevel(state, holderId, t.id)] })),
    categories: Object.entries(view?.categories ?? {}).filter(([, c]) => c.as !== 'none').map(([id, c]) => ({ id, label: label(id), as: c.as })),
    hasLimits: limits.length > 0,
    recent: (dyn?.recent ?? []).map(clean),
    context: {
      day: state.day, slot: state.slot,
      openTasks: (state.practices?.tasks ?? []).filter((t) => t.holderId === holderId && (t.status === 'offered' || t.status === 'open')).map((t) => (t.sealed === true && t.status === 'offered' ? 'a sealed task' : clean(t.summary))),
      want: wantBandOf(state, reg, holderId),
      impunity: impunityBand(impunityOf(state, reg, holderId)?.value ?? 0),
      present: (state.scene?.participants ?? []).filter((id) => id !== holderId).map((id) => ({ id, name: unitName(id) })),
    },
    units: eligibleUnits(state, holderId).map((id) => ({ id, name: unitName(id) })),
    frequency: state.dynamic?.setup.frequency ?? 'normal',
    rules: activeRules(state, holderId),
    seeds: seeds.map((s) => ({ id: s.id, gist: s.gist, stakes: s.stakes, check: s.check ?? 'model' })),
    ...(request.kind === 'punishment' ? punishmentBlock(state, reg, request) : {}),
    limits: { stakes: stakesCeilingOf(state, holderId), tierCap: TIER_WORDS[tierCapOf(state, reg, holderId)], deadlineDays: { ...TUNING.practice.deadlineDays } },
  };
}

/** The punishment part of the input: the entry that will be written (the engine's pick, picked again when it can no longer be carried out) and what it answers, as words. */
function punishmentBlock(state: CampaignState, reg: Registries, request: PracticeRequest): { punishment?: PracticeGenerateInput['punishment'] } {
  const entryId = punishmentEntryFor(state, reg, request);
  const entry = entryId === null ? undefined : reg.holderPunishments.get(entryId);
  return entry === undefined ? {} : { punishment: { label: String(entry.label), weight: severityWord(severityOfEntry(reg, entryId!) ?? request.severity ?? 1), offence: OFFENCE_WORDS[request.offence?.kind ?? 'refusal'] } };
}

/** The highest tier any open track of hers allows (her level plus one, at most five); the validator clamps each card to its own track's cap. */
export function tierCapOf(state: CampaignState, reg: Registries, holderId: string): number {
  const levels = [...reg.dynamicTracks.values()].filter((t) => trackOpen(state, reg, holderId, t.id)).map((t) => trackLevel(state, holderId, t.id) + 1);
  return Math.min(5, Math.max(1, ...levels));
}

/** Structural check only: the validator does the real work. Any other key is ignored. */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const LABEL = /^(?:her words|text|summary|answer|reply|narrator|assistant|system|ai|note)\s*:\s*/i;

/** Plain text: markup, markdown, control characters, a leading label and wrapping quotes go, then cut. */
export function plainText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/<[^>]*>/g, '').replace(/[*_`~#>]+/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim().replace(LABEL, '').slice(0, max).trim();
}

const SLOTS: readonly string[] = ['morning', 'afternoon', 'evening', 'night'];
const ROSTER_CHECKS: readonly string[] = ['on_roster', 'not_on_roster'];

/**
 * The model's card (`raw`) as the engine accepts it, or `null` (the fallback runs). The kind must be the request's; an unknown `seedId` is dropped; a tag that is not switched
 * on or is among her limits is dropped (an issue), none left is a rejection; the track must be open for her (else the seed's, else a rejection); the tier is clamped to her level in
 * it plus one; the stakes to the frame's ceiling; a check that is not a kind becomes `model`, and so does one whose argument does not stand; the deadline is clamped to the days
 * the tuning allows; the audience is filtered to who may be named (a demonstration left with none is a rejection); the text and the summary are plain, cut, and a pronoun for the
 * commander in either is a rejection; an empty summary is the seed's gist.
 */
export function validatePracticeOutput(state: CampaignState, reg: Registries, request: PracticeRequest, raw: unknown): { output: ValidOutput; issues: string[] } | null {
  if (!isObj(raw) || raw.kind !== request.kind) return null;
  const holderId = request.holderId;
  const issues: string[] = [];
  if (request.kind === 'punishment') return validatePunishmentCard(state, reg, request, raw);
  const pool = seedPool(state, reg, holderId, request.kind);
  const seed = typeof raw.seedId === 'string' ? pool.find((s) => s.id === raw.seedId) : undefined;
  if (raw.seedId !== undefined && seed === undefined) issues.push('seedId is not an offered seed and was dropped');

  const tags = (Array.isArray(raw.tags) ? raw.tags : []).filter((t): t is string => typeof t === 'string').filter((t, i, all) => all.indexOf(t) === i);
  const kept = tags.filter((t) => reg.contentCategories.has(t) && contentAllowed(state, reg, { contentTags: [t] }, holderId));
  if (kept.length < tags.length) issues.push(`tags ${tags.filter((t) => !kept.includes(t)).join(', ')} are not available and were dropped`);
  if (kept.length === 0) return null;

  const asked = typeof raw.track === 'string' ? raw.track : undefined;
  const track = asked !== undefined && trackOpen(state, reg, holderId, asked) ? asked : seed !== undefined && trackOpen(state, reg, holderId, seed.track) ? seed.track : undefined;
  if (track === undefined) return null;
  if (track !== asked) issues.push('track was not open and was replaced');
  const cap = trackLevel(state, holderId, track) + 1;
  const tierRaw = typeof raw.tier === 'number' && Number.isFinite(raw.tier) ? Math.round(raw.tier) : (seed?.tier ?? 1);
  // a chain goes up or holds: the next step is at least the last one's tier, and still at most her level plus one
  const floor = request.chainOf === undefined ? 1 : (state.practices?.tasks.filter((x) => x.chainId === request.chainOf).at(-1)?.tier ?? 1);
  const tier = Math.min(Math.min(5, cap), Math.max(1, floor, tierRaw)) as ValidOutput['tier'];
  if (tier !== raw.tier) issues.push('tier was clamped');

  const ceiling = stakesCeilingOf(state, holderId);
  const stakesRaw: Stake = (STAKES as readonly unknown[]).includes(raw.stakes) ? (raw.stakes as Stake) : (seed?.stakes ?? 'minor');
  const stakes = stakeRank(stakesRaw) > stakeRank(ceiling) ? ceiling : stakesRaw;
  if (stakes !== raw.stakes) issues.push('stakes were clamped');

  const units = eligibleUnits(state, holderId);
  const targetAsked = typeof raw.targetId === 'string' ? raw.targetId : raw.targetUnitId; // the model's key, or a card read again (`issuePractice`)
  const targetRaw = typeof targetAsked === 'string' && units.includes(targetAsked) ? targetAsked : undefined;
  let check: CheckKind = (CHECK_KINDS as readonly unknown[]).includes(raw.check) ? (raw.check as CheckKind) : 'model';
  let checkArg = typeof raw.checkArg === 'string' ? raw.checkArg : undefined;
  if (check === 'no_scene_with' && (checkArg === undefined || !units.includes(checkArg))) { check = 'model'; checkArg = undefined; }
  else if (check === 'rule_kept_until' && (checkArg === undefined || !activeRules(state, holderId).some((r) => r.id === checkArg))) { check = 'model'; checkArg = undefined; }
  else if (ROSTER_CHECKS.includes(check)) checkArg = checkArg !== undefined && units.includes(checkArg) ? checkArg : undefined; // the unit she watches (else the card's target)
  else if (check !== 'no_scene_with' && check !== 'rule_kept_until') checkArg = undefined;
  // a field task (judged when a run ends) takes only a roster check: a slot or a booking check with the flag becomes one, when there is a unit to judge
  const argAsked = typeof raw.checkArg === 'string' && units.includes(raw.checkArg) ? raw.checkArg : undefined;
  const fieldUnit = argAsked ?? targetRaw;
  if (raw.field === true && !ROSTER_CHECKS.includes(check) && check === raw.check && fieldUnit !== undefined) { check = 'on_roster'; checkArg = fieldUnit; issues.push('a field task takes a roster check'); }
  else if (check !== raw.check) issues.push('check was changed to model');

  const proof: Proof = (PROOFS as readonly unknown[]).includes(raw.proof) ? (raw.proof as Proof) : (seed?.proof ?? 'none');

  let deadline: ValidOutput['deadline'];
  if (isObj(raw.deadline) && typeof raw.deadline.days === 'number' && Number.isFinite(raw.deadline.days)) {
    const D = TUNING.practice.deadlineDays;
    const days = Math.min(D.max, Math.max(D.min, Math.round(raw.deadline.days)));
    if (days !== raw.deadline.days) issues.push('deadline was clamped');
    deadline = { days, ...(typeof raw.deadline.slot === 'string' && SLOTS.includes(raw.deadline.slot) ? { slot: raw.deadline.slot as Slot } : {}) };
  } else if (request.kind === 'task') {
    // every task has a deadline: the seed's days, else the default (the model's card may leave it out); the other kinds keep none (a demonstration is staged, a protocol has its days, a hold its span)
    deadline = { days: seed?.days ?? TUNING.practice.defaultDeadlineDays };
    issues.push('deadline was missing and is the seed\'s or the default');
  }

  const eligible = units;
  const asked2 = (Array.isArray(raw.audienceIds) ? raw.audienceIds : []).filter((id): id is string => typeof id === 'string').filter((id, i, all) => all.indexOf(id) === i);
  const audienceIds = asked2.filter((id) => eligible.includes(id));
  if (audienceIds.length < asked2.length) issues.push('audience was filtered');
  if (request.kind === 'demonstration' && audienceIds.length === 0) return null;

  const text = plainText(raw.text, TUNING.practice.textMax);
  let summary = plainText(raw.summary, TUNING.practice.summaryMax);
  if (text === '' || hasCommanderPronoun(text) || hasCommanderPronoun(summary)) return null;
  if (summary === '') { if (seed === undefined) return null; summary = seed.gist; issues.push('summary was empty and is the seed\'s gist'); }

  return {
    output: {
      kind: request.kind, ...(seed !== undefined ? { seedId: seed.id } : {}), tags: kept, track, tier, stakes, check, ...(checkArg !== undefined ? { checkArg } : {}),
      ...(deadline !== undefined ? { deadline } : {}), proof, ...(audienceIds.length > 0 ? { audienceIds } : {}), ...(targetRaw !== undefined ? { targetUnitId: targetRaw } : {}), text, summary,
    },
    issues,
  };
}

/**
 * The model's card for a punishment: only its words count. The entry and its weight were picked by the engine, so the tags, the track, the tier, the stakes and the check of the card
 * are not read (a card with none is fine); the text and the summary are plain, cut, and a pronoun for the commander in either rejects the card; an empty summary is the entry's label.
 */
function validatePunishmentCard(state: CampaignState, reg: Registries, request: PracticeRequest, raw: Record<string, unknown>): { output: ValidOutput; issues: string[] } | null {
  const text = plainText(raw.text, TUNING.practice.textMax);
  let summary = plainText(raw.summary, TUNING.practice.summaryMax);
  if (text === '' || hasCommanderPronoun(text) || hasCommanderPronoun(summary)) return null;
  const issues: string[] = [];
  if (summary === '') {
    const entryId = punishmentEntryFor(state, reg, request);
    const entry = entryId === null ? undefined : reg.holderPunishments.get(entryId);
    if (entry === undefined) return null;
    summary = String(entry.label);
    issues.push('summary was empty and is the entry\'s label');
  }
  return { output: { kind: 'punishment', tags: [], track: 'discipline', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text, summary }, issues };
}
