import type { Registries } from '../../content/types';
import { challengeChance, challengeCooldown, CHALLENGE_STATS, type ChallengeStat } from '../../engine/power/moves';
import { askFirstHolds } from '../../engine/power/herCall';
import { standingOf } from '../../engine/power/standing';
import { leaderOf } from '../../engine/power/state';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface HierarchyHandlers {
  onEndorse(): void;
  onChallenge(stat: ChallengeStat): void;
  /** P9e: gives (`on`) or lifts the standing order "ask me first". Without it the toggle is not drawn. */
  onAskFirst?(unitId: string, on: boolean): void;
}

/** The words for a standing (draft thresholds): `low` under 40, `notable` under 70, `dominant` from 70. */
export const standingBand = (n: number): 'low' | 'notable' | 'dominant' => (n < 40 ? 'low' : n < 70 ? 'notable' : 'dominant');

/** How a challenge looks to the commander in words; the percentage only with raw values on. */
const oddsWord = (p: number): 'UNLIKELY' | 'EVEN' | 'LIKELY' => (p < 0.35 ? 'UNLIKELY' : p < 0.65 ? 'EVEN' : 'LIKELY');

/**
 * The squad-power part of one dossier (P9b): her STANDING as a band word (the number only with raw values), the SQUAD LEADER
 * (or SECOND-IN-COMMAND) badge on the leader, and, on the leader only, [ENDORSE] and [CHALLENGE]. CHALLENGE opens a picker of
 * the five stats with the odds of each; in the cooldown it is `aria-disabled` and says how many days are left. A grunt or a
 * unit out of service gets nothing. Text only.
 */
export function renderHierarchyBlock(
  host: HTMLElement, state: CampaignState, reg: Registries, unitId: string, handlers: HierarchyHandlers, opts: { raw?: boolean } = {},
): void {
  host.replaceChildren();
  const standing = standingOf(state, reg, unitId);
  if (standing === null) return;
  const raw = opts.raw === true;
  const live = { unitId };
  const leader = leaderOf(state);
  const isLeader = leader?.id === unitId;
  const endorsed = state.power?.hierarchy?.endorsed === true;
  const line = h('p', { class: 'alius-hierarchy-line' },
    h('span', { class: 'alius-chip', 'data-standing': unitId, ...analyzeAttrs('glossary:standing', live) }, `STANDING: ${standingBand(standing).toUpperCase()}${raw ? ` (${standing})` : ''}`));
  if (isLeader) {
    line.append(' · ', h('span', { class: 'alius-chip', 'data-leader-badge': unitId, ...analyzeAttrs('glossary:squad_leader', live) }, endorsed ? 'SECOND-IN-COMMAND' : 'SQUAD LEADER'));
  }
  const asksFirst = askFirstHolds(state, unitId);
  if (asksFirst) line.append(' · ', h('span', { class: 'alius-chip', 'data-asks-first': unitId, ...analyzeAttrs('glossary:ask_first', live) }, 'ASKS FIRST'));
  host.append(line);
  if (handlers.onAskFirst) {
    const atBase = state.expedition === undefined; // a base order: the engine refuses it during a run
    const onAskFirst = handlers.onAskFirst;
    host.append(h('p', { class: 'alius-hierarchy-actions' }, h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-ask-first': unitId, 'aria-pressed': String(asksFirst), ...analyzeNative('glossary:ask_first', live),
      ...(atBase ? {} : { 'aria-disabled': 'true', title: 'Only at the base: a run is under way.' }),
      onclick: () => { if (atBase) onAskFirst(unitId, !asksFirst); },
    }, asksFirst ? '[ LET HER DECIDE ]' : '[ ASK ME FIRST ]')));
  }
  if (!isLeader) return;

  const left = challengeCooldown(state);
  const picker = h('div', { class: 'alius-challenge-picker', hidden: true });
  const row = h('p', { class: 'alius-hierarchy-actions' });
  if (!endorsed) {
    row.append(h('button', { type: 'button', class: 'alius-btn alius-option', 'data-power-act': 'endorse', ...analyzeNative('glossary:endorse'), onclick: handlers.onEndorse }, '[ ENDORSE ]'), ' ');
  }
  row.append(h('button', {
    type: 'button', class: 'alius-btn alius-option', 'data-power-act': 'challenge', ...analyzeNative('glossary:challenge'),
    ...(left > 0 ? { 'aria-disabled': 'true', title: `The last challenge is too recent: ${left} days left.` } : {}),
    onclick: () => {
      if (left > 0) return;
      picker.hidden = !picker.hidden;
      if (picker.childElementCount > 0) return;
      for (const stat of CHALLENGE_STATS) {
        const p = challengeChance(state, reg, stat);
        picker.append(h('button', {
          type: 'button', class: 'alius-btn alius-option', 'data-challenge-stat': stat, ...analyzeNative('glossary:challenge', { stat }),
          onclick: () => handlers.onChallenge(stat),
        }, `[ ${stat.toUpperCase()}: ${oddsWord(p)}${raw ? ` ${Math.round(p * 100)} %` : ''} ]`), ' ');
      }
    },
  }, '[ CHALLENGE ]'));
  host.append(row);
  if (left > 0) host.append(h('p', { class: 'alius-dim alius-reason' }, `CHALLENGE AVAILABLE IN ${left} DAYS`));
  host.append(picker);
}
