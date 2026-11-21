import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/warden';
import '../../../src/engine/actions/leash';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/combat';
import '../../../src/engine/actions/calendar';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import { blockCosignChance, leashBlockOf, rollBlock } from '../../../src/engine/dynamic/leashBlock';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { interceptEditor } from '../../../src/engine/personal/intercept';
import { leashLog } from '../../../src/engine/leash/weekly';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { wardenOf } from '../../../src/engine/warden';
import { fixtureCombat } from '../../helpers/combat';
import { seeded } from '../../helpers/personal';
import { campaign, ctxOf, errors, loadCore, ofType, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = () => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary: 'cold' as const }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});

/** Ann holds the device at `role` with `hold` and `favour`. */
function give(s: CampaignState, over: { hold?: number; favour?: number; domains?: string[] } = {}): CampaignState {
  unitOf(s, ANN).bond = practice();
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'role', hold: over.hold ?? 70, favour: over.favour ?? 0, domains: (over.domains ?? ['device']).map((id) => ({ id, since: 1 })) };
  return s;
}
const world = (over: Parameters<typeof give>[1] = {}): CampaignState => give(campaign(reg, 3), over);
const swap = (over: (s: CampaignState) => void = () => {}, seed = 9): CampaignState => {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed });
  if (!out.ok) throw new Error(out.errors.join('; '));
  give(out.state);
  over(out.state);
  return out.state;
};
/** A scene with `who` in it and an order of hers refused. */
function refused(s: CampaignState, who: string): CampaignState {
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [who], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  started.scene!.refusals = [{ unitId: who, exchange: 1 }];
  return started;
}
const compel = (s: CampaignState, who: string) => run(s, reg, { type: 'leash/compel', payload: { unitId: who } });
const types = (events: Array<{ type: string }>) => events.map((e) => e.type);

describe('leashBlockOf and the chance', () => {
  it('no block below owning or without leash_block: no draw', () => {
    // no domain that grants it
    const a = refused(world({ domains: ['private_time'] }), BEA);
    expect(leashBlockOf(a, reg)).toBeNull();
    const ra = compel(a, BEA);
    expect(errors(ra.events)).toEqual([]);
    expect(types(ra.events)).toContain('scene_compelled');
    expect(types(ra.events)).not.toContain('leash_blocked');
    // the domain stands but her hold has fallen below the band it needs
    const b = refused(world({ hold: 50 }), BEA);
    expect(leashBlockOf(b, reg)).toBeNull();
    expect(types(compel(b, BEA).events)).not.toContain('leash_blocked');
    // rollBlock itself draws nothing without a block
    const d = structuredClone(a);
    const ctx = ctxOf(d, reg);
    expect(rollBlock(d, ctx, BEA, 'compel')).toEqual({ ok: true, events: [] });
    expect(ctx.rng.state).toEqual(a.rng);
    // with the block, someone is named
    expect(leashBlockOf(world(), reg)).toBe(ANN);
    // and a dynamic that is off blocks nothing
    expect(leashBlockOf(campaign(reg, 3), reg)).toBeNull();
  });

  it('the chance is 0.2 + 0.3 x favour / 20, clamped 0 to 0.5', () => {
    expect(blockCosignChance(world({ favour: 0 }), reg, ANN)).toBeCloseTo(0.2);
    expect(blockCosignChance(world({ favour: 20 }), reg, ANN)).toBeCloseTo(0.5);
    expect(blockCosignChance(world({ favour: 10 }), reg, ANN)).toBeCloseTo(0.35);
    expect(blockCosignChance(world({ favour: -20 }), reg, ANN)).toBe(0);
  });
});

