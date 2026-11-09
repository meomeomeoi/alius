import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { Rng } from '../rng';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { rollCrit, rollDamage } from './formulas';
import { spawnEnemy } from './spawn';
import { addStress } from './stress';
import { byCid, isStanding, living, opposite } from './targeting';
import type {
  CombatState, Combatant, Condition, EffectSpec, EffectType, LogEntry, Scale, StatName, Trigger,
} from './types';

/**
 * The one interpreter of combat effects. Everything a skill, signature, defect, status, synergy, order, item or
 * enemy affix does is an `EffectSpec`; this module applies them. During a combat only `cs` and the rng change.
 */
export interface EffectCtx {
  cs: CombatState;
  state: CampaignState;
  reg: Registries;
  rng: Rng;
  log: (e: Omit<LogEntry, 'round'>) => void;
  /** Engine events produced so far (`combat_cutin`, `order_refused`, …). */
  emit: (e: EngineEvent) => void;
  events: EngineEvent[];
}

export function makeCtx(cs: CombatState, state: CampaignState, reg: Registries, rng: Rng): EffectCtx {
  const events: EngineEvent[] = [];
  return {
    cs, state, reg, rng, events,
    log: (e) => {
      cs.log.push({ round: cs.round, ...e });
      if (cs.log.length > TUNING.combat.logMax) cs.log.splice(0, cs.log.length - TUNING.combat.logMax);
    },
    emit: (e) => { events.push(e); },
  };
}

type OfType<T extends EffectType> = Extract<EffectSpec, { type: T }> & { source: string };

/** Effect types that other modules only read (passives, flags); applying them does nothing. */
const READ_ONLY: ReadonlySet<EffectType> = new Set<EffectType>([
  'outgoing', 'incoming', 'stress_taken', 'intercept_lethal', 'misfire', 'override_action', 'order_cost',
  'order_refusal', 'loadout_slots', 'injury_days', 'immune',
]);

// ------------------------------------------------------------------------------------------------ amplification

const AMPLIFIED = ['mult', 'pct', 'amount', 'pctMaxHp'] as const;

/** Multiplies the magnitudes of an effect (`mult`, `pct`, `amount`, `pctMaxHp`; `chance` capped at 1). */
export function amplify<E extends EffectSpec>(e: E, factor: number): E {
  const out = { ...e } as Record<string, unknown>;
  for (const k of AMPLIFIED) if (typeof out[k] === 'number') out[k] = (out[k] as number) * factor;
  if (typeof out.chance === 'number') out.chance = Math.min(1, out.chance * factor);
  return out as E;
}

/** Downside effects of a strained squad unit (stress ≥ 50) are amplified. */
function strain<E extends EffectSpec>(c: Combatant, e: E): E {
  return e.downside === true && c.side === 'squad' && c.stress >= 50 ? amplify(e, TUNING.combat.strainedMult) : e;
}

// ------------------------------------------------------------------------------------------------ conditions

const unitOf = (ctx: EffectCtx, c: Combatant) => (c.unitId ? ctx.state.squad.find((u) => u.id === c.unitId) : undefined);

/** Days since the unit's defect upkeep (a defect never maintained counts from day 0). */
function upkeepAge(ctx: EffectCtx, c: Combatant): number {
  const days = (unitOf(ctx, c)?.defects ?? []).map((d) => d.upkeepDay).filter((d): d is number => typeof d === 'number');
  return ctx.state.day - (days.length > 0 ? Math.max(...days) : 0);
}

/**
 * Whether `when` holds for the effect's owner. `hp`, `stress`, row and upkeep keys describe the owner;
 * `targetHasStatus` the target; `sameRowAndSkill` compares with the previous action (and `skillId` when known).
 */
