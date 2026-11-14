import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { recordOf } from '../../../src/engine/discipline/record';
import { type CampaignState } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { setRecord } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = base;
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const fresh = (day = 3): CampaignState => {
  const s = campaign(reg, 4);
  s.day = day;
  s.resources.supplies = 100;
  return s;
};
const ev = (type: string, over: Record<string, unknown> = {}) => ({
  type, actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'a quote', confidence: 0.9, ...over,
});
const apply = (s: CampaignState, events: unknown[], channel: 'scene' | 'dm' = 'dm') => {
  const r = run(s, reg, { type: 'intents/apply', payload: channel === 'scene' ? { channel, intents: { events } } : { channel, unitId: ANN, intents: { events } } });
  expect(errors(r.events)).toEqual([]);
  return r;
};
const threaten = (s: CampaignState, measure = 'unspecified', channel: 'scene' | 'dm' = 'dm') => apply(s, [ev('threatened', { measure })], channel);
const stepEvents = (s: CampaignState): { state: CampaignState; events: Array<{ type: string; [k: string]: unknown }> } => {
  const start = s.day;
  let cur = s;
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  for (let i = 0; i < 5 && cur.day === start; i++) {
    const r = run(cur, reg, { type: 'calendar/consume_slot' });
    expect(errors(r.events)).toEqual([]);
    cur = r.state;
    events.push(...r.events);
  }
  return { state: cur, events };
};

describe('registering a threat', () => {
  it('stores one pending threat with its deadline at the end of the next day', () => {
    const r = threaten(fresh(3), 'brig');
    expect(r.state.discipline!.threats).toHaveLength(1);
    expect(r.state.discipline!.threats[0]).toMatchObject({ unitId: ANN, measure: 'brig', day: 3, deadlineDay: 4, channel: 'dm' });
    expect(ofType(r.events, 'threat_registered')).toMatchObject([{ unitId: ANN, measure: 'brig', believed: true }]);
  });

  it('keeps an inverse of the deltas the threatened row applied', () => {
    const s = fresh(3);
    const r = threaten(s);
    const t = r.state.discipline!.threats[0];
    expect(t.inverse.axes?.affinity).toBe(r.state.relations[ANN].affinity - s.relations[ANN].affinity);
    expect(t.inverse.stress).toBe(r.state.squad[0].stress - s.squad[0].stress);
  });

  it('belief is fixed at registration: a bold unit does not believe it, a cowed one does', () => {
    const bold = threaten(setRecord(fresh(), ANN, 40));
    expect(bold.state.discipline!.threats[0].believed).toBe(false);
    expect(ofType(bold.events, 'threat_registered')[0].believed).toBe(false);
    const cowed = threaten(setRecord(fresh(), ANN, -40));
    expect(cowed.state.discipline!.threats[0].believed).toBe(true);
    // a record that changes later does not change what she believed
    setRecord(cowed.state, ANN, 40);
    expect(cowed.state.discipline!.threats[0].believed).toBe(true);
  });

  it('a scene threat remembers its scene and message', () => {
    const s0 = run(fresh(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const r = run(s0, reg, { type: 'intents/apply', payload: { channel: 'scene', messageRef: 'chat:4', intents: { events: [ev('threatened')] } } });
    expect(r.state.discipline!.threats[0]).toMatchObject({ channel: 'scene', sceneId: s0.scene!.id, messageRef: 'chat:4' });
  });

  it('a second threat replaces the measure and keeps the first deadline', () => {
    const first = threaten(fresh(3), 'revoke_rations').state;
    first.day = 4;
    const second = threaten(first, 'brig').state;
    expect(second.discipline!.threats).toHaveLength(1);
    expect(second.discipline!.threats[0]).toMatchObject({ measure: 'brig', day: 4, deadlineDay: 4 });
  });

  it('a threat on another unit is a second threat', () => {
    const s = threaten(fresh()).state;
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: BEA, intents: { events: [ev('threatened', { targets: [BEA] })] } } });
    expect(r.state.discipline!.threats.map((t) => t.unitId).sort()).toEqual([ANN, BEA]);
  });
});

