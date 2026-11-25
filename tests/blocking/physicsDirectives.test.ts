/**
 * P10e-e Task 13 (R28): the end of a hold tells the model one sentence of what she perceived over the whole run (`run.tally`), beside the
 * outcome's own sentence. A cheat she did not catch is never named (only `cheatsCaught` is read); no text gives the commander a pronoun.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { physicsDirective, tallySentence } from '../../src/blocking/physicsDirectives';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import { campaign, loadCore } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const ANN = 'unit_ann';
const outcome = (over: Record<string, unknown>): EngineEvent => ({ type: 'physics_outcome', runId: 'p1', physicsId: 'breath', holderId: ANN, result: 'released', segments: 3, ...over }) as EngineEvent;
const PRONOUN = /\b(he|him|his|himself|she's the commander)\b/i;

describe('the directive has one sentence of the tally after physics_outcome', () => {
  it('the outcome\'s sentence and one sentence of what resolved', () => {
    const s = campaign(reg, 4);
    const d = physicsDirective(outcome({ tally: { caught: 5, missed: 2, strains: 3, noticed: 1, falseTaken: 1 } }), s, reg)!;
    expect(d.id).toBe('physics:end');
    const name = s.squad.find((u) => u.id === ANN)!.displayName;
    expect(d.text.startsWith(`${name} lets go.`)).toBe(true);
    const rest = d.text.slice(`${name} lets go.`.length).trim();
    expect(rest.split(/(?<=\.)\s+/)).toHaveLength(1); // one sentence
    expect(rest).toMatch(/5 openings caught/);
    expect(rest).toMatch(/2 missed/);
    expect(rest).toMatch(/held on too long 3 times/);
    expect(rest).toMatch(/1 she noticed/);
    expect(d.text).not.toMatch(PRONOUN);
  });

  it('no caught cheat is named when it was not caught; a caught one is', () => {
    const s = campaign(reg, 4);
    const plain = physicsDirective(outcome({ tally: { caught: 2, slips: 1 } }), s, reg)!.text;
    expect(plain).not.toMatch(/cheat|secret|relief/i);
    const caught = physicsDirective(outcome({ tally: { caught: 2, slips: 3, cheatsCaught: 1 } }), s, reg)!.text;
    expect(caught).toMatch(/caught 1 cheat/);
  });

  it('without a tally (an old run, nothing resolved) the end is the outcome\'s sentence alone', () => {
    const s = campaign(reg, 4);
    const name = s.squad.find((u) => u.id === ANN)!.displayName;
    expect(physicsDirective(outcome({}), s, reg)!.text).toBe(`${name} lets go.`);
    expect(physicsDirective(outcome({ tally: {} }), s, reg)!.text).toBe(`${name} lets go.`);
  });

  it('every physics has words for its tally (read by its interaction), none with a pronoun', () => {
    for (const phys of reg.contactPhysics.values()) {
      const text = tallySentence({ caught: 2, missed: 1, slips: 1, strains: 1, noticed: 1, gasps: 1, falseTaken: 1, cheatsCaught: 1 }, phys);
      expect(text, String(phys.id)).toMatch(/\.$/);
      expect(text, String(phys.id)).not.toMatch(PRONOUN);
    }
    expect(tallySentence({}, reg.contactPhysics.get('breath'))).toBe('');
  });

  it('the stop word keeps its own directive (no tally sentence)', () => {
    const s = campaign(reg, 4);
    expect(physicsDirective(outcome({ result: 'stopped', tally: { caught: 3 } }), s, reg)!.id).toBe('blocking:stop');
  });
});
