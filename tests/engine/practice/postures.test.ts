import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { COMMANDER } from '../../../src/engine/blocking';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { callPosture, cleanPostureName, keepsPostures, postureCap, postureWindowMs } from '../../../src/engine/practice/postures';
import { practiceRoll } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const dyn = (s: CampaignState) => dynamicOf(s, ANN)!;
type Style = 'ritual' | 'cold' | 'drill';

/** Ann at `frame`, a lover, with a scene open with her; her style is `style`, and she runs the household when `household`. */
function scened(frame: 'play' | 'role' | 'rule' = 'role', style: Style = 'ritual', household = false): CampaignState {
  const s = withService(world(reg, frame));
  s.relations[ANN].stateId = 'lover';
  unitOf(s, ANN).bond!.practice!.style = { primary: style };
  dyn(s).domains = household ? [{ id: 'household', since: s.day }] : [];
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const take = (s: CampaignState, posture: string) => run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: posture, at: 1 } });
const named = (s: CampaignState) => (s.practices?.postures[ANN] ?? []).map((p) => p.postureId);
const level = (s: CampaignState, n: number): void => { dyn(s).tracks.service = { xp: 1000, level: n as 0 }; };
const two = (s: CampaignState): CampaignState => {
  s.practices = { ...(s.practices ?? { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [] }), postures: { [ANN]: [
    { postureId: 'kneeling_upright', name: 'Down', day: s.day }, { postureId: 'standing_attention', name: 'Up', day: s.day },
  ] } } as never;
  return s;
};

describe('who names postures', () => {
  it('only a ritual or household_protocol holder; the first posture set in a scene with her is named', () => {
    expect(keepsPostures(scened('role', 'cold'), reg, ANN)).toBe(false);
    expect(keepsPostures(scened('role', 'ritual'), reg, ANN)).toBe(true);
    expect(keepsPostures(scened('role', 'cold', true), reg, ANN)).toBe(true);
    const cold = take(scened('role', 'cold'), 'kneeling_upright');
    expect(errors(cold.events)).toEqual([]);
    expect(named(cold.state)).toEqual([]);
    expect(ofType(cold.events, 'posture_named')).toEqual([]);
    const ritual = take(scened('role', 'ritual'), 'kneeling_upright');
    expect(named(ritual.state)).toEqual(['kneeling_upright']);
    expect(ofType(ritual.events, 'posture_named')).toEqual([expect.objectContaining({ unitId: ANN, holderId: ANN, postureId: 'kneeling_upright' })]);
    expect(named(take(scened('role', 'cold', true), 'bowing').state)).toEqual(['bowing']);
  });

  it('a secondary ritual counts too', () => {
    const s = scened('role', 'cold');
    unitOf(s, ANN).bond!.practice!.style = { primary: 'cold', secondary: 'ritual' };
    expect(keepsPostures(s, reg, ANN)).toBe(true);
  });

  it("the name stands for the posture's label until she names it", () => {
    const r = take(scened(), 'kneeling_upright');
    expect(r.state.practices!.postures[ANN][0].name).toBe('Kneeling upright');
    expect(ofType(r.events, 'posture_named')[0].name).toBeUndefined(); // with no name: the controller asks for one
  });

  it('a posture is named once; the same one again changes nothing', () => {
    const start = scened();
    level(start, 2);
    let s = take(start, 'kneeling_upright').state;
    s = take(s, 'standing_attention').state;
    s = take(s, 'kneeling_upright').state;
    expect(named(s)).toEqual(['kneeling_upright', 'standing_attention']);
  });

  it('the set grows with the service track: level 0 keeps one, level 2 three', () => {
    expect(postureCap(scened(), ANN)).toBe(1);
    let s = scened();
    for (const p of ['kneeling_upright', 'standing_attention', 'bowing']) s = take(s, p).state;
    expect(named(s)).toEqual(['kneeling_upright']);
    s = scened();
    level(s, 2);
    expect(postureCap(s, ANN)).toBe(3);
    for (const p of ['kneeling_upright', 'standing_attention', 'bowing', 'sitting']) s = take(s, p).state;
    expect(named(s)).toEqual(['kneeling_upright', 'standing_attention', 'bowing']);
  });

  it('draws nothing from the campaign rng', () => {
    const s = scened();
    const before = JSON.stringify(s.rng);
    expect(JSON.stringify(take(s, 'kneeling_upright').state.rng)).toBe(before);
  });
});

