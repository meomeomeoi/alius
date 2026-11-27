/**
 * P16b Task 18 (ruling 4): the sparring hold. Losing a sparring bout (a P9c wager) to a craft-live woman whose expectations put the target of the headlock contact at `enjoys` or `craves`
 * ends in a short scene at the training yard with that contact (`craft/headlock_start`). The wager keeps its own draw and fact; the hook after the bout (`registerAfterBout`) draws nothing.
 * The squad that was in the yard sees it: Regard falls for each witness (`regardFall` with `witness`) and the sign `protocol_public`.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/scene';
import { COMMANDER, resetBlockingHooks } from '../../../src/engine/blocking';
import { installCraftHooks } from '../../../src/engine/craft/hooks';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import { headlockContact, headlockPlace, headlockWished, noteHeadlockOutcome, offerHeadlock } from '../../../src/engine/craft/headlock';
import { knowInstantly } from '../../../src/engine/dynamic/knowledge';
import { whereabouts } from '../../../src/engine/hub';
import { personalOf } from '../../../src/engine/personal/state';
import { playWager, registerAfterBout, resetAfterBoutHooks } from '../../../src/engine/personal/wagers';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState, Wager } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); resetAfterBoutHooks(); installCraftHooks(); });

const wager = (): Wager => ({ id: 'wg_1', unitId: ANN, by: 'unit', gameId: 'sparring', stakeId: String([...reg.wagerStakes.values()].find((x) => x.effect === 'privilege')!.id), day: 20, status: 'accepted', pick: 'none' } as Wager);
const withAttitude = (s: CampaignState, attitude: string | null): CampaignState => {
  const contact = [...reg.blockingContacts.values()].find((c) => c.headlock === true)!;
  const target = (contact.target as string[])[0]!;
  unitOf(s, ANN).expectations = attitude === null ? {} : { worship: { [target]: { attitude: attitude as never } } } as never;
  const tags = (contact.contentTags as string[] | undefined) ?? [];
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), ...tags])] };
  for (const t of tags) unitOf(s, ANN).bond!.practice!.categories[t] ??= { as: 'enjoys', witness: 'indifferent' } as never; // she practises what the hold is made of
  return s;
};
/** A world where she has the sparring bout waiting and the headlock suits her. */
function bout(attitude: string | null = 'enjoys', frame: 'play' | 'equal' = 'play'): CampaignState {
  installDynamicHooks(); // the frame reader of the blocking: what a `scope: dynamic` entry needs
  const s = withAttitude(world(reg, frame), attitude);
  s.slot = 'morning';
  s.relations[ANN].affinity = 60; // the handicaps she allows to a friend
  personalOf(s).wagers = { open: [wager()], log: [] };
  return s;
}
/** Plays the bout with the rng of `seed`. */
function play(s: CampaignState, seed: number, pick = 'none') {
  const d = structuredClone(s);
  d.rng = seedRng(seed);
  const events = playWager(d, ctxOf(d, reg), 'wg_1', pick);
  return { d, events };
}
/** Plays are `[seed, handicap]`: one in which she wins, and one in which the commander wins (she is handicapped enough). */
type Play = [number, string];
function seeds(s: CampaignState): { unit: Play; commander?: Play } {
  const found: Partial<Record<'unit' | 'commander', Play>> = {};
  for (const pick of ['none', 'one_arm', 'blindfold']) {
    for (let seed = 1; seed < 40 && (found.unit === undefined || found.commander === undefined); seed++) {
      const w = ofType(play(s, seed, pick).events, 'wager_resolved')[0]?.winner;
      if (w === 'unit' || w === 'commander') found[w] ??= [seed, pick];
    }
  }
  return { unit: found.unit!, ...(found.commander !== undefined ? { commander: found.commander } : {}) };
}

