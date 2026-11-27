/**
 * Service (P16, plan R10, spec §6): the protocol she sets (a P9d rule of a `service` template, worded by her), the routine that costs no slot, and the commander's confession.
 * Task 22 adds her verdict, favour, kindnesses and anticipation to this file. The engine owns every number; the model only words the rule. Nothing here draws: the pick of the
 * template is `practiceRoll`.
 */
import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { COMMANDER } from '../blocking/state';
import { slotIndex } from '../calendar';
import { tagsOf } from '../bonds/content';
import { canProposeRule, deliverRule, proposeRuleHashed, rulesOf, type RuleTemplate } from '../bonds/rules';
import { relieveWant } from '../bonds/want';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { hasCapability } from '../dynamic/capabilities';
import { addFavour } from '../dynamic/hold';
import { practiceOf } from '../dynamic/profile';
import { regardRise } from '../dynamic/regard';
import { dynamicOf } from '../dynamic/state';
import { addTrackXp } from '../dynamic/tracks';
import { pressureGate } from '../personal/gates';
import { giveToken, kindsFor } from '../personal/tokens';
import { applyEventToUnit } from '../relations/effects';
import type { EventIntent } from '../relations/intents';
import { evaluateAutomatic } from '../relations/graph';
import type { CampaignState, Rule } from '../state/types';
import { TUNING } from '../tuning';
import { cancelBookingsQuietly } from './forget';
import { ensurePractices, nextPracticeId, practiceHolders, practiceLive } from './gate';
import { noteOffence } from './offences';
import { practiceSample } from './sample';
import { KINDNESS_KINDS, practiceRoll, VERDICTS, type KindnessKind, type SceneService, type Task, type Verdict } from './state';
import { frameOf, taskRoom, writeTask, type Writer } from './tasks';

/** Is this template a service rule (a rule of address and conduct)? By the tag it carries, never by id. */
export const isServiceTemplate = (t: RuleTemplate): boolean => tagsOf(t).includes(TUNING.offer.serviceCategory);

const templateOf = (reg: Registries, rule: Pick<Rule, 'templateId'>): RuleTemplate | undefined => reg.relationshipRuleTemplates.get(rule.templateId) as unknown as RuleTemplate | undefined;

/** The rules of hers that are service rules and still stand (proposed, being negotiated or active): what the cap of her frame counts. */
export function protocolRules(state: CampaignState, reg: Registries, holderId: string): Rule[] {
  return rulesOf(state).filter((r) => r.unitId === holderId && r.status !== 'suspended' && (() => { const t = templateOf(reg, r); return t !== undefined && isServiceTemplate(t); })());
}

/** Is there room for another service rule of hers: under `protocolMax` of her frame (1 at `play`, 2 at `role`, 3 at `rule`)? */
export const protocolRoom = (state: CampaignState, reg: Registries, holderId: string): boolean =>
  protocolRules(state, reg, holderId).length < TUNING.practice.protocolMax[frameOf(state, holderId)];

/** Does she keep a routine (the standing daily arrangement)? Her household protocol and an appetite for service of `enjoys` or more. */
function routineAllowed(state: CampaignState, reg: Registries, holderId: string): boolean {
  if (!practiceLive(state, reg, holderId) || !hasCapability(state, reg, holderId, 'household_protocol')) return false;
  const as = practiceOf(state, reg, holderId)?.categories[TUNING.offer.serviceCategory]?.as;
  return as === 'enjoys' || as === 'craves';
}

/** Her routine that stands (open), if any. */
const routineOf = (state: CampaignState, holderId: string): Task | undefined => state.practices?.tasks.find((t) => t.holderId === holderId && t.routine === true && t.status === 'open');

/**
 * Her routine (R10): one standing task that costs no slot and has no deadline (it is counted every day, not judged once), written at her first protocol request when she holds
 * the household protocol and enjoys service. Open at once: it needs no answer. `protocol_set` tells the controller. Nothing when she has one or may not keep one.
 */
