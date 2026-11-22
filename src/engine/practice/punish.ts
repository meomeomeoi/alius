/**
 * Answering her discipline (P16, plan R8): the three answers to a punishment (ACCEPT carries its effects out, NEGOTIATE opens a talk that a compromise settles at one step less, REFUSE
 * is a defiance she may answer once with a heavier one), and what each effect does. The engine owns every number: the entry, the weight and the effects are the registry's, the
 * model only worded it. A punishment is public only when `public_humiliation` is on and her audience is not `private_only` (R8), and then it is a demonstration for up to two others.
 * Nothing here draws: the injury roll is `practiceRoll`.
 */
import type { Entry, Registries } from '../../content/types';
import { countDeed } from '../discipline/deeds';
import { revertInverse } from '../discipline/undo';
import { applyPunishment, checkPunish } from '../discipline/punish';
import { addRecord, captureInverse } from '../discipline/record';
import { injureCommander } from '../calendar';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { hasCapability } from '../dynamic/capabilities';
import { practiceOf } from '../dynamic/profile';
import { addSign } from '../dynamic/knowledge';
import { refusalCost } from '../dynamic/milestones';
import { addFavour, restoreHold } from '../dynamic/hold';
import { threatNear } from '../dynamic/reading';
import { regardFall, regardRise } from '../dynamic/regard';
import { dynamicOf } from '../dynamic/state';
import { blockingOf, COMMANDER } from '../blocking';
import { addTrackXp } from '../dynamic/tracks';
import { hasCommanderPronoun } from '../dynamic/pronoun';
import { raiseWant } from '../bonds/want';
import { isLiving } from '../economy';
import { hitHer } from '../personal/events';
import { personalOf } from '../personal/state';
import type { EventIntent } from '../relations/intents';
import type { CampaignState, Severity } from '../state/types';
import { addCommanderStress } from '../special/commanderStress';
import { TUNING } from '../tuning';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { endHold, startHold } from './hold';
import { WRITERS } from './issue';
import { atBase, pickHolderPunishment, severityOfEntry } from './offences';
import { practiceSample } from './sample';
import { requestPractice } from './request';
import { startSlap } from './slap';
import { fallbackLine } from './seeds';
import { practiceRoll, type OpenPunishment, type PracticeUndo, type PunishmentEffectType, type Task } from './state';
import { acceptFormOf, recordLine } from './tasks';
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
 * Who sees a public punishment carried out (R8): none unless the entry is public, `public_humiliation` is on and her audience is not `private_only`; then the other units of the open
 * scene, at most two, in the scene's order. Nobody who is merely at base: someone who was not there saw nothing (and in a DM, or a scene with her alone, no one did, so the punishment is
 * private). (The audience pick of the demonstrations, R9, and the group scene of a public execution replace this when they are built.)
 */
function publicAudience(draft: CampaignState, reg: Registries, p: OpenPunishment): string[] {
  if (p.public !== true || !(draft.content?.enabled ?? []).includes('public_humiliation')) return [];
  if (practiceOf(draft, reg, p.holderId)?.audience === 'private_only') return [];
  if (!(draft.scene?.participants ?? []).includes(p.holderId)) return []; // a scene she is not in saw nothing of what was done elsewhere (a DM answer)
  const units = eligibleUnits(draft, p.holderId);
  return (draft.scene?.participants ?? []).filter((id) => units.includes(id)).slice(0, TUNING.practice.punish.publicAudienceMax);
}

/** The strongest endurance level the commander has in any contact physics (her trained route, R8). */
const trainedLevel = (draft: CampaignState): number => Math.max(0, ...Object.values(draft.commander.endurance ?? {}).map((e) => e?.level ?? 0));

/**
 * Carries one effect of an accepted punishment out (read by `type`, never by the entry's id): a held slot (the hold, Task 25), a revoked privilege (a restriction the readers of Task 14
 * enforce), an extra protocol (a request), a cold shoulder, a confession (a task that names the first soldier at base), a mark (only when none is set), stress, an injury roll
 * (`practiceRoll < chance - perEndurance x endurance - perTrained x trained`), the narrated hand (a directive) and the slap (Task 33).
 */
