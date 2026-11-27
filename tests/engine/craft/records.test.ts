import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import { fictionSeconds, noteHoldEvents, noteRun, segmentBeats } from '../../../src/engine/craft/records';
import { spanText } from '../../../src/engine/craft/state';
import { registerMemoryResolver as _r, memoryResolverFor } from '../../../src/engine/memory/resolvers';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { TUNING } from '../../../src/engine/tuning';
import { afterEach } from 'vitest';
import { loadCore } from '../../helpers/world';
import { ANN, BEA, holdScene, playOut, startWeight, world } from './world';

void _r;
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

const ctx = () => ({ registries: reg });
const outcome = (over: Partial<Parameters<typeof noteRun>[2]> = {}) => ({ holderId: ANN, physicsId: 'weight', result: 'released', segments: 6, slips: 0, tapped: false, ...over });

describe('fiction time', () => {
  it('is beats x the physics\' seconds a beat x (1 + 0.25 a level)', () => {
    expect(fictionSeconds('weight', 6, 0)).toBe(120);
    expect(fictionSeconds('weight', 6, 2)).toBe(180);
    expect(fictionSeconds('breath', 10, 4)).toBe(60);
    expect(fictionSeconds('unlisted', 3, 0)).toBe(3 * TUNING.craft.beatSecondsDefault);
    expect(spanText(45)).toBe('45 seconds');
    expect(spanText(720)).toBe('12 minutes');
    expect(spanText(7500)).toBe('2 hours 5 minutes');
  });

  it('a segment is its real-time beats, whether the scene plays turn by turn or in real time', () => {
    expect(segmentBeats(reg, 'weight')).toBe(20); // 30 s at a beat of 1.5 s
    expect(segmentBeats(reg, 'breath')).toBe(14); // 20 s
    expect(segmentBeats(reg, 'nothing')).toBe(1);
    // the same outcome gives the same record whatever the scene's mode
    const seconds = (realtime: boolean) => {
      const s = world(reg, 'play');
      s.settings.physicsRealtime = realtime;
      noteRun(s, ctx(), outcome());
      return s.relations[ANN].craft!.records!.weight.longest;
    };
    expect(seconds(true)).toBe(seconds(false));
    expect(seconds(true)).toBe(fictionSeconds('weight', 6 * 20, 0));
  });
});

