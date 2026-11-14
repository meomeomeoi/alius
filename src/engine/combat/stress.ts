import type { Registries } from '../../content/types';
import { TUNING } from '../tuning';
import { activePassives, applyEffects, applyStatus, fireTrigger, effectiveStat, type EffectCtx } from './effects';
import { dispositionFor, type DispositionLevel } from '../worldOptions';
import { byCid, hasFlag, isStanding, legalTargets, nearest, skillById } from './targeting';
import type { BreakdownPolicy, BreakdownTarget, Combatant, EffectSpec, PlannedAction } from './types';

export type StressBand = 'calm' | 'strained' | 'breaking' | 'breakdown';

export function stressBand(stress: number): StressBand {
  return stress >= 100 ? 'breakdown' : stress >= 80 ? 'breaking' : stress >= 50 ? 'strained' : 'calm';
}

export type StressSource = 'enemy' | 'self' | 'ally' | 'order' | 'system';

/**
 * Changes a squad unit's stress. `stress_taken` passives scale gains (direction `gain`) and relief (`relief`); the
 * value is clamped to 0–100 and locked at 100 while the unit is broken down. Upward crossings of 50, 80 and 100 fire
 * `onStressThreshold`; reaching 100 starts the breakdown. Returns the applied change.
 */
export function addStress(ctx: EffectCtx, cid: string, amount: number, _source: StressSource): number {
  const c = byCid(ctx.cs, cid);
  if (c.side !== 'squad' || c.downed || amount === 0) return 0;
  if (c.breakdown) return 0; // locked at 100 until released
  let delta = amount;
  for (const e of activePassives(ctx, cid, 'stress_taken')) {
    if ((delta > 0 && e.direction === 'gain') || (delta < 0 && e.direction === 'relief')) delta *= Math.max(0, 1 + e.pct / 100);
  }
  delta = Math.round(delta);
  const before = c.stress;
  c.stress = Math.min(100, Math.max(0, before + delta));
  const applied = c.stress - before;
  if (applied !== 0) ctx.log({ kind: 'stress', target: cid, amount: applied });
  for (const t of [50, 80, 100] as const) {
    if (before < t && c.stress >= t) fireTrigger(ctx, 'onStressThreshold', { actorCid: cid, threshold: t });
  }
  if (c.stress >= 100 && !c.breakdown) enterBreakdown(ctx, cid);
  return applied;
}

// ------------------------------------------------------------------------------------------------ breakdowns

interface BreakdownSpec {
  policy: BreakdownPolicy;
  target?: BreakdownTarget;
  ignoresOrders: boolean;
  once?: boolean;
  onEnter: EffectSpec[];
  actionEffects: EffectSpec[];
}

const FALLBACK: BreakdownSpec = { policy: 'skip', ignoresOrders: true, onEnter: [], actionEffects: [] };

/** The first defect of the unit that has combat breakdown data. */
function defectBreakdown(ctx: EffectCtx, c: Combatant): { defectId: string; spec: BreakdownSpec } | null {
  const unit = c.unitId ? ctx.state.squad.find((u) => u.id === c.unitId) : undefined;
  for (const d of unit?.defects ?? []) {
    const spec = (ctx.reg.defects.get(d.id)?.combat as { breakdown?: BreakdownSpec } | undefined)?.breakdown;
    if (spec) return { defectId: d.id, spec };
  }
  return null;
}

/** Policies whose action is an attack: the only ones a disposition level changes the target of (`repeat_last` only in its fallback). */
const ATTACKING: readonly BreakdownPolicy[] = ['attack', 'twice_then_shutdown', 'repeat_last'];
const LEVEL_TARGET: Record<DispositionLevel['breakdownTarget'], BreakdownTarget | null> = {
  default: null, allies: 'nearest_ally', self: 'self', allies_commander: 'allies_commander', everyone: 'everyone',
};

/** P8: the target an attacking breakdown goes for: the defect's own unless her disposition level overrides it. */
export function breakdownTargetFor(
  level: Pick<DispositionLevel, 'breakdownTarget'> | undefined, policy: BreakdownPolicy, own: BreakdownTarget | undefined,
): BreakdownTarget | undefined {
  const override = level ? LEVEL_TARGET[level.breakdownTarget] : null;
  return override !== null && ATTACKING.includes(policy) ? override : own;
}

const levelOf = (ctx: EffectCtx, c: Combatant): DispositionLevel | undefined => {
  const unit = c.unitId ? ctx.state.squad.find((u) => u.id === c.unitId) : undefined;
  return unit ? dispositionFor(ctx.state, ctx.reg, unit) : undefined;
};

