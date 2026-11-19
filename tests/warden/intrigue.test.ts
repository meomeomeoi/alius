import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type EngineEvent } from '../../src/engine/dispatch';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { addSuspicion, allies, allyChance, conspireInput, intrigueDiscovered, startRemoval, tryAlly, wardenDayStep, wardenOf } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import { sanitizeIntentOutput } from './intentHelper';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/scene';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat' };
function swap(over: (s: CampaignState) => void = () => {}, seed = 9): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed });
  if (!out.ok) throw new Error(out.errors.join('; '));
  over(out.state);
  return out.state;
}
const ctxOf = (seed = 3) => ({ registries: reg, rng: new Rng(seedRng(seed)) });
const refuse = () => ({ registries: reg, rng: { chance: () => false, int: () => 0, float: () => 0.99 } as unknown as Rng });
const seq = (...answers: boolean[]) => { let i = 0; return { registries: reg, rng: { chance: () => answers[i++] ?? false, int: () => 0, float: () => 0.99 } as unknown as Rng }; };
const accept = () => ({ registries: reg, rng: { chance: () => true, int: () => 0, float: () => 0 } as unknown as Rng });
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const unit = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const flags = (s: CampaignState, id: string) => s.relations[id].flags;
const suspicion = (s: CampaignState) => s.leashswap!.intrigue.suspicion;

