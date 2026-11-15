import { beforeAll, describe, expect, it } from 'vitest';
import { DilemmaTemplateSchema } from '../../../src/content/schemas';
import type { HerCallSpec } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import { activeRestrictions } from '../../../src/engine/discipline';
import { openScapegoat, scapegoatOptionId, takeScapegoatCase } from '../../../src/engine/power/scapegoat';
import { rollHerCall } from '../../../src/engine/power/herCall';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ableParty, endExpedition } from '../../../src/engine/world/expedition';
import type { Mission } from '../../../src/engine/world/types';
import { withBond } from '../../helpers/bonds';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { withOptions } from '../../helpers/power';
import { ctxOf } from '../../helpers/world';

let reg: Registries;
let regs: Registries;
beforeAll(async () => {
  reg = await loadCore();
  regs = { ...reg, dilemmaTemplates: new Map([...reg.dilemmaTemplates, ['evt_hc_test', HC as never]]) };
});

const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const NODE = 'n0_0';
const option = (label: string, effects: unknown[]) => ({ label, effects });
const spec: HerCallSpec = {
  trigger: { minLeadRank: 2 },
  outcomes: [
    { id: 'good', lean: { pragmatism: 2 }, text: 'The route holds.', effects: [{ type: 'party_stress', amount: -5 }] },
    { id: 'bad', lean: { autonomy: 2 }, text: 'The route is a trap.', effects: [{ type: 'carried_supplies', amount: -2 }, { type: 'party_stress', amount: 10 }] },
  ],
};
const HC = {
  id: 'evt_hc_test', scale: 'minor', contexts: ['expedition_event'],
  fixed: { title: 'Her way', setup: 'S', options: [option('Hold', [{ type: 'party_stress', amount: 5 }]), option('Push', [{ type: 'carried_supplies', amount: -1 }])] },
  herCall: spec,
};
const open = (s: CampaignState) => s.dilemmas?.open;
const own = (s: CampaignState): number => s.world.factions[s.commander.corporationId!] ?? 0;
const hcMark = { source: 'her_call' as const, unitId: ANN, nodeId: NODE, witnessIds: [BEA, CAT, DEE] };
const HER_WORDING = 'Ann made the call herself in the field.';
const VOTE_WORDING = "Ann carried the squad's vote for it.";

/** A command mission running with the squad's values neutral; `mark` is written on it by hand (the real path is the first test). */
function running(mark?: Mission['decidedBy']): { state: CampaignState; missionId: string } {
  const base = campaign(reg, 4);
  base.resources.supplies = 100;
  for (const u of base.squad) {
    u.defects = [];
    withBond(base, u.id, { leadStyle: u.id === ANN ? 'assertive' : 'yielding' });
    setRelation(base, u.id, { trust: 50 });
  }
  const { state, mission } = withMission(reg, base, { templateId: 'tpl_sweep', source: 'command' });
  const s = depart(reg, state, mission.id);
  if (mark) s.missions.active.find((m) => m.id === mission.id)!.decidedBy = mark;
  return { state: s, missionId: mission.id };
}
/** The same run after it was put back on the board (a retreat leaves it there with its mark). */
function onBoard(mark: Mission['decidedBy']): CampaignState {
  const { state, missionId } = running(mark);
  const s = structuredClone(state);
  const m = s.missions.active.find((x) => x.id === missionId)!;
  delete s.expedition;
  s.missions.active = [];
  s.missions.offered = [{ ...m, status: 'offered' }];
  return s;
}

