import type { AffinityBand, AttractionBand, StressBand, TrustBand } from '../../engine/relations/bands';
import { registerCallType } from '../callTypes';

export interface DmReplyInput {
  unitName: string;
  commanderName: string;
  /** The relationship state's `promptHint`. */
  stateHint: string;
  bands: { trust: TrustBand; affinity: AffinityBand; attraction: AttractionBand; stress: StressBand };
  /** Facts she knows, newest relevant first; at most 4 are used. */
  recentFacts: string[];
  /** P3b: what the squad remembers of her (her own and shared dossier); absent = nothing folded yet. */
  dossier?: string;
  /** P3b: her relation journal, evidence included (a DM is private). */
  journal?: string[];
  slotText: string;
  /** Last messages, oldest first; at most 6 are used. */
  history: Array<{ from: 'commander' | 'unit'; text: string }>;
  /** P10b: `curt` (one or two words, cold) and `door` (she answers through the closed door of the commander's quarters at night). */
  mode: 'reply' | 'snap' | 'initiate' | 'curt' | 'door';
}

const DM_MAX = 400;
const FACTS_USED = 4;
const HISTORY_USED = 6;

/** Shared with the scene directives: what she does when the commander floods her inbox. */
export const SNAP_TEXT = 'The commander has sent her too many messages today: she snaps at the commander, curt and irritated, and may refuse to talk right now.';
const MODE_TEXT: Record<DmReplyInput['mode'], string> = {
  reply: 'She answers the commander\'s last message.',
  snap: SNAP_TEXT,
  initiate: 'She writes first: she starts the conversation herself, for her own reasons, without waiting to be asked.',
  curt: 'She answers the commander\'s last message in one or two words, cold: she gives the commander nothing more.',
  door: 'She answers through the closed door, one or two sentences; she is still deciding whether to stay.',
};

/** Cleans a model answer into one short plain-text message; nothing usable → null. */
export function sanitizeDm(text: string): string | null {
  let t = text.replace(/```[a-z]*/gi, ' ').replace(/\*[^*\n]*\*/g, ' ').replace(/[_`#>]+/g, ' ').replace(/\*+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[A-Z][\w'’-]*(?: [A-Z][\w'’-]*){0,2}\s*:\s*/, '');
  t = t.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  t = t.slice(0, DM_MAX).trim();
  return t === '' ? null : t;
}

registerCallType<string>({
  id: 'dm_reply',
  prose: true,
  profile: 'main',
  json: false,
  system: (raw) => {
    const i = raw as DmReplyInput;
    const door = i.mode === 'door';
    return [
      door
        ? `You are ${i.unitName}, a soldier in a penal squad. It is night and you stand outside the closed door of your commander ${i.commanderName}'s quarters; ${i.commanderName} has just spoken to you through it.`
        : `You are ${i.unitName}, a soldier in a penal squad, replying on the PDA messenger to your commander ${i.commanderName}.`,
      door ? 'Write ONE spoken reply: one or two sentences, plain text, in English, in her voice.'
        : i.mode === 'curt' ? 'Write ONE very short PDA text message: one or two words, no more, plain text, in English, in her voice.'
        : 'Write ONE short PDA text message: 1-3 sentences, plain text, in English, in her voice.',
      'No actions, no narration, no asterisks, no speaker label, no quotation marks.',
      MODE_TEXT[i.mode],
      'Play her exactly as the relationship description says; do not become warmer or more cooperative than it allows.',
    ].join('\n');
  },
  prompt: (raw) => {
    const i = raw as DmReplyInput;
    const out = [
      `Time: ${i.slotText}`,
      `How she sees the commander: ${i.stateHint}`,
      `Trust: ${i.bands.trust}; warmth: ${i.bands.affinity}; attraction: ${i.bands.attraction}; stress: ${i.bands.stress}.`,
    ];
    const facts = i.recentFacts.slice(0, FACTS_USED);
    if (facts.length > 0) out.push('She knows:', ...facts.map((f) => `- ${f}`));
    if (i.dossier) out.push(`What the squad remembers of her: ${i.dossier}`);
    if (i.journal && i.journal.length > 0) out.push('Lately with the commander:', ...i.journal.map((l) => `- ${l}`));
    const history = i.history.slice(-HISTORY_USED);
    if (history.length > 0) out.push('', 'Recent messages:', ...history.map((m) => `${m.from === 'commander' ? i.commanderName : i.unitName}: ${m.text}`));
    out.push('', i.mode === 'initiate' ? 'Write her first message.' : 'Write her message.');
    return out.join('\n');
  },
});
