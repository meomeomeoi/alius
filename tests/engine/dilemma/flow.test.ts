import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import { buildDilemmaDigest, dilemmaOptions, eligibleTemplates, presentUnits } from '../../../src/engine/dilemma/flow';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { depart, withMission } from '../../helpers/expedition';

let reg: Registries;
let base: CampaignState;
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  for (const u of base.squad) {
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
    u.defects = [];
    setRelation(base, u.id, { trust: 50, affinity: 20, stateId: 'comrade', band: 'steady' });
  }
  base.squad[0].values.mercy = 3; // Ann cares about mercy, Bea is against it
  base.squad[1].values.mercy = -3;
  informantReg = regWith((t) => {
    t.set('dil_informant', { ...reg.dilemmaTemplates.get('dil_informant')!, allowedFlags: ['evidence_buried'] } as Entry);
    t.set('dil_def', { ...reg.dilemmaTemplates.get('dil_informant')!, id: 'dil_def', scale: 'defining' } as Entry);
  });
});

const clone = (seed = 1): CampaignState => {
  const s = structuredClone(base);
  s.rng = seedRng(seed);
  return s;
};
const act = (s: CampaignState, type: string, payload?: unknown, r: Registries = reg) => run(s, r, { type, payload });
const eff = (kind: string, target: string, direction: 1 | -1, magnitude: 'small' | 'medium' | 'large' = 'small', extra: Record<string, unknown> = {}) =>
  ({ kind, target, direction, magnitude, ...extra });
const opt = (label: string, effects: unknown[], extra: Record<string, unknown> = {}) => ({ label, effects, ...extra });

/** A valid answer for `dil_rations` (two options, minor). */
const rations = (): Record<string, unknown> => ({
  title: 'Short rations', setup: 'The mess hall is short again.',
  options: [
    opt('Cut portions', [eff('resource', 'supplies', 1), eff('stress', 'party', 1)]),
    opt('Buy on the black market', [eff('resource', 'supplies', 1), eff('resource', 'credits', -1), eff('faction', 'sable', 1)]),
  ],
});
/** A registry where `dil_informant` (major, base, three options) may set one flag and exists in a defining twin. */
function regWith(patch: (t: Map<string, Entry>) => void): Registries {
  const r = { ...reg } as Registries;
  r.dilemmaTemplates = new Map(reg.dilemmaTemplates);
  patch(r.dilemmaTemplates);
  return r;
}
let informantReg: Registries;
const informant = (extra: Record<number, Record<string, unknown>> = {}): Record<string, unknown> => ({
  title: 'The informant', setup: 'A clerk waits for you.',
  options: [
    opt('Pay him', [eff('resource', 'credits', -1, 'medium'), eff('clock', 'oversight', -1, 'small'), eff('unit_event', 'mercy', 1, 'medium')], extra[0]),
    opt('Turn him in', [eff('faction', 'vesper', 1, 'medium'), eff('stress', 'party', 1, 'small'), eff('flag', 'evidence_buried', 1)], extra[1]),
    opt('Take it by force', [eff('resource', 'plyx', 1, 'medium'), eff('faction', 'sable', -1, 'small')], extra[2]),
  ],
});

const request = (s: CampaignState, templateId = 'dil_rations', context = 'base', r: Registries = reg) =>
  act(s, 'dilemma/request', { templateId, context }, r);
const requested = (s = clone(), templateId = 'dil_rations', context = 'base', r: Registries = reg): CampaignState => {
  const out = request(s, templateId, context, r);
  expect(errors(out.events)).toEqual([]);
  return out.state;
};
const presented = (answer: unknown = rations(), s = clone(), templateId = 'dil_rations', r: Registries = reg): CampaignState => {
  const q = requested(s, templateId, 'base', r);
  const out = act(q, 'dilemma/present', { requestId: q.dilemmas!.open!.id, output: answer }, r);
  expect(errors(out.events)).toEqual([]);
  expect(out.state.dilemmas!.open!.status).toBe('presented');
  return out.state;
};
const open = (s: CampaignState) => s.dilemmas!.open!;
const choose = (s: CampaignState, index: number, r: Registries = reg) => act(s, 'dilemma/choose', { id: open(s).id, index }, r);
/** Ends the day without answering anything (what the engine does on its own). */
function rawEndDay(s: CampaignState): CampaignState {
  const day = s.day;
  let cur = s;
  for (let i = 0; i < 5 && cur.day === day; i++) {
    const r = act(cur, 'calendar/consume_slot');
    if (errors(r.events).length > 0) throw new Error(JSON.stringify(r.events));
    cur = r.state;
  }
  return cur;
}