export function writeRoutine(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string): EngineEvent[] {
  if (!routineAllowed(draft, ctx.registries, holderId) || routineOf(draft, holderId) !== undefined) return [];
  const T = TUNING.practice.routine;
  const id = nextPracticeId(draft, 'pt');
  ensurePractices(draft).tasks.push({
    id, holderId, kind: 'task', tags: [TUNING.offer.serviceCategory], track: T.track, tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: T.text, summary: T.summary,
    status: 'open', routine: true, acceptForm: 'button', day: draft.day, answeredDay: draft.day,
  });
  return [{ type: 'protocol_set', unitId: holderId, holderId, taskId: id, routine: true }];
}

/**
 * Her protocol, from a card (R10): a request of kind `protocol` becomes a P9d proposal of a `service` template (the pick is hashed, `practiceRoll`; only templates she may propose:
 * `relation_rules` at `play` or beyond, the content gate, her own limits), worded by the card and delivered as P9d does (a DM from her, or said in the scene she is in). When she
 * may have no more of them at her frame, or none can be proposed, the request becomes a task instead (a card with a deadline). A plain (fallback) card delivers the template's own line.
 * Her first protocol request also writes her routine.
 */
export const writeProtocol: Writer = (draft, ctx, request, out, plain) => {
  const reg = ctx.registries;
  const holderId = request.holderId;
  const opts = { practice: true, filter: isServiceTemplate } as const;
  const proposed = protocolRoom(draft, reg, holderId) ? proposeRuleHashed(draft, reg, holderId, practiceRoll(draft, holderId, `protocol:${request.id}`), opts) : [];
  const proposal = proposed.find((e) => e.type === 'rule_proposed');
  const events: EngineEvent[] = [];
  if (proposal === undefined) {
    if (!taskRoom(draft, reg, holderId)) return [];
    events.push(...writeTask(draft, ctx, { ...request, kind: 'task' }, { ...out, kind: 'task', deadline: out.deadline ?? { days: TUNING.practice.defaultDeadlineDays } }, plain));
  } else {
    const rule = rulesOf(draft).find((r) => r.id === proposal.ruleId)!;
    events.push(...proposed, ...deliverRule(draft, rule.id, plainDraft(plain ? rule.text : out.text)), { type: 'protocol_set', unitId: holderId, holderId, ruleId: rule.id, requestId: request.id, ...(plain ? { plain: true } : {}) });
  }
  events.push(...writeRoutine(draft, ctx, holderId));
  return events;
};

/** Can she be asked for a protocol rule now (so that a request for one would be written as a rule rather than a task)? */
export const protocolPossible = (state: CampaignState, reg: Registries, holderId: string): boolean =>
  protocolRoom(state, reg, holderId) && canProposeRule(state, reg, holderId, { practice: true, filter: isServiceTemplate });

/**
 * A routine told to be broken today (a report in a talk, or the commander's own `[ I DIDN'T ]`): the day is not counted as kept and the offence is a trivial one (a confessed one weighs
 * one less). The routine itself goes on. Nothing for a routine already told today, one that is not open, or a holder who is not live.
 */
export function routineBroken(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, task: Task, via: 'model' | 'confess'): EngineEvent[] {
  if (task.routine !== true || task.status !== 'open' || task.brokenDay === draft.day || !practiceLive(draft, ctx.registries, task.holderId)) return [];
  task.brokenDay = draft.day;
  return [
    { type: 'task_broken', taskId: task.id, unitId: task.holderId, holderId: task.holderId, via, stakes: 'trivial', summary: task.summary, routine: true },
    ...noteOffence(draft, ctx, task.holderId, { kind: 'task_broken', ref: `routine:${task.id}:${draft.day}`, stakes: 'trivial', day: draft.day, ...(via === 'confess' ? { confessed: true as const } : {}) }),
  ];
}

