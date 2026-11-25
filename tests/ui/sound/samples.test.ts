// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { MUFFLE_GAIN, NIGHT_GAIN } from '../../../src/ui/sound/sound';
import { createSamples, FAILED_RETRY_MS, type SampleContextLike } from '../../../src/ui/sound/samples';
import { TUNING } from '../../../src/engine/tuning';

/** A fake node: its kind, its params and where it is connected. */
interface Node {
  kind: string;
  to: unknown[];
  gain?: { value: number; sets: Array<[number, number]>; ramps: Array<[number, number]> };
  frequency?: { value: number };
  pan?: { value: number };
  playbackRate?: { value: number };
  buffer?: unknown;
  loop?: boolean;
  started?: Array<[number | undefined, number | undefined, number | undefined]>;
  stopped?: number[];
  type?: string;
}

function param(value = 0) {
  const p = {
    value, sets: [] as Array<[number, number]>, ramps: [] as Array<[number, number]>,
    setValueAtTime(v: number, t: number) { p.sets.push([v, t]); p.value = v; },
    linearRampToValueAtTime(v: number, t: number) { p.ramps.push([v, t]); },
    exponentialRampToValueAtTime(v: number, t: number) { p.ramps.push([v, t]); },
    cancelScheduledValues() { /* nothing */ },
  };
  return p;
}

function fakeAudio() {
  const rec = { created: 0, closed: 0, decoded: 0, nodes: [] as Node[], destination: { kind: 'destination', to: [] } as Node };
  const node = (kind: string, extra: Partial<Node> = {}): Node & { connect(n: unknown): unknown } => {
    const n = { kind, to: [] as unknown[], ...extra, connect(t: unknown) { n.to.push(t); return t; }, disconnect() { n.to.length = 0; } };
    rec.nodes.push(n);
    return n;
  };
  const make = (): SampleContextLike => {
    rec.created++;
    return {
      currentTime: 0, destination: rec.destination, state: 'running',
      close: async () => { rec.closed++; },
      createGain: () => node('gain', { gain: param(1) }),
      createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(350), Q: param(1) } as never),
      createStereoPanner: () => node('panner', { pan: param(0) }),
      createBufferSource: () => {
        const s = node('source', { buffer: null, loop: false, playbackRate: param(1), started: [], stopped: [] });
        return Object.assign(s, {
          start(when?: number, offset?: number, dur?: number) { s.started!.push([when, offset, dur]); },
          stop(when?: number) { s.stopped!.push(when ?? 0); },
        });
      },
      createOscillator: () => node('osc') as never,
      decodeAudioData: async () => { rec.decoded++; return { duration: 2 }; },
    } as never;
  };
  return { rec, make };
}

/** The product of every gain from a node to the destination (one path: the fakes connect each node once). */
function pathGain(start: Node, dest: Node): number {
  let g = 1;
  let n: Node | undefined = start;
  for (let i = 0; n && n !== dest && i < 20; i++) {
    if (n.gain) g *= n.gain.value;
    n = n.to[0] as Node | undefined;
  }
  expect(n, 'the path reaches the destination').toBe(dest);
  return g;
}

const settings = (over: Partial<AliusSettings> = {}): AliusSettings => ({ ...DEFAULT_SETTINGS, ...over });
const assetUrl = (p: string): string => `ext://alius/${p}`;
const FILE = 'assets/sounds/ha/soft1.ogg';

