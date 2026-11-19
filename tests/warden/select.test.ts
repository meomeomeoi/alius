import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { isLiving } from '../../src/engine/economy';
import { corporateWardenPick, forgetWarden, isLeashswap, leashswapOf, seedWarden, wardenOf, wardenUnitId } from '../../src/engine/warden';
import { herCallCandidates } from '../../src/engine/power/herCall';
import { computeHierarchy, standingOf } from '../../src/engine/power/standing';
import { removeFromService } from '../../src/engine/leash/use';
import { Rng } from '../../src/engine/rng';
import { buildCampaign, validateSetup, type SetupResult } from '../../src/engine/setup';
import type { CampaignState, Unit } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, loadCore, unitSetup } from '../helpers/world';
import { setRecord } from '../helpers/discipline';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const opts = { desireBondDefects: false, seed: 11 };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const setup = (mode?: SetupResult['mode'], n = 3): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
  units: ['Ann', 'Bea', 'Cat', 'Dee'].slice(0, n).map((nm) => unitSetup(nm)),
  ...(mode ? { mode } : {}),
});
const build = (r: SetupResult): CampaignState => {
  const out = buildCampaign(r, reg, opts);
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};
const withValues = (s: CampaignState, id: string, v: Partial<Unit['values']>): void => {
  const u = s.squad.find((x) => x.id === id)!;
  u.values = { ...ZERO, ...v };
};

describe('corporate assignment', () => {
  it('follows the ordering', () => {
    const s = campaign(reg, 3);
    const [a, b, c] = s.squad.map((u) => u.id);
    withValues(s, a, { corporate: 2, autonomy: 1 });
    withValues(s, b, { corporate: 2, autonomy: -1 });
    withValues(s, c, { corporate: 1, autonomy: -3 });
    expect(corporateWardenPick(s, reg)).toBe(b);

    // equal corporate and autonomy: the lower Impunity
    withValues(s, a, { corporate: 2, autonomy: 0 });
    withValues(s, b, { corporate: 2, autonomy: 0 });
    withValues(s, c, { corporate: 0, autonomy: 0 });
    setRecord(s, a, 10);
    setRecord(s, b, -5);
    expect(corporateWardenPick(s, reg)).toBe(b);

    // a full tie: squad order
    setRecord(s, a, 0);
    setRecord(s, b, 0);
    expect(corporateWardenPick(s, reg)).toBe(a);
  });

  it('skips the excluded and the units not active; none left is null', () => {
    const s = campaign(reg, 2);
    const [a, b] = s.squad.map((u) => u.id);
    withValues(s, a, { corporate: 3 });
    expect(corporateWardenPick(s, reg, [a])).toBe(b);
    s.squad[1].status = 'injured';
    expect(corporateWardenPick(s, reg, [a])).toBeNull();
  });
});