export function checkCondition(ctx: EffectCtx, cid: string, when: Condition | undefined, targetCid?: string, skillId?: string): boolean {
  if (!when) return true;
  const { cs } = ctx;
  const c = byCid(cs, cid);
  const hpPct = (c.hp / c.maxHp) * 100;
  if (when.hpBelowPct !== undefined && !(hpPct < when.hpBelowPct)) return false;
  if (when.hpAbovePct !== undefined && !(hpPct > when.hpAbovePct)) return false;
  if (when.stressMin !== undefined && !(c.stress >= when.stressMin)) return false;
  if (when.stressMax !== undefined && !(c.stress <= when.stressMax)) return false;
  if (when.roundMin !== undefined && !(cs.round >= when.roundMin)) return false;
  if (when.targetHasStatus !== undefined) {
    const t = targetCid && targetCid !== 'commander' ? cs.combatants.find((x) => x.cid === targetCid) : undefined;
    if (!t || !t.statuses.some((s) => s.id === when.targetHasStatus)) return false;
  }
  if (when.selfHasStatus !== undefined && !c.statuses.some((s) => s.id === when.selfHasStatus)) return false;
  if (when.aloneInRow !== undefined) {
    const alone = !cs.combatants.some((x) => x.side === c.side && x.cid !== c.cid && x.row === c.row && isStanding(x));
    if (alone !== when.aloneInRow) return false;
  }
  if (when.sameRowAndSkill !== undefined) {
    const same = c.lastRow !== undefined && c.lastRow === c.row && (skillId === undefined || c.lastSkillId === skillId);
    if (same !== when.sameRowAndSkill) return false;
  }
  if (when.rowChanged !== undefined) {
    const changed = c.lastRow !== undefined && c.lastRow !== c.row;
    if (changed !== when.rowChanged) return false;
  }
  if (when.commanderExposed !== undefined) {
    const exposed = cs.commander !== undefined && !cs.commander.downed;
    if (exposed !== when.commanderExposed) return false;
  }
  if (when.notOrderedThisRound !== undefined) {
    const notOrdered = !cs.ordersThisRound.some((o) => o.targetCid === cid);
    if (notOrdered !== when.notOrderedThisRound) return false;
  }
  if (when.upkeepWithinDays !== undefined && !(upkeepAge(ctx, c) <= when.upkeepWithinDays)) return false;
  if (when.upkeepOlderThanDays !== undefined && !(upkeepAge(ctx, c) > when.upkeepOlderThanDays)) return false;
  return true;
}

/** `per × value` where `value` is the percentage (or the stress beyond `base`) a scale names. */
export function scaleValue(ctx: EffectCtx, cid: string, scale: Scale | undefined): number {
  if (!scale) return 0;
  const c = byCid(ctx.cs, cid);
  let value = 0;
  if (scale.by === 'stress_above') value = Math.max(0, c.stress - (scale.base ?? 0));
  else if (scale.by === 'own_hp_missing_pct') value = (1 - c.hp / c.maxHp) * 100;
  else {
    const others = ctx.cs.combatants.filter((x) => x.side === c.side && x.cid !== cid);
    if (others.length > 0) value = (others.reduce((s, x) => s + (x.downed ? 1 : 1 - x.hp / x.maxHp), 0) / others.length) * 100;
  }
  return scale.per * value;
}

// ------------------------------------------------------------------------------------------------ passives and stats

/**
 * The always-on passives (no trigger) of a standing combatant that hold their condition, strained where they say
 * so. Downed combatants have none.
 */
export function activePassives<T extends EffectType>(
  ctx: EffectCtx, cid: string, type: T, targetCid?: string, skillId?: string,
): Array<OfType<T>> {
  const c = byCid(ctx.cs, cid);
  if (c.downed) return [];
  return c.passives
    .filter((p) => p.type === type && p.trigger === undefined && checkCondition(ctx, cid, p.when, targetCid, skillId))
    .map((p) => strain(c, p) as OfType<T>);
}

/**
 * A stat after mods, status mods and always-on `stat` passives. HP is the combatant's max HP (hp passives are
 * folded in when the combat is built). CRIT adds percentage points; the others scale in percent.
 */
export function effectiveStat(ctx: EffectCtx, cid: string, stat: StatName): number {
  const c = byCid(ctx.cs, cid);
  if (stat === 'hp') return c.maxHp;
  let pct = 0;
  for (const m of c.mods) if (m.stat === stat) pct += m.pct;
  for (const s of c.statuses) {
    const v = (ctx.reg.statuses.get(s.id)?.mods as Partial<Record<StatName, number>> | undefined)?.[stat];
    if (v) pct += v * s.stacks;
  }
  for (const e of activePassives(ctx, cid, 'stat')) {
    if (e.stat === stat || (e.stat === 'all' && stat !== 'crit')) pct += e.pct + scaleValue(ctx, cid, e.scale);
  }
  const base = c.base[stat];
  if (stat === 'crit') return Math.max(0, base + pct);
  return Math.max(stat === 'def' ? 0 : 1, Math.round(base * (1 + pct / 100)));
}

