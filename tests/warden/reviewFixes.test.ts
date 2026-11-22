import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type EngineCtx, type EngineEvent } from '../../src/engine/dispatch';
import { toWorldEffect } from '../../src/engine/dilemma/effects';
import { buildDilemmaDigest } from '../../src/engine/dilemma/flow';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { buildDigest, validateDirectorOutput } from '../../src/engine/world/director';
import {
  allies, corporateWardenPick, dig, hackProblem, hackStep, rollVerdict, seedWarden, slotActionBusy, startRemoval, verdictChance, wardenOf,
} from '../../src/engine/warden';
import { rememberEvents } from '../../src/engine/memory/remember';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/dilemma';
import '../../src/engine/actions/scene';
import '../../src/engine/actions/calendar';

/** The findings of the Opus review of chunk (c): each one with the input that broke it. */
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
  out.state.commander.socialStats.cunning = 1;
  over(out.state);
  return out.state;
}
const ready = (x: CampaignState): void => {
  x.base.facilities.workshop = 3; x.base.facilities.medbay = 3; x.resources.plyx = 50;
  x.relations[ID.cat].flags.push('warden_ally');
};
class Fixed extends Rng {
  constructor(state: ReturnType<typeof seedRng>, private readonly answer: boolean) { super(state); }
  override chance(): boolean { return this.answer; }
}
const fixed = (answer: boolean, seed = 3): EngineCtx => ({ registries: reg, rng: new Fixed(seedRng(seed), answer) });
const real = (seed = 3): EngineCtx => ({ registries: reg, rng: new Rng(seedRng(seed)) });
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const unit = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

describe('1: a slot action in the evening keeps its work (the day end rebuilds the state)', () => {
  it('an evening hack step keeps its progress, pays once and spends the slot', () => {
    const s = swap(ready);
    s.slot = 'evening';
    const day = s.day;
    const events = hackStep(s, fixed(false), ID.cat);
    expect(events.find((e) => e.type === 'hack_step')).toMatchObject({ step: 1, failed: false });
    expect(s.leashswap!.intrigue.hack.step).toBe(1); // it was 0 before the fix
    expect(s.resources.plyx).toBe(45);
    expect(s.day).toBe(day + 1); // the evening is spent
  });

  it('three evening steps (one a day) make the controller dark', () => {
    const s = swap(ready);
    for (let i = 0; i < 3; i++) { s.slot = 'evening'; hackStep(s, fixed(false), ID.cat); s.resources.plyx = 50; }
    expect(s.commander.flags).toContain('commander_implant_dark');
    expect(s.leashswap!.status).toBe('investigation');
  });

  it('an evening dig keeps its fact, dated on its own day, and its noise is on the clock before the day end fades it', () => {
    const s = swap(ready);
    s.slot = 'evening';
    const day = s.day;
    const events = dig(s, fixed(false), ID.cat);
    const found = events.find((e) => e.type === 'kompromat_found') as unknown as { factId: string };
    expect(s.memory.facts.find((f) => f.id === found.factId)!.day).toBe(day);
    expect(s.day).toBe(day + 1);
    expect(s.leashswap!.intrigue.suspicion).toBe(15 - 3); // the noise landed first; the day end then took its 3
  });

  it('a discovery that already spent the rest of the day does not spend a second slot', () => {
    const s = swap((x) => { ready(x); wardenOf(x)!.punishLog = [{ punishmentId: 'reprimand', day: 1, severity: 1 }]; }); // the next severity-4 entry in turn is the suppress
    s.slot = 'morning';
    // a discovery at once: the highest punishment is a suppress, which takes the rest of the day
    s.leashswap!.intrigue.suspicion = 100;
    const day = s.day;
    dig(s, real(), ID.cat);
    expect(s.day).toBe(day + 1);
    expect(s.slot).toBe('morning'); // not afternoon: the dig's own slot was already gone
  });
});

