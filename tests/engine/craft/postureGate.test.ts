import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import '../../../src/engine/actions/craft';
import { checkChange, COMMANDER, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { blockingVocabulary } from '../../../src/engine/blocking/vocabulary';
import { presetSupports } from '../../../src/engine/blocking/presets';
import { craftOn } from '../../../src/engine/craft/gate';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { installCraftHooks } from '../../../src/engine/craft/hooks';
import { startPostureHold } from '../../../src/engine/craft/posture';
import { DEFAULT_SCENE_SETTINGS, INTERACTION_TOGGLES, parseSceneSettings, sceneSettingsOf } from '../../../src/engine/moments/settings';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, holdScene } from './world';

/**
 * P16b, Task 13: the contact `on_hands` (her foot on the commander's open hands) is offered only while the commander holds a posture whose preset `supports` it (read from the preset's field, never
 * by id: the contact carries `supported`), and the game of postures and stillness under provocation have their own toggles beside the interaction types.
 */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
beforeEach(() => installCraftHooks());
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

function posed(): CampaignState {
  const s = holdScene(reg);
  delete s.scene!.blocking;
  delete s.scene!.stagingLog;
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'humiliation', 'pain_rough'])] };
  return s;
}
const put = (s: CampaignState, preset?: string): CampaignState => {
  setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'posture', value: preset === undefined ? 'kneeling_upright' : String(reg.servicePostures.get(preset)!.base), ...(preset !== undefined ? { preset } : {}) }, { at: 1, source: 'engine' });
  return s;
};
const onHands = { person: ANN, field: 'contact' as const, value: 'on_hands', with: COMMANDER };

describe('on_hands is carried by a posture', () => {
  it('the contact says so by a field (`supported`), not the engine by its id', () => {
    expect(reg.blockingContacts.get('on_hands')!.supported).toBe(true);
    expect([...reg.blockingContacts.values()].filter((c) => c.supported === true).map((c) => c.id)).toEqual(['on_hands']);
    expect((reg.servicePostures.get('kneel_present')!.supports as string[])).toContain('on_hands');
  });

  it('is refused with no posture, with the base alone and with another preset; allowed while the hands are held out (kneel_present)', () => {
    expect(checkChange(posed(), reg, onHands)).toMatch(/hands/i);
    expect(checkChange(put(posed()), reg, onHands)).not.toBeNull(); // kneeling upright: not the hands held out
    expect(checkChange(put(posed(), 'kneel_open'), reg, onHands)).not.toBeNull();
    const ready = put(posed(), 'kneel_present');
    expect(presetSupports(ready, reg, 'on_hands')).toBe(true);
    expect(checkChange(ready, reg, onHands)).toBeNull();
    setBlocking(ready, { registries: reg }, onHands, { at: 2, source: 'chip' });
    expect(ready.scene!.blocking![COMMANDER]).toMatchObject({ posture: 'kneeling_upright', preset: 'kneel_present', contact: { id: 'on_hands' } });
  });

  it('is offered by the vocabulary (the chips and the extractor) only with the preset', () => {
    const ids = (s: CampaignState): string[] => blockingVocabulary(s, reg).contact.map((c) => String(c.id));
    expect(ids(posed())).not.toContain('on_hands');
    expect(ids(put(posed(), 'kneel_open'))).not.toContain('on_hands');
    expect(ids(put(posed(), 'kneel_present'))).toContain('on_hands');
    expect(ids(posed())).toContain('footrest'); // every other contact is as it was
  });

  it('with no holder craft-live (here an aftermath of hers runs) on_hands is offered and stageable exactly as before the craft, with or without a posture', () => {
    const off = (s: CampaignState): CampaignState => { dynamicOf(s, ANN)!.aftermath = { stage: 0 } as never; expect(craftOn(s, reg)).toBe(false); return s; };
    const ids = (s: CampaignState): string[] => blockingVocabulary(s, reg).contact.map((c) => String(c.id));
    expect(ids(off(posed()))).toContain('on_hands');
    expect(checkChange(off(posed()), reg, onHands)).toBeNull();
    expect(checkChange(off(put(posed(), 'kneel_open')), reg, onHands)).toBeNull();
    const staged = off(posed());
    setBlocking(staged, { registries: reg }, onHands, { at: 2, source: 'chip' });
    expect(staged.scene!.blocking![COMMANDER]).toMatchObject({ contact: { id: 'on_hands' } });
    expect(craftOn(posed(), reg)).toBe(true); // and with the craft on it needs the posture (the tests above)
  });

  it('a contact that is not `supported` ignores the preset entirely', () => {
    expect(checkChange(put(posed(), 'kneel_open'), reg, { person: ANN, field: 'contact', value: 'footrest', with: COMMANDER })).toBeNull();
  });

  it('presetSupports reads the preset held (or the default of the base) and nothing without a posture', () => {
    expect(presetSupports(posed(), reg, 'on_hands')).toBe(false);
    expect(presetSupports(put(posed(), 'all_fours'), reg, 'footrest')).toBe(true);
    expect(presetSupports(put(posed(), 'kneel_present'), reg, 'footrest')).toBe(false);
  });
});

describe('the toggles of the two games', () => {
  it('posture and provocation are interaction toggles beside the rest, on by default', () => {
    expect(INTERACTION_TOGGLES).toEqual(expect.arrayContaining(['posture', 'provocation']));
    expect(DEFAULT_SCENE_SETTINGS.physicsInteractions).toMatchObject({ posture: true, provocation: true });
    const s = holdScene(reg);
    expect(sceneSettingsOf(s).physicsInteractions).toMatchObject({ posture: true, provocation: true });
    s.settings.physicsInteractions = { posture: 'yes' }; // invalid reads as the default
    expect(sceneSettingsOf(s).physicsInteractions.posture).toBe(true);
  });

  it('mirror into the campaign through campaign/set_scene_settings and can be switched off; a payload that lacks one is refused', () => {
    const s = holdScene(reg);
    const all = Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, true]));
    const payload = { momentFrequency: 'normal', momentExplicit: 'rarer', physicsRealtime: false, marathonPace: 'normal', physicsInteractions: { ...all, posture: false, provocation: false } };
    const r = run(s, reg, { type: 'campaign/set_scene_settings', payload });
    expect(errors(r.events)).toEqual([]);
    expect(sceneSettingsOf(r.state).physicsInteractions).toMatchObject({ posture: false, provocation: false, timing: true });
    const { posture: _p, ...lacking } = all;
    expect(typeof parseSceneSettings({ ...payload, physicsInteractions: lacking })).toBe('string');
  });

  it('with the game of postures off no hold starts (take and the reusable run are refused), and her call is still taken as a posture', () => {
    const s = posed();
    s.settings.physicsInteractions = { ...Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, true])), posture: false } as never;
    expect(errors(run(s, reg, { type: 'posture/take', payload: { presetId: 'kneel_upright', at: 1 } }).events)).not.toEqual([]);
    put(s, 'kneel_upright');
    expect(() => startPostureHold(s, { registries: reg }, { holderId: ANN, presetId: 'kneel_upright', source: 'attendance' })).toThrow(/switched off/);
    expect(s.practices?.postureRun).toBeUndefined();
    // the other toggles do not matter to it
    const on = posed();
    on.settings.physicsInteractions = { ...Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, false])), posture: true } as never;
    expect(errors(run(on, reg, { type: 'posture/take', payload: { presetId: 'kneel_upright', at: 1 } }).events)).toEqual([]);
  });
});
