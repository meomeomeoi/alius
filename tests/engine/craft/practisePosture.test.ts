import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/practice';
import { registerFrameReader, resetBlockingHooks } from '../../../src/engine/blocking';
import { checkActivity } from '../../../src/engine/activities';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, BEA, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); });

type Ev = { type: string; [k: string]: unknown };

/** Ann (ritual, craft-live) has named the kneeling-open posture. */
function named(): CampaignState {
  registerFrameReader(() => 'play');
  const s = world(reg, 'play');
  unitOf(s, ANN).bond!.practice!.style = { primary: 'ritual' };
  s.slot = 'morning';
  s.practices = { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [], postures: { [ANN]: [{ postureId: 'kneel_open', name: 'Open', day: s.day }] } } as never;
  return s;
}
const practise = (s: CampaignState, over: Record<string, unknown> = {}) => run(s, reg, { type: 'activity/do', payload: { activityId: 'train', focus: 'drill_posture', holderId: ANN, presetId: 'kneel_open', ...over } });

describe('[ PRACTISE ]: a posture drill alone on one of her named postures', () => {
  it('pays the discipline once a day, grows the pair\'s knowledge of that preset, spends the slot, and drill_done carries the preset', () => {
    const s = named();
    const r = practise(s);
    expect(errors(r.events)).toEqual([]);
    const done = (r.events as Ev[]).filter((e) => e.type === 'drill_done');
    expect(done).toEqual([{ type: 'drill_done', key: 'posture', mult: 1, alone: true, xp: TUNING.craft.xp.drill, presetId: 'kneel_open' }]);
    expect(r.state.relations[ANN].craft!.postures!.kneel_open!.xp).toBe(TUNING.craft.xp.knowledge);
    expect(r.state.commander.craft!.posture!.xp).toBe(TUNING.craft.xp.drill);
    expect(r.state.slot).toBe('afternoon'); // the slot is spent
    expect((r.events as Ev[]).some((e) => e.type === 'activity_done')).toBe(true);
  });

  it('the same day again pays no xp and adds no knowledge, and the slot is spent all the same', () => {
    const first = practise(named()).state;
    const second = practise(first);
    expect(errors(second.events)).toEqual([]);
    expect((second.events as Ev[]).filter((e) => e.type === 'drill_done')).toEqual([{ type: 'drill_done', key: 'posture', mult: 1, alone: true, xp: 0, presetId: 'kneel_open' }]);
    expect(second.state.relations[ANN].craft!.postures!.kneel_open!.xp).toBe(TUNING.craft.xp.knowledge);
    expect(second.state.slot).toBe('evening');
  });

  it('without a preset it is the plain alone drill as before: no mastery, no preset on the event', () => {
    const r = run(named(), reg, { type: 'activity/do', payload: { activityId: 'train', focus: 'drill_posture' } });
    expect(errors(r.events)).toEqual([]);
    const done = (r.events as Ev[]).find((e) => e.type === 'drill_done')!;
    expect(done.presetId).toBeUndefined();
    expect(r.state.relations[ANN].craft?.postures).toBeUndefined();
  });

  it('is refused for a posture that is not hers, a holder who is not live, an unknown preset, or a malformed request; nothing is spent', () => {
    const s = named();
    for (const over of [{ presetId: 'attention' }, { holderId: BEA }, { presetId: 'no_such_preset' }]) {
      expect(checkActivity(s, reg, { activityId: 'train', focus: 'drill_posture', holderId: ANN, presetId: 'kneel_open', ...over }), JSON.stringify(over)).toMatch(/not|named|hers/i);
      const r = practise(s, over);
      expect(errors(r.events).length, JSON.stringify(over)).toBeGreaterThan(0);
      expect(r.state.slot).toBe('morning');
    }
    const eq = named();
    registerFrameReader(() => 'equal');
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(errors(practise(eq).events).length).toBeGreaterThan(0);
    expect(errors(run(s, reg, { type: 'activity/do', payload: { activityId: 'train', focus: 'drill_posture', presetId: 7 } }).events).length).toBeGreaterThan(0);
  });

  it('a preset on any other focus is ignored (it is the posture drill\'s)', () => {
    const r = run(named(), reg, { type: 'activity/do', payload: { activityId: 'train', focus: 'endurance_weight', presetId: 'kneel_open' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].craft?.postures).toBeUndefined();
  });
});
