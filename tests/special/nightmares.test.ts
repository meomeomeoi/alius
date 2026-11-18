import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { Rng, seedRng } from '../../src/engine/rng';
import { commanderStress } from '../../src/engine/special/commanderStress';
import { NIGHTMARE_KNOCK_KIND, rollNightmare } from '../../src/engine/special/paranoia/nightmares';
import type { CampaignState } from '../../src/engine/state/types';
import { vi } from 'vitest';
import { ContextBuilder } from '../../src/llm/context';
import { createSpecial, type SpecialDeps } from '../../src/special/controller';
import { specialDirectives } from '../../src/special/directives';
import { loadCore, run } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import { ANN, BEA, reseed, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const calm = (): CampaignState => {
  const s = specialCampaign(reg, 'bloom_paranoia');
  for (const id of [ANN, BEA, 'unit_cat', 'unit_dee']) s.relations[id].affinity = 0;
  return s;
};
const fond = (s: CampaignState, id = ANN, n = 40): CampaignState => { s.relations[id].affinity = n; return s; };
const roll = (s: CampaignState) => rollNightmare(s, ctxOf(s));
const nightmare = (events: Array<{ type: string }>) => events.find((e) => e.type === 'bloom_nightmare') as Record<string, unknown> | undefined;

describe('rollNightmare', () => {
  it('fires about 12 % of days at stress 0 and 18 % at stress 60', () => {
    const rate = (stress: number): number => {
      const base = calm();
      base.commander.stress = stress;
      let n = 0;
      for (let seed = 1; seed <= 2000; seed++) if (nightmare(roll(reseed(base, seed)))) n += 1;
      return n / 2000;
    };
    const low = rate(0);
    expect(low).toBeGreaterThan(0.10);
    expect(low).toBeLessThan(0.14);
    const high = rate(60);
    expect(high).toBeGreaterThan(0.16);
    expect(high).toBeLessThan(0.20);
  });

  it('a nightmare adds 15 stress, sets lastNightmareDay and names the day, never a truth', () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = reseed(calm(), seed);
      const ev = nightmare(roll(s));
      if (!ev) continue;
      expect(commanderStress(s)).toBe(15);
      expect(s.special!.paranoia!.lastNightmareDay).toBe(s.day);
      expect(Object.keys(ev).sort()).toEqual(['day', 'lostMorning', 'type']);
      expect(ev.day).toBe(s.day);
      return;
    }
    throw new Error('no seed gave a nightmare');
  });

  it('lost morning: with a seed that costs it, the next rollover emits morning_lost', () => {
    let seen = 0;
    let kept = 0;
    for (let seed = 1; seed < 400 && !(seen && kept); seed++) {
      const s = reseed(calm(), seed);
      const ev = nightmare(roll(s));
      if (!ev) continue;
      expect(s.calendar.loseMorning === true).toBe(ev.lostMorning === true);
      if (ev.lostMorning) {
        seen += 1;
        let t = structuredClone(s);
        const events: Array<{ type: string }> = [];
        for (let i = 0; i < 6 && t.day === s.day; i++) {
          const r = run(t, reg, { type: 'calendar/consume_slot' });
          events.push(...r.events);
          t = r.state;
        }
        expect(events.some((e) => e.type === 'morning_lost')).toBe(true);
      } else kept += 1;
    }
    expect(seen && kept).toBeTruthy();
  });

  it('a fond unit comes to the door the same night: queued before night_check, opened as the night knock', () => {
    let found = false;
    for (let seed = 1; seed < 2500 && !found; seed++) {
      let t = reseed(fond(calm()), seed);
      for (let i = 0; i < 6 && t.slot !== 'night' && t.day === calm().day; i++) t = run(t, reg, { type: 'calendar/consume_slot' }).state;
      const entry = t.calendar.nightEvent;
      if (entry?.kind !== NIGHTMARE_KNOCK_KIND) continue; // another day-end draw changed the course; try the next seed
      found = true;
      expect(entry.unitId).toBe(ANN);
      expect(entry.priority).toBe(4);
      expect(entry.framing).toBe('Ann heard the commander through the wall.');
      expect(entry.framing).not.toMatch(/\b(he|him|his)\b/i);
      expect(entry.ignore).toEqual({ event: 'dismissed', severity: 'minor' });
    }
    expect(found).toBe(true);
  });

  it('the visitor is the fondest unit (Affinity 30 or more), ties in squad order', () => {
    for (let seed = 1; seed < 600; seed++) {
      const s = reseed(calm(), seed);
      fond(s, BEA, 55);
      fond(s, 'unit_cat', 55);
      fond(s, ANN, 31);
      const ev = nightmare(roll(s));
      if (!ev?.visitorId) continue;
      expect(ev.visitorId).toBe(BEA);
      expect(s.calendar.nightEventsQueue.map((e) => e.kind)).toContain(NIGHTMARE_KNOCK_KIND);
      return;
    }
    throw new Error('no seed brought a visitor');
  });

  it('nobody fond: no knock, however many nightmares', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = reseed(fond(calm(), ANN, 29), seed);
      const ev = nightmare(roll(s));
      expect(ev?.visitorId).toBeUndefined();
      expect(s.calendar.nightEventsQueue.filter((e) => e.kind === NIGHTMARE_KNOCK_KIND)).toEqual([]);
    }
  });

  it('with no paranoia effect: no draw and no state', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    const c = ctxOf(s);
    expect(rollNightmare(s, c)).toEqual([]);
    expect(c.rng.state).toEqual(s.rng);
    const none = specialCampaign(reg);
    none.rng = seedRng(3);
    expect(rollNightmare(none, ctxOf(none))).toEqual([]);
    expect(none.special).toBeUndefined();
  });
});

describe('the morning after', () => {
  const rig = () => {
    const h = worldHarness(reg, calm());
    const notices: Array<{ kind: string; text: string; title: string }> = [];
    const deps: SpecialDeps = { ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn(), notice: (kind, text, title) => { notices.push({ kind, text, title }); } };
    return { special: createSpecial(deps), notices };
  };

  it('the toast comes with the next morning, once, in Bloom imagery and with no pronoun for the commander', () => {
    const r = rig();
    r.special.onEvents([{ type: 'bloom_nightmare', day: 3, lostMorning: false }]);
    expect(r.notices).toEqual([]);
    r.special.onEvents([{ type: 'day_started', day: 4 }]);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toMatchObject({ kind: 'info', title: 'BLOOM' });
    expect(r.notices[0].text).not.toMatch(/AUTHOR TO WRITE|\b(he|him|his)\b/i);
    r.special.onEvents([{ type: 'day_started', day: 5 }]);
    expect(r.notices).toHaveLength(1);
  });

  it('the directive special:nightmare is present in a scene the day after, and only then', () => {
    const s = calm();
    s.special!.paranoia!.lastNightmareDay = s.day - 1;
    expect(specialDirectives(s, reg, [ANN])).toEqual([]); // no scene open
    s.scene = { id: 's1', day: s.day, slot: 'morning', locationId: 'mess_hall', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    const d = specialDirectives(s, reg, [ANN]);
    expect(d.map((x) => x.id)).toEqual(['special:nightmare']);
    expect(d[0].text).toBe('The commander slept badly: Bloom dreams.');
    s.special!.paranoia!.lastNightmareDay = s.day - 2;
    expect(specialDirectives(s, reg, [ANN])).toEqual([]);
    expect(specialDirectives(specialCampaign(reg), reg, [ANN])).toEqual([]);
  });
});