describe('buildCampaign in LEASHSWAP', () => {
  it('a player pick seeds that unit', () => {
    const s = build(setup({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } }));
    const ls = leashswapOf(s)!;
    expect(isLeashswap(s)).toBe(true);
    expect(ls.deathRule).toBe('rewind_day');
    expect(ls.status).toBe('held');
    expect(ls.warden!.unitId).toBe(s.squad[1].id);
    expect(wardenUnitId(s)).toBe(s.squad[1].id);
    expect(ls.warden).toMatchObject({ assignedBy: 'player', satisfaction: 60, defiance: 0, leashLeft: TUNING.warden.leash.weekly, agenda: 'fallback' });
    expect(ls.warden!.warnings).toEqual([]);
    expect(ls.warden!.restrictions).toEqual([]);
    expect(ls.intrigue).toMatchObject({ suspicion: 0, seq: 0, discovered: 0, hack: { step: 0 } });
    const fact = s.memory.facts.find((f) => f.about.includes(s.squad[1].id) && f.pinned);
    expect(fact?.knownBy).toContain('*');
    expect(fact?.text).toContain(`${s.squad[1].displayName} holds the commander's controller.`);
  });

  it('corporate assignment names the unit corporateWardenPick names', () => {
    const r = setup({ kind: 'leashswap', deathRule: 'campaign_end', warden: { by: 'corporation' } });
    r.units[2].values = { ...ZERO, corporate: 3 };
    const s = build(r);
    expect(wardenOf(s)).toMatchObject({ unitId: s.squad[2].id, assignedBy: 'corporation' });
    expect(leashswapOf(s)!.deathRule).toBe('campaign_end');
  });

  it('seedWarden emits warden_assigned and fills the weekly leash', () => {
    const s = campaign(reg, 3);
    s.leashswap = { deathRule: 'rewind_day', status: 'held', intrigue: { suspicion: 0, seq: 0, lastAllyDay: {}, hack: { step: 0 }, discovered: 0 } };
    const events = seedWarden(s, { registries: reg, rng: new Rng(s.rng) }, { unitId: s.squad[0].id, assignedBy: 'oversight' });
    expect(events.map((e) => e.type)).toContain('warden_assigned');
    expect(wardenOf(s)!.assignedBy).toBe('oversight');
  });

  it('seeding draws nothing: the rng stays where a default build leaves it', () => {
    const plain = build(setup());
    const swap = build(setup({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'corporation' } }));
    expect(swap.rng).toEqual(plain.rng);
  });

  it('validateSetup refuses a bad index, a missing unit and a bad death rule', () => {
    const bad = (mode: SetupResult['mode'], n = 3): string => validateSetup(setup(mode, n), reg, opts).join('|');
    expect(bad({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 3 } })).toMatch(/warden/i);
    expect(bad({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: -1 } })).toMatch(/warden/i);
    expect(bad({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 0.5 } })).toMatch(/warden/i);
    expect(bad({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'corporation' } }, 0)).toMatch(/named unit/i);
    expect(bad({ kind: 'leashswap', deathRule: 'forever' as never, warden: { by: 'corporation' } })).toMatch(/death rule/i);
    expect(bad({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 2 } })).toBe('');
  });

  it('no mode: nothing changes', () => {
    const s = build(setup());
    expect(s.leashswap).toBeUndefined();
    expect(s.ended).toBeUndefined();
    expect(isLeashswap(s)).toBe(false);
    expect(wardenOf(s)).toBeNull();
    expect(wardenUnitId(s)).toBeNull();
  });
});

describe('the warden is outside the hierarchy', () => {
  const swap = (): CampaignState => build(setup({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 0 } }, 4));

  it('is not ranked', () => {
    const s = swap();
    const w = wardenUnitId(s)!;
    s.squad.forEach((u) => { if (u.bond) u.bond = { ...u.bond, leadStyle: 'dominant' }; });
    setRecord(s, w, 80); // top standing if she were ranked
    computeHierarchy(s, reg);
    expect(s.power?.hierarchy?.standings[w]).toBeUndefined();
    expect(s.power?.hierarchy?.leaderId).not.toBe(w);
    expect(standingOf(s, reg, w)).toBeNull();
  });

  it('herCallCandidates never lists the warden', () => {
    const s = swap();
    const w = wardenUnitId(s)!;
    const spec = { trigger: { minLeadRank: 0, stances: ['open_defiance'], minImpunity: 0 }, outcomes: [] } as never;
    const ids = s.squad.map((u) => u.id);
    expect(herCallCandidates(s, reg, spec, ids)).not.toContain(w);
    expect(herCallCandidates(s, reg, spec, ids).length).toBeGreaterThan(0);
  });
});

describe('leaving the service', () => {
  it('reassigned is not living, and removeFromService accepts it', () => {
    expect(isLiving({ status: 'reassigned' } as Unit)).toBe(false);
    const s = campaign(reg, 2);
    removeFromService(s, s.squad[0].id, 'reassigned');
    expect(s.squad[0].status).toBe('reassigned');
    expect(s.roster.activeIds).not.toContain(s.squad[0].id);
  });

  it('forgetWarden drops an open override that names her and her ally mark', () => {
    const s = build(setup({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 0 } }));
    const ls = leashswapOf(s)!;
    const id = s.squad[1].id;
    ls.intrigue.lastAllyDay[id] = 3;
    ls.warden!.override = { id: 'ov1', order: { kind: 'roster', activeIds: [] }, expectationId: 'x', alternative: { kind: 'hold' }, day: 1, slot: 'morning', context: 'base' } as never;
    forgetWarden(s, id);
    expect(ls.intrigue.lastAllyDay[id]).toBeUndefined();
    forgetWarden(s, ls.warden!.unitId);
    expect(ls.warden!.override).toBeUndefined();
  });

  it('removeFromService calls forgetWarden', () => {
    const s = build(setup({ kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 0 } }, 3));
    const ls = leashswapOf(s)!;
    const id = s.squad[1].id;
    ls.intrigue.lastAllyDay[id] = 3;
    removeFromService(s, id, 'deserted');
    expect(ls.intrigue.lastAllyDay[id]).toBeUndefined();
  });
});