/** `[ I DIDN'T ]` (`practice/confess { taskId }`): the commander tells her the routine was not done today. Throws for a task that is gone, is not a routine, was told already today, or is hers while she is not holding. */
export function confess(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, taskId: string): EngineEvent[] {
  const task = draft.practices?.tasks.find((t) => t.id === taskId && t.routine === true);
  if (task === undefined || task.status !== 'open') throw new Error('That routine is gone.');
  if (!practiceLive(draft, ctx.registries, task.holderId)) throw new Error('She is not holding now.');
  if (task.brokenDay === draft.day) throw new Error('That was told already today.');
  return routineBroken(draft, ctx, task, 'confess');
}

/**
 * The day step's routine part (R7.2), at the end of `draft.day`: each live holder's routine that no report broke today is kept (`routine_kept`, service xp + 1). A routine whose holder no
 * longer keeps the household protocol or no longer enjoys service is void (no delta). A holder who is not live is frozen. Draws nothing.
 */
export function routineSweep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const holderId of practiceHolders(draft, reg)) {
    const task = routineOf(draft, holderId);
    if (task === undefined) continue;
    if (!routineAllowed(draft, reg, holderId)) {
      task.status = 'void';
      events.push({ type: 'task_void', taskId: task.id, holderId, what: 'task', reason: 'lapsed' });
      continue;
    }
    if (task.brokenDay === draft.day) continue;
    events.push({ type: 'routine_kept', unitId: holderId, holderId, taskId: task.id }, ...addTrackXp(draft, reg, holderId, TUNING.practice.routine.track, TUNING.practice.routine.xp));
  }
  return events;
}

// --- her verdict, favour, kindnesses and anticipation (Task 22, R10) ----------------------------------------------------------------------------------------------------------------------------

/** P15a's default activity of a soldier with none set, by field: the first of hers that is fully on the commander (`attention`) and that no source sets (`sources`). */
export function defaultActivity(reg: Registries): string | undefined {
  const row = [...reg.blockingActivities.values()].find((e) => e.actor === 'her' && e.attention === 'on_commander' && e.sources === undefined);
  return row === undefined ? undefined : String(row.id);
}

type ActivityRow = { scope?: string; actor?: string; judged?: true; fits?: string[]; presence?: string; pairTags?: string[] };

/** How she wants the commander's service to be felt (`unnoticed` or `felt`), from her style: the expectation profile has no field for it, so the table of `TUNING.practice.verdict.wish` stands in. Reads only. */
export function wishedPresence(state: CampaignState, reg: Registries, holderId: string): 'unnoticed' | 'felt' {
  const style = practiceOf(state, reg, holderId)?.style.primary;
  return (style === undefined ? undefined : TUNING.practice.verdict.wish[style]) ?? 'felt';
}

/**
 * The pair "her activity + the commander's activity" in the open scene, when the commander's is a judged service of the dynamic (`scope: dynamic`, `actor: commander`, `judged`): whether it
 * fits what she is doing (her activity's `pairTags` are among its `fits`, or it fits `any`; no `fits` fits nothing) and whether it is felt as she wishes (no `presence` stated, or the one she
 * wishes). `null` when the commander is not doing a judged service. Read from the blocking, never from the model.
 */
export function pairOf(state: CampaignState, reg: Registries, holderId: string): { fit: boolean; felt: boolean } | null {
  const blocking = state.scene?.blocking;
  const mine = blocking?.[COMMANDER]?.activity === undefined ? undefined : (reg.blockingActivities.get(blocking[COMMANDER].activity!) as ActivityRow | undefined);
  if (mine === undefined || mine.scope !== 'dynamic' || mine.actor !== 'commander' || mine.judged !== true) return null;
  const hers = (blocking?.[holderId]?.activity === undefined ? reg.blockingActivities.get(defaultActivity(reg) ?? '') : reg.blockingActivities.get(blocking[holderId].activity!)) as ActivityRow | undefined;
  const tags = hers?.pairTags ?? [];
  const fits = mine.fits ?? [];
  return { fit: fits.includes('any') || tags.some((t) => fits.includes(t)), felt: mine.presence === undefined || mine.presence === wishedPresence(state, reg, holderId) };
}

