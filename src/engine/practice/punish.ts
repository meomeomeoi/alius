/**
 * Answering her discipline (P16, plan R8): the three answers to a punishment (ACCEPT carries its effects out, NEGOTIATE opens a talk that a compromise settles at one step less, REFUSE
 * is a defiance she may answer once with a heavier one), and what each effect does. The engine owns every number: the entry, the weight and the effects are the registry's, the
 * model only worded it. A punishment is public only when `public_humiliation` is on and her audience is not `private_only` (R8), and then it is a demonstration for up to two others.
 * Nothing here draws: the injury roll is `practiceRoll`.
 */
import type { Entry, Registries } from '../../content/types';
import { addRecord } from '../discipline/record';
import { injureCommander } from '../calendar';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { practiceOf } from '../dynamic/profile';
import { addSign } from '../dynamic/knowledge';
import { refusalCost } from '../dynamic/milestones';
import { dynamicOf } from '../dynamic/state';
import { addTrackXp } from '../dynamic/tracks';
import { hasCommanderPronoun } from '../dynamic/pronoun';
import { raiseWant } from '../bonds/want';
import { hitHer } from '../personal/events';
import { personalOf } from '../personal/state';
import type { EventIntent } from '../relations/intents';
import type { CampaignState, Severity } from '../state/types';
import { addCommanderStress } from '../special/commanderStress';
import { TUNING } from '../tuning';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { startHold } from './hold';
import { atBase, pickHolderPunishment, severityOfEntry } from './offences';
import { practiceSample } from './sample';
import { requestPractice } from './request';
import { startSlap } from './slap';
import { fallbackLine } from './seeds';
import { practiceRoll, type OpenPunishment, type PunishmentEffectType, type Task } from './state';
import { acceptFormOf } from './tasks';
import { eligibleUnits, plainText } from './validate';

type Effect = { type: PunishmentEffectType; [k: string]: unknown };

/** The severity word a punishment lands at on the relation (R8): 1 to 2 minor, 3 moderate, 4 major, 5 extreme. */
const SEVERITY: readonly Severity[] = ['minor', 'minor', 'moderate', 'major', 'extreme'];
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const entryOf = (reg: Registries, p: Pick<OpenPunishment, 'entryId'>): Entry | undefined => reg.holderPunishments.get(p.entryId);
const effectsOf = (entry: Entry | undefined): Effect[] => (Array.isArray(entry?.effects) ? (entry!.effects as Effect[]) : []);

/** The punishment of hers that waits for the commander's answer (`offered`, or `negotiating` after a talk); throws for one that is gone, answered, for a soldier or hers while she is not holding. */
export function pendingPunishment(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, punishmentId: string): OpenPunishment {
  const p = draft.practices?.punishments.find((x) => x.id === punishmentId);
  if (p === undefined || p.forUnitId !== undefined) throw new Error('That punishment is gone.');
  if (!practiceLive(draft, ctx.registries, p.holderId)) throw new Error('She is not holding now.');
  if (p.status !== 'offered' && p.status !== 'negotiating') throw new Error('That punishment has been answered.');
  return p;
}

/**
 * Who sees a public punishment carried out (R8): none unless the entry is public, `public_humiliation` is on and her audience is not `private_only`; then up to two others, the ones in
 * the open scene first, then whoever else is at base, in squad order. (The audience pick of the demonstrations, R9, replaces this when they are built.)
 */
function publicAudience(draft: CampaignState, reg: Registries, p: OpenPunishment): string[] {
  if (p.public !== true || !(draft.content?.enabled ?? []).includes('public_humiliation')) return [];
  if (practiceOf(draft, reg, p.holderId)?.audience === 'private_only') return [];
  const units = eligibleUnits(draft, p.holderId);
  const inScene = (draft.scene?.participants ?? []).filter((id) => units.includes(id));
  return [...new Set([...inScene, ...atBase(draft, p.holderId)])].slice(0, TUNING.practice.punish.publicAudienceMax);
}

/** The strongest endurance level the commander has in any contact physics (her trained route, R8). */
const trainedLevel = (draft: CampaignState): number => Math.max(0, ...Object.values(draft.commander.endurance ?? {}).map((e) => e?.level ?? 0));

/**
 * Carries one effect of an accepted punishment out (read by `type`, never by the entry's id): a held slot (the hold, Task 25), a revoked privilege (a restriction the readers of Task 14
 * enforce), an extra protocol (a request), a cold shoulder, a confession (a task that names the first soldier at base), a mark (only when none is set), stress, an injury roll
 * (`practiceRoll < chance - perEndurance x endurance - perTrained x trained`), the narrated hand (a directive) and the slap (Task 33).
 */
