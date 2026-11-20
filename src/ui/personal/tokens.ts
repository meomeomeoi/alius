import type { Registries } from '../../content/types';
import { wearProblem } from '../../engine/personal/tokens';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface TokenHandlers {
  onWear(tokenId: string): void;
  onTakeOff(tokenId: string): void;
}

/**
 * The TOKENS block of the CMDR dossier (P9c §4): every token the commander keeps (worn first), its giver, the lock a won wager
 * put on it, [WEAR] (soft-disabled with the engine's own message when two are worn) and [TAKE OFF], and the mark of a won wager.
 * `null` when there is nothing to show. Text only.
 */
export function renderTokens(state: CampaignState, reg: Registries, handlers: TokenHandlers): HTMLElement | null {
  void reg;
  const owned = state.personal?.tokens?.owned ?? [];
  const mark = state.personal?.mark;
  const marked = mark !== undefined && state.day <= mark.untilDay ? state.squad.find((u) => u.id === mark.unitId) : undefined;
  if (owned.length === 0 && !marked) return null;
  const block = h('div', { class: 'alius-tokens' }, h('h3', {}, 'TOKENS'));
  for (const t of [...owned].sort((a, b) => Number(b.worn) - Number(a.worn))) {
    const locked = t.lockedUntil !== undefined && t.lockedUntil > state.day;
    const problem = t.worn ? null : wearProblem(state, t.id);
    const wear = h('button', {
      type: 'button', class: 'alius-btn alius-tagchip', 'data-action': t.worn ? 'take-off' : 'wear', ...analyzeNative('glossary:token', { tokenId: t.id }),
      ...(problem !== null ? { 'aria-disabled': 'true', title: problem } : {}),
      onclick: () => {
        if (t.worn) handlers.onTakeOff(t.id);
        else if (problem === null) handlers.onWear(t.id);
      },
    }, t.worn ? '[ TAKE OFF ]' : '[ WEAR ]');
    block.append(h('div', { class: 'alius-token', 'data-token': t.id, 'data-worn': String(t.worn) },
      h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:token', { tokenId: t.id }) }, `${t.label.toUpperCase()}${t.worn ? ' — WORN' : ''}${locked ? ` — LOCKED UNTIL DAY ${t.lockedUntil}` : ''}`),
      ' ', wear));
  }
  if (marked && mark) {
    block.append(h('p', { class: 'alius-token-mark' },
      h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:wager', { unitId: marked.id }) }, `THE COMMANDER BEARS ${marked.displayName.toUpperCase()}'S MARK UNTIL DAY ${mark.untilDay}`)));
  }
  return block;
}