describe('a threat that is not carried out', () => {
  it('lapses into commander_yielded at the end of the next day', () => {
    let s = threaten(fresh(3)).state;
    const r1 = stepEvents(s);
    expect(r1.state.day).toBe(4);
    expect(r1.state.discipline!.threats).toHaveLength(1); // day 3 ended: the deadline is the end of day 4
    s = r1.state;
    const r2 = stepEvents(s);
    expect(r2.state.day).toBe(5);
    expect(r2.state.discipline!.threats).toEqual([]);
    expect(ofType(r2.events, 'threat_lapsed')).toMatchObject([{ unitId: ANN, measure: 'unspecified' }]);
    expect(ofType(r2.events, 'impunity_changed')).toMatchObject([{ unitId: ANN, delta: 6 }]);
    expect(r2.state.relations[ANN].history.some((h) => h.type === 'commander_yielded' && h.severity === 'moderate')).toBe(true);
    expect(recordOf(r2.state, ANN)).toBe(5); // +6, then the day's decay
  });

  it('a brig or leash threat lapses as major (+10)', () => {
    for (const measure of ['brig', 'leash']) {
      const s = threaten(fresh(3), measure).state;
      s.day = 4; // already on the deadline day
      const r = stepEvents(s);
      expect(ofType(r.events, 'impunity_changed'), measure).toMatchObject([{ delta: 10 }]);
      expect(r.state.relations[ANN].history.some((h) => h.type === 'commander_yielded' && h.severity === 'major'), measure).toBe(true);
    }
  });

  it('a lighter punishment lapses as moderate (a severity 2 threat is +6)', () => {
    const s = threaten(fresh(3), 'revoke_rations').state;
    s.day = 4;
    expect(ofType(stepEvents(s).events, 'impunity_changed')).toMatchObject([{ delta: 6 }]);
  });

  it('an extracted yield lapses the threat at once and does not yield twice', () => {
    const t = threaten(fresh(3)).state;
    const y = apply(t, [ev('commander_yielded')]);
    expect(y.state.discipline!.threats).toEqual([]);
    expect(ofType(y.events, 'threat_lapsed')).toMatchObject([{ unitId: ANN }]);
    expect(recordOf(y.state, ANN)).toBe(6);
    y.state.day = 4;
    const later = stepEvents(y.state);
    expect(ofType(later.events, 'impunity_changed')).toEqual([]);
    expect(recordOf(later.state, ANN)).toBe(5); // only the decay
  });
});

describe('an enforcement keeps the threat', () => {
  const keptBy = (threat: string, measure: string): boolean => {
    const t = threaten(fresh(3), threat).state;
    const r = apply(t, [ev('commander_enforced', { measure })]);
    return r.state.discipline!.threats.length === 0 && ofType(r.events, 'threat_kept').length === 1;
  };

  it('before the deadline: no yield and a threat_kept event', () => {
    const t = threaten(fresh(3)).state;
    const r = apply(t, [ev('commander_enforced', { measure: 'verbal' })]);
    expect(r.state.discipline!.threats).toEqual([]);
    expect(ofType(r.events, 'threat_kept')).toMatchObject([{ unitId: ANN, measure: 'unspecified' }]);
    r.state.day = 4;
    expect(ofType(stepEvents(r.state).events, 'threat_lapsed')).toEqual([]);
  });

  it('the same measure, an equal or heavier one and any measure on an unspecified threat keep it', () => {
    expect(keptBy('brig', 'brig')).toBe(true);
    expect(keptBy('revoke_rations', 'brig')).toBe(true);
    expect(keptBy('revoke_rations', 'revoke_rations')).toBe(true);
    expect(keptBy('unspecified', 'verbal')).toBe(true);
  });

  it('a lighter measure does not keep a heavier threat', () => {
    expect(keptBy('brig', 'verbal')).toBe(false);
    expect(keptBy('brig', 'revoke_rations')).toBe(false);
    const t = threaten(fresh(3), 'brig').state;
    const r = apply(t, [ev('commander_enforced', { measure: 'verbal' })]);
    expect(r.state.discipline!.threats).toHaveLength(1);
  });

  it('an enforcement on another unit keeps nothing', () => {
    const t = threaten(fresh(3)).state;
    const r = apply(t, [ev('commander_enforced', { targets: [BEA], measure: 'verbal' })]);
    expect(r.state.discipline!.threats).toHaveLength(1);
  });

  it('a measure the registry no longer has keeps a threat only by being the same', () => {
    const t = threaten(fresh(3), 'brig').state;
    const gone: Registries = { ...reg, punishments: new Map([['verbal', { id: 'verbal', severity: 1 }]]) };
    const r = run(t, gone, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events: [ev('commander_enforced', { measure: 'verbal' })] } } });
    expect(r.state.discipline!.threats).toHaveLength(1);
  });
});
