import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { fixtureCombat } from '../../helpers/combat';
import { recordTally } from '../../../src/engine/personal/tally';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { personalOf } from '../../../src/engine/personal/state';
import { removeFromService } from '../../../src/engine/leash/use';
import type { CampaignState, Wager } from '../../../src/engine/state/types';
import { endExpedition } from '../../../src/engine/world/expedition';
import { ANN, BEA, ctxFrom, errors, loadCore, ofType, partner, plain, run } from '../../helpers/personal';
import { depart, withMission } from '../../helpers/expedition';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const stakeOf = (effect: string): string => [...reg.wagerStakes.values()].find((x) => x.effect === effect)!.id as string;
const record = (s: CampaignState) => s.relations[ANN].impunityRecord ?? 0;

/** Ann has a bet on the next run (she bets it happens), and the squad is out on a mission. */
function out(pick: string, over: Partial<Wager> = {}): CampaignState {
  const base = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 60 });
  const bet = run(base, reg, { type: 'wager/challenge', payload: { unitId: ANN, gameId: 'expedition_bet', stakeId: stakeOf('privilege'), pick } });
  expect(errors(bet.events)).toEqual([]);
  const { state, mission } = withMission(reg, bet.state);
  const gone = depart(reg, state, mission.id);
  if (over.status !== undefined) personalOf(gone).wagers!.open[0].status = over.status;
  return gone;
}
/** Ends the run with the given tally and objective flag. */
function finish(s: CampaignState, o: { kills?: number; hits?: number; objective?: boolean; outcome?: 'success' | 'retreated' | 'failed'; party?: string[] } = {}) {
  const d = structuredClone(s);
  d.expedition!.tally = { [ANN]: { kills: o.kills ?? 0, hits: o.hits ?? 0 } };
  d.expedition!.objectiveDone = o.objective ?? false;
  if (o.party) d.expedition!.party = o.party;
  const events = endExpedition(d, ctxFrom(d, reg), o.outcome ?? 'retreated');
  return { d, events };
}