describe('her name for a posture', () => {
  const nameIt = (s: CampaignState, name?: string) => run(s, reg, { type: 'practice/name_posture', payload: { holderId: ANN, postureId: 'kneeling_upright', ...(name !== undefined ? { name } : {}) } });
  const base = (): CampaignState => take(scened(), 'kneeling_upright').state;

  it('a plain name is kept and told', () => {
    const r = nameIt(base(), 'Down');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.postures[ANN][0]).toMatchObject({ postureId: 'kneeling_upright', name: 'Down' });
    expect(ofType(r.events, 'posture_named')[0].name).toBe('Down');
  });

  it("a name with a pronoun for the commander, or over 30 characters, is refused: the posture's label stands", () => {
    for (const bad of ['Kneel like he means it', 'x'.repeat(31), '', '   ', '<b>Down</b>\n']) {
      const r = nameIt(base(), bad);
      expect(errors(r.events), bad).toEqual([]);
      expect(r.state.practices!.postures[ANN][0].name, bad).toBe(bad.includes('<b>') ? 'Down' : 'Kneeling upright');
    }
    expect(cleanPostureName('x'.repeat(30))).toBe('x'.repeat(30));
    expect(cleanPostureName('x'.repeat(31))).toBeNull();
    expect(cleanPostureName('He kneels')).toBeNull();
  });

  it('with no name the label stands; an unknown posture or a holder who is not live is refused', () => {
    expect(nameIt(base()).state.practices!.postures[ANN][0].name).toBe('Kneeling upright');
    expect(errors(run(base(), reg, { type: 'practice/name_posture', payload: { holderId: ANN, postureId: 'bowing', name: 'Low' } }).events)).not.toEqual([]);
    const gone = base();
    dyn(gone).frame = 'equal';
    expect(errors(nameIt(gone, 'Down').events)).not.toEqual([]);
  });
});