/** The breakdown state a unit carries for `defectId` (used when a combat restores `Unit.breakdown`); `level` is her disposition level. */
export function makeBreakdown(reg: Registries, defectId: string, level?: Pick<DispositionLevel, 'breakdownTarget'>): NonNullable<Combatant['breakdown']> {
  const spec = (reg.defects.get(defectId)?.combat as { breakdown?: BreakdownSpec } | undefined)?.breakdown ?? FALLBACK;
  const target = breakdownTargetFor(level, spec.policy, spec.target);
  return {
    defectId, policy: spec.policy, ...(target ? { target } : {}), ignoresOrders: spec.ignoresOrders,
    ...(spec.once ? { once: true } : {}), actionEffects: spec.actionEffects,
  };
}

/**
 * The unit breaks down: her defect's breakdown policy rules the rest of the expedition, stress is locked at 100.
 * Runs the defect's `onEnter` effects and emits a cut-in.
 */
export function enterBreakdown(ctx: EffectCtx, cid: string): void {
  const c = byCid(ctx.cs, cid);
  if (c.breakdown || c.side !== 'squad') return;
  const found = defectBreakdown(ctx, c);
  const spec = found?.spec ?? FALLBACK;
  const defectId = found?.defectId ?? 'unknown';
  c.stress = 100;
  c.breakdown = makeBreakdown(ctx.reg, found ? defectId : 'unknown', levelOf(ctx, c));
  if (!found) c.breakdown = { defectId, policy: 'skip', ignoresOrders: true, actionEffects: [] };
  ctx.log({ kind: 'breakdown', target: cid });
  const name = (ctx.reg.defects.get(defectId)?.breakdown as { name?: string } | undefined)?.name ?? 'BREAKDOWN';
  ctx.emit({ type: 'combat_cutin', kind: 'breakdown', unitId: c.unitId, cid, text: name });
  ctx.emit({ type: 'breakdown', unitId: c.unitId, cid, defectId });
  applyEffects(ctx, cid, spec.onEnter, {}, `breakdown:${defectId}:enter`);
}

/** Runs the policy's `actionEffects` after a breakdown action resolved (called by turn.ts). */
export function applyBreakdownActionEffects(ctx: EffectCtx, cid: string): void {
  const b = byCid(ctx.cs, cid).breakdown;
  if (b) applyEffects(ctx, cid, b.actionEffects, {}, `breakdown:${b.defectId}:action`);
}

const rowRank = (c: Combatant): number => (c.row === 'front' ? 0 : 1);
const nearestOf = (ctx: EffectCtx, ids: string[]): string | undefined =>
  ids.map((id) => byCid(ctx.cs, id)).sort((a, b) => rowRank(a) - rowRank(b) || a.index - b.index)[0]?.cid;

/** The first damaging active skill of the unit that has a legal target, with its legal targets. */
function basicAttack(ctx: EffectCtx, c: Combatant): { skillId: string; legal: string[] } | null {
  for (const id of c.skills) {
    const sk = skillById(ctx.reg, id);
    if (!sk || sk.kind === 'passive' || sk.kind === 'ultimate' || !sk.effects.some((e) => e.type === 'damage')) continue;
    if ((c.cooldowns[id] ?? 0) > 0) continue;
    const legal = legalTargets(ctx.cs, c.cid, sk, ctx.reg);
    if (legal.length > 0 && sk.targets?.side === 'enemy') return { skillId: id, legal };
  }
  return null;
}

