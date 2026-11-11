import { beforeAll, describe, expect, it } from 'vitest';
import { isCostEffect } from '../../../src/content/schemas';
import type { Entry, Registries } from '../../../src/content/types';
import { parseDilemmaOutput } from '../../../src/engine/dilemma/validate';
import { toWorldEffect, type MapCtx } from '../../../src/engine/dilemma/effects';
import { computeDeltas } from '../../../src/engine/relations/deltas';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/loyalty';

let reg: Registries;
let state: CampaignState;
let template: Entry;
beforeAll(async () => {
  reg = await loadCore();
  state = campaign(reg, 4);
  template = { ...reg.dilemmaTemplates.get('dil_informant')!, allowedFlags: ['evidence_buried'] } as Entry;
});

const ctx = (over: Partial<MapCtx> = {}): MapCtx => ({ state, reg, template, ...over });
const raw = (over: Record<string, unknown>) => ({ kind: 'resource', target: 'credits', direction: -1, magnitude: 'medium', ...over });

describe('toWorldEffect: magnitudes are the engine tables', () => {
  it('magnitudes become the table numbers and never the model\'s', () => {
    const table: Array<[Record<string, unknown>, unknown]> = [
      [raw({ target: 'credits', magnitude: 'small' }), { type: 'resource', resource: 'credits', amount: -15 }],
      [raw({ target: 'credits', magnitude: 'medium' }), { type: 'resource', resource: 'credits', amount: -40 }],
      [raw({ target: 'credits', magnitude: 'large', direction: 1 }), { type: 'resource', resource: 'credits', amount: 100 }],
      [raw({ target: 'supplies', magnitude: 'large' }), { type: 'resource', resource: 'supplies', amount: -15 }],
      [raw({ target: 'plyx', magnitude: 'medium', direction: 1 }), { type: 'resource', resource: 'plyx', amount: 8 }],
      [raw({ kind: 'faction', target: 'vesper', magnitude: 'small', direction: 1 }), { type: 'faction', factionId: 'vesper', amount: 5 }],
      [raw({ kind: 'faction', target: 'sable', magnitude: 'large' }), { type: 'faction', factionId: 'sable', amount: -20 }],
      [raw({ kind: 'stress', target: 'party', magnitude: 'medium', direction: 1 }), { type: 'party_stress', amount: 10 }],
      [raw({ kind: 'stress', target: 'party', magnitude: 'small', direction: -1 }), { type: 'party_stress', amount: -5 }],
      [raw({ kind: 'clock', target: 'oversight', magnitude: 'large', direction: 1 }), { type: 'clock', clockId: 'oversight', by: 2 }],
      [raw({ kind: 'clock', target: 'oversight', magnitude: 'small', direction: -1 }), { type: 'clock', clockId: 'oversight', by: -1 }],
      [raw({ kind: 'unit_event', target: 'mercy', magnitude: 'small', direction: 1 }),
        { type: 'unit_event', event: 'decision_aligned', severity: 'minor', targets: 'named', valueAxes: [{ axis: 'mercy', direction: 1 }] }],
      [raw({ kind: 'unit_event', target: 'autonomy', magnitude: 'large', direction: -1 }),
        { type: 'unit_event', event: 'decision_aligned', severity: 'major', targets: 'named', valueAxes: [{ axis: 'autonomy', direction: -1 }] }],
    ];
    for (const [input, want] of table) expect(toWorldEffect(input, ctx()), JSON.stringify(input)).toEqual(want);
  });

  it('a numeric amount in the answer is ignored', () => {
    const out = toWorldEffect({ ...raw({}), amount: 99999, by: 7, pct: 500, severity: 'extreme' }, ctx());
    expect(out).toEqual({ type: 'resource', resource: 'credits', amount: -40 });
  });

  it('stress +1 is a cost, clock −1 a gain', () => {
    const stress = toWorldEffect(raw({ kind: 'stress', target: 'party', direction: 1 }), ctx());
    const clock = toWorldEffect(raw({ kind: 'clock', target: 'oversight', direction: -1 }), ctx());
    expect(isCostEffect(stress as never)).toBe(true);
    expect(isCostEffect(clock as never)).toBe(false);
  });

  it('social_check becomes the option\'s check, not an effect', () => {
    expect(toWorldEffect(raw({ kind: 'social_check', target: 'empathy', magnitude: 'small' }), ctx())).toEqual({ check: { stat: 'empathy', rank: 2 } });
    expect(toWorldEffect(raw({ kind: 'social_check', target: 'cunning', magnitude: 'large' }), ctx())).toEqual({ check: { stat: 'cunning', rank: 4 } });
    expect(toWorldEffect(raw({ kind: 'social_check', target: 'charm', magnitude: 'large' }), ctx())).toMatchObject({ rule: 'shape' });
  });

  it('the same unit_event raises a unit with matching values and lowers one with opposite values', () => {
    const fx = toWorldEffect(raw({ kind: 'unit_event', target: 'mercy', direction: 1, magnitude: 'medium' }), ctx()) as { type: string; severity: string; valueAxes: Array<{ axis: string; direction: 1 | -1 }> };
    const s = structuredClone(state);
    s.squad[0].values.mercy = 3;
    s.squad[1].values.mercy = -3;
    const event = { type: 'decision_aligned' as const, actor: 'commander', targets: [], severity: fx.severity as 'moderate', valueAxes: fx.valueAxes as never, evidence: 'x', confidence: 1 };
    expect(computeDeltas(s, reg, s.squad[0].id, event).trust).toBeGreaterThan(0);
    expect(computeDeltas(s, reg, s.squad[1].id, event).trust).toBeLessThan(0);
  });
});

