import type { Registries } from '../../content/types';
import { removeFromService } from '../leash/use';
import { addChronicle } from '../memory';
import type { DilemmaOption } from '../dilemma/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { socialRank } from '../social';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addClock, advanceClock } from '../world/clocks';
import { currentBeat } from '../world/spine';
import { commanderDies } from './death';
import { allies, intrigueBusy, intrigueDiscovered, kompromatOf } from './intrigue';
import { applyRemotePunishment, painBurstId, pickPunishment } from './punish';
import { corporateWardenPick, seedWarden } from './select';
import { leashswapOf, wardenOf, type Expectation, type WardenGoneHow } from './state';
import type { EventIntent } from '../relations/intents';
import { valuesOf } from '../development/profile';

/**
 * Getting rid of her (P13 §5): the three routes (hack, report, her death), what any removal sets off (an investigation clock, remote
 * control, the squad's reactions), the report to oversight, remote control and the verdict that closes the investigation.
 */

export const INVESTIGATION_CLOCK = 'investigation';
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const fill = (text: string, vars: Record<string, string>): string => Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), text);
type Axes = NonNullable<EventIntent['valueAxes']>;

/** The reading each unit gives the removal, by what she values (the call site's, not the model's). */
function reactionAxes(draft: CampaignState, wardenId: string, route: 'hack' | 'report' | 'death'): Axes {
  const her = draft.squad.find((u) => u.id === wardenId);
  // liberation: autonomy and anti-corporate units gain; by the book (a report) the corporate reading flips
  const axes: Axes = [{ axis: 'autonomy', direction: 1 }, { axis: 'corporate', direction: route === 'report' ? 1 : -1 }];
  // she was close to the squad: the units who hold to mercy and the group read it as murder or betrayal
  if ((her ? valuesOf(her).ingroup : 0) >= 1) axes.push({ axis: 'mercy', direction: -1 }, { axis: 'ingroup', direction: -1 });
  return axes;
}

/**
 * Any removal of the warden (once): she is out of the mode block, the status is `investigation`, a visible world clock opens (10 / 6 / 4
 * segments for hack / report / death), oversight runs the controller (`remote`), and every named living unit reacts by her values with a
 * moderate `warden_removed_by`. An open report case, a queued one and the hack's progress go with her. Draws nothing. A second call
 * (death after a status change, a hack after a report) does nothing.
 */
export function startRemoval(draft: CampaignState, ctx: EngineCtx, route: 'hack' | 'report' | 'death'): EngineEvent[] {
  const ls = leashswapOf(draft);
  const w = ls?.warden;
  if (!ls || !w || ls.status !== 'held' || ls.removal) return [];
  const reg = ctx.registries;
  const former = w.unitId;
  delete ls.warden; // her open override goes with her
  ls.status = 'investigation';
  ls.removal = { route, day: draft.day, clockId: INVESTIGATION_CLOCK, unitId: former };
  ls.remote = { sinceDay: draft.day };
  ls.intrigue.hack.step = 0;
  delete ls.intrigue.reportQueued;
  if (draft.dilemmas?.open?.context === 'warden_report') delete draft.dilemmas.open;
  const segments = TUNING.warden.removal.clock[route];
  // not visible on the map or in the scene context (its length would give the route away): the panel shows a band; the engine alone moves it
  addClock(draft, { id: INVESTIGATION_CLOCK, label: 'INVESTIGATION', segments, filled: 0, visibleToPlayer: false, engine: true });
  if (route === 'report' && !draft.world.flags.includes('warden_reassigned')) draft.world.flags.push('warden_reassigned');
  const events: EngineEvent[] = [
    { type: 'warden_removed', unitId: former, route },
    { type: 'investigation_opened', route, segments },
    { type: 'remote_control_started' },
  ];
  const axes = reactionAxes(draft, former, route);
  const reactors = draft.squad.filter((u) => u.id !== former && u.kind === 'named' && isLiving(u));
  for (const u of reactors) {
    events.push(...applyEventToUnit(draft, reg, u.id, { type: 'warden_removed_by', actor: 'commander', targets: [u.id], severity: 'moderate', evidence: 'the warden was removed', valueAxes: axes, confidence: 1 }));
  }
  for (const u of reactors) events.push(...evaluateAutomatic(draft, reg, u.id));
  return events;
}

/**
 * The warden left the service (dead, deserted or terminated): the death route opens, once. `reassigned` is the report's own
 * (`wardenReportChoice` opens that route), so it does nothing here. Called from `removeFromService` and `finalizeCombat`.
 */
export function wardenGone(draft: CampaignState, ctx: EngineCtx, how: WardenGoneHow): EngineEvent[] {
  if (how === 'reassigned') return [];
  return startRemoval(draft, ctx, 'death');
}

// ---------------------------------------------------------------------------------------------
// The report to oversight

