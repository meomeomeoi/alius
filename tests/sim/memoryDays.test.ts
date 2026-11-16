import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/memory';
import { addFact } from '../../src/engine/memory';
import { fallbackFold, foldDue } from '../../src/engine/memory/fold';
import { memoryConfig } from '../../src/engine/memory/config';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const UNITS = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];

/** Plays `days` days: each day `perDay` facts are written (about the units in turn, some seen by one unit, some by all), then the fold runs while it is due, with the fallback text (no model). */
function play(preset: 'short' | 'normal' | 'long', days: number, perDay: number): { state: CampaignState; added: number; peak: number } {
  let s = campaign(reg, 4);
  s = run(s, reg, { type: 'memory/configure', payload: { preset } }).state;
  let added = 0;
  let peak = 0;
  for (let d = 0; d < days; d++) {
    s.day += 1;
    for (let i = 0; i < perDay; i++) {
      const unit = UNITS[(added + i) % UNITS.length];
      addFact(s, { about: [unit], text: `day ${s.day} fact ${i} about ${unit}`, tags: [], importance: 1 + (i % 3) as 1 | 2 | 3, day: s.day, knownBy: i % 3 === 0 ? ['*'] : [unit] });
      added += 1;
      peak = Math.max(peak, s.memory.facts.length);
    }
    for (let guard = 0; guard < 20; guard++) {
      const due = foldDue(s);
      if (!due) break;
      const prev = s.memory.dossiers?.[due.target];
      const r = run(s, reg, {
        type: 'memory/fold',
        payload: {
          target: due.target, own: fallbackFold(prev?.own ?? '', due.own, TUNING.memory.dossierOwnMax), shared: fallbackFold(prev?.shared ?? '', due.shared, TUNING.memory.dossierSharedMax),
          factIds: [...due.own, ...due.shared].map((f) => f.id),
        },
      });
      expect(errors(r.events)).toEqual([]);
      s = r.state;
    }
  }
  return { state: s, added, peak };
}
const folded = (s: CampaignState): number => Object.values(s.memory.dossiers ?? {}).reduce((n, d) => n + d.folded, 0);

describe('a week of play', () => {
  it('a 7-day normal campaign hard-deletes nothing', () => {
    const { state, added } = play('normal', 7, 20);
    expect(state.memory.facts.length + folded(state)).toBe(added); // every fact is still a fact or is in a dossier
    expect(state.memory.facts.length).toBeLessThanOrEqual(memoryConfig(state).factsMax);
  });

  it('a short memory folds old facts instead of deleting them, and stays under its hard ceiling', () => {
    const { state, added, peak } = play('short', 14, 12);
    expect(folded(state)).toBeGreaterThan(0);
    expect(state.memory.facts.length + folded(state)).toBe(added);
    expect(peak).toBeLessThanOrEqual(Math.floor(memoryConfig(state).factsMax * TUNING.memory.hardCeiling));
    // old facts of a unit are in her dossier; a group scene shows only `shared` (the dossier parts are separate strings)
    const d = state.memory.dossiers!['unit_ann'];
    expect(d.own.length + d.shared.length).toBeGreaterThan(0);
    expect(d.own.length).toBeLessThanOrEqual(500);
    expect(d.shared.length).toBeLessThanOrEqual(400);
  });
});
