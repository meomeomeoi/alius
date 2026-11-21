/**
 * Aftermaths (P15, plan R15, spec §9, §16.6): what follows when the commander leaves a dynamic, as data. The `aftermaths` registry holds nine rows
 * (`kind`, `weights`, `stages`); this module reads them by `kind` and by the `type` of their effects, never by id. `aftermathWeights` says how likely
 * each is for her (her style pair, her values, the frame she held, a vow, the Regard band, what she holds over the commander, how she was left);
 * the pick draws once. A stage runs its effects once, on the day it begins; the day step moves from stage to stage and ends the aftermath at the
 * end of the last (`aftermath_ended { reason: 'time' }`), or chains to the next kind its row names (one more draw). `command_kept` is forced while
 * she still holds the command (no draw).
 *
 * Two readers are not here yet and answer "none" until their chunks register them: the Regard band (`registerRegardBand`) and the compromat she
 * holds (`registerCompromatCount`). Until then no Regard multiplier applies and `blackmail` cannot be picked.
 */
import type { Registries } from '../../content/types';
import { raiseWant } from '../bonds/want';
import { WANT_VISIT_KIND } from '../bonds/scene';
import { proposeRuleHashed } from '../bonds/rules';
import { openDemand } from '../discipline/demands';
import { addRecord, applyDisciplineEvent } from '../discipline/record';
import { restrictionReason } from '../discipline/restrictions';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { pushMessage } from '../dms';
import { frameRank } from '../blocking/state';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import { queueNightSpec } from '../night';
import { book, bookingKindsFor } from '../personal/bookings';
import { pressureGate } from '../personal/gates';
import { applyRelationDelta } from '../relationGain';
import type { CampaignState, Slot, Vote } from '../state/types';
import { TUNING } from '../tuning';
import { effectiveValues } from '../worldOptions/stances';
import { domainEntry, dropVoidOverride, hasCapability, standing } from './capabilities';
import { loseDomain } from './domains';
import { canHold, dynamicOn } from './gate';
import { addHold, bandMinAt } from './hold';
import { applyMilestone, nextFreeEvening, rekindleMilestone } from './milestones';
import { hashedCtx } from './reactions';
import { dynamicOf, type DynamicRelation } from './state';
import { commandStruggleOf } from './struggle';
export { commandStruggleOf };
import { AFTERMATH_KINDS, type AftermathEffect, type AftermathEntry, type AftermathKind, type ExitRoute } from './types';
import { dynamicRoll } from './witness';
import type { AftermathRequest } from './exit';

type Ctx = Pick<EngineCtx, 'registries' | 'rng'>;
export type AftermathEndReason = 'time' | 'resolved' | 'refused' | 'returned' | 'gone';

// ---------------------------------------------------------------------------------------------
// The two readers that are not built yet

type BandReader = (state: CampaignState, reg: Registries, unitId: string) => string | null;
type CompromatReader = (state: CampaignState, holderId: string) => number;
let bandReader: BandReader | null = null;
let compromatReader: CompromatReader | null = null;

/** Regard (chunk j) registers how her Regard stands, as the id of a `regardBands` row; until then there is no band. */
export function registerRegardBand(reader: BandReader): void { bandReader = reader; }
/** Compromat (chunk i) registers how much she holds over the commander; until then she holds none, and `blackmail` cannot be picked. */
export function registerCompromatCount(reader: CompromatReader): void { compromatReader = reader; }
/** Tests: forget both readers. */
export function resetAftermathReaders(): void { bandReader = null; compromatReader = null; }

/** The id of the Regard band she stands in, or `null` while Regard does not exist. */
export const regardBandOf = (state: CampaignState, reg: Registries, unitId: string): string | null => bandReader?.(state, reg, unitId) ?? null;
/** How many pieces of compromat of the commander she holds (0 while compromat does not exist). */
export const compromatCount = (state: CampaignState, holderId: string): number => compromatReader?.(state, holderId) ?? 0;

// ---------------------------------------------------------------------------------------------
// The rows and the weights

const rowsOf = (reg: Registries): AftermathEntry[] => [...reg.aftermaths.values()] as unknown as AftermathEntry[];
/** The row of a kind (read by `kind`, never by id). */
export const aftermathRowOf = (reg: Registries, kind: AftermathKind): AftermathEntry | undefined => rowsOf(reg).find((r) => r.kind === kind);
const rowOf = aftermathRowOf;

