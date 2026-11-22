/**
 * Her offences and the punishment she picks (P16, plan R8). `noteOffence` is the one place a broken task, a refusal at `role`, a slip, a caught cheat or a false report is entered
 * against the commander: it keeps the day for the repeat count and asks for a punishment (a request of kind `punishment`) whose weight (`severityOf`) and entry
 * (`pickHolderPunishment`) are the engine's alone; the model only words it. `offencesFromEvents` is the after-action that reads the events of the lower layers (P15's refusals, a
 * refused milestone, an overruled countermand, P15a's slips, a broken rule of hers). Nothing here draws: the entries take turns by her punishment count.
 */
import type { Entry, Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { frameRank } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { practiceOf } from '../dynamic/profile';
import { dynamicOf } from '../dynamic/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { eligibleUnits, ensurePractices, practiceLive } from './gate';
import { withdrawPractices } from './forget';
import { requestPractice } from './request';
import { EFFECT_NEEDS, stakeRank, type Offence, type OffenceKind, type PracticeRequest, type PunishmentEffectType, type Stake } from './state';

type Severity5 = 1 | 2 | 3 | 4 | 5;

interface EffectRow { type: PunishmentEffectType }
const entriesOf = (reg: Registries): Entry[] => [...reg.holderPunishments.values()];
const effectsOf = (entry: Entry): EffectRow[] => (Array.isArray(entry.effects) ? (entry.effects as EffectRow[]) : []);

/** Her style as the severity reads it, as a float: the primary's term in full, the secondary's sign times `secondaryStyle` (rounded once, with the rest, by `severityOf`). */
function styleTerm(state: CampaignState, reg: Registries, holderId: string): number {
  const T = TUNING.practice.severity;
  const style = practiceOf(state, reg, holderId)?.style;
  if (style === undefined) return 0;
  const primary = T.style[style.primary] ?? 0;
  const secondary = style.secondary === undefined ? 0 : Math.sign(T.style[style.secondary] ?? 0) * T.secondaryStyle;
  return primary + secondary;
}

/**
 * The weight of a punishment for an offence (1 to 5): the stakes' rank plus one (trivial 1 to severe 4; a confessed offence one less), her style (`cruel` +1, `affectionate` -1; a secondary adds `secondaryStyle` with its sign), her frame (`play` -1, `role` 0, `rule` +1) and a repeat (+1 when she has entered `repeat.count` offences within `repeat.days`), summed as a float, rounded once (half up) and clamped to 1 to 5. Reads only: the offences
 * counted are the ones noted before this one.
 */
export function severityOf(state: CampaignState, reg: Registries, holderId: string, offence: Pick<Offence, 'stakes' | 'confessed'>): Severity5 {
  const T = TUNING.practice.severity;
  const frame = dynamicOf(state, holderId)?.frame;
  const frameTerm = frame === 'rule' || frame === 'role' || frame === 'play' ? T.frame[frame] : 0;
  const recent = (state.practices?.offences[holderId] ?? []).filter((d) => state.day - d <= T.repeat.days).length;
  const repeat = recent >= T.repeat.count ? T.repeat.add : 0;
  const confessed = offence.confessed === true ? TUNING.practice.confessedLess : 0; // telling it herself weighs less (R10)
  const total = Math.floor(stakeRank(offence.stakes) + 1 + styleTerm(state, reg, holderId) + frameTerm + repeat - confessed + 0.5); // one rounding, half up
  return Math.min(T.max, Math.max(T.min, total)) as Severity5;
}

/** Is she holding the commander alone in a scene, or is there no scene at all (a scene with another cannot be interrupted by a hold)? */
const sceneIsHers = (state: CampaignState, holderId: string): boolean =>
  state.scene === undefined || (state.scene.participants.length === 1 && state.scene.participants[0] === holderId);

/** Units a confession may name: living named soldiers who are at base (not on a run). */
export const atBase = (state: CampaignState, holderId: string): string[] => eligibleUnits(state, holderId).filter((id) => !(state.expedition?.party ?? []).includes(id));

/** Her public gate (R8): `public_humiliation` is on (the entry's own tags check that) and her audience is not `private_only`. */
const publicAllowed = (state: CampaignState, reg: Registries, holderId: string): boolean => practiceOf(state, reg, holderId)?.audience !== 'private_only';

/** Can this entry be carried out now (read by its effects, never its id)? */
export function possibleNow(state: CampaignState, reg: Registries, holderId: string, entry: Entry): boolean {
  if (!contentAllowed(state, reg, entry, holderId)) return false;
  if (entry.public === true && !publicAllowed(state, reg, holderId)) return false;
  const on = state.content?.enabled ?? [];
  for (const fx of effectsOf(entry)) {
    const needs = EFFECT_NEEDS[fx.type];
    if (needs.length > 0 && !needs.some((t) => on.includes(t))) return false; // `physical`, `slap`, `mark` and the rest need what the player switched on
    if (fx.type === 'slot_held' && (state.expedition !== undefined || state.combat !== undefined || !sceneIsHers(state, holderId))) return false;
    if (fx.type === 'confession' && atBase(state, holderId).length === 0) return false;
  }
  return true;
}

/**
 * The entry of `holderPunishments` for a weight: of that severity the ones that pass her limits and what is switched on and can be done now (a held slot not inside a run, a fight or a
 * scene with another; a confession with another soldier at base; a public entry only when her audience allows it), taking turns by how many punishments she has given (no draw). None
 * at that weight: the next lower one; none at all: `null` (the offence still costs its hold through its own event).
 */
export function pickHolderPunishment(state: CampaignState, reg: Registries, holderId: string, severity: number): string | null {
  const given = (state.practices?.punishments ?? []).filter((p) => p.holderId === holderId).length;
  for (let sev = Math.min(5, Math.floor(severity)); sev >= 1; sev--) {
    const eligible = entriesOf(reg).filter((e) => e.severity === sev && possibleNow(state, reg, holderId, e));
    if (eligible.length > 0) return String(eligible[given % eligible.length].id);
  }
  return null;
}

/**
 * The entry a punishment request will be written as: the one picked when the offence was noted, as long as it can still be carried out now, else another for the same weight
 * (`pickHolderPunishment`), else `null` (nothing stands: no practice). The one rule both the words (`buildPracticeInput`, the fallback) and the writer read. Reads only.
 */
export function punishmentEntryFor(state: CampaignState, reg: Registries, request: Pick<PracticeRequest, 'holderId' | 'entryId' | 'severity'>): string | null {
  const entry = request.entryId === undefined ? undefined : reg.holderPunishments.get(request.entryId);
  if (entry !== undefined && possibleNow(state, reg, request.holderId, entry)) return request.entryId!;
  return pickHolderPunishment(state, reg, request.holderId, request.severity ?? 1);
}

/**
 * A content category went off (the withdrawal hook): every request for a punishment whose entry can no longer be carried out gets another entry for the same offence, or goes when
 * none stands. No delta, no event, no draw.
 */
export function repickPunishmentRequests(draft: CampaignState, reg: Registries): void {
  const p = draft.practices;
  if (p === undefined) return;
  p.requests = p.requests.flatMap((r) => {
    if (r.kind !== 'punishment') return [r];
    const entryId = punishmentEntryFor(draft, reg, r);
    if (entryId === null) return [];
    if (entryId === r.entryId) return [r];
    return [{ ...r, entryId, severity: severityOfEntry(reg, entryId) ?? r.severity }];
  });
}

/**
 * What a content category switched off does to the practices, whole: every open practice tagged with it is withdrawn (`withdrawPractices`, a leaf that cannot ask the content gate) and her
 * punishment request that was asked for with an entry that went gets another or none (`repickPunishmentRequests`). The one exported path: the bare `withdrawPractices` is not (it would lose the re-pick).
 */
export function withdrawAndRepick(draft: CampaignState, reg: Registries, changed: string[]): EngineEvent[] {
  const events = withdrawPractices(draft, reg, changed);
  repickPunishmentRequests(draft, reg);
  return events;
}

/** The weight a picked entry has (the entry's own: the pick may have come from below the asked one). */
export function severityOfEntry(reg: Registries, entryId: string): Severity5 | undefined {
  const sev = reg.holderPunishments.get(entryId)?.severity;
  return typeof sev === 'number' && sev >= 1 && sev <= 5 ? (sev as Severity5) : undefined;
}

/** Is a punishment of hers already waiting for the commander's answer (or being worded)? One at a time: a burst of offences makes one punishment. */
function punishmentOpen(state: CampaignState, holderId: string): boolean {
  const p = state.practices;
  return p?.requests.some((r) => r.holderId === holderId && r.kind === 'punishment') === true
    || p?.punishments.some((x) => x.holderId === holderId && x.forUnitId === undefined && (x.status === 'offered' || x.status === 'negotiating')) === true;
}

/**
 * Enters an offence against the commander for this holder: once per holder, kind, ref and day, and only while she is live. The day joins her repeat list; a punishment is asked for
 * (a request of kind `punishment` carrying the offence, its weight and its entry) unless one of hers is already open or nothing can be picked. Draws nothing. Returns the events it caused.
 */
export function noteOffence(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, offence: Offence): EngineEvent[] {
  const reg = ctx.registries;
  if (!practiceLive(draft, reg, holderId)) return [];
  const p = ensurePractices(draft);
  if (p.noted === undefined || p.noted.day !== draft.day) p.noted = { day: draft.day, keys: [] };
  const key = `${holderId}|${offence.kind}|${offence.ref ?? ''}`;
  if (p.noted.keys.includes(key)) return [];
  p.noted.keys.push(key);
  const severity = severityOf(draft, reg, holderId, offence);
  const days = (p.offences[holderId] ??= []);
  days.push(offence.day);
  p.offences[holderId] = days.filter((d) => draft.day - d <= TUNING.practice.punish.keepDays);
  if (punishmentOpen(draft, holderId)) return [];
  const entryId = pickHolderPunishment(draft, reg, holderId, severity);
  if (entryId === null) return [];
  return requestPractice(draft, ctx, holderId, 'punishment', { offence, severity: severityOfEntry(reg, entryId) ?? severity, entryId });
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** At `role` or beyond a refusal is hers to answer (at `play` she lets it go). */
const answers = (state: CampaignState, holderId: string): boolean => {
  const frame = dynamicOf(state, holderId)?.frame;
  return frame !== undefined && frameRank(frame) >= frameRank('role');
};

/**
 * After every action: what the lower layers said that she answers. P15's `refusal_noted` (a claim or a demand; a refused task enters its own offence, a refused milestone and a
 * defied override have their own events), `milestone_refused`, an override of hers answered DEFY (`countermand_overruled`), P15a's `physics_slip` and `physics_caught` in a run with
 * her (minor, once per run), and a rule of hers broken (`rule_broken`). The slip of a habit (`protocol_slip`) is entered by its intent handler. Nothing while she is not live.
 */
export function offencesFromEvents(draft: CampaignState, ctx: EngineCtx, events: readonly EngineEvent[]): EngineEvent[] {
  if (!events.some((e) => OFFENCE_SOURCES.includes(e.type))) return [];
  const out: EngineEvent[] = [];
  // a refused task or punishment enters its own offence (or none): the `refusal_noted` beside it is the same refusal
  const refusedTask = (unitId: string): boolean => events.some((x) => (x.type === 'task_answered' || x.type === 'punishment_answered') && x.answer === 'refuse' && x.holderId === unitId);
  const note = (holderId: string | undefined, kind: OffenceKind, ref: string | undefined, stakes: Stake): void => {
    if (holderId === undefined) return;
    out.push(...noteOffence(draft, ctx, holderId, { kind, ...(ref !== undefined ? { ref } : {}), stakes, day: draft.day }));
  };
  for (const e of events) {
    const unitId = str(e.unitId) ?? str(e.holderId);
    switch (e.type) {
      case 'refusal_noted':
        if ((e.what === 'claim' || e.what === 'demand') && unitId !== undefined && answers(draft, unitId) && !refusedTask(unitId)) note(unitId, 'refusal', `refusal:${String(e.what)}`, 'minor');
        break;
      case 'milestone_refused':
        if (unitId !== undefined && answers(draft, unitId)) note(unitId, 'milestone_refused', str(e.milestoneId), 'minor');
        break;
      case 'override_answered':
        if (e.source === 'holder' && e.answer === 'defy') note(unitId, 'countermand_overruled', str(e.overrideId), 'minor');
        break;
      case 'physics_slip':
      case 'physics_caught':
        note(str(e.holderId), e.type, str(e.runId), 'minor');
        break;
      case 'rule_broken':
        note(unitId, 'rule_broken', str(e.ruleId), 'minor');
        break;
      default:
        break;
    }
  }
  return out;
}

const OFFENCE_SOURCES: readonly string[] = ['refusal_noted', 'milestone_refused', 'override_answered', 'physics_slip', 'physics_caught', 'rule_broken'];
