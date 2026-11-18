// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, Registries } from '../../src/content/types';
import { SOUND_IDS, UiSoundSchema } from '../../src/content/schemas';
import { createCampaign } from '../../src/engine/state/create';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { createSound, NIGHT_GAIN, type AudioContextLike, type SoundId } from '../../src/ui/sound/sound';
import { createShell, type ShellApi } from '../../src/ui/shell/shell';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

interface Param { value: number; sets: number[]; linear: number[]; exp: Array<[number, number]>; setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }
const param = (): Param => {
  const p: Param = {
    value: 0, sets: [], linear: [], exp: [],
    setValueAtTime(v) { p.sets.push(v); }, linearRampToValueAtTime(v) { p.linear.push(v); }, exponentialRampToValueAtTime(v, t) { p.exp.push([v, t]); },
  };
  return p;
};

/** A fake AudioContext that records what is built and played. */
function fakeAudio() {
  const rec = {
    created: 0, resumed: 0, decoded: 0,
    oscillators: [] as Array<{ type: string; frequency: Param; started: boolean; stopped: boolean }>,
    gains: [] as Array<{ gain: Param }>,
    sources: [] as Array<{ buffer: unknown; loop: boolean; started: boolean; stopped: boolean }>,
    failDecode: false,
  };
  const make = (): AudioContextLike => {
    rec.created++;
    return {
      currentTime: 0, destination: {}, state: 'suspended',
      resume: async () => { rec.resumed++; },
      createOscillator: () => {
        const o = { type: 'sine', frequency: param(), started: false, stopped: false, connect: () => undefined, start() { o.started = true; }, stop() { o.stopped = true; } };
        rec.oscillators.push(o);
        return o;
      },
      createGain: () => {
        const g = { gain: param(), connect: () => undefined };
        rec.gains.push(g);
        return g;
      },
      createBufferSource: () => {
        const s = { buffer: null as unknown, loop: false, started: false, stopped: false, onended: null, connect: () => undefined, start() { s.started = true; }, stop() { s.stopped = true; } };
        rec.sources.push(s);
        return s;
      },
      decodeAudioData: async () => {
        rec.decoded++;
        if (rec.failDecode) throw new Error('bad audio');
        return { duration: 1 };
      },
    } as never;
  };
  return { rec, make };
}

const entry = (id: SoundId, over: Record<string, unknown> = {}): Entry => ({ id, synth: { wave: 'square', freq: 440, ms: 100, gain: 0.5 }, ...over });
const withSounds = (entries: Entry[]): Registries => ({ ...reg, uiSounds: new Map(entries.map((e): [string, Entry] => [e.id as string, e])) });
const settings = (over: Partial<AliusSettings> = {}): AliusSettings => ({ ...DEFAULT_SETTINGS, ...over });

