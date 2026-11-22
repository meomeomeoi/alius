/**
 * Service (P16, plan R10, spec §6): the protocol she sets (a P9d rule of a `service` template, worded by her), the routine that costs no slot, and the commander's confession.
 * Task 22 adds her verdict, favour, kindnesses and anticipation to this file. The engine owns every number; the model only words the rule. Nothing here draws: the pick of the
 * template is `practiceRoll`.
 */
import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { tagsOf } from '../bonds/content';
import { canProposeRule, deliverRule, proposeRuleHashed, rulesOf, type RuleTemplate } from '../bonds/rules';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { hasCapability } from '../dynamic/capabilities';
import { practiceOf } from '../dynamic/profile';
import { addTrackXp } from '../dynamic/tracks';
import type { CampaignState, Rule } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, nextPracticeId, practiceHolders, practiceLive } from './gate';
import { noteOffence } from './offences';
import { practiceRoll, type Task } from './state';
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