export function runPunishmentEffect(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, p: OpenPunishment, fx: Effect): EngineEvent[] {
  const reg = ctx.registries;
  const holderId = p.holderId;
  const pr = ensurePractices(draft);
  switch (fx.type) {
    case 'slot_held':
      return startHold(draft, ctx, holderId, fx.slots as 1 | 2 | 'day', { punitive: true, punishmentId: p.id });
    case 'privilege_revoked': {
      const what = fx.what as 'no_dms_others' | 'no_free_activities' | 'room';
      const arg = what === 'room' && typeof fx.arg === 'string' ? fx.arg : undefined; // the location the row names (the schema requires it for a room)
      if (what === 'room' && arg === undefined) return [];
      pr.restrictions.push({ holderId, what, ...(arg !== undefined ? { arg } : {}), untilDay: draft.day + num(fx.days, 1) });
      return [{ type: 'privilege_revoked', what, untilDay: draft.day + num(fx.days, 1), unitId: holderId }];
    }
    case 'protocol_extra':
      // a protocol is asked for only once something can write one (a request nobody can issue would cost the controller a model call that must fail, and block her new practices)
      return WRITERS.protocol === undefined ? [] : requestPractice(draft, ctx, holderId, 'protocol', { days: num(fx.days, 1) });
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

/**
 * What she reads in a commander who accepts a punishment she knew to be unfair (R16): a yield, whose motive is fear when she threatened in the same exchange (the one she just issued it in) and `her`
 * otherwise; and her Regard by style: `ritual` and `cold` lose a little respect for a commander who takes what was not earned, `cruel` and `vindictive` respect what it cost. Other styles read nothing more.
 */
function unfairAccepted(draft: CampaignState, reg: Registries, holderId: string): EngineEvent[] {
  const events = practiceSample(draft, reg, holderId, 'yielded', { motive: threatNear(draft, [], holderId) ? 'fear' : 'her' });
  const style = styleOf(draft, reg, holderId);
  if (style === 'ritual' || style === 'cold') events.push(...regardFall(draft, reg, holderId, 1, { witness: false, cause: 'unfair' }));
  else if (style === 'cruel' || style === 'vindictive') events.push(...regardRise(draft, reg, holderId, 'cost'));
  return events;
}

/** ACCEPT (R8): the repair lands (its row, and P15's feed adds hold), `discipline` xp by the weight, a yield into her reading (after a threat: fear), then the effects, in public when the entry and the gate allow. */
function accept(draft: CampaignState, ctx: EngineCtx, p: OpenPunishment): EngineEvent[] {
  const reg = ctx.registries;
  const holderId = p.holderId;
  p.status = 'accepted';
  p.answeredDay = draft.day;
  const audience = publicAudience(draft, reg, p);
  if (audience.length > 0) p.audienceIds = audience;
  if (draft.scene?.participants.includes(holderId) === true) p.voicedScene = draft.scene.id; // answered in a scene with her: told there, once
  const events: EngineEvent[] = [{
    type: 'punishment_answered', punishmentId: p.id, unitId: holderId, holderId, answer: 'accept', severity: p.severity, summary: p.summary,
    ...(audience.length > 0 ? { public: true, present: [holderId, ...audience] } : {}),
  }];
  if (p.sealed === true) {
    // a sealed envelope is opened by the accept and signed blank, as a sealed task is (R.1, R.8): the record keeps the line, so the answer cannot be taken back
    ensurePractices(draft).records.push({ day: draft.day, holderId, line: recordLine({ summary: p.summary, sealed: true, answeredDay: draft.day, day: p.day }) });
    events.push({ type: 'practice_opened', punishmentId: p.id, holderId }, { type: 'practice_signed', punishmentId: p.id, unitId: holderId, holderId, summary: p.summary, sealed: true });
  }
  // a punishment of weight 3 or more from a holder who keeps a ceremony is carried out as one: the commander takes the steps, and what ACCEPT would have done is done at the last (R21)
  const steps = p.forUnitId === undefined ? ceremonyOf(draft, reg, holderId, p.severity) : null;
  if (steps !== null) {
    p.ceremony = { steps, done: [] };
    events[0].ceremony = true;
    return events;
  }
  events.push(...carryOut(draft, ctx, p));
  return events;
}

/**
 * What accepting her punishment does (R8), once the commander has said yes and the ceremony, if there is one, is done: the repair lands (its row, and P15's feed adds hold), `discipline` xp by the weight,
 * a yield into her reading (a punishment she knew to be unfair is read by `unfairAccepted`), the effects of the entry, and the sign for each who watched it done in public.
 */
function carryOut(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, p: OpenPunishment): EngineEvent[] {
  const reg = ctx.registries;
  const holderId = p.holderId;
  const events: EngineEvent[] = [];
  events.push(...hitHer(draft, reg, holderId, 'punishment_accepted', SEVERITY[p.severity - 1], 'took her punishment'));
  events.push(...addTrackXp(draft, reg, holderId, 'discipline', TUNING.practice.xp.discipline * p.severity));
  if (p.offence.unfair === true) events.push(...unfairAccepted(draft, reg, holderId));
  else events.push(...practiceSample(draft, reg, holderId, 'yielded', { afterThreat: true }));
  for (const fx of effectsOf(entryOf(reg, p))) events.push(...runPunishmentEffect(draft, ctx, p, fx));
  for (const id of p.audienceIds ?? []) events.push(...addSign(draft, ctx, id, holderId, 'demonstration'));
  return events;
}

// ---------------------------------------------------------------------------------------------
// The ceremony (R21, spec §R.4)

/**
 * The steps of the ceremony she holds for a punishment of this weight, in order, or `null`: the weight is 3 or more and her primary style is in the `styles` of some rows of `ceremonySteps` (never `cold`:
 * its rows do not list it). Read by the rows' own `styles` and `order`, never by id. Reads only.
 */
export function ceremonyOf(state: CampaignState, reg: Registries, holderId: string, severity: number): string[] | null {
  const style = styleOf(state, reg, holderId);
  if (style === undefined || severity < TUNING.practice.ceremony.minSeverity) return null;
  const rows = [...reg.ceremonySteps.values()].filter((e) => Array.isArray(e.styles) && (e.styles as unknown[]).includes(style)).sort((a, b) => Number(a.order) - Number(b.order));
  return rows.length === 0 ? null : rows.map((e) => String(e.id));
}

/**
 * The count she keeps for a number the commander named (R21): a number under her table's row for the weight (`lowNumber`) is doubled by `cruel` and `vindictive` (`TUNING.practice.ceremony.doubledBy`), any
 * other number stands. The commander is never told it was doubled. Pure.
 */
export function ceremonyCount(style: string | undefined, severity: number, named: number): number {
  const C = TUNING.practice.ceremony;
  const low = (C.lowNumber as Readonly<Record<number, number>>)[severity] ?? 0;
  return style !== undefined && C.doubledBy.includes(style) && named < low ? named * 2 : named;
}

const stepEntry = (reg: Registries, id: string): { check?: string; posture?: string } | undefined => reg.ceremonySteps.get(id) as { check?: string; posture?: string } | undefined;
/** Her punishment whose ceremony is running (accepted, not all steps done). */
const runningCeremony = (state: CampaignState, id: string): OpenPunishment | undefined => {
  const p = state.practices?.punishments.find((x) => x.id === id);
  return p !== undefined && p.status === 'accepted' && p.ceremony !== undefined && p.ceremony.carried !== true && p.ceremony.done.length < p.ceremony.steps.length ? p : undefined;
};
/** The step that is next: the first of the steps that is not done. */
export const nextCeremonyStep = (p: Pick<OpenPunishment, 'ceremony'>): string | undefined => (p.ceremony?.carried === true ? undefined : p.ceremony?.steps.find((id) => !p.ceremony!.done.includes(id)));

/** All steps done (or none left to do) runs what ACCEPT would have done, and says `ceremony_done` (`lapsed` when the day ended before the commander did the rest and she carried it out herself). */
function finishCeremony(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, p: OpenPunishment, lapsed: boolean): EngineEvent[] {
  if (p.ceremony === undefined || p.ceremony.carried === true) return [];
  p.ceremony.carried = true; // the effects run once: nothing reopens a finished ceremony (a flinch at its slap, the day's close)
  return [{ type: 'ceremony_done', punishmentId: p.id, unitId: p.holderId, holderId: p.holderId, ...(lapsed ? { lapsed: true } : {}) }, ...carryOut(draft, ctx, p)];
}

/**
 * One step of the ceremony is done (R21): by the action (`practice/ceremony_step`: a `chip` step, or a `number` step with the number in the payload), by the intent (`words` and `number` steps: what the commander
 * said) or by the commander's posture (a `posture` step, from `blocking_changed`). It must be the next step; the number is a whole number from 1 to 50 and `ceremonyCount` decides what she keeps of it. The action
 * throws with the reason, the intent and the posture do nothing. The last step carries the punishment out (`ceremony_done`). Draws nothing.
 */
export function ceremonyStep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, punishmentId: string, step: string, via: 'action' | 'intent' | 'posture', number?: number): EngineEvent[] {
  const reg = ctx.registries;
  const p = runningCeremony(draft, punishmentId);
  const refuse = (message: string): EngineEvent[] => { if (via === 'action') throw new Error(message); return []; };
  if (p === undefined || p.forUnitId !== undefined || !practiceLive(draft, reg, p.holderId)) return refuse('That ceremony is gone.');
  if (nextCeremonyStep(p) !== step) return refuse('That is not the next step.');
  const check = stepEntry(reg, step)?.check;
  if (check === 'chip' && via !== 'action') return [];
  if (check === 'words' && via !== 'intent') return refuse('Say it in your own words.');
  if (check === 'posture' && via !== 'posture') return refuse('Take the posture she names.');
  if (check === 'number') {
    if (via === 'posture') return [];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < TUNING.practice.ceremony.number.min || number > TUNING.practice.ceremony.number.max) return refuse('A whole number from one to fifty.');
    p.ceremony!.number = number;
    p.count = ceremonyCount(styleOf(draft, reg, p.holderId), p.severity, number);
  }
  p.ceremony!.done.push(step);
  const events: EngineEvent[] = [{ type: 'ceremony_step', punishmentId: p.id, unitId: p.holderId, holderId: p.holderId, step }];
  if (nextCeremonyStep(p) === undefined) events.push(...finishCeremony(draft, ctx, p, false));
  return events;
}

