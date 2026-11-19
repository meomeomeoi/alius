import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import type { ShellApi } from '../shell/shell';

/** What the menu answers: how to run it again, or a decision about the record. `null` = cancelled. */
export type RetryChoice = { budgetMult: number; profile?: 'main' | 'mechanic' } | 'drop' | 'fallback' | null;

const BUDGETS = [1.5, 2, 3] as const;

/**
 * The `[⋯]` menu of a failure chip: a budget multiplier (×1.5 by default), the profile (shown only when a mechanic profile is
 * set; left alone it is the call's own), `[RETRY]`, `[DROP]` and, for a site that holds a fallback back, `[USE FALLBACK]`.
 */
export async function openRetryMenu(modal: ShellApi['modal'], opts: { hasMechanic: boolean; hasFallback: boolean }): Promise<RetryChoice> {
  const radio = (name: string, value: string, label: string, checked = false) => h('label', { class: 'alius-genmenu-opt', ...analyzeNative('glossary:generation_reasons') },
    h('input', { type: 'radio', name, value, checked }), ` ${label}`);
  const body = h('div', { class: 'alius-genmenu' },
    h('div', { class: 'alius-genmenu-row' }, h('span', {}, 'Budget:'), ...BUDGETS.map((m) => radio('generation-budget', String(m), `×${m}`, m === BUDGETS[0]))),
    ...(opts.hasMechanic
      ? [h('div', { class: 'alius-genmenu-row' }, h('span', {}, 'Model:'), radio('generation-profile', 'main', 'MAIN'), radio('generation-profile', 'mechanic', 'MECHANIC'))]
      : []));
  const answer = await modal({
    title: 'Try again',
    body,
    actions: [
      { label: 'RETRY', value: 'retry' },
      ...(opts.hasFallback ? [{ label: 'USE FALLBACK', value: 'fallback' }] : []),
      { label: 'DROP', value: 'drop' },
      { label: 'CANCEL', value: 'cancel' },
    ],
  });
  if (answer === 'drop' || answer === 'fallback') return answer;
  if (answer !== 'retry') return null;
  const picked = (name: string): string | null => body.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? null;
  const profile = picked('generation-profile');
  return { budgetMult: Number(picked('generation-budget') ?? BUDGETS[0]), ...(profile === 'main' || profile === 'mechanic' ? { profile } : {}) };
}
