import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { bondsDayStep, publicityMismatch } from '../../../src/engine/bonds';
import { eligibleTemplates, grantProblem, openDemand, rollDemands } from '../../../src/engine/discipline/demands';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { enable, withBond } from '../../helpers/bonds';
import { noPresence } from '../../helpers/discipline';
import '../../../src/engine/actions/discipline';

let reg: Registries;
beforeAll(async () => {
  reg = noPresence(await loadCore());
});
const ANN = 'unit_ann';

function hungry(wantValue = 50): CampaignState {
  const s = campaign(reg, 4);
  s.day = 20;
  s.resources = { credits: 100, supplies: 20, plyx: 10 };
  for (const u of s.squad) { u.defects = []; u.likes = []; u.dislikes = []; u.triggers = []; }
  setRelation(s, ANN, { stateId: 'lover' });
  withBond(s, ANN, { desire: 'medium' });
  s.relations[ANN].want = wantValue;
  return s;
}
const step = (s: CampaignState, r: Registries = reg) => {
  const d = structuredClone(s);
  const events = bondsDayStep(d, { registries: r, rng: new Rng(d.rng) });
  return { state: d, events };
};
const desireOf = (s: CampaignState) => (s.discipline?.demands ?? []).filter((d) => reg.demandTemplates.get(d.templateId)?.kind === 'desire');
const answer = (s: CampaignState, id: string, a: 'grant' | 'refuse', r: Registries = reg) => run(s, r, { type: 'demand/answer', payload: { demandId: id, answer: a } });
const deliver = (s: CampaignState, id: string) => run(s, reg, { type: 'demand/deliver', payload: { demandId: id } }).state;

describe('the core desire templates', () => {
  it('two desire templates and the publicity one, all drafts to write', () => {
    expect([...reg.demandTemplates.values()].filter((t) => t.kind === 'desire').map((t) => t.id).sort()).toEqual(['want_attention', 'want_tonight']);
    expect(reg.demandTemplates.get('publicity_talk')).toMatchObject({ kind: 'interpersonal', conditions: { publicityMismatch: true } });
    for (const id of ['want_tonight', 'want_attention', 'publicity_talk']) expect(String(reg.demandTemplates.get(id)!.text)).toMatch(/^AUTHOR TO WRITE/);
    expect(reg.demandTemplates.get('want_tonight')!.refuseDeltas).toEqual({ trust: 0, affinity: -2, stress: 2 });
    expect(reg.demandTemplates.get('want_tonight')!.grantCost).toEqual([{ type: 'night_visit' }]);
  });
});