/** What she has seen of the service in the open scene (created for it; another scene's record is replaced). */
function sceneService(draft: CampaignState, holderId: string): SceneService {
  const p = ensurePractices(draft);
  p.service ??= {};
  const rec = p.service[holderId];
  return rec !== undefined && rec.sceneId === draft.scene?.id ? rec : (p.service[holderId] = { sceneId: draft.scene?.id ?? '', bonus: 0 });
}

const stepUp = (v: Verdict, steps: number): Verdict => VERDICTS[Math.max(0, VERDICTS.indexOf(v) - steps)];

/**
 * Her verdict on the service of the scene she is in (or the one named): the engine's from the pair that ran (`pleased` when it fits and is felt as she wishes, `adequate` when one of the two,
 * `displeased` when neither), else the model's reported word; anticipation takes it up by its bonus. `null` when nothing was seen. Reads only.
 */
export function verdictOf(state: CampaignState, _reg: Registries, holderId: string, sceneId?: string): Verdict | null {
  const rec = state.practices?.service?.[holderId];
  return rec === undefined || (sceneId !== undefined && rec.sceneId !== sceneId) ? null : verdictOfRecord(rec);
}

/** The verdict a record of the scene stands for. */
function verdictOfRecord(rec: SceneService): Verdict | null {
  const word: Verdict | null = rec.pair !== undefined ? (rec.pair.fit && rec.pair.felt ? 'pleased' : rec.pair.fit || rec.pair.felt ? 'adequate' : 'displeased') : (rec.said ?? null);
  return word === null ? null : stepUp(word, rec.bonus);
}

/**
 * A verdict lands (R10): the relation event `service_rated` (its `kind` is the verdict: P15's feed gives hold for `pleased`, and the journal line is the row's), her favour by the verdict, and for `pleased` at high
 * favour (from `highFavour` after it) Regard. One a scene, marked on `verdictScene`. Returns the engine event `service_rated` (the controller sets her next reply's directive from it) and what landed.
 */
export function rateService(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, verdict: Verdict, via: 'engine' | 'model', sceneId: string): EngineEvent[] {
  const reg = ctx.registries;
  const p = ensurePractices(draft);
  if (p.verdictScene?.[holderId] === sceneId || !practiceLive(draft, reg, holderId)) return [];
  (p.verdictScene ??= {})[holderId] = sceneId;
  const events: EngineEvent[] = [{ type: 'service_rated', unitId: holderId, holderId, kind: verdict, via }];
  events.push(...applyEventToUnit(draft, reg, holderId, { type: 'service_rated', actor: 'commander', targets: [holderId], severity: 'minor', evidence: 'her verdict on the service', confidence: 1, kind: verdict } as EventIntent));
  events.push(...evaluateAutomatic(draft, reg, holderId));
  addFavour(draft, holderId, TUNING.practice.verdict.favour[verdict]);
  if (verdict === 'pleased' && (dynamicOf(draft, holderId)?.favour ?? 0) >= TUNING.practice.verdict.highFavour) events.push(...regardRise(draft, reg, holderId, 'pleased_high'));
  return events;
}

/**
 * What the model reported about her verdict (`service_rated { kind }`, offered only for a scene with a service in it): held until the scene ends, and only if no judged pair ran by then (the engine's
 * verdict wins); the last word of the scene stands. Nothing lands now. Nothing without an open scene she is in.
 */
export function noteSaid(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, ev: Pick<EventIntent, 'kind'>): EngineEvent[] {
  const verdict = (VERDICTS as readonly unknown[]).includes(ev.kind) ? (ev.kind as Verdict) : undefined;
  if (verdict === undefined || draft.scene?.participants.includes(holderId) !== true || !practiceLive(draft, ctx.registries, holderId)) return [];
  sceneService(draft, holderId).said = verdict;
  return [];
}

/** Is there an open task of hers that asks for service (so what the commander does for her is asked, not anticipated)? Read by the category the task carries, never by its words. */
export const asksForService = (state: CampaignState, holderId: string): boolean =>
  (state.practices?.tasks ?? []).some((t) => t.holderId === holderId && t.kind === 'task' && t.routine !== true && t.status === 'open' && t.tags.includes(TUNING.offer.serviceCategory));