function attackAction(ctx: EffectCtx, c: Combatant, target: BreakdownTarget | undefined): PlannedAction {
  if (target === 'self') return { kind: 'self_harm' }; // P8: she hurts herself, not the fight
  const atk = basicAttack(ctx, c);
  if (!atk) return { kind: 'pass' };
  const { cs } = ctx;
  let targetCid: string | undefined;
  if (target === 'strongest_enemy') {
    targetCid = atk.legal
      .map((id) => byCid(cs, id))
      .sort((a, b) => effectiveStat(ctx, b.cid, 'atk') - effectiveStat(ctx, a.cid, 'atk') || b.hp - a.hp || a.index - b.index)[0]?.cid;
  } else if (target === 'nearest_ally') {
    targetCid = nearest(cs, c.cid, c.side, ctx.reg);
  } else if (target === 'allies_commander' || target === 'everyone') {
    // P8: the nearest ally (or everyone standing but herself), and the commander while he is exposed and not down
    const pool = target === 'everyone'
      ? cs.combatants.filter((x) => x.cid !== c.cid && isStanding(x) && !hasFlag(x, ctx.reg, 'untargetable')).map((x) => x.cid)
      : [nearest(cs, c.cid, c.side, ctx.reg)].filter((id): id is string => id !== undefined);
    if (cs.commander && !cs.commander.downed) pool.push('commander');
    targetCid = pool.length > 1 ? ctx.rng.pick(pool) : pool[0];
  } else if (target === 'nearest_any') {
    const any = nearest(cs, c.cid, 'any', ctx.reg);
    targetCid = any && byCid(cs, any).side !== c.side && !atk.legal.includes(any) ? nearestOf(ctx, atk.legal) : any;
  } else targetCid = nearestOf(ctx, atk.legal);
  return targetCid ? { kind: 'skill', skillId: atk.skillId, targetCid } : { kind: 'pass' };
}

/**
 * What a broken (or breaking, with `breaking: true`) unit does instead of the player's choice. `null` means normal
 * control. Stateful parts (`once`, the extra action and shutdown of `twice_then_shutdown`) only apply to a real
 * breakdown, not to a breaking turn.
 */
export function breakdownAction(ctx: EffectCtx, cid: string, opts: { breaking?: boolean } = {}): PlannedAction | null {
  const { cs } = ctx;
  const c = byCid(cs, cid);
  const real = c.breakdown;
  let b: { policy: BreakdownPolicy; target?: BreakdownTarget } | undefined = real;
  if (!b && opts.breaking) {
    const spec = defectBreakdown(ctx, c)?.spec;
    if (spec) b = { policy: spec.policy, target: breakdownTargetFor(levelOf(ctx, c), spec.policy, spec.target) };
  }
  if (!b) return null;
  if (real?.once && real.used) return null;

  const finish = (a: PlannedAction): PlannedAction => {
    if (real?.once) real.used = true;
    return a;
  };
  switch (b.policy) {
    case 'normal': return null;
    case 'skip': return { kind: 'pass' };
    case 'await_order': return cs.ordersThisRound.some((o) => o.targetCid === cid) && real ? null : { kind: 'pass' };
    case 'attack': return finish(attackAction(ctx, c, b.target));
    case 'twice_then_shutdown': {
      const attack = attackAction(ctx, c, b.target);
      if (!real) return attack;
      const count = real.count ?? 0;
      if (count >= 2) return { kind: 'pass' };
      real.count = count + 1;
      if (count === 0) cs.extraAction = cid;
      else applyStatus(ctx, cid, 'stun', 99, 1, cid);
      return attack;
    }
    case 'repeat_last': {
      const sk = c.lastSkillId ? skillById(ctx.reg, c.lastSkillId) : undefined;
      if (sk && sk.kind !== 'passive') {
        const legal = legalTargets(cs, cid, sk, ctx.reg);
        if (c.lastTargetCid && legal.includes(c.lastTargetCid)) return { kind: 'skill', skillId: sk.id, targetCid: c.lastTargetCid };
        const near = nearestOf(ctx, legal);
        if (near) return { kind: 'skill', skillId: sk.id, targetCid: near };
      }
      return attackAction(ctx, c, b.target ?? 'nearest_enemy');
    }
    case 'random_skill': {
      const options = c.skills
        .map((id) => skillById(ctx.reg, id))
        .filter((s): s is NonNullable<typeof s> => !!s && s.kind !== 'passive' && s.kind !== 'ultimate' && (c.cooldowns[s.id] ?? 0) === 0)
        .map((s) => ({ s, legal: legalTargets(cs, cid, s, ctx.reg) }))
        .filter((o) => o.legal.length > 0);
      if (options.length === 0) return { kind: 'pass' };
      const pick = ctx.rng.pick(options);
      return { kind: 'skill', skillId: pick.s.id, targetCid: ctx.rng.pick(pick.legal) };
    }
    default: return null;
  }
}

/** A unit at 80–99 stress rolls 25 % per turn to follow her breakdown policy instead of the chosen action. */
export function rollBreaking(ctx: EffectCtx, cid: string): boolean {
  const c = byCid(ctx.cs, cid);
  if (c.side !== 'squad' || c.breakdown || c.stress < 80 || c.stress >= 100) return false;
  return ctx.rng.chance(TUNING.combat.breakingChance);
}