/**
 * The after-action of the posture steps (registered by `actions/practice.ts`): when the commander's posture in the open scene with her is the posture the next step of her running ceremony names, the step is done;
 * each following posture step the same posture already satisfies is too. Nothing without a scene with her or a ceremony.
 */
export function ceremonyPostures(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  if (!events.some((e) => e.type === 'blocking_changed' || e.type === 'ceremony_step')) return [];
  const scene = draft.scene;
  if (scene === undefined || draft.practices === undefined) return [];
  const out: EngineEvent[] = [];
  for (const p of [...draft.practices.punishments]) {
    if (!scene.participants.includes(p.holderId)) continue;
    for (;;) {
      const live = runningCeremony(draft, p.id);
      const next = live === undefined ? undefined : nextCeremonyStep(live);
      const entry = next === undefined ? undefined : stepEntry(ctx.registries, next);
      if (next === undefined || entry?.check !== 'posture' || entry.posture === undefined || blockingOf(scene, COMMANDER).posture !== entry.posture) break;
      const done = ceremonyStep(draft, ctx, p.id, next, 'posture');
      if (done.length === 0) break;
      out.push(...done);
    }
  }
  return out;
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
  if (answer === 'accept') return withUndo(draft, ctx, p, () => accept(draft, ctx, p));
  if (answer === 'refuse') return withUndo(draft, ctx, p, () => refuse(draft, ctx, p));
  throw new Error('Unknown answer.');
}

