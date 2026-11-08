import { clockText } from '../../engine/calendar';
import type { CampaignState } from '../../engine/state/types';
import { h } from '../dom';

/** The PDA header: clock, resources, Leash authorizations and warnings. Replaces the host's content. */
export function renderStatusHeader(host: HTMLElement, state: CampaignState | null): void {
  host.replaceChildren();
  if (!state) {
    host.append(h('span', { class: 'alius-clock' }, 'NO CAMPAIGN'));
    return;
  }
  const r = state.resources;
  const injuredDays = (state.commander.injuredUntilDay ?? 0) - state.day;
  const shortage = state.calendar.shortageStreak ?? 0;
  const parts: Array<HTMLElement | null> = [
    h('span', { class: 'alius-clock' }, clockText(state.day, state.slot)),
    h('span', { class: 'alius-resources' }, `CR ${r.credits} · SUP ${r.supplies} · PLYX ${r.plyx}`),
    h('span', { class: 'alius-leash' }, `LEASH ${state.leash.authorizationsLeft}`),
    injuredDays > 0 ? h('span', { class: 'alius-warn' }, `INJURED ${injuredDays}d`) : null,
    shortage > 0 ? h('span', { class: 'alius-warn' }, `SHORTAGE ${shortage}d`) : null,
  ];
  host.append(...parts.filter((p): p is HTMLElement => p !== null));
}
