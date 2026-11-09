import { effectiveStat, type EffectCtx } from './effects';
import { usableSkills } from './skills';
import { byCid } from './targeting';
import type { PlannedAction } from './types';

/**
 * The action an AI-controlled combatant takes. Task 9 ships the `aggressive` baseline for every profile (highest
 * expected damage); Task 10 adds the other profiles.
 */
export function chooseAction(ctx: EffectCtx, cid: string): PlannedAction {
  const options = usableSkills(ctx, cid);
  let best: { skillId: string; targetCid: string; score: number } | null = null;
  for (const { skill, targets } of options) {
    const target = byCid(ctx.cs, targets[0]);
    const dmg = skill.effects.reduce((sum, e) => (e.type === 'damage' && e.mult !== undefined ? sum + e.mult * (e.hits ?? 1) : sum), 0);
    const score = dmg * effectiveStat(ctx, cid, 'atk') * (100 / (100 + effectiveStat(ctx, target.cid, 'def')));
    if (!best || score > best.score) best = { skillId: skill.id, targetCid: targets[0], score };
  }
  return best ? { kind: 'skill', skillId: best.skillId, targetCid: best.targetCid } : { kind: 'guard' };
}