/**
 * How likely each kind is for her, from the registry (R15): the row's `base`, plus the weight of her primary style and half the weight of her
 * secondary, plus each value axis she holds on a side the row names; all of it times the Regard band's multiplier, the frame she held, and the
 * vow. `needsCompromat` is 0 without compromat of hers; a clean exit keeps only the `mild` rows; a forced one multiplies every weight by
 * `forceMult`. While she still holds the command it is forced: `command_kept` alone. A row nobody picks here (`successor`) has base 0. Pure; draws nothing.
 */
export function aftermathWeights(
  state: CampaignState, reg: Registries, unitId: string, ctx: { route: ExitRoute; clean: boolean; force: boolean },
): Record<AftermathKind, number> {
  const dyn = dynamicOf(state, unitId);
  const unit = state.squad.find((u) => u.id === unitId);
  const out = Object.fromEntries(AFTERMATH_KINDS.map((k) => [k, 0])) as Record<AftermathKind, number>;
  if (dyn === undefined || unit === undefined) return out;
  const style = unit.bond?.practice?.style;
  const values = unit.kind === 'named' ? effectiveValues(state, reg, unit) : undefined;
  const band = regardBandOf(state, reg, unitId);
  const holdsCommand = hasCapability(state, reg, unitId, 'countermand');
  const mult = ctx.force ? TUNING.dynamic.aftermath.forceMult : 1;
  for (const row of rowsOf(reg)) {
    const wt = row.weights;
    if (wt.needsCommand === true) {
      if (holdsCommand) out[row.kind] = Math.max(wt.base, 1) * (wt.command ?? 1) * mult;
      continue;
    }
    if (holdsCommand) continue; // the struggle is the whole of it
    if (wt.needsCompromat === true && compromatCount(state, unitId) < 1) continue;
    if (ctx.clean && wt.mild !== true) continue;
    let weight = wt.base;
    if (style !== undefined) {
      weight += wt.styles?.[style.primary] ?? 0;
      if (style.secondary !== undefined) weight += (wt.styles?.[style.secondary] ?? 0) * 0.5;
    }
    for (const [axis, sides] of Object.entries(wt.values ?? {})) {
      const v = (values as Record<string, number> | undefined)?.[axis] ?? 0;
      if (v > 0) weight += sides.high ?? 0;
      else if (v < 0) weight += sides.low ?? 0;
    }
    if (band !== null) weight *= wt.regard?.[band] ?? 1;
    if (dyn.formerHolder !== undefined) {
      weight *= wt.frames?.[dyn.formerHolder.frame] ?? 1;
      if (dyn.formerHolder.sworn) weight *= wt.sworn ?? 1;
    }
    out[row.kind] = weight * mult;
  }
  return out;
}

/** The kind a roll in [0, 1) picks from the weights (registry order), or `null` when none is above 0. */
function pickKind(weights: Record<AftermathKind, number>, roll: number): AftermathKind | null {
  const total = AFTERMATH_KINDS.reduce((n, k) => n + weights[k], 0);
  if (total <= 0) return null;
  let r = roll * total;
  const live = AFTERMATH_KINDS.filter((k) => weights[k] > 0);
  return live.find((k) => (r -= weights[k]) < 0) ?? live[live.length - 1];
}

// ---------------------------------------------------------------------------------------------
// Effects (run once, when the stage begins)

/**
 * One effect of a stage, for her (R15). Each is the engine's own mechanism, with the draws hashed (`dynamicRoll`), never the campaign's rng:
 * `stress` and `want` move her numbers; `night_knock` queues the visit Want makes; `demand` opens a P9 demand of that kind (`desire` is Want's);
 * `booking` books her the next free evening; `rule_interfere` proposes a rule in her name; `rumor` writes a spreading fact; `squad_impunity` raises
 * the Impunity record of everyone who knows of the dynamic; `defiance` is a moderate `defied`; `trust` is a Trust change. `vote_sabotage`
 * is read by the ballots while the stage stands and `threaten_tell` waits for compromat, so neither writes anything here; `return_offer` opens the card
 * `answerReturn` answers, `successor` raises the next unit (`raiseSuccessor`) and `protocol_slips` is read by the intent offer. Nothing for a unit who is not a living named unit. Draws nothing.
 */
