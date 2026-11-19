import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type Action, type EngineEvent } from '../../src/engine/dispatch';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { overrideOpen, wardenOf, type Expectation } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/scene';
import '../../src/engine/actions/dilemma';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat' };
const kmc: Expectation = { id: 'e_keep_me_close', kind: 'keep_me_close', weight: 0.5, source: 'values', known: false };
const run = (s: CampaignState, a: Action) => dispatch(s, a, reg);
const err = (events: EngineEvent[]) => events.find((e) => e.type === 'error') as { message?: string; code?: string } | undefined;
const ok = (r: { state: CampaignState; events: EngineEvent[] }) => { expect(err(r.events)).toBeUndefined(); return r; };

/** A campaign with an open override on `train with Ann` (the first seed that hits). */
function overridden(): CampaignState {
  for (let seed = 1; seed < 300; seed++) {
    const out = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
      mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
    }, reg, { desireBondDefects: false, seed });
    if (!out.ok) throw new Error(out.errors.join('; '));
    const w = wardenOf(out.state)!;
    w.expectations = [kmc];
    w.satisfaction = 0;
    const r = run(out.state, { type: 'activity/do', payload: { activityId: 'train', companionId: ID.ann } });
    if (overrideOpen(r.state)) return r.state;
  }
  throw new Error('no seed overrides');
}
const argueScene = (s: CampaignState): CampaignState => {
  const a = ok(run(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.bea], origin: 'event', consumesSlot: false, startIndex: 0 } }));
  return ok(run(a.state, { type: 'warden/argue_started', payload: { sceneId: a.state.scene!.id } })).state;
};
const compromise = (s: CampaignState, over: Record<string, unknown> = {}) => run(s, {
  type: 'intents/apply',
  payload: { channel: 'scene', intents: { events: [{ type: 'compromise_reached', actor: 'commander', targets: [ID.bea], severity: 'minor', evidence: 'they agree', confidence: 1, overrideId: overrideOpen(s)!.id, text: 'We train together, with Bea watching.', ...over }] } },
});

describe('ARGUE in a scene', () => {
  it('argue_started marks the override with its scene; only with her alone, and not while compelled', () => {
    const s = overridden();
    const a = ok(run(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.bea], origin: 'event', consumesSlot: false, startIndex: 0 } }));
    const started = ok(run(a.state, { type: 'warden/argue_started', payload: { sceneId: a.state.scene!.id } }));
    expect(overrideOpen(started.state)!.arguing).toBe(a.state.scene!.id);
    expect(err(run(a.state, { type: 'warden/argue_started', payload: { sceneId: 'nope' } }).events)).toBeDefined();
    const other = ok(run(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.cat], origin: 'event', consumesSlot: false, startIndex: 0 } }));
    expect(err(run(other.state, { type: 'warden/argue_started', payload: { sceneId: other.state.scene!.id } }).events)).toBeDefined();
    const compelled = structuredClone(a.state);
    wardenOf(compelled)!.compelled = true;
    expect(err(run(compelled, { type: 'warden/argue_started', payload: { sceneId: compelled.scene!.id } }).events)).toBeDefined();
  });

  it('a compromise runs the commander\'s order when the scene ends, without defiance, and writes a fact', () => {
    const s = argueScene(overridden());
    const before = wardenOf(s)!;
    const sat = before.satisfaction;
    const def = before.defiance;
    const slot = s.slot;
    const c = ok(compromise(s));
    expect(c.events.map((e) => e.type)).toContain('override_compromise');
    expect(overrideOpen(c.state)!.compromise).toBe('We train together, with Bea watching.');
    expect(c.state.slot).toBe(slot); // nothing runs mid-scene
    const fact = c.state.memory.facts.find((f) => f.text.includes('agreed') && f.about.includes(ID.bea))!;
    expect(fact.text).toBe('Bea and the commander agreed: We train together, with Bea watching.');
    expect(fact.knownBy).toEqual(expect.arrayContaining([ID.bea]));
    const end = ok(run(c.state, { type: 'scene/end', payload: {} }));
    expect(end.events.filter((e) => e.type === 'activity_done')).toHaveLength(1);
    expect(end.events.find((e) => e.type === 'activity_done')).toMatchObject({ companionId: ID.ann });
    expect(wardenOf(end.state)!.satisfaction).toBe(sat);
    expect(wardenOf(end.state)!.defiance).toBe(def);
    expect(overrideOpen(end.state)).toBeNull();
    expect(wardenOf(end.state)!.override).toBeUndefined();
  });

  it('a scene that ends without a compromise leaves COMPLY and DEFY only', () => {
    const s = argueScene(overridden());
    const end = ok(run(s, { type: 'scene/end', payload: {} }));
    expect(overrideOpen(end.state)!.argued).toBe(true);
    expect(overrideOpen(end.state)!.arguing).toBeUndefined();
    const id = overrideOpen(end.state)!.id;
    expect(err(run(end.state, { type: 'warden/answer', payload: { overrideId: id, answer: 'argue' } }).events)).toBeDefined();
    ok(run(end.state, { type: 'warden/answer', payload: { overrideId: id, answer: 'defy' } }));
  });

  it('an aborted scene counts as an argument that failed', () => {
    const s = argueScene(overridden());
    const end = ok(run(s, { type: 'scene/abort', payload: {} }));
    expect(overrideOpen(end.state)!.argued).toBe(true);
  });

  it('a compromise_reached with an unknown overrideId is dropped', () => {
    const s = argueScene(overridden());
    const c = compromise(s, { overrideId: 'ov999' });
    expect(c.events.map((e) => e.type)).not.toContain('override_compromise');
    expect(overrideOpen(c.state)!.compromise).toBeUndefined();
  });

  it('a compromise needs the warden as its target and a text', () => {
    const s = argueScene(overridden());
    expect(overrideOpen(compromise(s, { text: '' }).state)!.compromise).toBeUndefined();
  });

  it('a second compromise does not run the order twice', () => {
    const s = argueScene(overridden());
    const one = compromise(s).state;
    const two = compromise(one, { text: 'Another deal.' });
    expect(overrideOpen(two.state)!.compromise).toBe('We train together, with Bea watching.');
  });

  it('while compelled, ARGUE and DEFY are refused', () => {
    const s = overridden();
    wardenOf(s)!.compelled = true;
    const id = overrideOpen(s)!.id;
    expect(err(run(s, { type: 'warden/answer', payload: { overrideId: id, answer: 'argue' } }).events)).toBeDefined();
    expect(err(run(s, { type: 'warden/answer', payload: { overrideId: id, answer: 'defy' } }).events)).toBeDefined();
  });

  it('a compromise order that can no longer run costs the scene end nothing', () => {
    const s = argueScene(overridden());
    const c = compromise(s).state;
    c.commander.injuredUntilDay = c.day + 5; // train is blocked now
    const end = ok(run(c, { type: 'scene/end', payload: {} }));
    expect(end.events.map((e) => e.type)).toContain('scene_ended');
    expect(end.events.map((e) => e.type)).toContain('override_compromise_failed');
    expect(overrideOpen(end.state)).toBeNull();
  });
});

