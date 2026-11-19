import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import type { ImportOutcome } from '../../src/setup/profile';
import { Wizard } from '../../src/setup/wizard';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const card = (n: string) => ({ avatar: `${n}.png`, name: n[0].toUpperCase() + n.slice(1) }) as never;

/** A wizard with a start, a crime and `names` as complete, manually calibrated units. */
function ready(...names: string[]): Wizard {
  const w = new Wizard(
    { registries: reg, desireBondDefects: false, importer: vi.fn(async (): Promise<ImportOutcome> => ({ kind: 'manual', reason: 'test' })), onChange: () => {} },
    { personaName: 'Vale', canBindCurrent: false },
  );
  w.setStart('start_vesper');
  w.setCrime('mutiny');
  names.forEach((n, i) => {
    w.toggleUnit(card(n));
    w.setManual(i);
    w.update(i, { roleId: 'assault', signature: { templateId: 'sig_frenzy', name: 'W', description: 'D' }, defects: [{ id: 'echo_bleed', origin: 'o' }] });
  });
  return w;
}

describe('the wizard: head start', () => {
  it('the default is arrival and the result has no headStart', () => {
    const w = ready('ann', 'bea');
    expect(w.state.headStart).toEqual({ days: 0, newArrivals: [] });
    expect(w.result()!.headStart).toBeUndefined();
    expect('headStart' in w.result()!).toBe(false);
  });

  it('two weeks writes the result', () => {
    const w = ready('ann', 'bea');
    w.setHeadStart(14);
    expect(w.result()!.headStart).toEqual({ days: 14, newArrivals: [] });
  });

  it('a new arrival is written by card', () => {
    const w = ready('ann', 'bea');
    w.setHeadStart(7);
    w.toggleNewArrival('bea.png');
    expect(w.result()!.headStart).toEqual({ days: 7, newArrivals: ['bea.png'] });
    w.toggleNewArrival('bea.png');
    expect(w.result()!.headStart).toEqual({ days: 7, newArrivals: [] });
  });

  it('setting arrival clears the new arrivals', () => {
    const w = ready('ann', 'bea');
    w.setHeadStart(30);
    w.toggleNewArrival('bea.png');
    w.setHeadStart(0);
    expect(w.state.headStart).toEqual({ days: 0, newArrivals: [] });
    w.setHeadStart(30);
    expect(w.state.headStart.newArrivals).toEqual([]);
  });

  it('removing a unit removes her from the new arrivals', () => {
    const w = ready('ann', 'bea');
    w.setHeadStart(14);
    w.toggleNewArrival('bea.png');
    w.toggleUnit(card('bea'));
    expect(w.state.headStart.newArrivals).toEqual([]);
    w.toggleUnit(card('bea')); // chosen again: not new
    expect(w.state.headStart.newArrivals).toEqual([]);
  });

  it('toggleNewArrival does nothing at arrival or for a card not chosen', () => {
    const w = ready('ann', 'bea');
    w.toggleNewArrival('bea.png');
    expect(w.state.headStart.newArrivals).toEqual([]);
    w.setHeadStart(14);
    w.toggleNewArrival('zed.png');
    expect(w.state.headStart.newArrivals).toEqual([]);
  });

  it('every unit new makes result() null with the validation line', () => {
    const w = ready('ann', 'bea');
    w.setHeadStart(14);
    w.toggleNewArrival('ann.png');
    w.toggleNewArrival('bea.png');
    expect(w.result()).toBeNull();
    w.state.step = 'review'; // the review step reads the validation of the whole setup
    expect(w.canAdvance().reason ?? '').toMatch(/at least one soldier who already knows the commander/);
  });

  it('invalid days are ignored', () => {
    const w = ready('ann');
    w.setHeadStart(14);
    w.setHeadStart(10 as never);
    expect(w.state.headStart.days).toBe(14);
  });

  it('a head start with no unit chosen is refused with the same line', () => {
    const w = ready();
    w.setHeadStart(7);
    expect(w.result()).toBeNull();
  });

  it('the day-1 preview says a head start will move it, and not for a new arrival', () => {
    const w = ready('ann', 'bea');
    expect(w.previewStart(0)!.headStartDays).toBe(0);
    w.setHeadStart(14);
    w.toggleNewArrival('bea.png');
    expect(w.previewStart(0)!.headStartDays).toBe(14);
    expect(w.previewStart(1)!.headStartDays).toBe(0);
  });

  it('the world step is in both wizard modes', () => {
    for (const mode of ['prologue', 'veteran'] as const) {
      const w = ready('ann');
      w.setMode(mode);
      expect(w.stepsFor()).toContain('world');
    }
  });
});

describe('the wizard: character development (P14b)', () => {
  it('defaults to normal, and the result carries the chosen mode', () => {
    const w = ready('ann', 'bea');
    expect(w.state.development).toBe('normal');
    expect(w.result()!.characterDevelopment).toBe('normal');
    w.setDevelopment('off');
    expect(w.result()!.characterDevelopment).toBe('off');
    w.setDevelopment('slow');
    expect(w.result()!.characterDevelopment).toBe('slow');
  });
});
