import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { applyDirectorOutput, emptyOutput, fallbackOutput, openRequest, validateDirectorOutput } from '../../../src/engine/world/director';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const validate = (raw: unknown, s: CampaignState, only?: 'rumors') => validateDirectorOutput(s, reg, raw, { cooldownDays: 3, only });
const hint = (over: Record<string, unknown> = {}) => ({ objectiveHint: { text: 'Scout the east gate before dark.', dueDays: 3, ...over } });
const requested = (s: CampaignState): CampaignState => { const d = structuredClone(s); openRequest(d, 'day_end'); return d; };

describe('objectiveHint: validation', () => {
  it('a valid hint passes', () => {
    const r = validate(hint(), campaign(reg, 4));
    expect(r.rejected).toEqual([]);
    expect(r.output.objectiveHint).toEqual({ text: 'Scout the east gate before dark.', dueDays: 3 });
  });

  it('dueDays is optional', () => {
    expect(validate({ objectiveHint: { text: 'Rest up.' } }, campaign(reg, 4)).output.objectiveHint).toEqual({ text: 'Rest up.' });
  });

  it('text over 16 words, empty text or dueDays 0 are rejected (listed in rejected)', () => {
    const s = campaign(reg, 4);
    const long = Array.from({ length: 17 }, (_, i) => `w${i}`).join(' ');
    for (const bad of [hint({ text: long }), hint({ text: '   ' }), hint({ dueDays: 0 }), hint({ dueDays: 15 }), hint({ dueDays: 2.5 }), { objectiveHint: 'go' }, { objectiveHint: { dueDays: 3 } }, hint({ text: 'x'.repeat(101) })]) {
      const r = validate(bad, s);
      expect(r.output.objectiveHint, JSON.stringify(bad)).toBeUndefined();
      expect(r.rejected.map((x) => x.part), JSON.stringify(bad)).toEqual(['objectiveHint']);
    }
  });

  it('exactly 16 words and 100 characters pass', () => {
    const s = campaign(reg, 4);
    expect(validate(hint({ text: Array.from({ length: 16 }, () => 'go').join(' ') }), s).output.objectiveHint).toBeDefined();
  });

  it('markup and control characters stay plain text', () => {
    const r = validate(hint({ text: 'Check <b>the</b>\n gate' }), campaign(reg, 4));
    expect(r.output.objectiveHint!.text).toBe('Check <b>the</b> gate');
  });

  it('a hint during the prologue is rejected', () => {
    const r = validate(hint(), campaign(reg, 4, { onboarding: 'prologue' }));
    expect(r.output.objectiveHint).toBeUndefined();
    expect(r.rejected).toEqual([{ part: 'objectiveHint', reason: expect.stringMatching(/prologue/) }]);
  });

  it('a hint after the prologue passes', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.onboarding!.done = true;
    expect(validate(hint(), s).output.objectiveHint).toBeDefined();
  });

  it('a scout request (rumors only) ignores the hint', () => {
    const r = validate(hint(), campaign(reg, 4), 'rumors');
    expect(r.output.objectiveHint).toBeUndefined();
  });

  it('fallbackOutput has no hint', () => {
    expect(fallbackOutput(campaign(reg, 4), reg, new Rng(seedRng(3))).objectiveHint).toBeUndefined();
    expect(emptyOutput().objectiveHint).toBeUndefined();
  });
});

describe('objectiveHint: applying', () => {
  const apply = (s: CampaignState, text: string, dueDays?: number) => {
    const d = requested(s);
    return run(d, reg, { type: 'director/apply', payload: { requestId: d.world.director!.pending!.id, output: { objectiveHint: { text, ...(dueDays !== undefined ? { dueDays } : {}) } } } });
  };

  it('a valid hint becomes the open director objective and the previous one is done', () => {
    let s = campaign(reg, 4);
    s.day = 2;
    const a = apply(s, 'Scout the east gate.', 4);
    expect(errors(a.events)).toEqual([]);
    expect(a.state.objectives).toEqual([{ id: expect.any(String), text: 'Scout the east gate.', source: 'director', dueDay: 6, done: false }]);
    expect(ofType(a.events, 'objective_set')).toEqual([{ type: 'objective_set', id: a.state.objectives![0].id, text: 'Scout the east gate.' }]);
    s = a.state;
    const b = apply(s, 'Visit the medbay.');
    expect(b.state.objectives!.map((o) => [o.text, o.done])).toEqual([['Scout the east gate.', true], ['Visit the medbay.', false]]);
    expect(b.state.objectives!.filter((o) => !o.done)).toHaveLength(1);
    expect(b.state.objectives![1].dueDay).toBeUndefined();
  });

  it('done objectives are kept at most 10', () => {
    let s = campaign(reg, 4);
    for (let i = 0; i < 14; i++) s = apply(s, `Task number ${i}.`).state;
    const done = s.objectives!.filter((o) => o.done);
    expect(done).toHaveLength(10);
    expect(s.objectives!.filter((o) => !o.done)).toHaveLength(1);
    expect(s.objectives!.at(-1)!.text).toBe('Task number 13.');
    expect(done[0].text).toBe('Task number 3.'); // the oldest ones went
  });

  it('a rejected hint changes nothing and is listed', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    const r = apply(s, 'Scout the east gate.', 4);
    expect(r.state.objectives).toBeUndefined();
    expect(ofType(r.events, 'director_rejected')[0]).toMatchObject({ rejected: [{ part: 'objectiveHint' }] });
  });

  it('an old save (no onboarding, no objectives) takes a hint', () => {
    const s = campaign(reg, 4);
    expect(s.onboarding).toBeUndefined();
    expect(s.objectives).toBeUndefined();
    expect(apply(s, 'Check the gate.').state.objectives).toHaveLength(1);
  });

  it('applyDirectorOutput without a hint leaves objectives alone', () => {
    const s = campaign(reg, 4);
    s.objectives = [{ id: 'ob', text: 'Keep.', source: 'director', done: false }];
    const d = structuredClone(s);
    applyDirectorOutput(d, ctxOf(d, reg), emptyOutput());
    expect(d.objectives).toEqual(s.objectives);
  });
});
