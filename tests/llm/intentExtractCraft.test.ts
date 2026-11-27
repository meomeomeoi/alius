import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CraftOffer } from '../../src/engine/craft/intents';
import { CRAFT_INTENT_TYPES } from '../../src/engine/relations/vocab';
import { getCallType } from '../../src/llm/callTypes';
import { readIntentOutput, type IntentExtractInput } from '../../src/llm/calls/intentExtract';
import '../../src/llm/calls/all';
import { INTENT_SNAPSHOT_INPUT } from '../development/intentSnapshotInput';

const ANN = 'unit_ann';
const ct = () => getCallType('intent_extract')!;
const system = (i: IntentExtractInput) => ct().system(i) as string;
const prompt = (i: IntentExtractInput) => ct().prompt(i) as string;
const offer = (over: Partial<CraftOffer> = {}): CraftOffer => ({ types: [], praise: [], signals: [], cares: [], ...over });
const withCraft = (c: CraftOffer, channel: 'scene' | 'dm' = 'scene'): IntentExtractInput => ({ ...INTENT_SNAPSHOT_INPUT, channel, craft: c });
const typeLine = (i: IntentExtractInput): string => system(i).split('\n').find((l) => l.startsWith('EVENT_TYPE:'))!;

const OFFERS: Array<{ type: string; offer: CraftOffer; word: string }> = [
  { type: 'care_noticed', offer: offer({ types: ['care_noticed'], cares: [{ unitId: ANN, what: 'polishing her boots' }] }), word: 'polishing her boots' },
  { type: 'foot_signal_answered', offer: offer({ types: ['foot_signal_answered'], signals: [{ unitId: ANN, motion: 'tap2', words: 'two taps' }] }), word: 'two taps' },
  { type: 'praise_given', offer: offer({ types: ['praise_given'], praise: [ANN] }), word: 'PRAISE' },
];

describe('the intent prompt and the craft', () => {
  const pinned = readFileSync('tests/fixtures/intent_extract/prompt_without_reading.txt', 'utf8');

  it('the prompt with the field absent or with nothing offered is byte-identical (the pinned text)', () => {
    for (const input of [INTENT_SNAPSHOT_INPUT, withCraft(offer())]) expect(`${system(input)}\n=====\n${prompt(input)}\n`).toBe(pinned);
    for (const t of CRAFT_INTENT_TYPES) expect(pinned, t).not.toContain(t);
    expect(pinned).not.toContain('CRAFT');
  });

  for (const { type, offer: o, word } of OFFERS) {
    it(`${type} is offered only with its subject`, () => {
      expect(system(INTENT_SNAPSHOT_INPUT)).not.toContain(type);
      const both = `${system(withCraft(o))}\n${prompt(withCraft(o))}`;
      expect(typeLine(withCraft(o))).toContain(type);
      expect(both).toContain(word);
      expect(both).toContain(`"${type}"`); // its rule line
    });
  }

  it('only offered types are listed: a care lists care_noticed and neither of the others', () => {
    const line = typeLine(withCraft(OFFERS[0].offer));
    expect(line).toContain('care_noticed');
    for (const other of CRAFT_INTENT_TYPES.filter((t) => t !== 'care_noticed')) expect(line, other).not.toContain(other);
  });

  it('the motion field is asked for only with signals, and a signal lists its words and never a meaning', () => {
    expect(system(withCraft(OFFERS[0].offer))).not.toContain('"motion"');
    const i = withCraft(OFFERS[1].offer);
    expect(system(i)).toContain('"motion"');
    expect(prompt(i)).toMatch(/unit_ann — tap2: two taps/);
    expect(prompt(i)).not.toMatch(/kneel|closer|enough|kiss/i);
  });

  it('the commander\'s words never reach the prompt: the offer has no field for them', () => {
    const i = withCraft(OFFERS[2].offer);
    expect(Object.keys(i.craft!)).toEqual(['types', 'praise', 'signals', 'cares']);
    expect(prompt(i)).not.toMatch(/said/);
  });

  it('a report is read against the offer: an unlisted type or motion is dropped, a listed one is kept', () => {
    const i = withCraft(OFFERS[1].offer);
    const raw = { events: [
      { type: 'foot_signal_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'knelt', confidence: 0.9, motion: 'tap2' },
      { type: 'foot_signal_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'knelt', confidence: 0.9, motion: 'stamp' },
      { type: 'care_noticed', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'saw', confidence: 0.9 },
    ] };
    const out = readIntentOutput(raw, i, { minConfidence: 0.5 });
    expect(out.intents.events.map((e) => `${e.type}:${e.motion ?? ''}`)).toEqual(['foot_signal_answered:tap2']);
  });
});