export function runPunishmentEffect(draft: CampaignState, ctx: EngineCtx, p: OpenPunishment, fx: Effect): EngineEvent[] {
  const reg = ctx.registries;
  const holderId = p.holderId;
  const pr = ensurePractices(draft);
  switch (fx.type) {
    case 'slot_held':
      return startHold(draft, ctx, holderId, fx.slots as 1 | 2 | 'day', { punitive: true, punishmentId: p.id });
    case 'privilege_revoked': {
      const what = fx.what as 'no_dms_others' | 'no_free_activities' | 'room';
      // a room is the one the answer was given in (the open scene's), else the commander's own quarters
      const arg = what === 'room' ? (draft.scene?.locationId ?? 'quarters_commander') : undefined;
      pr.restrictions.push({ holderId, what, ...(arg !== undefined ? { arg } : {}), untilDay: draft.day + num(fx.days, 1) });
      return [{ type: 'privilege_revoked', what, untilDay: draft.day + num(fx.days, 1), unitId: holderId }];
    }
    case 'protocol_extra':
      return requestPractice(draft, ctx, holderId, 'protocol', { days: num(fx.days, 1) });
    case 'cold_shoulder': {
      const until = draft.day + num(fx.days, 1);
      pr.cold[holderId] = Math.max(pr.cold[holderId] ?? 0, until);
      return [{ type: 'cold_shoulder_started', unitId: holderId, untilDay: until }];
    }
    case 'confession': {
      const targetId = atBase(draft, holderId)[0];
      if (targetId === undefined) return [];
      const name = draft.squad.find((u) => u.id === targetId)?.displayName ?? targetId;
      const C = TUNING.practice.punish.confession;
      const stakes = TUNING.practice.punish.stakesOf[p.severity - 1];
      const id = nextPracticeId(draft, 'pt');
      const task: Task = {
        id, holderId, kind: 'task', tags: ['public_humiliation'], track: C.track, tier: p.severity, stakes, check: 'model', proof: 'none', deadline: { day: draft.day + C.days },
        text: C.text.replaceAll('{name}', name), summary: C.summary.replaceAll('{name}', name), plain: true, status: 'open', targetUnitId: targetId, acceptForm: acceptFormOf(stakes, undefined),
        day: draft.day, answeredDay: draft.day,
      };
      pr.tasks.push(task);
      return [{ type: 'task_issued', taskId: id, holderId, kind: 'task', plain: true, confession: true, punishmentId: p.id }];
    }
    case 'mark': {
      const personal = personalOf(draft);
      if (personal.mark !== undefined) return [];
      personal.mark = { unitId: holderId, untilDay: draft.day + num(fx.days, 1) };
      return [{ type: 'mark_set', unitId: holderId, untilDay: personal.mark.untilDay }];
    }
    case 'stress':
      return addCommanderStress(draft, num(fx.amount), 'holder_punishment');
    case 'injury_chance': {
      const chance = Math.min(1, Math.max(0, num(fx.chance) - num(fx.perEndurance) * (draft.commander.body?.endurance ?? 0) - num(fx.perTrained) * trainedLevel(draft)));
      return practiceRoll(draft, holderId, `injury:${p.id}`) < chance ? injureCommander(draft, num(fx.days, 1)) : [];
    }
    case 'physical':
      return [{ type: 'punishment_carried_out', punishmentId: p.id, holderId, physical: true }]; // narrated: the directive says shown or reported (`physical_discipline_shown`)
    case 'slap':
      return startSlap(draft, ctx, holderId, { punishmentId: p.id });
    default:
      return [];
  }
}

const styleOf = (draft: CampaignState, reg: Registries, holderId: string): string | undefined => practiceOf(draft, reg, holderId)?.style.primary;

/** ACCEPT (R8): the repair lands (its row, and P15's feed adds hold), `discipline` xp by the weight, a yield into her reading (after a threat: fear), then the effects, in public when the entry and the gate allow. */
function accept(draft: CampaignState, ctx: EngineCtx, p: OpenPunishment): EngineEvent[] {
  const reg = ctx.registries;
  const holderId = p.holderId;
  p.status = 'accepted';
  p.answeredDay = draft.day;
  const audience = publicAudience(draft, reg, p);
  if (audience.length > 0) p.audienceIds = audience;
  const events: EngineEvent[] = [{
    type: 'punishment_answered', punishmentId: p.id, unitId: holderId, holderId, answer: 'accept', severity: p.severity, summary: p.summary,
    ...(audience.length > 0 ? { public: true, present: [holderId, ...audience] } : {}),
  }];
  events.push(...hitHer(draft, reg, holderId, 'punishment_accepted', SEVERITY[p.severity - 1], 'took her punishment'));
  events.push(...addTrackXp(draft, reg, holderId, 'discipline', TUNING.practice.xp.discipline * p.severity));
  events.push(...practiceSample(draft, reg, holderId, 'yielded', { afterThreat: true }));
  for (const fx of effectsOf(entryOf(reg, p))) events.push(...runPunishmentEffect(draft, ctx, p, fx));
  for (const id of audience) events.push(...addSign(draft, ctx, id, holderId, 'demonstration'));
  return events;
}

