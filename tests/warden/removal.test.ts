import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type EngineCtx, type EngineEvent } from '../../src/engine/dispatch';
import { removeFromService } from '../../src/engine/leash/use';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { hackStep, kompromatOf, openQueuedReport, reportChance, startRemoval, wardenDayStep, wardenGone, wardenOf, wardenReportChoice } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/dilemma';
import '../../src/engine/actions/scene';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat', dee: 'unit_dee' };
function swap(over: (s: CampaignState) => void = () => {}): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
    units: [unitSetup('Ann'), unitSetup('Bea'), unitSetup('Cat', { roleId: 'specialist' }), unitSetup('Dee')],
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 9 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  over(out.state);
  return out.state;
}
class Fixed extends Rng {
  constructor(state: ReturnType<typeof seedRng>, private readonly answer: boolean) { super(state); }
  override chance(): boolean { return this.answer; }
}
const fixed = (answer: boolean, seed = 3): EngineCtx => ({ registries: reg, rng: new Fixed(seedRng(seed), answer) });
const real = (seed = 3): EngineCtx => ({ registries: reg, rng: new Rng(seedRng(seed)) });
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const count = (events: EngineEvent[], type: string) => events.filter((e) => e.type === type).length;
const kompromat = (s: CampaignState, n: number): void => {
  for (let i = 0; i < n; i++) s.memory.facts.push({ id: `k${i}`, about: [ID.bea], text: `Kompromat ${i}.`, tags: ['kompromat'], importance: 3, day: 1, knownBy: ['commander'], pinned: true });
};
const clock = (s: CampaignState) => s.world.clocks.find((c) => c.id === 'investigation');

describe('the hack route', () => {
  it('the third clean step: removal with a 10-segment clock, remote control and the investigation', () => {
    const s = swap((x) => {
      x.base.facilities.workshop = 3; x.base.facilities.medbay = 3; x.resources.plyx = 50;
      x.relations[ID.cat].flags.push('warden_ally');
      x.leashswap!.intrigue.hack.step = 2;
    });
    s.slot = 'morning';
    const events = hackStep(s, fixed(false), ID.cat);
    expect(types(events)).toEqual(expect.arrayContaining(['controller_dark', 'warden_removed', 'investigation_opened', 'remote_control_started']));
    const ls = s.leashswap!;
    expect(ls.status).toBe('investigation');
    expect(ls.warden).toBeUndefined();
    expect(wardenOf(s)).toBeNull();
    expect(ls.removal).toEqual({ route: 'hack', day: s.day, clockId: 'investigation', unitId: ID.bea });
    expect(ls.remote).toEqual({ sinceDay: s.day });
    expect(clock(s)).toMatchObject({ segments: 10, filled: 0, visibleToPlayer: false, engine: true }); // not on the map: its length would give the route away
    expect(s.commander.flags).toContain('commander_implant_dark');
    expect(ls.intrigue.hack.step).toBe(0);
  });

  it.each([['hack', 10], ['report', 6], ['death', 4]] as const)('route %s opens a clock of %i segments', (route, segments) => {
    const s = swap();
    startRemoval(s, real(), route);
    expect(clock(s)!.segments).toBe(segments);
    expect(s.leashswap!.removal!.route).toBe(route);
  });

  it('a removal starts once: a second route does nothing', () => {
    const s = swap();
    expect(startRemoval(s, real(), 'hack')).not.toEqual([]);
    expect(startRemoval(s, real(), 'death')).toEqual([]);
    expect(s.leashswap!.removal!.route).toBe('hack');
  });
});

