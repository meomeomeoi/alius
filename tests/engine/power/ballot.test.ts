import { beforeAll, describe, expect, it } from 'vitest';
import { VoteKindSchema } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import { missingDescriptions } from '../../../src/analysis/describe';
import { ballotFor, commanderVoteWeight, compatibility, leanFor, subjectOf, tallyVote } from '../../../src/engine/power/ballot';
import { VALUE_AXES, type CampaignState, type DisciplineState, type Unit } from '../../../src/engine/state/types';
import type { Mission } from '../../../src/engine/world/types';
import { campaign, loadCore, setRelation } from '../../helpers/loyalty';
import { withLeader, withOptions, withStance } from '../../helpers/power';

let reg: Registries;
/** The same registries with every stance's voteBias at 0, so a score holds the other terms only. */
let flat: Registries;
beforeAll(async () => {
  reg = await loadCore();
  flat = { ...reg, commandStances: new Map([...reg.commandStances].map(([id, e]) => [id, { ...e, voteBias: 0 }])) };
});

const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const unitOf = (s: CampaignState, id: string): Unit => s.squad.find((u) => u.id === id)!;
const values = (s: CampaignState, id: string, v: Partial<Unit['values']>): void => {
  unitOf(s, id).values = { ...ZERO, ...v };
};
/** Four named units, all neutral: values 0, Trust 50 (the trust term is 0). */
function fresh(): CampaignState {
  const s = campaign(reg, 4);
  s.commander.socialStats.authority = 1; // the commander's weight is 1
  for (const id of [ANN, BEA, CAT, DEE]) {
    values(s, id, {});
    setRelation(s, id, { trust: 50 });
  }
  return s;
}
const mission = (over: Partial<Mission> = {}): Mission => ({
  id: 'm_t', source: 'command', templateId: 'tpl_sweep', title: 'T', brief: 'B', regionId: 'quarantine_d7', danger: 3,
  objective: { node: 'n', condition: 'win' }, offeredDay: 1, rewardsTier: 'standard', failureEffects: [], status: 'offered', ...over,
});
const withMission = (s: CampaignState, over: Partial<Mission> = {}): Mission => {
  const m = mission(over);
  s.missions.offered.push(m);
  return m;
};
const score = (s: CampaignState, r: Registries, id: string, kind: Parameters<typeof ballotFor>[3], subject: string) =>
  ballotFor(s, r, unitOf(s, id), kind, subject);

describe('compatibility', () => {
  it('is 1 for equal values, 0 for opposite extremes and in between otherwise', () => {
    const a = { values: { ...ZERO } };
    expect(compatibility(a, a)).toBe(1);
    const hi = { values: Object.fromEntries(VALUE_AXES.map((x) => [x, 3])) as Unit['values'] };
    const lo = { values: Object.fromEntries(VALUE_AXES.map((x) => [x, -3])) as Unit['values'] };
    expect(compatibility(hi, lo)).toBe(0);
    expect(compatibility(a, hi)).toBeCloseTo(0.5, 10);
  });
});