describe('the call', () => {
  const at = (s: CampaignState, n: number): CampaignState => { const c = structuredClone(s); c.scene!.exchanges = n; return c; };
  const applied = [{ type: 'intents_applied', channel: 'scene' }];

  it('comes by the hashed roll after intents/apply at role with two named postures', () => {
    const base = two(scened('role'));
    let hits = 0;
    for (let n = 0; n < 300; n++) {
      const s = at(base, n);
      const events = callPosture(s, ctxOf(s), applied);
      const expected = practiceRoll(s, ANN, `call:${s.scene!.id}:${n}`) < TUNING.practice.posture.callChance;
      expect(ofType(events, 'posture_called').length > 0, `exchange ${n}`).toBe(expected);
      if (expected) {
        hits++;
        expect(['kneeling_upright', 'standing_attention']).toContain(s.practices!.call!.postureId);
        expect(s.practices!.call).toMatchObject({ holderId: ANN, sceneId: s.scene!.id, at: n });
      } else expect(s.practices!.call).toBeUndefined();
    }
    expect(hits).toBeGreaterThan(10);
    expect(hits).toBeLessThan(90);
  });

  it('only after an intents/apply, in a scene with her, at role or beyond, with two postures, and none while a call is open', () => {
    const find = (s: CampaignState): CampaignState => {
      for (let n = 0; n < 300; n++) { const c = at(s, n); if (practiceRoll(c, ANN, `call:${c.scene!.id}:${n}`) < TUNING.practice.posture.callChance) return c; }
      throw new Error('no hit');
    };
    const hit = find(two(scened('role')));
    expect(callPosture(structuredClone(hit), ctxOf(hit), [{ type: 'scene_exchange' }])).toEqual([]); // not after intents/apply
    const play = find(two(scened('play')));
    expect(callPosture(play, ctxOf(play), applied)).toEqual([]);
    const one = find(scened('role'));
    one.practices = { ...(one.practices ?? {}), postures: { [ANN]: [{ postureId: 'bowing', name: 'Low', day: one.day }] } } as never;
    expect(callPosture(one, ctxOf(one), applied)).toEqual([]);
    const open = structuredClone(hit);
    expect(callPosture(open, ctxOf(open), applied)).not.toEqual([]);
    expect(callPosture(open, ctxOf(open), applied)).toEqual([]); // the call is open
    const cold = find(two(scened('role')));
    dyn(cold).frame = 'equal';
    expect(callPosture(cold, ctxOf(cold), applied)).toEqual([]);
  });

  it('only calls a posture that is allowed now: one whose category went off since it was named is not called (review M14)', () => {
    const base = two(scened('role'));
    const gated = { ...reg, blockingPostures: new Map(reg.blockingPostures) } as Registries;
    gated.blockingPostures.set('kneeling_upright', { ...reg.blockingPostures.get('kneeling_upright')!, contentTags: ['gated_category'] });
    const applied = [{ type: 'intents_applied', channel: 'scene' }];
    let called = 0;
    for (let n = 0; n < 300; n++) {
      const s = at(base, n);
      const events = callPosture(s, { registries: gated }, applied);
      if (practiceRoll(s, ANN, `call:${s.scene!.id}:${n}`) < TUNING.practice.posture.callChance) called += events.length;
    }
    expect(called, 'one posture is left: there is nothing to choose between').toBe(0);
    // with the category on both are callable and the gated one can be picked
    const on = at(base, 0);
    on.content = { enabled: [...(on.content?.enabled ?? []), 'gated_category'] };
    const picked = new Set<string>();
    for (let n = 0; n < 300; n++) {
      const s = at(on, n);
      callPosture(s, { registries: gated }, applied);
      if (s.practices?.call !== undefined) picked.add(s.practices.call.postureId);
    }
    expect(picked.size).toBeGreaterThan(0);
  });

  it('draws nothing from the campaign rng, and her window is by style', () => {
    const s = two(scened('role'));
    const rng = JSON.stringify(s.rng);
    for (let n = 0; n < 50; n++) callPosture(at(s, n), ctxOf(s), applied);
    expect(JSON.stringify(s.rng)).toBe(rng);
    expect(postureWindowMs(scened('role', 'ritual'), reg, ANN)).toBe(TUNING.practice.posture.windowMs.ritual);
    expect(postureWindowMs(scened('role', 'drill'), reg, ANN)).toBe(TUNING.practice.posture.windowMs.drill);
    expect(postureWindowMs(scened('role', 'cold'), reg, ANN)).toBe(TUNING.practice.posture.windowMs.other);
  });

  /** A call for kneeling, open in the scene. */
  function called(): CampaignState {
    const s = two(scened('role'));
    s.practices!.call = { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: s.scene!.id, at: 3 };
    return s;
  }
  const answer = (s: CampaignState, postureId: string | undefined, late: boolean) => run(s, reg, { type: 'practice/take_posture', payload: { callId: 'pc1', ...(postureId !== undefined ? { postureId } : {}), late, at: 2 } });

  it('right and in time sets the posture and gives service xp', () => {
    const s = called();
    const xp0 = dyn(s).tracks.service?.xp ?? 0;
    const r = answer(s, 'kneeling_upright', false);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.blocking![COMMANDER].posture).toBe('kneeling_upright');
    expect(dynamicOf(r.state, ANN)!.tracks.service.xp).toBe(xp0 + TUNING.practice.posture.xp);
    expect(r.state.practices!.call).toBeUndefined();
    expect(ofType(r.events, 'posture_slip')).toEqual([]);
    expect(ofType(r.events, 'posture_called')[0]).toMatchObject({ taken: true });
  });

  it('wrong or late is a slip: posture_slip and a trivial offence', () => {
    for (const [posture, late] of [['standing_attention', false], ['kneeling_upright', true], [undefined, true]] as const) {
      const s = called();
      const r = answer(s, posture, late);
      expect(errors(r.events), String(posture)).toEqual([]);
      expect(ofType(r.events, 'posture_slip')).toHaveLength(1);
      expect(r.state.practices!.offences[ANN]).toHaveLength(1);
      expect(r.state.practices!.call).toBeUndefined();
      expect(dynamicOf(r.state, ANN)!.tracks.service?.xp ?? 0).toBe(dyn(s).tracks.service?.xp ?? 0);
      expect(r.state.scene!.blocking?.[COMMANDER]?.posture).toBeUndefined();
    }
  });

  it('is refused for a call that is gone, a posture that is not hers, or a holder who is not live; it draws nothing', () => {
    const s = called();
    expect(errors(run(s, reg, { type: 'practice/take_posture', payload: { callId: 'pc9', postureId: 'kneeling_upright', late: false } }).events)).not.toEqual([]);
    expect(errors(answer(s, 'bowing', false).events)).not.toEqual([]);
    const gone = called();
    dyn(gone).frame = 'equal';
    expect(errors(answer(gone, 'kneeling_upright', false).events)).not.toEqual([]);
    const rng = JSON.stringify(s.rng);
    expect(JSON.stringify(answer(s, 'kneeling_upright', false).state.rng)).toBe(rng);
  });

  it("a posture the commander cannot take now (held in place) voids the call: no xp, no slip", () => {
    const s = called();
    s.practices!.call!.postureId = 'standing_attention';
    s.scene!.blocking = { ...(s.scene!.blocking ?? {}), [COMMANDER]: { worn: { feet: { id: 'spreader_bar', since: 0 } } } } as never; // movement is limited: no standing
    const probe = answer(s, 'standing_attention', false);
    expect(errors(probe.events)).toEqual([]);
    expect(probe.state.practices!.call).toBeUndefined();
    expect(ofType(probe.events, 'posture_slip')).toEqual([]);
    expect(probe.state.scene!.blocking![COMMANDER].posture).toBeUndefined();
    expect(dynamicOf(probe.state, ANN)!.tracks.service?.xp ?? 0).toBe(dyn(s).tracks.service?.xp ?? 0);
  });

  it("the call goes with the scene", () => {
    const s = called();
    const ended = run(s, reg, { type: 'scene/end', payload: {} });
    expect(ended.state.practices!.call).toBeUndefined();
  });
});