// ---------------------------------------------------------------------------------------------
// UNDO of an answer (R8): an `Inverse`, never a snapshot

/**
 * Runs an answer inside `captureInverse` (her relation numbers, record, history, deeds) and adds what the practices put (`Inverse.practice`: her hold, favour, tracks, refusals and contest
 * before, what the answer wrote and where things stood). The inverse is kept on the punishment; `undoPractice` puts exactly that back.
 */
function withUndo(draft: CampaignState, ctx: EngineCtx, p: OpenPunishment, answer: () => EngineEvent[]): EngineEvent[] {
  const holderId = p.holderId;
  const dyn = dynamicOf(draft, holderId)!;
  const pr = ensurePractices(draft);
  const undo: PracticeUndo = {
    punishmentId: p.id, status: p.status, hold: dyn.hold, favour: dyn.favour, tracks: structuredClone(dyn.tracks), refusals: [...dyn.refusals], contest: [...dyn.contest], restrictionsAdded: [], domains: structuredClone(dyn.domains), lastPracticeDay: dyn.lastPracticeDay,
    ...(pr.cold[holderId] !== undefined ? { cold: pr.cold[holderId] } : {}),
    stamp: {
      day: draft.day, slot: draft.slot, ...(draft.scene !== undefined ? { sceneId: draft.scene.id } : {}), frame: dyn.frame, milestones: (draft.dynamic?.open.milestones ?? []).filter((m) => m.unitId === holderId).map((m) => m.id),
      claims: (draft.dynamic?.open.claims ?? []).filter((c) => c.unitId === holderId).map((c) => c.id), injuredUntil: draft.commander.injuredUntilDay ?? 0, expedition: draft.expedition?.id ?? null, lastExpedition: draft.lastExpedition?.id ?? null,
    },
  };
  const restrictionsBefore = [...pr.restrictions];
  const tasksBefore = pr.tasks.map((t) => t.id);
  const requestsBefore = pr.requests.map((r) => r.id);
  const markBefore = draft.personal?.mark;
  const heldBefore = pr.held;
  const slapBefore = pr.slap;
  const { events, inverse } = captureInverse(draft, holderId, answer);
  if (heldBefore === undefined && pr.held !== undefined && pr.held.by === holderId) undo.startedHold = true; // the answer started a hold: UNDO ends it
  if (pr.slap !== undefined && pr.slap !== slapBefore && pr.slap.holderId === holderId) undo.slapId = pr.slap.id; // the answer started a slap that is still open: UNDO ends it
  if (events.some((e) => e.type === 'slap_dealt')) undo.struck = true; // one that landed at once (no scene with her to brace in) cannot be taken back
  undo.restrictionsAdded = pr.restrictions.filter((r) => !restrictionsBefore.includes(r)).map((r) => ({ ...r }));
  const tasks = pr.tasks.map((t) => t.id).filter((id) => !tasksBefore.includes(id));
  const requests = pr.requests.filter((r) => !requestsBefore.includes(r.id));
  if (tasks.length > 0) undo.taskIds = tasks;
  if (requests.length > 0) undo.requestIds = requests.map((r) => r.id);
  const escalation = requests.find((r) => r.kind === 'punishment');
  if (escalation !== undefined) undo.escalationRequestId = escalation.id;
  if (markBefore === undefined && draft.personal?.mark?.unitId === holderId) undo.markSet = true;
  const stress = events.filter((e) => e.type === 'commander_stress_changed' && e.source === 'holder_punishment').reduce((sum, e) => sum + num(e.delta), 0);
  if (stress !== 0) undo.commanderStress = stress;
  inverse.practice = undo;
  p.inverse = inverse;
  return events;
}