describe('the ally check', () => {
  it('allyChance is clamp(0.2 + 0.006 × (trust − 50) + 0.1 × autonomy − 0.1 × corporate, 0.05, 0.9)', () => {
    const s = swap((x) => { x.relations[ID.cat].trust = 70; unit(x, ID.cat).values.autonomy = 2; unit(x, ID.cat).values.corporate = 0; });
    expect(allyChance(s, reg, ID.cat)).toBeCloseTo(0.2 + 0.12 + 0.2, 6);
    const low = swap((x) => { x.relations[ID.cat].trust = 0; unit(x, ID.cat).values.corporate = 2; });
    expect(allyChance(low, reg, ID.cat)).toBe(0.05);
    const high = swap((x) => { x.relations[ID.cat].trust = 100; unit(x, ID.cat).values.autonomy = 5; }); // beyond the usual −2…2: the cap holds
    expect(allyChance(high, reg, ID.cat)).toBe(0.9);
  });

  it('the ally rate matches the formula over seeds', () => {
    const s = swap((x) => { x.relations[ID.cat].trust = 50; });
    let hits = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const d = structuredClone(s);
      tryAlly(d, ctxOf(100 + i), ID.cat);
      if (flags(d, ID.cat).includes('warden_ally')) hits++;
    }
    expect(hits / N).toBeGreaterThan(0.17);
    expect(hits / N).toBeLessThan(0.23);
  });

  it('a hit marks her an ally, says ally_won and raises the suspicion by 10; a miss says ally_refused and raises it by 20', () => {
    const won = swap();
    const events = tryAlly(won, seq(true, false), ID.cat);
    expect(types(events)).toContain('ally_won');
    expect(flags(won, ID.cat)).toContain('warden_ally');
    expect(allies(won)).toEqual([ID.cat]);
    expect(suspicion(won)).toBe(10);

    const lost = swap();
    const events2 = tryAlly(lost, refuse(), ID.cat);
    expect(types(events2)).toContain('ally_refused');
    expect(flags(lost, ID.cat)).not.toContain('warden_ally');
    expect(suspicion(lost)).toBe(20);
  });

  it('a corporate refuser reports at once: a discovery', () => {
    const s = swap((x) => { unit(x, ID.cat).values.corporate = 2; });
    const events = tryAlly(s, refuse(), ID.cat);
    expect(types(events)).toEqual(expect.arrayContaining(['ally_refused', 'intrigue_discovered']));
    expect(wardenOf(s)!.satisfaction).toBeLessThan(60);
  });

  it('one conspired per unit per day', () => {
    const s = swap();
    expect(tryAlly(s, refuse(), ID.cat)).not.toEqual([]);
    const before = suspicion(s);
    expect(tryAlly(s, accept(), ID.cat)).toEqual([]);
    expect(suspicion(s)).toBe(before);
    expect(flags(s, ID.cat)).not.toContain('warden_ally');
    s.day += 1;
    expect(types(tryAlly(s, accept(), ID.cat))).toContain('ally_won');
  });

  it('the warden herself and a unit already an ally draw nothing', () => {
    const s = swap();
    const ctx = ctxOf(5);
    const rng = ctx.rng.state;
    expect(tryAlly(s, ctx, ID.bea)).toEqual([]);
    flags(s, ID.cat).push('warden_ally');
    expect(tryAlly(s, ctx, ID.cat)).toEqual([]);
    expect(ctx.rng.state).toEqual(rng);
  });

  it('no mode, or no warden in service: no draw and nothing happens', () => {
    const plain = buildCampaign({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea'].map((n) => unitSetup(n)) }, reg, { desireBondDefects: false, seed: 4 });
    if (!plain.ok) throw new Error('setup');
    const ctx = ctxOf(5);
    const rng = ctx.rng.state;
    expect(tryAlly(plain.state, ctx, ID.ann)).toEqual([]);
    expect(addSuspicion(plain.state, ctx, 30, 'x')).toEqual([]);
    const s = swap((x) => { x.leashswap!.status = 'investigation'; delete x.leashswap!.warden; });
    expect(tryAlly(s, ctx, ID.cat)).toEqual([]);
    expect(addSuspicion(s, ctx, 30, 'x')).toEqual([]);
    expect(ctx.rng.state).toEqual(rng);
  });
});

describe('conspired is offered only without the warden present', () => {
  it('the model is told which units it may name: present, not the warden, not an ally, not asked today', () => {
    const s = swap();
    expect(conspireInput(s, reg, [ID.ann, ID.cat])).toEqual({ conspire: [ID.ann, ID.cat] });
    expect(conspireInput(s, reg, [ID.ann, ID.bea])).toEqual({}); // the warden is present
    flags(s, ID.cat).push('warden_ally');
    expect(conspireInput(s, reg, [ID.ann, ID.cat])).toEqual({ conspire: [ID.ann] });
    s.leashswap!.intrigue.lastAllyDay[ID.ann] = s.day;
    expect(conspireInput(s, reg, [ID.ann, ID.cat])).toEqual({});
  });

  it('nothing is offered in the default mode, or while no warden is in service', () => {
    const plain = buildCampaign({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea'].map((n) => unitSetup(n)) }, reg, { desireBondDefects: false, seed: 4 });
    if (!plain.ok) throw new Error('setup');
    expect(conspireInput(plain.state, reg, [ID.ann])).toEqual({});
    const s = swap((x) => { x.leashswap!.status = 'investigation'; delete x.leashswap!.warden; });
    expect(conspireInput(s, reg, [ID.ann])).toEqual({});
  });

  it('the extraction drops a conspired that names nobody it was shown, and keeps one that does', () => {
    const raw = { events: [{ type: 'conspired', actor: 'commander', targets: [ID.cat], severity: 'moderate', evidence: 'quiet words', confidence: 1 }] };
    const ctx = { participants: [ID.cat], squad: [{ id: ID.cat }], minConfidence: 0.5, romance: false };
    expect(sanitizeIntentOutput(raw, ctx).intents.events).toHaveLength(0);
    expect(sanitizeIntentOutput(raw, { ...ctx, conspire: [ID.cat] }).intents.events).toHaveLength(1);
    expect(sanitizeIntentOutput({ events: [{ ...raw.events[0], actor: ID.cat }] }, { ...ctx, conspire: [ID.cat] }).intents.events).toHaveLength(0);
  });

  it('a conspired in a scene without her runs the ally check', () => {
    let s = swap((x) => { x.relations[ID.cat].trust = 100; unit(x, ID.cat).values.autonomy = 2; });
    s = dispatch(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.cat], origin: 'event', consumesSlot: false, startIndex: 0 } }, reg).state;
    const ev = { type: 'conspired', actor: 'commander', targets: [ID.cat], severity: 'moderate', evidence: 'quiet words', confidence: 1 };
    const r = dispatch(s, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [ev] } } }, reg);
    expect(r.events.find((e) => e.type === 'error')).toBeUndefined();
    expect(types(r.events).some((t) => t === 'ally_won' || t === 'ally_refused')).toBe(true);
    expect(r.state.leashswap!.intrigue.lastAllyDay[ID.cat]).toBe(r.state.day);
    // an event naming a unit who is not in the offer (the warden's own scene) does nothing
    const withHer = dispatch(swap(), { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.cat, ID.bea], origin: 'event', consumesSlot: false, startIndex: 0 } }, reg).state;
    const r2 = dispatch(withHer, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [ev] } } }, reg);
    expect(types(r2.events)).not.toContain('ally_won');
    expect(types(r2.events)).not.toContain('ally_refused');
  });
});

