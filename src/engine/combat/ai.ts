import type { Registries } from '../../content/types';
import type { Skill } from '../../content/schemas';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { effectiveStat, type EffectCtx } from './effects';
import { usableSkills, type UsableSkill } from './skills';
import { encounterPower, squadPower } from './stats';
import { byCid, expandTargets, living } from './targeting';
import type { PlannedAction, StartPayload } from './types';

/** Expected damage of `skill` on `targetCid`: Σ mult × hits × ATK × 100/(100+DEF), over every target it hits. */
function expectedDamage(ctx: EffectCtx, cid: string, skill: Skill, targetCid: string): number {
  const atk = effectiveStat(ctx, cid, 'atk');
  const perHit = skill.effects.reduce((s, e) => (e.type === 'damage' && e.mult !== undefined ? s + e.mult * (e.hits ?? 1) : s), 0);
  if (perHit === 0) return 0;
  return expandTargets(ctx.cs, cid, skill, targetCid, ctx.reg)
    .reduce((sum, t) => sum + (perHit * atk * 100) / (100 + effectiveStat(ctx, t, 'def')), 0);
}

interface Option { skill: Skill; targetCid: string; damage: number }

const first = <T>(xs: T[]): T | undefined => xs[0];
const toAction = (o: Option): PlannedAction => ({ kind: 'skill', skillId: o.skill.id, targetCid: o.targetCid });
const hpPct = (ctx: EffectCtx, cid: string): number => {
  const c = byCid(ctx.cs, cid);
  return c.hp / c.maxHp;
};

/** Every (skill, target) pair, in skill order then target order. */
function options(ctx: EffectCtx, cid: string, usable: UsableSkill[]): Option[] {
  const out: Option[] = [];
  for (const { skill, targets } of usable) for (const t of targets) out.push({ skill, targetCid: t, damage: expectedDamage(ctx, cid, skill, t) });
  return out;
}

/** The pair with the highest expected damage; ties keep skill order, then target order. Null without a damaging pair. */
function heaviest(opts: Option[]): Option | null {
  let best: Option | null = null;
  for (const o of opts) if (o.damage > 0 && (!best || o.damage > best.damage)) best = o;
  return best;
}

const hasEffect = (skill: Skill, ...types: string[]): boolean => skill.effects.some((e) => types.includes(e.type));
const grantsProtection = (skill: Skill): boolean =>
  skill.effects.some((e) => e.type === 'status' && ['guard', 'shield', 'taunt'].includes(e.statusId));

function aggressive(ctx: EffectCtx, cid: string, opts: Option[]): PlannedAction | null {
  const best = heaviest(opts);
  if (best) return toAction(best);
  const any = first(opts);
  return any ? toAction(any) : null;
}

/**
 * The action an AI-controlled combatant takes, by its `aiProfile`: `aggressive` the heaviest hit; `predator` a
 * damaging skill on the lowest HP %; `protector` heal/shield/guard/taunt for a wounded ally or an exposed commander,
 * else aggressive; `disruptor` a status skill on a target without it, else aggressive; `stressor` a stress skill on
 * the most stressed squad unit, else aggressive; `erratic` a random usable skill on a random legal target. With
 * nothing usable the unit guards. Deterministic except for `erratic` (it uses the combat rng).
 */
export function chooseAction(ctx: EffectCtx, cid: string): PlannedAction {
  const { cs } = ctx;
  const c = byCid(cs, cid);
  const usable = usableSkills(ctx, cid);
  if (usable.length === 0) return { kind: 'guard' };
  const opts = options(ctx, cid, usable);

  switch (c.aiProfile) {
    case 'erratic': {
      const pick = ctx.rng.pick(usable);
      return { kind: 'skill', skillId: pick.skill.id, targetCid: ctx.rng.pick(pick.targets) };
    }
    case 'predator': {
      const damaging = opts.filter((o) => o.damage > 0);
      if (damaging.length > 0) {
        const lowest = Math.min(...damaging.map((o) => hpPct(ctx, o.targetCid)));
        const best = heaviest(damaging.filter((o) => hpPct(ctx, o.targetCid) === lowest));
        if (best) return toAction(best);
      }
      break;
    }
    case 'protector': {
      const allies = living(cs, c.side);
      const hurt = allies.filter((a) => a.hp / a.maxHp < 0.5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.index - b.index);
      const downed = cs.combatants.filter((a) => a.side === c.side && a.downed);
      const revive = usable.find((u) => hasEffect(u.skill, 'revive') && downed.length > 0);
      if (revive) return { kind: 'skill', skillId: revive.skill.id, targetCid: first(downed.filter((d) => revive.targets.includes(d.cid)))?.cid ?? revive.targets[0] };
      if (hurt.length > 0) {
        for (const u of usable) {
          if (!hasEffect(u.skill, 'heal') && !grantsProtection(u.skill)) continue;
          const target = first(hurt.filter((h) => u.targets.includes(h.cid)))?.cid ?? (u.targets.length > 0 && u.skill.targets?.count !== 'one' ? u.targets[0] : undefined);
          if (target) return { kind: 'skill', skillId: u.skill.id, targetCid: target };
        }
      }
      if (cs.commander && !cs.commander.downed && cs.commander.hp < cs.commander.maxHp) {
        const guard = usable.find((u) => grantsProtection(u.skill));
        if (guard) return { kind: 'skill', skillId: guard.skill.id, targetCid: guard.targets[0] };
      }
      break;
    }
    case 'disruptor': {
      for (const o of opts) {
        const fx = o.skill.effects.filter((e): e is Extract<typeof e, { type: 'status' }> => e.type === 'status' && (e.target ?? 'target') === 'target');
        if (o.skill.targets?.side !== 'enemy' || fx.length === 0) continue;
        const target = byCid(cs, o.targetCid);
        if (fx.some((e) => !target.statuses.some((s) => s.id === e.statusId))) return toAction(o);
      }
      break;
    }
    case 'stressor': {
      const stressful = opts.filter((o) => o.skill.effects.some((e) => e.type === 'stress' && e.amount > 0 && (e.target ?? 'target') === 'target')
        && byCid(cs, o.targetCid).side === 'squad' && byCid(cs, o.targetCid).stress < 100);
      if (stressful.length > 0) {
        const top = Math.max(...stressful.map((o) => byCid(cs, o.targetCid).stress));
        const best = stressful.find((o) => byCid(cs, o.targetCid).stress === top)!;
        return toAction(best);
      }
      break;
    }
    default: break;
  }
  return aggressive(ctx, cid, opts) ?? { kind: 'guard' };
}

/** AUTO is offered when the encounter is at most 60 % as strong as the squad. */
export function canAutoResolve(state: CampaignState, reg: Registries, p: StartPayload): boolean {
  const ids = [...p.formation.front, ...p.formation.back];
  return encounterPower(reg, p.encounter, state.difficulty) <= TUNING.combat.autoResolveRatio * squadPower(state, reg, ids);
}
