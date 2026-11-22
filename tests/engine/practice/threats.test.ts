import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/practice';
import { applyDynamicIntent } from '../../../src/engine/dynamic/intents';
import { isThreat, readMoments, regionOf, threatIn, threatNear } from '../../../src/engine/dynamic/reading';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { noteThreat } from '../../../src/engine/practice/threats';
import { applyPracticeIntent } from '../../../src/engine/practice/intents';
import { blankPractices } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const yielded = { type: 'moment_answered', unitId: ANN, responseType: 'yielded' };
const probe = { type: 'probe_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, response: 'yielded' } as unknown as EventIntent;
const fearOf = (s: CampaignState): number => dynamicOf(s, ANN)!.readOf.motive.fear;
const live = (): CampaignState => {
  const s = withService(world(reg, 'role'));
  dynamicOf(s, ANN)!.hold = 60;
  return s;
};
const scene = (s: CampaignState, id: string, exchanges: number): void => {
  s.scene = { id, day: s.day, slot: s.slot, locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges } as never;
};

const SOURCES: Array<[string, Record<string, unknown>]> = [
  ['punishment_issued', { type: 'punishment_issued', punishmentId: 'pp1', holderId: ANN, unitId: ANN, severity: 2, offence: 'task_broken' }],
  ['punishment_answered', { type: 'punishment_answered', punishmentId: 'pp1', holderId: ANN, unitId: ANN, answer: 'accept', severity: 2 }],
  ['slap_dealt', { type: 'slap_dealt', unitId: ANN, result: 'braced', public: false }],
  ['threat_voiced', { type: 'threat_voiced', unitId: ANN }],
  ['hold_started (punitive)', { type: 'hold_started', holderId: ANN, punitive: true }],
];

describe('the sources', () => {
  it('are threats: the five, a punitive hold only, and an answer that is a compromise or an order done is not', () => {
    for (const [name, e] of SOURCES) expect(isThreat(e as never), name).toBe(true);
    expect(isThreat({ type: 'hold_started', holderId: ANN } as never)).toBe(false);
    expect(isThreat({ type: 'hold_started', holderId: ANN, punitive: false } as never)).toBe(false);
    expect(isThreat({ type: 'punishment_answered', answer: 'compromise' } as never)).toBe(false);
    expect(isThreat({ type: 'punishment_answered', answer: 'do_it' } as never)).toBe(false);
    expect(isThreat({ type: 'commander_punished' } as never)).toBe(true); // P15's own two stay
    expect(isThreat({ type: 'commander_leashed' } as never)).toBe(true);
    expect(isThreat({ type: 'task_kept' } as never)).toBe(false);
    expect(threatIn([{ type: 'task_kept' }, SOURCES[3][1] as never])).toBe(true);
  });

  for (const [name, source] of SOURCES) {
    it(`a yield right after ${name} moves the fear weight (same batch, a moment answer and a probe answer; the next exchange through lastThreat)`, () => {
      const calm = live();
      readMoments(calm, { registries: reg }, [yielded]);
      expect(fearOf(calm)).toBe(0.2);
      const hit = live();
      readMoments(hit, { registries: reg }, [yielded, source as never]);
      expect(fearOf(hit)).toBeGreaterThan(0.2);
      // a probe answer in the batch that holds it
      const p = live();
      dynamicOf(p, ANN)!.probes.pending = { axis: 'space', tier: 1, day: p.day };
      applyDynamicIntent(p, { registries: reg }, ANN, probe, [source as never]);
      expect(fearOf(p)).toBeGreaterThan(0.2);
      // the next exchange of the same scene
      const next = live();
      scene(next, 's1', 3);
      noteThreat(next, ctxOf(next), [source as never]);
      expect(next.practices!.lastThreat).toMatchObject({ unitId: ANN, sceneId: 's1', exchange: 3, day: next.day });
      next.scene!.exchanges = 4;
      readMoments(next, { registries: reg }, [yielded]);
      expect(fearOf(next), name).toBeGreaterThan(0.2);
    });
  }

  it('a rerolled punishment card is no new threat: it does not refresh the window (N1)', () => {
    const s = live();
    scene(s, 's1', 3);
    noteThreat(s, ctxOf(s), [{ type: 'punishment_issued', punishmentId: 'pp1', holderId: ANN, unitId: ANN, severity: 2, offence: 'task_broken' }]);
    expect(s.practices!.lastThreat).toMatchObject({ exchange: 3 });
    s.scene!.exchanges = 6;
    noteThreat(s, ctxOf(s), [{ type: 'punishment_issued', punishmentId: 'pp1', holderId: ANN, unitId: ANN, severity: 2, offence: 'task_broken', rerolled: true }]);
    expect(s.practices!.lastThreat).toMatchObject({ exchange: 3 }); // still the first issue's exchange
    const fresh = live();
    scene(fresh, 's1', 6);
    noteThreat(fresh, ctxOf(fresh), [{ type: 'punishment_issued', punishmentId: 'pp1', holderId: ANN, unitId: ANN, severity: 2, offence: 'task_broken', rerolled: true }]);
    expect(fresh.practices?.lastThreat).toBeUndefined();
  });

  it('a non-punitive hold is no threat: nothing moves', () => {
    const s = live();
    readMoments(s, { registries: reg }, [yielded, { type: 'hold_started', holderId: ANN }]);
    expect(fearOf(s)).toBe(0.2);
    noteThreat(s, ctxOf(s), [{ type: 'hold_started', holderId: ANN }]);
    expect(s.practices?.lastThreat).toBeUndefined();
  });
});

describe('threatNear', () => {
  it('names this unit, this scene and this exchange or the next: a new scene, another woman, two exchanges later or another day do not count', () => {
    const s = live();
    scene(s, 's1', 3);
    s.practices = { ...blankPractices(), lastThreat: { unitId: ANN, sceneId: 's1', exchange: 3, day: s.day } };
    expect(threatNear(s, [], ANN)).toBe(true);
    s.scene!.exchanges = 4;
    expect(threatNear(s, [], ANN)).toBe(true);
    s.scene!.exchanges = 5;
    expect(threatNear(s, [], ANN)).toBe(false);
    s.scene!.exchanges = 3;
    expect(threatNear(s, [], BEA)).toBe(false);
    expect(threatNear(s, [SOURCES[3][1] as never], BEA)).toBe(true); // the same batch is a threat for whoever answers in it (as P15's)
    scene(s, 's2', 3); // a threat in another scene does not count
    expect(threatNear(s, [], ANN)).toBe(false);
  });

  it('in a DM (no scene) it is the same day', () => {
    const s = live();
    s.practices = { ...blankPractices(), lastThreat: { unitId: ANN, exchange: 0, day: s.day } };
    expect(threatNear(s, [], ANN)).toBe(true);
    s.day += 1;
    expect(threatNear(s, [], ANN)).toBe(false);
    const inScene = live();
    scene(inScene, 's1', 0);
    inScene.practices = { ...blankPractices(), lastThreat: { unitId: ANN, exchange: 0, day: inScene.day } }; // a DM threat is not a threat in a scene
    expect(threatNear(inScene, [], ANN)).toBe(false);
  });

  it('without a threat nothing is read differently (no practices, no events)', () => {
    const s = live();
    expect(threatNear(s, [], ANN)).toBe(false);
    expect(threatNear(s, [{ type: 'moment_answered' }], ANN)).toBe(false);
  });
});

describe('her threat in words', () => {
  const voiced = { type: 'threat_voiced', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she said she would', confidence: 1 } as unknown as EventIntent;

  it('threat_voiced emits the engine event and a history line, and is applied before the dynamic intents of its batch', () => {
    const d = live();
    const events = applyPracticeIntent(d, { registries: reg }, ANN, voiced);
    expect(ofType(events, 'threat_voiced')).toMatchObject([{ unitId: ANN }]);
    expect(d.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'threat_voiced' });
    // not for someone who does not hold
    const none = world(reg, 'equal');
    expect(applyPracticeIntent(none, { registries: reg }, ANN, voiced)).toEqual([]);
    expect(none.practices).toBeUndefined();
    // through intents/apply: a probe answer in the same batch reads the threat first (fear moves)
    const s = live();
    s.scene = { id: 's1', day: s.day, slot: s.slot, locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 1 } as never;
    dynamicOf(s, ANN)!.probes.pending = { axis: 'space', tier: 1, day: s.day };
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'probe_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, response: 'yielded' }, { type: 'threat_voiced', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1 }] } } });
    expect(r.events.some((e) => e.type === 'threat_voiced')).toBe(true);
    expect(fearOf(r.state)).toBeGreaterThan(0.2);
    expect(r.state.practices!.lastThreat).toMatchObject({ unitId: ANN, sceneId: 's1' });
  });

  it('a run of them reaches cowed: ten exchanges alternating a threat and a yielded answer', () => {
    const s = live();
    scene(s, 's1', 0);
    const out: unknown[] = [];
    for (let i = 1; i <= 10; i++) {
      s.scene!.exchanges = i;
      const said = applyPracticeIntent(s, { registries: reg }, ANN, voiced);
      noteThreat(s, ctxOf(s), said);
      out.push(...readMoments(s, { registries: reg }, [yielded, ...said]));
    }
    expect(dynamicOf(s, ANN)!.readOf.region).toBe('cowed');
    expect(regionOf(dynamicOf(s, ANN)!.readOf)).toBe('cowed');
    expect(out).toContainEqual(expect.objectContaining({ type: 'position_shifted', unitId: ANN, to: 'cowed' }));
    // without the threats the same ten yields do not
    const calm = live();
    for (let i = 0; i < 10; i++) readMoments(calm, { registries: reg }, [yielded]);
    expect(dynamicOf(calm, ANN)!.readOf.region).not.toBe('cowed');
  });
});
