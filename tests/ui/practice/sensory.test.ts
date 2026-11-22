// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { createCampaign } from '../../../src/engine/state/create';
import { TUNING } from '../../../src/engine/tuning';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { visualFlags } from '../../../src/ui/motion';
import { createShell, type ShellApi } from '../../../src/ui/shell/shell';
import { createSound, type AudioContextLike } from '../../../src/ui/sound/sound';
import { loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

let shells: ShellApi[] = [];
afterEach(() => {
  shells.forEach((s) => s.destroy());
  shells = [];
  document.body.innerHTML = '';
});

const CHAT = { chatId: 'c', isGroup: true, groupId: 'g' };
const open = (sensory: boolean) => {
  const st = new FakeStAdapter(CHAT);
  const state = createCampaign({ seed: 1, commanderName: 'Vale' });
  const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), sensory: () => sensory });
  shells.push(shell);
  shell.open();
  return shell;
};
const root = () => document.getElementById('alius-shell')!;

describe('the visual flags', () => {
  it('sensory is off unless asked and is on when the hold dims the device; the rest is as it was', () => {
    expect(visualFlags({ ...DEFAULT_SETTINGS, scanlines: true, flicker: true }, () => false)).toEqual({ scanlines: true, flicker: true, glitch: true, dither: true, motion: true, sensory: false });
    expect(visualFlags({ ...DEFAULT_SETTINGS, scanlines: true, flicker: true }, () => false, { sensory: true })).toEqual({ scanlines: true, flicker: true, glitch: true, dither: true, motion: true, sensory: true });
    expect(visualFlags(DEFAULT_SETTINGS, () => false, {}).sensory).toBe(false);
  });
});

describe('the device dims', () => {
  it('the root has alius-sensory while the hold dims it, and loses it with the hold; the header is not rendered', () => {
    const dim = open(true);
    expect(root().classList.contains('alius-sensory')).toBe(true);
    expect(root().querySelector('.alius-status')!.childElementCount).toBe(0);
    dim.close();
    const plain = open(false);
    expect(root().classList.contains('alius-sensory')).toBe(false);
    expect(root().querySelector('.alius-status')!.childElementCount).toBeGreaterThan(0);
    plain.refresh();
    expect(root().classList.contains('alius-sensory')).toBe(false);
  });

  it('the stylesheet takes the portraits and the header off under alius-sensory and leaves plain lines', () => {
    const css = readFileSync('css/84-practice.css', 'utf8');
    expect(css).toMatch(/\.alius-sensory[^{]*\.alius-portrait[^{]*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.alius-sensory[^{]*\.alius-status[^{]*\{[^}]*display:\s*none/);
  });
});

describe('the sound is turned down', () => {
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
    } as never;
    return { ctx, gains };
  }
  const peak = (g: { values: number[] }) => Math.max(...g.values);

  it('while sensory every sound plays at the tuning\'s share of its gain (0.3) and at full again after', () => {
    expect(TUNING.practice.hold.sensoryVolume).toBe(0.3);
    const audio = fakeAudio();
    const sound = createSound({ settings: () => ({ ...DEFAULT_SETTINGS, soundVolume: 100, soundMuted: false }), registries: () => reg, audio: () => audio.ctx });
    document.dispatchEvent(new Event('pointerdown'));
    sound.play('open');
    const full = peak(audio.gains[0]!);
    sound.setSensory(true);
    sound.play('open');
    expect(peak(audio.gains[1]!)).toBeCloseTo(full * 0.3, 5);
    sound.setSensory(false);
    sound.play('open');
    expect(peak(audio.gains[2]!)).toBeCloseTo(full, 5);
    sound.dispose();
  });
});
