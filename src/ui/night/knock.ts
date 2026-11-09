import type { NightEntry } from '../../engine/state/types';
import { h } from '../dom';

export interface KnockCtx {
  entry: NightEntry;
  unitName: string;
  onOpen: () => void;
  onIgnore: () => void;
}

const DOOR = [
  '  ┌────────────┐',
  '  │ ░░░░░░░░░░ │',
  '  │ ░░░░░░░░░░ │',
  '  │ ░░░░░░░░░░ │',
  '  │ ░░░░░░░░░░ │',
  '  │          ● │',
  '  └────────────┘',
].join('\n');

/** The knock at the door during the Night slot: [OPEN] starts the scene, [IGNORE] takes the consequence. */
export function renderKnock(host: HTMLElement, ctx: KnockCtx): void {
  host.replaceChildren();
  const framing = h('p', { class: 'alius-knock-text' });
  framing.textContent = ctx.entry.framing;
  const art = h('pre', { class: 'alius-ascii', 'aria-hidden': 'true' });
  art.textContent = DOOR;
  let used = false;
  const buttons: HTMLButtonElement[] = [];
  const press = (fn: () => void) => () => {
    if (used) return;
    used = true;
    for (const b of buttons) b.disabled = true;
    fn();
  };
  const open = h('button', { type: 'button', class: 'alius-btn', 'data-action': 'open', onclick: press(ctx.onOpen) }, '[OPEN]') as HTMLButtonElement;
  const ignore = h('button', { type: 'button', class: 'alius-btn', 'data-action': 'ignore', onclick: press(ctx.onIgnore) }, '[IGNORE]') as HTMLButtonElement;
  buttons.push(open, ignore);
  host.append(h('section', { class: 'alius-section alius-knock', 'aria-label': `${ctx.unitName} at the door` },
    h('h2', {}, '[ NIGHT // KNOCK ]'), art, framing, h('div', { class: 'alius-row' }, open, ignore)));
}
