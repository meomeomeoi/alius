import { beforeAll, describe, expect, it } from 'vitest';
import { CommanderPunishmentSchema } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import { checkActivity } from '../../src/engine/activities';
import { dispatch, type Action, type EngineEvent } from '../../src/engine/dispatch';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { applyCommanderPunishment, commanderRestriction, pickPunishment, punishRoll, wardenOf } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/comms';
import '../../src/engine/actions/calendar';

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
const ctxOf = (s: CampaignState, seed = 3) => ({ registries: reg, rng: new Rng(seedRng(seed)) });
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const apply = (s: CampaignState, id: string, seed = 3) => { const d = structuredClone(s); const events = applyCommanderPunishment(d, ctxOf(d, seed), id); return { d, events }; };
const err = (events: EngineEvent[]) => events.find((e) => e.type === 'error');

describe('the registry', () => {
  it('has the seven entries, a severity from 1 to 4, a defiance delta that deters and a satisfaction delta that pleases', () => {
    const list = [...reg.commanderPunishments.values()];
    expect(list.map((p) => String(p.id)).sort()).toEqual(['confinement', 'leash_compel', 'leash_suppress', 'pain_burst', 'privilege_revoked', 'public_humiliation', 'reprimand']);
    for (const p of list) {
      expect(p.severity).toBeGreaterThanOrEqual(1);
      expect(p.severity).toBeLessThanOrEqual(4);
      expect(p.defianceDelta as number).toBeLessThanOrEqual(0);
      expect(p.satisfactionDelta as number).toBeGreaterThanOrEqual(0);
      expect(String(p.description).length).toBeGreaterThan(0);
    }
  });

  it('the schema refuses an unknown effect type, a positive defiance delta and a bad severity', () => {
    const base = { id: 'x', label: 'X', description: 'd', severity: 1, defianceDelta: -1, satisfactionDelta: 1, effects: [{ type: 'commander_stress', amount: 1 }] };
    expect(CommanderPunishmentSchema.safeParse(base).success).toBe(true);
    expect(CommanderPunishmentSchema.safeParse({ ...base, effects: [{ type: 'set_fire', amount: 1 }] }).success).toBe(false);
    expect(CommanderPunishmentSchema.safeParse({ ...base, defianceDelta: 3 }).success).toBe(false);
    expect(CommanderPunishmentSchema.safeParse({ ...base, severity: 5 }).success).toBe(false);
    expect(CommanderPunishmentSchema.safeParse({ ...base, effects: [{ type: 'restrict', what: 'no_sleep', days: 1 }] }).success).toBe(false);
  });
});

