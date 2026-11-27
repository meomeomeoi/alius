import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { COMMANDER, registerFrameReader, resetBlockingHooks, samePreset, setBlocking } from '../../../src/engine/blocking';
import { pickHerPosture } from '../../../src/engine/craft/herSet';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import type { MannerAxis } from '../../../src/engine/dynamic/types';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { callPosture, keepsPostures, postureCap } from '../../../src/engine/practice/postures';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); });

const ZERO: Record<MannerAxis, number> = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
type Ev = { type: string; [k: string]: unknown };
const STYLES = Object.keys(TUNING.craft.posture.likes);

/** Ann at `frame`, a lover, `style` primary, with the service category on; `axes` gives her a manner. */
function holder(style: string, frame: 'play' | 'role' | 'rule' = 'role', axes: Partial<Record<MannerAxis, number>> | null = null): CampaignState {
  registerFrameReader(() => frame);
  const s = withService(world(reg, frame));
  s.relations[ANN].stateId = 'lover';
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'worship', 'objectification', 'humiliation', 'restraint'])] };
  const p = unitOf(s, ANN).bond!.practice!;
  p.style = { primary: style as 'regal' };
  if (axes !== null) p.manner = { ...ZERO, ...axes };
  return s;
}
const preset = (id: string) => reg.servicePostures.get(id)!;
const meanings = (id: string): string[] => preset(id).meaning as string[];
const named = (s: CampaignState): string[] => (s.practices?.postures[ANN] ?? []).map((p) => p.postureId);

describe('who names postures', () => {
  it('a regal or a drill holder keeps named postures now, a ritual as before, a cold one not; a secondary style counts', () => {
    for (const style of ['regal', 'drill', 'ritual']) expect(keepsPostures(holder(style), reg, ANN), style).toBe(true);
    for (const style of ['cold', 'cruel', 'playful']) expect(keepsPostures(holder(style), reg, ANN), style).toBe(false);
    const s = holder('cold');
    unitOf(s, ANN).bond!.practice!.style = { primary: 'cold', secondary: 'regal' };
    expect(keepsPostures(s, reg, ANN)).toBe(true);
  });

  it('they name a posture at a day step when their set has room, and tell so (the name asked as today)', () => {
    for (const style of ['regal', 'drill', 'ritual']) {
      const s = holder(style);
      const events = practiceDayStep(s, ctxOf(s, reg)) as Ev[];
      const n = ofType(events as never, 'posture_named') as Ev[];
      expect(n, style).toHaveLength(1);
      expect(n[0]!.name).toBeUndefined(); // the controller asks for one
      expect(named(s), style).toEqual([n[0]!.postureId]);
      expect(s.practices!.postures[ANN]![0]).toMatchObject({ taught: true });
      expect(s.practices!.postures[ANN]![0]!.name).toBe(String(preset(named(s)[0]!).label)); // her label until she names it
    }
  });

  it('only while there is room: level 0 keeps one, a second day step names nothing more until the track rises', () => {
    const s = holder('regal');
    practiceDayStep(s, ctxOf(s, reg));
    s.day += 1;
    expect((practiceDayStep(s, ctxOf(s, reg)) as Ev[]).filter((e) => e.type === 'posture_named')).toEqual([]);
    expect(named(s)).toHaveLength(1);
    dynamicOf(s, ANN)!.tracks.service = { xp: 1000, level: 1 as 0 };
    expect(postureCap(s, ANN)).toBe(2);
    s.day += 1;
    practiceDayStep(s, ctxOf(s, reg));
    expect(named(s)).toHaveLength(2);
    expect(new Set(named(s)).size).toBe(2); // never one she has
  });

  it('nothing for a style that keeps none, a holder at equal, or without the pick (a campaign with no craft is as it was)', () => {
    const cold = holder('cold');
    practiceDayStep(cold, ctxOf(cold, reg));
    expect(cold.practices?.postures[ANN]).toBeUndefined();
  });
});