describe('toWorldEffect: rejections', () => {
  it('an unknown kind, target or enum is rejected', () => {
    for (const bad of [
      raw({ kind: 'teleport' }), raw({ target: 'gold' }), raw({ direction: 0 }), raw({ direction: 2 }), raw({ magnitude: 'huge' }),
      raw({ kind: 'unit_event', target: 'courage' }), raw({ kind: 'faction', target: 'nobody' }), raw({ kind: 'stress', direction: 'up' }),
      null, 'resource', 4, [], {},
    ]) {
      expect(toWorldEffect(bad, ctx()), JSON.stringify(bad)).toMatchObject({ rule: 'shape' });
    }
  });

  it('a clock that is full or missing is rejected', () => {
    const missing = toWorldEffect(raw({ kind: 'clock', target: 'ghost_clock', direction: 1 }), ctx());
    expect(missing).toMatchObject({ rule: 'shape' });
    const full = structuredClone(state);
    const c = full.world.clocks.find((x) => x.id === 'oversight')!;
    c.filled = c.segments;
    expect(toWorldEffect(raw({ kind: 'clock', target: 'oversight', direction: 1 }), ctx({ state: full }))).toMatchObject({ rule: 'shape' });
  });

  it('an undeclared flag, a declared flag outside allowedFlags and a foreign thread flag are rejected; an allowed flag and the own thread\'s flag pass (6)', () => {
    const flag = (target: string, extra: Record<string, unknown> = {}) => raw({ kind: 'flag', target, direction: 1, ...extra });
    expect(toWorldEffect(flag('made_up_flag'), ctx())).toMatchObject({ rule: 6 });
    expect(toWorldEffect(flag('evidence_sold_aurum'), ctx())).toMatchObject({ rule: 6 }); // declared, but not allowed here
    expect(toWorldEffect(flag('thread:other:slug', { note: 'x' }), ctx({ threadId: 'mine' }))).toMatchObject({ rule: 6 });
    expect(toWorldEffect(flag('thread:mine:slug', { note: 'x' }), ctx())).toMatchObject({ rule: 6 }); // no thread: no dynamic flags
    expect(toWorldEffect(flag('evidence_buried'), ctx())).toEqual({ type: 'flag', flagId: 'evidence_buried' });
    expect(toWorldEffect(flag('thread:mine:saw_it', { note: 'The commander saw it.' }), ctx({ threadId: 'mine' })))
      .toEqual({ type: 'thread_flag', threadId: 'mine', flagId: 'thread:mine:saw_it', description: 'The commander saw it.' });
  });

  it('a flag whose scope is relation cannot be set by a dilemma even when listed', () => {
    const t = { ...template, allowedFlags: ['knows_crime'] } as Entry;
    expect(toWorldEffect(raw({ kind: 'flag', target: 'knows_crime', direction: 1 }), ctx({ template: t }))).toMatchObject({ rule: 6 });
  });
});

