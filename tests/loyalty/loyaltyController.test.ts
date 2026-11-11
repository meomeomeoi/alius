import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { seedRng } from '../../src/engine/rng';
import { ContextBuilder } from '../../src/llm/context';
import { createLoyalty } from '../../src/loyalty/loyaltyController';
import type { LoyaltyDeps } from '../../src/loyalty/deps';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
let base: CampaignState;
const ANN = 'unit_ann';
const BEA = 'unit_bea';
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4, { crimeId: 'purge' });
  for (const u of base.squad) {
    u.defects = [{ id: 'echo_bleed' }];
    setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady', stateSince: 1 });
  }
  base.leash.authorizationsLeft = 3;
});

interface Rig { h: WorldHarness; ctx: ContextBuilder; refresh: ReturnType<typeof vi.fn>; loyalty: ReturnType<typeof createLoyalty> }
const dirs = (r: Rig) => (r.ctx.build(r.h.state(), 5000).directives);

function rig(tweak: (s: CampaignState) => void = () => {}, scene: string[] | null = [ANN, BEA]): Rig {
  const s = structuredClone(base);
  tweak(s);
  const h = worldHarness(reg, s);
  if (scene) {
    const r = h.app().dispatch({ type: 'scene/start', payload: { locationId: 'mess_hall', participants: scene, origin: 'event', startIndex: 0 } });
    expect(r.some((e) => e.type === 'error')).toBe(false);
  }
  const ctx = new ContextBuilder();
  const refresh = vi.fn();
  const deps: LoyaltyDeps = { ...h.deps, context: ctx, refreshContext: refresh };
  return { h, ctx, refresh, loyalty: createLoyalty(deps) };
}
/** Orders ANN until the engine's seeded roll refuses (she is `breaking`, 35 %). */
function refuse(r: Rig): void {
  for (let seed = 1; seed <= 100; seed++) {
    r.h.setState((s) => { s.rng = seedRng(seed); delete s.scene!.refusals; });
    if (r.loyalty.order(ANN)) return;
  }
  throw new Error('no seed refuses');
}

describe('orders in a scene', () => {
  it('a steady unit complies: no directive', () => {
    const r = rig();
    expect(r.loyalty.order(ANN)).toBe(false);
    expect(dirs(r)).not.toContain('REFUSES');
  });

  it('a refused order sets the refusal directive for the scene and a compel replaces it for the next reply', () => {
    const r = rig((s) => setRelation(s, ANN, { band: 'breaking', trust: 5 }));
    refuse(r);
    expect(dirs(r)).toContain("Ann REFUSES the commander's order this scene. Reason: she no longer trusts him.");
    expect(r.refresh).toHaveBeenCalled();
    expect(r.loyalty.compel(ANN)).toBe(true);
    expect(dirs(r)).toContain('Ann has just been COMPELLED through the Leash');
    expect(dirs(r)).not.toContain('REFUSES');
    // the next reply consumes it
    r.ctx.onReplyReceived();
    expect(dirs(r)).not.toContain('COMPELLED');
    expect(r.h.state().leash.authorizationsLeft).toBe(2);
  });

  it('a failed compel says so', () => {
    const r2 = { ...reg } as Registries;
    r2.defects = new Map(reg.defects);
    r2.defects.set('echo_bleed', { ...reg.defects.get('echo_bleed')!, leash: { costMult: 1, failChance: 1 } });
    const s = structuredClone(base);
    setRelation(s, ANN, { band: 'breaking', trust: 5 });
    const h = worldHarness(r2, s);
    h.app().dispatch({ type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } });
    const ctx = new ContextBuilder();
    const rg: Rig = { h, ctx, refresh: vi.fn(), loyalty: createLoyalty({ ...h.deps, registries: () => r2, context: ctx, refreshContext: vi.fn() }) };
    refuse(rg);
    expect(rg.loyalty.compel(ANN)).toBe(false);
    expect(dirs(rg)).toContain('The Leash burst FAILED on Ann: she felt it, shook it off, and still refuses.');
  });

  it('the refusal reason names the strongest source: band, state friction or defect', () => {
    const reasonOf = (tweak: (s: CampaignState) => void): string => {
      const r = rig((s) => { tweak(s); }, [ANN, BEA]);
      refuse(r);
      return /Reason: ([^.]+)\./.exec(dirs(r))![1];
    };
    expect(reasonOf((s) => setRelation(s, ANN, { band: 'wavering', trust: 20 }))).toBe('she openly doubts his authority');
    expect(reasonOf((s) => setRelation(s, ANN, { band: 'breaking', trust: 5 }))).toBe('she no longer trusts him');
    expect(reasonOf((s) => setRelation(s, ANN, { band: 'wavering', trust: 20, stateId: 'resentful' }))).toBe('she resents him'); // a tie goes to the state's friction
    expect(reasonOf((s) => setRelation(s, ANN, { band: 'steady', trust: 50, stateId: 'estranged' }))).toBe('she wants nothing from him');
    expect(reasonOf((s) => setRelation(s, ANN, { band: 'steady', trust: 50, stateId: 'despises' }))).toBe('she despises him');
    expect(reasonOf((s) => { s.squad[0].defects = [{ id: 'imprint_fracture' }]; })).toBe('her defect resists orders');
  });

  it('a compel with no authorization toasts the reason and returns false', () => {
    const r = rig((s) => { setRelation(s, ANN, { band: 'breaking', trust: 5 }); s.leash.authorizationsLeft = 0; });
    refuse(r);
    expect(r.loyalty.compel(ANN)).toBe(false);
    expect(r.h.toasts).toMatchObject([{ kind: 'error', text: expect.stringContaining('authorization') }]);
    expect(dirs(r)).toContain('REFUSES'); // still refusing
  });

  it('an order to someone outside the scene is refused by the engine without a directive', () => {
    const r = rig();
    expect(r.loyalty.order('unit_cat')).toBe(false);
    expect(r.h.toasts).toHaveLength(1);
  });
});

