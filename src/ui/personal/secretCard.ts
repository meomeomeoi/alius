import type { Registries } from '../../content/types';
import type { SecretAnswer } from '../../engine/personal/secrets';
import type { CampaignState, SquadSecret } from '../../engine/state/types';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';

/** How the secret came out, in words (the route names are the engine's). */
const ROUTE_WORDS: Record<string, string> = {
  insight: 'You read it in the room.',
  slip: 'Somebody let it slip.',
  night: 'It was told at the door.',
  frequency: 'It came over the wire.',
};

/** The ranges of the text that hold the name of anyone who keeps the secret (the bars hide them until the commander answers). */
function nameRanges(state: CampaignState, secret: SquadSecret): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const id of secret.knownBy) {
    const name = state.squad.find((u) => u.id === id)?.displayName;
    if (!name) continue;
    // whole words only: "Ann" is not hidden inside "Annex"
    const word = new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'gu');
    for (const m of secret.text.matchAll(word)) ranges.push([m.index!, m.index! + m[0].length]);
  }
  return ranges;
}

/**
 * The card the commander answers when something the squad kept back comes out (P9c §5): a paper card with the text, the
 * knowers' names behind bars, and the three answers [CONFRONT EVERYONE] [PRETEND NOT TO KNOW] [USE IT]. Text only; the choice
 * goes to `onChoose(choice, secretId)`.
 */
export function renderSecretCard(
  state: CampaignState, _reg: Registries, secret: SquadSecret, onChoose: (choice: SecretAnswer, secretId: string) => void,
): HTMLElement {
  const choice = (label: string, answer: SecretAnswer): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-action': answer,
    ...analyzeNative('glossary:squad_secret', { secretId: secret.id }), onclick: () => onChoose(answer, secret.id),
  }, label);
  return h('div', { class: 'alius-secret', 'data-secret': secret.id },
    renderVoiceCard({
      voice: VOICE_OF.squad_secret, title: 'SQUAD SECRET', meta: ROUTE_WORDS[secret.foundRoute ?? ''] ?? 'It has come out.',
      body: secret.text, redact: nameRanges(state, secret),
    }),
    h('div', { class: 'alius-secret-actions' }, choice('[ CONFRONT EVERYONE ]', 'confront'), choice('[ PRETEND NOT TO KNOW ]', 'pretend'), choice('[ USE IT ]', 'use')));
}