/** Sum of the owner's always-on `outgoing` percentages against `targetCid`. */
export function outgoingPct(ctx: EffectCtx, cid: string, targetCid?: string): number {
  const c = byCid(ctx.cs, cid);
  const target = targetCid && targetCid !== 'commander' ? ctx.cs.combatants.find((x) => x.cid === targetCid) : undefined;
  let sum = 0;
  for (const e of activePassives(ctx, cid, 'outgoing', targetCid)) {
    if (e.vs === 'marked' && !target?.statuses.some((s) => s.id === 'mark')) continue;
    if (e.vs === 'locked' && !(targetCid !== undefined && c.lockedTargetId === targetCid)) continue;
    sum += e.pct + scaleValue(ctx, cid, e.scale);
  }
  return sum;
}

/** Sum of always-on `incoming` percentages and the incoming modifiers of statuses. */
export function incomingPct(ctx: EffectCtx, cid: string): number {
  const c = byCid(ctx.cs, cid);
  let sum = 0;
  for (const e of activePassives(ctx, cid, 'incoming')) sum += e.pct;
  for (const s of c.statuses) sum += ((ctx.reg.statuses.get(s.id)?.incomingPct as number | undefined) ?? 0) * s.stacks;
  return sum;
}

// ------------------------------------------------------------------------------------------------ statuses

/** Applies a status; `immune` passives block it. Returns whether it took hold. */
export function applyStatus(
  ctx: EffectCtx, cid: string, statusId: string, turns?: number, stacks = 1, sourceCid = cid,
): boolean {
  const c = byCid(ctx.cs, cid);
  const def = ctx.reg.statuses.get(statusId);
  if (!def || c.downed) return false;
  if (activePassives(ctx, cid, 'immune').some((e) => e.statusId === statusId)) return false;
  const maxStacks = (def.maxStacks as number | undefined) ?? 1;
  const duration = turns ?? (def.turns as number | undefined) ?? 1;
  const mode = (def.stackMode as string | undefined) ?? 'refresh';
  const absorbs = ((def.flags as string[] | undefined) ?? []).includes('absorb');
  // a shield soaks 15 % of the applier's max HP per stack
  const perStack = absorbs ? Math.max(1, Math.round(byCid(ctx.cs, sourceCid).maxHp * 0.15)) : 0;
  const existing = c.statuses.find((s) => s.id === statusId);
  if (existing) {
    const stacksNow = mode === 'add' ? Math.min(maxStacks, existing.stacks + stacks) : existing.stacks;
    const added = stacksNow - existing.stacks;
    existing.stacks = stacksNow;
    existing.turns = Math.max(existing.turns, duration);
    if (absorbs) existing.value = mode === 'add' ? (existing.value ?? 0) + perStack * added : Math.max(existing.value ?? 0, perStack * stacksNow);
  } else {
    const n = Math.min(stacks, maxStacks);
    c.statuses.push({ id: statusId, turns: duration, stacks: n, sourceCid, ...(absorbs ? { value: perStack * n } : {}) });
  }
  ctx.log({ kind: 'status', actor: sourceCid, target: cid, statusId });
  return true;
}

/** Turn start: every status's tick effects run once per stack, with the status's source as the attacker. */
export function tickStatuses(ctx: EffectCtx, cid: string): void {
  const c = byCid(ctx.cs, cid);
  for (const s of [...c.statuses]) {
    const tick = (ctx.reg.statuses.get(s.id)?.tick as EffectSpec[] | undefined) ?? [];
    for (let i = 0; i < s.stacks; i++) {
      if (c.downed) return;
      tick.forEach((e, idx) => runEffect(ctx, cid, e, { sourceCid: s.sourceCid, attackerCid: s.sourceCid }, `status:${s.id}:${idx}`));
    }
  }
}

/** Turn end: statuses, timed mods, redirects and a target lock lose a turn and expire at 0. */
export function expireStatuses(ctx: EffectCtx, cid: string): void {
  const c = byCid(ctx.cs, cid);
  for (const s of c.statuses) s.turns -= 1;
  c.statuses = c.statuses.filter((s) => s.turns > 0);
  for (const m of c.mods) if (m.turnsLeft !== undefined) m.turnsLeft -= 1;
  c.mods = c.mods.filter((m) => m.turnsLeft === undefined || m.turnsLeft > 0);
  if (c.redirects) {
    for (const r of c.redirects) r.turnsLeft -= 1;
    c.redirects = c.redirects.filter((r) => r.turnsLeft > 0);
  }
  if (c.lockTurns !== undefined) {
    c.lockTurns -= 1;
    if (c.lockTurns <= 0) {
      delete c.lockedTargetId;
      delete c.lockTurns;
    }
  }
}

