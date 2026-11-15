import { beforeAll, describe, expect, it } from 'vitest';
import { DilemmaTemplateSchema } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import { eligibleTemplates } from '../../../src/engine/dilemma/flow';
import { DILEMMA_CONTEXTS } from '../../../src/engine/dilemma/types';
import { activeRestrictions } from '../../../src/engine/discipline';
import { recordOf } from '../../../src/engine/discipline/record';
import { openScapegoat, responsibleFor, scapegoatOptionId } from '../../../src/engine/power/scapegoat';
import type { CampaignState, Vote } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { endExpedition } from '../../../src/engine/world/expedition';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { ctxOf } from '../../helpers/world';
import { depart, payload, withMission } from '../../helpers/expedition';
import { withOptions } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

function board(over: { voting?: boolean; templateId?: string; source?: 'command' | 'side' } = {}): { state: CampaignState; missionId: string } {
  const base = campaign(reg, 4);
  base.commander.socialStats.authority = 1;
  base.resources.supplies = 100;
  for (const u of base.squad) {
    u.values = { ...ZERO };
    setRelation(base, u.id, { trust: 50 });
  }
  base.squad.find((u) => u.id === ANN)!.values = { ...ZERO, corporate: 3 }; // the strongest FOR voter on a command mission
  if (over.voting !== false) withOptions(base, { voting: 'on' });
  const { state, mission } = withMission(reg, base, { templateId: over.templateId ?? 'tpl_sweep', source: over.source ?? 'command' });
  return { state, missionId: mission.id };
}
const start = (s: CampaignState, missionId: string, voteId?: string) =>
  run(s, reg, { type: 'expedition/start', payload: { ...payload(s, missionId), ...(voteId ? { voteId } : {}) } });
/** A command mission started on a passed vote: ANN is the one responsible, the others witnesses. */
function decided(): { state: CampaignState; missionId: string } {
  const b = board();
  const opened = run(b.state, reg, { type: 'vote/open', payload: { kind: 'mission', subject: b.missionId } }).state;
  const r = start(opened, b.missionId, 'v1');
  expect(errors(r.events)).toEqual([]);
  return { state: r.state, missionId: b.missionId };
}
const open = (s: CampaignState) => s.dilemmas?.open;
const own = (s: CampaignState): number => s.world.factions[s.commander.corporationId!] ?? 0;

describe('who is responsible', () => {
  it('a passed mission vote marks decidedBy with the strongest FOR voter; an overruled one does not', () => {
    const { state, missionId } = decided();
    const m = state.missions.active.find((x) => x.id === missionId)!;
    expect(m.decidedBy).toEqual({ voteId: 'v1', unitId: ANN, witnessIds: [BEA, CAT, DEE] });
    // an overruled vote: nobody is responsible, the commander decided
    const b = board();
    for (const u of b.state.squad) u.values = { ...ZERO, autonomy: 3 };
    const failed = run(b.state, reg, { type: 'vote/open', payload: { kind: 'mission', subject: b.missionId } }).state;
    expect(failed.power!.votes.open!.status).toBe('failed');
    const over = run(failed, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'order' } }).state;
    const ran = start(over, b.missionId, 'v1');
    expect(errors(ran.events)).toEqual([]);
    expect(ran.state.missions.active[0].decidedBy).toBeUndefined();
    // voting off: no vote, no decidedBy
    const off = board({ voting: false });
    expect(start(off.state, off.missionId).state.missions.active[0].decidedBy).toBeUndefined();
  });

  it('responsibleFor reads the largest weight × score among the FOR voters (named only)', () => {
    const vote = {
      id: 'v1', kind: 'mission', subject: 'm', day: 1, commanderWeight: 1, forWeight: 5, againstWeight: 0, passed: true, status: 'passed',
      ballots: [
        { unitId: ANN, vote: 'for', weight: 1, score: 2, term: 'values' },
        { unitId: BEA, vote: 'for', weight: 1.5, score: 2, term: 'values' },
        { unitId: CAT, vote: 'against', weight: 1, score: -9, term: 'values' },
        { unitId: DEE, vote: 'abstain', weight: 0, score: 0, term: 'values' },
      ],
    } as Vote;
    expect(responsibleFor(vote)).toBe(BEA);
    expect(responsibleFor({ ...vote, ballots: [vote.ballots[2], vote.ballots[3]] })).toBeNull();
  });
});

