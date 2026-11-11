import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { ensureLeash, leashLog, leashWeekly, refreshLeash } from '../../../src/engine/leash/weekly';
import type { CampaignState } from '../../../src/engine/state/types';
import { offerMission } from '../../../src/engine/world/missions';
import { campaign, ctxOf, endDay, errors, loadCore, run } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4); // Vesper start, mutiny crime
});

const withRegs = (patch: (r: Registries) => void): Registries => {
  const r = { ...reg } as Registries;
  r.corporations = new Map(reg.corporations);
  patch(r);
  return r;
};

describe('weekly authorizations', () => {
  it('weekly is the corporation base', () => {
    expect(leashWeekly(base, reg)).toBe(3);
  });

  it('smuggling lowers it by one', () => {
    expect(leashWeekly(campaign(reg, 4, { crimeId: 'smuggling' }), reg)).toBe(2);
  });

  it('standing 30 adds one, −30 removes one, never below 0 or above 5', () => {
    const own = base.commander.corporationId as string;
    const at = (standing: number, r: Registries = reg, s: CampaignState = base) => {
      const d = structuredClone(s);
      d.world.factions[own] = standing;
      return leashWeekly(d, r);
    };
    expect(at(29)).toBe(3);
    expect(at(30)).toBe(4);
    expect(at(-29)).toBe(3);
    expect(at(-30)).toBe(2);
    const five = withRegs((r) => r.corporations.set(own, { ...reg.corporations.get(own)!, leash: { weekly: 5, approval: 0.7 } }));
    expect(at(60, five)).toBe(5);
    const sable = campaign(reg, 4, { crimeId: 'smuggling' });
    sable.commander.corporationId = 'sable';
    expect(at(-60, reg, sable)).toBe(0);
  });

  it('a new campaign starts with a full week and refreshDay 8', () => {
    expect(base.leash.authorizationsLeft).toBe(3);
    expect(base.leash.refreshDay).toBe(8);
    expect(base.leash.seeded).toBe(true);
    expect(base.leash.log).toEqual([]);
  });

  it('the seventh day end refills and moves refreshDay by 7', () => {
    let s = structuredClone(base);
    s.leash.authorizationsLeft = 1;
    for (let day = 1; day <= 7; day++) {
      expect(s.day).toBe(day);
      s = endDay(s, reg);
      if (day < 7) {
        expect(s.leash.authorizationsLeft, `after day ${day}`).toBe(1);
        expect(s.leash.refreshDay).toBe(8);
      }
    }
    expect(s.day).toBe(8);
    expect(s.leash.authorizationsLeft).toBe(3);
    expect(s.leash.refreshDay).toBe(15);
  });

  it('refreshLeash reports the refill', () => {
    const d = structuredClone(base);
    d.day = 7;
    d.leash.authorizationsLeft = 0;
    const events = refreshLeash(d, reg);
    expect(events).toEqual([{ type: 'leash_refreshed', left: 3 }]);
    expect(refreshLeash(d, reg)).toEqual([]);
  });

  it('a leash −1 effect on the refresh day is not carried into the new week', () => {
    let s = structuredClone(base);
    s.day = 7;
    const draft = structuredClone(s);
    const { mission } = offerMission(draft, ctxOf(draft, reg), { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source: 'command' });
    expect(mission).not.toBeNull();
    const m = draft.missions.offered.find((x) => x.id === mission!.id)!;
    m.deadlineDay = 7;
    m.failureEffects = [{ type: 'leash', amount: -1 }];
    s = endDay(draft, reg);
    expect(s.day).toBe(8);
    expect(s.leash.authorizationsLeft).toBe(3); // the −1 landed in the old week
    expect(s.missions.completed.some((x) => x.id === m.id && x.status === 'failed')).toBe(true);
  });
});

describe('old saves', () => {
  it('a pre-P6 save is seeded once', () => {
    const old = structuredClone(base);
    old.leash = { authorizationsLeft: 0, refreshDay: 1, log: [] };
    const a = run(old, reg, { type: 'leash/seed' });
    expect(errors(a.events)).toEqual([]);
    expect(a.state.leash.authorizationsLeft).toBe(3);
    expect(a.state.leash.refreshDay).toBe(8);
    expect(a.state.leash.seeded).toBe(true);
    const spent = structuredClone(a.state);
    spent.leash.authorizationsLeft = 2;
    const b = run(spent, reg, { type: 'leash/seed' });
    expect(b.state.leash.authorizationsLeft).toBe(2);
    // ensureLeash called directly behaves the same
    expect(ensureLeash(spent, reg)).toEqual([]);
  });

  it('a pre-P6 save is also seeded by the first day end', () => {
    const old = structuredClone(base);
    old.leash = { authorizationsLeft: 0, refreshDay: 1, log: [] };
    const s = endDay(old, reg);
    expect(s.leash.seeded).toBe(true);
    expect(s.leash.authorizationsLeft).toBe(3);
    expect(s.leash.refreshDay).toBe(8);
  });

  it('leashLog ignores entries of unknown shape and keeps them in state', () => {
    const s = structuredClone(base);
    const good = { no: 1, unitId: 'unit_ann', kind: 'compel', day: 2, context: 'scene', outcome: 'done' };
    s.leash.log = [good, 'garbage', null, { unitId: 3 }, { unitId: 'u', kind: 'zap', day: 1 }, { no: 2, unitId: 'unit_bea', kind: 'suppress', day: 3, context: 'desertion', outcome: 'done' }];
    expect(leashLog(s).map((e) => e.no)).toEqual([1, 2]);
    const after = endDay(s, reg);
    expect(after.leash.log).toHaveLength(6);
    expect(after.leash.log[1]).toBe('garbage');
  });
});