describe('ARGUE on a dilemma', () => {
  function dilemmaOverride(): CampaignState {
    for (let seed = 1; seed < 300; seed++) {
      const out = buildCampaign({
        commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
        mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
      }, reg, { desireBondDefects: false, seed });
      if (!out.ok) throw new Error(out.errors.join('; '));
      const s = out.state;
      const w = wardenOf(s)!;
      w.expectations = [{ ...kmc, kind: 'no_civilian_harm', id: 'e_nch', weight: 0.5 }];
      w.satisfaction = 0;
      s.dilemmas = { seq: 1, open: {
        id: 'd1', templateId: 't', scale: 'major', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [ID.ann], beatId: 'b',
        options: [
          { label: 'cut', effects: [{ type: 'unit_event', event: 'sided_against', severity: 'minor', targets: 'party', valueAxes: [{ axis: 'mercy', direction: -1 }] }], magnitudes: [] },
          { label: 'spare', effects: [], magnitudes: [] },
        ],
      } as never };
      const r = run(s, { type: 'dilemma/choose', payload: { id: 'd1', index: 0 } });
      if (overrideOpen(r.state)) return r.state;
    }
    throw new Error('no seed overrides');
  }

  it('the scene with her alone may start while the dilemma waits; nobody else\'s may', () => {
    const s = dilemmaOverride();
    ok(run(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.bea], origin: 'event', consumesSlot: false, startIndex: 0 } }));
    expect(err(run(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.cat], origin: 'event', consumesSlot: false, startIndex: 0 } }).events)?.code).toBe('dilemma_open');
    expect(err(run(s, { type: 'activity/do', payload: { activityId: 'rest' } }).events)?.code).toBe('dilemma_open');
  });

  it('a compromise chooses the commander\'s option when the scene ends', () => {
    const s = argueScene(dilemmaOverride());
    const c = compromise(s, { text: 'I take the cost.' }).state;
    const end = ok(run(c, { type: 'scene/end', payload: {} }));
    expect(end.events.find((e) => e.type === 'dilemma_resolved')).toMatchObject({ option: 0 });
    expect(wardenOf(end.state)!.defiance).toBe(0);
  });
});
