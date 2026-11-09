import type { ChronicleEntry, CampaignState } from '../../engine/state/types';
import { h } from '../dom';

export interface LogTabCtx {
  getState: () => CampaignState | null;
}

const day3 = (n: number): string => String(n).padStart(3, '0');

function heading(e: ChronicleEntry): string {
  if (e.kind === 'week') return `DAYS ${day3(e.day)}–${day3(e.toDay ?? e.day)} // WEEK`;
  if (e.kind === 'day') return `DAY ${day3(e.day)} // SUMMARY`;
  return e.slot ? `DAY ${day3(e.day)} // ${e.slot.toUpperCase()}` : `DAY ${day3(e.day)}`;
}

/** Weeks first, then days, then scene lines; each group newest first. */
export function chronicleOrder(entries: ChronicleEntry[]): ChronicleEntry[] {
  const group = (kind: ChronicleEntry['kind']) => entries.filter((e) => e.kind === kind);
  return [
    ...group('week').sort((a, b) => b.day - a.day),
    ...group('day').sort((a, b) => b.day - a.day),
    ...group('scene').reverse(),
  ];
}

/** The LOG tab: the chronicle as an old-forum thread, "CCP INCIDENT LOG". */
export function renderLogTab(host: HTMLElement, ctx: LogTabCtx): void {
  host.replaceChildren();
  const state = ctx.getState();
  if (!state) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT')));
    return;
  }
  const posts = chronicleOrder(state.memory.chronicle).map((e) => {
    const text = h('div', { class: 'alius-post-text' });
    text.textContent = e.text;
    return h('article', { class: `alius-post is-${e.kind}`, 'data-entry': e.id }, h('div', { class: 'alius-post-head' }, heading(e)), text);
  });
  host.append(h('section', { class: 'alius-section alius-log-thread' },
    h('h2', {}, '[ CCP INCIDENT LOG ]'),
    posts.length > 0 ? h('div', { class: 'alius-posts' }, ...posts) : h('p', { class: 'alius-dim' }, 'NO ENTRIES YET'),
  ));
}
