import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import { impunityOf } from '../../src/engine/discipline/impunity';
import { milestonesDue, requiresMet } from '../../src/engine/dynamic/milestones';
import { probeChance } from '../../src/engine/dynamic/probes';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { DynamicMilestoneEntry, Frame, Inclination, MannerAxis, Practice, ProfileStyle } from '../../src/engine/dynamic/types';
import { fireMoment } from '../../src/engine/moments/fire';
import { liveSources } from '../../src/engine/moments/live';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const ZERO: Record<MannerAxis, number> = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const TESTING = (): number => Number(reg.holdBands.get('testing')!.min);

interface Over { style?: ProfileStyle; manner?: boolean; frame?: Frame; hold?: number; inclination?: Inclination; drawnBy?: Array<'pain' | 'power' | 'reaction' | 'discipline' | 'discovery'>; warmth?: number; scene?: boolean; dyn?: boolean }
function world(over: Over = {}): CampaignState {
  const s = campaign(reg, 3);
  const practice: Practice = {
    categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: over.style ?? 'regal' }, audience: 'indifferent', inclination: over.inclination ?? 'eager', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    ...(over.manner === false ? {} : { manner: { ...ZERO, warmth: over.warmth ?? 0 }, drawnBy: over.drawnBy ?? ['reaction'] }),
  };
  unitOf(s, ANN).bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.day = 40;
  s.slot = 'morning';
  if (over.dyn !== false) s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'equal', hold: over.hold ?? TESTING() };
  if (over.scene === false) return s;
  s.relations[ANN].stateId = 'confidant'; // a close relation: the blocking is live, so a moment may come up
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN, BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const due = (s: CampaignState) => milestonesDue(s, ctxOf(s, reg), ANN);
const open = (s: CampaignState) => s.dynamic!.open.milestones.filter((m) => m.unitId === ANN);
const row = (id: string) => reg.dynamicMilestones.get(id) as unknown as DynamicMilestoneEntry;

describe('the joke that stopped being a joke (spec 12.3)', () => {
  const joke = (): DynamicMilestoneEntry => [...reg.dynamicMilestones.values()].find((m) => (m as unknown as DynamicMilestoneEntry).requires.styles?.includes('regal') === true && m.from === 'equal') as unknown as DynamicMilestoneEntry;

  it('the row is equal to play, the band and the form of first_yes, regal only, and stands before first_yes in the registry', () => {
    const j = joke();
    const y = row('first_yes');
    expect(j).toBeDefined();
    expect([j.from, j.to, j.offer, j.requires.holdBand]).toEqual([y.from, y.to, y.offer, y.requires.holdBand]);
    expect(j.requires.styles).toEqual(['regal']);
    expect(j.effects).toEqual([{ type: 'frame' }]);
    const order = [...reg.dynamicMilestones.keys()];
    expect(order.indexOf(String(j.id))).toBeLessThan(order.indexOf('first_yes'));
    expect(String(j.text)).not.toContain('AUTHOR TO WRITE'); // the author's text, 2026-11-27
  });

  it('is chosen for a regal woman with a manner at testing, and first_yes for every other', () => {
    const regal = world();
    due(regal);
    expect(open(regal).map((m) => m.milestoneId)).toEqual([joke().id]);
    for (const style of ['cold', 'playful', 'drill'] as ProfileStyle[]) {
      const s = world({ style });
      due(s);
      expect(open(s).map((m) => m.milestoneId), style).toEqual(['first_yes']);
    }
  });

  it('a regal woman with no manner keeps the old graph (first_yes)', () => {
    const s = world({ manner: false });
    due(s);
    expect(open(s).map((m) => m.milestoneId)).toEqual(['first_yes']);
    expect(requiresMet(s, reg, ANN, joke())).toBe(false);
  });

  it('the style she has now decides: a turned style counts', () => {
    const s = world({ style: 'cold', scene: false });
    unitOf(s, ANN).development = { ...(unitOf(s, ANN).development ?? {}), practice: { primary: 'regal' } } as never;
    due(s);
    expect(open(s).map((m) => m.milestoneId)).toEqual([joke().id]);
  });

  it('accepting it moves her to play, like first_yes', () => {
    const s = world();
    due(s);
    const id = open(s)[0].id;
    const r = run(s, reg, { type: 'dynamic/answer_milestone', payload: { milestoneId: id, answer: 'accept' } });
    expect(errors(r.events)).toEqual([]);
    expect(dynamicOf(r.state, ANN)!.frame).toBe('play');
    expect(dynamicOf(r.state, ANN)!.milestones).toContain(joke().id);
  });

  it('a refused joke cools down, and first_yes opens while it does (once her hold is back at testing)', () => {
    const s = world();
    due(s);
    const id = open(s)[0].id;
    const r = run(s, reg, { type: 'dynamic/answer_milestone', payload: { milestoneId: id, answer: 'refuse' } });
    expect(errors(r.events)).toEqual([]);
    const after = r.state;
    expect(dynamicOf(after, ANN)!.cooldowns[String(joke().id)]).toBeGreaterThan(after.day);
    expect(open(after)).toEqual([]);
    dynamicOf(after, ANN)!.hold = TESTING() + 2; // back at testing
    due(after);
    expect(open(after).map((m) => m.milestoneId)).toEqual(['first_yes']);
  });
});