function setup(over: Partial<AliusSettings> = {}, opts: { fetchFails?: boolean; gesture?: boolean } = {}) {
  const audio = fakeAudio();
  const make = vi.fn(audio.make);
  const fetchMock = vi.fn(async (url: string) => {
    if (opts.fetchFails) throw new Error(`offline ${url}`);
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  vi.stubGlobal('fetch', fetchMock);
  let current = settings(over);
  const samples = createSamples({ settings: () => current, assetUrl, audio: make });
  if (opts.gesture !== false) document.dispatchEvent(new Event('pointerdown'));
  return { audio, make, fetchMock, samples, set: (o: Partial<AliusSettings>) => { current = settings({ ...current, ...o }); } };
}

const sources = (rec: { nodes: Node[] }) => rec.nodes.filter((n) => n.kind === 'source');
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the sample sound layer (P10e-e Task 1)', () => {
  it('a sample plays through assetUrl with the master gain', async () => {
    const { audio, fetchMock, samples } = setup({ soundVolume: 50 });
    samples.play(FILE, { gain: 0.3 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(assetUrl(FILE));
    const [src] = sources(audio.rec);
    expect(src.started).toHaveLength(1);
    // its own gain node at .3, then the world bus and the master at .5: .3 × .5 all the way
    const own = src.to[0] as Node;
    expect(own.gain!.value).toBeCloseTo(0.3, 6);
    expect(pathGain(src, audio.rec.destination)).toBeCloseTo(0.3 * 0.5, 6);
  });

  it('muted plays nothing', async () => {
    const { audio, fetchMock, samples } = setup({ soundMuted: true });
    samples.play(FILE, { gain: 0.3 });
    const loop = samples.loop(FILE, { gain: 0.3 });
    loop.setGain(0.5);
    loop.stop();
    await flush();
    expect(sources(audio.rec).filter((s) => s.started!.length > 0)).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nothing is made before the first user gesture', async () => {
    const { make, fetchMock, samples } = setup({}, { gesture: false });
    samples.play(FILE);
    await flush();
    expect(make).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(samples.ctx()).toBeNull();
    expect(samples.bus('world')).toBeNull();
    document.dispatchEvent(new Event('keydown'));
    expect(samples.ctx()).not.toBeNull();
    expect(make).toHaveBeenCalledTimes(1);
    samples.dispose();
  });

  it('a buffer is decoded once', async () => {
    const { audio, fetchMock, samples } = setup();
    samples.play(FILE);
    samples.play(FILE, { rate: 1.6 });
    await flush();
    samples.play(FILE);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(audio.rec.decoded).toBe(1);
    expect(sources(audio.rec).filter((s) => s.started!.length > 0)).toHaveLength(3);
  });

  it('a failed fetch is silent and not retried within 30 s', async () => {
    const { audio, fetchMock, samples } = setup({}, { fetchFails: true });
    expect(() => samples.play(FILE)).not.toThrow();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FAILED_RETRY_MS - 1000);
    samples.play(FILE);
    samples.loop(FILE).stop();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sources(audio.rec).filter((s) => s.started!.length > 0)).toHaveLength(0);
    // after the wait it is tried again
    vi.advanceTimersByTime(2000);
    samples.play(FILE);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FAILED_RETRY_MS).toBe(30_000);
  });

  it('night and muffle apply (the gains of createSound), and the sensory hold', async () => {
    const { audio, samples } = setup({ soundVolume: 100 });
    samples.setNight(true);
    samples.setMuffle(true);
    samples.play(FILE, { gain: 1 });
    await flush();
    const [src] = sources(audio.rec);
    expect(pathGain(src, audio.rec.destination)).toBeCloseTo(NIGHT_GAIN * MUFFLE_GAIN, 6);
    samples.setNight(false);
    samples.setMuffle(false);
    samples.setSensory(true);
    expect(pathGain(src, audio.rec.destination)).toBeCloseTo(TUNING.practice.hold.sensoryVolume, 6);
    samples.setSensory(false);
    expect(pathGain(src, audio.rec.destination)).toBeCloseTo(1, 6);
  });

  it('the options reach the source: rate, pan, at, offset, duration (faded out at its end)', async () => {
    const { audio, samples } = setup({ soundVolume: 100 });
    samples.play(FILE, { gain: 0.24, rate: 1.6, offset: 0.14, duration: 0.42, at: 0.5, pan: -0.7 });
    await flush();
    const [src] = sources(audio.rec);
    expect(src.playbackRate!.value).toBe(1.6);
    expect(src.started![0][0]).toBeCloseTo(0.5, 6);
    expect(src.started![0][1]).toBeCloseTo(0.14, 6);
    expect(src.started![0][2]).toBeCloseTo(0.42 + 0.05, 6);
    const own = src.to[0] as Node;
    expect(own.gain!.ramps.at(-1)![0]).toBeCloseTo(0.0001, 6);
    expect(own.gain!.ramps.at(-1)![1]).toBeCloseTo(0.5 + 0.42 / 1.6, 6);
    const panner = own.to[0] as Node;
    expect(panner.kind).toBe('panner');
    expect(panner.pan!.value).toBeCloseTo(-0.7, 6);
  });

  it('two buses: the world goes dull through the lowpass 16000·(380/16000)^f, the body never', async () => {
    const { audio, samples } = setup({ soundVolume: 100 });
    samples.play(FILE, { bus: 'body' });
    samples.play(FILE);
    await flush();
    const world = samples.bus('world') as unknown as Node;
    const body = samples.bus('body') as unknown as Node;
    expect(world.kind).toBe('filter');
    expect(world.type).toBe('lowpass');
    expect(world.frequency!.value).toBeCloseTo(16000, 3);
    samples.setWorldDull(1);
    expect(world.frequency!.value).toBeCloseTo(380, 3);
    samples.setWorldDull(0.5);
    expect(world.frequency!.value).toBeCloseTo(16000 * Math.pow(380 / 16000, 0.5), 3);
    // the body bus reaches the master without a filter
    expect(body.kind).toBe('gain');
    let n: Node | undefined = body;
    while (n && n !== audio.rec.destination) {
      expect(n.kind).not.toBe('filter');
      n = n.to[0] as Node | undefined;
    }
    const [bodySrc, worldSrc] = sources(audio.rec);
    expect((bodySrc.to[0] as Node).to[0]).toBe(body);
    expect((worldSrc.to[0] as Node).to[0]).toBe(world);
  });

  it('a dullness set before the context exists applies when it is made', () => {
    const { samples } = setup({}, { gesture: false });
    samples.setWorldDull(1);
    document.dispatchEvent(new Event('pointerdown'));
    const world = samples.bus('world') as unknown as Node;
    expect(world.frequency!.value).toBeCloseTo(380, 3);
  });

  it('a loop loops, follows its gain and rate, and stops', async () => {
    const { audio, samples } = setup({ soundVolume: 100 });
    const l = samples.loop(FILE, { gain: 0.2 });
    await flush();
    const [src] = sources(audio.rec);
    expect(src.loop).toBe(true);
    expect(src.started).toHaveLength(1);
    const own = src.to[0] as Node;
    expect(own.gain!.value).toBeCloseTo(0.2, 6);
    l.setGain(0.6, 200);
    expect(own.gain!.ramps.at(-1)).toEqual([0.6, 0.2]);
    l.setRate(1.1);
    expect(src.playbackRate!.value).toBeCloseTo(1.1, 6);
    l.stop(100);
    expect(src.stopped).toHaveLength(1);
    expect(src.stopped![0]).toBeCloseTo(0.1, 6);
  });

  it('a loop stopped before its buffer arrives never starts', async () => {
    const { audio, samples } = setup();
    samples.loop(FILE).stop();
    await flush();
    expect(sources(audio.rec).filter((s) => s.started!.length > 0)).toHaveLength(0);
  });

  it('dispose stops loops and closes nothing it did not open', async () => {
    const unused = setup();
    unused.samples.dispose();
    expect(unused.make).not.toHaveBeenCalled();
    expect(unused.audio.rec.closed).toBe(0);

    const { audio, make, samples } = setup();
    samples.loop(FILE);
    await flush();
    const [src] = sources(audio.rec);
    samples.dispose();
    expect(src.stopped).toHaveLength(1);
    expect(audio.rec.closed).toBe(1);
    samples.dispose();
    expect(audio.rec.closed).toBe(1);
    samples.play(FILE);
    samples.loop(FILE);
    await flush();
    expect(sources(audio.rec)).toHaveLength(1);
    expect(make).toHaveBeenCalledTimes(1);
    expect(samples.ctx()).toBeNull();
  });

  it('a play whose buffer arrives after dispose starts nothing', async () => {
    const { audio, samples } = setup();
    samples.play(FILE);
    samples.dispose();
    await flush();
    expect(sources(audio.rec).filter((s) => s.started!.length > 0)).toHaveLength(0);
  });

  it('dispose removes the gesture listeners', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { samples } = setup({}, { gesture: false });
    samples.dispose();
    expect(spy.mock.calls.map(([t]) => t)).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'touchstart']));
    spy.mockRestore();
  });
});