function setup(over: Partial<AliusSettings> = {}, entries: Entry[] = [entry('open')], extra: { assetUrl?: (p: string) => string; gesture?: boolean } = {}) {
  const audio = fakeAudio();
  let current = settings(over);
  const make = vi.fn(audio.make);
  const sound = createSound({ settings: () => current, registries: () => withSounds(entries), audio: make, ...(extra.assetUrl ? { assetUrl: extra.assetUrl } : {}) });
  // the player has already clicked or pressed a key (browsers only let audio start after that)
  if (extra.gesture !== false) document.dispatchEvent(new Event('pointerdown'));
  return { audio, sound, make, set: (o: Partial<AliusSettings>) => { current = settings({ ...current, ...o }); } };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
const peak = (g: { gain: Param }) => Math.max(...g.gain.linear, 0);

describe('no audio before a user gesture', () => {
  it('play and the hum are silent, and make no AudioContext, until the first pointer press or key', () => {
    const { make, audio, sound } = setup({ ambientHum: true }, [entry('open'), entry('hum', { synth: { wave: 'sine', freq: 50, ms: 1000, gain: 0.08 } })], { gesture: false });
    sound.play('open');
    sound.startHum();
    expect(make).not.toHaveBeenCalled();
    expect(audio.rec.oscillators).toHaveLength(0);
    document.dispatchEvent(new Event('pointerdown'));
    // the hum that was asked for starts with the first gesture
    expect(make).toHaveBeenCalledTimes(1);
    expect(audio.rec.oscillators).toHaveLength(1);
    sound.play('open');
    expect(audio.rec.oscillators).toHaveLength(2);
  });

  it.each(['pointerdown', 'keydown', 'touchstart'])('a %s counts as the gesture', (type) => {
    const { make, sound } = setup({}, [entry('open')], { gesture: false });
    sound.play('open');
    expect(make).not.toHaveBeenCalled();
    document.dispatchEvent(new Event(type));
    sound.play('open');
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('a hum that is no longer wanted at the first gesture does not start', () => {
    const { make, sound, set } = setup({ ambientHum: true }, [entry('hum', { synth: { wave: 'sine', freq: 50, ms: 1000, gain: 0.08 } })], { gesture: false });
    sound.startHum();
    set({ ambientHum: false });
    document.dispatchEvent(new Event('pointerdown'));
    expect(make).not.toHaveBeenCalled();
  });

  it('the browser\'s own record of a past user activation also counts', () => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
    const { make, sound } = setup({}, [entry('open')], { gesture: false });
    sound.play('open');
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the gesture listeners', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { sound } = setup({}, [entry('open')], { gesture: false });
    sound.dispose();
    expect(spy.mock.calls.map(([t]) => t)).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'touchstart']));
  });
});

