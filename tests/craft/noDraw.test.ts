import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/bonds';
import '../../src/engine/actions/craft';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/personal';
import '../../src/engine/actions/practice';
import { registerFrameReader, resetBlockingHooks } from '../../src/engine/blocking';
import { installCraftHooks } from '../../src/engine/craft/hooks';
import { drillDayStep } from '../../src/engine/craft/programmes/drill';
import { givePraise, praiseDayStep } from '../../src/engine/craft/programmes/regal';
import { vindictiveDayStep } from '../../src/engine/craft/programmes/vindictive';
import { decayCraft } from '../../src/engine/craft/decay';
import { craftOn } from '../../src/engine/craft/gate';
import { dynamicOf } from '../../src/engine/dynamic/state';
import { resetPhysicsHooks } from '../../src/engine/physics/style';
import { Rng } from '../../src/engine/rng';
import type { EngineEvent } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { ctxOf, errors, loadCore, run } from '../helpers/world';
import { ANN, holdScene, playOut, startWeight, unitOf, withService, world } from '../engine/craft/world';

/**
 * P16b review (M8): the craft draws nothing when someone IS craft-live. `tests/sim/practiceLongRun.test.ts` runs a holder who never reaches the craft's paths; this runs a seeded stretch with a
 * craft-live holder through them: a weight hold to its outcome with records and a lesson, a posture hold with corrections and a slip, an unasked care landing in a scene, a drill with a
 * partner, the day steps with decay, a drill exam booking, a praise and a sentence. Every draw of the dispatcher's rng is recorded with its stack (`Error.stackTraceLimit = Infinity`, as the long run
 * does); none may pass through `src/engine/craft/`. Each scene also says which events it saw, so a path that silently stopped running fails here.
 */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); installCraftHooks(); });

type Ev = EngineEvent;
const stacks: string[] = [];
let total = 0;