/**
 * Anticipation (R.5): the commander's judged service that fits what she is doing and that no open task of hers asks for. Favour +`anticipation.favour`, Regard +`anticipation.regard`, a `yielded`
 * sample of her reading with motive `her`, the scene's verdict one step up, and `practice_anticipated`. Once a scene a holder.
 */
function anticipate(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, rec: SceneService): EngineEvent[] {
  const reg = ctx.registries;
  rec.anticipated = true;
  rec.bonus += 1;
  addFavour(draft, holderId, TUNING.practice.anticipation.favour);
  return [{ type: 'practice_anticipated', unitId: holderId, holderId }, ...regardRise(draft, reg, holderId, 'value', TUNING.practice.anticipation.regard), ...practiceSample(draft, reg, holderId, 'yielded', { motive: 'her' })];
}

/**
 * The after-action of her verdicts (registered by `actions/practice.ts`): an activity set in the scene (hers or the commander's) records the pair that runs; a service the commander takes up that fits,
 * with nobody asking, is anticipated; the scene's end lands the verdict once (`rateService`) for each holder who saw service in it; an aborted scene rates nothing. Nothing for a holder who is not live.
 */
export function serviceFromEvents(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type === 'blocking_changed' && e.field === 'activity' && draft.scene !== undefined) {
      for (const holderId of draft.scene.participants) {
        if (!practiceLive(draft, reg, holderId)) continue;
        const pair = pairOf(draft, reg, holderId);
        if (pair === null) continue;
        const rec = sceneService(draft, holderId);
        rec.pair = pair;
        if (e.person === COMMANDER && pair.fit && rec.anticipated !== true && !asksForService(draft, holderId)) out.push(...anticipate(draft, ctx, holderId, rec));
      }
    } else if (e.type === 'scene_ended' || e.type === 'scene_aborted') {
      const service = draft.practices?.service;
      if (service === undefined) continue;
      for (const [holderId, rec] of Object.entries(service)) {
        if (rec.sceneId !== e.sceneId) continue;
        delete service[holderId];
        const verdict = e.type === 'scene_ended' ? verdictOfRecord(rec) : null;
        if (verdict !== null) out.push(...rateService(draft, ctx, holderId, verdict, rec.pair !== undefined ? 'engine' : 'model', rec.sceneId));
      }
      if (Object.keys(service).length === 0) delete draft.practices!.service;
    }
  }
  return out;
}

/**
 * A moment of a holder's was answered (P15a's `moment_answered`): her favour moves by the gap between what she expected and what the commander chose (matched +2, partial 0, opposite -3). A moment of anyone who
 * holds nothing moves nothing. Returns no events: favour is hidden.
 */
export function momentGapFavour(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  for (const e of events) {
    if (e.type !== 'moment_answered' || typeof e.unitId !== 'string' || !practiceLive(draft, ctx.registries, e.unitId)) continue;
    const gap = e.gap === 'matched' || e.gap === 'partial' || e.gap === 'opposite' ? e.gap : undefined;
    if (gap !== undefined) addFavour(draft, e.unitId, TUNING.practice.momentGap[gap]);
  }
  return [];
}

/** Her own bookings still ahead that she could give back: not a slot of her hold (a held booking is the hold's, and a hole in it would be one). Soonest first. */
function givableBookings(draft: CampaignState, reg: Registries, holderId: string) {
  return (draft.personal?.bookings ?? [])
    .filter((b) => b.unitId === holderId && b.status === 'booked' && slotIndex(b.day, b.slot) >= slotIndex(draft.day, draft.slot) && reg.bookingKinds.get(b.kindId)?.held !== true)
    .sort((a, b) => slotIndex(a.day, a.slot) - slotIndex(b.day, b.slot));
}