describe('ballots follow values, trust, stance, demands and what the vote does to her', () => {
  it('a corporate unit votes for a command mission, an autonomous one against', () => {
    const s = fresh();
    const m = withMission(s);
    values(s, ANN, { corporate: 3 });
    values(s, BEA, { autonomy: 3 });
    const a = score(s, flat, ANN, 'mission', m.id);
    const b = score(s, flat, BEA, 'mission', m.id);
    expect(a).toMatchObject({ vote: 'for', score: 3, term: 'values', weight: 1 });
    expect(b).toMatchObject({ vote: 'against', score: -3, term: 'values', weight: 1 });
  });

  it('the danger of a mission leans the sacrificial for and the pragmatic against', () => {
    const s = fresh();
    const hard = withMission(s, { id: 'm_hard', danger: 5 });
    const easy = withMission(s, { id: 'm_easy', danger: 1 });
    values(s, ANN, { sacrifice: 2 });
    expect(score(s, flat, ANN, 'mission', hard.id).score).toBe(2); // (5 − 3) / 2 = +1 × sacrifice 2
    expect(score(s, flat, ANN, 'mission', easy.id).score).toBe(-2);
  });

  it('the lean of a mission is the kind lean, the template lean, the danger and the command source', () => {
    const s = fresh();
    const cmd = withMission(s, { id: 'm_cmd', source: 'command', danger: 5 });
    const side = withMission(s, { id: 'm_side', source: 'side', danger: 3 });
    expect(leanFor(s, reg, 'mission', cmd.id)).toEqual({ sacrifice: 1, pragmatism: -1, corporate: 1, autonomy: -1 });
    expect(leanFor(s, reg, 'mission', side.id)).toEqual({});
    const typed = withMission(s, { id: 'm_typed', source: 'side', danger: 3, templateId: 'tpl_hunt' });
    const tpl = (reg.missionTemplates.get('tpl_hunt') as unknown as { voteLean: Record<string, number> }).voteLean;
    expect(leanFor(s, reg, 'mission', typed.id)).toEqual(tpl);
  });

  it('an upgrade leans by the kind and the facility; rations by their subject entry', () => {
    const s = fresh();
    const kindLean = (reg.voteKinds.get('upgrade') as unknown as { lean: Record<string, number> }).lean;
    const fac = (reg.facilities.get('mess_hall') as unknown as { voteLean?: Record<string, number> }).voteLean ?? {};
    const expected: Record<string, number> = { ...kindLean };
    for (const [k, v] of Object.entries(fac)) expected[k] = (expected[k] ?? 0) + v;
    expect(leanFor(s, reg, 'upgrade', 'mess_hall')).toEqual(expected);
    expect(leanFor(s, reg, 'rations', 'commander_short')).toEqual({ sacrifice: 1, mercy: 1 });
    expect(leanFor(s, reg, 'scapegoat', 'shift_blame')).toEqual({ corporate: 1, ingroup: -1 });
  });

  it('trust 100 adds +2, trust 0 adds −2', () => {
    const s = fresh();
    setRelation(s, ANN, { trust: 100 });
    setRelation(s, BEA, { trust: 0 });
    expect(score(s, flat, ANN, 'upgrade', 'barracks')).toMatchObject({ score: 2 + 0, term: 'trust' });
    expect(score(s, flat, BEA, 'upgrade', 'barracks')).toMatchObject({ score: -2, term: 'trust', vote: 'against' });
  });

  it('open_defiance tips a neutral unit against; fearful tips her for', () => {
    const s = fresh();
    withStance(s, reg, ANN, 'open_defiance');
    withStance(s, reg, BEA, 'fearful');
    setRelation(s, ANN, { trust: 44 }); // the stance holds below Trust 45; the trust term is nearly 0
    setRelation(s, BEA, { trust: 44 });
    expect(ballotFor(s, reg, unitOf(s, ANN), 'rations', 'equal').term).toBe('stance');
    const open = score(s, reg, ANN, 'upgrade', 'barracks');
    const fearful = score(s, reg, BEA, 'upgrade', 'barracks');
    const lean = (id: string) => score(s, flat, id, 'upgrade', 'barracks').score;
    expect(open.score - lean(ANN)).toBeCloseTo(-2, 10);
    expect(fearful.score - lean(BEA)).toBeCloseTo(1, 10);
    expect(open.vote).toBe('against');
    expect(fearful.vote).toBe('for');
  });

  it('the stance biases are the registry values: disciplined +1, fearful +1, indifferent 0, defiant_loyal −0.5, open_defiance −2', () => {
    const bias = Object.fromEntries([...reg.commandStances].map(([id, e]) => [id, (e as unknown as { voteBias: number }).voteBias]));
    expect(bias).toEqual({ disciplined: 1, defiant_loyal: -0.5, fearful: 1, open_defiance: -2, indifferent: 0 });
  });

  it('an open demand subtracts 1', () => {
    const s = fresh();
    const before = score(s, flat, ANN, 'upgrade', 'barracks').score;
    s.discipline = { demands: [{ id: 'd1', unitId: ANN, templateId: 't', text: 'x', day: 1, expiresDay: 3, status: 'open', impunityDriven: false }] } as unknown as DisciplineState;
    const after = score(s, flat, ANN, 'upgrade', 'barracks');
    expect(after.score).toBe(before - 1);
    expect(after.term).toBe('demand');
    s.discipline!.demands[0].status = 'undelivered';
    expect(score(s, flat, ANN, 'upgrade', 'barracks').score).toBe(before);
  });

  it('the punish target votes against herself; a like-minded unit leans against; an opposite one does not', () => {
    const s = fresh();
    for (const axis of VALUE_AXES) unitOf(s, ANN).values[axis] = 3;
    for (const axis of VALUE_AXES) unitOf(s, BEA).values[axis] = 3;
    for (const axis of VALUE_AXES) unitOf(s, CAT).values[axis] = -3; // opposite: compatibility 0
    const own = score(s, flat, ANN, 'punish', ANN);
    expect(own.vote).toBe('against');
    expect(own.term).toBe('affected');
    // corporate +1 and mercy −1 of the kind lean cancel at equal values, so only the affected terms remain
    expect(score(s, flat, BEA, 'punish', ANN)).toMatchObject({ vote: 'against', score: -2, term: 'affected' });
    expect(score(s, flat, CAT, 'punish', ANN).score).toBeCloseTo(0, 10);
    expect(score(s, flat, CAT, 'punish', ANN).vote).toBe('for');
  });

  it('the scapegoat subject of shift_blame is the unit of the open dilemma and takes −4', () => {
    const s = fresh();
    s.dilemmas = { seq: 1, open: { id: 'd', templateId: 't', scale: 'major', context: 'director', day: 1, status: 'presented', attempts: 0, units: [], beatId: 'b', subjectId: ANN } };
    expect(subjectOf('scapegoat', 'shift_blame', s)).toBe(ANN);
    expect(subjectOf('scapegoat', 'take_blame', s)).toBeNull();
    expect(subjectOf('punish', CAT)).toBe(CAT);
    expect(subjectOf('mission', 'm_t')).toBeNull();
    const a = score(s, flat, ANN, 'scapegoat', 'shift_blame');
    expect(a.score).toBeLessThanOrEqual(-4);
    expect(a.term).toBe('affected');
    expect(score(s, flat, ANN, 'scapegoat', 'take_blame').score).toBeGreaterThan(a.score);
  });

  it('the reason term is the largest absolute contribution', () => {
    const s = fresh();
    values(s, ANN, { corporate: 3 });
    setRelation(s, ANN, { trust: 100 });
    expect(score(s, flat, ANN, 'rations', 'equal').term).toBe('trust'); // her corporate 3 does not count for the equal split (ingroup)
    const m = withMission(s);
    expect(score(s, flat, ANN, 'mission', m.id).term).toBe('values'); // +3 against trust +2
    values(s, ANN, {});
    expect(score(s, flat, ANN, 'mission', m.id).term).toBe('trust');
  });
});