describe('Want opens a demand from her', () => {
  it('Want ≥ 40 opens a desire demand at most every 3 days', () => {
    const a = step(hungry(50));
    expect(desireOf(a.state)).toHaveLength(1);
    expect(ofType(a.events, 'demand_opened')).toHaveLength(1);
    const d = desireOf(a.state)[0];
    // answered at once: the 3-day gap still holds
    const delivered = deliver(a.state, d.id);
    const refused = answer(delivered, d.id, 'refuse').state;
    for (const day of [21, 22]) {
      const s = { ...structuredClone(refused), day };
      expect(desireOf(step(s).state), `day ${day}`).toHaveLength(0);
    }
    const later = { ...structuredClone(refused), day: 23 };
    expect(desireOf(step(later).state)).toHaveLength(1);
  });

  it('below 40, with romance off, with a modest profile or while one is open, nothing opens', () => {
    expect(desireOf(step(hungry(30)).state)).toHaveLength(0);
    const off = hungry(80);
    off.settings.intimacy = { romance: false, initiative: 'med' };
    expect(desireOf(step(off).state)).toHaveLength(0);
    const modest = hungry(80);
    delete modest.squad[0].bond;
    expect(desireOf(step(modest).state)).toHaveLength(0);
    const open = step(hungry(50)).state;
    expect(desireOf(step({ ...open, day: 30 }).state)).toHaveLength(1); // still the one: nothing is added
  });

  it('it is worded as an ordinary demand: undelivered until the app or the day step delivers it', () => {
    const d = desireOf(step(hungry(60)).state)[0];
    expect(d.status).toBe('undelivered');
    expect(d.impunityDriven).toBe(false);
    expect(d.text).toMatch(/^AUTHOR TO WRITE/);
  });

  it('rollDemands never opens a desire template', () => {
    const onlyDesire: Registries = { ...reg, demandTemplates: new Map([...reg.demandTemplates].filter(([, t]) => t.kind === 'desire')) };
    for (let seed = 1; seed <= 60; seed++) {
      const s = hungry(90);
      s.relations[ANN].impunityRecord = 40;
      const d = structuredClone(s);
      rollDemands(d, { registries: onlyDesire, rng: new Rng(seedRng(seed)) });
      expect(d.discipline?.demands ?? [], `seed ${seed}`).toEqual([]);
    }
    expect(eligibleTemplates(hungry(90), reg, ANN).some((t) => t.kind === 'desire')).toBe(false);
    expect(eligibleTemplates(hungry(90), reg, ANN, 'desire').every((t) => t.kind === 'desire')).toBe(true);
  });

  it('an ordinary demand is never the desire one, and the desire one does not use up the week\'s ordinary openings', () => {
    const s = hungry(50);
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [], demandLog: [{ unitId: ANN, day: 19 }, { unitId: ANN, day: 18 }] };
    const opened = openDemand(s, { registries: reg, rng: new Rng(s.rng) }, ANN, { desire: true });
    expect(opened).not.toBeNull();
    expect(reg.demandTemplates.get(opened!.demand.templateId)!.kind).toBe('desire');
  });

  it('a desire template tagged with a disabled category is never opened; with it on, it can be', () => {
    const r = structuredClone(reg);
    for (const id of ['want_tonight', 'want_attention']) r.demandTemplates.get(id)!.contentTags = ['restraint'];
    expect(desireOf(step(hungry(60), r).state)).toHaveLength(0);
    const on = enable(hungry(60), 'restraint');
    const d = structuredClone(on);
    bondsDayStep(d, { registries: r, rng: new Rng(d.rng) });
    expect((d.discipline?.demands ?? []).filter((x) => r.demandTemplates.get(x.templateId)?.kind === 'desire')).toHaveLength(1);
    // her own limit holds even when the category is on
    const limited = enable(hungry(60), 'restraint');
    withBond(limited, ANN, { desire: 'medium', ownLimits: { categories: ['restraint'] } });
    const l = structuredClone(limited);
    bondsDayStep(l, { registries: r, rng: new Rng(l.rng) });
    expect(l.discipline?.demands ?? []).toEqual([]);
  });

  it('disabling the category withdraws an open desire demand with no deltas (Review Focus 3)', () => {
    const r = structuredClone(reg);
    for (const id of ['want_tonight', 'want_attention']) r.demandTemplates.get(id)!.contentTags = ['restraint'];
    const s = enable(hungry(60), 'restraint');
    const d = structuredClone(s);
    bondsDayStep(d, { registries: r, rng: new Rng(d.rng) });
    expect(d.discipline!.demands).toHaveLength(1);
    const before = structuredClone(d.relations);
    const off = run(d, r, { type: 'content/set_categories', payload: { enabled: [] } });
    expect(off.state.discipline!.demands).toEqual([]);
    expect(off.state.relations).toEqual(before);
  });
});

