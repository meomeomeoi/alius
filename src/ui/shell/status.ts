import { clockText, isQuietNight } from '../../engine/calendar';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';

const stat = (cls: string, text: string, address: string): HTMLElement => h('span', { class: `${cls} alius-stat`, ...analyzeAttrs(address) }, text);

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
    stat('alius-clock', clockText(state.day, state.slot) + (isQuietNight(state) ? ' — QUIET' : ''), 'glossary:slots'),
    h('span', { class: 'alius-resources' },
      stat('alius-res', `CR ${r.credits}`, 'glossary:credits'), ' · ',
      stat('alius-res', `SUP ${r.supplies}`, 'glossary:supplies'), ' · ',
      stat('alius-res', `PLYX ${r.plyx}`, 'glossary:plyx')),
    stat('alius-leash', `LEASH ${state.leash.authorizationsLeft}`, 'glossary:leash'),
    injuredDays > 0 ? stat('alius-warn', `INJURED ${injuredDays}d`, 'glossary:commander_injury') : null,
    shortage > 0 ? stat('alius-warn', `SHORTAGE ${shortage}d`, 'glossary:upkeep') : null,
  ];
  host.append(...parts.filter((p): p is HTMLElement => p !== null));
}
