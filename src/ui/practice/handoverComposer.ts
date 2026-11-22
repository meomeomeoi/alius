import type { Registries } from '../../content/types';
import { handoverProblem } from '../../engine/practice/handover';
import { HANDOVER_KINDS, type HandoverKind } from '../../engine/practice/state';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

export interface HandoverComposerCtx {
  state: CampaignState;
  reg: Registries;
  /** The holder it is for. */
  unitId: string;
  /** The choice, once both are made: the app dispatches `practice/hand_over`. */
  onSend: (kind: HandoverKind, days: number) => void;
  onClose: () => void;
  /** What outlives a redraw: the element the surface keeps (its choice is kept on it). Default: `host`. */
  memory?: HTMLElement;
}

const LABEL: Readonly<Record<HandoverKind, string>> = { device: 'THE DEVICE', key: 'THE KEY', calendar: 'THE CALENDAR' };
const DAY_WORDS = ['', 'ONE DAY', 'TWO DAYS', 'THREE DAYS', 'FOUR DAYS', 'FIVE DAYS', 'SIX DAYS', 'SEVEN DAYS'] as const;
const KIND_LINE: Readonly<Record<HandoverKind, string>> = {
  device: 'Every message the commander sends to anyone else goes through her hand first, for the day.',
  key: 'She may come into the commander\'s quarters at any hour, for as long as it stands.',
  calendar: 'She fills the commander\'s free slots, for as long as it stands; the commander lives them.',
};

/** What is chosen so far, per surface. */
const memories = new WeakMap<HTMLElement, { kind?: HandoverKind; days?: number }>();

/**
 * The composer of `[ GIVE HER … ]` (P16, plan R17, spec §R.6): the three kinds the commander may put in a holder's hands (the device for a day, the key for one to seven days, the calendar for one to three) and, once a
 * kind is chosen, the days it can be given for (a device is one). Sending hands the choice to the app, which writes the card the commander says yes to in words and signs. A kind she has already (or that waits for the words)
 * is closed with the reason. Words, never digits; every element is addressed by the glossary.
 */
export function renderHandoverComposer(host: HTMLElement, ctx: HandoverComposerCtx): void {
  const { state, reg } = ctx;
  const unit = state.squad.find((u) => u.id === ctx.unitId);
  if (unit === undefined) return;
  const key = ctx.memory ?? host;
  const mem = memories.get(key) ?? {};
  memories.set(key, mem);
  const live = { unitId: unit.id };
  const redraw = (): void => renderHandoverComposer(host, ctx);
  const button = (attrs: Record<string, unknown>, text: string, onclick: () => void): HTMLElement => h('button', { type: 'button', class: 'alius-btn alius-tagchip', ...analyzeNative('glossary:handover', live), ...attrs, onclick }, text);

  const kinds = HANDOVER_KINDS.map((kind) => {
    const range = TUNING.practice.handover.days[kind];
    const why = handoverProblem(state, reg, unit.id, kind, range.min);
    return button({ 'data-handover-kind': kind, 'aria-pressed': String(mem.kind === kind), ...(why !== null ? { 'aria-disabled': 'true', title: why } : {}) }, `[ ${LABEL[kind]} ]`, () => {
      if (why !== null) return;
      mem.kind = kind;
      mem.days = range.min === range.max ? range.min : undefined;
      redraw();
    });
  });
  const range = mem.kind === undefined ? undefined : TUNING.practice.handover.days[mem.kind];
  const options = range === undefined || range.min === range.max ? [] : Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i);
  const dayRow = options.length === 0 ? null : h('div', { class: 'alius-handover-days', role: 'group', 'aria-label': 'For how long' },
    ...options.map((n) => button({ 'data-handover-days': String(n), 'aria-pressed': String(mem.days === n) }, `[ ${DAY_WORDS[n]} ]`, () => { mem.days = n; redraw(); })),
  );
  const ready = mem.kind !== undefined && mem.days !== undefined;
  const send = button({ 'data-action': 'handover-send', ...(ready ? {} : { 'aria-disabled': 'true' }) }, '[ OFFER IT ]', () => {
    if (mem.kind === undefined || mem.days === undefined) return;
    const kind = mem.kind;
    const days = mem.days;
    memories.delete(key);
    ctx.onSend(kind, days);
  });
  const cancel = button({ 'data-action': 'handover-cancel' }, '[ CANCEL ]', () => { memories.delete(key); ctx.onClose(); });
  const body = h('div', { class: 'alius-handover-body' },
    h('p', { class: 'alius-handover-intro' }, `Put something in ${unit.displayName}'s hands.`),
    h('div', { class: 'alius-handover-kinds', role: 'group', 'aria-label': 'What to give' }, ...kinds),
    mem.kind !== undefined ? h('p', { class: 'alius-handover-line alius-dim' }, KIND_LINE[mem.kind]) : null,
    dayRow, h('div', { class: 'alius-handover-answers' }, send, cancel));
  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body, accent: unitAccent(unit.id) });
  card.classList.add('alius-handover');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `Hand something to ${unit.displayName}`);
  host.replaceChildren(card);
}
