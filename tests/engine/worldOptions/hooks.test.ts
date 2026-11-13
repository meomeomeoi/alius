import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { leashWeekly } from '../../../src/engine/leash/weekly';
import { terminateChance } from '../../../src/engine/leash/use';
import { buildCampaign, type SetupResult } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { offerMission, rollRewards, runDeadlines } from '../../../src/engine/world/missions';
import { normDistance } from '../../../src/engine/worldOptions';
import { campaign, ctxOf, loadCore, unitSetup } from '../../helpers/world';

let reg: Registries;
let vesper: CampaignState;
let kestrel: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  vesper = campaign(reg, 2);
  kestrel = campaign(reg, 2, { startId: 'start_kestrel' });
});

const withOptions = (s: CampaignState, options: Record<string, string>): CampaignState => {
  const d = structuredClone(s);
  d.world.options = { ...(d.world.options ?? {}), ...options };
  return d;
};

describe('oversight', () => {
  it('oversight gives 3/2/1 authorizations with a base-2 corporation', () => {
    expect(kestrel.commander.corporationId).toBe('kestrel');
    expect(['lenient', 'standard', 'brutal'].map((o) => leashWeekly(withOptions(kestrel, { oversight: o }), reg))).toEqual([3, 2, 1]);
  });

  it('keeps the difference between corporations and clamps at 0 and 5', () => {
    expect(leashWeekly(withOptions(vesper, { oversight: 'lenient' }), reg)).toBe(4); // Vesper base 3
    expect(leashWeekly(withOptions(vesper, { oversight: 'brutal' }), reg)).toBe(2);
    const low = withOptions(campaign(reg, 2, { crimeId: 'smuggling', startId: 'start_kestrel' }), { oversight: 'brutal' });
    low.world.factions.kestrel = -40;
    expect(leashWeekly(low, reg)).toBe(0);
  });

  it('brutal lowers the Terminate approval, lenient raises it', () => {
    const at = (o: string) => terminateChance(withOptions(kestrel, { oversight: o }), reg);
    expect(at('standard')).toBeCloseTo(0.5 + TUNING.leash.terminate.approvalPerStanding * 10, 10);
    expect(at('brutal')).toBeCloseTo(at('standard') - 0.15, 10);
    expect(at('lenient')).toBeCloseTo(at('standard') + 0.1, 10);
  });
});

describe('stigma: mission rewards', () => {
  const tpl = 'tpl_sweep';
  const rewardsFor = (s: CampaignState) => {
    const draft = structuredClone(s);
    const o = offerMission(draft, ctxOf(draft, reg), { templateId: tpl, regionId: 'quarantine_d7', source: 'command' });
    const m = o.mission!;
    const ctx = ctxOf(draft, reg);
    const r = rollRewards(draft, ctx, m);
    return { ...r, rng: ctx.rng.state };
  };

  it('scorned pays 10% less on the same seed', () => {
    const std = rewardsFor(vesper);
    const scorned = rewardsFor(withOptions(vesper, { offspec_stigma: 'scorned' }));
    expect(std.rewards.credits).toBeGreaterThan(0);
    expect(scorned.rewards.credits).toBe(Math.round(std.rewards.credits * 0.9));
    expect(scorned.rewards.plyx).toBe(Math.round(std.rewards.plyx * 0.9));
    // the rolls themselves are untouched: same loot, same rng position
    expect(scorned.drops).toEqual(std.drops);
    expect(scorned.rng).toEqual(std.rng);
  });

  it('hunted and tolerated do not touch rewards', () => {
    const std = rewardsFor(vesper);
    expect(rewardsFor(withOptions(vesper, { offspec_stigma: 'hunted' })).rewards).toEqual(std.rewards);
    expect(rewardsFor(withOptions(vesper, { offspec_stigma: 'tolerated' })).rewards).toEqual(std.rewards);
  });
});