/**
 * Why an answer to her discipline cannot be undone now, or `null`. Only an accept or a refuse of a punishment of hers, on the day it was answered and (in a scene) while that scene is
 * open, with nothing since that cannot be put back: her frame, a milestone or a claim offered, an injury, a run, a slot spent, others who saw it, an escalation already answered.
 */
export function canUndoPractice(state: CampaignState, punishmentId: string): string | null {
  const p = state.practices?.punishments.find((x) => x.id === punishmentId);
  const undo = p?.inverse?.practice;
  if (p === undefined || undo === undefined || p.forUnitId !== undefined || (p.status !== 'accepted' && p.status !== 'refused')) return 'There is nothing to undo.';
  if (p.sealed === true && p.status === 'accepted') return 'It was signed blank, and the record keeps it.';
  const at = undo.stamp;
  if (p.ceremony !== undefined && p.ceremony.done.length > 0) return 'A step of the ceremony was done.';
  if (undo.struck === true || (undo.slapId !== undefined && state.practices?.slap?.id !== undo.slapId)) return 'The slap has landed.';
  if (at.day !== state.day) return 'It can only be undone on the day it was answered.';
  if (at.sceneId !== undefined && state.scene?.id !== at.sceneId) return 'Its scene has ended.';
  if (dynamicOf(state, p.holderId)?.frame !== at.frame) return 'Her frame has changed since.';
  if ((state.dynamic?.open.milestones ?? []).some((m) => m.unitId === p.holderId && !at.milestones.includes(m.id))) return 'A milestone was offered since.';
  if ((state.dynamic?.open.claims ?? []).some((c) => c.unitId === p.holderId && !at.claims.includes(c.id))) return 'A claim was opened since.';
  if ((state.commander.injuredUntilDay ?? 0) !== at.injuredUntil) return 'The commander was hurt since.';
  if ((state.expedition?.id ?? null) !== at.expedition || (state.lastExpedition?.id ?? null) !== at.lastExpedition) return 'A run has started since.';
  if (state.slot !== at.slot) return 'A slot has passed since.';
  if ((p.audienceIds ?? []).length > 0) return 'Others saw it.';
  const next = undo.escalationRequestId === undefined ? undefined : state.practices!.punishments.find((x) => x.requestId === undo.escalationRequestId);
  if (next !== undefined && next.status !== 'offered') return 'The escalation has already been answered.';
  return null;
}

