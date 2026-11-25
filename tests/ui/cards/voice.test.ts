import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { voiceLine, type VoiceRun } from '../../../src/ui/scene/cards/voice';
import { cardWhen } from '../../../src/ui/scene/cards/when';
import { loadCore } from '../../helpers/world';

/** P10e-e Task 3: her voice on the cards (`voiceLine`, the `linesOf` / `pick` / `fill` of cards.html) and the card's deadline words (`cardWhen`, its WHENS). */

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const text = (runs: VoiceRun[]): string => runs.map((r) => r.text).join('');
const linesOf = (kind: string, style?: string): string[] =>
  ([...reg.cardVoice.values()].find((e) => e.kind === kind && e.style === style)?.lines as string[] | undefined) ?? [];
const filled = (frame: string, vals: Record<string, string>): string =>
  frame.replace(/\{(\w+)\}/g, (_m, k: string) => { const v = vals[k.toLowerCase()]!; return k[0] === k[0]!.toUpperCase() ? v[0]!.toUpperCase() + v.slice(1) : v; });

/** The WHEN words of the card (cards.html `WHENS`, with every slot and every count). */
const WHEN_WORDS = (() => {
  const out = new Set<string>();
  for (let d = 0; d <= 9; d++) {
    out.add(cardWhen({ day: 20 + d }, 20)!);
    for (const slot of ['morning', 'afternoon', 'evening', 'night'] as const) out.add(cardWhen({ day: 20 + d, slot }, 20)!);
  }
  return [...out];
})();

