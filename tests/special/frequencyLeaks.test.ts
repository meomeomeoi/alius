import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { Rng } from '../../src/engine/rng';
import { validateIntents } from '../../src/engine/relations/intents';
import {
  decayFrequency, frequencyLeak, frequencySenseOf, leakCandidates, leakInput, suspicionOf,
} from '../../src/engine/special/frequency/leaks';
import type { Intercepted } from '../../src/engine/special/state';
import type { CampaignState } from '../../src/engine/state/types';
import { specialDirectives } from '../../src/special/directives';
import { loadCore, run } from '../helpers/world';
import { ANN, BEA, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const x = (over: Partial<Intercepted> = {}): Intercepted => ({ id: 'fq1', unitId: ANN, day: 1, kind: 'refusal', value: 'refuses', true: true, partial: false, text: '…no…', ...over });
const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const withLog = (log: Intercepted[], tweak: (s: CampaignState) => void = () => {}): CampaignState => {
  const s = specialCampaign(reg, 'secret_frequency');
  s.special!.frequency!.intercepts = log;
  tweak(s);
  return s;
};
const leak = (s: CampaignState, sev: 'minor' | 'moderate' | 'major' | 'extreme', id = 'fq1', unit = ANN) => frequencyLeak(s, ctxOf(s), unit, id, sev);
const sense = (s: CampaignState, unit: string, v: number) => { s.squad.find((u) => u.id === unit)!.defects = [{ id: 'echo_bleed', origin: 'x' } as never]; return v; };

describe('frequencyLeak', () => {
  it('raises suspicion by severity: minor 15, moderate 25, major 35, extreme 35', () => {
    for (const [sev, n] of [['minor', 15], ['moderate', 25], ['major', 35], ['extreme', 35]] as const) {
      const s = withLog([x()]);
      leak(s, sev);
      expect(suspicionOf(s, ANN), sev).toBe(n);
    }
  });

  it('a false item halves it (her puzzlement still counts, so suspicion never betrays truth)', () => {
    const t = withLog([x({ true: true })]);
    const f = withLog([x({ true: false })]);
    leak(t, 'moderate');
    leak(f, 'moderate');
    expect(suspicionOf(t, ANN)).toBe(25);
    expect(suspicionOf(f, ANN)).toBe(13); // 12.5 rounds up
  });

  it('echo_bleed multiplies by 1.5 (a true moderate leak: 38)', () => {
    const s = withLog([x()]);
    sense(s, ANN, 1.5);
    expect(frequencySenseOf(s, reg, ANN)).toBe(1.5);
    expect(frequencySenseOf(s, reg, BEA)).toBe(1);
    leak(s, 'moderate');
    expect(suspicionOf(s, ANN)).toBe(38);
  });

  it('caps at 100', () => {
    const s = withLog([x()]);
    for (let i = 0; i < 6; i++) leak(s, 'major');
    expect(suspicionOf(s, ANN)).toBe(100);
  });

  it('ignores an unknown item, an item about someone else, a burned implant and a campaign without the trait', () => {
    const s = withLog([x()]);
    leak(s, 'major', 'fq99');
    leak(s, 'major', 'fq1', BEA);
    expect(suspicionOf(s, ANN) + suspicionOf(s, BEA)).toBe(0);
    s.special!.frequency!.burnedDay = 1;
    leak(s, 'major');
    expect(suspicionOf(s, ANN)).toBe(0);
    const none = specialCampaign(reg);
    expect(frequencyLeak(none, ctxOf(none), ANN, 'fq1', 'major')).toEqual([]);
    expect(none.special).toBeUndefined();
  });

  it('draws nothing', () => {
    const s = withLog([x()]);
    const c = ctxOf(s);
    frequencyLeak(s, c, ANN, 'fq1', 'major');
    expect(c.rng.state).toEqual(s.rng);
  });
});

describe('decay', () => {
  it('−2 a day, floor 0, and the entry goes at 0', () => {
    const s = withLog([x()]);
    s.special!.frequency!.suspicion = { [ANN]: 5, [BEA]: 1 };
    decayFrequency(s);
    expect(suspicionOf(s, ANN)).toBe(3);
    expect(suspicionOf(s, BEA)).toBe(0);
    decayFrequency(s);
    decayFrequency(s);
    expect(suspicionOf(s, ANN)).toBe(0);
    expect(s.special!.frequency!.suspicion).toEqual({});
  });
  it('still decays after the implant is burned', () => {
    const s = withLog([x()]);
    s.special!.frequency!.burnedDay = 1;
    s.special!.frequency!.suspicion = { [ANN]: 10 };
    decayFrequency(s);
    expect(suspicionOf(s, ANN)).toBe(8);
  });
});

describe('the static directive and event', () => {
  const texts = (s: CampaignState, ids = [ANN, BEA]) => specialDirectives(s, reg, ids);

  it('above 50 only with a sense defect, worded without a pronoun for the commander', () => {
    const s = withLog([x()]);
    s.special!.frequency!.suspicion = { [ANN]: 60, [BEA]: 60 };
    sense(s, ANN, 1.5);
    const d = texts(s);
    expect(d.map((y) => y.id)).toEqual([`special:static:${ANN}`]);
    expect(d[0].text).toBe('Ann senses static around the commander.');
    expect(d[0].text).not.toMatch(/\b(he|him|his)\b/i);
    s.special!.frequency!.suspicion[ANN] = 50;
    expect(texts(s)).toEqual([]);
    expect(texts(withLog([x()]))).toEqual([]);
  });

  it('frequency_static fires once per crossing of 50', () => {
    const s = withLog([x()]);
    sense(s, ANN, 1.5);
    const crossings = (events: Array<{ type: string }>) => events.filter((e) => e.type === 'frequency_static');
    const a = [...leak(s, 'major'), ...leak(s, 'major')]; // 53 → above 50
    expect(crossings(a)).toHaveLength(1);
    expect(crossings(leak(s, 'minor'))).toHaveLength(0); // still above
    s.special!.frequency!.suspicion[ANN] = 40;
    decayFrequency(s); // below: the crossing is armed again
    leak(s, 'major');
    expect(crossings(leak(s, 'major'))).toHaveLength(0);
    s.special!.frequency!.suspicion[ANN] = 45;
    decayFrequency(s);
    expect(crossings(leak(s, 'major'))).toHaveLength(1);
  });

  it('the event names only the unit', () => {
    const s = withLog([x()]);
    sense(s, ANN, 1.5);
    const e = [...leak(s, 'major'), ...leak(s, 'major')].find((y) => y.type === 'frequency_static')!;
    expect(Object.keys(e).sort()).toEqual(['type', 'unitId']);
  });
});

describe('leakCandidates', () => {
  const gists = (s: CampaignState, ids = [ANN]) => leakCandidates(s, reg, ids);

  it('lists unburned items of the last 14 days about present units, with a gist', () => {
    const s = withLog([x({ id: 'fq1', day: 1 }), x({ id: 'fq2', day: 9, unitId: BEA })], (st) => { st.day = 12; });
    expect(gists(s).map((c) => c.id)).toEqual(['fq1']);
    expect(gists(s, [ANN, BEA]).map((c) => c.id)).toEqual(['fq1', 'fq2']);
    expect(gists(s)[0]).toMatchObject({ unitId: ANN, gist: 'she means to refuse the next order' });
    s.day = 16; // fq1 is 15 days old
    expect(gists(s)).toEqual([]);
  });

  it('a fact the commander now knows and a demand already delivered are public', () => {
    const s = withLog([
      x({ id: 'fq1', kind: 'fact', value: 'f1', refId: 'f1' }),
      x({ id: 'fq2', kind: 'demand', value: 't', refId: 'dm1' }),
    ], (st) => {
      st.memory.facts.push({ id: 'f1', about: [ANN], text: 'secret', tags: [], importance: 3, day: 1, knownBy: [ANN], hiddenFromCommander: true });
      st.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [{ id: 'dm1', unitId: ANN, templateId: 't', text: 'x', day: 1, expiresDay: 9, status: 'undelivered', impunityDriven: false }], demandLog: [] };
    });
    expect(gists(s).map((c) => c.id)).toEqual(['fq1', 'fq2']);
    s.memory.facts[0].hiddenFromCommander = undefined;
    s.discipline!.demands[0].status = 'open';
    expect(gists(s)).toEqual([]);
  });

  it('nothing after burning, for a unit who knows, or without the trait', () => {
    const burned = withLog([x()]);
    burned.special!.frequency!.burnedDay = 1;
    expect(gists(burned)).toEqual([]);
    const known = withLog([x()], (st) => st.relations[ANN].flags.push('knows_frequency'));
    expect(gists(known)).toEqual([]);
    expect(gists(specialCampaign(reg))).toEqual([]);
  });

  it('leakInput carries no intercepted key without items (the input stays as it was)', () => {
    expect(leakInput(specialCampaign(reg), reg, [ANN])).toEqual({});
    expect(leakInput(withLog([]), reg, [ANN])).toEqual({});
    expect(Object.keys(leakInput(withLog([x()]), reg, [ANN]))).toEqual(['intercepted']);
  });
});