/** Forgets the `limit: 'round'` marks of every combatant. */
export function clearRoundLimits(cs: CombatState): void {
  for (const c of cs.combatants) c.usedLimits = c.usedLimits.filter((k) => !k.endsWith(':round'));
}

// ------------------------------------------------------------------------------------------------ applying effects

export interface EffectEvent {
  /** The chosen target when the effect fired (the primary target of a skill, the victim of a hit). */
  targetCid?: string;
  /** Who caused it (the attacker of an `onDamaged` hit, the source of a status tick). */
  sourceCid?: string;
  skillId?: string;
  /** All targets of a skill use: the default `target` of its effects. */
  targets?: string[];
  /** Who deals the damage of a `damage` effect when it is not the owner (a status tick: the status's source). */
  attackerCid?: string;
}

function resolveTargets(ctx: EffectCtx, owner: Combatant, e: EffectSpec, ev: EffectEvent): string[] {
  const { cs } = ctx;
  const kind = e.target ?? (ev.targets ? 'target' : 'self');
  const side = owner.side;
  const standing = (s: 'squad' | 'enemy') => living(cs, s);
  switch (kind) {
    case 'self': return [owner.cid];
    case 'target': return ev.targets ?? (ev.targetCid ? [ev.targetCid] : []);
    case 'source': return ev.sourceCid ? [ev.sourceCid] : [];
    case 'allies': return standing(side).map((c) => c.cid);
    case 'allies_other': return standing(side).filter((c) => c.cid !== owner.cid).map((c) => c.cid);
    case 'allies_front': return standing(side).filter((c) => c.row === 'front').map((c) => c.cid);
    case 'enemies': return standing(opposite(side)).map((c) => c.cid);
    case 'own_row': return standing(side).filter((c) => c.row === owner.row && c.cid !== owner.cid).map((c) => c.cid);
    case 'target_row': {
      const ref = ev.targetCid ?? ev.sourceCid;
      const r = ref && ref !== 'commander' ? cs.combatants.find((c) => c.cid === ref) : undefined;
      return r ? cs.combatants.filter((c) => c.side === r.side && c.row === r.row && isStanding(c)).map((c) => c.cid) : [];
    }
    case 'random_enemy': {
      const pool = standing(opposite(side));
      return pool.length > 0 ? [ctx.rng.pick(pool).cid] : [];
    }
    case 'lowest_hp_ally': {
      const pool = standing(side).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.index - b.index);
      return pool.length > 0 ? [pool[0].cid] : [];
    }
    case 'commander': return [];
    default: return [];
  }
}

/** Applies a list of effects owned by `ownerCid` (on-use effects of a skill, an order, a breakdown, …). */
export function applyEffects(ctx: EffectCtx, ownerCid: string, effects: EffectSpec[], ev: EffectEvent, source = 'effect'): void {
  effects.forEach((e, i) => runEffect(ctx, ownerCid, e, ev, `${source}:${i}`));
}

function heal(ctx: EffectCtx, targetCid: string, pct: number): void {
  const t = byCid(ctx.cs, targetCid);
  if (t.downed || t.hp <= 0) return;
  const amount = Math.max(1, Math.round((t.maxHp * pct) / 100));
  const gained = Math.min(amount, t.maxHp - t.hp);
  t.hp += gained;
  if (gained > 0) ctx.log({ kind: 'heal', target: targetCid, amount: gained });
}

function moveCombatant(ctx: EffectCtx, targetCid: string, to: 'front' | 'back' | 'swap'): void {
  const t = byCid(ctx.cs, targetCid);
  if (t.downed || t.statuses.some((s) => (ctx.reg.statuses.get(s.id)?.flags as string[] | undefined)?.includes('rooted'))) return;
  const dest = to === 'swap' ? (t.row === 'front' ? 'back' : 'front') : to;
  if (dest === t.row) return;
  const crowd = ctx.cs.combatants.filter((c) => c.side === t.side && c.row === dest && !c.downed);
  if (crowd.length < TUNING.combat.maxPerRow) {
    t.row = dest;
    return;
  }
  // a full row: exchange places with its first member that is free to move
  const mate = crowd.find((c) => !c.statuses.some((s) => (ctx.reg.statuses.get(s.id)?.flags as string[] | undefined)?.includes('rooted')));
  if (to === 'swap' && mate) {
    mate.row = t.row;
    t.row = dest;
  }
}