export function runAftermathEffect(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'> & Partial<Pick<EngineCtx, 'rng'>>, unitId: string, fx: AftermathEffect): EngineEvent[] {
  const reg = ctx.registries;
  const unit = draft.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit)) return [];
  switch (fx.type) {
    case 'stress': {
      const next = Math.min(100, Math.max(0, unit.stress + fx.amount));
      const delta = next - unit.stress;
      unit.stress = next;
      return delta === 0 ? [] : [{ type: 'stress_changed', unitId, delta }];
    }
    case 'want':
      return raiseWant(draft, unitId, fx.amount, 'aftermath');
    case 'night_knock': {
      const v = TUNING.bonds.want.visit;
      return queueNightSpec(draft, unit, { id: WANT_VISIT_KIND, kind: WANT_VISIT_KIND, chance: 1, priority: TUNING.bonds.want.satisfyPriority, trigger: 'daily', framing: v.framing, ignore: { ...v.ignore }, contentTags: [] } as never);
    }
    case 'demand': {
      const roll = dynamicRoll(draft, unitId, `aftermath:demand:${fx.kind}`);
      return openDemand(draft, hashedCtx(ctx, roll), unitId, fx.kind === 'desire' ? { desire: true } : { only: fx.kind })?.events ?? [];
    }
    case 'booking': {
      if (pressureGate(draft, reg, unitId, 'booking') !== null || restrictionReason(draft, unitId, 'scene') !== null) return [];
      if ((draft.personal?.bookings ?? []).some((b) => b.unitId === unitId && b.status === 'booked')) return [];
      const day = nextFreeEvening(draft);
      const kind = bookingKindsFor(draft, reg, unitId).find((k) => k.slot === 'evening');
      if (day === null || kind === undefined) return [];
      const events = book(draft, ctx, { unitId, kindId: String(kind.id), day, slot: 'evening' as Slot, source: 'aftermath' });
      pushMessage(draft, unitId, { from: unitId, text: String(kind.text).replaceAll('{name}', unit.displayName), day: draft.day, slot: draft.slot, read: false, initiated: true });
      return events;
    }
    case 'rule_interfere':
      return proposeRuleHashed(draft, reg, unitId, dynamicRoll(draft, unitId, 'aftermath:rule'));
    case 'threaten_tell':
      return []; // the threat is made with compromat of hers: chunk (i)
    case 'rumor': {
      const name = unit.displayName;
      addFact(draft, {
        about: [unitId], text: `${name} is telling anyone who will listen what went on between ${name} and the commander.`, tags: ['rumor', 'dynamic', 'aftermath'], importance: 3,
        day: draft.day, knownBy: [unitId], spread: 'fast',
      });
      return [];
    }
    case 'squad_impunity': {
      const events: EngineEvent[] = [];
      for (const [observer, row] of Object.entries(draft.dynamic?.knowledge ?? {})) {
        if (row[unitId]?.level === 'knows_dynamic') events.push(...addRecord(draft, observer, fx.amount, 'dynamic_aftermath'));
      }
      return events;
    }
    case 'vote_sabotage':
      return []; // read by the ballots (`sabotagesVotes`) while the stage stands
    case 'defiance':
      return applyDisciplineEvent(draft, ctx as EngineCtx, unitId, {
        type: 'defied', actor: unitId, targets: [unitId], severity: 'moderate', evidence: 'she turned on the commander after it ended', confidence: 1,
      }, { channel: 'dm' });
    case 'trust': {
      const applied = applyRelationDelta(draft, unitId, 'trust', fx.amount, 'aftermath');
      return applied === 0 ? [] : [{ type: 'relation_changed', unitId, axis: 'trust', delta: applied, applied }];
    }
    case 'return_offer': {
      // she offers to take the commander back: one card at a time, on terms by her manner (`drill`: after a punishment)
      const x = draft.dynamic;
      if (x === undefined || x.open.returnOffer !== undefined) return [];
      x.open.returnOffer = { id: `dr${x.seq++}`, unitId, terms: unit.bond?.practice?.style.primary === 'drill' ? 'after_punishment' : 'lower_band', day: draft.day };
      return [];
    }
    case 'successor':
      return raiseSuccessor(draft, ctx, unitId);
    case 'protocol_slips':
      return []; // read by the intent offer (`slipsOpen`) while the stage stands
  }
}

