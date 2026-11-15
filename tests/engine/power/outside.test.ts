import { beforeAll, describe, expect, it } from 'vitest';
import { missingDescriptions } from '../../../src/analysis/describe';
import { OutsideFeatSchema } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import { defaultFormation } from '../../../src/engine/combat';
import { finalizeCombat } from '../../../src/engine/combat/outcome';
import { compel } from '../../../src/engine/leash/use';
import { noteFeat, OUTSIDE_TRIGGERS, outsideActive, outsideSuppressedFor, negotiationHolds } from '../../../src/engine/power/outside';
import { computeHierarchy, standingOf } from '../../../src/engine/power/standing';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore, ofType, run, setRelation, errors } from '../../helpers/loyalty';
import { depart, withMission } from '../../helpers/expedition';
import { withBond } from '../../helpers/bonds';
import { ctxOf, stubExpedition } from '../../helpers/world';
import { withLeader } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

const led = (opts: { endorsed?: boolean } = {}): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 20;
  for (const u of s.squad) u.values = { ...ZERO };
  return withLeader(s, ANN, opts);
};

describe('the outsideFeats registry', () => {
  it('loads three feats with descriptions; an unknown trigger is a load error', () => {
    expect([...reg.outsideFeats.values()].map((f) => f.trigger).sort()).toEqual([...OUTSIDE_TRIGGERS].sort());
    expect(missingDescriptions(reg)).toEqual([]);
    const feat = structuredClone(reg.outsideFeats.get('crisis_cover')) as Record<string, unknown>;
    expect(OutsideFeatSchema.safeParse(feat).success).toBe(true);
    expect(OutsideFeatSchema.safeParse({ ...feat, trigger: 'dance' }).success).toBe(false);
    expect(OutsideFeatSchema.safeParse({ ...feat, label: 'x'.repeat(41) }).success).toBe(false);
  });
});

describe('outside perception', () => {
  it('is active with a leader and no feat', () => {
    const s = led();
    expect(outsideActive(s)).toBe(true);
    expect(outsideSuppressedFor(s)).toBe(0);
    expect(outsideActive(campaign(reg, 4))).toBe(false);
  });

  it('each trigger suppresses it for 14 days', () => {
    for (const trigger of OUTSIDE_TRIGGERS) {
      const s = led();
      const events = noteFeat(s, reg, trigger);
      expect(events).toEqual([{ type: 'outside_feat', featId: trigger }]);
      expect(s.power!.hierarchy!.outsideSuppressedUntil).toBe(34);
      expect(outsideActive(s), trigger).toBe(false);
      expect(outsideSuppressedFor(s)).toBe(14);
      s.day = 33;
      expect(outsideActive(s)).toBe(false);
      s.day = 34;
      expect(outsideActive(s)).toBe(true);
    }
  });

  it('a feat noted with no leader still suppresses a leader appointed later', () => {
    const s = campaign(reg, 4);
    s.day = 20;
    for (const u of s.squad) {
      u.values = { ...ZERO };
      setRelation(s, u.id, { trust: 50 });
      withBond(s, u.id, { leadStyle: u.id === ANN ? 'dominant' : 'balanced' });
    }
    expect(noteFeat(s, reg, 'negotiation')).toHaveLength(1);
    s.power!.merit = [{ day: s.day, unitId: ANN, points: 5 }]; // she has fought: leadership is earned
    const a = standingOf(s, reg, ANN)!;
    const b = standingOf(s, reg, BEA)!;
    s.power!.hierarchy!.standingBonus = { unitId: BEA, amount: a - b - 10, untilDay: 40 };
    computeHierarchy(s, reg);
    expect(s.power!.hierarchy!.leaderId).toBe(ANN);
    expect(outsideActive(s)).toBe(false);
    expect(outsideSuppressedFor(s)).toBe(14);
  });

  it('endorsed: active and never suppressed', () => {
    const s = led({ endorsed: true });
    noteFeat(s, reg, 'crisis_cover');
    expect(outsideActive(s)).toBe(true);
    expect(outsideSuppressedFor(s)).toBe(0);
  });

  it('a Leash log entry written while it is active carries cc', () => {
    const ctx = (s: CampaignState) => ctxOf(s, reg);
    const s = led();
    s.leash.authorizationsLeft = 3;
    compel(s, ctx(s), { unitId: BEA, context: 'pda', roll: false });
    expect(s.leash.log.at(-1) as { cc?: string }).toMatchObject({ unitId: BEA, cc: ANN });
    const quiet = led();
    quiet.leash.authorizationsLeft = 3;
    noteFeat(quiet, reg, 'crisis_cover');
    compel(quiet, ctx(quiet), { unitId: BEA, context: 'pda', roll: false });
    expect((quiet.leash.log.at(-1) as { cc?: string }).cc).toBeUndefined();
    const none = campaign(reg, 4);
    none.leash.authorizationsLeft = 3;
    compel(none, ctx(none), { unitId: BEA, context: 'pda', roll: false });
    expect((none.leash.log.at(-1) as { cc?: string }).cc).toBeUndefined();
  });
});

