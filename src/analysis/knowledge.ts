import type { Registries } from '../content/types';
import { wentUp } from '../engine/development/moments';
import { dynamicView, type DynamicView } from '../engine/dynamic/view';
import { axisWords } from '../engine/development/words';
import { lifeView, type LifeView } from '../engine/life/known';
import type { CampaignState, DevFact, Fact } from '../engine/state/types';
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
  /**
   * P14b: what she has become, as far as the player may read it: the axes whose change she has shown (words, and why once shown), her
   * development lines she has shown, and her habits whose line is shown. Accumulators, pending and misread appraisals, `insight` and
   * anything not shown yet never appear here.
   */
  development(unitId: string, reg: Registries): DevelopmentView;
  /**
   * P14c: what the commander may read of her life: the opinions she has voiced (her words, and what she used to think), her hobbies as the
   * milestones she has told and a word for how keen she is, what she has told of her days, what the commander has learned from her as words,
   * and the hub line. Built from told and voiced items only: an untold or kept event, an unvoiced opinion, skill, interest, aptitude, the
   * queue, a persuasion count and a joke count never appear here.
   */
  life(unitId: string, reg: Registries): LifeView;
  /**
   * P15: what the commander may read of her dynamic: frame, hold band (or `felt` in immersive mode; the number only with raw values and never in immersive mode), the domains she
   * holds and may claim, her leading tracks as bands, the vow, her reading in her own word, the part of her profile a fact has shown, what can be seen of her mood, who holds what over
   * the commander, the compromat she has mentioned and what others have shown they know of her. Regard, suspicion, mastery xp, an unshown profile, unmentioned compromat and
   * the stage of an aftermath are never in it.
   */
  dynamic(unitId: string, reg: Registries): DynamicView;
}

export type { LifeView, DynamicView };

export interface DevelopmentView {
  axes: Array<{ axis: string; words: string; up: boolean; reason: string; shownDay: number; held: boolean }>;
  facts: DevFact[];
  habits: string[];
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

/** Without a campaign nothing campaign-bound is visible: no clocks, no facts (settings-only readings still work). */
export function buildKnowledge(state: CampaignState | null, settings: AliusSettings): Knowledge {
  const showRaw = settings.showRawValues === true;
  const visibleClocks = new Set((state?.world?.clocks ?? []).filter((c) => c.visibleToPlayer).map((c) => c.id));
  const factVisible = (f: Fact): boolean => state !== null && rules.every((r) => !r.fact || holds(() => r.fact!(f, state)));
  return {
    showRaw,
    raw: (n) => (showRaw ? String(n) : null),
    clockVisible: (id) => visibleClocks.has(id),
    factVisible,
    flagVisible: (id) => state === null || rules.every((r) => !r.flag || holds(() => r.flag!(id, state))),
    facts: () => (state?.memory?.facts ?? []).filter(factVisible),
    life: (unitId, reg) => (state === null
      ? { opinions: [], hobbies: [], told: [], commanderSkills: [], hub: null, temperWords: { talkativeness: 'terse', volatility: 'steady', humor: 'dry' }, mode: 'off' }
      : lifeView(state, reg, unitId, factVisible)),
    dynamic: (unitId, reg) => (state === null
      ? { domains: [], asked: [], tracks: [], sworn: false, expectations: {}, signs: [], heldBy: [], compromat: [], knownLevels: [] }
      : dynamicView(state, reg, unitId, { raw: showRaw, hidden: settings.dynamicHidden === true, factVisible })),
    development(unitId, reg) {
      const unit = state?.squad.find((u) => u.id === unitId);
      const dev = unit?.development;
      if (!state || !unit || unit.kind !== 'named' || !dev) return { axes: [], facts: [], habits: [] };
      // built from the moments she has shown, never from the state now: a later step no scene has carried must not change a line
      const axes: DevelopmentView['axes'] = [];
      for (const axis of new Set(dev.moments.map((m) => m.axis))) {
        const mine = dev.moments.filter((m) => m.axis === axis);
        const shown = mine.filter((m) => m.shownDay !== undefined).at(-1);
        if (!shown || shown.to === mine[0].from) continue; // nothing shown, or back where her file has her
        const up = wentUp({ ...shown, from: mine[0].from });
        const words = axisWords(reg, axis, up);
        if (words !== null) axes.push({ axis, words, up, reason: shown.reason, shownDay: shown.shownDay!, held: dev.held?.includes(axis) === true });
      }
      const facts = dev.facts.filter((f) => f.shownDay !== undefined);
      // a habit shows with its line; one whose line was pushed out of the list was shown long ago
      const habits = dev.habits.filter((id) => { const f = dev.facts.find((x) => x.habitId === id); return f === undefined || f.shownDay !== undefined; });
      return { axes, facts, habits };
    },
  };
}