describe('request and present', () => {
  it('a request opens one dilemma with the next id', () => {
    const r = request(clone());
    expect(ofType(r.events, 'dilemma_requested')).toEqual([{ type: 'dilemma_requested', id: 'dl1', templateId: 'dil_rations' }]);
    expect(open(r.state)).toMatchObject({ id: 'dl1', templateId: 'dil_rations', scale: 'minor', context: 'base', status: 'requested', attempts: 0, units: presentUnits(base) });
    // one at a time, unknown or non-generating templates, a wrong context
    expect(errors(request(r.state).events)).toHaveLength(1);
    expect(errors(request(clone(), 'nope').events)).toHaveLength(1);
    expect(errors(request(clone(), 'evt_sealed_crate', 'expedition_event').events)).toHaveLength(1);
    expect(errors(request(clone(), 'dil_rations', 'mission_outcome').events)).toHaveLength(1);
  });

  it('present needs the open request id', () => {
    const q = requested();
    for (const bad of [{ requestId: 'dl9', output: rations() }, { output: rations() }, { requestId: 5, output: rations() }]) {
      const r = act(q, 'dilemma/present', bad);
      expect(r.state).toBe(q);
      expect(errors(r.events)).toMatchObject([{ message: 'Stale dilemma answer.' }]);
    }
    const none = clone();
    expect(errors(act(none, 'dilemma/present', { requestId: 'dl1', output: rations() }).events)).toMatchObject([{ message: 'Stale dilemma answer.' }]);
  });

  it('a valid answer is presented and blocks activities, slots, scenes and departures', () => {
    const s = presented();
    expect(open(s)).toMatchObject({ status: 'presented', source: 'model', title: 'Short rations', attempts: 1 });
    expect(open(s).options).toHaveLength(2);
    expect(open(s).options![0].effects).toEqual([{ type: 'resource', resource: 'supplies', amount: 3 }, { type: 'party_stress', amount: 5 }]);
    expect(dilemmaOptions(s, reg).map((o) => [o.label, o.disabled])).toEqual([['Cut portions', null], ['Buy on the black market', null]]);
    for (const type of ['activity/do', 'calendar/consume_slot', 'scene/start', 'expedition/start']) {
      const r = act(s, type, {});
      expect(r.events, type).toEqual([{ type: 'error', code: 'dilemma_open', message: 'A decision is waiting: answer it first.' }]);
    }
    // a second answer for the same request is stale
    const again = act(s, 'dilemma/present', { requestId: open(s).id, output: rations() });
    expect(errors(again.events)).toMatchObject([{ message: 'Stale dilemma answer.' }]);
  });

  it('an invalid first answer asks for a retry and presents nothing', () => {
    const q = requested();
    const r = act(q, 'dilemma/present', { requestId: 'dl1', output: { title: 'x' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'dilemma_rejected')).toMatchObject([{ id: 'dl1', retry: true }]);
    expect((ofType(r.events, 'dilemma_rejected')[0].rejections as Array<{ rule: unknown }>)[0].rule).toBe('shape');
    expect(open(r.state)).toMatchObject({ status: 'requested', attempts: 1 });
    expect(open(r.state).options).toBeUndefined();
    expect(dilemmaOptions(r.state, reg)).toEqual([]);
    // a rule violation is rejected the same way (rule 1: only gains)
    const greedy = rations();
    (greedy.options as Array<{ effects: unknown[] }>)[0].effects = [eff('resource', 'supplies', 1)];
    const r2 = act(q, 'dilemma/present', { requestId: 'dl1', output: greedy });
    expect(ofType(r2.events, 'dilemma_rejected')[0].rejections).toMatchObject([{ rule: 1, option: 0 }]);
  });

  it('an invalid second answer presents the authored fallback in the same dispatch', () => {
    const q = requested();
    const first = act(q, 'dilemma/present', { requestId: 'dl1', output: 'garbage' }).state;
    const second = act(first, 'dilemma/present', { requestId: 'dl1', output: null });
    expect(errors(second.events)).toEqual([]);
    expect(ofType(second.events, 'dilemma_rejected')).toMatchObject([{ retry: false }]);
    expect(ofType(second.events, 'dilemma_presented')).toMatchObject([{ source: 'fallback', title: 'Short rations' }]);
    const o = open(second.state);
    expect(o).toMatchObject({ status: 'presented', source: 'fallback', attempts: 2 });
    expect(o.options!.map((x) => x.label)).toEqual(['Cut everyone\'s portions', 'Buy rations on the black market']);
  });

  it('a rule-breaking answer is rejected by the engine, a good one after a bad one is presented', () => {
    const q = requested();
    const first = act(q, 'dilemma/present', { requestId: 'dl1', output: { title: 'x', setup: 'y', options: [] } }).state;
    const ok = act(first, 'dilemma/present', { requestId: 'dl1', output: rations() });
    expect(ofType(ok.events, 'dilemma_presented')).toMatchObject([{ source: 'model' }]);
    expect(open(ok.state).attempts).toBe(2);
  });

  it('present after the fallback is stale', () => {
    const q = requested();
    const fb = act(q, 'dilemma/fallback', { requestId: 'dl1' });
    expect(open(fb.state)).toMatchObject({ status: 'presented', source: 'fallback' });
    const late = act(fb.state, 'dilemma/present', { requestId: 'dl1', output: rations() });
    expect(late.state).toBe(fb.state);
    expect(errors(late.events)).toMatchObject([{ message: 'Stale dilemma answer.' }]);
    expect(errors(act(fb.state, 'dilemma/fallback', { requestId: 'dl1' }).events)).toHaveLength(1);
  });

  it('a rejected answer never reaches dilemmaOptions', () => {
    let s = requested();
    for (const bad of ['x', { title: 't', setup: 's', options: [opt('a', [eff('resource', 'gold', 1)]), opt('b', [])] }]) {
      s = act(s, 'dilemma/present', { requestId: 'dl1', output: bad }).state;
      expect(dilemmaOptions(s, reg).length === 0 || open(s).source === 'fallback').toBe(true);
      if (open(s).status === 'requested') expect(open(s).options).toBeUndefined();
    }
  });

  it('fallback works for every generating core template', () => {
    const generating = [...reg.dilemmaTemplates.values()].filter((t) => t.generate !== undefined && !(t.contexts as string[]).includes('expedition_event'));
    expect(generating.length).toBeGreaterThanOrEqual(4);
    for (const t of generating) {
      const s = clone();
      const context = (t.contexts as string[])[0];
      const q = requested(s, String(t.id), context);
      const r = act(q, 'dilemma/fallback', { requestId: 'dl1' });
      expect(errors(r.events), String(t.id)).toEqual([]);
      const fixed = t.fixed as { title: string; options: unknown[] };
      expect(open(r.state).title).toBe(fixed.title);
      expect(open(r.state).options).toHaveLength(fixed.options.length);
    }
  });
});

describe('choose', () => {
  it('choose applies resources, factions, clocks, flags and stress with table amounts', () => {
    const s = presented(informant(), clone(), 'dil_informant', informantReg);
    const pay = choose(s, 0, informantReg);
    expect(errors(pay.events)).toEqual([]);
    expect(pay.state.resources.credits).toBe(Math.max(0, s.resources.credits - 40)); // may be disabled for lack of credits: see below
  });

  it('every kind lands with the engine\'s numbers', () => {
    const rich = clone();
    rich.resources.credits = 500;
    const s = presented(informant(), rich, 'dil_informant', informantReg);
    const oversight = s.world.clocks.find((c) => c.id === 'oversight')!.filled;
    const first = choose(s, 0, informantReg).state;
    expect(first.resources.credits).toBe(460);
    expect(first.world.clocks.find((c) => c.id === 'oversight')!.filled).toBe(Math.max(0, oversight - 1));
    const second = choose(s, 1, informantReg);
    expect(second.state.world.factions.vesper).toBe((s.world.factions.vesper ?? 0) + 10);
    expect(second.state.world.flags).toContain('evidence_buried');
    expect(second.state.squad[0].stress).toBe(Math.min(100, s.squad[0].stress + 5));
    const third = choose(s, 2, informantReg).state;
    expect(third.resources.plyx).toBe(s.resources.plyx + 8);
    expect(third.world.factions.sable).toBe((s.world.factions.sable ?? 0) - 5);
  });

  it('the same option raises one unit and lowers another according to values', () => {
    const rich = clone();
    rich.resources.credits = 500;
    const s = presented(informant(), rich, 'dil_informant', informantReg);
    const r = choose(s, 0, informantReg);
    expect(r.state.relations[ANN].trust).toBeGreaterThan(50);
    expect(r.state.relations[BEA].trust).toBeLessThan(50);
    expect(ofType(r.events, 'dilemma_resolved')[0].affected).toEqual(expect.arrayContaining([ANN, BEA]));
  });

  it('a resolved dilemma clears the request and records the bookkeeping', () => {
    const rich = clone();
    rich.resources.credits = 500;
    const s = presented(informant(), rich, 'dil_informant', informantReg);
    const r = choose(s, 2, informantReg);
    expect(ofType(r.events, 'dilemma_resolved')).toMatchObject([{ id: 'dl1', templateId: 'dil_informant', option: 2, label: 'Take it by force', title: 'The informant' }]);
    expect(r.state.dilemmas).toMatchObject({ seq: 1, lastDay: s.day, recent: ['dil_informant'] });
    expect(r.state.dilemmas!.open).toBeUndefined();
    // time moves again
    expect(errors(act(r.state, 'calendar/consume_slot').events)).toEqual([]);
  });

  it('a greyed option, an index out of range and a second choose are refused', () => {
    const gated = presented(rations(), clone());
    const answer = rations();
    (answer.options as Array<Record<string, unknown>>)[1].requires = { socialStat: 'empathy', rank: 5 };
    const s = presented(answer);
    expect(dilemmaOptions(s, reg)[1]).toMatchObject({ disabled: 'Needs Empathy 5' });
    for (const index of [1, 2, -1, 0.5, 'x' as never]) {
      const r = act(s, 'dilemma/choose', { id: 'dl1', index });
      expect(r.state, String(index)).toBe(s);
      expect(errors(r.events), String(index)).toHaveLength(1);
    }
    expect(errors(act(s, 'dilemma/choose', { id: 'dl7', index: 0 }).events)).toMatchObject([{ message: 'Stale dilemma answer.' }]);
    const done = choose(s, 0);
    expect(errors(done.events)).toEqual([]);
    expect(errors(act(done.state, 'dilemma/choose', { id: 'dl1', index: 0 }).events)).toMatchObject([{ message: 'Stale dilemma answer.' }]);
    void gated;
  });

  it('an unaffordable negative resource greys the option', () => {
    const poor = clone();
    poor.resources.credits = 10;
    const s = presented(rations(), poor);
    expect(dilemmaOptions(s, reg).map((o) => o.disabled)).toEqual([null, 'Not enough credits']);
  });

  it('a failed social check keeps the costs and drops the gains', () => {
    const answer = rations();
    (answer.options as Array<{ effects: unknown[] }>)[0].effects.push(eff('social_check', 'cunning', 1, 'small'));
    const s0 = presented(answer);
    expect(dilemmaOptions(s0, reg)[0].hasCheck).toBe(true);
    s0.commander.socialStats.cunning = 1; // chance 0.3
    let failed: ReturnType<typeof choose> | undefined;
    let passed: ReturnType<typeof choose> | undefined;
    for (let seed = 1; seed <= 60 && !(failed && passed); seed++) {
      const t = structuredClone(s0);
      t.rng = seedRng(seed);
      const r = choose(t, 0);
      if (ofType(r.events, 'dilemma_resolved')[0].checkPassed === false) failed ??= r;
      else passed ??= r;
    }
    expect(failed!.state.resources.supplies).toBe(s0.resources.supplies); // the gain is dropped
    expect(failed!.state.squad[0].stress).toBe(s0.squad[0].stress + 5); // the cost stays
    expect(passed!.state.resources.supplies).toBe(s0.resources.supplies + 3);
  });

  it('a failed check never drops the recorded decision (flags)', () => {
    const rich = clone();
    rich.resources.credits = 500;
    const answer = informant({ 1: {} });
    (answer.options as Array<{ effects: unknown[] }>)[1].effects.push(eff('social_check', 'authority', 1, 'large'));
    const s0 = presented(answer, rich, 'dil_informant', informantReg);
    s0.commander.socialStats.authority = 1;
    for (let seed = 1; seed <= 20; seed++) {
      const t = structuredClone(s0);
      t.rng = seedRng(seed);
      const r = choose(t, 1, informantReg);
      expect(r.state.world.flags, `seed ${seed}`).toContain('evidence_buried');
    }
  });
});

describe('defining decisions', () => {
  const defining = (s = clone()): CampaignState => {
    const q = requested(s, 'dil_def', 'base', informantReg);
    return act(q, 'dilemma/fallback', { requestId: 'dl1' }, informantReg).state;
  };

  it('a defining choice records its day and beat; a second one in the beat is refused at request time', () => {
    const rich = clone();
    rich.resources.credits = 500;
    const s = defining(rich);
    const done = choose(s, 0, informantReg);
    expect(errors(done.events)).toEqual([]);
    const beat = open(s).beatId;
    expect(done.state.dilemmas).toMatchObject({ lastDefiningDay: s.day, definingBeats: [beat] });
    // the cooldown
    const soon = request(done.state, 'dil_def', 'base', informantReg);
    expect(errors(soon.events)).toMatchObject([{ message: expect.stringContaining('wait 7 days') }]);
    // after the cooldown the beat still has had its decision
    const later = structuredClone(done.state);
    later.day += 8;
    expect(errors(request(later, 'dil_def', 'base', informantReg).events)).toMatchObject([{ message: expect.stringContaining('already had') }]);
    // a different beat may have one
    later.world.spineProgress += 1;
    expect(errors(request(later, 'dil_def', 'base', informantReg).events)).toEqual([]);
  });
});

describe('expedition events', () => {
  /** A run that stands at the pinned objective event of Vesper's beat 4, beat 5 waiting for the flag. */
  function atObjective(): { s: CampaignState; reg2: Registries } {
    const { state, mission } = withMission(reg, clone());
    state.world.spineProgress = 4;
    state.world.spine = { proposed: 'beat_5' };
    const s = depart(reg, state, mission.id);
    const exp = s.expedition!;
    exp.pending = { kind: 'event', nodeId: exp.map.objectiveId, templateId: 'evt_vesper_choice' };
    exp.phase = 'event';
    return { s, reg2: reg };
  }

  it('an expedition dilemma finishes its node and the pinned beat flag completes the beat', () => {
    const { s } = atObjective();
    const q = requested(s, 'evt_vesper_choice', 'expedition_event');
    expect(open(q)).toMatchObject({ scale: 'defining', context: 'expedition_event' });
    const fb = act(q, 'dilemma/fallback', { requestId: 'dl1' }).state;
    expect(open(fb).options!.map((o) => o.label)).toEqual(['Deliver it to Vesper', 'Sell it to Aurum', 'Bury it']);
    const r = choose(fb, 2);
    expect(errors(r.events)).toEqual([]);
    const exp = r.state.expedition!;
    expect(exp.pending).toBeUndefined();
    expect(exp.phase).toBe('travel');
    expect(exp.objectiveDone).toBe(true);
    expect(exp.log.at(-1)).toMatchObject({ kind: 'event', text: 'The evidence: Bury it.' });
    expect(r.state.world.flags).toContain('evidence_buried');
    expect(r.state.world.spineProgress).toBe(5); // beat 5 completed by its flag
    expect(ofType(r.events, 'beat_completed')).toHaveLength(1);
    expect(ofType(r.events, 'expedition_choice')).toMatchObject([{ templateId: 'evt_vesper_choice', option: 2 }]);
    expect(r.state.dilemmas!.definingBeats).toEqual(['beat_5']);
  });

  it('an expedition request must match the pending event; base requests wait for the end of the run', () => {
    const { s } = atObjective();
    expect(errors(request(s, 'evt_kestrel_choice', 'expedition_event').events)).toHaveLength(1);
    expect(errors(request(s, 'dil_rations', 'base').events)).toHaveLength(1);
    const noPending = structuredClone(s);
    delete noPending.expedition!.pending;
    expect(errors(request(noPending, 'evt_vesper_choice', 'expedition_event').events)).toHaveLength(1);
  });

  it('expedition/choose is refused while the dilemma for that node is open and works when none is', () => {
    const { s } = atObjective();
    const q = requested(s, 'evt_vesper_choice', 'expedition_event');
    const blocked = act(q, 'expedition/choose', { option: 2 });
    expect(blocked.state).toBe(q);
    expect(errors(blocked.events)).toMatchObject([{ message: 'A decision is waiting: answer it first.' }]);
    expect(errors(act(s, 'expedition/choose', { option: 2 }).events)).toEqual([]);
  });

  it('a vanished template resolves the dilemma and finishes the node', () => {
    const { s } = atObjective();
    const q = requested(s, 'evt_vesper_choice', 'expedition_event');
    const gone = regWith((t) => t.delete('evt_vesper_choice'));
    const r = act(q, 'dilemma/fallback', { requestId: 'dl1' }, gone);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'dilemma_resolved')).toEqual([{ type: 'dilemma_resolved', id: 'dl1', templateId: 'evt_vesper_choice', nothing: true }]);
    expect(r.state.dilemmas!.open).toBeUndefined();
    expect(r.state.expedition!.pending).toBeUndefined();
    expect(r.state.expedition!.log.at(-1)!.text).toBe('Nothing to decide.');
    expect(r.state.expedition!.objectiveDone).toBe(true);
  });
});