describe('an expedition bet', () => {
  it('waits for a run with her: accepted at once as pending_run, nothing applied', () => {
    const s = out('kills');
    expect(personalOf(s).wagers!.open).toEqual([expect.objectContaining({ unitId: ANN, gameId: 'expedition_bet', pick: 'kills', status: 'pending_run', by: 'commander' })]);
    expect(record(s)).toBe(0);
  });

  it('needs a pick of kills, no_damage or objective', () => {
    const base = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 60 });
    for (const pick of [undefined, 'flying']) {
      const r = run(base, reg, { type: 'wager/challenge', payload: { unitId: ANN, gameId: 'expedition_bet', stakeId: stakeOf('privilege'), ...(pick ? { pick } : {}) } });
      expect(errors(r.events), String(pick)).toHaveLength(1);
    }
  });

  it('kills: she lands at least 3 killing blows and wins; fewer and the commander wins', () => {
    const won = finish(out('kills'), { kills: 3 });
    expect(ofType(won.events, 'wager_resolved')).toEqual([expect.objectContaining({ unitId: ANN, winner: 'unit', gameId: 'expedition_bet', pick: 'kills' })]);
    expect(record(won.d)).toBe(6);
    expect(personalOf(won.d).wagers!.open).toEqual([]);
    const lost = finish(out('kills'), { kills: 2 });
    expect(ofType(lost.events, 'wager_resolved')[0].winner).toBe('commander');
    expect(record(lost.d)).toBe(-6);
  });

  it('no_damage: she takes no damage and wins; one hit and the commander wins', () => {
    expect(ofType(finish(out('no_damage'), { hits: 0 }).events, 'wager_resolved')[0].winner).toBe('unit');
    expect(ofType(finish(out('no_damage'), { hits: 1 }).events, 'wager_resolved')[0].winner).toBe('commander');
  });

  it('objective: the run\'s objective is done and she wins; not done and the commander wins', () => {
    expect(ofType(finish(out('objective'), { objective: true, outcome: 'success' }).events, 'wager_resolved')[0].winner).toBe('unit');
    expect(ofType(finish(out('objective'), { objective: false }).events, 'wager_resolved')[0].winner).toBe('commander');
  });

  it('resolves before the slots are spent, and only for a party member', () => {
    const away = finish(out('kills'), { kills: 5, party: [BEA] });
    expect(ofType(away.events, 'wager_resolved')).toEqual([]);
    expect(personalOf(away.d).wagers!.open).toHaveLength(1);
    const run1 = finish(out('kills'), { kills: 5 });
    const types = run1.events.map((e) => e.type);
    expect(types.indexOf('wager_resolved')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('wager_resolved')).toBeLessThan(types.indexOf('slot_advanced') === -1 ? Infinity : types.indexOf('slot_advanced'));
  });

  it('is void after 7 days, or when she leaves', () => {
    const s = out('kills');
    const late = structuredClone(s);
    late.expedition = undefined;
    delete late.expedition;
    late.day += 7;
    const events = personalDayStep(late, ctxFrom(late, reg));
    expect(ofType(events, 'wager_resolved')).toEqual([expect.objectContaining({ winner: 'void' })]);
    expect(record(late)).toBe(0);
    const gone = structuredClone(s);
    delete gone.expedition;
    removeFromService(gone, ANN, 'terminated');
    expect(personalOf(gone).wagers!.open).toEqual([]);
  });

  it('a run with no bet open resolves nothing and adds only the tally', () => {
    const base = plain(reg);
    const { state, mission } = withMission(reg, base);
    const gone = depart(reg, state, mission.id);
    const d = structuredClone(gone);
    d.expedition!.tally = { [ANN]: { kills: 4, hits: 0 } };
    const events = endExpedition(d, ctxFrom(d, reg), 'retreated');
    expect(ofType(events, 'wager_resolved')).toEqual([]);
    expect(d.personal).toBeUndefined();
  });
});

describe('the tally', () => {
  it('counts killing blows and hits per unit from the combat log', () => {
    const cs = fixtureCombat({
      squad: [{ cid: 's1', unitId: ANN }, { cid: 's2', unitId: BEA }],
      enemies: [{ cid: 'e1' }, { cid: 'e2' }, { cid: 'e3' }],
    });
    cs.log.push(
      { round: 1, kind: 'hit', actor: 's1', target: 'e1', amount: 9 },
      { round: 1, kind: 'downed', actor: 's1', target: 'e1' },
      { round: 1, kind: 'crit', actor: 's2', target: 'e2', amount: 20 },
      { round: 1, kind: 'downed', actor: 's2', target: 'e2' },
      { round: 2, kind: 'hit', actor: 'e3', target: 's1', amount: 4 },
      { round: 2, kind: 'crit', actor: 'e3', target: 's1', amount: 8 },
      { round: 2, kind: 'hit', actor: 'e3', target: 's2', amount: 3 },
      { round: 2, kind: 'hit', actor: 's1', target: 's2', amount: 1 }, // friendly fire is nobody's kill or hit
      { round: 3, kind: 'downed', actor: 's1', target: 'e3' },
      { round: 3, kind: 'miss', actor: 'e3', target: 's1' },
    );
    const s = plain(reg);
    const d = structuredClone(withMission(reg, s).state);
    const m = withMission(reg, s);
    const dep = depart(reg, m.state, m.mission.id);
    recordTally(dep, cs);
    expect(dep.expedition!.tally).toEqual({ [ANN]: { kills: 2, hits: 2 }, [BEA]: { kills: 1, hits: 1 } });
    // a second fight adds to it
    recordTally(dep, cs);
    expect(dep.expedition!.tally![ANN]).toEqual({ kills: 4, hits: 4 });
    void d;
  });

  it('records nothing outside a run', () => {
    const s = plain(reg);
    recordTally(s, fixtureCombat());
    expect(s.expedition).toBeUndefined();
  });
});