function runEffect(ctx: EffectCtx, ownerCid: string, effect: EffectSpec, ev: EffectEvent, keyBase: string): void {
  if (READ_ONLY.has(effect.type)) return;
  const owner = byCid(ctx.cs, ownerCid);
  const limitKey = effect.limit ? `${keyBase}:${effect.limit}` : undefined;
  if (limitKey && owner.usedLimits.includes(limitKey)) return;
  if (!checkCondition(ctx, ownerCid, effect.when, ev.targetCid, ev.skillId)) return;
  const e = strain(owner, effect);
  if (e.chance !== undefined && !ctx.rng.chance(e.chance)) return;
  if (limitKey) owner.usedLimits.push(limitKey);
  const attacker = ev.attackerCid ?? ownerCid;

  const resolved = resolveTargets(ctx, owner, e, ev);
  // the commander (Commander Crisis) is only ever hit by damage; every other effect needs a combatant
  const targets = e.type === 'damage' || e.type === 'follow_up' ? resolved : resolved.filter((t) => t !== 'commander');
  switch (e.type) {
    case 'damage': {
      const hits = e.hits ?? 1;
      const opts = { critBonus: e.critBonus, scale: e.scale, pctMaxHp: e.pctMaxHp, skillId: ev.skillId, followUp: false };
      if (e.target === 'random_enemy') {
        for (let h = 0; h < hits; h++) {
          const pool = living(ctx.cs, opposite(owner.side));
          if (pool.length === 0) break;
          dealDamage(ctx, attacker, ctx.rng.pick(pool).cid, e.mult ?? 0, opts);
        }
        break;
      }
      for (const t of targets) {
        for (let h = 0; h < hits; h++) {
          if (t !== 'commander' && !isStanding(byCid(ctx.cs, t))) break;
          dealDamage(ctx, attacker, t, e.mult ?? 0, opts);
        }
      }
      break;
    }
    case 'heal': for (const t of targets) heal(ctx, t, e.pctMaxHp); break;
    case 'revive':
      for (const t of targets) {
        const c = byCid(ctx.cs, t);
        if (!c.downed && c.hp > 0) continue;
        c.downed = false;
        c.hp = Math.max(1, Math.round((c.maxHp * e.pctMaxHp) / 100));
        ctx.log({ kind: 'revived', actor: ownerCid, target: t, amount: c.hp });
      }
      break;
    case 'status':
      for (const t of targets) applyStatus(ctx, t, e.statusId, e.turns, e.stacks ?? 1, ownerCid);
      break;
    case 'cleanse':
      for (const t of targets) {
        const c = byCid(ctx.cs, t);
        let left = e.count;
        for (let i = c.statuses.length - 1; i >= 0 && left > 0; i--) {
          if (ctx.reg.statuses.get(c.statuses[i].id)?.kind === e.kind) {
            c.statuses.splice(i, 1);
            left -= 1;
          }
        }
      }
      break;
    case 'stat':
      for (const t of targets) {
        const c = byCid(ctx.cs, t);
        const pct = e.pct + scaleValue(ctx, ownerCid, e.scale);
        const stats: StatName[] = e.stat === 'all' ? ['atk', 'def', 'spd'] : [e.stat];
        for (const stat of stats) {
          if (stat === 'hp') continue; // max HP is fixed at the start of the combat
          c.mods.push({ stat, pct, ...(e.turns !== undefined ? { turnsLeft: e.turns } : {}), source: ownerCid });
        }
      }
      break;
    case 'stress': for (const t of targets) addStress(ctx, t, e.amount, t === ownerCid ? 'self' : owner.side === 'squad' ? 'ally' : 'enemy'); break;
    case 'cp':
      if (owner.side === 'squad') ctx.cs.cp = Math.min(TUNING.combat.cpMax, Math.max(0, ctx.cs.cp + e.amount));
      break;
    case 'move': for (const t of targets) moveCombatant(ctx, t, e.to); break;
    case 'extra_action': ctx.cs.extraAction = ownerCid; break; // read by turn.ts after the action resolves
    case 'redirect': {
      const protector = owner;
      for (const t of targets) {
        if (t === ownerCid) continue;
        (protector.redirects ??= []).push({ fromCid: e.from === 'commander' ? 'commander' : t, pct: e.pct, turnsLeft: e.turns });
      }
      break;
    }
    case 'summon': {
      const alive = ctx.cs.combatants.filter((c) => c.summonedBy === ownerCid && c.enemyId === e.enemyId && isStanding(c));
      if (alive.length >= e.max) break;
      const sp = spawnEnemy(ctx.cs, ctx.state, ctx.reg, { enemyId: e.enemyId, level: owner.level, affixes: [], row: owner.row }, ownerCid);
      if (sp) ctx.log({ kind: 'summon', actor: ownerCid, target: sp.cid });
      break;
    }
    case 'follow_up':
      for (const t of targets) {
        if (t !== 'commander' && !isStanding(byCid(ctx.cs, t))) continue;
        dealDamage(ctx, ownerCid, t, e.mult, { followUp: true, skillId: ev.skillId });
      }
      break;
    case 'lock_target':
      if (ev.targetCid && ev.targetCid !== 'commander') {
        owner.lockedTargetId = ev.targetCid;
        owner.lockTurns = e.turns;
      }
      break;
    case 'loot_roll': ctx.cs.pendingLootRolls += e.extra; break; // banked by outcome.ts
    case 'repeat_order': ctx.cs.repeatOrder = true; break; // read by orders.ts after the action resolves
    case 'hp_set': for (const t of targets) byCid(ctx.cs, t).hp = Math.min(e.value, byCid(ctx.cs, t).maxHp); break;
    default: break;
  }
}