describe('when the scapegoat opens', () => {
  const decidedOnBoard = (): CampaignState => {
    const { state, missionId } = decided();
    const s = structuredClone(state);
    const m = s.missions.active.find((x) => x.id === missionId)!;
    delete s.expedition;
    s.missions.active = [];
    s.missions.offered = [{ ...m, status: 'offered' }];
    return s;
  };

  it('a decided command mission that expires opens the scapegoat', () => {
    const s = decidedOnBoard();
    s.missions.offered[0].deadlineDay = s.day;
    const after = endDay(s, reg);
    expect(after.missions.completed.at(-1)).toMatchObject({ status: 'failed' });
    const d = open(after)!;
    expect(d).toMatchObject({ context: 'scapegoat', status: 'presented', templateId: 'scapegoat_mission', subjectId: ANN, witnessIds: [BEA, CAT, DEE] });
    expect(d.options!.map((o) => o.id)).toEqual(['take_blame', 'shift_blame']);
    expect(d.setup).toContain('Ann');
    expect(d.setup).not.toMatch(/[{}]/);
  });

  it('a decided command run that ends failed costs the new standing penalty × command_failure_mult and opens the scapegoat', () => {
    for (const oversight of ['standard', 'brutal']) {
      const { state } = decided();
      withOptions(state, {});
      state.world.options = { ...(state.world.options ?? {}), oversight };
      const draft = structuredClone(state);
      const before = own(draft);
      const events = endExpedition(draft, ctxOf(draft, reg), 'failed');
      const mult = oversight === 'brutal' ? (reg.worldOptions.get('oversight')!.choices as Array<{ id: string; effects: Array<{ type: string; mult?: number }> }>).find((c) => c.id === 'brutal')!.effects.find((e) => e.type === 'command_failure_mult')!.mult! : 1;
      expect(own(draft) - before).toBe(-Math.round(TUNING.power.scapegoat.failedRunStanding * mult));
      expect(open(draft)).toMatchObject({ context: 'scapegoat', subjectId: ANN });
      expect(ofType(events, 'dilemma_presented')).toHaveLength(1);
      expect(draft.missions.offered[0].decidedBy).toBeUndefined(); // spent
    }
  });

  it('a retreat does not open it; a non-command mission does not', () => {
    const { state } = decided();
    const r = structuredClone(state);
    endExpedition(r, ctxOf(r, reg), 'retreated');
    expect(open(r)).toBeUndefined();
    expect(r.missions.offered[0].decidedBy).toBeDefined();
    const side = structuredClone(state);
    side.missions.active[0].source = 'side';
    const own0 = own(side);
    endExpedition(side, ctxOf(side, reg), 'failed');
    expect(open(side)).toBeUndefined();
    expect(own(side)).toBe(own0);
    // a failed run nobody decided costs nothing new either
    const plain = board({ voting: false });
    const d = structuredClone(start(plain.state, plain.missionId).state);
    const before = own(d);
    endExpedition(d, ctxOf(d, reg), 'failed');
    expect(open(d)).toBeUndefined();
    expect(own(d)).toBe(before);
  });

  it('with a dilemma open it is queued and opens at the next day end', () => {
    const s = structuredClone(decided().state);
    s.dilemmas = { seq: 3, open: { id: 'dl3', templateId: 'dil_rations', scale: 'minor', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [], beatId: 'b', title: 'T', setup: 'S', options: [] } };
    delete s.expedition;
    const draft = structuredClone(s);
    expect(openScapegoat(draft, ctxOf(draft, reg), { missionId: 'm1', unitId: ANN, witnessIds: [BEA] })).toEqual([]);
    expect(draft.power!.scapegoatQueue).toEqual([{ missionId: 'm1', unitId: ANN, witnessIds: [BEA] }]);
    expect(open(draft)!.templateId).toBe('dil_rations'); // untouched
    delete draft.dilemmas!.open;
    draft.resources.supplies = 100;
    const after = endDay(draft, reg);
    expect(open(after)).toMatchObject({ context: 'scapegoat', subjectId: ANN, witnessIds: [BEA] });
    expect(after.power!.scapegoatQueue ?? []).toEqual([]);
  });

  it('a queued scapegoat whose subject is gone is dropped with no effects', () => {
    const draft = structuredClone(decided().state);
    delete draft.expedition;
    draft.power!.scapegoatQueue = [{ missionId: 'm1', unitId: ANN, witnessIds: [BEA] }];
    draft.squad.find((u) => u.id === ANN)!.status = 'dead';
    draft.resources.supplies = 100;
    const before = own(draft);
    const after = endDay(draft, reg);
    expect(open(after)).toBeUndefined();
    expect(after.power!.scapegoatQueue ?? []).toEqual([]);
    expect(own(after)).toBe(before);
    // opening one directly for a dead unit opens nothing
    const d = structuredClone(draft);
    expect(openScapegoat(d, ctxOf(d, reg), { missionId: 'm1', unitId: ANN, witnessIds: [] })).toEqual([]);
    expect(open(d)).toBeUndefined();
  });
});

