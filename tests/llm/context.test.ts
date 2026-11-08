import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../../src/llm/context';
import { createCampaign } from '../../src/engine/state/create';
import { estTokens } from '../../src/llm/text';
import { FakeStAdapter } from '../../src/st/fake';

const state = () => createCampaign({ seed: 1, commanderName: 'Vale' });
const filler = (ch: string, tokens: number) => ch.repeat(Math.floor(tokens * 3.6));

describe('ContextBuilder', () => {
  it('header renders day and slot', () => {
    const { block } = new ContextBuilder().build(state(), 1200);
    expect(block).toBe('[ALIUS CONTEXT]\n[ALIUS] Day 1, Morning.');
    const s = state();
    s.day = 4;
    s.slot = 'evening';
    expect(new ContextBuilder().build(s, 1200).block).toContain('Day 4, Evening.');
  });

  it('lowest priority providers are trimmed first under the cap', () => {
    const b = new ContextBuilder();
    b.register({ id: 'hi', priority: 50, render: () => filler('q', 400) });
    b.register({ id: 'mid', priority: 40, render: () => filler('w', 400) });
    b.register({ id: 'lo', priority: 10, render: () => filler('z', 400) });
    const { block } = b.build(state(), 900);
    expect(block).toContain('q');
    expect(block).toContain('w');
    expect(block).not.toContain('z');
    expect(estTokens(block)).toBeLessThanOrEqual(900);
    expect(block).toContain('Day 1'); // header (priority 100) survives
  });

  it('a lower priority provider never survives while a higher one is trimmed', () => {
    const b = new ContextBuilder();
    b.register({ id: 'big', priority: 50, render: () => filler('q', 800) });
    b.register({ id: 'small', priority: 10, render: () => 'tiny' });
    const { block } = b.build(state(), 300);
    expect(block).not.toContain('q');
    expect(block).not.toContain('tiny');
  });

  it('directives are never trimmed', () => {
    const b = new ContextBuilder();
    b.setDirective({ id: 'd1', text: filler('q', 500), expiresAfter: 'manual' });
    const { block, directives } = b.build(state(), 10);
    expect(directives).toContain(filler('q', 500));
    expect(directives.startsWith('[ALIUS DIRECTIVES — hard constraints, follow them]\n- ')).toBe(true);
    expect(block.length).toBeLessThan(directives.length);
  });

  it('directives render one per line, replace by id, and clear', () => {
    const b = new ContextBuilder();
    b.setDirective({ id: 'a', text: 'first', expiresAfter: 'scene' });
    b.setDirective({ id: 'b', text: 'second', expiresAfter: 'scene' });
    b.setDirective({ id: 'a', text: 'first v2', expiresAfter: 'scene' });
    expect(b.build(state(), 100).directives).toBe('[ALIUS DIRECTIVES — hard constraints, follow them]\n- first v2\n- second');
    b.clearDirective('a');
    b.clearDirective('b');
    expect(b.build(state(), 100).directives).toBe('');
  });

  it('next_reply directive is gone after onReplyReceived', () => {
    const b = new ContextBuilder();
    b.setDirective({ id: 'once', text: 'one reply only', expiresAfter: 'next_reply' });
    b.setDirective({ id: 'keep', text: 'stays', expiresAfter: 'scene' });
    b.onReplyReceived();
    const { directives } = b.build(state(), 100);
    expect(directives).not.toContain('one reply only');
    expect(directives).toContain('stays');
  });

  it('apply injects block and directives, and null clears both', () => {
    const st = new FakeStAdapter();
    const b = new ContextBuilder();
    b.setDirective({ id: 'd', text: 'Rhea REFUSES.', expiresAfter: 'manual' });
    b.apply(st, state(), 1200);
    expect(st.injections.get('ctx')).toMatchObject({ position: 'in_prompt', depth: 0 });
    expect(st.injections.get('ctx')!.text).toContain('Day 1, Morning.');
    expect(st.injections.get('dir')).toMatchObject({ position: 'in_chat', depth: 1 });
    expect(st.injections.get('dir')!.text).toContain('Rhea REFUSES.');
    b.apply(st, null, 1200);
    expect(st.injections.size).toBe(0);
  });

  it('provider returning null contributes nothing', () => {
    const b = new ContextBuilder();
    b.register({ id: 'none', priority: 90, render: () => null });
    expect(b.build(state(), 1200).block).toBe('[ALIUS CONTEXT]\n[ALIUS] Day 1, Morning.');
  });

  it('providers are rendered in priority order, highest first', () => {
    const b = new ContextBuilder();
    b.register({ id: 'low', priority: 10, render: () => 'LOW' });
    b.register({ id: 'high', priority: 90, render: () => 'HIGH' });
    const { block } = b.build(state(), 1200);
    expect(block).toBe('[ALIUS CONTEXT]\n[ALIUS] Day 1, Morning.\nHIGH\nLOW');
  });
});
