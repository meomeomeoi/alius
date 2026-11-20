import type { Registries } from '../../content/types';
import { deviceGateReason } from '../../engine/personal/access';
import { BET_PICKS, gamesOffered, offeredStakes } from '../../engine/personal/wagers';
import type { CampaignState } from '../../engine/state/types';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface WagerChoice { gameId: string; stakeId: string; pick?: string }

const BET_WORDS: Record<string, string> = { kills: 'THREE KILLING BLOWS', no_damage: 'NO DAMAGE TAKEN', objective: 'THE OBJECTIVE DONE' };

/**
 * The commander's challenge of one soldier (P9c §6): a game and a stake, and for sparring the handicap her Affinity allows, for
 * the bet on a run what she bets on. Only the stakes that are offered to her are listed (a category that is off never is).
 * Rock-paper-scissors asks for the hand when it is played. Text only.
 */
export function renderWagerForm(state: CampaignState, reg: Registries, unitId: string, onSubmit: (choice: WagerChoice) => void): HTMLElement {
  const root = h('div', { class: 'alius-wager-form', 'data-wager-form': unitId });
  const stakes = offeredStakes(state, reg, unitId);
  const games = gamesOffered(reg);
  if (deviceGateReason(state, unitId) !== null || stakes.length === 0 || games.length === 0) {
    root.append(h('p', { class: 'alius-dim' }, 'NOT OFFERED: nothing is on the table with her now.'));
    return root;
  }
  const live = { unitId };
  const gameSel = h('select', { name: 'game', class: 'alius-select' }, ...games.map((g) => h('option', { value: String(g.id) }, String(g.label)))) as HTMLSelectElement;
  const stakeSel = h('select', { name: 'stake', class: 'alius-select' }, ...stakes.map((x) => h('option', { value: String(x.id) }, String(x.label)))) as HTMLSelectElement;
  const pickHost = h('span', { class: 'alius-wager-pick' });
  const affinity = state.relations[unitId]?.affinity ?? -100;
  const drawPick = (): void => {
    pickHost.replaceChildren();
    const game = reg.wagerGames.get(gameSel.value);
    let options: Array<[string, string]> = [];
    if (game?.kind === 'sparring') {
      options = (game.handicaps as Array<{ id: string; label: string; minAffinity: number }>).filter((x) => affinity >= x.minAffinity).map((x) => [x.id, x.label]);
    } else if (game?.kind === 'expedition_bet') {
      options = BET_PICKS.map((p) => [p, BET_WORDS[p]]);
    }
    if (options.length === 0) return;
    const sel = h('select', { name: 'pick', class: 'alius-select' }, ...options.map(([v, label]) => h('option', { value: v }, label)));
    pickHost.append(h('label', { class: 'alius-option', ...analyzeNative('glossary:wager', live) }, game?.kind === 'sparring' ? 'HANDICAP ' : 'SHE BETS ON ', sel));
  };
  gameSel.addEventListener('change', drawPick);
  drawPick();
  root.append(
    h('label', { class: 'alius-option', ...analyzeNative('glossary:wager', live) }, 'GAME ', gameSel), ' ',
    h('label', { class: 'alius-option', ...analyzeNative('glossary:wager', live) }, 'STAKE ', stakeSel), ' ',
    pickHost, ' ',
    h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-action': 'challenge', ...analyzeNative('glossary:wager', live),
      onclick: () => {
        const pick = (pickHost.querySelector('select') as HTMLSelectElement | null)?.value;
        onSubmit({ gameId: gameSel.value, stakeId: stakeSel.value, ...(pick !== undefined ? { pick } : {}) });
      },
    }, '[ CHALLENGE ]'));
  return root;
}

/** The dossier's [CHALLENGE]: a button that opens the form (only for a named soldier who takes bets: an imported profile and a lead style). */
export function renderChallenge(state: CampaignState, reg: Registries, unitId: string, onSubmit: (choice: WagerChoice) => void): HTMLElement | null {
  if (deviceGateReason(state, unitId) !== null) return null;
  const host = h('div', { class: 'alius-challenge', 'data-challenge': unitId });
  const open = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'open-challenge', ...analyzeNative('glossary:wager', { unitId }) }, '[ CHALLENGE ]');
  open.addEventListener('click', () => {
    if (host.querySelector('.alius-wager-form')) host.querySelector('.alius-wager-form')!.remove();
    else host.append(renderWagerForm(state, reg, unitId, onSubmit));
  });
  host.append(open);
  return host;
}
