import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { createCampaign } from '../../src/engine/state/create';
import { ContextBuilder, type ContextProvider } from '../../src/llm/context';
import { estTokens } from '../../src/llm/text';
import { registerSceneContext } from '../../src/scene/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

const state = () => createCampaign({ seed: 1, commanderName: 'Vale' });
/** `n` short lines, `ch` each, as a provider would rank them (best first). */
const lines = (ch: string, n: number, len = 40): string => Array.from({ length: n }, (_, i) => `${ch}${String(i).padStart(2, '0')} ${ch.repeat(len)}`).join('\n');
const memory = (id: string, priority: number, text: string): ContextProvider => ({ id, priority, group: 'memory', render: () => text });
const plain = (id: string, priority: number, text: string): ContextProvider => ({ id, priority, render: () => text });
const memPart = (block: string): string => block.split('\n').filter((l) => /^m\d\d /.test(l)).join('\n');
const otherPart = (block: string): string => block.split('\n').filter((l) => /^o\d\d /.test(l)).join('\n');

describe('provider groups', () => {
  it('memory never exceeds its share', () => {
    const b = new ContextBuilder();
    b.register(memory('mem', 70, lines('m', 40)));
    const { block } = b.build(state(), 1600, 300);
    expect(estTokens(memPart(block))).toBeLessThanOrEqual(300);
    expect(memPart(block).length).toBeGreaterThan(0);
    expect(b.lastBuild().memoryTokens).toBeLessThanOrEqual(300);
  });

  it('others never exceed cap − share', () => {
    const b = new ContextBuilder();
    b.register(memory('mem', 70, lines('m', 60)));
    b.register(plain('oth', 60, lines('o', 60)));
    const cap = 900;
    const share = 300;
    const { block } = b.build(state(), cap, share);
    expect(estTokens(otherPart(block))).toBeLessThanOrEqual(cap - share);
    expect(estTokens(block)).toBeLessThanOrEqual(cap);
    expect(estTokens(memPart(block))).toBeLessThanOrEqual(share);
    // the others are listed first, then memory
    expect(block.indexOf('o00 ')).toBeLessThan(block.indexOf('m00 '));
  });

  it('a share the memory does not use goes back to the others', () => {
    const b = new ContextBuilder();
    b.register(memory('mem', 70, lines('m', 2)));
    b.register(plain('oth', 60, lines('o', 60)));
    const { block } = b.build(state(), 900, 500);
    expect(estTokens(otherPart(block))).toBeGreaterThan(900 - 500);
    expect(estTokens(block)).toBeLessThanOrEqual(900);
  });

  it('a large memory provider is cut, not dropped', () => {
    const b = new ContextBuilder();
    b.register(memory('mem', 70, lines('m', 80)));
    const { block } = b.build(state(), 1600, 200);
    const kept = memPart(block).split('\n');
    expect(kept.length).toBeGreaterThan(1);
    expect(kept.length).toBeLessThan(80);
    expect(kept[0]).toMatch(/^m00 /); // the best-ranked lines stay, the lowest-ranked go
    expect(kept.at(-1)).toBe(`m${String(kept.length - 1).padStart(2, '0')} ${'m'.repeat(40)}`); // cut at a line, not in the middle of one
  });

  it('a provider that writes one long line is truncated to the budget, not dropped', () => {
    const b = new ContextBuilder();
    b.register(memory('mem', 70, `m00 ${'m'.repeat(3000)}`));
    const { block } = b.build(state(), 1600, 100);
    expect(block).toContain('m00 ');
    expect(estTokens(memPart(block))).toBeLessThanOrEqual(100);
  });

  it('a memory provider receives the tokens left in the share, and the next one the rest', () => {
    const seen = new Map<string, number | undefined>();
    const b = new ContextBuilder();
    b.register({ id: 'a', priority: 70, group: 'memory', render: (_s, budget) => { seen.set('a', budget); return lines('m', 5); } });
    b.register({ id: 'b', priority: 60, group: 'memory', render: (_s, budget) => { seen.set('b', budget); return null; } });
    b.register({ id: 'c', priority: 50, render: (_s, budget) => { seen.set('c', budget); return null; } });
    b.build(state(), 1600, 400);
    expect(seen.get('a')).toBeGreaterThan(300);
    expect(seen.get('a')).toBeLessThanOrEqual(400);
    expect(seen.get('b')).toBeLessThan(seen.get('a')!);
    expect(seen.get('b')).toBeGreaterThan(0);
    expect(seen.has('c')).toBe(true);
    expect(seen.get('c')).toBeUndefined(); // other providers are not budgeted
  });

  it('share ≥ cap still renders the header and units', () => {
    const b = new ContextBuilder();
    b.register({ id: 'units', priority: 90, core: true, render: () => 'Ann — state Comrade; trust steady.' });
    b.register({ id: 'scene_header', priority: 95, core: true, render: () => 'Scene: Mess hall. Present: Ann.' });
    b.register(plain('commander', 80, lines('o', 30)));
    b.register(memory('mem', 70, lines('m', 80)));
    for (const share of [400, 900, 5000]) {
      const { block } = b.build(state(), 400, share);
      expect(block, String(share)).toContain('Day 1, Morning.');
      expect(block, String(share)).toContain('Scene: Mess hall.');
      expect(block, String(share)).toContain('Ann — state Comrade');
      expect(estTokens(block), String(share)).toBeLessThanOrEqual(400);
    }
  });

  it('the real scene providers keep the header, the scene header and the units when memory wants everything', async () => {
    const reg: Registries = await loadCore();
    const s = campaign(reg, 4);
    s.scene = { id: 's1', day: 1, slot: 'morning', locationId: 'mess_hall', participants: ['unit_ann'], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, exchanges: 0 };
    const b = new ContextBuilder();
    registerSceneContext(b, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
    b.register(memory('mem', 70, lines('m', 200)));
    const { block } = b.build(s, 600, 9999);
    expect(block).toContain('Day 1');
    expect(block).toContain('Scene: ');
    expect(block).toContain('Ann — state');
    expect(estTokens(block)).toBeLessThanOrEqual(600);
  });

  it('lastBuild reports the tokens', () => {
    const b = new ContextBuilder();
    b.register(memory('mem', 70, lines('m', 10)));
    b.register(plain('oth', 60, lines('o', 10)));
    b.setDirective({ id: 'd', text: 'Ann REFUSES the order this scene.', expiresAfter: 'scene' });
    const out = b.build(state(), 1600, 500);
    const last = b.lastBuild();
    expect(last.memoryTokens).toBe(estTokens(memPart(out.block)));
    expect(last.otherTokens).toBe(estTokens(out.block.split('\n').filter((l) => !/^m\d\d /.test(l)).join('\n')));
    expect(last.directiveTokens).toBe(estTokens(out.directives));
    expect(last.directiveTokens).toBeGreaterThan(0);
    // a copy: changing it does not change the builder
    last.memoryTokens = -1;
    expect(b.lastBuild().memoryTokens).toBeGreaterThan(0);
  });

  it('lastBuild starts empty', () => {
    expect(new ContextBuilder().lastBuild()).toEqual({ memoryTokens: 0, otherTokens: 0, directiveTokens: 0 });
  });

  it('with no memory providers the old behaviour holds', () => {
    const run = (share: number) => {
      const b = new ContextBuilder();
      b.register(plain('hi', 50, lines('o', 30)));
      b.register(plain('lo', 10, lines('p', 30)));
      return b.build(state(), 600, share).block;
    };
    expect(run(500)).toBe(run(0));
  });

  it('apply passes the share through', () => {
    const b = new ContextBuilder();
    b.register(memory('mem', 70, lines('m', 80)));
    const st = new (class { injections = new Map<string, string>(); setInjection(k: string, t: string) { this.injections.set(k, t); } })();
    b.apply(st as never, state(), 1600, 150);
    expect(estTokens(memPart(st.injections.get('ctx')!))).toBeLessThanOrEqual(150);
  });
});