describe('oversight: failed command missions', () => {
  /** tpl_sweep (command and side) with a faction loss on failure, so the multiplier has something to scale. */
  const patched = (): Registries => {
    const r = { ...reg, missionTemplates: new Map(reg.missionTemplates) } as Registries;
    const t = structuredClone(reg.missionTemplates.get('tpl_sweep')!) as unknown as { failureEffects: unknown[] };
    t.failureEffects = [{ type: 'faction', factionId: 'vesper', amount: -10 }];
    r.missionTemplates.set('tpl_sweep', t as never);
    return r;
  };
  const standingAfterFailure = (oversight: string, source: 'command' | 'side') => {
    const regs = patched();
    const draft = withOptions(vesper, { oversight });
    const o = offerMission(draft, ctxOf(draft, regs), { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source });
    expect(o.mission, `${oversight}/${source}`).not.toBeNull();
    const before = draft.world.factions.vesper;
    draft.day = o.mission!.deadlineDay!;
    runDeadlines(draft, ctxOf(draft, regs));
    return draft.world.factions.vesper - before;
  };

  it('brutal deepens a failed command mission\'s faction loss, a side mission is unchanged', () => {
    expect(standingAfterFailure('standard', 'command')).toBe(-10);
    expect(standingAfterFailure('brutal', 'command')).toBe(-15);
    expect(standingAfterFailure('lenient', 'command')).toBe(-5);
    expect(standingAfterFailure('brutal', 'side')).toBe(-10);
    expect(standingAfterFailure('lenient', 'side')).toBe(-10);
  });

  it('only losses are scaled: a gain in failureEffects is left alone', () => {
    const regs = patched();
    (regs.missionTemplates.get('tpl_sweep') as unknown as { failureEffects: unknown[] }).failureEffects = [{ type: 'faction', factionId: 'vesper', amount: 4 }];
    const draft = withOptions(vesper, { oversight: 'brutal' });
    const o = offerMission(draft, ctxOf(draft, regs), { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source: 'command' });
    const before = draft.world.factions.vesper;
    draft.day = o.mission!.deadlineDay!;
    runDeadlines(draft, ctxOf(draft, regs));
    expect(draft.world.factions.vesper - before).toBe(4);
  });
});

describe('gender norms: own-corporation standing', () => {
  const build = (expression: number, options: Record<string, string>) => {
    const r: SetupResult = {
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann')],
      commander: { body: { strength: 3, endurance: 3, reflexes: 3 }, expression, seasoning: 3, traits: { regular: [] } },
      world: { options },
    };
    const b = buildCampaign(r, reg, { desireBondDefects: false, seed: 11 });
    if (!b.ok) throw new Error(b.errors.join('; '));
    return b.state;
  };
  const own = (s: CampaignState) => s.world.factions[s.commander.corporationId!];

  it('machismo with a very feminine commander starts own standing 8 lower; indifferent changes nothing', () => {
    const flat = own(build(1, {}));
    expect(flat).toBe(TUNING.world.ownFactionStart);
    expect(own(build(1, { gender_norms: 'corporate_machismo' }))).toBe(flat - 8);
    expect(own(build(3, { gender_norms: 'corporate_machismo' }))).toBe(flat - 4);
    expect(own(build(5, { gender_norms: 'corporate_machismo' }))).toBe(flat);
    expect(own(build(1, { gender_norms: 'indifferent' }))).toBe(flat);
  });

  it('inverted punishes the other end', () => {
    const flat = own(build(3, {}));
    expect(own(build(5, { gender_norms: 'inverted' }))).toBe(flat - 8);
    expect(own(build(1, { gender_norms: 'inverted' }))).toBe(flat);
  });

  it('only the own corporation moves', () => {
    const a = build(1, {});
    const b = build(1, { gender_norms: 'corporate_machismo' });
    for (const id of Object.keys(a.world.factions)) {
      if (id !== a.commander.corporationId) expect(b.world.factions[id], id).toBe(a.world.factions[id]);
    }
  });

  it('normDistance is null without a norm and 0..4 with one', () => {
    expect(normDistance(vesper, reg)).toBeNull();
    const s = withOptions(vesper, { gender_norms: 'corporate_machismo' });
    s.commander.expression = 2;
    expect(normDistance(s, reg)).toBe(3);
  });
});

describe('defaults change none of these numbers', () => {
  it('an old save and a default-option save read the same', () => {
    const old = structuredClone(kestrel);
    delete old.world.options;
    const dflt = withOptions(kestrel, {});
    expect(leashWeekly(old, reg)).toBe(leashWeekly(dflt, reg));
    expect(leashWeekly(dflt, reg)).toBe(2);
    expect(terminateChance(old, reg)).toBe(terminateChance(dflt, reg));
    expect(normDistance(dflt, reg)).toBeNull();
  });
});