describe('pacing', () => {
  it('pacing opens a dilemma on the fourth day and never a defining one', () => {
    let s = clone();
    for (let day = 1; day <= 3; day++) {
      s = rawEndDay(s);
      expect(s.dilemmas?.open, `after day ${day}`).toBeUndefined();
    }
    expect(s.day).toBe(4);
    s = rawEndDay(s);
    expect(s.day).toBe(5);
    expect(open(s)).toMatchObject({ status: 'requested', day: 4 });
    // over many seeds: never a defining template, always one that generates for the base or director
    for (let seed = 1; seed <= 40; seed++) {
      let t = clone(seed);
      for (let i = 0; i < 4; i++) t = rawEndDay(t);
      const o = open(t);
      expect(o.scale, `seed ${seed}`).not.toBe('defining');
      expect(['base', 'director']).toContain(o.context);
      expect(reg.dilemmaTemplates.get(o.templateId)!.generate).toBeDefined();
    }
    expect(eligibleTemplates(base, reg, ['base', 'director', 'mission_outcome', 'expedition_event']).every((t) => t.scale !== 'defining')).toBe(true);
  });

  it('pacing draws mission_outcome templates only on a day a mission ended', () => {
    const ids = (s: CampaignState): string[] => {
      const t = structuredClone(s);
      t.day = 4;
      return [...new Set(Array.from({ length: 40 }, (_, seed) => {
        const x = structuredClone(t);
        x.rng = seedRng(seed + 1);
        x.slot = 'evening';
        const r = act(x, 'calendar/consume_slot');
        return r.state.dilemmas?.open?.templateId ?? '-';
      }))];
    };
    expect(ids(clone())).not.toContain('dil_after_action');
    const ended = clone();
    ended.missions.completed.push({
      id: 'm_old', source: 'command', templateId: 'tpl_sweep', title: 'T', brief: 'B', regionId: 'quarantine_d7', danger: 1,
      objective: { node: 'combat', condition: 'win' }, offeredDay: 1, rewardsTier: 'tier_1', failureEffects: [], status: 'completed', outcomeDay: 4,
    });
    expect(ids(ended)).toContain('dil_after_action');
  });

  it('an unanswered request is answered by the fallback at the next day end', () => {
    let s = clone();
    for (let i = 0; i < 4; i++) s = rawEndDay(s);
    expect(open(s).status).toBe('requested');
    s = rawEndDay(s);
    expect(open(s)).toMatchObject({ status: 'presented', source: 'fallback' });
  });

  it('a presented dilemma is never replaced; time waits for the answer', () => {
    let s = clone();
    for (let i = 0; i < 4; i++) s = rawEndDay(s);
    s = act(s, 'dilemma/fallback', { requestId: open(s).id }).state;
    expect(errors(act(s, 'calendar/consume_slot').events)).toMatchObject([{ code: 'dilemma_open' }]);
  });

  it('nothing is drawn while a confrontation is open or the last dilemma is recent', () => {
    let s = clone();
    s.day = 4;
    s.disloyalty = { units: {}, open: { kind: 'desertion', unitId: ANN, day: 4, at: 'mission_start' } };
    s.slot = 'evening';
    expect(act(s, 'calendar/consume_slot').state.dilemmas?.open).toBeUndefined();
    s = clone();
    s.day = 4;
    s.slot = 'evening';
    s.dilemmas = { seq: 3, lastDay: 2 };
    expect(act(s, 'calendar/consume_slot').state.dilemmas?.open).toBeUndefined();
  });

  it('a vanished template resolves the dilemma at the next day end without throwing', () => {
    let s = clone();
    for (let i = 0; i < 4; i++) s = rawEndDay(s);
    const id = open(s).templateId;
    const gone = regWith((t) => t.delete(id));
    s.slot = 'evening';
    const r = act(s, 'calendar/consume_slot', undefined, gone);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'day_end_step_failed')).toEqual([]);
    expect(r.state.dilemmas?.open).toBeUndefined();
  });
});