describe('6: slot actions meet the refusals an activity meets', () => {
  it('not at night, not with an open conversation, not while a decision waits, not on a due booking', () => {
    const night = swap(ready); night.slot = 'night';
    expect(slotActionBusy(night, reg)).toBe('Not at night.');
    expect(hackProblem(night, reg, ID.cat)).toBe('Not at night.');
    const talk = swap(ready); talk.calendar.pendingScene = { unitId: ID.ann } as never;
    expect(slotActionBusy(talk, reg)).toMatch(/conversation/);
    const decision = swap((x) => { ready(x); x.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 't', scale: 'major', context: 'base', day: 1, status: 'presented', attempts: 0, units: [], beatId: 'b', title: 'T', setup: 'S', options: [] } }; });
    expect(slotActionBusy(decision, reg)).toMatch(/decision is waiting/);
    expect(hackProblem(decision, reg, ID.cat)).toMatch(/decision is waiting/);
    expect(slotActionBusy(swap(ready), reg)).toBeNull();
    const r = dispatch(night, { type: 'intrigue/act', payload: { action: 'dig', unitId: ID.cat } }, reg);
    expect(r.events.find((e) => e.type === 'error')).toBeDefined();
    expect(r.state).toBe(night);
  });

  it('the report is still allowed while a decision waits (it queues)', () => {
    const s = swap((x) => {
      for (let i = 0; i < 3; i++) x.memory.facts.push({ id: `k${i}`, about: [ID.bea], text: `K${i}.`, tags: ['kompromat'], importance: 3, day: 1, knownBy: ['commander'] });
      x.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 't', scale: 'major', context: 'base', day: 1, status: 'presented', attempts: 0, units: [], beatId: 'b', title: 'T', setup: 'S', options: [{ label: 'A', effects: [], magnitudes: [] }] } };
    });
    expect(dispatch(s, { type: 'intrigue/report', payload: {} }, reg).events.find((e) => e.type === 'error')).toBeUndefined();
  });
});

describe('2: answering the report does not tell her about it', () => {
  const open = (): CampaignState => {
    const s = swap((x) => { for (let i = 0; i < 3; i++) x.memory.facts.push({ id: `k${i}`, about: [ID.bea], text: `K${i}.`, tags: ['kompromat'], importance: 3, day: 1, knownBy: ['commander'] }); });
    return dispatch(s, { type: 'intrigue/report', payload: {} }, reg).state;
  };
  it.each(['withdraw', 'submit'])('%s leaves no fact that she or the squad knows beyond the memory rules', (answer) => {
    const s = open();
    const idx = s.dilemmas!.open!.options!.findIndex((o) => o.id === answer);
    const before = s.memory.facts.length;
    const r = dispatch(s, { type: 'dilemma/choose', payload: { id: s.dilemmas!.open!.id, index: idx } }, reg);
    const fresh = r.state.memory.facts.slice(before);
    expect(fresh.some((f) => /A report on|Keep it and wait|Submit the report/i.test(f.text))).toBe(false);
    if (answer === 'withdraw') expect(fresh).toEqual([]);
  });

  it('the open case names nobody in units (only the subject)', () => {
    expect(open().dilemmas!.open).toMatchObject({ units: [], subjectId: ID.bea });
  });
});

describe('3: the investigation clock belongs to the engine', () => {
  it('it is engine-driven and not visible on the map or in the scene context', () => {
    const s = swap();
    startRemoval(s, real(), 'hack');
    expect(s.world.clocks.find((c) => c.id === 'investigation')).toMatchObject({ engine: true, visibleToPlayer: false });
  });

  it('the director never sees it and cannot advance it', () => {
    const s = swap();
    startRemoval(s, real(), 'death');
    expect(buildDigest(s, reg).clocks.some((c) => c.id === 'investigation')).toBe(false);
    const r = validateDirectorOutput(s, reg, { clockAdvances: [{ clockId: 'investigation', by: 2, reason: 'faster' }] }, { cooldownDays: 3 });
    expect(r.output.clockAdvances).toEqual([]);
    expect(r.rejected.map((x) => x.part)).toContain('clockAdvances[0]');
    expect(s.world.clocks.find((c) => c.id === 'investigation')!.filled).toBe(0);
  });

  it('a model-written dilemma neither lists it nor accepts an effect on it', () => {
    const s = swap();
    startRemoval(s, real(), 'death');
    s.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 'dil_rations', scale: 'minor', context: 'base', day: 1, status: 'requested', attempts: 0, units: [], beatId: 'b' } };
    expect(buildDilemmaDigest(s, reg, s.dilemmas.open!).clocks.some((c) => c.id === 'investigation')).toBe(false);
    const template = reg.dilemmaTemplates.get('dil_rations')!;
    const out = toWorldEffect({ kind: 'clock', target: 'investigation', direction: 1, magnitude: 'large' }, { state: s, reg, template });
    expect(out).toHaveProperty('reason');
  });
});

