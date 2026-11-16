import type { Registries, RegistryName } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { bondOf } from './profile';
import { syncRulesWithContent } from './rules';

/** Registries whose entries may carry `contentTags` (and the night specs of defects and relationship states do too). */
export const CONTENT_GATED_REGISTRIES = ['relationshipRuleTemplates', 'demandTemplates', 'punishments', 'dilemmaTemplates', 'missionTemplates', 'clocks', 'wagerStakes'] as const satisfies readonly RegistryName[];

/** Anything the gate can read: a campaign, or a holder with only some of it (a wizard's world choices carry neither). */
export type ContentHolder = { content?: { enabled: string[] }; squad?: ReadonlyArray<Pick<Unit, 'id' | 'kind' | 'bond'>> };

/** The categories the player switched on, in the order stored. Absent = none (every category is off by default). */
export const enabledCategories = (state: Pick<ContentHolder, 'content'>): string[] => state.content?.enabled ?? [];

/** The categories an entry (or a night spec) is tagged with. */
export const tagsOf = (entry: object): string[] => {
  const tags = (entry as { contentTags?: unknown }).contentTags;
  return Array.isArray(tags) ? tags.map(String) : [];
};

/**
 * May this entry appear? False while any of its tags is switched off. With `unitId` it is also false when a tag is among
 * HER own limits, enabled or not (a character does not do what her card says she would not).
 */
export function contentAllowed(state: ContentHolder, _reg: Registries, entry: object, unitId?: string): boolean {
  const tags = tagsOf(entry);
  if (tags.length === 0) return true;
  const on = enabledCategories(state);
  if (tags.some((t) => !on.includes(t))) return false;
  if (unitId === undefined) return true;
  const unit = state.squad?.find((u) => u.id === unitId);
  const limits = unit ? bondOf(unit)?.ownLimits.categories ?? [] : [];
  return !tags.some((t) => limits.includes(t));
}

/**
 * Sets the enabled categories (unknown ids dropped, registry order). Turning a category off quietly withdraws what is open
 * under it, with no deltas: demands built on a tagged template and night knocks from a tagged spec. Emits `content_changed`
 * when something moved. Always stores the choice, so a campaign that has made one never falls back to a carried-over default.
 */
export function setCategories(draft: CampaignState, reg: Registries, enabled: string[]): EngineEvent[] {
  const known = [...reg.contentCategories.values()].sort((a, b) => Number(a.order) - Number(b.order)).map((c) => String(c.id));
  const next = known.filter((id) => enabled.includes(id));
  const before = enabledCategories(draft);
  const added = next.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !next.includes(id));
  draft.content = { enabled: next };
  if (added.length === 0 && removed.length === 0) return [];
  if (removed.length > 0) withdrawTagged(draft, reg, removed);
  syncRulesWithContent(draft, reg); // P9d: proposals under a removed category go, active rules are suspended; suspended ones come back when allowed
  return [{ type: 'content_changed', added, removed }];
}

/** Drops the open items tagged with a removed category: no deltas, no events. */
function withdrawTagged(draft: CampaignState, reg: Registries, removed: string[]): void {
  const hit = (tags: string[]) => tags.some((t) => removed.includes(t));
  const demands = draft.discipline?.demands;
  if (draft.discipline && demands) {
    const gone = demands.filter((d) => hit(tagsOf(reg.demandTemplates.get(d.templateId) ?? {})));
    if (gone.length > 0) {
      draft.discipline.demands = demands.filter((d) => !gone.includes(d));
      // a withdrawn demand does not count against her weekly openings
      draft.discipline.demandLog = draft.discipline.demandLog.filter((e) => !gone.some((d) => d.unitId === e.unitId && d.day === e.day && d.templateId === e.templateId));
    }
  }
  // P9c: a wager whose stake is tagged with a removed category is void (no deltas) and a running mark ends
  const personal = draft.personal;
  if (personal?.wagers) {
    personal.wagers.open = personal.wagers.open.filter((w) => !hit(tagsOf(reg.wagerStakes.get(w.stakeId) ?? {})));
  }
  if (personal?.mark && [...reg.wagerStakes.values()].some((x) => x.effect === 'mark' && hit(tagsOf(x)))) delete personal.mark;
  // P9c: a level-4 edit waiting for KEEP / REVERT goes quietly when jealousy games are switched off (she still edited today)
  if (draft.personal?.intercepts?.open && hit(['jealousy_games'])) delete draft.personal.intercepts.open;
  draft.calendar.nightEventsQueue = draft.calendar.nightEventsQueue.filter((e) => !hit(e.contentTags ?? []));
  if (draft.calendar.nightEvent && hit(draft.calendar.nightEvent.contentTags ?? [])) delete draft.calendar.nightEvent;
}

/** The categories that are switched off, in registry order, with their labels (what the extraction is told to watch for). */
export function disabledCategories(state: Pick<ContentHolder, 'content'>, reg: Registries): Array<{ id: string; label: string }> {
  const on = enabledCategories(state);
  return [...reg.contentCategories.values()]
    .sort((a, b) => Number(a.order) - Number(b.order))
    .filter((c) => !on.includes(String(c.id)))
    .map((c) => ({ id: String(c.id), label: String(c.label) }));
}

/** The labels of what a named unit will not take part in (her own limits), in registry order; empty for a grunt. */
export function ownLimitLabels(unit: Pick<Unit, 'kind' | 'bond'>, reg: Registries): string[] {
  const bond = bondOf(unit);
  if (!bond) return [];
  return [...reg.contentCategories.values()]
    .sort((a, b) => Number(a.order) - Number(b.order))
    .filter((c) => bond.ownLimits.categories.includes(String(c.id)))
    .map((c) => String(c.label));
}

/**
 * What a flag may keep: ids of categories that exist and are switched off now (a flag on one that is on, or unknown, is
 * dropped), each once, at most `TUNING.bonds.limits.maxViolations`.
 */
export function flaggedCategories(state: Pick<ContentHolder, 'content'>, reg: Registries, raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const off = new Set(disabledCategories(state, reg).map((c) => c.id));
  const out: string[] = [];
  for (const c of raw) if (typeof c === 'string' && off.has(c) && !out.includes(c)) out.push(c);
  return out.slice(0, TUNING.bonds.limits.maxViolations);
}