describe('noteRun', () => {
  it('a new best emits record_set once, an equal or lesser one does not', () => {
    const s = world(reg, 'play');
    const first = noteRun(s, ctx(), outcome({ segments: 6 }));
    expect(first).toEqual([{ type: 'record_set', unitId: ANN, key: 'weight', seconds: 2400, kind: 'clean', kinds: ['clean', 'noTap', 'longest'] }]);
    expect(s.relations[ANN].craft!.records!.weight).toEqual({ longest: 2400, clean: 2400, noTap: 2400, day: s.day });
    expect(noteRun(s, ctx(), outcome({ segments: 6 }))).toEqual([]);
    expect(noteRun(s, ctx(), outcome({ segments: 5 }))).toEqual([]);
    const better = noteRun(s, ctx(), outcome({ segments: 7 }));
    expect(better).toHaveLength(1);
    expect(better[0]).toMatchObject({ seconds: 2800 });
  });

  it('noTap and clean are separate: a tap keeps the no-tap record, a slip keeps the clean one', () => {
    const s = world(reg, 'play');
    noteRun(s, ctx(), outcome({ segments: 4 })); // 1600 s of everything
    const tapped = noteRun(s, ctx(), outcome({ segments: 6, tapped: true }));
    expect(tapped).toEqual([expect.objectContaining({ kind: 'clean', seconds: 2400, kinds: ['clean', 'longest'] })]);
    expect(s.relations[ANN].craft!.records!.weight).toMatchObject({ longest: 2400, clean: 2400, noTap: 1600 });
    const slipped = noteRun(s, ctx(), outcome({ segments: 8, slips: 2 }));
    expect(slipped).toEqual([expect.objectContaining({ kind: 'noTap', seconds: 3200, kinds: ['noTap', 'longest'] })]);
    expect(s.relations[ANN].craft!.records!.weight).toMatchObject({ longest: 3200, clean: 2400, noTap: 3200 });
    const collapse = noteRun(s, ctx(), outcome({ segments: 9, result: 'collapse' }));
    expect(collapse[0]).toMatchObject({ kind: 'noTap', seconds: 3600 });
    expect(s.relations[ANN].craft!.records!.weight.clean).toBe(2400);
  });

  it('a marathon is its hours, not its segments', () => {
    const s = world(reg, 'play');
    const ev = noteRun(s, ctx(), outcome({ segments: 3, marathonHours: 2 }));
    expect(ev[0]).toMatchObject({ seconds: 7200 });
  });

  it('the commander\'s level stretches a beat, and a stop word, a her-task frame and a trifle set nothing', () => {
    const s = world(reg, 'play');
    s.commander.endurance = { weight: { xp: 90, level: 2 } };
    expect(noteRun(s, ctx(), outcome({ segments: 6 }))[0]).toMatchObject({ seconds: 3600 });
    const t = world(reg, 'play');
    expect(noteRun(t, ctx(), outcome({ result: 'stopped' }))).toEqual([]);
    expect(noteRun(t, ctx(), outcome({ physicsId: 'her_activity' }))).toEqual([]);
    expect(noteRun(t, ctx(), outcome({ segments: 1, physicsId: 'breath' }))).toEqual([]); // 14 beats x 3 s = 42 s, under a minute
    expect(t.relations[ANN].craft!.records).toBeUndefined(); // (the settling count of the one clean end is kept all the same)
  });

  it('keeps her settling-in count: a clean end adds, a slip resets, the stop word leaves it', () => {
    const s = world(reg, 'play');
    noteRun(s, ctx(), outcome());
    noteRun(s, ctx(), outcome());
    expect(s.relations[ANN].craft!.streak).toEqual({ weight: 2 });
    noteRun(s, ctx(), outcome({ result: 'stopped' }));
    expect(s.relations[ANN].craft!.streak).toEqual({ weight: 2 });
    noteRun(s, ctx(), outcome({ slips: 1 }));
    expect(s.relations[ANN].craft!.streak!.weight).toBeUndefined();
  });

  it('writes nothing for a holder who is not craft-live', () => {
    const s = world(reg, 'equal');
    expect(noteRun(s, ctx(), outcome())).toEqual([]);
    expect(s.relations[ANN].craft).toBeUndefined();
    const live = world(reg, 'play');
    expect(noteRun(live, ctx(), outcome({ holderId: BEA }))).toEqual([]);
    expect(live.relations[BEA].craft).toBeUndefined();
  });
});

describe('noteHoldEvents', () => {
  const seg = (over: Record<string, unknown> = {}) => ({ type: 'physics_segment', runId: 'p1', n: 1, phase: 'end', physicsId: 'weight', holderId: ANN, slips: 0, ...over });

  it('a clean segment of a skill physics pays 3 to its endurance, a marathon\'s times its pace scale, a slipped one nothing', () => {
    const s = world(reg, 'play');
    const ev = noteHoldEvents(s, ctx(), [seg()]);
    expect(ev.map((e) => e.type)).toEqual(['endurance_gained', 'craft_xp']);
    expect(s.commander.endurance!.weight.xp).toBe(3);
    noteHoldEvents(s, ctx(), [seg({ scale: 2 })]);
    expect(s.commander.endurance!.weight.xp).toBe(9);
    expect(noteHoldEvents(s, ctx(), [seg({ slips: 1 })])).toEqual([]);
    expect(noteHoldEvents(s, ctx(), [seg({ physicsId: 'tongue_work' })])).toEqual([]); // no endurance for a cleaning
    expect(noteHoldEvents(s, ctx(), [seg({ phase: 'start' })])).toEqual([]);
    expect(s.commander.endurance!.weight.xp).toBe(9);
  });

  it('writes nothing while the holder is not craft-live', () => {
    const s = world(reg, 'equal');
    expect(noteHoldEvents(s, ctx(), [seg()])).toEqual([]);
    expect(s.commander.endurance).toBeUndefined();
    expect(s.commander.craft).toBeUndefined();
  });

  it('the tap of the same action is a tap, and so is an ignored one the outcome counts', () => {
    const a = world(reg, 'play');
    noteHoldEvents(a, ctx(), [{ type: 'physics_signal', runId: 'p1', released: true }, { type: 'physics_outcome', runId: 'p1', physicsId: 'weight', holderId: ANN, result: 'released', segments: 6 }]);
    expect(a.relations[ANN].craft!.records!.weight).toMatchObject({ longest: 2400, noTap: 0 });
    const b = world(reg, 'play');
    noteHoldEvents(b, ctx(), [{ type: 'physics_outcome', runId: 'p1', physicsId: 'weight', holderId: ANN, result: 'released', segments: 6, taps: 1 }]);
    expect(b.relations[ANN].craft!.records!.weight).toMatchObject({ longest: 2400, noTap: 0 });
    const c = world(reg, 'play');
    noteHoldEvents(c, ctx(), [{ type: 'physics_signal', runId: 'p9', released: true }, { type: 'physics_outcome', runId: 'p1', physicsId: 'weight', holderId: ANN, result: 'released', segments: 6 }]);
    expect(c.relations[ANN].craft!.records!.weight.noTap).toBe(2400);
  });
});