describe('the report to oversight', () => {
  const act = (s: CampaignState) => dispatch(s, { type: 'intrigue/report', payload: {} }, reg);
  const submit = (s: CampaignState) => dispatch(s, { type: 'dilemma/choose', payload: { id: s.dilemmas!.open!.id, index: s.dilemmas!.open!.options!.findIndex((o) => o.id === 'submit') } }, reg);

  it('needs 3 kompromat facts', () => {
    const s = swap();
    kompromat(s, 2);
    const r = act(s);
    expect(r.events.find((e) => e.type === 'error')).toBeDefined();
    expect(r.state).toBe(s);
    s.memory.facts.push({ id: 'k9', about: [ID.bea], text: 'More.', tags: ['kompromat'], importance: 3, day: 1, knownBy: ['commander'] });
    expect(kompromatOf(s)).toHaveLength(3);
    const ok = act(s);
    expect(ok.events.find((e) => e.type === 'error')).toBeUndefined();
    expect(ok.state.dilemmas?.open).toMatchObject({ context: 'warden_report', scale: 'defining', status: 'presented' });
    expect(ok.state.slot).toBe(s.slot); // no slot
  });

  it('the dilemma template is fixed, with the options submit and withdraw', () => {
    const t = [...reg.dilemmaTemplates.values()].find((x) => (x.contexts as string[]).includes('warden_report'))!;
    expect(t.scale).toBe('defining');
    expect(((t.fixed as { options: Array<{ id: string }> }).options).map((o) => o.id)).toEqual(['submit', 'withdraw']);
  });

  it('reportChance is clamp(0.4 + 0.1 × (kompromat − 3) + 0.05 × (Cunning − 1), 0.1, 0.85)', () => {
    const s = swap((x) => { x.commander.socialStats.cunning = 1; });
    kompromat(s, 3);
    expect(reportChance(s, reg)).toBeCloseTo(0.4, 6);
    s.commander.socialStats.cunning = 3;
    kompromat(s, 0);
    s.memory.facts.push({ id: 'k8', about: [ID.bea], text: 'X.', tags: ['kompromat'], importance: 3, day: 1, knownBy: ['commander'] });
    expect(reportChance(s, reg)).toBeCloseTo(0.4 + 0.1 + 0.1, 6);
    s.commander.socialStats.cunning = 5;
    for (let i = 0; i < 6; i++) s.memory.facts.push({ id: `kk${i}`, about: [ID.bea], text: `Y${i}.`, tags: ['kompromat'], importance: 3, day: 1, knownBy: ['commander'] });
    expect(reportChance(s, reg)).toBe(0.85);
  });

  it('submit, on a hit: she is reassigned, the report route opens and the world flag is set', () => {
    const s = swap((x) => kompromat(x, 3));
    const rig = structuredClone(act(s).state);
    const events = wardenReportAnswer(rig, fixed(true));
    expect(types(events)).toEqual(expect.arrayContaining(['warden_removed', 'investigation_opened']));
    expect(rig.squad.find((u) => u.id === ID.bea)!.status).toBe('reassigned');
    expect(rig.leashswap!.removal!.route).toBe('report');
    expect(rig.world.flags).toContain('warden_reassigned');
    expect(clock(rig)!.segments).toBe(6);
    expect(count(events, 'warden_removed')).toBe(1); // once, not once for the status and once for the route
  });

  it('submit, on a miss: a discovery, and she is still the warden', () => {
    const s = swap((x) => kompromat(x, 3));
    const rig = structuredClone(act(s).state);
    const events = wardenReportAnswer(rig, fixed(false));
    expect(types(events)).toEqual(expect.arrayContaining(['intrigue_discovered', 'commander_punished']));
    expect(wardenOf(rig)).not.toBeNull();
    expect(rig.leashswap!.removal).toBeUndefined();
  });

  it('through dispatch: the dilemma is answered and exactly one of the two outcomes lands', () => {
    const s = swap((x) => kompromat(x, 3));
    const opened = act(s).state;
    const r = submit(opened);
    expect(r.events.find((e) => e.type === 'error')).toBeUndefined();
    const reassigned = r.state.leashswap!.removal?.route === 'report';
    const discovered = types(r.events).includes('intrigue_discovered');
    expect(reassigned !== discovered).toBe(true);
    expect(r.state.dilemmas?.open).toBeUndefined();
  });

  it('withdraw does nothing', () => {
    const s = swap((x) => kompromat(x, 3));
    const opened = act(s).state;
    const idx = opened.dilemmas!.open!.options!.findIndex((o) => o.id === 'withdraw');
    const r = dispatch(opened, { type: 'dilemma/choose', payload: { id: opened.dilemmas!.open!.id, index: idx } }, reg);
    expect(types(r.events)).not.toContain('intrigue_discovered');
    expect(wardenOf(r.state)).not.toBeNull();
  });

  it('the warden does not countermand the report on her', () => {
    const s = swap((x) => { kompromat(x, 3); wardenOf(x)!.expectations = [{ id: 'x', kind: 'obey_oversight', weight: 1, source: 'values', known: false }]; wardenOf(x)!.satisfaction = 0; });
    const opened = act(s).state;
    const r = submit(opened);
    expect(types(r.events)).not.toContain('warden_override');
  });

  it('the report case is queued while another dilemma is open and opens at a later day end', () => {
    const s = swap((x) => {
      kompromat(x, 3);
      x.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 't', scale: 'major', context: 'base', day: 1, status: 'presented', attempts: 0, units: [], beatId: 'b', title: 'T', setup: 'S', options: [{ label: 'A', effects: [], magnitudes: [] }] } };
    });
    const r = act(s);
    expect(r.events.find((e) => e.type === 'error')).toBeUndefined();
    expect(r.state.leashswap!.intrigue.reportQueued).toBe(true);
    expect(r.state.dilemmas!.open!.id).toBe('dl1');
    expect(() => { const d = structuredClone(r.state); dispatch(d, { type: 'intrigue/report', payload: {} }, reg); }).not.toThrow();
    expect(act(r.state).events.find((e) => e.type === 'error')).toBeDefined(); // not twice
    // still open: nothing happens at the day end
    const d1 = structuredClone(r.state);
    expect(openQueuedReport(d1, real())).toEqual([]);
    expect(d1.leashswap!.intrigue.reportQueued).toBe(true);
    // the first decision is answered: the report opens
    delete d1.dilemmas!.open;
    wardenDayStep(d1, real());
    expect(d1.dilemmas!.open).toMatchObject({ context: 'warden_report' });
    expect(d1.leashswap!.intrigue.reportQueued).toBeUndefined();
  });
});

