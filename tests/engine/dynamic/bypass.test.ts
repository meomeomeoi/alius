import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/leash';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/calendar';
import { bypassAllies, bypassChance, bypassRoutes } from '../../../src/engine/dynamic/bypass';
import { leashBlockOf } from '../../../src/engine/dynamic/leashBlock';
import { regardStart } from '../../../src/engine/dynamic/regard';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { leashLog } from '../../../src/engine/leash/weekly';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { seeded } from '../../helpers/personal';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = () => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary: 'cold' as const }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});

/** Ann holds the device (favour -20: she never co-signs); Bea is the one a request is filed on; Cat trusts the commander and Dee has the know-how. */
function world(): CampaignState {
  const s = campaign(reg, 4);
  unitOf(s, ANN).bond = practice();
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'role', hold: 70, favour: -20, domains: [{ id: 'device', since: 1 }] };
  s.relations[CAT].trust = 60;
  s.relations[BEA].trust = 10;
  // a soldier who knows the device and trusts the commander
  s.relations['unit_dee'].trust = 60;
  unitOf(s, 'unit_dee').roleId = 'specialist';
  s.disloyalty = { units: {}, open: { kind: 'desertion', unitId: BEA, at: 'day' } } as unknown as CampaignState['disloyalty'];
  return s;
}
const bypass = (s: CampaignState, p: Record<string, unknown>) => run(s, reg, { type: 'dynamic/bypass_leash', payload: { kind: 'suppress', unitId: BEA, ...p } });
const discoveredOf = (events: Array<{ type: string; [k: string]: unknown }>) => ofType(events, 'leash_bypassed')[0]?.discovered === true;