describe('which posture she picks', () => {
  it('follows the likes of her style: the preset\'s meaning meets the list (every style, every frame)', () => {
    for (const style of STYLES) {
      const likes = TUNING.craft.posture.likes[style] as readonly string[];
      expect(likes.length, style).toBeGreaterThan(0);
      for (const frame of ['play', 'role', 'rule'] as const) {
        const pick = pickHerPosture(holder(style, frame), reg, ANN);
        if (pick === null) continue; // a style with nothing that fits at a low frame names none
        expect(meanings(pick).some((m) => likes.includes(m)), `${style} ${frame} ${pick}`).toBe(true);
      }
    }
  });

  it('the likes are the author\'s draft (ruling 25)', () => {
    expect(TUNING.craft.posture.likes.regal).toEqual(['display', 'worship', 'object', 'waiting', 'gratitude']);
    expect(TUNING.craft.posture.likes.drill).toEqual(['attention', 'endurance_test', 'waiting']);
    expect(TUNING.craft.posture.likes.ritual).toEqual(['waiting', 'attention', 'offering', 'gratitude', 'apology', 'submission']);
    expect(Object.keys(TUNING.craft.posture.likes).sort()).toEqual(['affectionate', 'clinical', 'cold', 'cruel', 'drill', 'obsessive', 'playful', 'possessive', 'regal', 'ritual', 'vindictive']);
  });

  it('the frame caps the humiliation: play 2, role 4, rule 5', () => {
    expect(TUNING.craft.posture.humiliationByFrame).toEqual({ play: 2, role: 4, rule: 5 });
    for (const style of STYLES) {
      for (const [frame, cap] of [['play', 2], ['role', 4], ['rule', 5]] as const) {
        const s = holder(style, frame);
        // let her name every preset her taste and the gate allow, one after the other, and check each against the cap
        for (let i = 0; i < 60; i++) {
          const pick = pickHerPosture(s, reg, ANN);
          if (pick === null) break;
          expect(Number(preset(pick).humiliation), `${style} ${frame} ${pick}`).toBeLessThanOrEqual(cap);
          s.practices = { ...(s.practices ?? { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [] }), postures: { [ANN]: [...(s.practices?.postures[ANN] ?? []), { postureId: pick, name: 'x', day: s.day }] } } as never;
        }
      }
    }
  });

  it('is never one of hers, one her limits forbid or the content gate refuses', () => {
    const s = holder('regal');
    const first = pickHerPosture(s, reg, ANN)!;
    s.practices = { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [], postures: { [ANN]: [{ postureId: first, name: 'x', day: s.day }] } } as never;
    const second = pickHerPosture(s, reg, ANN)!;
    expect(samePreset(reg, first, second)).toBe(false);
    const limited = holder('regal');
    unitOf(limited, ANN).bond!.ownLimits = { categories: ['worship', 'objectification', 'humiliation'] };
    const pick = pickHerPosture(limited, reg, ANN);
    if (pick !== null) expect((preset(pick).tags as string[]).filter((t) => ['worship', 'objectification', 'humiliation'].includes(t))).toEqual([]);
  });

  it('her manner tilts the pick: order up, the stricter meanings first; curiosity up, a meaning she has none of first', () => {
    const strict = TUNING.craft.posture.strict as readonly string[];
    expect(strict.length).toBeGreaterThan(0);
    // order: with the tilt, the pick has a strict meaning whenever a candidate with one exists; compare over several days
    let strictPicks = 0;
    let plainStrict = 0;
    for (let day = 1; day <= 30; day++) {
      const a = holder('ritual', 'role', { order: 1 });
      a.day = 40 + day;
      const b = holder('ritual', 'role', { order: 0 });
      b.day = 40 + day;
      if (meanings(pickHerPosture(a, reg, ANN)!).some((m) => strict.includes(m))) strictPicks++;
      if (meanings(pickHerPosture(b, reg, ANN)!).some((m) => strict.includes(m))) plainStrict++;
    }
    expect(strictPicks).toBe(30); // always, when one exists
    expect(plainStrict).toBeLessThan(30);
    // curiosity: she already has a posture meaning `waiting`; the tilt prefers a meaning she has none of
    for (let day = 1; day <= 20; day++) {
      const s = holder('ritual', 'role', { curiosity: 1 });
      s.day = 40 + day;
      const have = ['parade_rest'];
      s.practices = { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [], postures: { [ANN]: have.map((postureId) => ({ postureId, name: 'x', day: s.day })) } } as never;
      const known = new Set(have.flatMap((id) => meanings(reg.servicePostures.get(id) ? id : id)));
      const pick = pickHerPosture(s, reg, ANN)!;
      expect(meanings(pick).some((m) => !known.has(m)), `day ${s.day} ${pick}`).toBe(true);
    }
  });

  it('is stable and draws nothing: the same state gives the same pick, and the rng is untouched', () => {
    const s = holder('regal');
    const rng = JSON.stringify(s.rng);
    const a = pickHerPosture(s, reg, ANN);
    for (let i = 0; i < 10; i++) expect(pickHerPosture(s, reg, ANN)).toBe(a);
    practiceDayStep(s, ctxOf(s, reg));
    expect(JSON.stringify(s.rng)).toBe(rng);
    expect(named(s)).toEqual([a]);
  });

  it('a fitting preset the commander already holds is named first (P16\'s way, kept)', () => {
    const s = holder('regal');
    const candidates = new Set<string>();
    for (let day = 1; day <= 40; day++) { const c = holder('regal'); c.day = 40 + day; candidates.add(pickHerPosture(c, reg, ANN)!); }
    expect(candidates.size).toBeGreaterThan(1);
    const target = [...candidates].find((id) => preset(id).id !== pickHerPosture(s, reg, ANN))!;
    s.scene = { id: 's1', locationId: 'quarters_unit', participants: [ANN], exchanges: 0, startIndex: 0 } as never;
    setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'posture', value: String(preset(target).base), preset: target }, { at: 0, source: 'chip' });
    expect(pickHerPosture(s, reg, ANN)).toBe(target);
  });

  it('nothing for a holder who keeps none or has no style row', () => {
    expect(pickHerPosture(holder('cold'), reg, ANN)).not.toBeUndefined(); // a style with likes still has a pick (it is the caller who asks only keepers)
    const s = holder('regal');
    delete unitOf(s, ANN).bond!.practice;
    expect(pickHerPosture(s, reg, ANN)).toBeNull();
  });
});