/**
 * Takes an answer back (`practice/undo`): her relation numbers, record and history through P9's `revertInverse`, then what the practices put (`restorePractice`): hold, favour, tracks, her
 * refusals, domains and the day she last practised, the restrictions the answer added, cold shoulder, mark, stress, tasks and requests the answer made, and the punishment is as it was. Throws with `canUndoPractice`'s reason. Draws nothing.
 */
export function undoPractice(draft: CampaignState, ctx: EngineCtx, punishmentId: string): EngineEvent[] {
  const why = canUndoPractice(draft, punishmentId);
  if (why !== null) throw new Error(why);
  const p = draft.practices!.punishments.find((x) => x.id === punishmentId)!;
  const events = revertInverse(draft, ctx, p.holderId, null, p.inverse!);
  return [{ type: 'practice_undone', punishmentId, unitId: p.holderId }, ...events];
}

/** The hook `revertInverse` calls with an answer's `Inverse.practice` (registered by `actions/practice.ts`): everything the answer wrote on the practices and on her goes back. */
export function restorePractice(draft: CampaignState, ctx: EngineCtx, unitId: string, undo: PracticeUndo): EngineEvent[] {
  const pr = draft.practices;
  const p = pr?.punishments.find((x) => x.id === undo.punishmentId);
  const dyn = dynamicOf(draft, unitId);
  if (pr === undefined || p === undefined) return [];
  const events: EngineEvent[] = [];
  if (undo.startedHold === true && pr.held?.by === unitId) events.push(...endHold(draft, ctx, 'undone')); // its bookings are cancelled with no cost
  if (undo.slapId !== undefined && pr.slap?.id === undo.slapId) delete pr.slap; // the slap the answer opened is closed with no outcome
  if (dyn !== undefined) {
    events.push(...restoreHold(draft, unitId, undo.hold));
    addFavour(draft, unitId, undo.favour - dyn.favour);
    dyn.tracks = structuredClone(undo.tracks);
    dyn.refusals = [...undo.refusals];
    dyn.contest = [...undo.contest];
    dyn.domains = structuredClone(undo.domains); // a hold loss may have cost a domain (`reconcileDomains`)
    dyn.lastPracticeDay = undo.lastPracticeDay;
  }
  for (const row of undo.restrictionsAdded) {
    const at = pr.restrictions.findIndex((r) => r.holderId === row.holderId && r.what === row.what && r.arg === row.arg && r.untilDay === row.untilDay);
    if (at >= 0) pr.restrictions.splice(at, 1); // only the rows this answer wrote: another holder's, written since, stays
  }
  if (undo.cold === undefined) delete pr.cold[unitId];
  else pr.cold[unitId] = undo.cold;
  if (undo.markSet === true && draft.personal?.mark?.unitId === unitId) delete draft.personal.mark;
  if (undo.commanderStress !== undefined) events.push(...addCommanderStress(draft, -undo.commanderStress, 'undo'));
  pr.tasks = pr.tasks.filter((t) => !(undo.taskIds ?? []).includes(t.id));
  pr.requests = pr.requests.filter((r) => !(undo.requestIds ?? []).includes(r.id));
  const worded = undo.escalationRequestId === undefined ? undefined : pr.punishments.find((x) => x.requestId === undo.escalationRequestId && x.status === 'offered');
  if (worded !== undefined) {
    pr.punishments = pr.punishments.filter((x) => x !== worded);
    events.push({ type: 'task_void', taskId: worded.id, holderId: unitId, what: 'punishment', reason: 'undone' });
  }
  p.status = undo.status;
  delete p.answeredDay;
  delete p.audienceIds;
  delete p.voicedScene;
  delete p.ceremony;
  delete p.inverse;
  return events;
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

/**
 * After a scene opens (registered by `actions/practice.ts`): a punishment of hers accepted today, outside any scene with her (a DM), is told to the model in the first scene with her
 * (`voicedScene`), and in no later one. Writes nothing unless one is waiting for it.
 */
export function voiceWaitingPunishments(draft: CampaignState, _ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const p = draft.practices;
  if (p === undefined || p.punishments.length === 0) return [];
  for (const e of events) {
    if (e.type !== 'scene_started' || !Array.isArray(e.participants)) continue;
    for (const x of p.punishments) {
      if (x.status === 'accepted' && x.voicedScene === undefined && x.answeredDay === draft.day && (e.participants as string[]).includes(x.holderId)) x.voicedScene = String(e.sceneId);
    }
  }
  return [];
}

/**
 * Closes what a day left behind (the day step, sub-step 9): an accepted punishment of an earlier day is done. UNDO is the day's (`canUndoPractice`), so the stored inverse (a whole
 * `Inverse`, with a clone of her tracks) of any answered punishment of an earlier day goes with the day.
 */
export function closePunishments(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const p of draft.practices?.punishments ?? []) {
    if ((p.answeredDay ?? p.day) >= draft.day) continue;
    // a ceremony the commander left open is finished by her: she carries the punishment out herself (no dodging it by not taking the steps)
    if (p.status === 'accepted' && p.ceremony !== undefined && p.ceremony.carried !== true && p.ceremony.done.length < p.ceremony.steps.length && practiceLive(draft, ctx.registries, p.holderId)) events.push(...finishCeremony(draft, ctx, p, true));
    if (p.status === 'accepted') p.status = 'done';
    delete p.inverse;
  }
  return events;
}