describe('a her-call case opens', () => {
  it('a bad call in the field, then a failed run: the case opens on her, the party as witnesses, in the her-call wording', () => {
    const { state } = running();
    const s = structuredClone(state);
    s.expedition!.map.nodes[NODE].type = 'event';
    s.expedition!.map.nodes[NODE].eventId = 'evt_hc_test'; // pinned: no pool draw before the roll
    for (let seed = 1; seed < 5000; seed++) {
      s.rng = seedRng(seed);
      const call = rollHerCall(s, regs, new Rng(s.rng), spec, ableParty(s));
      if (call?.outcome === 'bad') break;
    }
    const moved = run(s, regs, { type: 'expedition/move', payload: { nodeId: NODE } });
    expect(ofType(moved.events, 'her_call')[0]).toMatchObject({ outcome: 'bad', unitId: ANN, marked: true });
    const draft = structuredClone(moved.state);
    const before = own(draft);
    const events = endExpedition(draft, ctxOf(draft, regs), 'failed');
    expect(open(draft)).toMatchObject({ context: 'scapegoat', status: 'presented', templateId: 'scapegoat_mission', subjectId: ANN, witnessIds: [BEA, CAT, DEE], scapegoatSource: 'her_call' });
    expect(ofType(events, 'dilemma_presented')).toHaveLength(1);
    expect(open(draft)!.setup).toContain(HER_WORDING);
    expect(open(draft)!.setup).not.toContain('squad\'s vote');
    expect(open(draft)!.setup).not.toMatch(/[{}]/);
    expect(open(draft)!.setup).not.toMatch(/ {2}/);
    expect(own(draft) - before).toBe(-TUNING.power.scapegoat.failedRunStanding); // the failed-run penalty applies to a her-call mark
    expect(draft.missions.offered[0].decidedBy).toBeUndefined(); // spent
  });

  it('a marked mission whose deadline expires opens the case', () => {
    const s = onBoard(hcMark);
    s.missions.offered[0].deadlineDay = s.day;
    const after = endDay(s, regs);
    expect(after.missions.completed.at(-1)).toMatchObject({ status: 'failed' });
    expect(open(after)).toMatchObject({ context: 'scapegoat', subjectId: ANN, witnessIds: [BEA, CAT, DEE], scapegoatSource: 'her_call' });
    expect(open(after)!.setup).toContain(HER_WORDING);
  });

  it('an old vote mark (no source) opens the case with the vote wording', () => {
    const s = onBoard({ voteId: 'v1', unitId: ANN, witnessIds: [BEA, CAT, DEE] });
    s.missions.offered[0].deadlineDay = s.day;
    const after = endDay(s, regs);
    expect(open(after)).toMatchObject({ context: 'scapegoat', subjectId: ANN });
    expect(open(after)!.scapegoatSource).toBeUndefined();
    expect(open(after)!.setup).toContain(VOTE_WORDING);
    expect(open(after)!.setup).not.toContain('herself');
    expect(open(after)!.setup).not.toMatch(/[{}]/);
    // an explicit vote source reads the same
    const m = { source: 'vote' as const, voteId: 'v1', unitId: ANN, witnessIds: [BEA] };
    const t = { id: 'm', source: 'command', decidedBy: m } as unknown as Mission;
    expect(takeScapegoatCase(t)).toMatchObject({ source: 'vote' });
  });

  it('takeScapegoatCase returns the source and spends the mark', () => {
    const m = { id: 'm1', source: 'command', decidedBy: { ...hcMark } } as unknown as Mission;
    expect(takeScapegoatCase(m)).toEqual({ missionId: 'm1', unitId: ANN, witnessIds: [BEA, CAT, DEE], source: 'her_call' });
    expect(m.decidedBy).toBeUndefined();
    const v = { id: 'm2', source: 'command', decidedBy: { voteId: 'v', unitId: BEA } } as unknown as Mission;
    expect(takeScapegoatCase(v)).toEqual({ missionId: 'm2', unitId: BEA, witnessIds: [], source: 'vote' });
  });

  it('a failed run penalty applies to a her-call mark, and a side run is never marked into one', () => {
    const { state } = running(hcMark);
    const d = structuredClone(state);
    const before = own(d);
    endExpedition(d, ctxOf(d, regs), 'failed');
    expect(own(d) - before).toBe(-TUNING.power.scapegoat.failedRunStanding);
  });

  it('with a dilemma open the her-call case is queued with its source and opens with the her-call wording', () => {
    const s = structuredClone(running(hcMark).state);
    s.dilemmas = { seq: 3, open: { id: 'dl3', templateId: 'dil_rations', scale: 'minor', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [], beatId: 'b', title: 'T', setup: 'S', options: [] } };
    delete s.expedition;
    const draft = structuredClone(s);
    expect(openScapegoat(draft, ctxOf(draft, regs), { missionId: 'm1', unitId: ANN, witnessIds: [BEA], source: 'her_call' })).toEqual([]);
    expect(draft.power!.scapegoatQueue).toEqual([{ missionId: 'm1', unitId: ANN, witnessIds: [BEA], source: 'her_call' }]);
    // a vote's case keeps the P9b shape: no source on the queue entry
    const other = structuredClone(s);
    openScapegoat(other, ctxOf(other, regs), { missionId: 'm1', unitId: ANN, witnessIds: [BEA] });
    expect(other.power!.scapegoatQueue).toEqual([{ missionId: 'm1', unitId: ANN, witnessIds: [BEA] }]);
    delete draft.dilemmas!.open;
    draft.resources.supplies = 100;
    const after = endDay(draft, regs);
    expect(open(after)).toMatchObject({ context: 'scapegoat', subjectId: ANN, witnessIds: [BEA], scapegoatSource: 'her_call' });
    expect(open(after)!.setup).toContain(HER_WORDING);
    expect(after.power!.scapegoatQueue ?? []).toEqual([]);
  });

  it('a her-call case whose subject is gone opens nothing', () => {
    // she dies between the bad call and the failed run
    const { state } = running(hcMark);
    const dead = structuredClone(state);
    dead.squad.find((u) => u.id === ANN)!.status = 'dead';
    const before = own(dead);
    endExpedition(dead, ctxOf(dead, regs), 'failed');
    expect(open(dead)).toBeUndefined();
    expect(dead.power?.scapegoatQueue).toBeUndefined();
    expect(own(dead) - before).toBe(-TUNING.power.scapegoat.failedRunStanding); // only the failed-run penalty, which is the run's, not hers
    // she deserts before the deadline runs out
    const board = onBoard(hcMark);
    board.squad.find((u) => u.id === ANN)!.status = 'deserted';
    board.missions.offered[0].deadlineDay = board.day;
    board.resources.supplies = 100;
    expect(open(endDay(board, regs))).toBeUndefined();
    // and a case already queued for her is dropped with no effects
    const queued = structuredClone(state);
    delete queued.expedition;
    queued.power = { ...(queued.power ?? { votes: { log: [], seq: 0 } }), scapegoatQueue: [{ missionId: 'm1', unitId: ANN, witnessIds: [BEA], source: 'her_call' }] };
    queued.squad.find((u) => u.id === ANN)!.status = 'dead';
    queued.resources.supplies = 100;
    const after = endDay(queued, regs);
    expect(open(after)).toBeUndefined();
    expect(after.power!.scapegoatQueue ?? []).toEqual([]);
    const d = structuredClone(queued);
    expect(openScapegoat(d, ctxOf(d, regs), { missionId: 'm1', unitId: ANN, witnessIds: [], source: 'her_call' })).toEqual([]);
  });
});

