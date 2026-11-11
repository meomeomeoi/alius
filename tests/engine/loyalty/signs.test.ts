import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { emitSign } from '../../../src/engine/loyalty/state';
import { loyaltyDayStep } from '../../../src/engine/loyalty/desertion';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, loadCore, ofType, setRelation } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
const ANN = 'unit_ann';
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  for (const u of base.squad) setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' });
});

const fresh = (seed = 1): CampaignState => {
  const s = structuredClone(base);
  s.rng = seedRng(seed);
  return s;
};

describe('emitSign', () => {
  it('a dm sign is a message from her, a fact sign a public fact, a talk sign a night knock', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60 && seen.size < 3; seed++) {
      const d = fresh(seed);
      const events = emitSign(d, ctxOf(d, reg), ANN, 'doubt');
      const sign = ofType(events, 'loyalty_sign')[0];
      expect(sign).toMatchObject({ unitId: ANN, about: 'doubt' });
      seen.add(sign.kind as string);
      if (sign.kind === 'dm') {
        const msg = d.dms[ANN].at(-1)!;
        expect(msg.from).toBe(ANN);
        expect(msg.read).toBe(false);
        expect(msg.text).not.toContain('{name}');
      } else if (sign.kind === 'fact') {
        const f = d.memory.facts.at(-1)!;
        expect(f.about).toEqual([ANN]);
        expect(f.knownBy).toContain('*');
        expect(f.tags).toContain('loyalty');
        expect(f.text).toContain('Ann');
        expect(f.text).not.toContain('{name}');
      } else {
        const entry = d.calendar.nightEventsQueue.at(-1)!;
        expect(entry).toMatchObject({ unitId: ANN, kind: 'we_need_to_talk', priority: 55 });
        expect(entry.expiresDay).toBe(d.day + 2);
        expect(entry.framing).toContain('Ann');
      }
      expect(d.disloyalty!.units[ANN].signs.at(-1)).toMatchObject({ day: d.day, about: 'doubt', kind: sign.kind });
    }
    expect([...seen].sort()).toEqual(['dm', 'fact', 'talk']);
  });

  it('prefers a line not used for her yet and keeps at most 6 records', () => {
    const d = fresh();
    const used = new Set<string>();
    for (let i = 0; i < 4; i++) {
      d.calendar.nightEventsQueue = [];
      emitSign(d, ctxOf(d, reg), ANN, 'doubt');
      used.add(d.disloyalty!.units[ANN].signs.at(-1)!.signId);
    }
    expect(used.size).toBe(4); // there are four doubt lines
    for (let i = 0; i < 10; i++) {
      d.calendar.nightEventsQueue = [];
      emitSign(d, ctxOf(d, reg), ANN, 'doubt');
    }
    expect(d.disloyalty!.units[ANN].signs).toHaveLength(6);
  });

  it('a mutiny sign has the requested level', () => {
    for (const level of [1, 2] as const) {
      const d = fresh();
      const events = emitSign(d, ctxOf(d, reg), ANN, 'mutiny', level);
      const id = d.disloyalty!.units[ANN].signs.at(-1)!.signId;
      expect(reg.loyaltySigns.get(id)).toMatchObject({ about: 'mutiny', level });
      expect(ofType(events, 'loyalty_sign')).toHaveLength(1);
    }
  });

  it("a grunt's sign is always a fact", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = fresh(seed);
      d.squad.find((u) => u.id === ANN)!.kind = 'grunt';
      const events = emitSign(d, ctxOf(d, reg), ANN, 'desertion');
      expect(ofType(events, 'loyalty_sign')[0].kind).toBe('fact');
      expect(d.dms[ANN] ?? []).toEqual([]);
      expect(d.calendar.nightEventsQueue).toEqual([]);
    }
  });

  it('a sign line removed from the content is simply not offered', () => {
    const r = { ...reg } as Registries;
    r.loyaltySigns = new Map();
    const d = fresh();
    expect(emitSign(d, ctxOf(d, r), ANN, 'doubt')).toEqual([]);
    expect(d.disloyalty?.units[ANN]?.signs ?? []).toEqual([]);
  });
});

describe('day step signs', () => {
  const step = (s: CampaignState) => loyaltyDayStep(s, ctxOf(s, reg));

  it('a wavering unit gets a doubt sign at most every third day and never an attempt', () => {
    const d = fresh(3);
    setRelation(d, ANN, { trust: 20, affinity: 0, band: 'wavering', stateId: 'comrade' });
    const days: number[] = [];
    for (let i = 0; i < 30; i++) {
      d.day += 1;
      d.calendar.nightEventsQueue = [];
      setRelation(d, ANN, { trust: 20, band: 'wavering' });
      const events = step(d);
      if (ofType(events, 'loyalty_sign').some((e) => e.unitId === ANN)) days.push(d.day);
      expect(ofType(events, 'desertion_attempt')).toEqual([]);
      expect(d.disloyalty?.open).toBeUndefined();
    }
    expect(days.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(3);
  });

  it('a unit that has just started wavering gets no sign on the first day', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const d = fresh(seed);
      setRelation(d, ANN, { trust: 20, band: 'wavering', stateId: 'comrade' });
      d.day += 1;
      expect(ofType(step(d), 'loyalty_sign')).toEqual([]);
      d.day += 1;
      expect(ofType(step(d), 'loyalty_sign')).toEqual([]);
    }
  });

  it('a steady unit gets no sign', () => {
    const d = fresh();
    d.day += 1;
    expect(ofType(step(d), 'loyalty_sign')).toEqual([]);
  });

  it('desertion signs are dropped once she is no longer breaking, so the next spell starts with a fresh sign', () => {
    const d = fresh();
    setRelation(d, ANN, { trust: 3, affinity: -10, band: 'breaking' });
    d.day += 1;
    step(d);
    expect(d.disloyalty!.units[ANN].signs.some((s) => s.about === 'desertion')).toBe(true);
    setRelation(d, ANN, { trust: 60, band: 'steady' });
    d.day += 1;
    step(d);
    expect(d.disloyalty!.units[ANN].signs.some((s) => s.about === 'desertion')).toBe(false);
  });
});
