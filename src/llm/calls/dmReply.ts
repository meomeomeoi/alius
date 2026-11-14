import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import type { AffinityBand, AttractionBand, StressBand, TrustBand } from '../../engine/relations/bands';
import { registerCallType } from '../callTypes';
import { callLlm } from '../orchestrator';

export interface DmReplyInput {
  unitName: string;
  commanderName: string;
  /** The relationship state's `promptHint`. */
  stateHint: string;
  bands: { trust: TrustBand; affinity: AffinityBand; attraction: AttractionBand; stress: StressBand };
  /** Facts she knows, newest relevant first; at most 3 are used. */
  recentFacts: string[];
  slotText: string;
  /** Last messages, oldest first; at most 6 are used. */
  history: Array<{ from: 'commander' | 'unit'; text: string }>;
  mode: 'reply' | 'snap' | 'initiate';
}

const DM_MAX = 400;
const FACTS_USED = 3;
const HISTORY_USED = 6;

/** Shared with the scene directives: what she does when the commander floods her inbox. */
export const SNAP_TEXT = 'The commander has sent her too many messages today: she snaps at the commander, curt and irritated, and may refuse to talk right now.';
const MODE_TEXT: Record<DmReplyInput['mode'], string> = {
  reply: 'She answers the commander\'s last message.',
  snap: SNAP_TEXT,
  initiate: 'She writes first: she starts the conversation herself, for her own reasons, without waiting to be asked.',
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
  profile: 'main',
  json: false,
  system: (raw) => {
    const i = raw as DmReplyInput;
    return [
      `You are ${i.unitName}, a soldier in a penal squad, replying on the PDA messenger to your commander ${i.commanderName}.`,
      'Write ONE short PDA text message: 1-3 sentences, plain text, in English, in her voice.',
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
    const history = i.history.slice(-HISTORY_USED);
    if (history.length > 0) out.push('', 'Recent messages:', ...history.map((m) => `${m.from === 'commander' ? i.commanderName : i.unitName}: ${m.text}`));
    out.push('', i.mode === 'initiate' ? 'Write her first message.' : 'Write her message.');
    return out.join('\n');
  },
});

/** One main-model call; any failure or an empty answer gives null (she simply does not answer). */
export async function generateDm(input: DmReplyInput, deps: { st: StAdapter; settings: AliusSettings }): Promise<string | null> {
  const r = await callLlm<string>('dm_reply', input, deps);
  return r.ok ? sanitizeDm(r.value) : null;
}