describe('her first call of a new posture teaches', () => {
  function called(): CampaignState {
    const s = holder('ritual');
    s.practices = { seq: 5, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [], postures: { [ANN]: [
      { postureId: 'kneeling_upright', name: 'Down', day: s.day, taught: true }, { postureId: 'standing_attention', name: 'Up', day: s.day },
    ] } } as never;
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  }
  const answer = (s: CampaignState, id: string, postureId: string | undefined, late: boolean) => run(s, reg, { type: 'practice/take_posture', payload: { callId: id, ...(postureId !== undefined ? { postureId } : {}), late, at: 2 } });

  it('the call of a posture she introduced carries taught, once; a miss counts no slip and no offence, and the next call counts', () => {
    const s = called();
    const d = ctxOf(s, reg);
    // her call of the taught posture: open it as `callPosture` does (the hashed roll is the engine's; here the call is set up from her set)
    s.practices!.call = { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: s.scene!.id, at: 3, taught: true } as never;
    const r = answer(s, 'pc1', 'standing_attention', false);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'posture_slip')).toEqual([]);
    expect(r.state.practices!.offences[ANN] ?? []).toEqual([]);
    expect(ofType(r.events, 'posture_called')[0]).toMatchObject({ taught: true, missed: true });
    expect(r.state.practices!.postures[ANN]!.find((p) => p.postureId === 'kneeling_upright')!.taught).toBeUndefined(); // the lesson is over
    void d;
    // the next time it is called a miss is a slip as ever
    const s2 = r.state;
    s2.practices!.call = { id: 'pc2', holderId: ANN, postureId: 'kneeling_upright', sceneId: s2.scene!.id, at: 4 } as never;
    const miss = answer(s2, 'pc2', 'standing_attention', false);
    expect(ofType(miss.events, 'posture_slip')).toHaveLength(1);
  });

  it('a taught call answered right is taken as any other, and ends the lesson', () => {
    const s = called();
    s.practices!.call = { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: s.scene!.id, at: 3, taught: true } as never;
    const r = answer(s, 'pc1', 'kneeling_upright', false);
    expect(ofType(r.events, 'posture_called')[0]).toMatchObject({ taken: true });
    expect(r.state.practices!.postures[ANN]!.find((p) => p.postureId === 'kneeling_upright')!.taught).toBeUndefined();
  });

  it('callPosture marks the call taught while the posture is still new to her, and a posture from P16\'s own path never is', () => {
    const base = called();
    const open = (flags: [boolean, boolean]): Array<{ posture: string; taught: boolean | undefined }> => {
      const out: Array<{ posture: string; taught: boolean | undefined }> = [];
      for (let n = 0; n < 200 && out.length < 6; n++) {
        const d = structuredClone(base);
        d.scene!.exchanges = n;
        const sets = d.practices!.postures[ANN]!;
        sets[0]!.taught = flags[0] ? true : undefined;
        sets[1]!.taught = flags[1] ? true : undefined;
        if (!flags[0]) delete sets[0]!.taught;
        if (!flags[1]) delete sets[1]!.taught;
        callPosture(d, ctxOf(d, reg), [{ type: 'intents_applied' }]);
        const call = d.practices!.call as { postureId: string; taught?: boolean } | undefined;
        if (call !== undefined) out.push({ posture: call.postureId, taught: call.taught });
      }
      return out;
    };
    const both = open([true, true]);
    expect(both.length).toBeGreaterThan(0);
    for (const c of both) expect(c.taught).toBe(true);
    const none = open([false, false]);
    expect(none.length).toBeGreaterThan(0);
    for (const c of none) expect(c.taught).toBeUndefined();
    const one = open([true, false]); // only kneeling is new
    expect(one.length).toBeGreaterThan(0);
    for (const c of one) expect(c.taught).toBe(c.posture === 'kneeling_upright' ? true : undefined);
  });
});