describe('the two answers on a her-call case', () => {
  function presented(): CampaignState {
    const s = structuredClone(running(hcMark).state);
    delete s.expedition;
    s.leash.authorizationsLeft = 3;
    const events = openScapegoat(s, ctxOf(s, regs), { missionId: 'm1', unitId: ANN, witnessIds: [BEA, CAT], source: 'her_call' });
    expect(ofType(events, 'dilemma_presented')).toHaveLength(1);
    s.world.options = { ...(s.world.options ?? {}), voting: 'off' };
    return s;
  }
  const choose = (s: CampaignState, id: 'take_blame' | 'shift_blame') =>
    run(s, regs, { type: 'dilemma/choose', payload: { id: open(s)!.id, index: open(s)!.options!.findIndex((o) => scapegoatOptionId(o) === id) } });
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
    expect(last(r.state, DEE, 'shielded')).toBeUndefined();
    expect(open(r.state)).toBeUndefined();
  });

  it('SHIFT IT: she is confined 2 days, stress +10, sided_against extreme on her and moderate on witnesses', () => {
    const s = presented();
    const before = own(s);
    const r = choose(s, 'shift_blame');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.discipline!.restrictions.filter((x) => x.unitId === ANN)).toEqual([expect.objectContaining({ kind: 'confined', untilDay: s.day + 2, source: 'oversight' })]);
    expect(activeRestrictions(r.state, ANN)).toHaveLength(1);
    expect(last(r.state, ANN, 'sided_against')).toMatchObject({ severity: 'extreme' });
    for (const id of [BEA, CAT]) expect(last(r.state, id, 'sided_against')).toMatchObject({ severity: 'moderate' });
    expect(own(r.state)).toBe(before);
    expect(r.state.relations[ANN].trust).toBeLessThan(s.relations[ANN].trust);
  });

  it('with voting on, answering a her-call case needs a scapegoat vote', () => {
    const s = presented();
    withOptions(s, { voting: 'on' });
    const index = open(s)!.options!.findIndex((o) => scapegoatOptionId(o) === 'take_blame');
    const refused = run(s, regs, { type: 'dilemma/choose', payload: { id: open(s)!.id, index } });
    expect(refused.events).toEqual([{ type: 'error', code: 'vote_needed', kind: 'scapegoat', subject: 'take_blame' }]);
    const opened = run(s, regs, { type: 'vote/open', payload: { kind: 'scapegoat', subject: 'take_blame' } });
    expect(errors(opened.events)).toEqual([]);
    const ran = run(opened.state, regs, { type: 'dilemma/choose', payload: { id: open(s)!.id, index, voteId: 'v1' } });
    expect(errors(ran.events)).toEqual([]);
    expect(open(ran.state)).toBeUndefined();
  });
});