describe('scene directives', () => {
  it('opening a scene with a wavering, recently leashed unit sets both directives', () => {
    const r = rig((s) => {
      setRelation(s, ANN, { band: 'wavering', trust: 20 });
      s.relations[ANN].flags.push('leashed');
      s.leash.log.push({ no: 1, unitId: ANN, kind: 'compel', day: s.day, context: 'scene', outcome: 'done' });
    });
    r.loyalty.onSceneOpened();
    const d = dirs(r);
    expect(d).toContain('Ann openly doubts the commander in this scene; she questions his decisions aloud.');
    expect(d).toContain('Ann remembers being forced through the Leash; she will not pretend otherwise.');
    expect(d).not.toContain('Bea');
    expect(r.refresh).toHaveBeenCalled();
  });

  it('a breaking unit gets the breaking text', () => {
    const r = rig((s) => setRelation(s, BEA, { band: 'breaking', trust: 5 }));
    r.loyalty.onSceneOpened();
    expect(dirs(r)).toContain('Bea is close to leaving the unit');
  });

  it('a leash use older than 7 days sets no trauma directive, a leashed flag without a log entry neither', () => {
    const old = rig((s) => {
      s.day = 20;
      s.relations[ANN].flags.push('leashed');
      s.leash.log.push({ no: 1, unitId: ANN, kind: 'compel', day: 12, context: 'scene', outcome: 'done' });
    });
    old.loyalty.onSceneOpened();
    expect(dirs(old)).not.toContain('forced through the Leash');
    const edge = rig((s) => {
      s.day = 20;
      s.relations[ANN].flags.push('leashed');
      s.leash.log.push({ no: 1, unitId: ANN, kind: 'compel', day: 13, context: 'scene', outcome: 'done' });
    });
    edge.loyalty.onSceneOpened();
    expect(dirs(edge)).toContain('forced through the Leash');
    const flagOnly = rig((s) => { s.relations[ANN].flags.push('leashed'); });
    flagOnly.loyalty.onSceneOpened();
    expect(dirs(flagOnly)).not.toContain('forced through the Leash');
    const logOnly = rig((s) => { s.leash.log.push({ no: 1, unitId: ANN, kind: 'compel', day: s.day, context: 'scene', outcome: 'done' }); });
    logOnly.loyalty.onSceneOpened();
    expect(dirs(logOnly)).not.toContain('forced through the Leash');
  });

  it('closing the scene clears them', () => {
    const r = rig((s) => {
      setRelation(s, ANN, { band: 'breaking', trust: 5 });
      s.relations[ANN].flags.push('leashed');
      s.leash.log.push({ no: 1, unitId: ANN, kind: 'compel', day: s.day, context: 'scene', outcome: 'done' });
    });
    r.loyalty.onSceneOpened();
    refuse(r);
    r.ctx.setDirective({ id: 'night', text: 'NIGHT FRAMING', expiresAfter: 'scene' });
    r.ctx.setDirective({ id: 'proposal:unit_bea', text: 'KEEP ME', expiresAfter: 'scene' });
    r.ctx.setDirective({ id: 'dilemma', text: 'AFTERMATH', expiresAfter: 'scene' });
    expect(dirs(r)).toContain('close to leaving');
    r.loyalty.onSceneClosed();
    const d = dirs(r);
    for (const gone of ['close to leaving', 'REFUSES', 'forced through the Leash', 'AFTERMATH']) expect(d).not.toContain(gone);
    expect(d).toContain('NIGHT FRAMING'); // other layers' directives are untouched
    expect(d).toContain('KEEP ME');
  });
});

describe('dilemma aftermath', () => {
  const resolved = (extra: Record<string, unknown> = {}): EngineEvent[] => [
    { type: 'dilemma_resolved', id: 'dl1', templateId: 'dil_rations', option: 0, label: 'Cut portions', title: 'Short rations', affected: [], ...extra },
  ];

  it('a resolved dilemma sets the aftermath directive for the next reply when no scene is open', () => {
    const r = rig(() => {}, null);
    r.loyalty.onEvents(resolved());
    expect(dirs(r)).toContain('The commander has just decided "Short rations": Cut portions. Narrate the immediate aftermath');
    r.ctx.onReplyReceived();
    expect(dirs(r)).not.toContain('Narrate the immediate aftermath');
    expect(r.refresh).toHaveBeenCalled();
  });

  it('with a scene open it lasts the scene', () => {
    const r = rig();
    r.loyalty.onEvents(resolved());
    r.ctx.onReplyReceived();
    expect(dirs(r)).toContain('Narrate the immediate aftermath');
    r.loyalty.onSceneClosed();
    expect(dirs(r)).not.toContain('Narrate the immediate aftermath');
  });

  it('a dilemma with nothing to decide and unrelated events set nothing', () => {
    const r = rig(() => {}, null);
    r.loyalty.onEvents([{ type: 'dilemma_resolved', id: 'dl1', templateId: 'x', nothing: true }, { type: 'leash_changed', amount: -1, left: 2 }]);
    expect(dirs(r)).toBe('');
    expect(r.refresh).not.toHaveBeenCalled();
  });
});