/** Runs every effect of one stage of her aftermath. */
function enterStage(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'> & Partial<Pick<EngineCtx, 'rng'>>, unitId: string, row: AftermathEntry, stage: number): EngineEvent[] {
  return (row.stages[stage]?.effects ?? []).flatMap((fx) => runAftermathEffect(draft, ctx, unitId, fx));
}

// ---------------------------------------------------------------------------------------------
// Starting and ending

/**
 * Ends her aftermath: it is cleared, and a return offer that was hers goes with it. Returns `aftermath_ended { unitId, id, kind, reason }`. Throws
 * when she has none (a caller that is not sure checks `dyn.aftermath` first).
 */
export function endAftermath(draft: CampaignState, unitId: string, reason: AftermathEndReason): EngineEvent {
  const dyn = dynamicOf(draft, unitId);
  if (dyn?.aftermath === undefined) throw new Error('She has no aftermath to end.');
  const { id, kind } = dyn.aftermath;
  delete dyn.aftermath;
  const x = draft.dynamic;
  if (x?.open.returnOffer?.unitId === unitId) delete x.open.returnOffer;
  return { type: 'aftermath_ended', unitId, id, kind, reason };
}

/**
 * Starts an aftermath of a kind for her: `aftermath { id, kind, stage 0, untilDay, stageUntil }` (the days of her row's stages), `aftermath_started`,
 * and the effects of the first stage. One she already had ends first (`time`). `opts.forced` marks it as the result of a forced exit. Nothing when
 * the registry has no row of the kind or she has no dynamic. Draws nothing.
 */
export function startAftermath(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'> & Partial<Pick<EngineCtx, 'rng'>>, unitId: string, kind: AftermathKind, opts: { forced?: boolean } = {}): EngineEvent[] {
  const row = rowOf(ctx.registries, kind);
  const dyn = dynamicOf(draft, unitId);
  const x = draft.dynamic;
  if (row === undefined || dyn === undefined || x === undefined) return [];
  const events: EngineEvent[] = [];
  if (dyn.aftermath !== undefined) events.push(endAftermath(draft, unitId, 'time'));
  const id = `da${x.seq++}`;
  const total = row.stages.reduce((n, s) => n + s.days, 0);
  dyn.aftermath = { id, kind, stage: 0, untilDay: draft.day + total, stageUntil: draft.day + row.stages[0].days, ...(opts.forced === true ? { forced: true as const } : {}) };
  events.push({ type: 'aftermath_started', unitId, id, kind, ...(opts.forced === true ? { forced: true } : {}) });
  events.push(...enterStage(draft, ctx, unitId, row, 0));
  return events;
}

/**
 * The pick after an exit (called by `exitDynamic`): the weights for how she was left, one draw of the campaign's rng (none when the command
 * forces `command_kept`, or when nothing has weight), and `startAftermath`.
 */
export function startAftermathOnExit(draft: CampaignState, ctx: Ctx, req: AftermathRequest): EngineEvent[] {
  const reg = ctx.registries;
  const weights = aftermathWeights(draft, reg, req.unitId, { route: req.route, clean: req.clean, force: req.force });
  const live = AFTERMATH_KINDS.filter((k) => weights[k] > 0);
  const kind = live.length === 0 ? null : req.commandKept ? 'command_kept' : pickKind(weights, ctx.rng.float());
  return kind === null ? [] : startAftermath(draft, ctx, req.unitId, kind, { forced: req.force });
}

// ---------------------------------------------------------------------------------------------
// The day step

/** Moves one aftermath along: the next stage when its day has come (and its effects), the end at the last. */
function advance(draft: CampaignState, ctx: Ctx, unitId: string, dyn: DynamicRelation, row: AftermathEntry): EngineEvent[] {
  const a = dyn.aftermath!;
  const events: EngineEvent[] = [];
  while (dyn.aftermath === a && a.stageUntil !== undefined && draft.day >= a.stageUntil) {
    if (a.stage + 1 < row.stages.length) {
      a.stage += 1;
      a.stageUntil += row.stages[a.stage].days;
      events.push(...enterStage(draft, ctx, unitId, row, a.stage));
      continue;
    }
    if (row.weights.needsCommand === true && hasCapability(draft, ctx.registries, unitId, 'countermand')) {
      // the struggle for the command has no end of its own: while she holds it, the stage starts over (only a vote, a severe enforcement or the Leash decide it)
      a.stageUntil += row.stages[a.stage].days;
      a.untilDay = a.stageUntil;
      continue;
    }
    events.push(endAftermath(draft, unitId, 'time'));
    events.push(...chain(draft, ctx, unitId, row, a.forced === true));
  }
  return events;
}

