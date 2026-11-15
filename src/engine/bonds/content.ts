import type { Registries, RegistryName } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, Unit } from '../state/types';
import { bondOf } from './profile';

/** Registries whose entries may carry `contentTags` (and the night specs of defects and relationship states do too). */
export const CONTENT_GATED_REGISTRIES = ['demandTemplates', 'punishments', 'dilemmaTemplates', 'missionTemplates', 'clocks'] as const satisfies readonly RegistryName[];

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
  draft.calendar.nightEventsQueue = draft.calendar.nightEventsQueue.filter((e) => !hit(e.contentTags ?? []));
  if (draft.calendar.nightEvent && hit(draft.calendar.nightEvent.contentTags ?? [])) delete draft.calendar.nightEvent;
}
