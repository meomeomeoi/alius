import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { seedRng } from '../../../src/engine/rng';
import { loyaltyRecord } from '../../../src/engine/loyalty/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { payload, withMission } from '../../helpers/expedition';
import { withOptions } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

/** A passed mission vote, and a breaking party member who may walk out at the gate. */
function boarded(seed: number): { s: CampaignState; missionId: string } {
  const base = campaign(reg, 4);
  base.resources.supplies = 100;
  for (const u of base.squad) { u.values = { ...ZERO, corporate: 3 }; setRelation(base, u.id, { trust: 50 }); }
  withOptions(base, { voting: 'on' });
  const { state, mission } = withMission(reg, base, { templateId: 'tpl_sweep', source: 'command' });
  const voted = run(state, reg, { type: 'vote/open', payload: { kind: 'mission', subject: mission.id } }).state;
  expect(voted.power!.votes.open!.status).toBe('passed');
  const bea = voted.squad[1].id;
  setRelation(voted, bea, { trust: 3, affinity: -10, band: 'breaking' });
  loyaltyRecord(voted, bea).signs.push({ day: voted.day - 1, about: 'desertion', kind: 'fact', signId: 'sign_desertion_fact_1' });
  voted.rng = seedRng(seed);
  return { s: voted, missionId: mission.id };
}

describe('a vote is spent only when its decision ran (0.1 audit)', () => {
  it('a soldier walking out at the gate leaves the vote open for the retry', () => {
    let seen = false;
    for (let seed = 1; seed <= 300 && !seen; seed++) {
      const { s, missionId } = boarded(seed);
      const r = run(s, reg, { type: 'expedition/start', payload: { ...payload(s, missionId), voteId: 'v1' } });
      if (ofType(r.events, 'desertion_attempt').length === 0) continue;
      seen = true;
      expect(errors(r.events)).toEqual([]);
      expect(r.state.expedition).toBeUndefined();
      expect(ofType(r.events, 'vote_carried')).toEqual([]);
      expect(r.state.power!.votes.open).toMatchObject({ id: 'v1', status: 'passed' });
    }
    expect(seen).toBe(true);
  });

  it('a run that starts spends it', () => {
    const { s, missionId } = boarded(1);
    setRelation(s, s.squad[1].id, { trust: 50, affinity: 0, band: 'steady' });
    const r = run(s, reg, { type: 'expedition/start', payload: { ...payload(s, missionId), voteId: 'v1' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition).toBeDefined();
    expect(ofType(r.events, 'vote_carried')).toHaveLength(1);
    expect(r.state.power!.votes.open).toBeUndefined();
  });
});
