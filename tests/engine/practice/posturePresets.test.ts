import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { COMMANDER, setBlocking } from '../../../src/engine/blocking';
import { commanderPresetOf, defaultPresetOf, presetOf, samePreset } from '../../../src/engine/blocking/presets';
import { callPosture, presetOf as presetOfViaPostures } from '../../../src/engine/practice/postures';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

/**
 * P16b, Task 10: her named postures are presets. A preset id and a base id are both read through `presetOf` (an old name on a base reads as the base's default preset, which
 * is the same pose); `blocking.commander.preset` is the preset the commander holds, set with the posture and gone when the base changes.
 */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });

function scened(): CampaignState {
  const s = withService(world(reg, 'role'));
  s.relations[ANN].stateId = 'lover';
  unitOf(s, ANN).bond!.practice!.style = { primary: 'ritual' };
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const withSet = (s: CampaignState, ids: string[]): CampaignState => {
  s.practices = { ...(s.practices ?? { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [] }), postures: { [ANN]: ids.map((postureId) => ({ postureId, name: postureId, day: s.day })) } } as never;
  return s;
};
const called = (s: CampaignState, postureId: string): CampaignState => { s.practices!.call = { id: 'pc1', holderId: ANN, postureId, sceneId: s.scene!.id, at: 3 }; return s; };
const answer = (s: CampaignState, postureId: string | undefined, late = false) => run(s, reg, { type: 'practice/take_posture', payload: { callId: 'pc1', ...(postureId !== undefined ? { postureId } : {}), late, at: 2 } });

describe('presetOf', () => {
  it('a preset id is itself; a base id is that base\'s default preset; an unknown id is nothing', () => {
    expect(presetOf(reg, 'kneel_open')?.id).toBe('kneel_open');
    expect(presetOf(reg, 'kneeling_upright')?.id).toBe('kneel_upright'); // an old name on a base
    expect(presetOf(reg, 'standing_attention')?.id).toBe('attention');
    expect(presetOf(reg, 'bowing')?.id).toBe('bow');
    expect(presetOf(reg, 'no_such_posture')).toBeUndefined();
    expect(defaultPresetOf(reg, 'kneeling_sitting')?.default).toBe(true);
    for (const base of reg.blockingPostures.keys()) expect(presetOf(reg, base), base).toBeDefined(); // every old name reads
    expect(presetOfViaPostures).toBe(presetOf);
  });

  it('two names are the same posture when they read as the same preset', () => {
    expect(samePreset(reg, 'kneeling_upright', 'kneel_upright')).toBe(true);
    expect(samePreset(reg, 'kneeling_upright', 'kneel_open')).toBe(false);
    expect(samePreset(reg, 'kneeling_upright', 'nope')).toBe(false);
  });
});

describe('blocking.commander.preset', () => {
  const take = (s: CampaignState, change: object) => run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', at: 1, ...change } });

  it('is set with the posture (a chip or her call), carried by blocking_changed, and must be a preset of that base', () => {
    const r = take(scened(), { value: 'kneeling_upright', preset: 'kneel_open' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.blocking![COMMANDER]).toMatchObject({ posture: 'kneeling_upright', preset: 'kneel_open' });
    expect(ofType(r.events, 'blocking_changed')[0]).toMatchObject({ field: 'posture', value: 'kneeling_upright', preset: 'kneel_open' });
    expect(errors(take(scened(), { value: 'kneeling_upright', preset: 'bow' }).events)).not.toEqual([]); // a preset of another base
    expect(errors(take(scened(), { value: 'kneeling_upright', preset: 'no_such' }).events)).not.toEqual([]);
  });

  it('is cleared when the base changes, kept when the same base is set again, and a plain base writes none', () => {
    const s = take(scened(), { value: 'kneeling_upright', preset: 'kneel_open' }).state;
    expect(take(s, { value: 'kneeling_upright' }).state.scene!.blocking![COMMANDER].preset).toBe('kneel_open');
    const moved = take(s, { value: 'standing' }).state;
    expect(moved.scene!.blocking![COMMANDER]).toEqual({ posture: 'standing' });
    expect(take(scened(), { value: 'kneeling_upright' }).state.scene!.blocking![COMMANDER]).toEqual({ posture: 'kneeling_upright' });
  });

  it('commanderPresetOf: the preset held, else the default preset of the base, else nothing', () => {
    const s = take(scened(), { value: 'kneeling_upright', preset: 'kneel_open' }).state;
    expect(commanderPresetOf(s, reg)?.id).toBe('kneel_open');
    expect(commanderPresetOf(take(scened(), { value: 'kneeling_upright' }).state, reg)?.id).toBe('kneel_upright');
    expect(commanderPresetOf(scened(), reg)).toBeUndefined();
    const stale = structuredClone(s);
    stale.scene!.blocking![COMMANDER].posture = 'bowing'; // a preset of another base is never read
    expect(commanderPresetOf(stale, reg)?.id).toBe('bow');
  });

  it('a swipe takes the preset back with the posture (the snapshot holds the whole record)', () => {
    const s = scened();
    const a = take(s, { value: 'kneeling_upright', preset: 'kneel_open', at: 5 }).state;
    const back = run(a, reg, { type: 'blocking/rollback', payload: { after: 4 } }).state;
    expect(back.scene!.blocking?.[COMMANDER]).toBeUndefined();
  });

  it('a contact that puts the commander on another base clears the preset (the base changed under it)', () => {
    const s = take(scened(), { value: 'standing', preset: 'at_ease' }).state;
    s.content = { enabled: [...(s.content?.enabled ?? []), 'objectification'] };
    setBlocking(s, { registries: reg }, { person: ANN, field: 'contact', value: 'footrest', with: COMMANDER }, { at: 2, source: 'chip' });
    expect(s.scene!.blocking![COMMANDER].posture).toBe('all_fours');
    expect(s.scene!.blocking![COMMANDER].preset).toBeUndefined();
  });
});

describe('her set and her call, with presets', () => {
  it('a posture set with its preset is named by the preset (the base chip stays an old name)', () => {
    const s = scened();
    const r = run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_open', at: 1 } });
    expect(r.state.practices!.postures[ANN]).toEqual([expect.objectContaining({ postureId: 'kneel_open', name: 'Kneel open' })]);
    expect(ofType(r.events, 'posture_named')[0]).toMatchObject({ postureId: 'kneel_open' });
    const plain = run(scened(), reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'kneeling_upright', at: 1 } });
    expect(plain.state.practices!.postures[ANN].map((p) => p.postureId)).toEqual(['kneeling_upright']);
  });

  it('a preset and its base are one posture in her set: naming either again adds nothing', () => {
    let s = run(scened(), reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'kneeling_upright', at: 1 } }).state;
    dynamicOf(s, ANN)!.tracks.service = { xp: 1000, level: 2 } as never;
    s = run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_upright', at: 2 } }).state;
    expect(s.practices!.postures[ANN].map((p) => p.postureId)).toEqual(['kneeling_upright']);
  });

  it('the call offers presets: she calls one, the commander answers with the preset and the base and the preset are set', () => {
    const s = called(withSet(scened(), ['kneel_present', 'kneel_open']), 'kneel_open');
    const r = answer(s, 'kneel_open');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'posture_called')[0]).toMatchObject({ taken: true, postureId: 'kneel_open' });
    expect(r.state.scene!.blocking![COMMANDER]).toMatchObject({ posture: 'kneeling_upright', preset: 'kneel_open' });
  });

  it('an old name on a base answers a preset call, and a preset answers an old name: the same posture', () => {
    const old = called(withSet(scened(), ['kneeling_upright', 'standing_attention']), 'kneeling_upright');
    const a = answer(old, 'kneel_upright');
    expect(ofType(a.events, 'posture_slip')).toEqual([]);
    expect(a.state.scene!.blocking![COMMANDER]).toEqual({ posture: 'kneeling_upright' }); // an old name writes no preset
    const fresh = called(withSet(scened(), ['kneel_upright', 'attention']), 'kneel_upright');
    const b = answer(fresh, 'kneeling_upright');
    expect(ofType(b.events, 'posture_slip')).toEqual([]);
    expect(b.state.scene!.blocking![COMMANDER]).toMatchObject({ posture: 'kneeling_upright', preset: 'kneel_upright' });
  });

  it('the wrong preset of the same base is a slip; a preset that is not hers is refused', () => {
    const s = called(withSet(scened(), ['kneel_present', 'kneel_open']), 'kneel_open');
    expect(ofType(answer(s, 'kneel_present').events, 'posture_slip')).toHaveLength(1);
    expect(errors(answer(s, 'kneel_throat').events)).not.toEqual([]);
  });

  it('the commander already in the called preset is taken without a change; in another preset of the base it is set', () => {
    const s = called(withSet(scened(), ['kneel_present', 'kneel_open']), 'kneel_open');
    setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_open' }, { at: 1, source: 'chip' });
    const r = answer(s, 'kneel_open');
    expect(ofType(r.events, 'posture_called')[0]).toMatchObject({ taken: true });
    expect(ofType(r.events, 'blocking_changed')).toEqual([]);
    const other = called(withSet(scened(), ['kneel_present', 'kneel_open']), 'kneel_open');
    setBlocking(other, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_present' }, { at: 1, source: 'chip' });
    expect(answer(other, 'kneel_open').state.scene!.blocking![COMMANDER].preset).toBe('kneel_open');
  });

  it('callPosture picks among presets and never the one the commander holds; it draws nothing', () => {
    const base = withSet(scened(), ['kneel_present', 'kneel_open']);
    setBlocking(base, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_open' }, { at: 1, source: 'chip' });
    const rng = JSON.stringify(base.rng);
    const picked = new Set<string>();
    for (let n = 0; n < 300; n++) {
      const s = structuredClone(base);
      s.scene!.exchanges = n;
      callPosture(s, ctxOf(s), [{ type: 'intents_applied', channel: 'scene' }]);
      if (s.practices?.call !== undefined) picked.add(s.practices.call.postureId);
    }
    expect([...picked]).toEqual(['kneel_present']);
    expect(JSON.stringify(base.rng)).toBe(rng);
  });

  it('a preset whose category is off is not called and is no choice (the content gate reads its tags)', () => {
    const gated = { ...reg, servicePostures: new Map(reg.servicePostures) } as Registries;
    gated.servicePostures.set('kneel_open', { ...reg.servicePostures.get('kneel_open')!, tags: ['gated_category'] });
    const base = withSet(scened(), ['kneel_present', 'kneel_open']);
    let called = 0;
    for (let n = 0; n < 300; n++) {
      const s = structuredClone(base);
      s.scene!.exchanges = n;
      called += callPosture(s, { registries: gated }, [{ type: 'intents_applied', channel: 'scene' }]).length;
    }
    expect(called, 'one preset is left: nothing to choose between').toBe(0);
  });
});