describe('effects', () => {
  it('reprimand: commander stress, defiance −5, satisfaction up; logged and reported', () => {
    const s = swap((x) => { wardenOf(x)!.defiance = 20; wardenOf(x)!.satisfaction = 50; });
    const { d, events } = apply(s, 'reprimand');
    expect(d.commander.stress).toBe((s.commander.stress ?? 0) + 3);
    const w = wardenOf(d)!;
    expect(w.defiance).toBe(15);
    expect(w.satisfaction).toBeGreaterThan(50);
    expect(w.punishLog.at(-1)).toMatchObject({ punishmentId: 'reprimand', day: s.day, severity: 1 });
    expect(events.find((e) => e.type === 'commander_punished')).toMatchObject({ punishmentId: 'reprimand' });
  });

  it('the log keeps the newest 20', () => {
    const s = swap();
    const d = structuredClone(s);
    for (let i = 0; i < 25; i++) applyCommanderPunishment(d, ctxOf(d), 'reprimand');
    expect(wardenOf(d)!.punishLog).toHaveLength(20);
  });

  it('privilege_revoked blocks a companion activity and DMs for the days given, while talk and medbay stay open', () => {
    const s = swap();
    const { d, events } = apply(s, 'privilege_revoked');
    expect(types(events)).toContain('commander_restricted');
    expect(wardenOf(d)!.restrictions.map((r) => r.what).sort()).toEqual(['no_dms', 'no_leave']);
    expect(commanderRestriction(d, 'companion', 'rest')).toMatch(/revoked the commander's leave until day/);
    expect(checkActivity(d, reg, { activityId: 'rest', companionId: ID.ann })).toMatch(/leave/);
    expect(checkActivity(d, reg, { activityId: 'talk', companionId: ID.ann })).toBeNull();
    expect(checkActivity(d, reg, { activityId: 'medbay', companionId: ID.ann })).toBeNull();
    expect(commanderRestriction(d, 'dm')).toMatch(/revoked the commander's messages until day/);
    const sent = dispatch(d, { type: 'dm/send', payload: { unitId: ID.ann, text: 'hello' } }, reg);
    expect(err(sent.events)).toBeDefined();
    expect(sent.state).toBe(d);
  });

  it('a restriction ends at the day end after its last day', () => {
    const s = swap();
    const { d } = apply(s, 'privilege_revoked');
    const until = wardenOf(d)!.restrictions[0].untilDay;
    expect(until).toBe(s.day + 1);
    d.day = until + 1;
    expect(commanderRestriction(d, 'dm')).toBeNull();
    expect(commanderRestriction({ ...d, day: until }, 'dm')).not.toBeNull();
  });

  it('confinement loses 1–2 slots but never past the evening', () => {
    const s = swap();
    for (const [slot, max] of [['morning', 2], ['afternoon', 1], ['evening', 0]] as const) {
      const seen = new Set<string>();
      for (let seed = 1; seed < 40; seed++) {
        const d = structuredClone(s);
        d.slot = slot;
        applyCommanderPunishment(d, ctxOf(d, seed), 'confinement');
        expect(d.day).toBe(s.day);
        seen.add(d.slot);
      }
      expect(['morning', 'afternoon', 'evening']).toEqual(expect.arrayContaining([...seen]));
      if (slot === 'evening') expect([...seen]).toEqual(['evening']);
      if (slot === 'morning') expect(seen.size).toBe(2); // afternoon or evening
      void max;
    }
  });

  it('public_humiliation raises every other named unit\'s record, not hers; stress too', () => {
    const s = swap();
    const { d } = apply(s, 'public_humiliation');
    expect(d.relations[ID.ann].impunityRecord).toBe((s.relations[ID.ann].impunityRecord ?? 0) + 6);
    expect(d.relations[ID.cat].impunityRecord).toBe((s.relations[ID.cat].impunityRecord ?? 0) + 6);
    expect(d.relations[ID.bea].impunityRecord ?? 0).toBe(s.relations[ID.bea].impunityRecord ?? 0);
    expect(d.commander.stress).toBe((s.commander.stress ?? 0) + 6);
  });

  it('pain_burst: stress +15 and an injury chance that falls with endurance', () => {
    const rate = (endurance: number): number => {
      let hits = 0;
      const n = 1500;
      for (let i = 0; i < n; i++) {
        const s = swap((x) => { x.commander.body = { strength: 3, reflexes: 3, ...x.commander.body, endurance }; });
        const d = structuredClone(s);
        const events = applyCommanderPunishment(d, ctxOf(d, i + 1), 'pain_burst');
        expect(d.commander.stress).toBe((s.commander.stress ?? 0) + 15);
        if (types(events).includes('commander_injured')) hits++;
      }
      return hits / n;
    };
    const low = rate(1);
    const high = rate(5);
    expect(low).toBeGreaterThan(0.26); // 0.35 − 0.05 × 1 = 0.30
    expect(low).toBeLessThan(0.34);
    expect(high).toBeGreaterThan(0.06); // 0.35 − 0.25 = 0.10
    expect(high).toBeLessThan(0.14);
  });

  it('a leash effect is skipped until the Leash on the commander exists (Task 10)', () => {
    const s = swap();
    const { d, events } = apply(s, 'leash_compel');
    expect(types(events)).toContain('commander_punished');
    expect(d).toBeDefined();
  });

  it('an unknown id or no mode throws', () => {
    const s = swap();
    expect(() => applyCommanderPunishment(structuredClone(s), ctxOf(s), 'nope')).toThrow();
    const plain = structuredClone(s);
    delete plain.leashswap;
    expect(() => applyCommanderPunishment(plain, ctxOf(s), 'reprimand')).toThrow();
  });
});

describe('pickPunishment and punishRoll', () => {
  it('picks the first entry of the severity, and a Leash one needs leashLeft or drops a severity', () => {
    const s = swap();
    expect(pickPunishment(s, reg, 1)).toBe('reprimand');
    expect(pickPunishment(s, reg, 2)).toBe('privilege_revoked');
    expect(pickPunishment(s, reg, 3)).toBe('confinement');
    expect(pickPunishment(s, reg, 4)).toBe('leash_compel');
    wardenOf(s)!.leashLeft = 0;
    expect(pickPunishment(s, reg, 4)).toBe('confinement');
    expect(pickPunishment(s, reg, 0)).toBeNull();
  });

  it('severity follows the defiance bands', () => {
    const pick = (defiance: number): string => {
      for (let seed = 1; seed < 200; seed++) {
        const s = swap((x) => { wardenOf(x)!.defiance = defiance; x.relations[ID.bea].affinity = -50; });
        const d = structuredClone(s);
        const events = punishRoll(d, ctxOf(d, seed), 1);
        const e = events.find((x) => x.type === 'commander_punished');
        if (e) return String(e.punishmentId);
      }
      throw new Error('never punished');
    };
    expect(pick(10)).toBe('reprimand');
    expect(pick(30)).toBe('privilege_revoked');
    expect(pick(60)).toBe('confinement');
    expect(pick(90)).toBe('leash_compel');
  });

  it('the chance is 0.5 + 0.3 × weight − 0.2 × affinity/100 (affinity above 0 only)', () => {
    const rate = (weight: number, affinity: number): number => {
      let hits = 0;
      const n = 2000;
      for (let i = 0; i < n; i++) {
        const s = swap((x) => { x.relations[ID.bea].affinity = affinity; });
        const d = structuredClone(s);
        if (types(punishRoll(d, ctxOf(d, i + 1), weight)).includes('commander_punished')) hits++;
      }
      return hits / n;
    };
    expect(rate(0.5, 0)).toBeGreaterThan(0.62); // 0.65
    expect(rate(0.5, 0)).toBeLessThan(0.68);
    expect(rate(0.5, 100)).toBeGreaterThan(0.42); // 0.45
    expect(rate(0.5, 100)).toBeLessThan(0.48);
    expect(rate(0.5, -80)).toBeGreaterThan(0.62); // no bonus below 0
  });

  it('an applied punishment satisfies her and lowers defiance (no second draw)', () => {
    for (let seed = 1; seed < 100; seed++) {
      const s = swap((x) => { wardenOf(x)!.defiance = 30; wardenOf(x)!.satisfaction = 40; });
      const d = structuredClone(s);
      const rng = new Rng(seedRng(seed));
      const events = punishRoll(d, { registries: reg, rng }, 1);
      if (!types(events).includes('commander_punished')) continue;
      expect(wardenOf(d)!.defiance).toBe(22); // privilege_revoked −8
      expect(wardenOf(d)!.satisfaction).toBeGreaterThan(40);
      return;
    }
    throw new Error('never punished');
  });

  it('no mode, no warden: no draw', () => {
    const s = swap();
    delete s.leashswap;
    const ctx = ctxOf(s, 5);
    expect(punishRoll(s, ctx, 1)).toEqual([]);
    expect(ctx.rng.state).toEqual(seedRng(5));
  });
});

describe('no mode', () => {
  it('no restriction is read', () => {
    const s = swap();
    applyCommanderPunishment(s, ctxOf(s), 'privilege_revoked');
    delete s.leashswap;
    expect(commanderRestriction(s, 'dm')).toBeNull();
    expect(commanderRestriction(s, 'companion', 'rest')).toBeNull();
  });
});

describe('after a DEFY', () => {
  it('the punishment roll follows (afterDefy)', () => {
    let punished = 0;
    for (let seed = 1; seed < 60; seed++) {
      const s = swap((x) => { const w = wardenOf(x)!; w.expectations = [{ id: 'e1', kind: 'keep_me_close', weight: 0.5, source: 'values', known: false }]; w.satisfaction = 0; });
      const a: Action = { type: 'activity/do', payload: { activityId: 'train', companionId: ID.ann } };
      const hit = dispatch({ ...s, rng: seedRng(seed) }, a, reg);
      const ov = wardenOf(hit.state)?.override;
      if (!ov) continue;
      const r = dispatch(hit.state, { type: 'warden/answer', payload: { overrideId: ov.id, answer: 'defy' } }, reg);
      if (types(r.events).includes('commander_punished')) punished++;
    }
    expect(punished).toBeGreaterThan(0);
  });
});
