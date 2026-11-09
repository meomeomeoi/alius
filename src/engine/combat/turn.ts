import { TUNING } from '../tuning';
import { chooseAction } from './ai';
import {
  activePassives, applyEffects, applyStatus, clearRoundLimits, effectiveStat, expireStatuses, fireTrigger, tickStatuses,
  type EffectCtx,
} from './effects';
import { initiativeOrder } from './formulas';
import { repeatLastOrder } from './orders';
import { resolveSkill, usableSkills } from './skills';
import { addStress, applyBreakdownActionEffects, breakdownAction, rollBreaking } from './stress';
import { byCid, expandTargets, hasFlag, isStanding, legalTargets, living } from './targeting';
import type { CombatOutcome, PlannedAction } from './types';

/** `won`/`lost` once a side is out, else null. A loss wins ties (everyone fell, or the commander did). */
export function checkEnd(ctx: EffectCtx): 'won' | 'lost' | null {
  const { cs } = ctx;
  if (living(cs, 'squad').length === 0 || cs.commander?.downed) return 'lost';
  if (living(cs, 'enemy').length === 0) return 'won';
  return null;
}

/** Marks the combat decided; the action layer (Task 14) writes the result back. */
function endCombat(ctx: EffectCtx, outcome: CombatOutcome): void {
  ctx.cs.phase = 'ended';
  ctx.cs.outcome = outcome;
  ctx.cs.awaitingCid = undefined;
}

/** New round: CP +1 after the first (max 5), limits and order marks reset, `onRoundStart`, a fresh timeline. */
export function startRound(ctx: EffectCtx): void {
  const { cs } = ctx;
  cs.round += 1;
  if (cs.round > 1) cs.cp = Math.min(TUNING.combat.cpMax, cs.cp + 1);
  clearRoundLimits(cs);
  cs.ordersThisRound = [];
  fireTrigger(ctx, 'onRoundStart', {});
  cs.timeline = initiativeOrder(cs, ctx.rng, (c) => effectiveStat(ctx, c.cid, 'spd'));
  cs.turn = 0;
  cs.turnStarted = false;
}

function beginTurn(ctx: EffectCtx, cid: string): void {
  const c = byCid(ctx.cs, cid);
  for (const id of Object.keys(c.cooldowns)) c.cooldowns[id] = Math.max(0, c.cooldowns[id] - 1);
  tickStatuses(ctx, cid);
  if (isStanding(c)) fireTrigger(ctx, 'onTurnStart', { actorCid: cid });
  ctx.cs.turnStarted = true;
}

function finishTurn(ctx: EffectCtx, cid: string): void {
  const { cs } = ctx;
  expireStatuses(ctx, cid);
  cs.turn += 1;
  cs.turnStarted = false;
  cs.inExtra = false;
  cs.extraAction = undefined;
}

export interface ActOpts {
  /** Breakdown actions may target allies and ignore targeting rules. */
  trusted?: boolean;
}

/**
 * Performs one action for `cid`. Throws (and so changes nothing) when it is illegal: unknown or passive skill, on
 * cooldown, unaffordable, no legal target. A `trusted` action (a breakdown) may hit allies.
 */
export function performAction(ctx: EffectCtx, cid: string, action: PlannedAction, opts: ActOpts = {}): void {
  const { cs, reg } = ctx;
  const c = byCid(cs, cid);
  if (!isStanding(c)) throw new Error('A downed unit cannot act.');

  // a risk-seeker may act aggressively instead of as ordered (reward_loop)
  if (c.side === 'squad' && !opts.trusted && action.kind !== 'pass') {
    const flip = activePassives(ctx, cid, 'override_action').find((e) => e.chance !== undefined && ctx.rng.chance(e.chance));
    if (flip) action = chooseAction(ctx, cid);
  }

  if (action.kind === 'pass') {
    ctx.log({ kind: 'pass', actor: cid });
    return;
  }
  if (action.kind === 'guard') {
    applyStatus(ctx, cid, 'guard', 2, 1, cid);
    ctx.log({ kind: 'pass', actor: cid });
    return;
  }
  if (action.kind === 'swap') {
    if (hasFlag(c, reg, 'rooted')) throw new Error('She cannot leave her row.');
    applyEffects(ctx, cid, [{ type: 'move', to: 'swap', target: 'self' }], {}, 'swap');
    return;
  }

  const id = action.skillId;
  const skill = id ? resolveSkill(reg, c, id) : undefined;
  if (!id || !skill || !c.skills.includes(id) || skill.kind === 'passive') throw new Error(`Unknown skill "${String(id)}".`);
  if ((c.cooldowns[id] ?? 0) > 0) throw new Error(`${skill.name} is on cooldown (${c.cooldowns[id]}).`);
  const authorized = c.statuses.some((s) => s.id === 'authorized');
  const cpCost = c.side === 'squad' && !opts.trusted ? (skill.cp ?? 0) : 0;
  if (cpCost > 0 && !authorized && cs.cp < cpCost) throw new Error(`${skill.name} needs ${cpCost} CP.`);

  let targets: string[];
  const t = skill.targets!;
  if (opts.trusted && action.targetCid && byCid(cs, action.targetCid)) {
    targets = [action.targetCid];
  } else if (t.side === 'self' || t.count === 'all') {
    targets = expandTargets(cs, cid, skill, action.targetCid, reg);
    if (targets.length === 0) throw new Error(`${skill.name} has no legal target.`);
  } else {
    if (!action.targetCid || !legalTargets(cs, cid, skill, reg).includes(action.targetCid)) throw new Error(`Illegal target for ${skill.name}.`);
    targets = expandTargets(cs, cid, skill, action.targetCid, reg);
  }

  if (cpCost > 0) {
    if (authorized) c.statuses = c.statuses.filter((s) => s.id !== 'authorized');
    else cs.cp -= cpCost;
  }
  if (skill.stressCost) addStress(ctx, cid, skill.stressCost, 'self');
  c.cooldowns[id] = (skill.cooldown ?? 0) > 0 ? skill.cooldown! + 1 : 0;
  ctx.log({ kind: 'skill', actor: cid, skillId: id, ...(action.targetCid ? { target: action.targetCid } : {}) });
  if (skill.kind === 'ultimate') ctx.emit({ type: 'combat_cutin', kind: 'ultimate', unitId: c.unitId, cid, text: skill.name });
  fireTrigger(ctx, 'onAction', { actorCid: cid, targetCid: action.targetCid, skillId: id });

  const misfire = activePassives(ctx, cid, 'misfire').some((e) => e.chance !== undefined && ctx.rng.chance(e.chance));
  if (misfire) ctx.log({ kind: 'miss', actor: cid, skillId: id });
  else {
    applyEffects(ctx, cid, skill.effects as never, { targets, targetCid: action.targetCid ?? targets[0], skillId: id }, id);
    if (cs.repeatOrder) repeatLastOrder(ctx);
  }

  c.lastSkillId = id;
  c.lastTargetCid = action.targetCid;
  c.lastRow = c.row;
}