describe('knowledge_leak through the intent pipeline', () => {
  const ev = (over: Record<string, unknown> = {}) => ({
    type: 'knowledge_leak', actor: 'commander', targets: [ANN], severity: 'moderate', itemId: 'fq1', evidence: 'you knew I would refuse', confidence: 0.9, ...over,
  });
  const squad = [{ id: ANN }, { id: BEA }];

  it('an unknown itemId is dropped; a listed one is kept with its id', () => {
    const ctx = { participants: [ANN], squad, intercepted: ['fq1'] };
    expect(validateIntents({ events: [ev({ itemId: 'fq9' })] }, ctx).events).toEqual([]);
    expect(validateIntents({ events: [ev({ itemId: undefined })] }, ctx).events).toEqual([]);
    expect(validateIntents({ events: [ev()] }, ctx).events[0]).toMatchObject({ type: 'knowledge_leak', itemId: 'fq1', targets: [ANN] });
  });

  it('without a list of intercepted items the type is dropped', () => {
    expect(validateIntents({ events: [ev()] }, { participants: [ANN], squad }).events).toEqual([]);
  });

  it('applying it raises her suspicion and her Trust drops a little; a leak about a campaign without the trait does nothing', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    const open = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    open.special!.frequency!.intercepts = [x()];
    const before = open.relations[ANN].trust;
    const r = run(open, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [ev()] } } });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(suspicionOf(r.state, ANN)).toBe(25);
    expect(r.state.relations[ANN].trust).toBeLessThan(before);
    // the same report in a campaign without the trait is dropped by the validator
    const plain = specialCampaign(reg);
    const open2 = run(plain, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const r2 = run(open2, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [ev()] } } });
    expect(r2.state.special).toBeUndefined();
    expect(r2.state.relations[ANN].trust).toBe(open2.relations[ANN].trust);
  });
});
