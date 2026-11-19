import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/scene';
import { developmentDayStep, flipReading, misreadChance, misreads } from '../../../src/engine/development/misread';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import { fnv1a } from '../../../src/engine/hub';
import type { Appraisal, CampaignState, Reading, Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { withBond } from '../../helpers/bonds';
import { endDay } from '../../helpers/loyalty';
import { campaign, ctxOf, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea';
const unitOf = (s: CampaignState, id: string): Unit => s.squad.find((u) => u.id === id)!;
const hash = (unitId: string, n: number): number => fnv1a(`${unitId}|appraisal|ap${n}`) / 2 ** 32;
const welcome: Reading = { wanted: 'yes', initiator: 'target', harm: 'none', outcome: 'good' };
const coerced = (s: CampaignState, over: Record<string, unknown> = {}): CampaignState => run(s, reg, {
  type: 'intents/apply',
  payload: { channel: 'scene', intents: { events: [{ type: 'coerced', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'x', confidence: 1, reading: welcome, ...over }] } },
}).state;
const started = (): CampaignState => {
  const s = campaign(reg, 4);
  s.settings.characterDevelopment = 'normal';
  return run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } }).state;
};
/** An appraisal counter at which both she and the subject would misread if they could (low insight). */
const unluckyN = (): number => {
  for (let n = 0; n < 500; n++) if (hash(BEA, n) < TUNING.development.misread.low && hash(ANN, n) < TUNING.development.misread.low) return n;
  throw new Error('no unlucky id found');
};
const luckyN = (): number => {
  for (let n = 0; n < 500; n++) if (hash(BEA, n) >= 0.9) return n;
  throw new Error('no lucky id found');
};

describe('who misreads', () => {
  it('only witnesses misread', () => {
    const s = started();
    unitOf(s, BEA).insight = 'low';
    unitOf(s, ANN).insight = 'low';
    const n = unluckyN();
    ensureDevelopment(unitOf(s, BEA)).nextId = n;
    ensureDevelopment(unitOf(s, ANN)).nextId = n;
    const after = coerced(s);
    const ann = developmentOf(unitOf(after, ANN)).pending[0];
    expect(ann).toMatchObject({ role: 'subject', wanted: 'yes', initiator: 'target' });
    expect(ann.misread).toBeUndefined();
    const bea = developmentOf(unitOf(after, BEA)).pending[0];
    expect(bea).toMatchObject({ role: 'witness', wanted: 'no', initiator: 'actor', misread: true, truth: welcome });
    expect(developmentOf(unitOf(after, BEA)).misread?.map((a) => a.id)).toEqual([bea.id]);
  });

  it('a witness with a lucky hash reads it right', () => {
    const s = started();
    unitOf(s, BEA).insight = 'low';
    ensureDevelopment(unitOf(s, BEA)).nextId = luckyN();
    const bea = developmentOf(unitOf(coerced(s), BEA)).pending[0];
    expect(bea).toMatchObject({ wanted: 'yes', initiator: 'target' });
    expect(bea.misread).toBeUndefined();
    expect(developmentOf(unitOf(coerced(s), BEA)).misread ?? []).toEqual([]);
  });

  it('unclear never flips', () => {
    expect(flipReading({ wanted: 'unclear', initiator: 'mutual', harm: 'none', outcome: 'good' })).toEqual({ wanted: 'unclear', initiator: 'mutual', harm: 'none', outcome: 'good' });
    const s = started();
    unitOf(s, BEA).insight = 'low';
    ensureDevelopment(unitOf(s, BEA)).nextId = unluckyN();
    const bea = developmentOf(unitOf(coerced(s, { reading: { ...welcome, wanted: 'unclear' } }), BEA)).pending[0];
    expect(bea.wanted).toBe('unclear');
    expect(bea.misread).toBeUndefined();
  });

  it('flips wanted and initiator, and keeps harm and outcome', () => {
    expect(flipReading({ wanted: 'yes', initiator: 'target', harm: 'none', outcome: 'good' })).toEqual({ wanted: 'no', initiator: 'actor', harm: 'none', outcome: 'good' });
    expect(flipReading({ wanted: 'no', initiator: 'actor', harm: 'minor', outcome: 'bad' })).toEqual({ wanted: 'yes', initiator: 'target', harm: 'minor', outcome: 'bad' });
    expect(flipReading({ wanted: 'yes', initiator: 'mutual', harm: 'none', outcome: 'good' }).initiator).toBe('mutual');
  });
});

describe('the chance', () => {
  it('insight orders it, a secret relationship raises it, and it is capped', () => {
    const s = started();
    const b = unitOf(s, BEA);
    const at = (insight?: Unit['insight']) => { b.insight = insight; return misreadChance(s, b, ANN); };
    expect(at('low')).toBe(0.35);
    expect(at(undefined)).toBe(0.15);
    expect(at('high')).toBe(0.05);
    expect(at('low')).toBeGreaterThan(at('mid'));
    s.relations[ANN].publicity = { level: 'secret', since: 1 };
    b.insight = 'low';
    expect(misreadChance(s, b, ANN)).toBeCloseTo(0.35 * TUNING.development.secretMult);
    expect(misreadChance(s, b, ANN)).toBeLessThanOrEqual(TUNING.development.misreadCap);
    expect(misreadChance(s, b, 'commander')).toBe(0.35); // the commander is not a unit with a relation to hide
  });

  it('is a hash: deterministic, and the rng is untouched', () => {
    const s = started();
    const b = unitOf(s, BEA);
    b.insight = 'low';
    const rng = structuredClone(s.rng);
    const first = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => misreads(s, b, `ap${n}`, ANN));
    expect(first).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => misreads(s, b, `ap${n}`, ANN)));
    expect(first).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => hash(BEA, n) < 0.35));
    expect(s.rng).toEqual(rng);
    const a = coerced(s);
    const c = coerced(s);
    expect(developmentOf(unitOf(a, BEA))).toEqual(developmentOf(unitOf(c, BEA)));
  });
});

