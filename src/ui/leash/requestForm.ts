import type { LeashKind } from '../../engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../settings';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { motionReduced } from '../motion';
import { renderVoiceCard } from '../voice/voiceCard';
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
  /** The settings that decide whether the review plays out (`reducedMotion`); the defaults when absent. */
  settings?: AliusSettings;
  /** The corporation's name for the verdict card's header (`{CORPORATION} · OVERSIGHT`). */
  corporation?: string;
  /** Called when the verdict card appears (the app plays the stamp). */
  onVerdict?: () => void;
  /** The last line of the review (default `APPROVED`). */
  verdict?: string;
  /** P15: the name of the holder who holds the commander's Leash requests; the form says the request waits for her co-sign. */
  heldBy?: string;
  /**
   * P15: the three ways around her hold, offered only while `heldBy` is set. `disabled` is the reason a route cannot be taken now; the two that
   * need a soldier list who could (`reset`: those who know the device). The choice is reported through `onRoute` before the form resolves `true`.
   */
  routes?: {
    comms: { disabled?: string };
    reset: { disabled?: string; allies: BypassAlly[] };
    ally: { disabled?: string; allies: BypassAlly[] };
  };
  onRoute?: (choice: { route: 'comms' | 'reset' | 'ally'; allyId?: string }) => void;
}

export interface BypassAlly { id: string; name: string }

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

/** P15: the line of a request that waits for a holder's co-sign (the capability's own glossary entry explains it). */
const heldLine = (by: string): HTMLElement => {
  const row = line('CO-SIGN', 'cosign', `HELD FOR ${by.toUpperCase()}'S CO-SIGN`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:capability_leash_block'))) row.setAttribute(k, v);
  return row;
};

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
    ...(o.heldBy !== undefined ? [heldLine(o.heldBy)] : []),
  );
  const paper = (inner: Node): HTMLElement => renderVoiceCard({ voice: 'paper', meta: 'CCP OVERSIGHT OFFICE · FORM OR-7', body: inner });
  const routes = o.heldBy !== undefined ? o.routes : undefined;
  const routeAction = (id: 'comms' | 'reset' | 'ally', label: string): { label: string; value: string; disabled?: string; analyze: string } => {
    const r = routes![id];
    return { label, value: id, analyze: `glossary:leash_bypass_${id}`, ...(r.disabled !== undefined ? { disabled: r.disabled } : o.left < 1 ? { disabled: NO_AUTHORIZATIONS } : {}) };
  };
  let choice: string | null;
  for (;;) {
    choice = await shell.modal({
      title, body: paper(form),
      actions: [
        { label: '[ FILE REQUEST ]', value: 'file', ...(o.left < 1 ? { disabled: NO_AUTHORIZATIONS } : {}) },
        ...(routes !== undefined ? [routeAction('comms', '[ COMMS TERMINAL ]'), routeAction('reset', '[ RESET THE DEVICE ]'), routeAction('ally', '[ ASK A SOLDIER ]')] : []),
        { label: '[ WITHDRAW ]', value: 'withdraw' },
      ],
    });
    if (routes === undefined || (choice !== 'comms' && choice !== 'reset' && choice !== 'ally')) break;
    if (choice === 'comms') { o.onRoute?.({ route: 'comms' }); choice = 'file'; break; }
    // the two routes through a soldier ask who
    const allies = routes[choice].allies;
    const who = await shell.modal({
      title: choice === 'reset' ? 'WHO WORKS ON THE DEVICE' : 'WHO FILES IT',
      body: paper(h('div', { class: 'alius-form' }, line('REQUEST', 'request', `${ACTION[o.kind]} — ${o.unitName}`))),
      actions: [...allies.map((a) => ({ label: `[ ${a.name.toUpperCase()} ]`, value: `ally:${a.id}`, analyze: `glossary:leash_bypass_${choice as 'reset' | 'ally'}` })), { label: '[ BACK ]', value: 'back' }],
    });
    if (who?.startsWith('ally:')) { o.onRoute?.({ route: choice, allyId: who.slice('ally:'.length) }); choice = 'file'; break; }
    if (who === null) return false;
  }
  if (choice !== 'file') return false;

  const delay = o.delayMs ?? (motionReduced(o.settings ?? DEFAULT_SETTINGS) ? 0 : 1800);
  const status = h('div', { class: 'alius-form-status', 'aria-live': 'polite' });
  void shell.modal({ title, body: paper(h('div', { class: 'alius-form' }, form, status)), actions: [] });
  const add = (text: string): void => void status.append(h('div', { class: 'alius-form-line' }, text));
  add('TRANSMITTING…');
  if (delay > 0) await sleep(delay / 3);
  add('OVERSIGHT REVIEW…');
  if (delay > 0) await sleep(delay / 3);
  status.append(renderVoiceCard({
    voice: 'corporate', title: `${(o.corporation ?? 'CCP').toUpperCase()} · OVERSIGHT`, body: o.verdict ?? 'APPROVED', level: 3,
  }));
  o.onVerdict?.();
  if (delay > 0) await sleep(delay / 3);
  shell.closeModal();
  return true;
}
