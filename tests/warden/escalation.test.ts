import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type EngineEvent } from '../../src/engine/dispatch';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { addDefiance, checkEscalation, wardenDayStep, wardenOf, type DeathRule } from '../../src/engine/warden';
import { wardenDirectives } from '../../src/warden/directives';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/scene';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

function swap(rule: DeathRule = 'rewind_day'): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: rule, warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 9 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
}
const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const rise = (s: CampaignState, n: number): EngineEvent[] => addDefiance(s, ctxOf(s), n);

describe('two warnings on different days', () => {
  it('0 → 100 in one day: warning 1 and defiance 74; next day +30: warning 2 and 99; the day after +5: terminated', () => {
    const s = swap();
    const w = wardenOf(s)!;
    let events = rise(s, 100);
    expect(types(events)).toContain('warden_warning');
    expect(events.find((e) => e.type === 'warden_warning')).toMatchObject({ level: 1 });
    expect(w.defiance).toBe(74);
    expect(w.warnings).toEqual([{ level: 1, day: s.day }]);
    expect(s.ended).toBeUndefined();

    s.day += 1;
    events = rise(s, 30);
    expect(events.find((e) => e.type === 'warden_warning')).toMatchObject({ level: 2 });
    expect(w.defiance).toBe(99);
    expect(w.warnings.map((x) => x.level)).toEqual([1, 2]);
    expect(types(events)).not.toContain('commander_terminated');

    s.day += 1;
    events = rise(s, 5);
    expect(types(events)).toEqual(expect.arrayContaining(['commander_terminated', 'commander_died']));
  });

  it('warning 2 the same day as warning 1 is held at 74', () => {
    const s = swap();
    rise(s, 60);
    expect(wardenOf(s)!.warnings).toHaveLength(1);
    const events = rise(s, 40);
    expect(types(events)).not.toContain('warden_warning');
    expect(wardenOf(s)!.defiance).toBe(74);
    expect(wardenOf(s)!.warnings).toHaveLength(1);
  });

  it('reaching 100 with two warnings issued today is held at 99; one issued before today terminates', () => {
    const s = swap();
    const w = wardenOf(s)!;
    w.warnings = [{ level: 1, day: s.day - 2 }, { level: 2, day: s.day }];
    w.defiance = 90;
    expect(types(rise(s, 20))).not.toContain('commander_terminated');
    expect(w.defiance).toBe(99);
    w.warnings = [{ level: 1, day: s.day - 2 }, { level: 2, day: s.day - 1 }];
    expect(types(rise(s, 20))).toContain('commander_terminated');
  });

  it('a first crossing of 50 warns once; later rises do not repeat it', () => {
    const s = swap();
    expect(types(rise(s, 55))).toContain('warden_warning');
    expect(types(rise(s, 5))).not.toContain('warden_warning');
    expect(wardenOf(s)!.warnings).toHaveLength(1);
  });

  it('no warning below 50, and a fall never warns', () => {
    const s = swap();
    expect(types(rise(s, 49))).toEqual([]);
    expect(rise(s, -20)).toEqual([]);
    expect(wardenOf(s)!.defiance).toBe(29);
    expect(rise(s, -100)).toEqual([]);
    expect(wardenOf(s)!.defiance).toBe(0);
  });

  it('checkEscalation alone is idempotent', () => {
    const s = swap();
    wardenOf(s)!.defiance = 60;
    expect(types(checkEscalation(s, ctxOf(s)))).toEqual(['warden_warning']);
    expect(checkEscalation(s, ctxOf(s))).toEqual([]);
  });
});

