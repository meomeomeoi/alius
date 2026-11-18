import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { removeFromService } from '../../src/engine/leash/use';
import { Rng, seedRng } from '../../src/engine/rng';
import { debtsChoice, openOversightCase, openQueuedCases, openUnitCase, rollUnitDiscovery } from '../../src/engine/special/debts/discovery';
import { answerVisit } from '../../src/engine/special/debts/intel';
import { HANDLER_UNIT, HANDLER_VISIT_KIND, type IntelItem } from '../../src/engine/special/state';
import type { CampaignState } from '../../src/engine/state/types';
import { endDay } from '../helpers/loyalty';
import { loadCore, run } from '../helpers/world';
import { ANN, BEA, CAT, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const debts = (s: CampaignState) => s.special!.debts!;
const fresh = (): CampaignState => {
  const s = specialCampaign(reg, 'web_of_debts');
  for (const id of [ANN, BEA, CAT]) s.relations[id].trust = 80;
  return s;
};
const history = (s: CampaignState, id: string, type: string) => s.relations[id].history.filter((h) => h.type === type);
const open = (s: CampaignState) => s.dilemmas?.open;
const choose = (s: CampaignState, optionId: string): { state: CampaignState; events: Array<{ type: string }> } => {
  const d = open(s)!;
  const index = d.options!.findIndex((o) => o.id === optionId);
  expect(index, optionId).toBeGreaterThanOrEqual(0);
  const r = run(s, reg, { type: 'dilemma/choose', payload: { id: d.id, index } });
  expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
  return { state: r.state, events: r.events };
};

describe('discovery by oversight', () => {
  it('opens the fixed defining dilemma, once, with the three options by id', () => {
    const s = fresh();
    expect(openOversightCase(s, ctxOf(s)).some((e) => e.type === 'dilemma_presented')).toBe(true);
    const d = open(s)!;
    expect(d).toMatchObject({ context: 'debts_oversight', scale: 'defining', status: 'presented' });
    expect(d.options!.map((o) => o.id)).toEqual(['double_agent', 'confess', 'flee']);
    expect(`${d.title} ${d.setup}`).not.toMatch(/\b(he|him|his)\b/i);
    expect(`${d.title} ${d.setup} ${d.options!.map((o) => o.label).join(' ')}`).not.toMatch(/[{}]/);
  });

  it('the day step opens it at 100 (or queues it behind another dilemma)', () => {
    const s = fresh();
    s.slot = 'morning';
    debts(s).oversightSuspicion = 100;
    const t = endDay(s, reg);
    const queued = debts(t).caseQueue?.some((c) => c.kind === 'oversight') === true;
    expect(open(t)?.context === 'debts_oversight' || queued).toBe(true);
    const calm = fresh();
    calm.slot = 'morning';
    debts(calm).oversightSuspicion = 99;
    const c = endDay(calm, reg);
    expect(open(c)?.context).not.toBe('debts_oversight');
    expect(debts(c).caseQueue ?? []).toEqual([]);
  });

  it('every option sets defector_arc and its outcome flag and opens the thread; flee ends it; double agent resets both clocks to 30', () => {
    for (const [id, flag] of [['double_agent', 'defector_double_agent'], ['confess', 'defector_confessed'], ['flee', 'defector_fled']] as const) {
      const s = fresh();
      debts(s).oversightSuspicion = 100;
      debts(s).handlerSuspicion = 70;
      openOversightCase(s, ctxOf(s));
      const r = choose(s, id);
      expect(r.state.world.flags, id).toEqual(expect.arrayContaining(['defector_arc', flag]));
      expect(r.state.world.threads.find((t) => t.id === 'defector_arc'), id).toMatchObject({ status: 'open' });
      expect(r.events.find((e) => e.type === 'defector_arc'), id).toEqual({ type: 'defector_arc', outcome: id });
      const d = debts(r.state);
      if (id === 'double_agent') {
        expect(d).toMatchObject({ oversightSuspicion: 30, handlerSuspicion: 30 });
        expect(d.ended).toBeUndefined();
      } else expect(d.ended).toBe(id === 'flee' ? 'fled' : 'confessed');
    }
  });

  it('confess reveals the crime to everyone and costs standing and a Leash authorization; flee sets the own corporation against the commander', () => {
    const s = fresh();
    openOversightCase(s, ctxOf(s));
    const own = s.commander.corporationId!;
    const standing = s.world.factions[own] ?? 0;
    const left = s.leash.authorizationsLeft;
    const c = choose(s, 'confess').state;
    for (const u of c.squad.filter((x) => x.kind === 'named')) expect(c.relations[u.id].flags, u.id).toContain('knows_crime');
    expect(c.world.factions[own] ?? 0).toBe(standing - 20);
    expect(c.leash.authorizationsLeft).toBe(Math.max(0, left - 1));
    const f = fresh();
    openOversightCase(f, ctxOf(f));
    const rival = debts(f).corporationId;
    const rivalBefore = f.world.factions[rival] ?? 0;
    const fled = choose(f, 'flee').state;
    expect(fled.world.factions[own] ?? 0).toBeLessThanOrEqual(-50);
    expect(fled.world.factions[rival] ?? 0).toBe(rivalBefore + 20);
  });
});

describe('discovery by a unit', () => {
  const watcher = (s: CampaignState, id = ANN): CampaignState => { s.squad.find((u) => u.id === id)!.defects = [{ id: 'threat_saturation', origin: 'x' } as never]; return s; };
  const items: IntelItem[] = [{ id: `squad:${BEA}`, kind: 'squad', refId: BEA, label: 'x' }];
  const visiting = (s: CampaignState): CampaignState => {
    debts(s).visit = { id: 'hv1', day: s.day, items };
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n_v', unitId: HANDLER_UNIT, kind: HANDLER_VISIT_KIND, priority: 6, framing: 'x', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: s.day + 2 };
    return s;
  };
  const answerWith = (s: CampaignState, seed: number) => {
    const t = structuredClone(s);
    t.rng = seedRng(seed);
    const r = run(t, reg, { type: 'debts/answer_visit', payload: { visitId: 'hv1', answers: { [items[0].id]: 'withhold' } } });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    return r;
  };

  it('a watcher with a night-aware defect discovers on a visit night: flag, a moderate hit, her case', () => {
    let hit: ReturnType<typeof answerWith> | null = null;
    for (let seed = 1; seed < 120 && !hit; seed++) {
      const r = answerWith(visiting(watcher(fresh())), seed);
      if (r.events.some((e) => e.type === 'debts_discovered')) hit = r;
    }
    expect(hit).not.toBeNull();
    const s = hit!.state;
    expect(hit!.events.find((e) => e.type === 'debts_discovered')).toEqual({ type: 'debts_discovered', unitId: ANN });
    expect(s.relations[ANN].flags).toContain('knows_debts');
    expect(history(s, ANN, 'debts_exposed')).toMatchObject([{ severity: 'moderate' }]);
    expect(debts(s).discoveredBy).toBe(ANN);
    expect(open(s)).toMatchObject({ context: 'debts_unit', scale: 'major', status: 'presented', subjectId: ANN });
    expect(open(s)!.options!.map((o) => o.id)).toEqual(['report', 'protect_commander', 'demand']);
  });

  it('nobody qualifies without a night-aware defect or stress 60: no draw', () => {
    const s = visiting(fresh());
    const c = ctxOf(s);
    expect(rollUnitDiscovery(s, c)).toEqual([]);
    expect(c.rng.state).toEqual(s.rng);
    s.squad.find((u) => u.id === ANN)!.stress = 60;
    const c2 = ctxOf(s);
    rollUnitDiscovery(s, c2);
    expect(c2.rng.state).not.toEqual(s.rng); // stress 60 qualifies: she is drawn for
  });

  it('a unit who already knows, or one confined elsewhere, is not drawn for', () => {
    const s = watcher(fresh());
    s.relations[ANN].flags.push('knows_debts');
    const c = ctxOf(s);
    expect(rollUnitDiscovery(s, c)).toEqual([]);
    expect(c.rng.state).toEqual(s.rng);
  });

  it('at most one unit discovery per visit', () => {
    let checked = 0;
    for (let seed = 1; seed < 200 && checked < 8; seed++) {
      const s = visiting(watcher(watcher(fresh(), ANN), BEA));
      const r = answerWith(s, seed);
      const found = r.events.filter((e) => e.type === 'debts_discovered');
      expect(found.length).toBeLessThanOrEqual(1);
      if (found.length === 1) {
        checked += 1;
        const knowers = r.state.squad.filter((u) => r.state.relations[u.id]?.flags.includes('knows_debts'));
        expect(knowers).toHaveLength(1);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a lapsed visit rolls too (the watchers were awake)', () => {
    let any = false;
    for (let seed = 1; seed < 120 && !any; seed++) {
      const s = watcher(fresh());
      debts(s).visit = { id: 'hv1', day: s.day - 1, items };
      s.rng = seedRng(seed);
      const events = run(s, reg, { type: 'calendar/consume_slot' }).events; // not a day end: nothing
      expect(events.some((e) => e.type === 'debts_discovered')).toBe(false);
      const t = endDay(structuredClone({ ...s, slot: 'morning' as const }), reg);
      if (t.relations[ANN].flags.includes('knows_debts')) any = true;
    }
    expect(any).toBe(true);
  });
});

describe('her case', () => {
  const caseFor = (): CampaignState => {
    const s = fresh();
    s.relations[ANN].flags.push('knows_debts');
    openUnitCase(s, ctxOf(s), ANN);
    expect(open(s)?.context).toBe('debts_unit');
    return s;
  };

  it('report adds 40 to oversight\'s suspicion', () => {
    const s = caseFor();
    debts(s).oversightSuspicion = 10;
    expect(debts(choose(s, 'report').state).oversightSuspicion).toBe(50);
  });

  it('protect_commander keeps a squad secret of source debts known by her alone', () => {
    const s = choose(caseFor(), 'protect_commander').state;
    const secret = s.personal!.secrets!.find((x) => x.knownBy.includes(ANN))!;
    expect(reg.secretKinds.get(secret.kindId)!.source).toBe('debts');
    expect(secret).toMatchObject({ status: 'kept', knownBy: [ANN], subjectId: ANN });
    expect(secret.text).toContain('Ann');
    expect(secret.text).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('demand opens an owed demand for her', () => {
    const s = choose(caseFor(), 'demand').state;
    const d = s.discipline?.demands.find((x) => x.unitId === ANN);
    expect(d).toBeDefined();
    expect(d!.owed).toBe(true);
  });

  it('queued while another dilemma is open, and opened at a later day end', () => {
    const s = fresh();
    s.relations[ANN].flags.push('knows_debts');
    s.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 'x', scale: 'minor', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [], beatId: 'b', options: [] } } as never;
    expect(openUnitCase(s, ctxOf(s), ANN)).toEqual([]);
    expect(debts(s).caseQueue).toEqual([{ kind: 'unit', unitId: ANN }]);
    expect(openQueuedCases(s, ctxOf(s))).toEqual([]); // still busy
    delete (s.dilemmas as { open?: unknown }).open;
    expect(openQueuedCases(s, ctxOf(s)).some((e) => e.type === 'dilemma_presented')).toBe(true);
    expect(open(s)).toMatchObject({ context: 'debts_unit', subjectId: ANN });
    expect(debts(s).caseQueue ?? []).toEqual([]);
  });

  it('a terminated subject\'s case never opens', () => {
    const s = fresh();
    s.relations[ANN].flags.push('knows_debts');
    s.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 'x', scale: 'minor', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [], beatId: 'b', options: [] } } as never;
    openUnitCase(s, ctxOf(s), ANN);
    delete (s.dilemmas as { open?: unknown }).open;
    removeFromService(s, ANN, 'terminated');
    expect(openQueuedCases(s, ctxOf(s))).toEqual([]);
    expect(open(s)).toBeUndefined();
    // a case for a unit who is gone is refused outright
    expect(openUnitCase(s, ctxOf(s), ANN)).toEqual([]);
    expect(open(s)).toBeUndefined();
  });

  it('debtsChoice ignores a dilemma that is not a debts one', () => {
    const s = fresh();
    expect(debtsChoice(s, ctxOf(s), 'base', 'report', undefined)).toEqual([]);
    expect(debts(s).oversightSuspicion).toBe(0);
  });
});