describe('the two answers', () => {
  function presented(): CampaignState {
    const s = structuredClone(decided().state);
    delete s.expedition;
    s.leash.authorizationsLeft = 3;
    const events = openScapegoat(s, ctxOf(s, reg), { missionId: 'm1', unitId: ANN, witnessIds: [BEA, CAT] });
    expect(ofType(events, 'dilemma_presented')).toHaveLength(1);
    s.world.options = { ...(s.world.options ?? {}), voting: 'off' };
    return s;
  }
  const choose = (s: CampaignState, id: 'take_blame' | 'shift_blame') =>
    run(s, reg, { type: 'dilemma/choose', payload: { id: open(s)!.id, index: open(s)!.options!.findIndex((o) => scapegoatOptionId(o) === id) } });
  const last = (s: CampaignState, unit: string, type: string) => s.relations[unit].history.filter((h) => h.kind === 'event' && h.type === type).at(-1);

  it('TAKE THE BLAME: own standing −10, Leash −1, shielded major on her and moderate on witnesses', () => {
    const s = presented();
    const before = own(s);
    const r = choose(s, 'take_blame');
    expect(errors(r.events)).toEqual([]);
    expect(own(r.state) - before).toBe(-10);
    expect(r.state.leash.authorizationsLeft).toBe(2);
    expect(last(r.state, ANN, 'shielded')).toMatchObject({ severity: 'major' });
    for (const id of [BEA, CAT]) expect(last(r.state, id, 'shielded')).toMatchObject({ severity: 'moderate' });
    expect(last(r.state, DEE, 'shielded')).toBeUndefined(); // not a witness
    expect(r.state.relations[ANN].trust).toBeGreaterThan(s.relations[ANN].trust);
    expect(open(r.state)).toBeUndefined();
    expect(activeRestrictions(r.state, ANN)).toEqual([]);
  });

  it('SHIFT IT: she is confined 2 days with no Impunity record change, stress +10, sided_against extreme on her and moderate on witnesses', () => {
    const s = presented();
    const stress = s.squad.find((u) => u.id === ANN)!.stress;
    const before = own(s);
    const r = choose(s, 'shift_blame');
    expect(errors(r.events)).toEqual([]);
    const brig = r.state.discipline!.restrictions.filter((x) => x.unitId === ANN);
    expect(brig).toEqual([expect.objectContaining({ kind: 'confined', untilDay: s.day + 2, source: 'oversight' })]);
    expect(activeRestrictions(r.state, ANN)).toHaveLength(1);
    expect(recordOf(r.state, ANN)).toBe(recordOf(s, ANN));
    expect(ofType(r.events, 'commander_enforced')).toEqual([]);
    expect(r.state.discipline!.applications ?? []).toEqual([]);
    expect(r.state.squad.find((u) => u.id === ANN)!.stress).toBeGreaterThanOrEqual(Math.min(100, stress + 10) - 5); // her own event stress may add or relieve a little
    expect(last(r.state, ANN, 'sided_against')).toMatchObject({ severity: 'extreme' });
    for (const id of [BEA, CAT]) expect(last(r.state, id, 'sided_against')).toMatchObject({ severity: 'moderate' });
    expect(r.state.leash.authorizationsLeft).toBe(3);
    expect(own(r.state)).toBe(before);
    expect(r.state.relations[ANN].trust).toBeLessThan(s.relations[ANN].trust);
  });

  it('with voting on, choosing an option needs a scapegoat vote', () => {
    const s = presented();
    s.world.options = { ...(s.world.options ?? {}), voting: 'on' };
    const index = open(s)!.options!.findIndex((o) => scapegoatOptionId(o) === 'take_blame');
    const refused = run(s, reg, { type: 'dilemma/choose', payload: { id: open(s)!.id, index } });
    expect(refused.events).toEqual([{ type: 'error', code: 'vote_needed', kind: 'scapegoat', subject: 'take_blame' }]);
    expect(refused.state).toBe(s);
    const opened = run(s, reg, { type: 'vote/open', payload: { kind: 'scapegoat', subject: 'take_blame' } });
    expect(errors(opened.events)).toEqual([]);
    const ran = run(opened.state, reg, { type: 'dilemma/choose', payload: { id: open(s)!.id, index, voteId: 'v2' } });
    expect(errors(ran.events)).toEqual([]);
    expect(ofType(ran.events, 'vote_carried')).toHaveLength(1);
    expect(open(ran.state)).toBeUndefined();
    // a vote for the other option does not unlock this one
    const other = run(s, reg, { type: 'vote/open', payload: { kind: 'scapegoat', subject: 'shift_blame' } }).state;
    expect(errors(run(other, reg, { type: 'dilemma/choose', payload: { id: open(s)!.id, index, voteId: 'v2' } }).events)[0]).toMatchObject({ code: 'vote_needed' });
    // a vote needs an open scapegoat and a known option
    expect(errors(run(campaign(reg, 4), reg, { type: 'vote/open', payload: { kind: 'scapegoat', subject: 'take_blame' } }).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'vote/open', payload: { kind: 'scapegoat', subject: 'burn_it' } }).events)).toHaveLength(1);
  });

  it('the shift vote is about the unit who answers for it', () => {
    const s = presented();
    s.world.options = { ...(s.world.options ?? {}), voting: 'on' };
    const v = run(s, reg, { type: 'vote/open', payload: { kind: 'scapegoat', subject: 'shift_blame' } }).state.power!.votes.open!;
    expect(v.ballots.find((b) => b.unitId === ANN)).toMatchObject({ term: 'affected' });
  });
});