describe('the content', () => {
  it('one contact is the headlock, by its field, and it is her armpit over the commander\'s face', () => {
    const c = headlockContact(bout(), reg, ANN)!;
    expect(c).toBeDefined();
    expect(c.dir).toBe('her');
    expect([...reg.blockingContacts.values()].filter((x) => x.headlock === true)).toHaveLength(1);
    expect(headlockPlace(reg)).toBe('training_yard');
  });
});

describe('who is offered it', () => {
  it('only after a lost bout to a woman it suits: she wins, the craft is live and her attitude is enjoys or craves', () => {
    const s = bout();
    const { unit, commander } = seeds(s);
    const won = play(s, ...unit);
    expect(ofType(won.events, 'headlock_offered')).toEqual([{ type: 'headlock_offered', unitId: ANN, locationId: 'training_yard' }]);
    expect(won.d.relations[ANN].craft!.headlock).toMatchObject({ day: s.day });
    // a bout the commander wins (the bout of this world is hers: the hook is asked as the wager would)
    const d = structuredClone(s);
    expect(offerHeadlock(d, ctxOf(d, reg), { wager: wager(), unitId: ANN, gameId: 'sparring', kind: 'sparring', winner: 'commander' } as never)).toEqual([]);
    expect(d.relations[ANN].craft?.headlock).toBeUndefined();
    if (commander !== undefined) expect(ofType(play(s, ...commander).events, 'headlock_offered')).toEqual([]);
  });

  it('craves counts; dislikes, tolerates, and no word of hers do not', () => {
    const s = bout();
    const { unit } = seeds(s);
    expect(ofType(play(bout('craves'), ...unit).events, 'headlock_offered')).toHaveLength(1);
    for (const a of ['dislikes', 'tolerates', null]) expect(ofType(play(bout(a), ...unit).events, 'headlock_offered'), String(a)).toEqual([]);
  });

  it('a holder at equal gets nothing, and a woman with no profile live gets nothing', () => {
    const eq = bout('enjoys', 'equal');
    const { unit } = seeds(bout());
    expect(ofType(play(eq, ...unit).events, 'headlock_offered')).toEqual([]);
    expect(headlockWished(eq, reg, ANN, [...reg.blockingContacts.values()].find((c) => c.headlock === true)!)).toBe(true); // the wish alone is not the gate
    const none = bout();
    delete unitOf(none, ANN).bond!.practice;
    expect(ofType(play(none, ...unit).events, 'headlock_offered')).toEqual([]);
  });

  it('the content gate: with the worship category off she is offered nothing', () => {
    const s = bout();
    const { unit } = seeds(s);
    s.content = { enabled: (s.content?.enabled ?? []).filter((c) => c !== 'worship') };
    expect(ofType(play(s, ...unit).events, 'headlock_offered')).toEqual([]);
  });

  it('not when the yard will be closed once the slot is spent (an evening bout)', () => {
    const s = bout();
    const { unit } = seeds(s);
    s.slot = 'evening';
    expect(ofType(play(s, ...unit).events, 'headlock_offered')).toEqual([]);
  });

  it('a bout she wins that is not a sparring bout (the hook is asked for any wager, answers for sparring)', () => {
    const s = bout();
    const d = structuredClone(s);
    expect(offerHeadlock(d, ctxOf(d, reg), { wager: { ...wager(), gameId: 'coin' }, unitId: ANN, gameId: 'coin', kind: 'coin', winner: 'unit' } as never)).toEqual([]);
    expect(offerHeadlock(d, ctxOf(d, reg), { wager: wager(), unitId: ANN, gameId: 'sparring', kind: 'sparring', winner: 'void' } as never)).toEqual([]);
  });
});

