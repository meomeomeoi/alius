import type { Entry } from '../../content/types';
import { handFamily } from '../../engine/hand';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { noise } from '../fx';

export interface NoteOpts {
  text: string;
  unitName: string;
  /** Her hand (`null` = the type font). */
  hand: Entry | null;
  read?: boolean;
  /** The [GOT IT] button, shown while the note is unread. */
  onRead?(): void;
  /** Analysis address of the note (`glossary:hand_note`, `glossary:rule_note`). */
  analyze: string;
}

/** Sets the hand of a note element (`--alius-font-hand`, the type font behind it). */
export function setHand(el: HTMLElement, hand: Entry | null): void {
  if (hand) el.style.setProperty('--alius-font-hand', `"${handFamily(hand)}", var(--alius-font-type)`);
}

/**
 * A note in her hand (P10b §4): a piece of paper in the paper voice whose body reads `--alius-font-hand` (set here from her hand;
 * readable mode swaps it for the type font in CSS and keeps the note). Everything is text. An unread note shows [GOT IT].
 */
export function renderNote(o: NoteOpts): HTMLElement {
  const note = h(
    'article',
    { class: `alius-note alius-voice alius-voice-paper alius-stat${o.read === true ? ' is-read' : ''}`, 'data-voice': 'paper', 'data-note-by': o.unitName, ...analyzeAttrs(o.analyze) },
    noise('alius-fibre', { frequency: '0.04 0.9', octaves: 2, seed: 3 }),
    h('p', { class: 'alius-note-body' }, o.text),
  );
  setHand(note, o.hand);
  if (o.read !== true && o.onRead) {
    let used = false;
    note.append(h('button', {
      type: 'button', class: 'alius-btn', 'data-action': 'read-note',
      onclick: () => {
        if (used) return;
        used = true;
        o.onRead!();
      },
    }, '[GOT IT]'));
  }
  return note;
}