describe('the first time below her (spec 12.3, ruling 10)', () => {
  const live = (s: CampaignState) => liveSources(s, reg).some((x) => x.sourceId === 'first_below' && x.unitId === ANN);

  it('is an `external` moment source open to every close relation, with three options', () => {
    const src = reg.momentSources.get('first_below')! as unknown as { scope: string; live: string[]; frame: Array<{ type: string; generic: string }> };
    expect(src.scope).toBe('any');
    expect(src.live).toEqual(['external']);
    expect(src.frame.map((o) => o.generic)).toEqual(['stay a moment', 'thank her and rise', 'tease her about it']);
  });

  it('is live for a woman a probe row would match, with a manner, at testing, in a scene with her', () => {
    expect(live(world())).toBe(true);
    expect(live(world({ style: 'ritual' }))).toBe(true); // deference matches ritual
    expect(live(world({ style: 'cold', drawnBy: ['power'], warmth: -1 }))).toBe(true); // admiration: power, not warm
  });

  it('is not live out of its condition: no manner, no matching row, another band, past the equal frame, once it was done', () => {
    expect(live(world({ manner: false }))).toBe(false);
    expect(live(world({ style: 'cold' }))).toBe(false);
    expect(live(world({ hold: TESTING() - 1 }))).toBe(false); // interest
    expect(live(world({ hold: Number(reg.holdBands.get('testing')!.max) + 1 }))).toBe(false); // keeping
    expect(live(world({ frame: 'play' }))).toBe(false);
    expect(live(world({ dyn: false }))).toBe(false);
    const done = world();
    dynamicOf(done, ANN)!.firstBelow = true;
    expect(live(done)).toBe(false);
    const away = world();
    away.scene!.participants = [BEA];
    expect(live(away)).toBe(false);
  });

  it('is written once per pair when the moment fires, and then it is never live again', () => {
    let s = world();
    expect(dynamicOf(s, ANN)!.firstBelow).toBeUndefined();
    let fired = false;
    for (let i = 0; i < 80 && !fired; i++) {
      const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {} } });
      expect(errors(r.events)).toEqual([]);
      s = r.state;
      fired = r.events.some((e) => e.type === 'moment_fired' && e.sourceId === 'first_below');
      if (s.scene?.moments?.open !== undefined && !fired) { // another source came first: let it lapse and go on
        delete s.scene.moments.open;
        s.scene.moments.fired = [];
      }
    }
    expect(fired).toBe(true);
    expect(dynamicOf(s, ANN)!.firstBelow).toBe(true);
    expect(live(s)).toBe(false);
  });

  it('fireMoment alone writes nothing: the flag is the after-action\'s, from the moment_fired event', () => {
    const s = world();
    fireMoment(s, ctxOf(s, reg), 'first_below', ANN);
    expect(dynamicOf(s, ANN)!.firstBelow).toBeUndefined();
  });
});

describe('being admired wakes a latent woman (spec 12.3)', () => {
  const praise = (s: CampaignState, times = 1): CampaignState => {
    let state = s;
    for (let i = 0; i < times; i++) {
      const r = run(state, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'praised', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'said so', confidence: 1 }] } } });
      expect(errors(r.events)).toEqual([]);
      state = r.state;
    }
    return state;
  };
  /** Latent, with an Impunity of 30: below `impunityRoute`, so only being admired can wake her. */
  const latent = (over: Over = {}): CampaignState => {
    const s = world({ inclination: 'latent', dyn: false, ...over });
    s.relations[ANN].impunityRecord = 0;
    s.relations[ANN].impunityRecord = 30 - impunityOf(s, reg, ANN)!.value;
    expect(impunityOf(s, reg, ANN)!.value).toBe(30);
    return s;
  };

  it('a latent woman has no chance to probe until something wakes her', () => {
    expect(probeChance(latent(), reg, ANN)).toBe(0);
  });

  it('three praises of the commander in 14 days wake a regal woman; two do not', () => {
    expect(probeChance(praise(latent(), 2), reg, ANN)).toBe(0);
    expect(probeChance(praise(latent(), 3), reg, ANN)).toBeGreaterThan(0);
  });

  it('they must be within 14 days: the old ones fall away', () => {
    let s = praise(latent(), 2);
    s.day += 14;
    s = praise(s, 1);
    expect(probeChance(s, reg, ANN)).toBe(0);
    s.day += 3;
    s = praise(s, 2);
    expect(probeChance(s, reg, ANN)).toBeGreaterThan(0);
  });

  it('a woman drawn by power who is not warm is woken the same way', () => {
    expect(probeChance(praise(latent({ style: 'cold', drawnBy: ['power'], warmth: -1 }), 3), reg, ANN)).toBeGreaterThan(0);
  });

  it('a woman the admiration row does not match is never woken this way: another style, a warm one drawn by power, one with no manner', () => {
    expect(probeChance(praise(latent({ style: 'cold' }), 5), reg, ANN)).toBe(0);
    expect(probeChance(praise(latent({ style: 'cold', drawnBy: ['power'], warmth: 2 }), 5), reg, ANN)).toBe(0);
    expect(probeChance(praise(latent({ manner: false }), 5), reg, ANN)).toBe(0);
  });

  it('a praise that is not the commander\'s, or another kind of event, does not count; and nothing is written for a woman with no manner', () => {
    const none = praise(latent({ manner: false }), 3);
    expect(none.dynamic!.noted?.praised).toBeUndefined();
    const s = latent();
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'comforted', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1 }] } } });
    expect(r.state.dynamic!.noted?.praised).toBeUndefined();
  });

  it('what is kept is only the days of the last 14, never more than a few', () => {
    const s = praise(latent(), 3);
    expect(s.dynamic!.noted!.praised![ANN]).toEqual([s.day, s.day, s.day]);
    const more = praise(s, 6);
    expect(more.dynamic!.noted!.praised![ANN].length).toBeLessThanOrEqual(5);
  });
});