/** `clamp(0.4 + 0.1 × (kompromat − 3) + 0.05 × (Cunning − 1), 0.1, 0.85)`: the chance that oversight takes the report. */
export function reportChance(state: CampaignState, _reg: Registries): number {
  const R = TUNING.warden.verdict.report;
  return clamp(R.base + R.perKompromat * (kompromatOf(state).length - TUNING.warden.kompromat.needed) + R.perCunning * (socialRank(state, 'cunning') - 1), R.min, R.max);
}

const REPORT_CONTEXT = 'warden_report';

function presentReport(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const template = [...ctx.registries.dilemmaTemplates.values()].find((t) => (t.contexts as string[]).includes(REPORT_CONTEXT) && t.fixed !== undefined);
  const fixed = template?.fixed as { title: string; setup: string; options: Array<Record<string, unknown>> } | undefined;
  const w = wardenOf(draft);
  if (!template || !fixed || !w) return [];
  const vars = { name: draft.squad.find((u) => u.id === w.unitId)?.displayName ?? 'She' };
  const d = (draft.dilemmas ??= { seq: 0 });
  d.seq += 1;
  d.open = {
    id: `dl${d.seq}`, templateId: String(template.id), scale: template.scale as 'major' | 'defining', context: REPORT_CONTEXT, day: draft.day, status: 'presented', attempts: 0,
    units: [], beatId: currentBeat(draft, ctx.registries)?.id ?? 'open', source: 'fallback',
    title: fill(fixed.title, vars), setup: fill(fixed.setup, vars),
    options: (fixed.options as unknown as DilemmaOption[]).map((o) => ({ ...structuredClone(o), label: fill(o.label, vars), magnitudes: [] })),
    subjectId: w.unitId,
  };
  return [{ type: 'dilemma_presented', id: d.open.id, templateId: String(template.id), title: d.open.title, source: 'fallback' }];
}

/** Why the report cannot be filed now, or null: nobody holds the leash, a scene or a run is open, or there is not enough kompromat. */
export function reportProblem(state: CampaignState, _reg: Registries): string | null {
  const busy = intrigueBusy(state);
  if (busy) return busy;
  const need = TUNING.warden.kompromat.needed;
  const have = kompromatOf(state).length;
  if (have < need) return `Oversight needs ${need} pieces of kompromat (the commander has ${have}).`;
  if (state.leashswap?.intrigue.reportQueued === true || state.dilemmas?.open?.context === REPORT_CONTEXT) return 'The report is already filed.';
  return null;
}

/**
 * The commander files the report (no slot): the fixed `defining` dilemma `warden_report`. It waits in the queue while another decision is open
 * and opens at a later day end. Throws with `reportProblem`.
 */
export function openReportCase(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const problem = reportProblem(draft, ctx.registries);
  if (problem) throw new Error(problem);
  if (draft.dilemmas?.open) {
    draft.leashswap!.intrigue.reportQueued = true;
    return [{ type: 'report_queued' }];
  }
  return presentReport(draft, ctx);
}

/** Day end: a queued report opens once nothing else waits; one whose warden is gone is dropped. */
export function openQueuedReport(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const ls = leashswapOf(draft);
  if (!ls || ls.intrigue.reportQueued !== true) return [];
  if (!wardenOf(draft)) {
    delete ls.intrigue.reportQueued;
    return [];
  }
  if (draft.dilemmas?.open) return [];
  delete ls.intrigue.reportQueued;
  return presentReport(draft, ctx);
}

/**
 * What the answer to the report does beyond its authored effects, read by the dilemma's context and the option's id. `submit`: one draw at
 * `reportChance`; a hit reassigns her (status `reassigned`) and opens the report route, a miss is a discovery. `withdraw`: nothing.
 */
export function wardenReportChoice(draft: CampaignState, ctx: EngineCtx, context: string, optionId: string | undefined): EngineEvent[] {
  if (context !== REPORT_CONTEXT || optionId !== 'submit') return [];
  const w = wardenOf(draft);
  if (!w) return [];
  if (!ctx.rng.chance(reportChance(draft, ctx.registries))) return intrigueDiscovered(draft, ctx, 'report_refused');
  const events = removeFromService(draft, w.unitId, 'reassigned', ctx);
  return [...events, ...startRemoval(draft, ctx, 'report')];
}

// ---------------------------------------------------------------------------------------------
// The investigation: remote control and the verdict

/** The fixed expectations of remote control (quota 0.6, obedience 0.4), all known: oversight states them. Empty outside remote control. */
export function remoteExpectations(state: CampaignState): Expectation[] {
  if (!state.leashswap?.remote) return [];
  const R = TUNING.warden.remote;
  return [
    { id: 'remote_quota', kind: 'meet_quota', weight: R.quota, source: 'corporate', known: true },
    { id: 'remote_obey', kind: 'obey_oversight', weight: R.obey, source: 'corporate', known: true },
  ];
}