// ------------------------------------------------------------------------------------------------ triggers

export interface TriggerEvent {
  /** Who acted, was hit, crossed a threshold or was downed. */
  actorCid?: string;
  /** The other party: the one hit, or the killer for `onAllyDowned`. */
  targetCid?: string;
  threshold?: 50 | 80 | 100;
  skillId?: string;
}

/**
 * Runs the passives that react to `trigger`. Scope `self` (default) fires for the actor's own passives, `ally` for the
 * passives of the actor's living allies (hit, crit, kill). `onAllyDowned` fires for the downed unit's allies and for
 * the downed unit itself (so `volatile` can explode on its own downing), with the killer as the target. Round and
 * combat limits are remembered in `usedLimits`.
 */
export function fireTrigger(ctx: EffectCtx, trigger: Trigger, ev: TriggerEvent): void {
  const { cs } = ctx;
  const actor = ev.actorCid ? byCid(cs, ev.actorCid) : undefined;
  for (const owner of [...cs.combatants]) {
    if (owner.downed && !(trigger === 'onAllyDowned' && owner.cid === ev.actorCid)) continue;
    owner.passives.forEach((p, idx) => {
      if (p.trigger !== trigger) return;
      let fires: boolean;
      if (trigger === 'onAllyDowned') fires = !!actor && owner.side === actor.side;
      else if (trigger === 'onCombatStart' || trigger === 'onRoundStart' || trigger === 'onCombatEnd') fires = true;
      else if (trigger === 'onStressThreshold') fires = owner.cid === ev.actorCid && p.threshold === ev.threshold;
      else if ((p.scope ?? 'self') === 'ally') fires = !!actor && owner.cid !== actor.cid && owner.side === actor.side;
      else fires = owner.cid === ev.actorCid;
      if (!fires) return;
      runEffect(ctx, owner.cid, p, {
        targetCid: ev.targetCid, sourceCid: ev.targetCid && trigger === 'onDamaged' ? ev.targetCid : ev.actorCid, skillId: ev.skillId,
      }, `${p.source}:${idx}`);
    });
  }
}

// ------------------------------------------------------------------------------------------------ damage

export interface DamageOpts {
  critBonus?: number;
  scale?: Scale;
  /** True damage as a percentage of the target's max HP: ignores DEF, crit, variance and modifiers. */
  pctMaxHp?: number;
  /** A follow-up hit does not fire `onHit`, `onCrit` or `onDamaged` (no chains). */
  followUp?: boolean;
  skillId?: string;
}

export interface DamageResult { dealt: number; crit: boolean; killed: boolean }

function passiveKey(c: Combatant, p: { source: string }, kind: 'combat' | 'round'): string {
  return `${p.source}:${c.passives.findIndex((x) => x === p)}:${kind}`;
}