describe('voiceLine', () => {
  it('her style first, neutral otherwise', () => {
    const cold = linesOf('when', 'cold').map((l) => filled(l, { when: 'this evening' }));
    expect(cold).toHaveLength(3);
    expect(cold).toContain(text(voiceLine(reg, 'when', 'cold', 'c1', { when: 'this evening' })));
    const neutral = linesOf('sayIt');
    expect(neutral.length).toBeGreaterThan(0);
    expect(neutral).toContain(text(voiceLine(reg, 'sayIt', 'cold', 'c1', {})));
    // no style at all reads the neutral lines too
    expect(linesOf('when').map((l) => filled(l, { when: 'today' }))).toContain(text(voiceLine(reg, 'when', undefined, 'c1', { when: 'today' })));
  });

  it('the pick is fnv1a(key|style|kind) % n, as cards.html', () => {
    const fnv = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
    for (const key of ['a', 'pt3', 'card-17']) {
      const cold = linesOf('when', 'cold');
      expect(text(voiceLine(reg, 'when', 'cold', key, { when: 'x' }))).toBe(filled(cold[fnv(`${key}|cold|when`) % cold.length]!, { when: 'x' }));
      const neutral = linesOf('when');
      expect(text(voiceLine(reg, 'when', undefined, key, { when: 'x' }))).toBe(filled(neutral[fnv(`${key}|neutral|when`) % neutral.length]!, { when: 'x' }));
    }
  });

  it('the same key gives the same line, and two keys spread', () => {
    expect(voiceLine(reg, 'weight', 'cruel', 'p1', { weight: 'heavy' })).toEqual(voiceLine(reg, 'weight', 'cruel', 'p1', { weight: 'heavy' }));
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(text(voiceLine(reg, 'when', 'cold', `k${i}`, { when: 'today' })));
    expect(seen.size).toBe(3);
    const neutral = new Set<string>();
    for (let i = 0; i < 30; i++) neutral.add(text(voiceLine(reg, 'noLength', 'drill', `k${i}`, {})));
    expect(neutral.size).toBe(3);
  });

  it('capitalised at a sentence\'s start: each value is a run of its own', () => {
    // find a key whose neutral `when` pick is `{When}. Not later.`
    const key = Array.from({ length: 50 }, (_, i) => `n${i}`).find((k) => text(voiceLine(reg, 'when', undefined, k, { when: 'this evening' })).startsWith('This evening'))!;
    expect(key).toBeDefined();
    expect(voiceLine(reg, 'when', undefined, key, { when: 'this evening' })).toEqual([{ text: 'This evening', value: true }, { text: '. Not later.' }]);
    const mid = Array.from({ length: 50 }, (_, i) => `m${i}`).find((k) => text(voiceLine(reg, 'when', undefined, k, { when: 'this evening' })) === 'I want it done this evening.')!;
    expect(voiceLine(reg, 'when', undefined, mid, { when: 'this evening' })).toEqual([{ text: 'I want it done ' }, { text: 'this evening', value: true }, { text: '.' }]);
  });

  it('a value it is not given stays as written, as cards.html', () => {
    expect(text(voiceLine(reg, 'order', undefined, 'o1', { soldier: 'Cat' }))).toMatch(/\{label\}/);
  });

  it('a kind with no rows yet (the slap, Task 11) gives no runs and never throws', () => {
    expect(voiceLine(reg, 'slap.before', 'cruel', 's1', {})).toEqual([]);
    expect(voiceLine(reg, 'slap.after.flinched', undefined, 's1', {})).toEqual([]);
  });

  it('no frame breaks with a value', () => {
    const styles = [undefined, ...reg.practiceStyles.keys()];
    for (const style of styles) {
      for (const frame of linesOf('when', style)) {
        for (const w of WHEN_WORDS) {
          const line = filled(frame, { when: w });
          expect(line, line).not.toMatch(/\bby in\b|\buntil in\b/i);
        }
      }
      for (const frame of linesOf('cost', style)) {
        const line = filled(frame, { slots: 'one slot' });
        expect(line, line).not.toMatch(/ them\b/);
      }
    }
  });

  it('a line names no pronoun for the commander', () => {
    for (const e of reg.cardVoice.values()) for (const l of e.lines as string[]) expect(l, l).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});

describe('cardWhen (the WHENS of cards.html)', () => {
  it('names the deadline in the card\'s words', () => {
    expect(cardWhen({ day: 20, slot: 'evening' }, 20)).toBe('this evening');
    expect(cardWhen({ day: 20, slot: 'night' }, 20)).toBe('tonight');
    expect(cardWhen({ day: 20, slot: 'morning' }, 20)).toBe('this morning');
    expect(cardWhen({ day: 20, slot: 'afternoon' }, 20)).toBe('this afternoon');
    expect(cardWhen({ day: 20 }, 20)).toBe('today');
    expect(cardWhen({ day: 21 }, 20)).toBe('tomorrow');
    expect(cardWhen({ day: 21, slot: 'night' }, 20)).toBe('tomorrow night');
    expect(cardWhen({ day: 21, slot: 'evening' }, 20)).toBe('tomorrow evening');
    expect(cardWhen({ day: 22 }, 20)).toBe('in two days');
    expect(cardWhen({ day: 22, slot: 'morning' }, 20)).toBe('in two days, in the morning');
    expect(cardWhen({ day: 27 }, 20)).toBe('in seven days');
    expect(cardWhen({ day: 30 }, 20)).toBe('in a few days');
    expect(cardWhen({ day: 28, slot: 'evening' }, 20)).toBe('in a few days');
  });

  it('a past deadline is today; none is null', () => {
    expect(cardWhen({ day: 18 }, 20)).toBe('today');
    expect(cardWhen({ day: 18, slot: 'evening' }, 20)).toBe('today');
    expect(cardWhen(undefined, 20)).toBeNull();
  });

  it('every word is one of the WHENS of cards.html or its pattern', () => {
    const WHENS = ['today', 'this morning', 'this afternoon', 'this evening', 'tonight', 'tomorrow', 'tomorrow morning', 'tomorrow evening', 'in two days', 'in two days, in the morning', 'in a few days'];
    for (const w of WHENS) expect(WHEN_WORDS).toContain(w);
  });
});
