import type { LeashKind } from '../../engine/state/types';
import { h } from '../dom';
import type { ModalOpts } from '../shell/modal';

/** The two shell functions the form needs. */
export interface LeashFormShell {
  modal(opts: ModalOpts): Promise<string | null>;
  closeModal(): void;
}

export interface LeashFormOpts {
  kind: LeashKind;
  unitName: string;
  /** The log number this request will get. */
  no: number;
  left: number;
  cost?: { trust: number; affinity: number; stress: number; failChance: number };
  cause?: string;
  showNumbers: boolean;
  /** How long the "review" takes to show (default 1800; 0 when the user prefers reduced motion). */
  delayMs?: number;
  /** The last line of the review (default `APPROVED`). */
  verdict?: string;
}

const ACTION: Record<LeashKind, string> = {
  compel: 'COMPEL — NEURAL COMPLIANCE BURST',
  suppress: 'SUPPRESS — FULL MOTOR LOCKDOWN',
  terminate: 'TERMINATE — PERMANENT DEACTIVATION',
};
const DEFAULT_GROUNDS: Record<LeashKind, string> = {
  compel: 'SUBJECT DECLINED A DIRECT ORDER',
  suppress: 'DESERTION OR ASSAULT IN PROGRESS',
  terminate: 'CAUSE ON FILE',
};
export const NO_AUTHORIZATIONS = 'NO AUTHORIZATIONS REMAIN THIS WEEK';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const reducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** The consequence in words; numbers only when the player chose to see raw values. */
function consequence(o: LeashFormOpts): string {
  const c = o.cost;
  if (o.kind === 'terminate') return 'IRREVERSIBLE. THE SQUAD WILL REMEMBER.';
  if (o.kind === 'suppress') {
    return o.showNumbers && c
      ? `TRUST −${c.trust} · STRESS +${c.stress} · THE REST OF THE SQUAD IS SHAKEN.`
      : 'SUBJECT TRUST DROPS HARD AND THE REST OF THE SQUAD IS SHAKEN.';
  }
  const mayFail = c !== undefined && c.failChance > 0;
  if (o.showNumbers && c) {
    return `TRUST −${c.trust} · AFFINITY −${c.affinity} · STRESS +${c.stress}${mayFail ? ` · THE BURST MAY FAIL (${Math.round(c.failChance * 100)}%)` : ''}`;
  }
  return `SUBJECT WILL NOT FORGET: TRUST AND WARMTH DROP SHARPLY AND STRESS RISES.${mayFail ? ' THE BURST MAY FAIL.' : ''}`;
}

const line = (key: string, id: string, value: string): HTMLElement =>
  h('div', { class: 'alius-form-line', 'data-line': id }, h('span', { class: 'alius-form-key' }, key), h('span', { class: 'alius-form-val' }, value));

/**
 * The cold bureaucratic form every Leash request is filed through. Resolves `true` once the request was filed and the
 * "review" has run its course, `false` when it was withdrawn. The caller then dispatches the action.
 */
export async function fileLeashRequest(shell: LeashFormShell, o: LeashFormOpts): Promise<boolean> {
  const title = `OVERSIGHT REQUEST #${String(o.no).padStart(4, '0')}`;
  const form = h('div', { class: 'alius-form' },
    line('SUBJECT', 'subject', o.unitName),
    line('ACTION', 'action', ACTION[o.kind]),
    line('GROUNDS', 'grounds', o.cause ?? DEFAULT_GROUNDS[o.kind]),
    line('AUTHORIZATIONS REMAINING', 'remaining', String(o.left)),
    line('CONSEQUENCE', 'consequence', consequence(o)),
  );
  const choice = await shell.modal({
    title, body: form,
    actions: [
      { label: '[ FILE REQUEST ]', value: 'file', ...(o.left < 1 ? { disabled: NO_AUTHORIZATIONS } : {}) },
      { label: '[ WITHDRAW ]', value: 'withdraw' },
    ],
  });
  if (choice !== 'file') return false;

  const delay = o.delayMs ?? (reducedMotion() ? 0 : 1800);
  const status = h('div', { class: 'alius-form-status', 'aria-live': 'polite' });
  void shell.modal({ title, body: h('div', { class: 'alius-form' }, form, status), actions: [] });
  const add = (text: string): void => void status.append(h('div', { class: 'alius-form-line' }, text));
  add('TRANSMITTING…');
  if (delay > 0) await sleep(delay / 3);
  add('OVERSIGHT REVIEW…');
  if (delay > 0) await sleep(delay / 3);
  add(o.verdict ?? 'APPROVED');
  if (delay > 0) await sleep(delay / 3);
  shell.closeModal();
  return true;
}