describe('revision', () => {
  /** BEA, a caretaker, read a welcomed act as force on day 3: she holds the misread appraisal and its pushes. */
  function misread(subject = ANN): CampaignState {
    const s = campaign(reg, 4);
    s.settings.characterDevelopment = 'normal';
    s.day = 3;
    withBond(s, BEA, { caretaker: true });
    const dev = ensureDevelopment(unitOf(s, BEA));
    const a: Appraisal = {
      id: 'ap0', day: 3, kind: 'coerced', target: `unit:${subject}`, role: 'witness', wanted: 'no', initiator: 'actor', harm: 'serious', outcome: 'bad', severity: 'moderate',
      subject, misread: true, truth: welcome, pushes: [{ axis: 'value:mercy', amount: 1 }, { axis: 'value:autonomy', amount: 0.5 }], summary: 'witness · coerced',
    };
    dev.pending.push(structuredClone(a));
    dev.misread = [structuredClone(a)];
    dev.acc = { 'value:mercy': 1, 'value:autonomy': 0.5 };
    dev.nextId = 1;
    return s;
  }
  const step = (s: CampaignState) => {
    const draft = structuredClone(s);
    const events = developmentDayStep(draft, ctxOf(draft, reg));
    return { draft, events };
  };
  const fact = (s: CampaignState, over: Record<string, unknown>) => {
    s.memory.facts.push({ id: 'fr1', about: [ANN], text: 'It was agreed.', tags: [], importance: 3, day: 5, knownBy: [ANN], ...over } as never);
  };

  it('is revised when a newer fact about the subject reaches her (a rumor counts)', () => {
    const s = misread();
    s.day = 6;
    fact(s, { heard: { [BEA]: 5 } });
    const { draft, events } = step(s);
    expect(ofType(events, 'appraisal_revised')).toEqual([{ type: 'appraisal_revised', unitId: BEA, appraisalId: 'ap0' }]);
    const dev = developmentOf(unitOf(draft, BEA));
    expect(dev.acc).toEqual({ 'value:mercy': 0.5 }); // −0.5 × (1, 0.5), then +0.5 × (autonomy −0.5)
    expect(dev.misread ?? []).toEqual([]);
    expect(dev.pending[0]).toMatchObject({ wanted: 'yes', initiator: 'target' });
    expect(dev.pending[0].misread).toBeUndefined();
  });

  it('knowing it from the start (knownBy her, or everyone) counts as well', () => {
    for (const knownBy of [[ANN, BEA], ['*']]) {
      const s = misread();
      s.day = 6;
      fact(s, { knownBy });
      expect(ofType(step(s).events, 'appraisal_revised')).toHaveLength(1);
    }
  });

  it('an older fact, or one about someone else, does not revise', () => {
    const s = misread();
    s.day = 6;
    fact(s, { day: 3, knownBy: [ANN, BEA] });
    fact(s, { id: 'fr2', about: ['unit_cat'], day: 5, knownBy: [ANN, BEA] });
    fact(s, { id: 'fr3', day: 5, knownBy: [ANN] }); // she does not know it
    fact(s, { id: 'fr4', about: [ANN, BEA, 'unit_cat', 'unit_dee'], day: 5, knownBy: ['*'] }); // a squad-wide fact tells her nothing about this one
    const { draft, events } = step(s);
    expect(ofType(events, 'appraisal_revised')).toEqual([]);
    expect(developmentOf(unitOf(draft, BEA)).misread).toHaveLength(1);
    expect(developmentOf(unitOf(draft, BEA)).acc).toEqual({ 'value:mercy': 1, 'value:autonomy': 0.5 });
  });

  it('is dropped after 30 days unrevised', () => {
    const s = misread();
    s.day = 3 + TUNING.development.misreadDays;
    expect(developmentOf(unitOf(step(s).draft, BEA)).misread).toHaveLength(1);
    s.day += 1;
    const { draft, events } = step(s);
    expect(developmentOf(unitOf(draft, BEA)).misread ?? []).toEqual([]);
    expect(ofType(events, 'appraisal_revised')).toEqual([]);
    expect(developmentOf(unitOf(draft, BEA)).acc).toEqual({ 'value:mercy': 1, 'value:autonomy': 0.5 }); // dropped, not reverted
  });

  it('runs as a day-end step, after the rumors have spread', () => {
    let s = misread('unit_dee'); // nobody else has facts about her, so only the rumor can revise it
    s.day = 4;
    fact(s, { id: 'fr9', about: ['unit_dee'], day: 4, knownBy: ['unit_dee'], spread: 'fast' });
    for (let i = 0; i < 12 && developmentOf(unitOf(s, BEA)).misread !== undefined; i++) s = endDay(s, reg);
    expect(developmentOf(unitOf(s, BEA)).misread).toBeUndefined(); // the rumor reached her, the day step revised it
    expect(s.memory.facts.find((f) => f.id === 'fr9')!.heard?.[BEA]).toBeDefined();
    expect(developmentOf(unitOf(s, BEA)).acc).toEqual({ 'value:mercy': 0.5 });
    expect(developmentOf(unitOf(s, BEA)).pending[0].pushes).toEqual([{ axis: 'value:mercy', amount: 0.5 }]); // the net, with no empty line
  });

  it('does nothing while development is off', () => {
    const s = misread();
    s.day = 6;
    fact(s, { knownBy: [ANN, BEA] });
    delete s.settings.characterDevelopment;
    expect(step(s).events).toEqual([]);
  });
});
