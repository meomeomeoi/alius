import type { CampaignState, Fact } from '../engine/state/types';
import type { AliusSettings } from '../settings';

/**
 * What the player may read off a panel (P7a §3). Providers must take every number, clock, fact and
 * flag through this object: with "show raw values" off there are no numbers, and nothing a rule hides
 * is ever shown.
 */
export interface Knowledge {
  showRaw: boolean;
  /** The number as text, or `null` when raw values are off (the provider then shows a band or an arrow). */
  raw(n: number): string | null;
  clockVisible(id: string): boolean;
  factVisible(f: Fact): boolean;
  flagVisible(id: string): boolean;
  /** The facts the commander may know. */
  facts(): Fact[];
}

/** A rule returns `false` to hide. Later packages add rules (e.g. P12 hides facts of a secret). */
export interface KnowledgeRule {
  fact?(f: Fact, state: CampaignState): boolean;
  flag?(id: string, state: CampaignState): boolean;
}

let rules: KnowledgeRule[] = [];

export function registerKnowledgeRule(rule: KnowledgeRule): void {
  rules.push(rule);
}

/** Tests only. */
export function resetKnowledgeRules(): void {
  rules = [];
}

/** A rule that throws hides nothing: it must not be able to take a panel down. */
function holds(check: () => boolean | undefined): boolean {
  try {
    return check() !== false;
  } catch {
    return true;
  }
}

export function buildKnowledge(state: CampaignState, settings: AliusSettings): Knowledge {
  const showRaw = settings.showRawValues === true;
  const visibleClocks = new Set((state.world?.clocks ?? []).filter((c) => c.visibleToPlayer).map((c) => c.id));
  const factVisible = (f: Fact): boolean => rules.every((r) => !r.fact || holds(() => r.fact!(f, state)));
  return {
    showRaw,
    raw: (n) => (showRaw ? String(n) : null),
    clockVisible: (id) => visibleClocks.has(id),
    factVisible,
    flagVisible: (id) => rules.every((r) => !r.flag || holds(() => r.flag!(id, state))),
    facts: () => (state.memory?.facts ?? []).filter(factVisible),
  };
}