/** The days the cold shoulder wakes the commander's Want daily (sub-step 9): hers rises while the shoulder lasts. */
export function coldShoulderWants(draft: CampaignState): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const [holderId, until] of Object.entries(draft.practices?.cold ?? {})) {
    if (until >= draft.day && dynamicOf(draft, holderId) !== undefined) events.push(...raiseWant(draft, holderId, TUNING.practice.coldWant, 'cold_shoulder'));
  }
  return events;
}

// ---------------------------------------------------------------------------------------------
// TAKE IT INSTEAD (R8): her order to punish a soldier, and the commander taking it for her

/** The measure of P9 she asks for: the lowest-severity one that can be imposed on the soldier now (registry order within a severity), or null. Reads only. */
function orderedMeasure(state: CampaignState, reg: Registries, soldierId: string): string | null {
  const rows = [...reg.punishments.values()].map((e, i) => ({ e, i })).sort((a, b) => Number(a.e.severity) - Number(b.e.severity) || a.i - b.i);
  const found = rows.find(({ e }) => checkPunish(state, reg, soldierId, String(e.id)) === null);
  return found === undefined ? null : String(found.e.id);
}

/**
 * The soldier she would have punished, or null: she holds the countermand, the soldier is a living named unit other than her, has a defiance nobody has answered
 * (`discipline.defiance`) and has no order of hers open. The first in squad order. Reads only.
 */
export function orderCandidate(state: CampaignState, reg: Registries, holderId: string): string | null {
  if (!practiceLive(state, reg, holderId) || !hasCapability(state, reg, holderId, 'countermand')) return null;
  const open = (state.practices?.punishments ?? []).filter((p) => p.holderId === holderId && p.forUnitId !== undefined && p.status === 'offered').map((p) => p.forUnitId);
  const pending = (state.discipline?.defiance ?? []).map((d) => d.unitId);
  const soldier = state.squad.find((u) => u.kind === 'named' && u.id !== holderId && isLiving(u) && pending.includes(u.id) && !open.includes(u.id));
  return soldier !== undefined && orderedMeasure(state, reg, soldier.id) !== null ? soldier.id : null;
}

/** Her order to punish a soldier (`orderPunishment`, R8): an open punishment with `forUnitId`, the lowest P9 measure that can be imposed, her words from the tuning. `punishment_issued` says it. Nothing unless `orderCandidate` names that soldier. */
export function orderPunishment(draft: CampaignState, ctx: EngineCtx, holderId: string, soldierId: string): EngineEvent[] {
  const reg = ctx.registries;
  if (orderCandidate(draft, reg, holderId) !== soldierId) return [];
  const measure = orderedMeasure(draft, reg, soldierId);
  if (measure === null) return [];
  const row = reg.punishments.get(measure)!;
  const severity = Math.min(5, Math.max(1, Number(row.severity))) as OpenPunishment['severity'];
  const soldier = draft.squad.find((u) => u.id === soldierId)!.displayName;
  const O = TUNING.practice.punish.order;
  const id = nextPracticeId(draft, 'pp');
  const label = String(row.label);
  ensurePractices(draft).punishments.push({
    id, holderId, entryId: measure, severity, offence: { kind: 'refusal', ref: `order:${soldierId}`, stakes: 'minor', day: draft.day }, text: O.text.replaceAll('{soldier}', soldier).replaceAll('{what}', label.toLowerCase()),
    summary: O.summary.replaceAll('{soldier}', soldier).replaceAll('{what}', label.toLowerCase()), plain: true, status: 'offered', forUnitId: soldierId, day: draft.day, ...(draft.scene !== undefined ? { sceneId: draft.scene.id } : {}),
  });
  return [{ type: 'punishment_issued', punishmentId: id, holderId, unitId: holderId, severity, offence: 'refusal', forUnitId: soldierId, order: true, plain: true }];
}