describe('parseDilemmaOutput', () => {
  const option = (label: string, effects: unknown[]) => ({ label, effects });
  const good = (over: Record<string, unknown> = {}) => ({
    title: 'The informant', setup: 'A clerk waits in the corridor.',
    options: [
      option('Pay him', [raw({ magnitude: 'medium' }), raw({ kind: 'clock', target: 'oversight', direction: -1, magnitude: 'small' })]),
      option('Turn him in', [raw({ kind: 'faction', target: 'vesper', direction: 1 }), raw({ kind: 'stress', target: 'party', direction: 1 })]),
      option('Take it by force', [raw({ target: 'plyx', direction: 1 }), raw({ kind: 'faction', target: 'sable', direction: -1 })]),
    ],
    ...over,
  });

  it('a well-formed answer becomes options with engine numbers and recorded magnitudes', () => {
    const out = parseDilemmaOutput(good(), ctx());
    expect('rejected' in out).toBe(false);
    if ('rejected' in out) return;
    expect(out.title).toBe('The informant');
    expect(out.options).toHaveLength(3);
    expect(out.options[0]).toMatchObject({
      label: 'Pay him', magnitudes: ['medium', 'small'],
      effects: [{ type: 'resource', resource: 'credits', amount: -40 }, { type: 'clock', clockId: 'oversight', by: -1 }],
    });
  });

  it('requires and social_check are carried onto the option', () => {
    const answer = good();
    (answer.options[0] as Record<string, unknown>).requires = { socialStat: 'empathy', rank: 3 };
    (answer.options[1] as Record<string, unknown>).requires = { stat: 'authority', rank: 2 };
    answer.options[2].effects.push(raw({ kind: 'social_check', target: 'cunning', magnitude: 'medium' }));
    const out = parseDilemmaOutput(answer, ctx());
    if ('rejected' in out) throw new Error(JSON.stringify(out.rejected));
    expect(out.options[0].requires).toEqual({ stat: 'empathy', rank: 3 });
    expect(out.options[1].requires).toEqual({ stat: 'authority', rank: 2 });
    expect(out.options[2].check).toEqual({ stat: 'cunning', rank: 3 });
    expect(out.options[2].effects).toHaveLength(2); // the check is not an effect
    for (const bad of [{ socialStat: 'empathy', rank: 0 }, { socialStat: 'empathy', rank: 6 }, { socialStat: 'luck', rank: 2 }, { rank: 2 }]) {
      const a = good();
      (a.options[0] as Record<string, unknown>).requires = bad;
      expect(parseDilemmaOutput(a, ctx()), JSON.stringify(bad)).toHaveProperty('rejected');
    }
  });

  it('garbage (null, a string, options as numbers, 7 options) gives rejections and never throws', () => {
    const garbage: unknown[] = [
      null, undefined, 'text', 42, [], {}, { title: 1 }, { title: 'T', setup: 'S', options: 'x' }, { title: 'T', setup: 'S', options: [1, 2, 3] },
      { title: 'T', setup: 'S', options: Array.from({ length: 7 }, (_, i) => option(`O${i}`, [raw({})])) },
      { title: 'T', setup: 'S', options: [option('a', 'nope' as never), option('b', [null]), option('c', [])] },
      { title: 'T', setup: 'S', options: [option('A', [raw({})]), option('B', [raw({})])] }, // two options, three wanted
    ];
    for (const g of garbage) {
      const out = parseDilemmaOutput(g, ctx());
      expect(out, JSON.stringify(g)).toHaveProperty('rejected');
      expect((out as { rejected: unknown[] }).rejected.length).toBeGreaterThan(0);
    }
    const cyclic: Record<string, unknown> = { title: 'T', setup: 'S' };
    cyclic.options = [cyclic, cyclic, cyclic];
    expect(parseDilemmaOutput(cyclic, ctx())).toHaveProperty('rejected');
  });

  it('markup stays text and is cut: title 60 characters, setup 120 words, label 12 words', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
    const answer = good({ title: `<b onclick="x()">${'T'.repeat(80)}</b>`, setup: `<script>alert(1)</script> ${words(200)}` });
    answer.options[0].label = `<img src=x onerror=alert(1)> ${words(30)}`;
    const out = parseDilemmaOutput(answer, ctx());
    if ('rejected' in out) throw new Error(JSON.stringify(out.rejected));
    expect(out.title.length).toBe(60);
    expect(out.title.startsWith('<b onclick=')).toBe(true); // kept as text: it is rendered with textContent
    expect(out.setup.split(/\s+/)).toHaveLength(120);
    expect(out.setup.startsWith('<script>')).toBe(true);
    expect(out.options[0].label.split(/\s+/)).toHaveLength(12);
    expect(out.options[0].label.startsWith('<img')).toBe(true);
  });

  it('control characters and runs of whitespace are normalized', () => {
    const out = parseDilemmaOutput(good({ title: 'A\u0000B\n\n  C‮' }), ctx());
    if ('rejected' in out) throw new Error(JSON.stringify(out.rejected));
    expect(out.title).toBe('AB C');
  });

  it('a large effect in a minor dilemma and a defining one without a large effect are rejected (4)', () => {
    const big = good();
    big.options[0].effects[0] = raw({ magnitude: 'large' });
    const minor = { ...template, scale: 'minor' } as Entry;
    expect(parseDilemmaOutput(big, ctx({ template: minor }))).toMatchObject({ rejected: [{ rule: 4 }] });
    expect(parseDilemmaOutput(big, ctx({ template: { ...template, scale: 'major' } as Entry }))).not.toHaveProperty('rejected');
    const defining = { ...template, scale: 'defining' } as Entry;
    expect(parseDilemmaOutput(good(), ctx({ template: defining }))).toMatchObject({ rejected: [{ rule: 4 }] });
    expect(parseDilemmaOutput(big, ctx({ template: defining }))).not.toHaveProperty('rejected');
  });

  it('flagPerOption: every option sets exactly one allowed flag and no two the same', () => {
    const t = {
      ...template, scale: 'major', optionCount: 3, allowedFlags: ['evidence_delivered_vesper', 'evidence_sold_aurum', 'evidence_buried'],
      constraints: { flagPerOption: true },
    } as Entry;
    const flag = (id: string) => raw({ kind: 'flag', target: id, direction: 1 });
    const answer = (flags: Array<string | null>) => ({
      title: 'T', setup: 'S',
      options: flags.map((f, i) => option(`O${i}`, [raw({}), ...(f ? [flag(f)] : [])])),
    });
    const ok = parseDilemmaOutput(answer(['evidence_delivered_vesper', 'evidence_sold_aurum', 'evidence_buried']), ctx({ template: t }));
    expect(ok).not.toHaveProperty('rejected');
    for (const bad of [
      ['evidence_delivered_vesper', 'evidence_delivered_vesper', 'evidence_buried'],
      ['evidence_delivered_vesper', null, 'evidence_buried'],
    ]) {
      expect(parseDilemmaOutput(answer(bad), ctx({ template: t })), JSON.stringify(bad)).toMatchObject({ rejected: [{ rule: 6 }] });
    }
    const two = answer(['evidence_delivered_vesper', 'evidence_sold_aurum', 'evidence_buried']);
    two.options[0].effects.push(flag('evidence_buried'));
    expect(parseDilemmaOutput(two, ctx({ template: t }))).toMatchObject({ rejected: [{ rule: 6 }] });
  });

  it('the option count must equal the template\'s', () => {
    const two = good();
    two.options.pop();
    expect(parseDilemmaOutput(two, ctx())).toHaveProperty('rejected');
    expect(parseDilemmaOutput(two, ctx({ template: { ...template, optionCount: 2 } as Entry }))).not.toHaveProperty('rejected');
  });
});