describe('termination', () => {
  it('with rewind_day emits commander_died and changes nothing else about the campaign', () => {
    const s = swap('rewind_day');
    const w = wardenOf(s)!;
    w.warnings = [{ level: 1, day: s.day - 2 }, { level: 2, day: s.day - 1 }];
    w.defiance = 99;
    const events = rise(s, 5);
    expect(events.find((e) => e.type === 'commander_terminated')).toBeDefined();
    expect(events.find((e) => e.type === 'commander_died')).toMatchObject({ rule: 'rewind_day', cause: 'terminated' });
    expect(s.ended).toBeUndefined();
    expect(types(events)).not.toContain('campaign_ended');
  });

  it('with campaign_end closes the campaign', () => {
    const s = swap('campaign_end');
    const w = wardenOf(s)!;
    w.warnings = [{ level: 1, day: s.day - 2 }, { level: 2, day: s.day - 1 }];
    w.defiance = 99;
    rise(s, 5);
    expect(s.ended).toEqual({ day: s.day, cause: 'terminated' });
  });
});

describe('where defiance rises', () => {
  it('a DEFY that crosses 50 warns; one that would terminate skips the punishment', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = swap();
      s.rng = seedRng(seed);
      const w = wardenOf(s)!;
      w.expectations = [{ id: 'e1', kind: 'keep_me_close', weight: 1, source: 'values', known: false }];
      w.satisfaction = 0;
      w.defiance = 40; // +30 on a defy
      const hit = dispatch(s, { type: 'activity/do', payload: { activityId: 'train', companionId: 'unit_ann' } }, reg);
      const ov = wardenOf(hit.state)?.override;
      if (!ov) continue;
      const r = dispatch(hit.state, { type: 'warden/answer', payload: { overrideId: ov.id, answer: 'defy' } }, reg);
      expect(types(r.events)).toContain('warden_warning');
      expect(wardenOf(r.state)!.warnings).toHaveLength(1);
      return;
    }
    throw new Error('no seed overrides');
  });

  it('an expectation_broken that crosses 50 warns too', () => {
    const s = swap();
    const w = wardenOf(s)!;
    w.expectations = [{ id: 'x1', kind: 'meet_quota', weight: 0.5, source: 'values', known: false }];
    w.defiance = 40;
    const started = dispatch(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: ['unit_bea'], origin: 'event', consumesSlot: false, startIndex: 0 } }, reg).state;
    const r = dispatch(started, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'expectation_broken', actor: 'commander', targets: ['unit_bea'], severity: 'major', evidence: 'x', confidence: 1, expectationId: 'x1' }] } } }, reg);
    expect(types(r.events)).toContain('warden_warning');
  });

  it('draws nothing, and does nothing without a warden', () => {
    const s = swap();
    const ctx = ctxOf(s);
    const before = structuredClone(ctx.rng.state);
    addDefiance(s, ctx, 80);
    expect(ctx.rng.state).toEqual(before);
    delete s.leashswap;
    expect(addDefiance(s, ctxOf(s), 80)).toEqual([]);
  });
});

describe('the day step', () => {
  it('defiance decays by 2 a day, never below 0, with no escalation', () => {
    const s = swap();
    wardenOf(s)!.defiance = 51;
    expect(wardenDayStep(s, ctxOf(s))).toEqual([]);
    expect(wardenOf(s)!.defiance).toBe(49);
    wardenOf(s)!.defiance = 1;
    wardenDayStep(s, ctxOf(s));
    expect(wardenOf(s)!.defiance).toBe(0);
  });
});

describe('the warning directive', () => {
  it('appears while defiance is 50 or more with a warning, names her, has no pronoun for the commander and clears below 50', () => {
    const s = swap();
    s.scene = { id: 's1', participants: ['unit_bea'], day: s.day, slot: s.slot, locationId: 'comms_room', mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    expect(wardenDirectives(s, reg).some((d) => d.id === 'warden:warning')).toBe(false);
    rise(s, 60);
    const d = wardenDirectives(s, reg).find((x) => x.id === 'warden:warning')!;
    expect(d.text).toContain('Bea');
    expect(d.text).not.toMatch(/\b(he|him|his)\b/i);
    expect(d.text).toMatch(/warn/i);
    wardenOf(s)!.warnings.push({ level: 2, day: s.day });
    expect(wardenDirectives(s, reg).find((x) => x.id === 'warden:warning')!.text).toMatch(/final/i);
    wardenOf(s)!.defiance = 49;
    expect(wardenDirectives(s, reg).some((x) => x.id === 'warden:warning')).toBe(false);
  });
});