describe('weights and the tally', () => {
  it('commander weight: Authority 1 → 1, 3 → 2, 5 → 3; high assertiveness × 0.75', () => {
    const s = fresh();
    const at = (n: number) => {
      s.commander.socialStats.authority = n;
      return commanderVoteWeight(s, reg);
    };
    expect([at(1), at(3), at(5)]).toEqual([1, 2, 3]);
    withOptions(s, { squad_assertiveness: 'high' });
    expect([at(1), at(3), at(5)]).toEqual([0.75, 1.5, 2.25]);
  });

  it('a tie passes', () => {
    const s = fresh();
    s.commander.socialStats.authority = 3; // weight 2
    s.roster.activeIds = [ANN, BEA];
    for (const id of [ANN, BEA]) values(s, id, { autonomy: 3 });
    const m = withMission(s);
    const t = tallyVote(s, flat, 'mission', m.id);
    expect(t.againstWeight).toBe(2);
    expect(t.forWeight).toBe(2);
    expect(t.passed).toBe(true);
    s.commander.socialStats.authority = 1; // weight 1 against 2
    const lost = tallyVote(s, flat, 'mission', m.id);
    expect([lost.forWeight, lost.againstWeight, lost.passed]).toEqual([1, 2, false]);
  });

  it('the tally sums the weights by side and keeps the commander out of the ballots', () => {
    const s = fresh();
    values(s, ANN, { corporate: 3 });
    values(s, BEA, { autonomy: 3 });
    const m = withMission(s);
    const t = tallyVote(s, flat, 'mission', m.id);
    expect(t.ballots.map((b) => b.unitId)).toEqual(s.roster.activeIds.filter((id) => unitOf(s, id).kind === 'named'));
    expect(t.commanderWeight).toBe(1);
    // ann for, bea against, cat and dee neutral (score 0 → for): for = 1 + 1 + 1 + 1, against = 1
    expect([t.forWeight, t.againstWeight]).toEqual([4, 1]);
  });

  it('grunts abstain without a leader', () => {
    const s = fresh();
    s.squad.push({ ...structuredClone(unitOf(s, DEE)), id: 'grunt_1', kind: 'grunt', displayName: 'G-1' });
    s.roster.activeIds = [ANN, 'grunt_1'];
    const t = tallyVote(s, flat, 'upgrade', 'barracks');
    const g = t.ballots.find((b) => b.unitId === 'grunt_1')!;
    expect(g).toMatchObject({ vote: 'abstain', weight: 0 });
    expect(t.ballots.map((b) => b.unitId)).toEqual([ANN, 'grunt_1']);
    withLeader(s, ANN);
    expect(tallyVote(s, flat, 'upgrade', 'barracks').ballots.find((b) => b.unitId === 'grunt_1')!.vote).toBe('abstain'); // following the leader is chunk (b)
  });

  it('a squad of only grunts, only injured or nobody: the vote passes on the commander weight alone or by the ballots', () => {
    const s = fresh();
    for (const id of [ANN, BEA, CAT, DEE]) {
      const u = unitOf(s, id);
      u.kind = 'grunt';
    }
    const m = withMission(s);
    const allGrunts = tallyVote(s, flat, 'mission', m.id);
    expect(allGrunts.ballots.every((b) => b.vote === 'abstain')).toBe(true);
    expect([allGrunts.forWeight, allGrunts.againstWeight, allGrunts.passed]).toEqual([1, 0, true]);
    s.roster.activeIds = [];
    const nobody = tallyVote(s, flat, 'mission', m.id);
    expect(nobody).toMatchObject({ ballots: [], forWeight: 1, againstWeight: 0, passed: true });
    // injured units are in the roster and do vote
    const t = fresh();
    for (const id of [ANN, BEA, CAT, DEE]) {
      unitOf(t, id).status = 'injured';
      values(t, id, { autonomy: 3 });
    }
    const m2 = withMission(t);
    const injured = tallyVote(t, flat, 'mission', m2.id);
    expect(injured.ballots.map((b) => b.vote)).toEqual(['against', 'against', 'against', 'against']);
    expect(injured.passed).toBe(false);
  });

  it('a dead, deserted or terminated unit casts no ballot', () => {
    const s = fresh();
    unitOf(s, ANN).status = 'dead';
    unitOf(s, BEA).status = 'deserted';
    unitOf(s, CAT).status = 'terminated';
    const t = tallyVote(s, flat, 'upgrade', 'barracks');
    expect(t.ballots.map((b) => b.unitId)).toEqual([DEE]);
  });
});