describe('a real run', () => {
  it('a marathon of two hours sets the same record at the three paces, and a clean hold pays xp', () => {
    const seconds: number[] = [];
    for (const pace of ['short', 'normal', 'long'] as const) {
      let got: number | undefined;
      for (let seed = 1; seed <= 8 && got === undefined; seed++) {
        const s = startWeight(holdScene(reg, { pace }), reg, 2);
        const r = playOut(s, reg, seed);
        const done = r.events.find((e) => e.type === 'marathon_done');
        if (done?.result !== 'released') continue;
        got = r.state.relations[ANN].craft!.records!.weight.longest;
        expect(r.events.filter((e) => e.type === 'record_set')).toHaveLength(1);
        expect(r.events.filter((e) => e.type === 'craft_xp' && e.cause === 'phase').length).toBeGreaterThanOrEqual(2); // a clean segment each (the short pace has two segments)
        expect(r.state.commander.endurance!.weight.xp).toBeGreaterThan(10); // the hold's own +10 and the segments' 3 (times the pace scale)
      }
      expect(got, pace).toBeDefined();
      seconds.push(got!);
    }
    expect(seconds).toEqual([7200, 7200, 7200]);
  });

  it('an ordinary weight hold (not a marathon) is its segments in fiction time', () => {
    for (const realtime of [false]) { // (a real-time hold needs a player's inputs a script of holds cannot give; the conversion is mode-free, see above)
      let got: { seconds: number; segments: number } | undefined;
      for (let seed = 1; seed <= 8 && got === undefined; seed++) {
        const r = playOut(startWeight(holdScene(reg, { realtime }), reg), reg, seed);
        const out = r.events.find((e) => e.type === 'physics_outcome');
        if (out?.result !== 'released' && out?.result !== 'checked') continue;
        const rec = r.state.relations[ANN].craft?.records?.weight;
        if (rec === undefined) continue; // a hold under a minute of fiction sets none
        got = { seconds: rec.longest, segments: Number(out.segments) };
      }
      expect(got, String(realtime)).toBeDefined();
      expect(got!.seconds).toBe(fictionSeconds('weight', got!.segments * 20, 0));
    }
  });

  it('nothing is written when she does not hold', () => {
    const s = holdScene(reg);
    s.relations[ANN].dynamic!.frame = 'equal';
    const r = playOut(startWeight(s, reg), reg, 1);
    expect(r.state.relations[ANN].craft).toBeUndefined();
    expect(r.state.commander.craft).toBeUndefined();
    expect(r.events.some((e) => e.type === 'record_set' || e.type === 'craft_xp')).toBe(false);
  });
});

describe('the memory rule of a record', () => {
  it('writes a fact about her, known by her alone, in words of fiction time', () => {
    expect(memoryResolverFor('record_set')).toBeDefined();
    const s = world(reg, 'play');
    const before = s.memory.facts.length;
    rememberEvents(s, [{ type: 'record_set', unitId: ANN, key: 'weight', seconds: 720, kind: 'longest', kinds: ['longest'] }], reg);
    const f = s.memory.facts.slice(before);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ about: [ANN], knownBy: [ANN], importance: 1 });
    expect(f[0].text).toMatch(/weight/);
    expect(f[0].text).toMatch(/12 minutes/);
    expect(f[0].tags).toEqual(expect.arrayContaining(['craft', 'record']));
    expect(rememberEvents(s, [{ type: 'record_set', unitId: ANN, key: 'weight', seconds: 0 }], reg)).toBeUndefined;
  });
});