/** The kind that follows (`chainsTo`), picked among those whose weights are above 0 with one draw; none, and no draw, when none is. */
function chain(draft: CampaignState, ctx: Ctx, unitId: string, row: AftermathEntry, forced: boolean): EngineEvent[] {
  if (row.chainsTo === undefined) return [];
  const all = aftermathWeights(draft, ctx.registries, unitId, { route: 'abrupt', clean: false, force: forced });
  const weights = Object.fromEntries(AFTERMATH_KINDS.map((k) => [k, row.chainsTo!.includes(k) ? all[k] : 0])) as Record<AftermathKind, number>;
  if (AFTERMATH_KINDS.every((k) => weights[k] <= 0)) return [];
  const next = pickKind(weights, ctx.rng.float());
  return next === null ? [] : startAftermath(draft, ctx, unitId, next, { forced });
}

/**
 * Day end (step 9): every aftermath moves on. A stage whose day has come gives way to the next one (its effects run once); the last ends with
 * `time`, and a kind it chains to starts at once (one draw). An aftermath of a unit who is no longer in service ends with `gone`. Nothing while
 * the dynamic is off. Draws only for a chain.
 */
export function aftermathDayStep(draft: CampaignState, ctx: Ctx): EngineEvent[] {
  const reg = ctx.registries;
  if (!dynamicOn(draft, reg)) return [];
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    const dyn = dynamicOf(draft, unit.id);
    if (dyn?.aftermath === undefined) continue;
    const row = rowOf(reg, dyn.aftermath.kind);
    if (unit.kind !== 'named' || !isLiving(unit) || row === undefined) {
      events.push(endAftermath(draft, unit.id, 'gone'));
      continue;
    }
    events.push(...advance(draft, ctx, unit.id, dyn, row));
  }
  events.push(...successorsDue(draft, ctx));
  return events;
}

// ---------------------------------------------------------------------------------------------
// The struggle for the command (R15a)

/**
 * The commander wins the command back: the domain that grants it is lost (`domain_lost`, with `reason`), her override is void and the aftermath
 * ends `resolved`. Nothing when she has no `command_kept` aftermath.
 */
export function endCommandKept(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, reason: 'contest' | 'force'): EngineEvent[] {
  const dyn = dynamicOf(draft, unitId);
  if (dyn?.aftermath?.kind !== 'command_kept') return [];
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const d of [...dyn.domains]) if (domainEntry(reg, d.id)?.grants.includes('countermand')) events.push(loseDomain(draft, unitId, d.id, reason));
  dropVoidOverride(draft, reg, unitId);
  events.push(endAftermath(draft, unitId, 'resolved'));
  return events;
}

/**
 * A squad vote was opened (called by `openVote`): when the commander's side carried it over her ballot against it, the struggle counts one win; at
 * `commandBackVotes` it is over. A vote that failed, or one she has no ballot in, counts nothing. Draws nothing.
 */
export function countStruggleVote(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, vote: Pick<Vote, 'ballots' | 'passed'>): EngineEvent[] {
  const struggle = commandStruggleOf(draft);
  if (struggle === null || !vote.passed || !vote.ballots.some((b) => b.unitId === struggle.unitId && b.vote === 'against')) return [];
  const a = dynamicOf(draft, struggle.unitId)!.aftermath!;
  a.struggleWins = struggle.wins + 1;
  return a.struggleWins >= TUNING.dynamic.commandBackVotes ? endCommandKept(draft, ctx, struggle.unitId, 'contest') : [];
}

/** An enforcement on her (registered on `enforce`): one of severity 3 or more, a bench, a brig or the Leash, ends the struggle. */
export function commandKeptEnforced(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, e: { severity: number }): EngineEvent[] {
  return e.severity >= 3 ? endCommandKept(draft, ctx, unitId, 'force') : [];
}

// ---------------------------------------------------------------------------------------------
// The squad's reaction: a successor (R15c)