/** Runs the answer `submit` of an open report on a draft with a given rng (the action's own steps, minus the dilemma bookkeeping). */
function wardenReportAnswer(d: CampaignState, ctx: EngineCtx): EngineEvent[] {
  delete d.dilemmas!.open;
  return wardenReportChoice(d, ctx, 'warden_report', 'submit');
}

describe('her death', () => {
  it('a desertion or a termination starts the death route once, with the events removeFromService returns', () => {
    const s = swap();
    const events = removeFromService(s, ID.bea, 'deserted', real());
    expect(count(events, 'warden_removed')).toBe(1);
    expect(s.leashswap!.removal!.route).toBe('death');
    expect(clock(s)!.segments).toBe(4);
    const t = swap();
    expect(count(removeFromService(t, ID.bea, 'terminated', real()), 'warden_removed')).toBe(1);
  });

  it('wardenGone runs once, even if the death is reported a second time (death plus status)', () => {
    const s = swap();
    const first = wardenGone(s, real(), 'dead');
    expect(count(first, 'warden_removed')).toBe(1);
    expect(wardenGone(s, real(), 'dead')).toEqual([]);
    expect(wardenGone(s, real(), 'deserted')).toEqual([]);
  });

  it('a unit who is not the warden: removeFromService returns nothing and opens no investigation', () => {
    const s = swap();
    expect(removeFromService(s, ID.ann, 'deserted')).toEqual([]);
    expect(s.leashswap!.status).toBe('held');
    expect(s.leashswap!.removal).toBeUndefined();
  });

  it('the warden leaves without an engine context: refused, never a silent half-removal', () => {
    const s = swap();
    expect(() => removeFromService(s, ID.bea, 'deserted')).toThrow(/engine context/);
  });

  it('the warden dies with an open override and a report pending: both are dropped and the removal starts once', () => {
    const s = swap((x) => {
      kompromat(x, 3);
      const w = wardenOf(x)!;
      w.override = { id: 'ov1', order: { kind: 'activity', activityId: 'work' }, expectationId: '', weight: 0.5, alternative: null, altLabel: 'hold', day: x.day, slot: x.slot, context: 'base' };
      x.leashswap!.intrigue.reportQueued = true;
    });
    const withCase = swap((x) => {
      kompromat(x, 3);
      wardenOf(x)!.override = { id: 'ov1', order: { kind: 'activity', activityId: 'work' }, expectationId: '', weight: 0.5, alternative: null, altLabel: 'hold', day: x.day, slot: x.slot, context: 'base' };
    });
    const opened = dispatch(withCase, { type: 'intrigue/report', payload: {} }, reg).state;
    expect(opened.dilemmas!.open!.context).toBe('warden_report');
    const events = removeFromService(opened, ID.bea, 'deserted', real());
    expect(count(events, 'warden_removed')).toBe(1);
    expect(opened.dilemmas?.open).toBeUndefined();
    expect(opened.leashswap!.warden).toBeUndefined();
    const events2 = removeFromService(s, ID.bea, 'deserted', real());
    expect(count(events2, 'warden_removed')).toBe(1);
    expect(s.leashswap!.intrigue.reportQueued).toBeUndefined();
    expect(wardenOf(s)).toBeNull();
    expect(wardenDayStep(s, real())).not.toContainEqual(expect.objectContaining({ type: 'dilemma_presented' }));
  });

  it('her ARGUE scene ends harmlessly after she is gone', () => {
    const s = swap();
    const w = wardenOf(s)!;
    w.override = { id: 'ov1', order: { kind: 'activity', activityId: 'work' }, expectationId: '', weight: 0.5, alternative: null, altLabel: 'hold', day: s.day, slot: s.slot, context: 'base', arguing: 'sc1' };
    wardenGone(s, real(), 'dead');
    expect(s.leashswap!.warden).toBeUndefined();
  });

  it('no mode: removeFromService is unchanged', () => {
    const out = buildCampaign({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea'].map((n) => unitSetup(n)) }, reg, { desireBondDefects: false, seed: 4 });
    if (!out.ok) throw new Error('setup');
    const before = structuredClone(out.state.rng);
    expect(removeFromService(out.state, ID.ann, 'terminated')).toEqual([]);
    expect(out.state.squad.find((u) => u.id === ID.ann)!.status).toBe('terminated');
    expect(out.state.leashswap).toBeUndefined();
    expect(out.state.rng).toEqual(before);
  });
});

describe('squad reactions follow values', () => {
  const trustOf = (s: CampaignState, id: string): number => s.relations[id].trust;
  it('an autonomy+ unit gains trust, a corporate+ unit loses it (hack route)', () => {
    const s = swap((x) => {
      const ann = x.squad.find((u) => u.id === ID.ann)!;
      ann.values.autonomy = 2; ann.values.corporate = -2;
      const dee = x.squad.find((u) => u.id === ID.dee)!;
      dee.values.corporate = 2; dee.values.autonomy = -2;
    });
    const a0 = trustOf(s, ID.ann); const d0 = trustOf(s, ID.dee);
    const events = startRemoval(s, real(), 'hack');
    expect(trustOf(s, ID.ann)).toBeGreaterThan(a0);
    expect(trustOf(s, ID.dee)).toBeLessThan(d0);
    expect(events.length).toBeGreaterThan(0);
    expect(s.squad.find((u) => u.id === ID.bea)!.status).not.toBe('dead');
  });

  it('the report route reads as by the book: a corporate+ unit approves', () => {
    const s = swap((x) => { const dee = x.squad.find((u) => u.id === ID.dee)!; dee.values.corporate = 2; dee.values.autonomy = 0; });
    const d0 = trustOf(s, ID.dee);
    startRemoval(s, real(), 'report');
    expect(trustOf(s, ID.dee)).toBeGreaterThan(d0);
    const t = swap((x) => { const dee = x.squad.find((u) => u.id === ID.dee)!; dee.values.corporate = 2; dee.values.autonomy = 0; });
    startRemoval(t, real(), 'hack');
    expect(trustOf(t, ID.dee)).toBeLessThan(d0);
  });

  it('when she was close to the squad (ingroup 1+) a unit who holds mercy and the group reads it as murder', () => {
    const base = (ingroup: number) => swap((x) => {
      x.squad.find((u) => u.id === ID.bea)!.values.ingroup = ingroup;
      const ann = x.squad.find((u) => u.id === ID.ann)!;
      ann.values.mercy = 2; ann.values.ingroup = 2; ann.values.autonomy = 0; ann.values.corporate = 0;
    });
    const far = base(0); const close = base(2);
    startRemoval(far, real(), 'death');
    startRemoval(close, real(), 'death');
    expect(trustOf(close, ID.ann)).toBeLessThan(trustOf(far, ID.ann));
  });

  it('draws nothing', () => {
    const s = swap();
    const ctx = real();
    const rng = ctx.rng.state;
    startRemoval(s, ctx, 'hack');
    expect(ctx.rng.state).toEqual(rng);
  });
});