describe('the three feats', () => {
  it('crisis_cover: a won fight that exposed the commander, covered and not downed', () => {
    const fight = (cover: boolean, mutate: (s: CampaignState) => void = () => {}, outcome: 'won' | 'lost' = 'won') => {
      const s0 = campaign(reg, 4);
      s0.day = 20;
      const open = run(s0, reg, {
        type: 'combat/start',
        payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1, exposesCommander: true }, formation: defaultFormation(s0, reg, s0.roster.activeIds), ...(cover ? { coverId: ANN } : {}) },
      }).state;
      const draft = structuredClone(open);
      mutate(draft);
      const events = finalizeCombat(draft, reg, new Rng(seedRng(2)), outcome);
      return { draft, events };
    };
    const won = fight(true);
    expect(ofType(won.events, 'commander_held')).toEqual([{ type: 'commander_held' }]);
    expect(ofType(won.events, 'outside_feat')).toEqual([{ type: 'outside_feat', featId: 'crisis_cover' }]);
    expect(won.draft.power!.hierarchy!.outsideSuppressedUntil).toBe(34);
    expect(ofType(fight(true, (s) => { s.combat!.commander!.downed = true; }).events, 'outside_feat')).toEqual([]);
    expect(ofType(fight(true, () => {}, 'lost').events, 'outside_feat')).toEqual([]);
    const plain = run(campaign(reg, 4), reg, { type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: defaultFormation(campaign(reg, 4), reg, campaign(reg, 4).roster.activeIds) } }).state;
    const d = structuredClone(plain);
    expect(ofType(finalizeCombat(d, reg, new Rng(seedRng(2)), 'won'), 'outside_feat')).toEqual([]);
  });

  it('ordered_mission: a command mission secured after at least one combat order', () => {
    const attempt = (source: 'command' | 'side', orders: number | undefined) => {
      const { state, mission } = withMission(reg, campaign(reg, 4), { templateId: source === 'command' ? 'tpl_recover' : 'tpl_scavenge', source });
      const s = structuredClone(depart(reg, state, mission.id));
      s.expedition!.objectiveDone = true;
      s.expedition!.phase = 'travel';
      if (orders !== undefined) s.expedition!.orders = orders;
      return run(s, reg, { type: 'expedition/return', payload: {} });
    };
    const ok = attempt('command', 2);
    expect(errors(ok.events)).toEqual([]);
    expect(ofType(ok.events, 'outside_feat')).toEqual([{ type: 'outside_feat', featId: 'ordered_mission' }]);
    expect(ofType(attempt('command', 0).events, 'outside_feat')).toEqual([]);
    expect(ofType(attempt('command', undefined).events, 'outside_feat')).toEqual([]);
    expect(ofType(attempt('side', 3).events, 'outside_feat')).toEqual([]);
  });

  it('combat/order inside a run counts the order; one outside a run counts nothing', () => {
    const base = campaign(reg, 4);
    const withRun = structuredClone(base);
    withRun.expedition = stubExpedition(withRun);
    const open = run(withRun, reg, {
      type: 'combat/start',
      payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: defaultFormation(withRun, reg, withRun.roster.activeIds), expedition: true },
    }).state;
    expect(open.combat).toBeDefined();
    const ordered = run(open, reg, { type: 'combat/order', payload: { orderId: 'steady', targetCid: 's1' } });
    expect(errors(ordered.events)).toEqual([]);
    expect(ordered.state.expedition!.orders).toBe(1);
    // outside a run the same order counts nothing
    const plain = run(base, reg, {
      type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: defaultFormation(base, reg, base.roster.activeIds) },
    }).state;
    const alone = run(plain, reg, { type: 'combat/order', payload: { orderId: 'steady', targetCid: 's1' } });
    expect(errors(alone.events)).toEqual([]);
    expect(alone.state.expedition).toBeUndefined();
  });

  it('negotiation needs a passed social route or a passed check; a passed body route is not a negotiation', () => {
    expect(negotiationHolds({ type: 'dilemma_resolved', routePassed: true, routeKind: 'social' })).toBe(true);
    expect(negotiationHolds({ type: 'dilemma_resolved', routePassed: true, routeKind: 'body' })).toBe(false);
    expect(negotiationHolds({ type: 'dilemma_resolved', routePassed: false, routeKind: 'social' })).toBe(false);
    expect(negotiationHolds({ type: 'dilemma_resolved', checkPassed: true })).toBe(true);
    expect(negotiationHolds({ type: 'dilemma_resolved', checkPassed: false })).toBe(false);
    expect(negotiationHolds({ type: 'dilemma_resolved', nothing: true })).toBe(false);
  });
});

