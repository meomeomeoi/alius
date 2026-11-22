import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';

describe('the one pronoun check of the dynamic (M14)', () => {
  it('finds a pronoun for the commander, whole words only', () => {
    for (const t of ['He said so.', 'give it to him', 'his orders', 'by himself', "he's late"]) expect(hasCommanderPronoun(t), t).toBe(true);
    for (const t of ['the heat', 'a whim', 'this is it', 'the commander gave the order', '']) expect(hasCommanderPronoun(t), t).toBe(false);
  });

  it('is the only copy in src/engine/dynamic', () => {
    for (const f of ['compromat', 'offer', 'expectations']) {
      const text = readFileSync(`src/engine/dynamic/${f}.ts`, 'utf8');
      expect(text, f).not.toMatch(/const COMMANDER_PRONOUN/);
      expect(text, f).toContain("from './pronoun'");
    }
  });
});