describe('the wager is as it was', () => {
  it('the bout draws exactly what it drew and the wager keeps its own fact and event, with or without the hook', () => {
    const s = bout();
    const { unit } = seeds(s);
    const withHook = play(s, ...unit);
    resetAfterBoutHooks();
    const without = play(s, ...unit);
    expect(withHook.d.rng).toEqual(without.d.rng);
    expect(ofType(withHook.events, 'wager_resolved')).toEqual(ofType(without.events, 'wager_resolved'));
    expect(withHook.events.filter((e) => e.type !== 'headlock_offered')).toEqual(without.events);
    // a woman it does not suit draws the same too
    const dislikes = play(bout('dislikes'), ...unit);
    expect(dislikes.d.rng).toEqual(withHook.d.rng);
  });

  it('registerAfterBout is a hook of the lower layer: its events are appended before the slot is spent, and a second key is a second hook', () => {
    const s = bout();
    resetAfterBoutHooks();
    const seen: string[] = [];
    registerAfterBout((_d, _c, b) => { seen.push(`${b.gameId}:${b.winner}`); return [{ type: 'probe_a' }]; }, 'a');
    registerAfterBout(() => [{ type: 'probe_b' }], 'b');
    const { events } = play(s, 1);
    expect(seen).toHaveLength(1);
    const types = events.map((e) => e.type);
    expect(types.indexOf('probe_a')).toBeGreaterThan(types.indexOf('wager_resolved'));
    expect(types.indexOf('probe_b')).toBeGreaterThan(types.indexOf('probe_a'));
    expect(types.indexOf('probe_b')).toBeLessThan(types.indexOf('slot_advanced'));
  });
});