describe('negotiation at the dilemma site', () => {
  const routed = (route: Record<string, unknown>): Registries => {
    const r = { ...reg } as Registries;
    r.dilemmaTemplates = new Map(reg.dilemmaTemplates);
    const t = structuredClone(reg.dilemmaTemplates.get('dil_rations')!) as unknown as { fixed: { options: Array<Record<string, unknown>> } };
    t.fixed.options[0].routeCheck = { id: 'talk_it', routes: [route, { kind: 'bypass', cost: { resource: 'credits', amount: 5 } }] };
    r.dilemmaTemplates.set('dil_rations', t as never);
    return r;
  };
  const choose = (r: Registries) => {
    const s = campaign(reg, 4);
    s.commander.socialStats.authority = 3;
    s.commander.body = { strength: 5, endurance: 3, reflexes: 3 };
    s.resources.credits = 100;
    const q = run(s, r, { type: 'dilemma/request', payload: { templateId: 'dil_rations', context: 'base' } });
    const p = run(q.state, r, { type: 'dilemma/fallback', payload: { requestId: q.state.dilemmas!.open!.id } }).state;
    return run(p, r, { type: 'dilemma/choose', payload: { id: p.dilemmas!.open!.id, index: 0, route: { route: 0 } } });
  };

  it('a passed social route notes the feat, a passed body route does not', () => {
    const social = choose(routed({ kind: 'social', stat: 'authority', min: 2 }));
    expect(errors(social.events)).toEqual([]);
    expect(ofType(social.events, 'dilemma_resolved')[0]).toMatchObject({ routePassed: true, routeKind: 'social' });
    expect(ofType(social.events, 'outside_feat')).toEqual([{ type: 'outside_feat', featId: 'negotiation' }]);
    const body = choose(routed({ kind: 'body', stat: 'strength', min: 2 }));
    expect(ofType(body.events, 'dilemma_resolved')[0]).toMatchObject({ routePassed: true, routeKind: 'body' });
    expect(ofType(body.events, 'outside_feat')).toEqual([]);
  });
});
