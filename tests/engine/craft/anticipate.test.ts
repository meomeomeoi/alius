/**
 * P16b Task 17 (engine; the chip and the card come after their prototype round, chunk c7): `[ANTICIPATE]`. It is shown by her reading's axes only (readiness and belief, never the region),
 * and `craft/anticipate { unitId }` stages the first judged service of the commander's, in registry order, that fits what she is doing and passes `entryAllowed`, so P16's
 * `practice_anticipated` runs. A `next_reply` directive worded by her style lets her show she saw it.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/practice';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/scene';
import { COMMANDER, resetBlockingHooks } from '../../../src/engine/blocking';
import { anticipateRow, anticipateShown } from '../../../src/engine/craft/anticipate';
import { installCraftHooks } from '../../../src/engine/craft/hooks';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { REGION_RANKS } from '../../../src/engine/dynamic/types';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { practiceSample } from '../../../src/engine/practice/sample';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { craftDirectives, ANTICIPATE_PREFIX } from '../../../src/craft/directives';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, holdScene, unitOf } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); installCraftHooks(); });

/** A scene with her and nothing in the commander's hands, her reading of the commander read at `r` and believed at `p`. */
function reading(r: number, p: number, over: { region?: string } = {}): CampaignState {
  const s = holdScene(reg);
  delete s.scene!.blocking!.commander!.contact;
  const d = dynamicOf(s, ANN)!;
  d.readOf = { ...d.readOf, r, p, updates: 5, ...(over.region !== undefined ? { region: over.region as never } : {}) };
  return s;
}
const go = (s: CampaignState, unitId = ANN) => run(s, reg, { type: 'craft/anticipate', payload: { unitId } });
const T = TUNING.craft.anticipate;