describe('the block on a Leash request', () => {
  it('a blocked compel is cancelled: logged denied with her id, leash_blocked emitted, the day goes to the oversight window', () => {
    const s = refused(world({ favour: -20 }), BEA); // chance 0: she never co-signs
    const left = s.leash.authorizationsLeft;
    const r = compel(s, BEA);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'leash_blocked')).toEqual([expect.objectContaining({ unitId: BEA, holderId: ANN, kind: 'compel' })]);
    expect(types(r.events)).not.toContain('scene_compelled');
    expect(r.state.leash.authorizationsLeft).toBe(left);
    expect(leashLog(r.state).at(-1)).toMatchObject({ unitId: BEA, kind: 'compel', outcome: 'denied', cc: ANN, context: 'scene' });
    expect(r.state.scene!.refusals).toHaveLength(1); // the refusal stands
    expect(r.state.dynamic!.oversight!.blocked).toEqual([s.day]);
    expect(r.state.relations[ANN].dynamic!.leashBlock).toMatchObject({ since: s.day, held: 1 });
  });

  it('a co-sign lets it run', () => {
    let signed = 0;
    let blocked = 0;
    for (let seed = 1; seed < 80 && (signed === 0 || blocked === 0); seed++) {
      const r = compel(seeded(refused(world({ favour: 20 }), BEA), seed), BEA); // chance 0.5
      if (types(r.events).includes('leash_blocked')) blocked++;
      else { signed++; expect(types(r.events)).toContain('scene_compelled'); }
    }
    expect(signed).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
  });

  it('a request on the holder herself is blocked too, with no draw', () => {
    const s = refused(world({ favour: 20 }), ANN);
    const r = compel(s, ANN);
    expect(ofType(r.events, 'leash_blocked')).toEqual([expect.objectContaining({ unitId: ANN, holderId: ANN })]);
    expect(r.state.rng).toEqual(s.rng);
    expect(leashLog(r.state).at(-1)).toMatchObject({ unitId: ANN, outcome: 'denied', cc: ANN });
  });

  it('the warden co-signs first: her denial stops before the block roll', () => {
    const s = refused(swap((x) => { wardenOf(x)!.satisfaction = 50; }), BEA); // Bea is the warden: a request against her is denied without a draw
    const r = compel(s, BEA);
    expect(types(r.events)).toContain('leash_cosign_denied');
    expect(types(r.events)).not.toContain('leash_blocked');
    expect(leashLog(r.state).at(-1)).toMatchObject({ outcome: 'denied', cc: 'warden' });
    expect(r.state.dynamic!.oversight?.blocked ?? []).toEqual([]);
    expect(r.state.relations[ANN].dynamic!.leashBlock).toBeUndefined();
    // when she does co-sign, the holder is asked next
    let both = false;
    for (let seed = 1; seed < 60 && !both; seed++) {
      const t = refused(swap((x) => { wardenOf(x)!.satisfaction = 100; x.relations[ANN].dynamic!.favour = -20; }, seed), CAT);
      const out = compel(t, CAT);
      both = types(out.events).includes('leash_cosigned') && types(out.events).includes('leash_blocked');
    }
    expect(both).toBe(true);
  });

  it('suppress and terminate are held too', () => {
    const s = world({ favour: -20 });
    s.disloyalty = { units: {}, open: { kind: 'desertion', unitId: BEA, at: 'day' } } as unknown as CampaignState['disloyalty'];
    const r = run(s, reg, { type: 'leash/suppress', payload: { unitId: BEA } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'leash_blocked')).toHaveLength(1);
    expect(leashLog(r.state).at(-1)).toMatchObject({ kind: 'suppress', outcome: 'denied', cc: ANN, context: 'desertion' });
  });

  it('a combat compel is held the same way and is not asked again', () => {
    const s = world({ favour: -20 });
    const cs = fixtureCombat({ squad: [{ cid: 's1', unitId: BEA }, { cid: 's2', unitId: CAT }], enemies: [{ cid: 'e1' }], cp: 3 });
    cs.phase = 'awaiting';
    cs.awaitingCid = 's2';
    cs.lastRefusal = { orderId: 'focus_fire', targetCid: 's1' };
    s.combat = cs;
    const r = run(s, reg, { type: 'combat/compel', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'leash_blocked')).toHaveLength(1);
    expect(r.state.combat!.lastRefusal).toMatchObject({ cosignDenied: true });
    expect(leashLog(r.state).at(-1)).toMatchObject({ outcome: 'denied', cc: ANN, context: 'combat' });
    expect(r.state.dynamic!.oversight!.blocked).toEqual([s.day]);
    expect(errors(run(r.state, reg, { type: 'combat/compel', payload: {} }).events)[0]).toMatchObject({ message: expect.stringMatching(/already denied/i) });
  });

  it('a request that cannot be filed throws before she is asked (no draw)', () => {
    const s = world();
    const r = compel(s, BEA); // no scene, no refusal
    expect(errors(r.events)).not.toEqual([]);
    expect(r.state).toBe(s);
  });

  it('the P9c intercept still runs: the editor of her device is unchanged by the block', () => {
    const s = world({ favour: -20 });
    s.relations[ANN].affinity = 90;
    const before = interceptEditor(s, reg, 'leash');
    s.dynamic!.oversight = { blocked: [s.day] };
    expect(interceptEditor(s, reg, 'leash')).toBe(before);
  });
});

describe('her directive', () => {
  it('dynamic:leash_block:<id> while she is in the room and the block stands; no number and no pronoun for the commander', () => {
    const s = world();
    const lines = dynamicDirectives(s, reg, [ANN]).filter((d) => d.id === `dynamic:leash_block:${ANN}`);
    expect(lines).toHaveLength(1);
    expect(lines[0].expiresAfter).toBe('scene');
    expect(lines[0].text).not.toMatch(/\d/);
    expect(lines[0].text).not.toMatch(/\b(he|him|his)\b/i);
    expect(dynamicDirectives(s, reg, [BEA]).some((d) => d.id.startsWith('dynamic:leash_block:'))).toBe(false); // she is not there
    expect(dynamicDirectives(world({ domains: ['private_time'] }), reg, [ANN]).some((d) => d.id.startsWith('dynamic:leash_block:'))).toBe(false); // no block
  });
});
