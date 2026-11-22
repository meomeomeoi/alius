import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/warden';
import '../../../src/engine/actions/scene';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import { openOverrideOf } from '../../../src/engine/dynamic/command';
import { forgetDynamic } from '../../../src/engine/dynamic/forget';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { dispatch, type Action } from '../../../src/engine/dispatch';
import { seedRng } from '../../../src/engine/rng';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { argueChance, overrideOpen, wardenOf } from '../../../src/engine/warden';
import { ContextBuilder } from '../../../src/llm/context';
import { createWarden } from '../../../src/warden/controller';
import { campaign, errors, loadCore, unitSetup } from '../../helpers/world';
import { worldHarness } from '../../helpers/worldApp';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const run = (s: CampaignState, a: Action) => dispatch(s, a, reg);
const types = (events: Array<{ type: string }>) => events.map((e) => e.type);

/** Ann holds the command at `hold` (frame rule, a possessive pair). */
function withHolder(s: CampaignState, hold: number): CampaignState {
  s.dynamic ??= newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.content = { enabled: ['restraint'] };
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'possessive' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'rule', hold, domains: [{ id: 'command', since: 1 }] };
  s.relations[ANN].affinity = 0;
  return s;
}
const trainWithBea: Action = { type: 'activity/do', payload: { activityId: 'train', companionId: BEA } };

/** A campaign in which Ann has overridden `train with Bea` (the first seed that hits). */
function overridden(hold = 80, base: () => CampaignState = () => campaign(reg, 4)): CampaignState {
  for (let seed = 1; seed < 300; seed++) {
    const s = withHolder(base(), hold);
    s.rng = seedRng(seed);
    const r = run(s, trainWithBea);
    if (r.state.dynamic?.override !== undefined) return r.state;
  }
  throw new Error('no seed overrides');
}
const answer = (s: CampaignState, a: 'comply' | 'argue' | 'defy') => run(s, { type: 'warden/answer', payload: { overrideId: openOverrideOf(s)!.id, answer: a } });
const dyn = (s: CampaignState) => dynamicOf(s, ANN)!;

