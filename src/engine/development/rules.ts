import type { Registries } from '../../content/types';
import { contentAllowed, type ContentHolder } from '../bonds/content';
import { bondOf } from '../bonds/profile';
import type { Appraisal, CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { axisForbidden, WILDCARD } from './axes';
import { valuesOf } from './profile';
import { developmentMode, ensureDevelopment } from './state';
import type { DevelopmentRuleEntry } from './types';

/**
 * The rules the content gate lets through: one tagged with a category that is switched off is ignored (P9d); with a unit id, one tagged
 * with a category among HER own limits is ignored too. Registry order.
 */
export function allowedRules(state: ContentHolder, reg: Registries, unitId?: string): DevelopmentRuleEntry[] {
  return [...reg.developmentRules.values()].filter((r) => contentAllowed(state, reg, r, unitId)) as unknown as DevelopmentRuleEntry[];
}

const round = (n: number): number => Math.round(n * 1e6) / 1e6;

function kindMatches(kinds: string[], kind: string): boolean {
  return kinds.some((k) => (k.endsWith(':*') ? kind.startsWith(k.slice(0, -1)) : k === kind));
}

/** The word of an appraisal's target that a rule's `match.target` names: `unit:<id>` is `unit`. */
const targetWord = (target: string): string => (target.startsWith('unit:') ? 'unit' : target);

/** Does this rule fit the appraisal as THIS soldier reads it (her effective profile decides `by`)? Read by field, never by id. */
function ruleFits(rule: DevelopmentRuleEntry, unit: Unit, a: Appraisal): boolean {
  const m = rule.match;
  if (m.kind && !kindMatches(m.kind, a.kind)) return false;
  if (m.role && !m.role.includes(a.role)) return false;
  if (m.target && !m.target.includes(targetWord(a.target) as never)) return false;
  if (m.wanted && !m.wanted.includes(a.wanted)) return false;
  if (m.initiator && !m.initiator.includes(a.initiator)) return false;
  if (m.harm && !m.harm.includes(a.harm)) return false;
  if (m.outcome && !m.outcome.includes(a.outcome)) return false;
  const by = rule.by;
  if (!by) return true;
  if (by.values) {
    const v = valuesOf(unit);
    for (const [axis, sign] of Object.entries(by.values)) {
      const n = v[axis as keyof typeof v];
      if (sign === '+' ? !(n > 0) : !(n < 0)) return false;
    }
  }
  const bond = bondOf(unit);
  if (by.caretaker !== undefined && bond?.caretaker !== by.caretaker) return false;
  if (by.leadStyle && !(bond && by.leadStyle.includes(bond.leadStyle))) return false;
  if (by.attachment && !(bond && by.attachment.includes(bond.attachment))) return false;
  if (by.insight && !by.insight.includes(unit.insight ?? 'mid')) return false;
  return true;
}

/**
 * What an appraisal adds to which accumulators for this soldier: every allowed rule that fits, each push scaled by the event's
 * severity and the mode, `like:{tag}` expanded to the event's tags (none: skipped), forbidden and held axes dropped, merged per axis.
 * Pure: draws nothing and writes nothing.
 */
export function matchRules(
  state: CampaignState, reg: Registries, unit: Unit, a: Appraisal, tags: string[],
): Array<{ axis: string; amount: number }> {
  const mode = developmentMode(state);
  if (mode === 'off' || unit.kind !== 'named') return [];
  const scale = TUNING.development.severityMult[a.severity] * TUNING.development.modeMult[mode];
  const sum = new Map<string, number>();
  for (const rule of allowedRules(state, reg, unit.id)) {
    if (!ruleFits(rule, unit, a)) continue;
    for (const p of rule.push) {
      const kind = p.axis.split(':')[0];
      const keys = p.axis === `${kind}:{tag}` ? tags.map((t) => `${kind}:${t}`) : [p.axis];
      for (const key of keys) {
        if (axisForbidden(state, reg, unit, key) !== null) continue;
        sum.set(key, round((sum.get(key) ?? 0) + p.amount * scale));
      }
    }
  }
  return [...sum].filter(([, amount]) => amount !== 0).map(([axis, amount]) => ({ axis, amount }));
}

/** Adds the pushes to her accumulators, each axis clamped to ±`accCap`. Returns what was really added (the clamp can take part of it). */
export function accumulate(unit: Unit, pushes: Array<{ axis: string; amount: number }>): Array<{ axis: string; amount: number }> {
  if (pushes.length === 0) return [];
  const cap = TUNING.development.accCap;
  const dev = ensureDevelopment(unit);
  const applied: Array<{ axis: string; amount: number }> = [];
  for (const p of pushes) {
    const cur = dev.acc[p.axis] ?? 0;
    const next = round(Math.min(cap, Math.max(-cap, cur + p.amount)));
    const delta = round(next - cur);
    if (delta === 0) continue;
    if (next === 0) delete dev.acc[p.axis];
    else dev.acc[p.axis] = next;
    applied.push({ axis: p.axis, amount: delta });
  }
  return applied;
}

export { WILDCARD };
