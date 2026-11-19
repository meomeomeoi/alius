import type { Registries } from '../../content/types';
import { allies, digProblem, hackProblem, kompromatOf, reportProblem, wardenOf } from '../../engine/warden';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface IntrigueDeps {
  /** DIG / HACK STEP: a slot action (`intrigue/act`), with the ally who helps. */
  onAct?: (action: 'dig' | 'hack_step', unitId?: string) => void;
  /** REPORT TO OVERSIGHT: opens the report (no slot). */
  onReport?: () => void;
}

/**
 * The INTRIGUE section of the WARDEN panel (P13 §6), for the player's eyes: who stands with the commander against her, how much kompromat
 * there is against what a report needs, how far the implant hack has come and what still stands in its way. Each button names the engine's
 * reason when it is closed (`aria-disabled`, never removed). The suspicion clock is the engine's alone and is never drawn: not a number,
 * not a band. Appends nothing unless someone holds the leash.
 */
export function renderIntrigueSection(host: HTMLElement, state: CampaignState, reg: Registries, deps: IntrigueDeps = {}): void {
  const ls = state.leashswap;
  if (!ls || !wardenOf(state)) return;
  const allyIds = allies(state);
  const nameOf = (id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
  const kompromat = kompromatOf(state).length;
  const need = TUNING.warden.kompromat.needed;
  const steps = TUNING.warden.hack.steps;
  const digAlly = allyIds[0];
  const hackAlly = allyIds.find((id) => hackProblem(state, reg, id) === null) ?? allyIds[0];
  const digWhy = digProblem(state, reg, digAlly);
  const hackWhy = hackProblem(state, reg, hackAlly);
  const reportWhy = reportProblem(state, reg);

  const action = (label: string, glossary: string, why: string | null, run: () => void): HTMLElement =>
    h('span', { class: 'alius-intrigue-action' },
      h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-action': `intrigue-${label.toLowerCase().replace(/\s+/g, '-')}`, 'aria-disabled': why === null ? null : 'true',
        title: why, ...analyzeNative(`glossary:${glossary}`), onclick: () => { if (why === null) run(); },
      }, `[${label}]`),
      why === null ? null : h('span', { class: 'alius-dim alius-intrigue-why' }, why));

  host.append(h('div', { class: 'alius-warden-intrigue' },
    h('h4', {}, 'INTRIGUE'),
    h('p', {}, h('span', { class: 'alius-chip alius-stat', ...analyzeAttrs('glossary:intrigue') }, `ALLIES: ${allyIds.length === 0 ? 'NONE' : allyIds.map(nameOf).join(', ').toUpperCase()}`)),
    h('p', {}, h('span', { class: 'alius-chip alius-stat', 'data-stat': 'kompromat', ...analyzeAttrs('glossary:kompromat') }, `KOMPROMAT: ${kompromat} / ${need}`)),
    h('p', {}, h('span', { class: 'alius-chip alius-stat', 'data-stat': 'hack', ...analyzeAttrs('glossary:implant_hack') }, `IMPLANT HACK: STEP ${ls.intrigue.hack.step} / ${steps}`)),
    h('div', { class: 'alius-row' },
      action('DIG', 'kompromat', digWhy, () => deps.onAct?.('dig', digAlly)),
      action('HACK STEP', 'implant_hack', hackWhy, () => deps.onAct?.('hack_step', hackAlly)),
      action('REPORT TO OVERSIGHT', 'intrigue', reportWhy, () => deps.onReport?.()))));
}