/** What she can do for the commander now, by kind (a kind with nothing to act on is not offered). */
function kindnessesFor(draft: CampaignState, reg: Registries, holderId: string): KindnessKind[] {
  const p = draft.practices;
  const upcoming = givableBookings(draft, reg, holderId).length > 0;
  const standing = protocolRules(draft, reg, holderId).some((r) => r.status === 'active' && r.source !== 'item');
  const gift = pressureGate(draft, reg, holderId, 'token') === null && kindsFor(draft, reg, holderId).length > 0 && draft.personal?.tokens?.given.includes(holderId) !== true; // the token gate and her tier, as her own offer
  const has: Record<KindnessKind, boolean> = { slot_back: upcoming, protocol_relaxed: standing, want_relief: true, gift, softer: p?.softer?.[holderId] !== true };
  return KINDNESS_KINDS.filter((k) => has[k]);
}

/** Does one kindness (R10): the closed list, each acting on something she has; returns the event that tells the controller. */
function doKindness(draft: CampaignState, ctx: EngineCtx, holderId: string, kind: KindnessKind): EngineEvent[] {
  const reg = ctx.registries;
  const p = ensurePractices(draft);
  const base: EngineEvent = { type: 'favour_kindness', unitId: holderId, holderId, kind };
  switch (kind) {
    case 'slot_back': {
      const next = givableBookings(draft, reg, holderId)[0];
      cancelBookingsQuietly(draft, [next.id]);
      const voided: EngineEvent[] = [];
      for (const t of p.tasks) if (t.bookingId === next.id && t.status === 'open') { t.status = 'void'; voided.push({ type: 'task_void', taskId: t.id, holderId, what: 'task', reason: 'gave_back' }); }
      return [base, ...voided];
    }
    case 'protocol_relaxed': {
      const rule = protocolRules(draft, reg, holderId).find((r) => r.status === 'active' && r.source !== 'item')!;
      rule.status = 'suspended';
      (p.relaxed ??= []).push({ ruleId: rule.id, day: draft.day });
      return [base];
    }
    case 'want_relief': return [base, ...relieveWant(draft, holderId, TUNING.practice.kindness.wantRelief, 'kindness')];
    case 'gift': {
      const kinds = kindsFor(draft, reg, holderId); // the kinds her tier allows
      const kindId = String(kinds[Math.min(kinds.length - 1, Math.floor(practiceRoll(draft, holderId, 'kindness:gift') * kinds.length))].id); // named, so the token's own pick draws nothing
      return [base, ...giveToken(draft, ctx, holderId, kindId).events];
    }
    case 'softer': (p.softer ??= {})[holderId] = true; return [base];
  }
}

/**
 * The day step's kindnesses (R7.5, R10): a protocol she relaxed for a day comes back the day after; then each live holder whose favour is at `kindnessAt` or more does one kindness on the day's hashed chance
 * (`practiceRoll(her, 'kindness')`, the kind by `practiceRoll(her, 'kindness:pick')` over what she can do now). `favour_kindness` tells the controller, which writes her DM line. Draws nothing.
 */
export function kindnessSweep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const p = draft.practices;
  if (p?.relaxed !== undefined) {
    p.relaxed = p.relaxed.filter((r) => {
      if (draft.day <= r.day) return true;
      const rule = rulesOf(draft).find((x) => x.id === r.ruleId);
      if (rule?.status === 'suspended' && rule.source !== 'item') rule.status = 'active';
      return false;
    });
    if (p.relaxed.length === 0) delete p.relaxed;
  }
  const events: EngineEvent[] = [];
  for (const holderId of practiceHolders(draft, reg)) {
    if ((dynamicOf(draft, holderId)?.favour ?? 0) < TUNING.practice.kindnessAt || practiceRoll(draft, holderId, 'kindness') >= TUNING.practice.kindness.chance) continue;
    const eligible = kindnessesFor(draft, reg, holderId);
    if (eligible.length === 0) continue;
    events.push(...doKindness(draft, ctx, holderId, eligible[Math.min(eligible.length - 1, Math.floor(practiceRoll(draft, holderId, 'kindness:pick') * eligible.length))]));
  }
  return events;
}