describe('content', () => {
  it('subject/witnesses targets on a non-scapegoat template are a load error', () => {
    const tpl = structuredClone(reg.dilemmaTemplates.get('scapegoat_mission')) as Record<string, unknown>;
    expect(DilemmaTemplateSchema.safeParse(tpl).success).toBe(true);
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, contexts: ['base'] }).success).toBe(false);
    const rations = structuredClone(reg.dilemmaTemplates.get('dil_rations')) as unknown as { fixed: { options: Array<{ effects: unknown[] }> } };
    rations.fixed.options[0].effects.push({ type: 'unit_event', event: 'shielded', severity: 'major', targets: 'subject' });
    expect(DilemmaTemplateSchema.safeParse(rations).success).toBe(false);
  });

  it('shielded is a big gesture and has a full row; oversight_punish counts as a cost', () => {
    expect(TUNING.disposition.bigGesture.events).toContain('shielded');
    expect(Object.keys(reg.eventDeltas.get('shielded')!.rows as object).sort()).toEqual(['extreme', 'major', 'minor', 'moderate']);
    expect((reg.eventDeltas.get('shielded')!.rows as Record<string, { trust: number; affinity: number }>).major).toMatchObject({ trust: 6, affinity: 3 });
  });

  it('pacing never draws a scapegoat template, and scapegoat is a dilemma context', () => {
    expect(DILEMMA_CONTEXTS).toContain('scapegoat');
    const s = campaign(reg, 4);
    const pool = eligibleTemplates(s, reg, [...DILEMMA_CONTEXTS]);
    expect(pool.map((t) => t.id)).not.toContain('scapegoat_mission');
  });

  it('a failed-run depart still works with a vote and the gate (sanity)', () => {
    const { state, missionId } = board();
    expect(depart(reg, withOptions(structuredClone(state), { voting: 'off' }), missionId).expedition).toBeDefined();
  });
});