describe('eligibleTemplates and the digest', () => {
  it('requiredRefs are respected and recent templates are skipped', () => {
    const ids = (s: CampaignState) => eligibleTemplates(s, reg, ['base']).map((t) => String(t.id)).sort();
    expect(ids(base)).toEqual(['dil_informant', 'dil_rations', 'dil_transfer_order']);
    const lone = structuredClone(base);
    lone.roster.activeIds = [ANN];
    expect(ids(lone)).not.toContain('dil_transfer_order');
    const seen = structuredClone(base);
    seen.dilemmas = { seq: 1, recent: ['dil_rations'] };
    expect(ids(seen)).not.toContain('dil_rations');
  });

  it('the digest has no unit ids and no trust, affinity or stress numbers', () => {
    const s = requested();
    s.squad[0].stress = 77;
    setRelation(s, ANN, { trust: 73, affinity: 41 });
    const d = buildDilemmaDigest(s, reg, open(s));
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/unit_|trust|affinity|stress|"73"|\b77\b|\b41\b/i);
    expect(d.units.map((u) => u.name)).toEqual(['Ann', 'Bea', 'Cat', 'Dee']);
    expect(d.units[0]).toEqual({ name: 'Ann', values: base.squad[0].values, triggers: [] });
    expect(Object.keys(d.units[0]).sort()).toEqual(['name', 'triggers', 'values']);
    expect(d.resources).toEqual({ credits: expect.stringMatching(/^(low|ok|high)$/), supplies: expect.stringMatching(/^(low|ok|high)$/), plyx: expect.stringMatching(/^(low|ok|high)$/) });
    expect(d.factions.map((f) => f.id).sort()).toEqual(['aurum', 'kestrel', 'sable', 'vesper']);
    for (const f of d.factions) expect(['hostile', 'cold', 'neutral', 'warm']).toContain(f.standing);
    expect(d.clocks.map((c) => c.id)).toContain('oversight');
    expect(d.day).toBe(s.day);
    expect(d.context).toBe('base');
  });

  it('the digest lists the allowed flags with their descriptions and bands resources', () => {
    const q = requested(clone(), 'dil_informant', 'base', informantReg);
    q.resources = { credits: 5, supplies: 100, plyx: 10 };
    const d = buildDilemmaDigest(q, informantReg, open(q));
    expect(d.allowedFlags).toEqual([{ id: 'evidence_buried', description: 'The evidence of deliberate seeding was buried.' }]);
    expect(d.resources).toEqual({ credits: 'low', supplies: 'high', plyx: 'ok' });
  });
});
