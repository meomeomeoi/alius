import type { Registries } from '../../content/types';
import { isLiving } from '../../engine/economy';
import type { ProposalAnswer } from '../../engine/relations/proposals';
import type { CampaignState, Unit } from '../../engine/state/types';
import { h } from '../dom';
import { drawProposalChips } from '../proposalChips';

export interface CommsTabCtx {
  getState: () => CampaignState | null;
  registries: Registries;
  onSend: (unitId: string, text: string) => void;
  onRead: (unitId: string) => void;
  onAnswer: (proposalId: string, answer: ProposalAnswer) => void;
}

/** The open thread and the half-typed text survive a re-render (the tab redraws after every action). */
const selected = new WeakMap<HTMLElement, string>();
const drafts = new WeakMap<HTMLElement, string>();

const unread = (state: CampaignState, id: string): number => (state.dms[id] ?? []).filter((m) => m.from !== 'commander' && !m.read).length;
const stamp = (day: number, slot: string): string => `DAY ${String(day).padStart(3, '0')} // ${slot.toUpperCase()}`;

/** The COMMS tab: a retro messenger with one thread per named, living unit. */
export function renderCommsTab(host: HTMLElement, ctx: CommsTabCtx): void {
  host.replaceChildren();
  const state = ctx.getState();
  if (!state) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT')));
    return;
  }
  const contacts: Unit[] = state.squad.filter((u) => u.kind === 'named' && isLiving(u));
  if (contacts.length === 0) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO CONTACTS')));
    return;
  }
  let current = selected.get(host);
  if (current && !contacts.some((u) => u.id === current)) {
    selected.delete(host);
    current = undefined;
  }

  const open = (id: string): void => {
    selected.set(host, id);
    ctx.onRead(id);
    renderCommsTab(host, ctx);
  };
  const list = h('div', { class: 'alius-threads', role: 'list' }, ...contacts.map((u) => {
    const n = unread(state, u.id);
    const dot = n > 0 ? h('span', { class: 'alius-dot', 'aria-label': `${n} unread` }, '●') : null;
    return h('button', { type: 'button', class: `alius-btn alius-contact${u.id === current ? ' is-open' : ''}`, 'data-unit': u.id, onclick: () => open(u.id) }, u.displayName, ' ', dot);
  }));

  const thread = h('div', { class: 'alius-thread', role: 'log', 'aria-live': 'polite' });
  if (!current) {
    thread.append(h('p', { class: 'alius-dim' }, 'SELECT A CONTACT'));
  } else {
    const unit = contacts.find((u) => u.id === current)!;
    thread.append(h('h3', {}, `// ${unit.displayName.toUpperCase()}`));
    for (const m of state.dms[current] ?? []) {
      const text = h('span', { class: 'alius-msg-text' });
      text.textContent = m.text;
      thread.append(h('div', { class: `alius-msg ${m.from === 'commander' ? 'is-commander' : 'is-unit'}` },
        h('span', { class: 'alius-msg-meta' }, `${stamp(m.day, m.slot)}${m.initiated ? ' · SHE WROTE FIRST' : ''}`), text));
    }
    const chips = h('div', { class: 'alius-chips' });
    drawProposalChips(chips, state, (p) => p.channel === 'dm' && p.unitId === current, ctx.onAnswer);
    const input = h('input', { type: 'text', name: 'dm', class: 'alius-input', autocomplete: 'off', 'aria-label': `Message ${unit.displayName}` }) as HTMLInputElement;
    input.value = drafts.get(host) ?? '';
    input.addEventListener('input', () => drafts.set(host, input.value));
    const send = (): void => {
      const text = input.value.trim();
      if (text === '') return;
      input.value = '';
      drafts.delete(host);
      ctx.onSend(unit.id, text);
    };
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') send();
    });
    thread.append(chips, h('div', { class: 'alius-cmd' }, h('span', { class: 'alius-prompt' }, 'MSG>'), input, h('button', { type: 'button', class: 'alius-btn', 'data-action': 'send', onclick: send }, '[SEND]')));
    // messages that arrived while the thread was open: mark them read (after this render, so it cannot re-enter it)
    if (unread(state, current) > 0) queueMicrotask(() => ctx.onRead(unit.id));
  }
  host.append(h('section', { class: 'alius-section alius-comms' }, h('h2', {}, '[ PDA COMMS ]'), h('div', { class: 'alius-comms-body' }, list, thread)));
}