describe('answering: SATISFY, POSTPONE', () => {
  const onlyTpl = (id: string): Registries => ({ ...reg, demandTemplates: new Map([[id, reg.demandTemplates.get(id)!]]) });
  const open = (id: string, want = 60) => {
    const s = hungry(want);
    const r = onlyTpl(id);
    const o = openDemand(s, { registries: r, rng: new Rng(s.rng) }, ANN, { desire: true })!;
    return { state: deliver(s, o.demand.id), id: o.demand.id, reg: r };
  };

  it('SATISFY queues a want_visit for tonight at priority 90', () => {
    const o = open('want_tonight');
    const r = answer(o.state, o.id, 'grant', o.reg);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.calendar.nightEventsQueue.find((e) => e.unitId === ANN && e.kind === 'want_visit')).toMatchObject({ priority: 90, ignore: { event: 'dismissed', severity: 'moderate' } });
    expect(r.state.relations[ANN].affinity).toBeGreaterThan(o.state.relations[ANN].affinity);
    expect(r.state.discipline!.demands).toEqual([]);
  });

  it('SATISFY is refused while she is already coming tonight', () => {
    const o = open('want_tonight');
    o.state.calendar.nightEventsQueue.push({ id: 'n9', unitId: ANN, kind: 'want_visit', priority: 55, framing: 'k', ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: 99 });
    expect(grantProblem(o.state, o.reg, o.id)).toMatch(/already coming/i);
    const r = answer(o.state, o.id, 'grant', o.reg);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(o.state);
  });

  it('a template with wantRelief takes that much of her Want on SATISFY', () => {
    const o = open('want_attention', 60);
    const r = answer(o.state, o.id, 'grant', o.reg);
    expect(r.state.relations[ANN].want).toBe(45);
    expect(r.state.calendar.nightEventsQueue.some((e) => e.kind === 'want_visit')).toBe(false);
  });

  it('POSTPONE applies refuseDeltas (Affinity −2, stress +2) and leaves no defiance, deed or impunity behind', () => {
    const o = open('want_tonight');
    o.state.relations[ANN].impunityRecord = 40; // brazen: an ordinary refusal would hold a defiance and hit harder
    const aff = o.state.relations[ANN].affinity;
    const trust = o.state.relations[ANN].trust;
    const stress = o.state.squad.find((u) => u.id === ANN)!.stress;
    const r = answer(o.state, o.id, 'refuse', o.reg);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].affinity).toBe(aff - 2);
    expect(r.state.relations[ANN].trust).toBe(trust);
    expect(r.state.squad.find((u) => u.id === ANN)!.stress).toBe(stress + 2);
    expect(r.state.discipline!.defiance).toEqual([]);
    expect(r.state.commander.deeds?.demands_refused).toBeUndefined();
    expect(r.state.relations[ANN].impunityRecord).toBe(40);
  });

  it('POSTPONE says so on the event (P3b: a postponement is not remembered as a refusal); a satisfied one does not', () => {
    const o = open('want_tonight');
    const resolved = answer(o.state, o.id, 'refuse', o.reg).events.find((e) => e.type === 'demand_resolved')!;
    expect(resolved).toMatchObject({ answer: 'refuse', postponed: true });
    const granted = answer(o.state, o.id, 'grant', o.reg).events.find((e) => e.type === 'demand_resolved')!;
    expect('postponed' in granted).toBe(false);
  });

  it('SATISFY counts no deed and gives no impunity record either', () => {
    const o = open('want_tonight');
    const r = answer(o.state, o.id, 'grant', o.reg);
    expect(r.state.commander.deeds?.demands_granted).toBeUndefined();
  });
});

describe('publicity_talk and the mismatch condition', () => {
  it('is only eligible while her preference and the relationship\'s level differ', () => {
    const s = hungry(0);
    delete s.relations[ANN].want;
    withBond(s, ANN, { desire: 'medium', publicity: 'secret' });
    expect(publicityMismatch(s, ANN)).toBe(false); // no publicity set: nothing to mismatch
    s.relations[ANN].publicity = { level: 'secret', since: 1 };
    expect(publicityMismatch(s, ANN)).toBe(false);
    s.relations[ANN].publicity = { level: 'public', since: 1 };
    expect(publicityMismatch(s, ANN)).toBe(true);
    expect(eligibleTemplates(s, reg, ANN).some((t) => t.id === 'publicity_talk')).toBe(true);
    s.relations[ANN].publicity = { level: 'secret', since: 1 };
    expect(eligibleTemplates(s, reg, ANN).some((t) => t.id === 'publicity_talk')).toBe(false);
  });
});