describe('the comms terminal', () => {
  it('costs the slot and files the request with no block', () => {
    const s = world();
    const plain = run(s, reg, { type: 'leash/suppress', payload: { unitId: BEA } });
    expect(ofType(plain.events, 'leash_blocked')).toHaveLength(1); // held without a bypass
    const r = bypass(s, { route: 'comms' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'leash_blocked')).toEqual([]);
    expect(ofType(r.events, 'leash_bypassed')).toEqual([expect.objectContaining({ unitId: ANN, route: 'comms', targetId: BEA, kind: 'suppress' })]);
    expect(leashLog(r.state).at(-1)).toMatchObject({ unitId: BEA, kind: 'suppress', outcome: 'done' });
    expect(r.state.leash.authorizationsLeft).toBe(s.leash.authorizationsLeft - 1);
    expect(r.state.slot).not.toBe(s.slot); // the slot is spent
    expect(r.state.dynamic!.oversight?.pass).toBeUndefined(); // the pass was for this one request
    expect(ofType(r.events, 'rumors_requested')).toEqual([]); // nothing was scouted
    // the next request is held again
    r.state.disloyalty = s.disloyalty;
    expect(ofType(run(r.state, reg, { type: 'leash/suppress', payload: { unitId: BEA } }).events, 'leash_blocked')).toHaveLength(1);
  });

  it('is refused with a scene open and without a block (nothing changes)', () => {
    const s = world();
    const inScene = run(s, reg, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [CAT], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    const a = bypass(inScene, { route: 'comms' });
    expect(errors(a.events)[0]).toMatchObject({ message: expect.stringMatching(/leave the scene/i) });
    expect(a.state).toBe(inScene);
    const free = world();
    dynamicOf(free, ANN)!.domains = [];
    expect(errors(bypass(free, { route: 'comms' }).events)[0]).toMatchObject({ message: expect.stringMatching(/file it as usual/i) });
  });

  it('the comms route is refused while a decision waits (it spends a slot), the ally route is not (M3)', () => {
    const s = world();
    s.dilemmas = { ...(s.dilemmas ?? {}), open: { id: 'dl1', status: 'presented', options: [] } } as unknown as CampaignState['dilemmas'];
    const a = bypass(s, { route: 'comms' });
    expect(errors(a.events)[0]).toMatchObject({ message: expect.stringMatching(/decision is waiting/i) });
    expect(a.state.slot).toBe(s.slot);
    expect(errors(bypass(s, { route: 'ally', allyId: CAT }).events)).toEqual([]);
  });

  it('discovery is 0.3 (over 400 tries, 0.25 to 0.35)', () => {
    expect(bypassChance(world(), reg, 'comms')).toBe(0.3);
    let found = 0;
    for (let seed = 1; seed <= 400; seed++) if (discoveredOf(bypass(seeded(world(), seed), { route: 'comms' }).events)) found++;
    expect(found / 400).toBeGreaterThan(0.25);
    expect(found / 400).toBeLessThan(0.35);
  });
});

describe('the reset', () => {
  it('needs a technically able ally', () => {
    const s = world();
    expect(errors(bypass(s, { route: 'reset' }).events)[0]).toMatchObject({ message: expect.stringMatching(/ally who knows the device/i) });
    expect(errors(bypass(s, { route: 'reset', allyId: CAT }).events)[0]).toMatchObject({ message: expect.stringMatching(/cannot work on the device/i) }); // Cat trusts but has no know-how
    const ok = bypass(s, { route: 'reset', allyId: 'unit_dee' });
    expect(errors(ok.events)).toEqual([]);
    expect(ofType(ok.events, 'leash_bypassed')[0]).toMatchObject({ route: 'reset', allyId: 'unit_dee' });
    // and a soldier who does not trust the commander enough will not do it, tech or not
    s.relations['unit_dee'].trust = 20;
    expect(errors(bypass(s, { route: 'reset', allyId: 'unit_dee' }).events)).not.toEqual([]);
  });

  it('is found out 0.1 of the time with the ally\'s tech (over 400 tries)', () => {
    expect(bypassChance(world(), reg, 'reset', 'unit_dee')).toBe(0.1);
    let found = 0;
    for (let seed = 1; seed <= 400; seed++) if (discoveredOf(bypass(seeded(world(), seed), { route: 'reset', allyId: 'unit_dee' }).events)) found++;
    expect(found / 400).toBeGreaterThan(0.06);
    expect(found / 400).toBeLessThan(0.14);
  });
});

describe('the ally', () => {
  it('discovered: the ally\'s Trust falls by 5; not discovered: nothing', () => {
    let hit = false;
    let clean = false;
    for (let seed = 1; seed < 80 && !(hit && clean); seed++) {
      const s = seeded(world(), seed);
      const r = bypass(s, { route: 'ally', allyId: CAT });
      expect(errors(r.events)).toEqual([]);
      if (discoveredOf(r.events)) { hit = true; expect(r.state.relations[CAT].trust).toBe(s.relations[CAT].trust + TUNING.dynamic.bypass.allyTrust); }
      else { clean = true; expect(r.state.relations[CAT].trust).toBe(s.relations[CAT].trust); }
    }
    expect(hit && clean).toBe(true);
  });

  it('0.4 times the holder\'s insight multiplier; the ally is listed from Trust 50, never the holder', () => {
    const s = world();
    expect(bypassChance(s, reg, 'ally', CAT)).toBeCloseTo(0.4);
    unitOf(s, ANN).insight = 'high';
    expect(bypassChance(s, reg, 'ally', CAT)).toBeCloseTo(0.4 * TUNING.squadKnowledge.insight.high);
    unitOf(s, ANN).insight = 'low';
    expect(bypassChance(s, reg, 'ally', CAT)).toBeCloseTo(0.4 * TUNING.squadKnowledge.insight.low);
    s.relations[ANN].trust = 90;
    expect(bypassAllies(s, reg)).toEqual([CAT, 'unit_dee']);
    expect(bypassAllies(s, reg, { tech: true })).toEqual(['unit_dee']);
    expect(errors(bypass(s, { route: 'ally', allyId: BEA }).events)).not.toEqual([]); // Bea does not trust enough
    expect(errors(bypass(s, { route: 'ally', allyId: ANN }).events)).not.toEqual([]); // not the holder
    expect(errors(bypass(s, { route: 'ally' }).events)).not.toEqual([]);
  });
});

describe('a discovered bypass', () => {
  it('is an overrode_her (major) on the holder, costs her hold and is remembered by her', () => {
    let s: CampaignState | undefined;
    let r: ReturnType<typeof bypass> | undefined;
    for (let seed = 1; seed < 80 && r === undefined; seed++) {
      s = seeded(world(), seed);
      const t = bypass(s, { route: 'comms' });
      if (discoveredOf(t.events)) r = t;
    }
    expect(r).toBeDefined();
    const hist = r!.state.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'overrode_her');
    expect(hist.at(-1)).toMatchObject({ severity: 'major' });
    expect(dynamicOf(r!.state, ANN)!.hold).toBeLessThan(70);
    expect(ofType(r!.events, 'regard_changed')[0]).toMatchObject({ unitId: ANN, cause: 'bypass' }); // Regard −2 (Task 36)
    expect(r!.state.relations[ANN].regard!).toBeLessThan(regardStart(s!, reg, ANN));
    const fact = r!.state.memory.facts.find((f) => f.tags.includes('leash_bypass'));
    expect(fact).toMatchObject({ about: [ANN], knownBy: [ANN], importance: 4 });
    expect(fact!.text).not.toMatch(/\b(he|him|his)\b/i);
    // an undiscovered one writes nothing about her
    for (let seed = 1; seed < 80; seed++) {
      const t = bypass(seeded(world(), seed), { route: 'comms' });
      if (!discoveredOf(t.events)) { expect(t.state.memory.facts.some((f) => f.tags.includes('leash_bypass'))).toBe(false); break; }
    }
  });
});

describe('bypassRoutes', () => {
  it('reads the routes from state: the reasons are fixed phrases', () => {
    const s = world();
    expect(leashBlockOf(s, reg)).toBe(ANN);
    const r = bypassRoutes(s, reg);
    expect(r.comms).toEqual({});
    expect(r.reset.allies).toEqual(['unit_dee']);
    expect(r.ally.allies).toEqual([CAT, 'unit_dee']);
    s.relations[CAT].trust = 0;
    s.relations['unit_dee'].trust = 0;
    expect(bypassRoutes(s, reg)).toMatchObject({ reset: { disabled: 'NO ONE WHO KNOWS THE DEVICE' }, ally: { disabled: expect.any(String) } });
  });
});