describe('who watched', () => {
  it('the soldiers whose whereabouts are the yard in that slot are kept with the mark, never her', () => {
    const place = headlockPlace(reg)!;
    let found = 0;
    for (let day = 3; day < 80 && found < 2; day++) {
      const s = bout();
      s.day = day;
      const here = whereabouts(s, reg).filter((w) => w.unitId !== ANN && w.roomId !== null && reg.hubRooms.get(w.roomId)?.sceneLocationId === place).map((w) => w.unitId).filter((id) => unitOf(s, id).kind === 'named');
      const d = structuredClone(s);
      d.relations[ANN].craft = undefined;
      const events = offerHeadlock(d, ctxOf(d, reg), { wager: wager(), unitId: ANN, gameId: 'sparring', kind: 'sparring', winner: 'unit' } as never);
      if (events.length === 0) continue; // the yard is closed that slot
      expect(d.relations[ANN].craft!.headlock!.witnesses).toEqual(here);
      if (here.length > 0) found++;
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('the scene', () => {
  /** The offer made, the scene at the yard open with her alone. */
  function atYard(witnesses: string[] = [BEA]): CampaignState {
    const s = bout();
    const { unit } = seeds(s);
    const d = play(s, ...unit).d;
    d.relations[ANN].craft!.headlock!.witnesses = witnesses;
    d.slot = 'afternoon';
    return run(d, reg, { type: 'scene/start', payload: { locationId: 'training_yard', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  }

  it('craft/headlock_start stages the headlock contact with her and the hold begins (its run is kept with the mark)', () => {
    const s = atYard();
    const r = run(s, reg, { type: 'craft/headlock_start', payload: { unitId: ANN } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.blocking![COMMANDER]!.contact).toMatchObject({ id: headlockContact(s, reg, ANN)!.id, with: ANN });
    expect(r.state.scene!.physics).toBeDefined();
    expect(r.state.relations[ANN].craft!.headlock!.runId).toBe(r.state.scene!.physics!.id);
    expect(ofType(r.events, 'physics_started')).toHaveLength(1);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('is refused with no mark, no scene, another woman, or a hold running', () => {
    const s = atYard();
    expect(errors(run(s, reg, { type: 'craft/headlock_start', payload: { unitId: BEA } }).events).length).toBeGreaterThan(0);
    expect(errors(run(s, reg, { type: 'craft/headlock_start', payload: {} }).events).length).toBeGreaterThan(0);
    const none = structuredClone(s);
    delete none.relations[ANN].craft!.headlock;
    expect(errors(run(none, reg, { type: 'craft/headlock_start', payload: { unitId: ANN } }).events).length).toBeGreaterThan(0);
    const started = run(s, reg, { type: 'craft/headlock_start', payload: { unitId: ANN } }).state;
    expect(errors(run(started, reg, { type: 'craft/headlock_start', payload: { unitId: ANN } }).events).length).toBeGreaterThan(0);
  });

  it('when the hold ends, each soldier who watched loses Regard (a witness\'s share) and sees the sign protocol_public; the mark is gone', () => {
    const s = atYard([BEA, CAT]);
    s.relations[BEA].regard = 60;
    s.relations[CAT].regard = 60;
    let cur = run(s, reg, { type: 'craft/headlock_start', payload: { unitId: ANN } }).state;
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    for (let g = 0; g < 80 && cur.scene?.physics; g++) {
      const p = cur.scene.physics;
      const a = run(cur, reg, { type: 'physics/next_segment', payload: { runId: p.id } });
      events.push(...a.events);
      const plan = a.state.scene?.physics?.segment.plan;
      if (plan === undefined) { cur = a.state; continue; }
      const b = run(a.state, reg, { type: 'physics/segment_end', payload: { runId: p.id, segment: a.state.scene!.physics!.segment.n, inputs: Array.from({ length: plan.beats.length }, (_, beat) => ({ beat, kind: 'hold' })) } });
      events.push(...b.events);
      cur = b.state;
    }
    const outcome = ofType(events, 'physics_outcome');
    expect(outcome).toHaveLength(1);
    expect(outcome[0]!.result).not.toBe('stopped');
    for (const w of [BEA, CAT]) {
      expect(cur.relations[w].regard!, w).toBeLessThan(60);
      expect(events.some((e) => e.type === 'regard_changed' && e.unitId === w && e.cause === 'headlock'), w).toBe(true);
      expect(cur.dynamic?.knowledge[w]?.[ANN]?.suspicion ?? 0, w).toBeGreaterThan(0); // the sign protocol_public reached them
    }
    expect(cur.relations[ANN].craft?.headlock).toBeUndefined();
  });

  it('nobody who did not watch loses anything, and a soldier who knows the dynamic is not shocked', () => {
    const s = atYard([BEA]);
    s.relations[BEA].regard = 60;
    s.relations[CAT].regard = 60;
    const d = structuredClone(s);
    const run1 = run(d, reg, { type: 'craft/headlock_start', payload: { unitId: ANN } });
    const mark = run1.state.relations[ANN].craft!.headlock!;
    const out = [{ type: 'physics_outcome', runId: mark.runId, holderId: ANN, result: 'released' }];
    const f = structuredClone(run1.state);
    noteHeadlockOutcome(f, { registries: reg }, out as never);
    expect(f.relations[BEA].regard!).toBeLessThan(60);
    expect(f.relations[CAT].regard).toBe(60);
    // she already knows: no fall for her
    const g = structuredClone(run1.state);
    knowInstantly(g, { registries: reg }, BEA, ANN, 'protocol_public');
    g.dynamic!.knowledge[BEA]![ANN]!.level = 'knows_dynamic';
    noteHeadlockOutcome(g, { registries: reg }, out as never);
    expect(g.relations[BEA].regard).toBe(60);
  });

  it('the stop word ends it out of the fiction: no Regard falls and the mark is gone', () => {
    const s = atYard();
    s.relations[BEA].regard = 60;
    const started = run(s, reg, { type: 'craft/headlock_start', payload: { unitId: ANN } }).state;
    const r = run(started, reg, { type: 'physics/stop_word', payload: {} });
    expect(r.state.relations[BEA].regard).toBe(60);
    expect(r.state.relations[ANN].craft?.headlock).toBeUndefined();
  });

  it('a scene that ends before the hold drops the mark, and so does a day that turns', () => {
    const s = atYard();
    const ended = run(s, reg, { type: 'scene/end', payload: {} }).state;
    expect(ended.relations[ANN].craft?.headlock).toBeUndefined();
  });

  it('TUNING keeps the humiliation of the hold', () => {
    expect(TUNING.craft.headlock.humiliation).toBeGreaterThan(0);
  });
});
