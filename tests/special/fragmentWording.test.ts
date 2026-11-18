import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { CANDIDATE_KINDS, type Intercepted } from '../../src/engine/special/state';
import { fallbackFragment, interceptGist } from '../../src/engine/special/frequency/fragments';
import { sanitizeFragment } from '../../src/llm/calls/flavor';
import { ContextBuilder } from '../../src/llm/context';
import { createSpecial, type SpecialDeps } from '../../src/special/controller';
import type { CampaignState } from '../../src/engine/state/types';
import { loadCore, run } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import { ANN, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const x = (over: Partial<Intercepted> = {}): Intercepted => ({ id: 'fq1', unitId: ANN, day: 1, kind: 'stance', value: 'fearful', true: true, partial: false, ...over });
const flush = () => new Promise((res) => setTimeout(res, 0));

describe('fallback fragments (the frequencyFragments registry)', () => {
  it('every candidate kind has an entry with lines and subject-only lines', () => {
    for (const kind of CANDIDATE_KINDS) {
      const e = reg.frequencyFragments.get(kind);
      expect(e, kind).toBeDefined();
      expect((e!.lines as string[]).length, kind).toBeGreaterThanOrEqual(3);
      expect((e!.subjectOnly as string[]).length, kind).toBeGreaterThanOrEqual(2);
    }
  });

  it('is stable for one id and fills {name} and {value}; no brace is left', () => {
    for (const kind of CANDIDATE_KINDS) {
      const a = fallbackFragment(reg, x({ kind, value: 'high' }), 'Ann');
      expect(fallbackFragment(reg, x({ kind, value: 'high' }), 'Ann')).toBe(a);
      expect(a, kind).not.toMatch(/[{}]/);
      expect(a.length, kind).toBeGreaterThan(0);
    }
    expect(fallbackFragment(reg, x(), 'Ann')).toContain('Ann');
  });

  it('different ids pick different lines, and a partial fragment names only the subject', () => {
    const lines = new Set(Array.from({ length: 30 }, (_, i) => fallbackFragment(reg, x({ id: `fq${i}` }), 'Ann')));
    expect(lines.size).toBeGreaterThan(1);
    const subject = reg.frequencyFragments.get('stance')!.subjectOnly as string[];
    const partial = fallbackFragment(reg, x({ partial: true }), 'Ann');
    expect(subject.map((l) => l.replaceAll('{name}', 'Ann').replaceAll('{value}', 'fearful'))).toContain(partial);
  });

  it('no fragment gives the commander a pronoun', () => {
    for (const e of reg.frequencyFragments.values()) {
      for (const l of [...(e.lines as string[]), ...(e.subjectOnly as string[])]) expect(l).not.toMatch(/\b(he|him|his|himself)\b/i);
    }
  });
});

describe('interceptGist', () => {
  it('says the kind and value in words for true and false alike, with no digit and no label of truth', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    for (const kind of CANDIDATE_KINDS) {
      for (const value of ['none', 'high', 'fearful']) {
        const g = interceptGist(s, reg, x({ kind, value }));
        expect(g.length, `${kind}/${value}`).toBeGreaterThan(0);
        expect(g).not.toMatch(/\b(true|false|real|fake)\b/i);
      }
    }
  });
});

describe('sanitizeFragment', () => {
  it('refuses digits, a commander pronoun, a newline and more than 160 characters', () => {
    expect(sanitizeFragment('…can\'t keep doing this…')).toBe('…can\'t keep doing this…');
    expect(sanitizeFragment('…day 3…')).toBeNull();
    expect(sanitizeFragment('…he does not know…')).toBeNull();
    expect(sanitizeFragment('…one\ntwo…')).toBeNull();
    expect(sanitizeFragment('x'.repeat(161))).toBeNull();
    expect(sanitizeFragment('')).toBeNull();
  });
});

describe('frequency/word', () => {
  const withIntercept = (): CampaignState => {
    const s = specialCampaign(reg, 'secret_frequency');
    s.special!.frequency!.intercepts.push(x());
    return s;
  };
  it('stores a cleaned text once, for an intercept with none', () => {
    const s = withIntercept();
    const a = run(s, reg, { type: 'frequency/word', payload: { id: 'fq1', text: '  …can\'t keep   doing this…  ' } });
    expect(a.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(a.state.special!.frequency!.intercepts[0].text).toBe('…can\'t keep doing this…');
    const b = run(a.state, reg, { type: 'frequency/word', payload: { id: 'fq1', text: 'second' } });
    expect(b.events.some((e) => e.type === 'error')).toBe(true);
    expect(b.state).toBe(a.state);
  });
  it('refuses an unknown id and an empty or overlong text', () => {
    const s = withIntercept();
    for (const payload of [{ id: 'nope', text: 'a' }, { id: 'fq1', text: '   ' }, { id: 'fq1', text: 'x'.repeat(161) }]) {
      const r = run(s, reg, { type: 'frequency/word', payload });
      expect(r.events.some((e) => e.type === 'error'), JSON.stringify(payload)).toBe(true);
    }
  });
});

describe('the special controller words new intercepts', () => {
  function rig(wording: boolean) {
    const s = specialCampaign(reg, 'secret_frequency');
    s.special!.frequency!.intercepts.push(x());
    const h = worldHarness(reg, s, { fragmentWording: wording });
    const deps: SpecialDeps = { ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn() };
    return { h, special: createSpecial(deps) };
  }
  const event = { type: 'frequency_intercept', unitId: ANN, interceptId: 'fq1' };
  const textOf = (h: ReturnType<typeof rig>['h']) => h.state().special!.frequency!.intercepts[0].text;

  it('asks the model and stores its fragment', async () => {
    const r = rig(true);
    r.h.st.mainReplies = ['{"text":"…can\'t keep doing this…"}'];
    r.special.onEvents([event]);
    await flush();
    expect(textOf(r.h)).toBe('…can\'t keep doing this…');
    expect(r.h.st.calls).toHaveLength(1);
  });

  it('setting off: no model call, the template is used', async () => {
    const r = rig(false);
    r.special.onEvents([event]);
    await flush();
    expect(r.h.st.calls).toEqual([]);
    expect(textOf(r.h)).toBe(fallbackFragment(reg, x(), 'Ann'));
  });

  it('a model answer with a digit falls back to the template', async () => {
    const r = rig(true);
    r.h.st.mainReplies = ['{"text":"…day 3…"}'];
    r.special.onEvents([event]);
    await flush();
    expect(textOf(r.h)).toBe(fallbackFragment(reg, x(), 'Ann'));
  });

  it('a late fragment for another chat is dropped', async () => {
    const r = rig(true);
    r.h.st.mainReplies = ['{"text":"…late…"}'];
    const real = r.h.st.generateMain.bind(r.h.st);
    r.h.st.generateMain = async (req) => { r.h.switchChat('other'); return real(req); };
    r.special.onEvents([event]);
    await flush();
    expect(textOf(r.h)).toBeUndefined();
    expect(r.h.log.some((a) => a.type === 'frequency/word')).toBe(false);
  });
});