describe('createSound', () => {
  it('no AudioContext is created before the first play', () => {
    const { make, sound } = setup();
    expect(make).not.toHaveBeenCalled();
    sound.play('open');
    expect(make).toHaveBeenCalledTimes(1);
    sound.play('open');
    expect(make).toHaveBeenCalledTimes(1); // one context, reused
  });

  it('resumes a suspended context when it plays (a user gesture is on the stack)', () => {
    const { audio, sound } = setup();
    sound.play('open');
    expect(audio.rec.resumed).toBe(1);
  });

  it('synthesizes the entry: wave, start frequency, one oscillator, started and stopped', () => {
    const { audio, sound } = setup({}, [entry('open', { synth: { wave: 'triangle', freq: 420, endFreq: 880, ms: 90, gain: 0.5 } })]);
    sound.play('open');
    const [o] = audio.rec.oscillators;
    expect(audio.rec.oscillators).toHaveLength(1);
    expect(o.type).toBe('triangle');
    expect(o.frequency.sets).toEqual([420]);
    expect(o.frequency.exp.map(([v]) => v)).toEqual([880]);
    expect(o.started).toBe(true);
    expect(o.stopped).toBe(true);
  });

  it('gain = volume / 100 x entry gain (volume 20, entry 0.5 -> 0.1)', () => {
    const { audio, sound } = setup({ soundVolume: 20 }, [entry('open', { synth: { wave: 'sine', freq: 440, ms: 100, gain: 0.5 } })]);
    sound.play('open');
    expect(peak(audio.rec.gains[0])).toBeCloseTo(0.1, 5);
  });

  it('a louder volume plays louder', () => {
    const { audio, sound } = setup({ soundVolume: 80 });
    sound.play('open');
    expect(peak(audio.rec.gains[0])).toBeCloseTo(0.4, 5);
  });

  it('muted, or volume 0, plays nothing and creates no context', () => {
    for (const over of [{ soundMuted: true }, { soundVolume: 0 }]) {
      const { make, sound } = setup(over);
      sound.play('open');
      expect(make, JSON.stringify(over)).not.toHaveBeenCalled();
    }
  });

  it('an id the pack has no entry for is silent', () => {
    const { make, sound } = setup({}, [entry('open')]);
    sound.play('stamp');
    expect(make).not.toHaveBeenCalled();
  });

  it('an environment without AudioContext is silent, not an error', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const sound = createSound({ settings: () => settings(), registries: () => withSounds([entry('open')]) });
    expect(() => sound.play('open')).not.toThrow();
    expect(() => sound.startHum()).not.toThrow();
  });

  it('a context that throws on creation is silent too', () => {
    const sound = createSound({ settings: () => settings(), registries: () => withSounds([entry('open')]), audio: () => { throw new Error('blocked'); } });
    expect(() => sound.play('open')).not.toThrow();
  });

  it('a file entry plays the file', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal('fetch', fetchSpy);
    const { audio, sound } = setup({}, [entry('open', { file: 'content/core/audio/open.ogg' })], { assetUrl: (p) => `/ext/${p}` });
    sound.play('open');
    await flush();
    expect(fetchSpy).toHaveBeenCalledWith('/ext/content/core/audio/open.ogg');
    expect(audio.rec.decoded).toBe(1);
    expect(audio.rec.sources).toHaveLength(1);
    expect(audio.rec.sources[0].started).toBe(true);
    expect(audio.rec.oscillators).toHaveLength(0);
  });

  it('a file that fails to load falls back to the synth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('404'); }));
    const { audio, sound } = setup({}, [entry('open', { file: 'content/core/audio/open.ogg' })], { assetUrl: (p) => p });
    sound.play('open');
    await flush();
    expect(audio.rec.oscillators).toHaveLength(1);
    expect(audio.rec.sources).toHaveLength(0);
  });

  it('a file that decodes badly or answers 404 also falls back to the synth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
    const a = setup({}, [entry('open', { file: 'x.ogg' })], { assetUrl: (p) => p });
    a.audio.rec.failDecode = true;
    a.sound.play('open');
    await flush();
    expect(a.audio.rec.oscillators).toHaveLength(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));
    const b = setup({}, [entry('open', { file: 'x.ogg' })], { assetUrl: (p) => p });
    b.sound.play('open');
    await flush();
    expect(b.audio.rec.oscillators).toHaveLength(1);
  });

  it('a file entry without an assetUrl plays the synth', () => {
    const { audio, sound } = setup({}, [entry('open', { file: 'x.ogg' })]);
    sound.play('open');
    expect(audio.rec.oscillators).toHaveLength(1);
  });

  it('typing ticks are at most one per 60 ms', async () => {
    const { audio, sound } = setup({}, [entry('typing', { synth: { wave: 'square', freq: 2000, ms: 8, gain: 0.15 } })]);
    for (let i = 0; i < 10; i++) {
      sound.play('typing');
      await vi.advanceTimersByTimeAsync(5);
    }
    expect(audio.rec.oscillators).toHaveLength(1); // 10 calls in 50 ms
    await vi.advanceTimersByTimeAsync(60);
    sound.play('typing');
    expect(audio.rec.oscillators).toHaveLength(2);
  });

  it('other sounds are not rate limited', () => {
    const { audio, sound } = setup({}, [entry('tab')]);
    sound.play('tab');
    sound.play('tab');
    expect(audio.rec.oscillators).toHaveLength(2);
  });
});