/** The order of hers that waits for the commander's answer; throws for one that is gone, answered, not an order or hers while she is not holding. */
function pendingOrder(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, punishmentId: string): OpenPunishment {
  const p = draft.practices?.punishments.find((x) => x.id === punishmentId);
  if (p === undefined || p.forUnitId === undefined) throw new Error('That order is gone.');
  if (!practiceLive(draft, ctx.registries, p.holderId)) throw new Error('She is not holding now.');
  if (p.status !== 'offered') throw new Error('That order has been answered.');
  const soldier = draft.squad.find((u) => u.id === p.forUnitId);
  if (soldier === undefined || !isLiving(soldier)) throw new Error('That soldier is no longer in service.');
  return p;
}

/**
 * The commander answers her order about a soldier (`practice/take_instead`). DO IT imposes the P9 measure on the soldier (an application P9's UNDO can take back); TAKE IT INSTEAD spares the
 * soldier (`spared_for`: her Trust +5), counts the deed `protected`, gives the commander a punishment of hers of the same weight (offered), raises the Record of each named unit at base and
 * says it (`punishment_taken_for`, remembered by those present and the soldier); REFUSE is a refusal of her order (`overrode_her`, minor, on her).
 */
export function takeInstead(draft: CampaignState, ctx: EngineCtx, punishmentId: string, answer: 'do_it' | 'take_it' | 'refuse'): EngineEvent[] {
  const reg = ctx.registries;
  const p = pendingOrder(draft, ctx, punishmentId);
  const holderId = p.holderId;
  const soldierId = p.forUnitId!;
  p.answeredDay = draft.day;
  const answered = (a: string): EngineEvent => ({ type: 'punishment_answered', punishmentId: p.id, unitId: holderId, holderId, answer: a, severity: p.severity, forUnitId: soldierId });
  if (answer === 'refuse') {
    p.status = 'refused';
    return [answered('refuse'), ...hitHer(draft, reg, holderId, 'overrode_her', 'minor', 'refused her order', { amplified: true })];
  }
  if (answer === 'do_it') {
    // a dialogue application, so that P9's UNDO can take it back (a menu one cannot); it is the day's, in a DM
    const done = applyPunishment(draft, ctx, { unitId: soldierId, measure: p.entryId, source: 'dialogue', channel: 'dm' });
    p.status = 'done';
    return [answered('do_it'), ...done];
  }
  if (answer !== 'take_it') throw new Error('Unknown answer.');
  p.status = 'done';
  const events: EngineEvent[] = [answered('take_it')];
  events.push(...hitHer(draft, reg, soldierId, 'spared_for', 'minor', 'was spared by the commander'));
  countDeed(draft, 'protected');
  const here = (draft.scene?.participants ?? []).filter((id) => id !== holderId);
  const named = draft.squad.filter((u) => u.kind === 'named' && isLiving(u) && !(draft.expedition?.party ?? []).includes(u.id));
  for (const u of named) events.push(...addRecord(draft, u.id, TUNING.practice.takeInstead.record, 'took_it'));
  const entryId = pickHolderPunishment(draft, reg, holderId, p.severity);
  if (entryId !== null) {
    const entry = reg.holderPunishments.get(entryId)!;
    const label = String(entry.label);
    const id = nextPracticeId(draft, 'pp');
    ensurePractices(draft).punishments.push({
      id, holderId, entryId, severity: severityOfEntry(reg, entryId) ?? p.severity, offence: p.offence, text: fallbackLine('punishment', label), summary: label, plain: true, status: 'offered',
      ...(entry.public === true ? { public: true as const } : {}), day: draft.day, ...(draft.scene !== undefined ? { sceneId: draft.scene.id } : {}),
    });
    events.push({ type: 'punishment_issued', punishmentId: id, holderId, unitId: holderId, severity: severityOfEntry(reg, entryId) ?? p.severity, offence: p.offence.kind });
  }
  events.push({ type: 'punishment_taken_for', punishmentId: p.id, unitId: holderId, holderId, sparedId: soldierId, present: [...new Set([holderId, soldierId, ...here])], summary: p.summary });
  return events;
}