/** Hands damage meant for a unit to the living units that took over (a redirect, a cover). */
function shiftToProtectors(ctx: EffectCtx, targetCid: string, amount: number): { rest: number; shifts: Array<{ cid: string; amount: number }> } {
  const shifts: Array<{ cid: string; amount: number }> = [];
  let rest = amount;
  for (const p of ctx.cs.combatants) {
    if (!isStanding(p) || p.cid === targetCid) continue;
    for (const r of p.redirects ?? []) {
      if (r.fromCid !== targetCid) continue;
      const part = Math.min(rest, Math.round((amount * r.pct) / 100));
      if (part > 0) {
        shifts.push({ cid: p.cid, amount: part });
        rest -= part;
      }
    }
  }
  return { rest, shifts };
}

/** Removes HP, shield first; returns the HP actually lost. */
function loseHp(ctx: EffectCtx, targetCid: string, amount: number, absorb: boolean): number {
  const t = byCid(ctx.cs, targetCid);
  let left = amount;
  if (absorb) {
    for (const s of t.statuses) {
      const flags = (ctx.reg.statuses.get(s.id)?.flags as string[] | undefined) ?? [];
      if (!flags.includes('absorb') || !s.value) continue;
      const taken = Math.min(s.value, left);
      s.value -= taken;
      left -= taken;
    }
    t.statuses = t.statuses.filter((s) => {
      const flags = (ctx.reg.statuses.get(s.id)?.flags as string[] | undefined) ?? [];
      return !flags.includes('absorb') || (s.value ?? 0) > 0;
    });
  }
  const lost = Math.min(left, t.hp);
  t.hp -= lost;
  return lost;
}

function down(ctx: EffectCtx, targetCid: string, killerCid: string | undefined): void {
  const t = byCid(ctx.cs, targetCid);
  t.hp = 0;
  t.downed = true;
  ctx.log({ kind: 'downed', actor: killerCid, target: targetCid });
  if (t.side === 'squad') {
    for (const ally of living(ctx.cs, 'squad')) addStress(ctx, ally.cid, TUNING.combat.stress.allyDowned, 'ally');
  }
  fireTrigger(ctx, 'onAllyDowned', { actorCid: targetCid, targetCid: killerCid });
}

/**
 * One damaging hit. Crit roll, then the damage formula with `outgoing`/`incoming` modifiers folded into the
 * multiplier; redirects and covers move a share to a protector, shields absorb, a lethal hit downs the target
 * (named units never die; the outcome decides). Fires `onHit`, `onCrit`, `onDamaged`, `onKill`, `onAllyDowned` and
 * the stress consequences of crits, downings and kills.
 */