/** Whether the squad unit has a skill to choose; without one the turn passes by itself. */
const hasChoice = (ctx: EffectCtx, cid: string): boolean => usableSkills(ctx, cid).length > 0;

type Decision = { action: PlannedAction; trusted: boolean; broken: boolean } | 'await';

function decide(ctx: EffectCtx, cid: string): Decision {
  const { cs } = ctx;
  const c = byCid(cs, cid);
  if (c.side === 'enemy') return { action: chooseAction(ctx, cid), trusted: false, broken: false };
  if (c.breakdown) {
    const a = breakdownAction(ctx, cid);
    if (a) return { action: a, trusted: true, broken: true };
  } else if (rollBreaking(ctx, cid)) {
    const a = breakdownAction(ctx, cid, { breaking: true });
    if (a) return { action: a, trusted: true, broken: true };
  }
  if (cs.auto) return { action: chooseAction(ctx, cid), trusted: false, broken: false };
  if (!hasChoice(ctx, cid)) return { action: { kind: 'pass' }, trusted: false, broken: false };
  return 'await';
}

/** After an action: end the combat if it is decided, else close the turn unless an extra action is pending. */
export function completeAction(ctx: EffectCtx, cid: string, broken = false): void {
  const { cs } = ctx;
  if (broken) applyBreakdownActionEffects(ctx, cid);
  cs.awaitingCid = undefined;
  const end = checkEnd(ctx);
  if (end) return endCombat(ctx, end);
  if (cs.extraAction === cid && !cs.inExtra) return; // the loop picks the extra action up
  finishTurn(ctx, cid);
}

/**
 * Runs turns until a squad unit has to choose (phase stays `awaiting`, `awaitingCid` names her) or the combat is
 * decided (`phase: 'ended'`). The round cap ends a stalemate as `retreated`.
 */
export function runUntilInput(ctx: EffectCtx): void {
  const { cs } = ctx;
  for (let guard = 0; guard < 20000; guard++) {
    if (cs.phase !== 'awaiting') return;
    const end = checkEnd(ctx);
    if (end) return endCombat(ctx, end);

    let cid: string;
    if (cs.awaitingCid) {
      cid = cs.awaitingCid;
    } else if (cs.extraAction && isStanding(byCid(cs, cs.extraAction))) {
      cid = cs.extraAction;
      cs.extraAction = undefined;
      cs.inExtra = true;
    } else {
      cs.extraAction = undefined;
      if (!cs.turnStarted) {
        while (cs.turn < cs.timeline.length && !isStanding(byCid(cs, cs.timeline[cs.turn]))) cs.turn += 1;
        if (cs.turn >= cs.timeline.length) {
          if (cs.round >= TUNING.combat.maxRounds) return endCombat(ctx, 'retreated');
          startRound(ctx);
          continue;
        }
      }
      cid = cs.timeline[cs.turn];
      if (!cs.turnStarted) {
        beginTurn(ctx, cid);
        const actor = byCid(cs, cid);
        if (!isStanding(actor)) {
          finishTurn(ctx, cid);
          continue;
        }
        if (hasFlag(actor, ctx.reg, 'skipTurn')) {
          ctx.log({ kind: 'pass', actor: cid });
          if (checkEnd(ctx)) continue;
          finishTurn(ctx, cid);
          continue;
        }
      }
      cs.inExtra = false;
    }

    const d = decide(ctx, cid);
    if (d === 'await') {
      cs.awaitingCid = cid;
      return;
    }
    try {
      performAction(ctx, cid, d.action, { trusted: d.trusted });
    } catch {
      // an AI or breakdown action that turned out illegal never stalls the combat: the unit passes
      ctx.log({ kind: 'pass', actor: cid });
    }
    completeAction(ctx, cid, d.broken);
  }
  throw new Error('The combat did not settle.');
}