describe('4: allies against the old warden are not allies of the new one', () => {
  it('the sitting warden is never counted as an ally, and seeding her clears her mark and what the last one knew', () => {
    const s = swap(ready);
    s.relations[ID.ann].flags.push('warden_ally', 'warden_knows_ally');
    s.relations[ID.cat].flags.push('warden_knows_ally');
    startRemoval(s, real(), 'hack');
    seedWarden(s, real(), { unitId: ID.cat, assignedBy: 'oversight' });
    expect(wardenOf(s)!.unitId).toBe(ID.cat);
    expect(s.relations[ID.cat].flags).not.toContain('warden_ally');
    expect(allies(s)).toEqual([ID.ann]);
    for (const u of s.squad) expect(s.relations[u.id].flags).not.toContain('warden_knows_ally');
  });

  it('a conviction whose successor was an ally: she does not raise the next verdict chance', () => {
    const s = swap((x) => { ready(x); unit(x, ID.cat).values.corporate = 3; x.commander.socialStats.cunning = 1; });
    startRemoval(s, real(), 'hack');
    rollVerdict(s, fixed(false));
    expect(wardenOf(s)!.unitId).toBe(ID.cat);
    startRemoval(s, real(), 'hack');
    expect(verdictChance(s, reg)).toBeCloseTo(0.6, 6); // no ally left: Cat holds the leash
  });
});

describe('5: a full medbay is no reason to execute the commander', () => {
  it('a conviction picks an injured or reserve unit when nobody else is active', () => {
    const s = swap((x) => { unit(x, ID.ann).status = 'injured'; unit(x, ID.cat).status = 'reserve'; unit(x, ID.dee).status = 'injured'; unit(x, ID.dee).values.corporate = 2; });
    startRemoval(s, real(), 'death');
    expect(corporateWardenPick(s, reg, [ID.bea])).toBeNull(); // the setup rule: active only
    const events = rollVerdict(s, fixed(false));
    expect(s.ended).toBeUndefined();
    expect(events.find((e) => e.type === 'warden_assigned')).toMatchObject({ unitId: ID.dee });
  });

  it('dead, deserted, terminated and reassigned units are still not eligible', () => {
    const s = swap((x) => { unit(x, ID.ann).status = 'dead'; unit(x, ID.cat).status = 'deserted'; unit(x, ID.dee).status = 'terminated'; });
    startRemoval(s, real(), 'death');
    rollVerdict(s, fixed(false));
    expect(s.ended).toMatchObject({ cause: 'executed' });
  });
});

describe('10: a discovery counts against one investigation only', () => {
  it('the verdict resets it', () => {
    const s = swap((x) => { x.leashswap!.intrigue.discovered = 2; });
    startRemoval(s, real(), 'death');
    expect(verdictChance(s, reg)).toBeCloseTo(0.25, 6);
    rollVerdict(s, fixed(true));
    expect(s.leashswap!.intrigue.discovered).toBe(0);
  });
});

describe('8: the memory check leaves these events out on purpose', () => {
  it('intrigue_discovered, ally_refused, controller_dark, investigation_opened, remote_control_started and report_queued write no fact', () => {
    const events = new Set([...reg.memoryRules.values()].map((r) => String(r.event)));
    for (const type of ['intrigue_discovered', 'ally_refused', 'controller_dark', 'investigation_opened', 'remote_control_started', 'report_queued']) expect(events.has(type), type).toBe(false);
    const s = swap();
    const before = s.memory.facts.length;
    rememberEvents(s, ['intrigue_discovered', 'ally_refused', 'controller_dark', 'investigation_opened', 'remote_control_started', 'report_queued'].map((type) => ({ type, unitId: ID.cat })), reg);
    expect(s.memory.facts).toHaveLength(before);
  });
});