describe('the ambient hum', () => {
  const hum = entry('hum', { synth: { wave: 'sine', freq: 50, ms: 1000, gain: 0.08 } });

  it('loops while it is on and stops when asked', () => {
    const { audio, sound } = setup({ ambientHum: true, soundVolume: 50 }, [hum]);
    sound.startHum();
    expect(audio.rec.oscillators).toHaveLength(1);
    expect(audio.rec.oscillators[0].started).toBe(true);
    expect(audio.rec.oscillators[0].stopped).toBe(false); // it runs until stopped
    expect(audio.rec.oscillators[0].frequency.sets).toEqual([50]);
    expect(audio.rec.gains[0].gain.value).toBeCloseTo(0.04, 5);
    sound.stopHum();
    expect(audio.rec.oscillators[0].stopped).toBe(true);
  });

  it('never starts with ambientHum off (and creates no context)', () => {
    const { make, sound } = setup({ ambientHum: false }, [hum]);
    sound.startHum();
    expect(make).not.toHaveBeenCalled();
  });

  it('does not start when muted or at volume 0', () => {
    for (const over of [{ soundMuted: true }, { soundVolume: 0 }]) {
      const { make, sound } = setup({ ambientHum: true, ...over }, [hum]);
      sound.startHum();
      expect(make, JSON.stringify(over)).not.toHaveBeenCalled();
    }
  });

  it('startHum is idempotent and follows the volume; muting silences it', () => {
    const { audio, sound, set } = setup({ ambientHum: true, soundVolume: 50 }, [hum]);
    sound.startHum();
    sound.startHum();
    expect(audio.rec.oscillators).toHaveLength(1);
    set({ soundVolume: 100 });
    sound.startHum();
    expect(audio.rec.gains[0].gain.value).toBeCloseTo(0.08, 5);
    set({ soundMuted: true });
    sound.startHum();
    expect(audio.rec.oscillators[0].stopped).toBe(true); // muted: the hum ends
  });

  it('dispose stops the hum and closes the context; later plays are silent', () => {
    const { audio, sound, make } = setup({ ambientHum: true }, [hum, entry('open')]);
    sound.startHum();
    sound.dispose();
    expect(audio.rec.oscillators[0].stopped).toBe(true);
    sound.play('open');
    expect(make).toHaveBeenCalledTimes(1);
    expect(audio.rec.oscillators).toHaveLength(1);
  });
});

describe('the shell plays its sounds', () => {
  const shells: ShellApi[] = [];
  afterEach(() => {
    shells.splice(0).forEach((s) => s.destroy());
  });

  function shellWith(over: Record<string, unknown> = {}) {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { reducedMotion: true, ...over });
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const sound = { play: vi.fn(), startHum: vi.fn(), stopHum: vi.fn() };
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), sound });
    shells.push(shell);
    return { shell, sound };
  }
  const played = (sound: { play: ReturnType<typeof vi.fn> }) => sound.play.mock.calls.map(([id]) => id);

  it('device up plays open, device down plays close, once each', () => {
    const { shell, sound } = shellWith();
    shell.open();
    shell.showScreen('pda');
    expect(played(sound)).toEqual(['open']);
    shell.setDevice(false);
    expect(played(sound)).toEqual(['open', 'close']);
    shell.showScreen('pda');
    shell.showScreen('pda'); // already up: nothing
    expect(played(sound)).toEqual(['open', 'close', 'open']);
  });

  it('a tab change plays tab; clicking the selected tab does not', () => {
    const { shell, sound } = shellWith();
    shell.open();
    shell.showScreen('pda');
    sound.play.mockClear();
    document.getElementById('alius-tab-ops')!.click();
    expect(played(sound)).toEqual(['tab']);
    document.getElementById('alius-tab-ops')!.click();
    expect(played(sound)).toEqual(['tab']);
  });

  it('toasts: info and story notify, warn and error alert, once each', () => {
    const { shell, sound } = shellWith();
    shell.open();
    sound.play.mockClear();
    shell.toast('info', 'a');
    shell.toast('story', 'b');
    shell.toast('warn', 'c');
    shell.toast('error', 'd');
    expect(played(sound)).toEqual(['notify', 'notify', 'alert', 'alert']);
  });

  it('a toast with the shell closed is not a sound (it goes to SillyTavern)', () => {
    const { shell, sound } = shellWith();
    shell.toast('warn', 'closed');
    expect(played(sound)).toEqual([]);
  });

  it('open() starts the hum, close() stops it, a settings change re-applies it', () => {
    const { shell, sound } = shellWith();
    shell.open();
    expect(sound.startHum).toHaveBeenCalledTimes(1);
    shell.setPalette('green'); // a settings change
    expect(sound.startHum.mock.calls.length).toBeGreaterThanOrEqual(2);
    shell.close();
    expect(sound.stopHum).toHaveBeenCalled();
  });
});