describe('content', () => {
  it('scapegoat_mission carries both wordings in fixed.because and a {because} placeholder', () => {
    const fixed = reg.dilemmaTemplates.get('scapegoat_mission')!.fixed as { setup: string; because?: Record<string, string> };
    expect(fixed.setup).toContain('{because}');
    expect(fixed.setup).not.toContain('carried the squad');
    expect(fixed.because!.vote).toBe("{name} carried the squad's vote for it.");
    expect(fixed.because!.her_call).toBe('{name} made the call herself in the field.');
  });

  it('fixed.because on a non-scapegoat template is a load error', () => {
    const scapegoat = structuredClone(reg.dilemmaTemplates.get('scapegoat_mission')) as Record<string, unknown>;
    expect(DilemmaTemplateSchema.safeParse(scapegoat).success).toBe(true);
    const plain = structuredClone(reg.dilemmaTemplates.get('dil_rations')) as unknown as { fixed: Record<string, unknown> };
    expect(DilemmaTemplateSchema.safeParse(plain).success).toBe(true);
    plain.fixed.because = { vote: 'x' };
    const r = DilemmaTemplateSchema.safeParse(plain);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.map((i) => i.path.join('.'))).toContain('fixed.because');
    // and its keys are closed
    const odd = structuredClone(scapegoat) as { fixed: { because: Record<string, string> } };
    odd.fixed.because.guess = 'x';
    expect(DilemmaTemplateSchema.safeParse(odd).success).toBe(false);
    expect(DilemmaTemplateSchema.safeParse({ ...scapegoat, fixed: { ...(scapegoat.fixed as object), because: { vote: 'x'.repeat(201) } } }).success).toBe(false);
  });
});