/** REFUSE (R8): a refusal costs hold by her frame (P15's `refusalCost`, the contest at `rule`), her record rises, a `resisted` sample; she escalates once (not an affectionate one, not past the heaviest). */
function refuse(draft: CampaignState, ctx: EngineCtx, p: OpenPunishment): EngineEvent[] {
  const reg = ctx.registries;
  const holderId = p.holderId;
  p.status = 'refused';
  p.answeredDay = draft.day;
  const events: EngineEvent[] = [{ type: 'punishment_answered', punishmentId: p.id, unitId: holderId, holderId, answer: 'refuse', severity: p.severity, summary: p.summary }];
  events.push(...refusalCost(draft, ctx, holderId, 'demand'));
  events.push(...addRecord(draft, holderId, TUNING.practice.refuseRecord, 'practice_refused'));
  events.push(...practiceSample(draft, reg, holderId, 'resisted'));
  if (p.escalated !== true && styleOf(draft, reg, holderId) !== 'affectionate' && p.severity < 5) {
    const entryId = pickHolderPunishment(draft, reg, holderId, p.severity + 1);
    const severity = entryId === null ? undefined : severityOfEntry(reg, entryId);
    if (entryId !== null && severity !== undefined && severity > p.severity) events.push(...requestPractice(draft, ctx, holderId, 'punishment', { offence: p.offence, severity, entryId, escalated: true }));
  }
  return events;
}

/**
 * The commander answers her discipline (`practice/answer_punishment`). ACCEPT carries the effects out, NEGOTIATE leaves the punishment open for a talk (the caller opens the scene; a
 * `compromise_reached` settles it), REFUSE is a defiance. Throws for a punishment that is gone, answered, a soldier's or hers while she is not holding.
 */
export function answerPunishment(draft: CampaignState, ctx: EngineCtx, punishmentId: string, answer: 'accept' | 'negotiate' | 'refuse'): EngineEvent[] {
  const p = pendingPunishment(draft, ctx, punishmentId);
  if (answer === 'negotiate') {
    p.status = 'negotiating';
    return [{ type: 'punishment_answered', punishmentId, unitId: p.holderId, holderId: p.holderId, answer: 'negotiate', severity: p.severity }];
  }
  if (answer === 'accept') return accept(draft, ctx, p);
  if (answer === 'refuse') return refuse(draft, ctx, p);
  throw new Error('Unknown answer.');
}

/**
 * A talk reached a compromise over her punishment (`compromise_reached { punishmentId, text }`, offered only for an open one of hers): the weight falls by one and the entry is picked again for
 * it (when none stands at the lower weight the entry stays), the words are the agreed ones (cut; a pronoun for the commander is not taken: the entry's own label then) and the card is `offered`
 * again. Nothing for one that is not hers, not open or while she is not holding.
 */
export function compromisePunishment(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, ev: Pick<EventIntent, 'punishmentId' | 'text'>): EngineEvent[] {
  const reg = ctx.registries;
  const p = ev.punishmentId === undefined ? undefined : draft.practices?.punishments.find((x) => x.id === ev.punishmentId && x.holderId === holderId && x.forUnitId === undefined);
  if (p === undefined || (p.status !== 'offered' && p.status !== 'negotiating') || !practiceLive(draft, reg, holderId)) return [];
  const lower = Math.max(1, p.severity - 1);
  const entryId = lower < p.severity ? pickHolderPunishment(draft, reg, holderId, lower) : null;
  if (entryId !== null) {
    p.entryId = entryId;
    p.severity = severityOfEntry(reg, entryId) ?? lower as OpenPunishment['severity'];
  }
  const text = plainText(ev.text, TUNING.practice.textMax);
  if (text !== '' && !hasCommanderPronoun(text)) {
    p.text = text;
    p.summary = plainText(ev.text, TUNING.practice.summaryMax);
    delete p.plain;
  } else {
    const label = String(entryOf(reg, p)?.label ?? p.summary);
    p.text = fallbackLine('punishment', label);
    p.summary = label;
    p.plain = true;
  }
  delete p.sealed;
  p.status = 'offered';
  return [{ type: 'punishment_answered', punishmentId: p.id, unitId: holderId, holderId, answer: 'compromise', severity: p.severity }];
}

/** Closes what a day left behind (the day step, sub-step 9): an accepted punishment of an earlier day is done. */
export function closePunishments(draft: CampaignState): void {
  for (const p of draft.practices?.punishments ?? []) if (p.status === 'accepted' && (p.answeredDay ?? p.day) < draft.day) p.status = 'done';
}

/** The days the cold shoulder wakes the commander's Want daily (sub-step 9): hers rises while the shoulder lasts. */
export function coldShoulderWants(draft: CampaignState): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const [holderId, until] of Object.entries(draft.practices?.cold ?? {})) {
    if (until >= draft.day && dynamicOf(draft, holderId) !== undefined) events.push(...raiseWant(draft, holderId, TUNING.practice.coldWant, 'cold_shoulder'));
  }
  return events;
}