/**
 * Remote control's automatic punishments, once a day at the day end (draws nothing): a mission failed in the day that is ending costs a
 * pain burst, and a quota span of 7 days (counted from the start of remote control) that closes with no mission completed costs a
 * reprimand. There is no one to defy, so defiance never moves, and no override and no negotiation exist (nobody holds the leash).
 */
export function remoteDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const ls = leashswapOf(draft);
  if (!ls?.remote || wardenOf(draft)) return [];
  const R = TUNING.warden.remote;
  const events: EngineEvent[] = [];
  const done = draft.missions.completed;
  if (done.some((m) => m.status === 'failed' && m.outcomeDay === draft.day)) {
    const id = painBurstId(draft, ctx.registries);
    if (id !== undefined) events.push(...applyRemotePunishment(draft, ctx, id));
  }
  const since = draft.day - ls.remote.sinceDay;
  if (since > 0 && since % R.missionDays === 0 && !done.some((m) => m.status === 'completed' && m.outcomeDay !== undefined && m.outcomeDay > draft.day - R.missionDays && m.outcomeDay <= draft.day)) {
    const id = pickPunishment(draft, ctx.registries, 1);
    if (id !== null) events.push(...applyRemotePunishment(draft, ctx, id));
  }
  return events;
}

/**
 * `clamp(base + 0.05 × (Cunning − 1) − 0.15 × (discovered ? 1 : 0) + 0.05 × allies, 0.1, 0.9)` with `base` 0.6 / 0.75 / 0.4 for hack / report /
 * death: the chance that the investigation clears the commander. Never shown (a reading says only `An unseen threat`).
 */
export function verdictChance(state: CampaignState, _reg: Registries): number {
  const ls = leashswapOf(state);
  const V = TUNING.warden.verdict;
  const route = ls?.removal?.route ?? 'death';
  const discovered = (ls?.intrigue.discovered ?? 0) > 0 ? 1 : 0;
  return clamp(V.base[route] + V.perCunning * (socialRank(state, 'cunning') - 1) - V.discovered * discovered + V.perAlly * allies(state).length, V.min, V.max);
}

/**
 * The investigation ends (the clock is full): one draw at `verdictChance`. Cleared: status `free`, remote control ends, flag
 * `commander_watched`, no warden and no co-sign from now on. Convicted: flag `commander_convicted`, and a new warden by the corporate
 * ordering (satisfaction 40, the fallback agenda), without the one who was removed; nobody eligible means an execution, which ends the
 * campaign under either death rule. The clock and the removal are closed either way.
 */
export function rollVerdict(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const ls = leashswapOf(draft);
  if (!ls || ls.status !== 'investigation') return [];
  const cleared = ctx.rng.chance(verdictChance(draft, ctx.registries));
  const former = ls.removal?.unitId;
  delete ls.removal;
  delete ls.remote;
  draft.world.clocks = draft.world.clocks.filter((c) => c.id !== INVESTIGATION_CLOCK);
  ls.intrigue.suspicion = 0;
  ls.intrigue.hack.step = 0;
  ls.intrigue.discovered = 0; // it counted against this investigation only
  const events: EngineEvent[] = [{ type: 'verdict', outcome: cleared ? 'cleared' : 'convicted' }];
  if (cleared) {
    ls.status = 'free';
    if (!draft.commander.flags.includes('commander_watched')) draft.commander.flags.push('commander_watched');
    return events;
  }
  if (!draft.commander.flags.includes('commander_convicted')) draft.commander.flags.push('commander_convicted');
  const next = corporateWardenPick(draft, ctx.registries, former !== undefined ? [former] : [], { anyLiving: true });
  if (next === null) {
    addChronicle(draft, { kind: 'day', day: draft.day, text: `Day ${draft.day}: oversight convicted the commander, and there was no one left to hold the Leash.`, audience: '*' });
    return [...events, ...commanderDies(draft, ctx, 'executed')];
  }
  return [...events, ...seedWarden(draft, ctx, { unitId: next, assignedBy: 'oversight' })];
}

/**
 * The investigation's day step: remote control's punishments, then the clock moves a segment (the world clock `investigation`), and the day
 * it fills the verdict rolls, once. Nothing outside the investigation.
 */
export function investigationDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const ls = leashswapOf(draft);
  if (!ls || ls.status !== 'investigation') return [];
  const events = remoteDayStep(draft, ctx);
  const id = ls.removal?.clockId ?? INVESTIGATION_CLOCK;
  events.push(...advanceClock(draft, ctx, id, TUNING.warden.removal.perDay, 'investigation'));
  const clock = draft.world.clocks.find((c) => c.id === id);
  if (!clock || clock.filled >= clock.segments) events.push(...rollVerdict(draft, ctx));
  return events;
}