export function dealDamage(ctx: EffectCtx, attackerCid: string, targetCid: string, mult: number, opts: DamageOpts = {}): DamageResult {
  const { cs } = ctx;
  const attacker = byCid(cs, attackerCid);
  if (targetCid === 'commander') return hitCommander(ctx, attackerCid, mult, opts);
  const target = byCid(cs, targetCid);

  let amount: number;
  let crit = false;
  if (opts.pctMaxHp !== undefined) {
    amount = Math.max(1, Math.round((target.maxHp * opts.pctMaxHp) / 100));
  } else {
    const critChance = effectiveStat(ctx, attackerCid, 'crit') + (opts.critBonus ?? 0);
    crit = rollCrit(ctx.rng, critChance);
    const m = (mult + scaleValue(ctx, attackerCid, opts.scale))
      * Math.max(0, 1 + outgoingPct(ctx, attackerCid, targetCid) / 100)
      * Math.max(0, 1 + incomingPct(ctx, targetCid) / 100);
    amount = rollDamage(ctx.rng, { atk: effectiveStat(ctx, attackerCid, 'atk'), mult: m, def: effectiveStat(ctx, targetCid, 'def'), crit });
  }
  const trueDamage = opts.pctMaxHp !== undefined;

  // a lethal hit on an ally may be intercepted (protect: 'ally')
  let victimCid = targetCid;
  if (!trueDamage && amount >= target.hp) {
    for (const p of cs.combatants) {
      if (!isStanding(p) || p.cid === targetCid || p.side !== target.side) continue;
      const passive = p.passives.find((x) => x.type === 'intercept_lethal' && x.protect === 'ally' && x.trigger === undefined);
      if (!passive) continue;
      const key = passiveKey(p, passive, 'combat');
      if (passive.limit && p.usedLimits.includes(key)) continue;
      if (passive.limit) p.usedLimits.push(key);
      ctx.log({ kind: 'intercept', actor: p.cid, target: targetCid });
      victimCid = p.cid;
      break;
    }
  }

  let dealtTotal = 0;
  let killed = false;
  const hit = (cid: string, amt: number, canRedirect: boolean): void => {
    const v = byCid(cs, cid);
    if (!isStanding(v)) return;
    let rest = amt;
    if (canRedirect && !trueDamage) {
      const shifted = shiftToProtectors(ctx, cid, amt);
      rest = shifted.rest;
      for (const s of shifted.shifts) hit(s.cid, s.amount, false);
    }
    const lost = loseHp(ctx, cid, rest, !trueDamage);
    dealtTotal += lost;
    ctx.log({ kind: crit ? 'crit' : 'hit', actor: attackerCid, target: cid, amount: lost, ...(opts.skillId ? { skillId: opts.skillId } : {}) });
    if (v.hp <= 0) {
      if (cid === victimCid) killed = true;
      down(ctx, cid, attackerCid);
    }
  };
  hit(victimCid, amount, victimCid === targetCid);

  if (!opts.followUp && !trueDamage) {
    fireTrigger(ctx, 'onHit', { actorCid: attackerCid, targetCid, skillId: opts.skillId });
    if (crit) fireTrigger(ctx, 'onCrit', { actorCid: attackerCid, targetCid, skillId: opts.skillId });
    fireTrigger(ctx, 'onDamaged', { actorCid: victimCid, targetCid: attackerCid });
  }
  if (crit && target.side === 'squad' && attacker.side === 'enemy' && isStanding(byCid(cs, targetCid))) {
    addStress(ctx, targetCid, TUNING.combat.stress.critTaken, 'enemy');
  }
  if (killed) {
    fireTrigger(ctx, 'onKill', { actorCid: attackerCid, targetCid });
    if (attacker.side === 'squad') addStress(ctx, attackerCid, TUNING.combat.stress.kill, 'system');
  }
  return { dealt: dealtTotal, crit, killed };
}

/**
 * A hit on the commander (Commander Crisis). The cover unit takes it while she stands; without cover the commander
 * takes it (DEF applies, no crit) and every squad unit gains stress. A lethal hit may be intercepted once per
 * combat by a unit with `intercept_lethal` (protect: commander). At 0 HP the commander is down and the combat lost.
 */
function hitCommander(ctx: EffectCtx, attackerCid: string, mult: number, opts: DamageOpts): DamageResult {
  const { cs } = ctx;
  const cmd = cs.commander;
  if (!cmd || cmd.downed) return { dealt: 0, crit: false, killed: false };
  const cover = byCid(cs, cmd.coverId);
  if (isStanding(cover)) {
    ctx.log({ kind: 'cover', actor: cover.cid, target: 'commander' });
    return dealDamage(ctx, attackerCid, cover.cid, mult, opts);
  }
  const attackerAtk = effectiveStat(ctx, attackerCid, 'atk');
  const amount = opts.pctMaxHp !== undefined
    ? Math.max(1, Math.round((cmd.maxHp * opts.pctMaxHp) / 100))
    : rollDamage(ctx.rng, { atk: attackerAtk, mult, def: cmd.def, crit: false });
  if (amount >= cmd.hp) {
    for (const p of cs.combatants) {
      if (!isStanding(p) || p.side !== 'squad') continue;
      const passive = p.passives.find((x) => x.type === 'intercept_lethal' && x.protect === 'commander' && x.trigger === undefined);
      if (!passive) continue;
      const key = passiveKey(p, passive, 'combat');
      if (passive.limit && p.usedLimits.includes(key)) continue;
      if (passive.limit) p.usedLimits.push(key);
      ctx.log({ kind: 'intercept', actor: p.cid, target: 'commander' });
      return dealDamage(ctx, attackerCid, p.cid, mult, { ...opts, followUp: true });
    }
  }
  const lost = Math.min(amount, cmd.hp);
  cmd.hp -= lost;
  ctx.log({ kind: 'hit', actor: attackerCid, target: 'commander', amount: lost });
  for (const ally of living(cs, 'squad')) addStress(ctx, ally.cid, TUNING.combat.stress.commanderHit, 'enemy');
  if (cmd.hp <= 0) {
    cmd.downed = true;
    cs.commanderDown = true;
    ctx.log({ kind: 'downed', actor: attackerCid, target: 'commander' });
  }
  return { dealt: lost, crit: false, killed: cmd.hp <= 0 };
}
