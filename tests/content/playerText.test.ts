import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Player text, not notes (0.1 audit): her own DM does not sign itself, and no text talks about "the player" or a missing feature.
const load = (name: string) => JSON.parse(readFileSync(`content/core/${name}.json`, 'utf8')) as Array<Record<string, unknown>>;
const strip = (t: string) => t.replace(/^\s*AUTHOR TO WRITE:\s*/, '');

describe('player text', () => {
  it('a token or booking DM is in her voice without a "{name}:" prefix', () => {
    for (const reg of ['tokenKinds', 'bookingKinds']) {
      for (const e of load(reg)) expect(strip(String(e.text)), `${reg}:${String(e.id)}`).not.toMatch(/^\{name\}:/);
    }
  });

  it('the glossary speaks to the player as "you" and never mentions what is not in the game', () => {
    for (const g of load('glossary')) {
      for (const k of ['short', 'long'] as const) {
        const t = String(g[k] ?? '');
        expect(t, `glossary:${String(g.id)}.${k}`).not.toMatch(/\bthe player\b|not yet in the game/i);
      }
    }
  });

  it('the rations reading names the modes as the BASE tab does', () => {
    const r = load('glossary').find((g) => g.id === 'rations')!;
    expect(String(r.short)).toMatch(/fighters first/i);
    expect(String(r.short)).not.toMatch(/reserve soldiers first/i);
  });
});