describe('voteKinds', () => {
  it('loads five kinds with descriptions; a reason template without {name} is a load error', () => {
    expect([...reg.voteKinds.keys()].sort()).toEqual(['mission', 'punish', 'rations', 'scapegoat', 'upgrade']);
    expect(missingDescriptions(reg)).toEqual([]);
    const kind = structuredClone(reg.voteKinds.get('mission')) as unknown as { reasons: Record<string, { for: string; against: string }> };
    expect(VoteKindSchema.safeParse(kind).success).toBe(true);
    kind.reasons.values.for = 'She agrees.';
    expect(VoteKindSchema.safeParse(kind).success).toBe(false);
  });

  it('every kind has a reason line for every term and side, and a lean within −2…2', () => {
    for (const k of reg.voteKinds.values()) {
      const e = k as unknown as { reasons: Record<string, { for: string; against: string }>; lean: Record<string, number> };
      for (const term of ['values', 'trust', 'stance', 'demand', 'affected']) {
        expect(e.reasons[term].for.length, `${k.id}.${term}.for`).toBeGreaterThan(0);
        expect(e.reasons[term].against.length, `${k.id}.${term}.against`).toBeGreaterThan(0);
      }
      for (const v of Object.values(e.lean)) expect(Math.abs(v)).toBeLessThanOrEqual(2);
    }
  });
});
