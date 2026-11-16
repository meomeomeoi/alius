import type { Registries } from '../../content/types';
import { STAKE_WORDS } from '../../engine/personal/words';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { unitAccent } from '../voice/voiceCard';

/** What a decided wager reports (the `wager_resolved` event). */
export type WagerResult = { unitId?: unknown; gameId?: unknown; stakeId?: unknown; winner?: unknown } & Record<string, unknown>;

/** The result of a wager, as a card: who won, what the game showed (the cards, the hands, the bout) and what the stake did. Text only. */
export function renderWagerCard(state: CampaignState, reg: Registries, result: WagerResult): HTMLElement {
  const unitId = String(result.unitId);
  const name = state.squad.find((u) => u.id === unitId)?.displayName ?? unitId;
  const game = reg.wagerGames.get(String(result.gameId));
  const stake = reg.wagerStakes.get(String(result.stakeId));
  const winner = result.winner === 'unit' ? 'unit' : result.winner === 'commander' ? 'commander' : 'void';
  const chip = h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:wager', { unitId }) }, 'WAGER');
  chip.style.setProperty('--unit-accent', unitAccent(unitId));
  const detail: string[] = [];
  if (result.commanderCard !== undefined) detail.push(`YOUR CARD ${String(result.commanderCard)} · HER CARD ${String(result.herCard)}`);
  const throws = result.throws as Array<{ hers: string }> | undefined;
  if (Array.isArray(throws)) detail.push(`YOU THREW ${String(result.hand).toUpperCase()} · SHE THREW ${throws.map((t) => t.hers.toUpperCase()).join(', THEN ')}`);
  if (result.rounds !== undefined) detail.push(`A BOUT OF ${String(result.rounds)} ROUNDS${result.draw ? ' (A DRAW GOES TO HER)' : ''}`);
  const words = STAKE_WORDS[String(stake?.effect)];
  return h('div', { class: 'alius-wager-card', 'data-wager-result': winner },
    h('p', {}, chip, ` ${winner === 'unit' ? `${name.toUpperCase()} WINS` : winner === 'commander' ? 'THE COMMANDER WINS' : 'NOBODY WINS — VOID'}`),
    h('p', { class: 'alius-dim' }, `${String(game?.label ?? result.gameId)} for ${String(stake?.text ?? result.stakeId)}.`),
    ...detail.map((line) => h('p', { class: 'alius-dim' }, line)),
    words && winner !== 'void' ? h('p', {}, winner === 'unit' ? `Her stake: ${words.she}.` : `The commander's stake: ${words.commander}.`) : null);
}
