import type { PunishmentEffect } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import { contentAllowed } from '../../engine/bonds';
import { checkPunish } from '../../engine/discipline';
import type { CampaignState } from '../../engine/state/types';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface DisciplineMenuCtx {
  state: CampaignState;
  registries: Registries;
  unitId: string;
  /** `days` is set only for a measure that takes some (the brig). */
  onPunish: (measure: string, days?: number) => void;
}

const confineOf = (entry: Entry): Extract<PunishmentEffect, { type: 'confine' }> | undefined =>
  ((entry.sideEffects as PunishmentEffect[] | undefined) ?? []).find((e): e is Extract<PunishmentEffect, { type: 'confine' }> => e.type === 'confine');

/**
 * The commander's ladder of consequences below the Leash (P9): one button per punishment, from the lightest to the
 * heaviest, a day picker for the measure that takes days, and a soft-disabled button (`aria-disabled`, the reason in the
 * title) for a measure the engine would refuse right now. Everything is text; the labels come from the registry.
 */
export function renderDisciplineMenu(ctx: DisciplineMenuCtx): HTMLElement {
  const { state, registries: reg, unitId } = ctx;
  const entries = [...reg.punishments.values()]
    .filter((e) => contentAllowed(state, reg, e)) // P9d: a measure tagged with a category that is off is not offered
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Number(a.e.severity) - Number(b.e.severity) || a.i - b.i)
    .map((x) => x.e);
  const rows = entries.map((e) => {
    const id = String(e.id);
    const confine = confineOf(e);
    let days: HTMLSelectElement | null = null;
    if (confine) {
      days = h('select', { class: 'alius-select', 'data-brig-days': id, 'aria-label': `Days of ${String(e.label)}` },
        ...Array.from({ length: confine.maxDays - confine.minDays + 1 }, (_, n) => h('option', { value: String(confine.minDays + n) }, String(confine.minDays + n)))) as HTMLSelectElement;
    }
    const why = checkPunish(state, reg, unitId, id, days ? Number(days.value) : undefined);
    const button = h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-punish': id, ...analyzeNative(`punishments:${id}`, { unitId }),
      ...(why !== null ? { 'aria-disabled': 'true', title: why } : {}),
      onclick: () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        ctx.onPunish(id, days ? Number(days.value) : undefined);
      },
    }, String(e.label).toUpperCase());
    return h('div', { class: 'alius-punish-row' }, button, days);
  });
  return h('details', { class: 'alius-discipline', 'data-discipline-menu': unitId }, h('summary', {}, '[ DISCIPLINE ]'), ...rows);
}