describe('discovery', () => {
  it('satisfaction −40, defiance +25, an immediate punishment, hack reset, allies marked, suspicion 40', () => {
    const s = swap((x) => {
      const ls = x.leashswap!;
      ls.intrigue.hack.step = 2;
      ls.intrigue.suspicion = 70;
      x.relations[ID.cat].flags.push('warden_ally');
      wardenOf(x)!.satisfaction = 80;
    });
    const events = intrigueDiscovered(s, ctxOf(), 'test');
    const w = wardenOf(s)!;
    expect(w.satisfaction).toBeGreaterThanOrEqual(40); // 80 − 40, then the punishment pleases her a little
    expect(w.satisfaction).toBeLessThanOrEqual(60);
    expect(types(events)).toEqual(expect.arrayContaining(['intrigue_discovered', 'warden_betrayed', 'commander_punished']));
    expect(events.find((e) => e.type === 'commander_punished')).toMatchObject({ punishmentId: expect.any(String) });
    expect(s.leashswap!.intrigue.hack.step).toBe(0);
    expect(suspicion(s)).toBe(40);
    expect(flags(s, ID.cat)).toContain('warden_knows_ally');
    expect(s.leashswap!.intrigue.discovered).toBe(1);
  });

  it('the punishment is the highest severity allowed: a Leash punishment when she has an authorization, else the next lower', () => {
    const a = swap();
    const sev = (s: CampaignState): number => (s.leashswap!.warden!.punishLog.at(-1)?.severity ?? 0);
    intrigueDiscovered(a, ctxOf(), 'x');
    expect(sev(a)).toBe(4);
    const b = swap((x) => { wardenOf(x)!.leashLeft = 0; });
    intrigueDiscovered(b, ctxOf(), 'x');
    expect(sev(b)).toBe(3);
  });

  it('draws no punishment roll: the same state and a different rng give the same punishment', () => {
    const a = swap();
    const b = swap();
    intrigueDiscovered(a, ctxOf(1), 'x');
    intrigueDiscovered(b, ctxOf(2), 'x');
    expect(wardenOf(a)!.punishLog).toEqual(wardenOf(b)!.punishLog);
  });

  it('the betrayal is an extreme relation event on her', () => {
    const s = swap();
    const trust = s.relations[ID.bea].trust;
    const events = intrigueDiscovered(s, ctxOf(), 'x');
    expect(events.find((e) => e.type === 'warden_betrayed')).toMatchObject({ unitId: ID.bea, severity: 'extreme' });
    expect(s.relations[ID.bea].trust).toBeLessThan(trust);
  });

  it('defiance +25 runs the escalation (a warning at 50)', () => {
    const s = swap((x) => { wardenOf(x)!.defiance = 30; });
    expect(types(intrigueDiscovered(s, ctxOf(), 'x'))).toContain('warden_warning');
  });

  it('the discovery draw is suspicion / 200 and certain at 100', () => {
    const N = 2000;
    let found = 0;
    for (let i = 0; i < N; i++) {
      const d = swap((x) => { x.leashswap!.intrigue.suspicion = 40; });
      if (types(addSuspicion(d, ctxOf(500 + i), 20, 'dig')).includes('intrigue_discovered')) found++;
    }
    expect(found / N).toBeGreaterThan(0.26); // 60 / 200 = 0.3
    expect(found / N).toBeLessThan(0.34);

    const sure = swap((x) => { x.leashswap!.intrigue.suspicion = 90; });
    const ctx = ctxOf(7);
    const rng = ctx.rng.state;
    expect(types(addSuspicion(sure, ctx, 15, 'dig'))).toContain('intrigue_discovered');
    expect(ctx.rng.state).toEqual(rng); // certain: no draw
  });

  it('suspicion is clamped to 0–100 and decays 3 a day', () => {
    const s = swap((x) => { x.leashswap!.intrigue.suspicion = 50; });
    wardenDayStep(s, ctxOf());
    expect(suspicion(s)).toBe(47);
    s.leashswap!.intrigue.suspicion = 2;
    wardenDayStep(s, ctxOf());
    expect(suspicion(s)).toBe(0);
    const inv = swap((x) => { x.leashswap!.intrigue.suspicion = 30; });
    startRemoval(inv, ctxOf(), 'hack'); // nobody holds the leash now, and the investigation is far from over
    wardenDayStep(inv, ctxOf());
    expect(suspicion(inv)).toBe(27); // it fades even while nobody holds the leash
  });

  it('no event, toast or reading carries the suspicion', () => {
    const s = swap((x) => { x.leashswap!.intrigue.suspicion = 77; });
    const all: EngineEvent[] = [...addSuspicion(s, accept(), 5, 'dig'), ...tryAlly(s, refuse(), ID.cat), ...intrigueDiscovered(s, ctxOf(), 'x')];
    const text = JSON.stringify(all);
    expect(text.toLowerCase()).not.toContain('suspicion');
    expect(text).not.toContain('"77"');
  });
});