/** Runs `play` with every draw of the engine's rng recorded; returns the events it reports and the stacks of the draws that passed through the craft. */
function watched(play: () => Ev[]): { events: Ev[]; craft: string[]; draws: number } {
  const proto = Rng.prototype as unknown as { next: () => number };
  const original = proto.next;
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  const seen: string[] = [];
  const spy = vi.spyOn(proto, 'next').mockImplementation(function (this: Rng) { seen.push(new Error().stack ?? ''); return original.call(this); });
  try {
    const events = play();
    return { events, craft: seen.filter((st) => /src\/engine\/craft\//.test(st)), draws: seen.length };
  } finally {
    spy.mockRestore();
    Error.stackTraceLimit = limit;
    total += seen.length;
    stacks.push(...seen);
  }
}
const kinds = (events: Ev[]): Set<string> => new Set(events.map((e) => e.type));
const styled = (s: CampaignState, style: string): CampaignState => { unitOf(s, ANN).bond!.practice!.style = { primary: style as never }; return s; };

describe('the craft draws nothing with a craft-live holder', () => {
  it('a weight hold to its outcome (records, endurance xp) and the slips of another run with her lesson', () => {
    const w = watched(() => {
      const s = styled(holdScene(reg), 'drill');
      expect(craftOn(s, reg)).toBe(true);
      const played = playOut(startWeight(s, reg), reg, 5);
      // a second run whose beats are all let go: slips, and she names the point
      const t = startWeight(styled(holdScene(reg), 'drill'), reg);
      const next = run(t, reg, { type: 'physics/next_segment', payload: { runId: t.scene!.physics!.id } });
      const ended = run(next.state, reg, { type: 'physics/segment_end', payload: { runId: t.scene!.physics!.id, segment: next.state.scene!.physics!.segment.n, inputs: [] } });
      return [...played.events, ...next.events, ...ended.events] as Ev[];
    });
    expect(w.craft, 'a draw passed through src/engine/craft/').toEqual([]);
    const k = kinds(w.events);
    for (const t of ['physics_outcome', 'record_set', 'craft_xp', 'physics_slip', 'lesson']) expect(k.has(t), t).toBe(true);
  });

  it('a posture hold with a correction, a slip and its end', () => {
    const w = watched(() => {
      const s = styled(holdScene(reg), 'drill');
      const point = Object.keys(reg.servicePostures.get('kneel_upright')!.drift as object)[0]!;
      const out: Ev[] = [];
      let cur = s;
      for (const [type, payload] of [
        ['posture/take', { presetId: 'kneel_upright', at: 1, until: 12 }], ['posture/correct', { point, amount: 1 }], ['posture/slip', { point }], ['posture/end', { reason: 'released', beats: 12 }],
      ] as const) {
        const r = run(cur, reg, { type, payload });
        expect(errors(r.events), type).toEqual([]);
        out.push(...r.events);
        cur = r.state;
      }
      return out;
    });
    expect(w.craft).toEqual([]);
    const k = kinds(w.events);
    for (const t of ['posture_taken', 'posture_corrected', 'posture_slip_noted', 'posture_ended']) expect(k.has(t), t).toBe(true);
  });

  it('an unasked care that lands in the next scene, and a drill with her', () => {
    const w = watched(() => {
      const s = world(reg, 'play');
      s.slot = 'morning';
      const out: Ev[] = [];
      const c = run(s, reg, { type: 'care/unasked', payload: { unitId: ANN, careId: 'polishing_her_boots' } });
      expect(errors(c.events)).toEqual([]);
      out.push(...c.events);
      c.state.relations[ANN].craft!.cares![0]!.noticed = true;
      const m = run(c.state, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
      out.push(...m.events);
      const d = world(reg, 'play');
      d.slot = 'morning';
      const train = run(d, reg, { type: 'activity/do', payload: { activityId: 'train', focus: 'endurance_breath', companionId: ANN } });
      expect(errors(train.events)).toEqual([]);
      out.push(...train.events);
      return out;
    });
    expect(w.craft).toEqual([]);
    const k = kinds(w.events);
    for (const t of ['care_unasked', 'care_noticed', 'drill_done']) expect(k.has(t), t).toBe(true);
  });

  it('the day steps: decay of an idle discipline, a drill norm and its exam booking, a praise, a missed praise and a sentence', () => {
    const w = watched(() => {
      registerFrameReader(() => 'play');
      const s = styled(world(reg, 'play'), 'drill');
      s.relations[ANN].stateId = 'confidant';
      s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'worship', 'restraint', 'service', 'objectification', 'humiliation'])] };
      s.slot = 'afternoon';
      const out: Ev[] = [];
      s.commander.craft = { stillness: { xp: 160, level: 3, lastDay: s.day } };
      s.day += 30; // idle for longer than the decay
      out.push(...decayCraft(s, reg), ...drillDayStep(s, ctxOf(s, reg)));
      s.day += 8; // a week on: the exam is booked
      out.push(...drillDayStep(s, ctxOf(s, reg)));
      // a regal holder's praise and a day without one
      registerFrameReader(() => 'role');
      const r = styled(withService(world(reg, 'role')), 'regal');
      dynamicOf(r, ANN)!.domains = [{ id: 'others', since: r.day }] as never;
      r.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'daily_praise', text: 'Praise me.', status: 'active', day: r.day - 2, brokenCount: 0 }] };
      out.push(...givePraise(r, ctxOf(r, reg), ANN, 'You carry the squad on your word.') as Ev[]);
      r.day += 1;
      out.push(...praiseDayStep(r, ctxOf(r, reg)) as Ev[]);
      // a sentence set, and a slip that extends it
      registerFrameReader(() => 'play');
      const v = styled(withService(world(reg, 'play')), 'vindictive');
      v.content = { enabled: [...new Set([...(v.content?.enabled ?? []), 'jealousy_games', 'physical_discipline_shown'])] };
      v.commander.crimeId = 'liquidation';
      v.relations[ANN].flags = [...v.relations[ANN].flags, 'knows_crime'];
      out.push(...vindictiveDayStep(v, ctxOf(v, reg)) as Ev[]);
      v.day += 8;
      out.push(...vindictiveDayStep(v, ctxOf(v, reg)) as Ev[]);
      // and through the real day end
      let cur = world(reg, 'play');
      cur.commander.craft = { stillness: { xp: 160, level: 3, lastDay: cur.day - 40 } };
      for (let i = 0; i < 4; i++) { const n = run(cur, reg, { type: 'calendar/consume_slot', payload: {} }); out.push(...n.events); cur = n.state; }
      return out;
    });
    expect(w.craft).toEqual([]);
    const k = kinds(w.events);
    for (const t of ['craft_level', 'norm_set', 'praise_given', 'sentence_set']) expect(k.has(t), t).toBe(true);
  });

  it('the spy sees draws at all (the dispatcher draws elsewhere), so an empty answer above means something', () => {
    expect(total, 'draws recorded across the scenarios').toBeGreaterThan(10);
    expect(stacks.some((st) => /src\/engine\//.test(st))).toBe(true);
  });
});
