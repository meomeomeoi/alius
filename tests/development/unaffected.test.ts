import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { runWeek } from '../helpers/unaffectedWeek';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const NEW_EVENTS = ['appraisal_recorded', 'appraisal_revised', 'development_review', 'development_shift', 'development_moment', 'development_fact', 'habit_formed'];
const withoutNew = (log: string[]): string[] =>
  log.map((line) => { const i = line.indexOf(': '); const head = line.slice(0, i + 2); return head + line.slice(i + 2).split(',').filter((t) => !NEW_EVENTS.includes(t)).join(','); });

describe('a seeded week with development on (P14b)', () => {
  it('draws the same rng, emits the same events and moves no relation', () => {
    const off = runWeek(reg);
    const on = runWeek(reg, { tweak: (s) => { s.settings.characterDevelopment = 'normal'; } });
    expect(on.rng).toEqual(off.rng);
    expect(withoutNew(on.log)).toEqual(withoutNew(off.log));
    expect(on.state.relations).toEqual(off.state.relations);
    expect(on.log.some((l) => l.includes('appraisal_recorded'))).toBe(true);
    expect(on.state.squad.some((u) => (u.development?.pending.length ?? 0) > 0)).toBe(true);
    expect(off.state.squad.every((u) => u.development === undefined)).toBe(true);
  });
});