describe('a holder\'s override answered', () => {
  it('holder comply: her alternative runs, hold +3, favour +2, override_answered', () => {
    const s = overridden(80);
    const before = dyn(s);
    expect([before.hold, before.favour]).toEqual([80, 0]);
    const r = answer(s, 'comply');
    expect(errors(r.events)).toEqual([]);
    const done = r.events.find((e) => e.type === 'override_answered')!;
    expect(done).toMatchObject({ answer: 'comply', context: 'base', source: 'holder', unitId: ANN });
    expect(r.events.find((e) => e.type === 'activity_done')).toMatchObject({ companionId: ANN }); // what she wanted instead
    expect(dyn(r.state).hold).toBe(83);
    expect(dyn(r.state).favour).toBe(2);
    expect(r.state.dynamic!.override).toBeUndefined();
    expect(overrideOpen(r.state)).toBeNull();
    expect(types(r.events)).not.toContain('commander_punished');
  });

  it('holder defy has no warden punishment: the order runs, hold -6 (overrode_her, once), favour -3, the contest', () => {
    const s = overridden(80);
    const r = answer(s, 'defy');
    expect(errors(r.events)).toEqual([]);
    expect(r.events.find((e) => e.type === 'activity_done')).toMatchObject({ companionId: BEA }); // the commander's order
    expect(r.events.filter((e) => e.type === 'hold_changed')).toEqual([{ type: 'hold_changed', unitId: ANN, from: 80, to: 74, cause: 'overrode_her' }]);
    expect(dyn(r.state).hold).toBe(74);
    expect(dyn(r.state).favour).toBe(-3);
    expect(dyn(r.state).contest).toEqual([r.state.day]);
    expect(r.events).toContainEqual({ type: 'refusal_noted', unitId: ANN, what: 'defy' });
    expect(r.events.find((e) => e.type === 'override_answered')).toMatchObject({ answer: 'defy', source: 'holder', unitId: ANN });
    for (const t of ['commander_punished', 'warden_defied', 'punishment_rolled', 'defiance_changed']) expect(types(r.events)).not.toContain(t);
    expect(r.state.dynamic!.override).toBeUndefined();
  });

  describe('spoken for (I7): the squad saw her speak for the commander', () => {
    const deeds = (st: CampaignState) => st.commander.deeds?.spoken_for ?? 0;
    it('counts a complied override whose order names someone else, a roster or an expedition; not a defied one', () => {
      const s = overridden(80); // train with Bea: Bea is in it
      expect(deeds(answer(structuredClone(s), 'comply').state)).toBe(1);
      expect(deeds(answer(structuredClone(s), 'defy').state)).toBe(0);
      for (const order of [{ kind: 'roster', activeIds: [ANN] }, { kind: 'expedition', unitIds: [ANN] }]) {
        const t = structuredClone(s);
        t.dynamic!.override!.order = order as never;
        expect(deeds(answer(t, 'comply').state), order.kind).toBe(1);
      }
    });
    it('counts when another squad member is in the scene with her, not when it is the two alone', () => {
      const alone = structuredClone(overridden(80));
      alone.dynamic!.override!.order = { kind: 'activity', activityId: 'train' } as never;
      expect(deeds(answer(structuredClone(alone), 'comply').state)).toBe(0);
      const watched = structuredClone(alone);
      watched.scene = { id: 'sc', participants: [ANN, CAT] } as never;
      expect(deeds(answer(watched, 'comply').state)).toBe(1);
    });
  });

  it('the third defiance at rule opens her submit claim', () => {
    const s = overridden(80);
    dyn(s).contest = [s.day - 1, s.day - 2];
    const r = answer(s, 'defy');
    expect(r.state.dynamic!.open.claims).toEqual([expect.objectContaining({ unitId: ANN, submit: true })]);
  });

  it('with a warden in the game, a holder\'s answer never touches her satisfaction or defiance', () => {
    const base = () => {
      const out = buildCampaign({
        commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat', 'Dee'].map((n) => unitSetup(n)),
        mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
      }, reg, { desireBondDefects: false, seed: 7 });
      if (!out.ok) throw new Error(out.errors.join('; '));
      wardenOf(out.state)!.expectations = [{ id: 'e1', kind: 'protect_squad', weight: 0.5, source: 'values', known: false }]; // nothing she objects to here
      return out.state;
    };
    const s = overridden(80, base);
    expect(s.leashswap!.warden!.override).toBeUndefined();
    const w0 = wardenOf(s)!;
    const [sat, def] = [w0.satisfaction, w0.defiance];
    for (const a of ['comply', 'defy'] as const) {
      const r = answer(structuredClone(s), a);
      expect(errors(r.events)).toEqual([]);
      expect([wardenOf(r.state)!.satisfaction, wardenOf(r.state)!.defiance]).toEqual([sat, def]);
      expect(types(r.events)).not.toContain('warden_complied');
      expect(types(r.events)).not.toContain('warden_defied');
    }
  });

  it('a stale or foreign id is refused and nothing runs', () => {
    const s = overridden(80);
    const r = run(s, { type: 'warden/answer', payload: { overrideId: 'ov1', answer: 'comply' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state.dynamic!.override).toBeDefined();
    const bad = run(s, { type: 'warden/answer', payload: { overrideId: s.dynamic!.override!.id, answer: 'maybe' } });
    expect(errors(bad.events)).toHaveLength(1);
  });

  it('a removed holder\'s override is closed', () => {
    const s = overridden(80);
    forgetDynamic(s, ANN);
    expect(s.dynamic!.override).toBeUndefined();
  });
});

describe('ARGUE with a holder', () => {
  const scene = (s: CampaignState, participants = [ANN]) => {
    const a = run(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants, origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(a.events)).toEqual([]);
    return a.state;
  };
  const argueScene = (s: CampaignState): CampaignState => {
    const a = scene(s);
    const r = run(a, { type: 'warden/argue_started', payload: { sceneId: a.scene!.id } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };
  const compromise = (s: CampaignState) => run(s, {
    type: 'intents/apply',
    payload: { channel: 'scene', intents: { events: [{ type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'they agree', confidence: 1, overrideId: s.dynamic!.override!.id, text: 'We train together, with Ann watching.' }] } },
  });

  it('outside a fight ARGUE is the scene\'s business: nothing here, and argue_started marks the override with its scene (her alone)', () => {
    const s = overridden(80);
    expect(answer(s, 'argue').events).toEqual([]);
    const marked = argueScene(s);
    expect(marked.dynamic!.override!.arguing).toBe(marked.scene!.id);
    const other = scene(s, [CAT]);
    expect(errors(run(other, { type: 'warden/argue_started', payload: { sceneId: other.scene!.id } }).events)).toHaveLength(1);
  });

  it('a real compromise runs the commander\'s order when the scene ends, with no hold change and no favour change', () => {
    const s = argueScene(overridden(80));
    const c = compromise(s);
    expect(errors(c.events)).toEqual([]);
    expect(types(c.events)).toContain('override_compromise');
    expect(c.state.dynamic!.override!.compromise).toBe('We train together, with Ann watching.');
    const fact = c.state.memory.facts.find((f) => f.text.includes('agreed') && f.about.includes(ANN))!;
    expect(fact.text).toBe('Ann and the commander agreed: We train together, with Ann watching.');
    const end = run(c.state, { type: 'scene/end', payload: {} });
    expect(errors(end.events)).toEqual([]);
    expect(end.events.find((e) => e.type === 'activity_done')).toMatchObject({ companionId: BEA });
    expect(end.events.find((e) => e.type === 'override_answered')).toMatchObject({ answer: 'compromise' });
    expect(dyn(end.state).hold).toBe(80);
    expect(dyn(end.state).favour).toBe(0);
    expect(end.state.dynamic!.override).toBeUndefined();
  });

  it('a scene that ends without a compromise leaves only COMPLY and DEFY', () => {
    const s = argueScene(overridden(80));
    const end = run(s, { type: 'scene/end', payload: {} });
    expect(end.state.dynamic!.override).toMatchObject({ argued: true });
    expect(end.state.dynamic!.override!.arguing).toBeUndefined();
    expect(answer(end.state, 'argue').events.filter((e) => e.type === 'error')).toHaveLength(1);
    expect(errors(answer(end.state, 'comply').events)).toEqual([]);
  });

  it('a compromise offered for a holder\'s override is only offered while she is in the scene', () => {
    const s = overridden(80);
    const elsewhere = scene(s, [CAT]);
    const c = compromise(elsewhere);
    expect(types(c.events)).not.toContain('override_compromise');
    expect(c.state.dynamic!.override!.compromise).toBeUndefined();
  });

  it('argueChance for a holder reads her hold, not a warden\'s satisfaction', () => {
    const s = overridden(80);
    const strict = argueChance(s, reg, { unitId: ANN, satisfaction: 20 });
    const soft = argueChance(s, reg, { unitId: ANN, satisfaction: 90 });
    expect(strict).toBeLessThanOrEqual(soft);
    for (const p of [strict, soft]) { expect(p).toBeGreaterThanOrEqual(0.15); expect(p).toBeLessThanOrEqual(0.85); }
    expect(argueChance(s, reg)).toBe(0); // no warden, no source: as before
  });

  it('the controller argues with the override\'s unit: the scene with her alone', async () => {
    const h = worldHarness(reg, overridden(80));
    const startScene = vi.fn(async (o: { locationId: string; participants: string[] }) => {
      const events = h.app().dispatch({ type: 'scene/start', payload: { ...o, origin: 'event', consumesSlot: false, startIndex: 0 } });
      return !events.some((e) => e.type === 'error');
    });
    const ctl = createWarden({ ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn(), restore: () => false, startScene });
    expect(await ctl.argue()).toBe(true);
    const s = h.state();
    expect(s.scene).toMatchObject({ origin: 'event', consumesSlot: false, participants: [ANN] });
    expect(s.dynamic!.override!.arguing).toBe(s.scene!.id);
    // she tells the model what she did, in her directive
    const text = dynamicDirectives(s, reg, [ANN]).map((d) => d.text).join(' ');
    expect(text).toContain('has overridden the commander\'s order');
    expect(text).toContain('only by a real compromise');
    expect(text).not.toMatch(/\b(he|him|his)\b/i);
  });
});

describe('an old save', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/dynamic/p13_override_open.json', 'utf8')) as {
    before: CampaignState; overrideId: string;
    comply: { events: unknown[]; state: CampaignState }; defy: { events: unknown[]; state: CampaignState };
  };
  const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  it('a P13 save with leashswap.warden.override open loads and answers COMPLY exactly as before', () => {
    expect(fixture.before.dynamic).toBeUndefined();
    expect(fixture.before.leashswap!.warden!.override).toBeDefined();
    expect(openOverrideOf(fixture.before)).toMatchObject({ source: 'warden', id: fixture.overrideId });
    const r = run(structuredClone(fixture.before), { type: 'warden/answer', payload: { overrideId: fixture.overrideId, answer: 'comply' } });
    expect(plain(r.events)).toEqual(fixture.comply.events);
    expect(plain(r.state)).toEqual(fixture.comply.state);
  });

  it('and DEFY too', () => {
    const r = run(structuredClone(fixture.before), { type: 'warden/answer', payload: { overrideId: fixture.overrideId, answer: 'defy' } });
    expect(plain(r.events)).toEqual(fixture.defy.events);
    expect(plain(r.state)).toEqual(fixture.defy.state);
  });
});

describe('the command directive', () => {
  const sceneWith = (s: CampaignState, ids: string[]) => {
    const r = run(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };
  const ids = (s: CampaignState, present: string[]) => dynamicDirectives(s, reg, present).map((d) => d.id);

  it('reaches other present members only', () => {
    const s = withHolder(campaign(reg, 4), 80);
    const together = sceneWith(s, [ANN, BEA]);
    expect(ids(together, [ANN, BEA])).toContain(`dynamic:command:${ANN}`);
    const text = dynamicDirectives(together, reg, [ANN, BEA]).find((d) => d.id === `dynamic:command:${ANN}`)!.text;
    expect(text).toBe('Ann gives the orders now; the squad starts to address her as the one in command.');
    expect(text).not.toMatch(/\b(he|him|his)\b/i);
    // she alone with the commander: nobody else to address her
    expect(ids(sceneWith(s, [ANN]), [ANN])).not.toContain(`dynamic:command:${ANN}`);
    // others without her: they still know who gives the orders
    expect(ids(sceneWith(s, [BEA, CAT]), [BEA, CAT])).toContain(`dynamic:command:${ANN}`);
    // no command, no line; and nothing while the dynamic is off
    dyn(s).domains = [];
    expect(ids(sceneWith(s, [ANN, BEA]), [ANN, BEA]).some((id) => id.startsWith('dynamic:command:'))).toBe(false);
    const off = withHolder(campaign(reg, 4), 80);
    off.dynamic!.setup.holders = 0;
    expect(ids(off, [ANN, BEA])).toEqual([]);
  });
});