describe('uiSounds content', () => {
  it('the core pack has the nine sounds, all synthesized (no audio files shipped)', () => {
    expect([...reg.uiSounds.keys()].sort()).toEqual([...SOUND_IDS].sort());
    expect(SOUND_IDS).toHaveLength(9); // P10b: + knock
    for (const e of reg.uiSounds.values()) {
      expect(e.file, String(e.id)).toBeUndefined();
      expect(UiSoundSchema.safeParse(e).success, String(e.id)).toBe(true);
    }
    expect((reg.uiSounds.get('open')!.synth as { freq: number; endFreq: number }).endFreq).toBe(880);
  });

  it('the schema takes only known ids, waves and sane numbers', () => {
    const ok = { id: 'open', synth: { wave: 'sine', freq: 440, ms: 100, gain: 0.5 } };
    expect(UiSoundSchema.safeParse(ok).success).toBe(true);
    expect(UiSoundSchema.safeParse({ ...ok, id: 'fanfare' }).success).toBe(false);
    expect(UiSoundSchema.safeParse({ ...ok, synth: { ...ok.synth, wave: 'noise' } }).success).toBe(false);
    expect(UiSoundSchema.safeParse({ ...ok, synth: { ...ok.synth, gain: 1.5 } }).success).toBe(false);
    expect(UiSoundSchema.safeParse({ ...ok, synth: { ...ok.synth, freq: 0 } }).success).toBe(false);
    expect(UiSoundSchema.safeParse({ ...ok, synth: { ...ok.synth, ms: 0 } }).success).toBe(false);
    expect(UiSoundSchema.safeParse({ ...ok, file: 'content/core/audio/open.ogg' }).success).toBe(true);
  });

  it('uiSounds is not a player-visible registry', async () => {
    const { PLAYER_VISIBLE } = await import('../../src/analysis/describe');
    expect(PLAYER_VISIBLE).not.toContain('uiSounds');
  });
});

describe('night sound (P10b)', () => {
  const hum = entry('hum', { synth: { wave: 'sine', freq: 50, ms: 1000, gain: 0.08 } });
  it('NIGHT_GAIN is one half', () => {
    expect(NIGHT_GAIN).toBe(0.5);
  });

  it('night halves the effective gain of a sound, morning restores it', () => {
    const { audio, sound } = setup({ soundVolume: 40 });
    sound.play('open');
    const day = peak(audio.rec.gains[0]);
    sound.setNight(true);
    sound.play('open');
    expect(peak(audio.rec.gains[1])).toBeCloseTo(day * NIGHT_GAIN, 6);
    sound.setNight(false);
    sound.play('open');
    expect(peak(audio.rec.gains[2])).toBeCloseTo(day, 6);
  });

  it('a hum that is running follows at once, in both directions', () => {
    const { audio, sound } = setup({ ambientHum: true, soundVolume: 100 }, [hum]);
    sound.startHum();
    const g = audio.rec.gains[0].gain;
    expect(g.value).toBeCloseTo(0.08, 5);
    sound.setNight(true);
    expect(g.value).toBeCloseTo(0.08 * NIGHT_GAIN, 5);
    sound.setNight(false);
    expect(g.value).toBeCloseTo(0.08, 5);
  });

  it('setNight with the same value changes nothing, and night does not unmute', () => {
    const { audio, sound } = setup({ soundMuted: true });
    sound.setNight(true);
    sound.setNight(true);
    sound.play('open');
    expect(audio.rec.gains).toHaveLength(0);
  });
});