/**
 * The squad reacts to a commander who is unclaimed (not by her weights): the eligible unit (`canHold`) other than the former holder with the highest hold
 * (squad order breaks a tie) gets the hold gain of `successor` and the first place in the probe queue. The former holder's record keeps who it was
 * (`formerHolder.successor`, an empty string when nobody could be) so it happens once. Nothing for a former holder who left the service.
 */
export function raiseSuccessor(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, formerId: string): EngineEvent[] {
  const reg = ctx.registries;
  const former = dynamicOf(draft, formerId);
  const x = draft.dynamic;
  if (former?.formerHolder === undefined || x === undefined) return [];
  const best = draft.squad
    .map((u, order) => ({ u, order }))
    .filter(({ u }) => u.kind === 'named' && isLiving(u) && u.id !== formerId && canHold(draft, reg, u.id) === null)
    .sort((a, b) => (dynamicOf(draft, b.u.id)?.hold ?? 0) - (dynamicOf(draft, a.u.id)?.hold ?? 0) || a.order - b.order)[0]?.u;
  former.formerHolder.successor = best?.id ?? '';
  if (best === undefined) return [];
  const events = addHold(draft, ctx, best.id, TUNING.dynamic.gains.successor, 'successor');
  x.queue = [best.id, ...x.queue.filter((id) => id !== best.id)].slice(0, TUNING.probes.queueMax);
  return events;
}

/** Day end: each former holder the squad has not reacted to yet, who is not in a struggle for the command, and who does not hold again, draws her successor (once). */
function successorsDue(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  if (aftermathRowOf(ctx.registries, 'successor') === undefined) return [];
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    const dyn = unit.kind === 'named' && isLiving(unit) ? dynamicOf(draft, unit.id) : undefined;
    if (dyn?.formerHolder === undefined || dyn.formerHolder.successor !== undefined || dyn.aftermath?.kind === 'command_kept') continue;
    if (frameRank(dyn.frame) >= frameRank('play')) dyn.formerHolder.successor = ''; // she holds again: nobody replaces her
    else events.push(...raiseSuccessor(draft, ctx, unit.id));
  }
  return events;
}

// ---------------------------------------------------------------------------------------------
// The return offer (R15b)

/**
 * The commander answers her return offer (`dynamic/answer_return`): ACCEPT re-kindles it (`rekindle`: the frame is `play` again) with her hold lifted
 * to the band the terms name (`lower_band`: the second band; `after_punishment`: the third, and `refusal_noted` for P16), and the aftermath ends
 * `returned`; REFUSE ends it `refused` (remembered by the pair). Throws, changing nothing, when no offer is open. Draws nothing.
 */
export function answerReturn(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, answer: 'accept' | 'refuse'): EngineEvent[] {
  const reg = ctx.registries;
  const offer = draft.dynamic?.open.returnOffer;
  const unit = offer === undefined ? undefined : draft.squad.find((u) => u.id === offer.unitId);
  const dyn = offer === undefined ? undefined : dynamicOf(draft, offer.unitId);
  if (!dynamicOn(draft, reg) || offer === undefined || unit === undefined || dyn === undefined || !isLiving(unit)) throw new Error('There is no return offer to answer.');
  if (answer !== 'accept' && answer !== 'refuse') throw new Error('The answer must be accept or refuse.');
  delete draft.dynamic!.open.returnOffer;
  const events: EngineEvent[] = [];
  if (answer === 'refuse') {
    if (dyn.aftermath !== undefined) events.push(endAftermath(draft, offer.unitId, 'refused'));
    return events;
  }
  if (dyn.aftermath !== undefined) events.push(endAftermath(draft, offer.unitId, 'returned'));
  const rekindle = rekindleMilestone(reg);
  if (rekindle !== undefined) events.push(...applyMilestone(draft, ctx, offer.unitId, rekindle));
  const to = bandMinAt(reg, TUNING.dynamic.returnBand[offer.terms]);
  if (dyn.hold < to) {
    events.push({ type: 'hold_changed', unitId: offer.unitId, from: dyn.hold, to, cause: 'return' });
    dyn.hold = to;
  }
  dyn.lastPracticeDay = draft.day;
  if (offer.terms === 'after_punishment') events.push({ type: 'refusal_noted', unitId: offer.unitId, what: 'return' });
  return events;
}