describe('when [ANTICIPATE] is shown', () => {
  it('by her reading\'s readiness and belief only: with enough of both, never below either, and never for a reading she has not made', () => {
    expect(anticipateShown(reading(T.minR + 0.1, T.minP + 0.1), reg, ANN)).toBe(true);
    expect(anticipateShown(reading(T.minR - 0.1, T.minP + 0.1), reg, ANN)).toBe(false);
    expect(anticipateShown(reading(T.minR + 0.1, T.minP - 0.1), reg, ANN)).toBe(false);
    const unread = reading(0.8, 0.9);
    dynamicOf(unread, ANN)!.readOf.updates = 0;
    expect(anticipateShown(unread, reg, ANN)).toBe(false);
  });

  it('never reads the region: the same axes give the same answer whatever region she has', () => {
    for (const region of REGION_RANKS) {
      expect(anticipateShown(reading(0.5, 0.7, { region }), reg, ANN), `region ${region}`).toBe(true);
      expect(anticipateShown(reading(-0.9, 0.7, { region }), reg, ANN), `region ${region}`).toBe(false);
    }
  });

  it('needs the craft live, an open scene with her in it, and a service that fits and has not been anticipated in this scene', () => {
    const base = reading(0.5, 0.7);
    expect(anticipateShown(base, reg, BEA)).toBe(false); // she is not the one in the room
    const eq = reading(0.5, 0.7);
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(anticipateShown(eq, reg, ANN)).toBe(false);
    const none = reading(0.5, 0.7);
    delete none.scene;
    expect(anticipateShown(none, reg, ANN)).toBe(false);
    const used = reading(0.5, 0.7);
    used.practices = { ...(used.practices ?? {}), service: { [ANN]: { sceneId: used.scene!.id, bonus: 1, anticipated: true } } } as never;
    expect(anticipateShown(used, reg, ANN)).toBe(false);
    const asked = reading(0.5, 0.7);
    asked.practices = { ...(asked.practices ?? {}), tasks: [{ id: 'pt1', holderId: ANN, kind: 'task', tags: [TUNING.offer.serviceCategory], status: 'open', routine: false }] } as never;
    expect(anticipateShown(asked, reg, ANN)).toBe(false);
  });

  it('shows no number: nothing about it is stored, and asking changes nothing', () => {
    const s = reading(0.5, 0.7);
    const before = JSON.stringify(s);
    anticipateShown(s, reg, ANN);
    anticipateRow(s, reg, ANN);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('the staged service', () => {
  it('is the first judged service of the commander\'s, in registry order, that fits what she does and passes entryAllowed (by field, never by id)', () => {
    const s = reading(0.5, 0.7);
    const row = anticipateRow(s, reg, ANN)!;
    const expected = [...reg.blockingActivities.values()].find((a) => a.actor === 'commander' && a.scope === 'dynamic' && a.judged === true && ((a.fits as string[] | undefined) ?? []).includes('any'));
    expect(row.id).toBe(expected!.id);
    // changing the field moves the pick to the next row in order
    const clone = structuredClone(reg);
    const first = clone.blockingActivities.get(String(expected!.id)) as unknown as { fits: string[] };
    first.fits = ['body'];
    const second = [...clone.blockingActivities.values()].find((a) => a.actor === 'commander' && a.scope === 'dynamic' && a.judged === true && ((a.fits as string[] | undefined) ?? []).includes('any'))!;
    expect(anticipateRow(s, clone, ANN)!.id).toBe(second.id);
    expect(second.id).not.toBe(expected!.id);
  });

  it('craft/anticipate sets it as the commander\'s activity, and practice_anticipated follows with its favour, Regard and a yielded sample of motive her', () => {
    const s = reading(0.5, 0.7);
    s.relations[ANN].regard = 50;
    const favour = dynamicOf(s, ANN)!.favour;
    const updates = dynamicOf(s, ANN)!.readOf.updates;
    const r = go(s);
    expect(errors(r.events)).toEqual([]);
    const row = anticipateRow(s, reg, ANN)!;
    expect(r.state.scene!.blocking![COMMANDER]!.activity).toBe(row.id);
    expect(ofType(r.events, 'practice_anticipated')).toEqual([{ type: 'practice_anticipated', unitId: ANN, holderId: ANN }]);
    expect(dynamicOf(r.state, ANN)!.favour).toBe(favour + TUNING.practice.anticipation.favour);
    expect(dynamicOf(r.state, ANN)!.readOf.updates).toBe(updates + 1);
    expect(r.state.relations[ANN].regard!).toBeGreaterThan(50);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('is refused when it is not shown, and once a scene', () => {
    expect(errors(go(reading(-0.9, 0.7)).events).length).toBeGreaterThan(0);
    expect(errors(run(reading(0.5, 0.7), reg, { type: 'craft/anticipate', payload: {} }).events).length).toBeGreaterThan(0);
    const first = go(reading(0.5, 0.7)).state;
    expect(errors(go(first).events).length).toBeGreaterThan(0);
  });

  it('a campaign that never calls it is as it was: the reading helpers write nothing', () => {
    const s = reading(0.5, 0.7);
    expect(s.relations[ANN].craft).toBeUndefined();
  });
});

describe('the directive', () => {
  it('worded by her style, for the next reply only (while the exchange has not passed), once, with no number and no pronoun for the commander', () => {
    const s = reading(0.5, 0.7);
    unitOf(s, ANN).bond!.practice!.style = { primary: 'playful' as never };
    s.scene!.exchanges = 3;
    const after = go(s).state;
    const d = craftDirectives(after, reg, [ANN]).filter((x) => x.id.startsWith(ANTICIPATE_PREFIX));
    expect(d.map((x) => x.id)).toEqual([`${ANTICIPATE_PREFIX}${ANN}`]);
    expect(d[0]!.expiresAfter).toBe('next_reply');
    expect(d[0]!.text).toMatch(/only if it fits and only once/);
    expect(d[0]!.text).not.toMatch(/\d/);
    expect(d[0]!.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    const cold = structuredClone(after);
    unitOf(cold, ANN).bond!.practice!.style = { primary: 'cold' as never };
    expect(craftDirectives(cold, reg, [ANN]).find((x) => x.id.startsWith(ANTICIPATE_PREFIX))!.text).not.toBe(d[0]!.text);
    // gone once the exchange has passed, another scene, a woman not in the room
    const later = structuredClone(after);
    later.scene!.exchanges = 4;
    expect(craftDirectives(later, reg, [ANN]).filter((x) => x.id.startsWith(ANTICIPATE_PREFIX))).toEqual([]);
    expect(craftDirectives(after, reg, [BEA]).filter((x) => x.id.startsWith(ANTICIPATE_PREFIX))).toEqual([]);
  });
});

describe('practiceSample takes a returned answer (for P17e)', () => {
  it('feeds her reading with `returned` like the other answers', () => {
    const s = reading(0.5, 0.7);
    const before = dynamicOf(s, ANN)!.readOf.updates;
    practiceSample(s, reg, ANN, 'returned');
    expect(dynamicOf(s, ANN)!.readOf.updates).toBe(before + 1);
  });
});
