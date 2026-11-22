// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { bellsFor, deviceTabLocks, muffled } from '../../src/blocking/sync';
import type { Registries } from '../../src/content/types';
import { COMMANDER, resetBlockingHooks, setBlocking, type BlockingChange } from '../../src/engine/blocking';
import { deviceLocked } from '../../src/engine/blocking/device';
import type { CampaignState } from '../../src/engine/state/types';
import type { SceneController } from '../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderSceneScreen } from '../../src/ui/scene/sceneScreen';
import { createSound, MUFFLE_GAIN, type AudioContextLike } from '../../src/ui/sound/sound';
import { enable } from '../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  resetBlockingHooks();
});

const ANN = 'unit_ann';
function scene(stateId = 'confidant', on = ['pet_play', 'restraint']): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId });
  enable(s, ...on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const put = (s: CampaignState, ...changes: BlockingChange[]): CampaignState => {
  const d = structuredClone(s);
  for (const c of changes) setBlocking(d, { registries: reg }, c, { at: 1, source: 'engine' });
  return d;
};
const mitts: BlockingChange = { person: COMMANDER, field: 'worn', value: 'paw_mitts' };
const TABS = ['home', 'squad', 'ops', 'map', 'comms', 'base', 'inv', 'log', 'sys'];

describe('the device out of reach', () => {
  it('paw mitts lock it, removing them unlocks it, and it is never locked while the blocking is not live', () => {
    const s = put(scene(), mitts);
    expect(deviceLocked(s, reg)).toBe(true);
    expect(deviceLocked(put(s, { person: COMMANDER, field: 'removed', value: 'paw_mitts' }), reg)).toBe(false);
    expect(deviceLocked(scene(), reg)).toBe(false);
    expect(deviceLocked(put(scene('comrade'), { person: COMMANDER, field: 'posture', value: 'sitting' }) , reg)).toBe(false);
    expect(deviceLocked(campaign(reg, 4), reg)).toBe(false);
  });

  it('every tab is locked while it holds, and a tab the prologue keeps locked stays locked after', () => {
    const base = new Set(['ops', 'map']);
    expect([...deviceTabLocks(put(scene(), mitts), reg, TABS, base)].sort()).toEqual([...TABS].sort());
    expect([...deviceTabLocks(scene(), reg, TABS, base)].sort()).toEqual(['map', 'ops']);
    expect([...deviceTabLocks(null, reg, TABS, base)].sort()).toEqual(['map', 'ops']);
    expect(base.size).toBe(2); // the input is not changed
  });

  const draw = (state: CampaignState) => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = {
      send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(),
      resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(), stage: vi.fn(),
    } as unknown as SceneController;
    const host = h('div');
    document.body.append(host);
    let current = state;
    const screen = renderSceneScreen(host, { controller, getState: () => current, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn() });
    return { host, screen, set: (s: CampaignState) => { current = s; screen.refresh(); } };
  };

  it('the scene says so with a flash (P10e: no standing line), with a data-analyze; it goes by itself', () => {
    vi.useFakeTimers();
    try {
      const v = draw(put(scene(), mitts));
      expect(v.host.querySelector('[data-analyze="glossary:device_out_of_reach"]')).toBeNull(); // nothing stands in the scene
      v.screen.flashDeviceOut();
      const line = v.host.querySelector('[data-analyze="glossary:device_out_of_reach"]');
      expect(line!.textContent).toBe('The device is out of reach.');
      vi.advanceTimersByTime(2500);
      expect(v.host.querySelector('[data-analyze="glossary:device_out_of_reach"]')).toBeNull();
      expect(draw(scene()).host.textContent).not.toContain('out of reach');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the glossary entry exists', () => {
    expect(reg.glossary.get('device_out_of_reach')).toBeDefined();
    expect(String(reg.glossary.get('device_out_of_reach')!.short)).not.toMatch(/\b(he|him|his)\b/i);
  });
});

/** The slice of WebAudio the player needs: every gain node remembers what was set on it. */
function fakeAudio() {
  const gains: Array<{ values: number[] }> = [];
  const ctx: AudioContextLike = {
    currentTime: 0, destination: {}, state: 'running',
    createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
    createGain: () => {
      const rec = { values: [] as number[] };
      gains.push(rec);
      const gain = { get value(): number { return rec.values.at(-1) ?? 0; }, set value(v: number) { rec.values.push(v); }, setValueAtTime(v: number) { rec.values.push(v); }, linearRampToValueAtTime(v: number) { rec.values.push(v); }, exponentialRampToValueAtTime() {} };
      return { gain, connect() {} };
    },
    createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
    decodeAudioData: async () => ({}),
  };
  return { ctx, gains };
}
const peak = (g: { values: number[] }) => Math.max(...g.values);

describe('the muffled sound', () => {
  const make = () => {
    const audio = fakeAudio();
    const sound = createSound({ settings: () => ({ ...DEFAULT_SETTINGS, soundVolume: 100, soundMuted: false }), registries: () => reg, audio: () => audio.ctx });
    document.dispatchEvent(new Event('pointerdown'));
    return { audio, sound };
  };

  it('a hood: every sound plays at MUFFLE_GAIN (0.4) of its gain, and plays at full again when it comes off', () => {
    expect(MUFFLE_GAIN).toBe(0.4);
    const { audio, sound } = make();
    sound.play('open');
    const full = peak(audio.gains[0]!);
    sound.setMuffle(true);
    sound.play('open');
    expect(peak(audio.gains[1]!)).toBeCloseTo(full * 0.4, 5);
    sound.setMuffle(false);
    sound.play('open');
    expect(peak(audio.gains[2]!)).toBeCloseTo(full, 5);
    sound.dispose();
  });

  it('muffled() reads the commander\'s sound effect; a hood sets it', () => {
    const s = put(scene(), { person: COMMANDER, field: 'worn', value: 'hood' });
    expect(muffled(s, reg)).toBe(true);
    expect(muffled(put(s, { person: COMMANDER, field: 'removed', value: 'hood' }), reg)).toBe(false);
    expect(muffled(scene(), reg)).toBe(false);
    expect(muffled(null, reg)).toBe(false);
  });

  it('a muffle that is set while the hum runs retunes the hum', () => {
    const audio = fakeAudio();
    const sound = createSound({ settings: () => ({ ...DEFAULT_SETTINGS, soundVolume: 100, soundMuted: false, ambientHum: true }), registries: () => reg, audio: () => audio.ctx });
    document.dispatchEvent(new Event('pointerdown'));
    sound.startHum();
    const hum = audio.gains.at(-1)!;
    const before = hum.values.at(-1)!;
    expect(before).toBeGreaterThan(0);
    sound.setMuffle(true);
    expect(hum.values.at(-1)).toBeCloseTo(before * 0.4, 5);
    sound.setMuffle(false);
    expect(hum.values.at(-1)).toBeCloseTo(before, 5);
    sound.dispose();
  });
});

describe('the bell', () => {
  it('rings on every blocking change of a person who wears a bell, and not for anyone else', () => {
    const s = put(scene(), { person: COMMANDER, field: 'worn', value: 'bell_collar' });
    const change = (person: string) => ({ type: 'blocking_changed', person, field: 'posture', value: 'sitting', source: 'chip' });
    expect(bellsFor([change(COMMANDER)], s, reg)).toEqual(['bell']);
    expect(bellsFor([change(COMMANDER), change(COMMANDER)], s, reg)).toEqual(['bell', 'bell']);
    expect(bellsFor([change(ANN)], s, reg)).toEqual([]);
    expect(bellsFor([{ type: 'scene_exchange' }], s, reg)).toEqual([]);
    expect(bellsFor([change(COMMANDER)], scene(), reg)).toEqual([]);
    expect(bellsFor([change(COMMANDER)], null, reg)).toEqual([]);
  });

  it('bell and steps are UI sounds with a synth and no file (nothing loads from the network)', () => {
    for (const id of ['bell', 'steps']) {
      const e = reg.uiSounds.get(id)!;
      expect(e, id).toBeDefined();
      expect(e.file, id).toBeUndefined();
      expect((e.synth as { ms: number }).ms, id).toBeGreaterThan(0);
    }
    const bell = reg.blockingItems.get('bell_collar')!;
    expect((bell.effects as Array<{ type: string; id?: string }>).find((x) => x.type === 'sound')!.id).toBe('bell');
  });
});
