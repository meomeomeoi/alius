import type { Registries } from '../../content/types';
import { heldNow } from '../../engine/practice/held';
import { heldEndShown } from '../../engine/practice/view';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** What the strip does: ask to be let go, and send the squad while a kept alarm of a launch or a deadline stands. `sensory` is the engine's `sensoryNow`: only plain lines remain. */
export interface HeldStripHandlers {
  sensory: boolean;
  askRelease: () => void;
  sendSquad: (alarmId: string) => void;
}

const SLOT_WORDS: Readonly<Record<string, string>> = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' };

/** When the hold ends, in words (never a number): "the end of the afternoon", "the end of tomorrow's morning". Nothing for a hold with no duration. */
function endsWords(state: CampaignState, until: { day: number; slot: string }): string {
  const slot = SLOT_WORDS[until.slot] ?? until.slot;
  return until.day === state.day ? `the end of the ${slot}` : `the end of tomorrow's ${slot}`;
}

/**
 * The strip of the shell while the commander is held (P16, plan R11, R24): who keeps the commander, when it ends (as words; a hold with no duration does not say), `[ ASK TO BE LET GO ]`,
 * and `[ SEND THE SQUAD ]` while a kept alarm of a launch or a deadline is open and was accepted. In sensory mode only plain lines remain: no strip, one line of text and still the way to ask.
 * Empties the host when the commander is not held now.
 */
export function drawHeldStrip(host: HTMLElement, state: CampaignState, reg: Registries, handlers: HeldStripHandlers): void {
  host.replaceChildren();
  const held = heldNow(state);
  const holder = held === null ? undefined : state.squad.find((u) => u.id === held.by);
  if (held === null || holder === undefined) return;
  const ctx = { unitId: holder.id };
  const ask = h('button', { type: 'button', class: 'alius-btn', 'data-ask-release': '', ...analyzeNative('glossary:ask_release', ctx), onclick: () => handlers.askRelease() }, '[ ASK TO BE LET GO ]');
  const alarm = state.practices?.alarm;
  const send = alarm !== undefined && alarm.answer === 'keep' && alarm.accepted === true && alarm.kind !== 'night'
    ? h('button', { type: 'button', class: 'alius-btn', 'data-held-send': '', ...analyzeNative('glossary:without_command', ctx), onclick: () => handlers.sendSquad(alarm.id) }, '[ SEND THE SQUAD ]')
    : null;
  if (handlers.sensory) {
    host.append(h('p', { 'data-held-line': '', ...analyzeAttrs('glossary:sensory_mode', ctx) }, `Held in ${holder.displayName}'s quarters.`), ask, ...(send !== null ? [send] : []));
    return;
  }
  const end = heldEndShown(held); // a hold with no duration shows no end (R16)
  const until = end === null ? '' : ` until ${endsWords(state, end)}`;
  host.append(h('div', { class: 'alius-held-strip', 'data-held-strip': '', role: 'status' },
    h('span', { class: 'alius-chip', 'data-held-chip': '', ...analyzeAttrs('glossary:held', ctx) }, 'HELD'),
    h('span', { class: 'alius-held-text' }, ` in ${holder.displayName}'s quarters${until}. `),
    ask, send));
  void reg;
}
