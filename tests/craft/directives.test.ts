import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/craft';
import { createCraft } from '../../src/craft/controller';
import { CRAFT_PREFIX, LESSON_PREFIX, RECORD_PREFIX, clearCraftDirectives, craftDirectives, refreshCraftDirectives } from '../../src/craft/directives';
import { resetBlockingHooks } from '../../src/engine/blocking';
import { noteSlips } from '../../src/engine/craft/lesson';
import { craftRoll } from '../../src/engine/craft/state';
import { resetPhysicsHooks } from '../../src/engine/physics/style';
import { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { ContextBuilder } from '../../src/llm/context';
import { loadCore } from '../helpers/world';
import { ANN, BEA, holdScene, unitOf } from '../engine/craft/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

const ctx = () => ({ registries: reg });
const ids = (b: ContextBuilder): string[] => [...((b as unknown as { directives: Map<string, unknown> }).directives).keys()];
const slip = { type: 'physics_slip', runId: 'p1', kind: 'slip', count: 1, holderId: ANN, physicsId: 'weight' };
const NO_PRONOUN = /\b(he|him|his|himself)\b/i;
const style = (s: CampaignState, primary: string): CampaignState => { unitOf(s, ANN).bond!.practice!.style = { primary: primary as never }; return s; };

/** A scene with a lesson she has just decided to voice (a drill holder names the point after a slip). */
function withLesson(): CampaignState {
  const s = style(holdScene(reg), 'drill');
  s.scene!.exchanges = 2;
  noteSlips(s, ctx(), [slip]);
  expect(s.relations[ANN].craft!.lesson).toBeDefined();
  return s;
}

describe('no directive without the craft', () => {
  it('a campaign that never wrote the craft, a holder at equal and no scene give none, and refresh clears', () => {
    const s = holdScene(reg);
    expect(craftDirectives(s, reg, s.scene!.participants)).toEqual([]);
    const eq = withLesson();
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(craftDirectives(eq, reg, [ANN])).toEqual([]);
    const none = withLesson();
    delete none.scene;
    expect(craftDirectives(none, reg, [ANN])).toEqual([]);
    const b = new ContextBuilder();
    b.setDirective({ id: `${CRAFT_PREFIX}old`, text: 'x', expiresAfter: 'scene' });
    b.setDirective({ id: 'practice:keep', text: 'x', expiresAfter: 'scene' });
    refreshCraftDirectives(b, null, reg);
    expect(ids(b)).toEqual(['practice:keep']);
  });
});

describe('the lesson', () => {
  it('names the point for the next reply only, worded "if it fits, once", with no number and no pronoun', () => {
    const s = withLesson();
    const [d] = craftDirectives(s, reg, [ANN]);
    expect(d.id).toBe(`${LESSON_PREFIX}${ANN}`);
    expect(d.expiresAfter).toBe('next_reply');
    expect(d.text).toMatch(/hands/); // the point of a held weight
    expect(d.text).toMatch(/only if it fits, and only once/);
    expect(d.text).not.toMatch(/AUTHOR TO WRITE|\d/);
    expect(d.text).not.toMatch(NO_PRONOUN);
    expect(d.text).toContain(unitOf(s, ANN).displayName);
  });

  it('a playful holder says it as a joke', () => {
    const s = style(holdScene(reg), 'playful');
    noteSlips(s, ctx(), [slip]);
    expect(craftDirectives(s, reg, [ANN])[0]!.text).toMatch(/as a joke/);
  });

  it('is gone once the exchange has passed, in another scene, for a woman not in the room, and when she is no longer live', () => {
    const s = withLesson();
    expect(craftDirectives(s, reg, [ANN])).toHaveLength(1);
    expect(craftDirectives(s, reg, [BEA])).toEqual([]);
    expect(craftDirectives(s, reg, [])).toEqual([]);
    const later = structuredClone(s);
    later.scene!.exchanges += 1;
    expect(craftDirectives(later, reg, [ANN])).toEqual([]);
    const other = structuredClone(s);
    other.scene!.id = 'another';
    expect(craftDirectives(other, reg, [ANN])).toEqual([]);
    const idle = structuredClone(s);
    idle.relations[ANN].dynamic!.frame = 'equal';
    expect(craftDirectives(idle, reg, [ANN])).toEqual([]);
  });

  it('a slip she does not explain tells the model nothing', () => {
    const s = style(holdScene(reg), 'cruel');
    noteSlips(s, ctx(), [slip]);
    expect(craftDirectives(s, reg, [ANN])).toEqual([]);
  });
});

describe('the record she brings up', () => {
  /** A scene whose id (and so whose hash) makes her bring it up, or not. */
  function sceneWith(bring: boolean, over: { day?: number; seconds?: number } = {}): CampaignState {
    for (let i = 0; i < 200; i++) {
      const s = holdScene(reg);
      s.scene!.id = `scene_${i}`;
      s.relations[ANN].craft = { records: { weight: { longest: over.seconds ?? 1800, clean: 0, noTap: 0, day: over.day ?? s.day - 3 } } };
      if ((craftRoll(s, ANN, `record:${s.scene!.id}`) < TUNING.craft.record.bringUp) === bring) return s;
    }
    throw new Error('no scene id found');
  }

  it('once a scene, by a hash, for a record younger than 14 days: told as a hold, never a time, "if it fits, once"', () => {
    const s = sceneWith(true);
    const [d] = craftDirectives(s, reg, [ANN]);
    expect(d.id).toBe(`${RECORD_PREFIX}${ANN}`);
    expect(d.expiresAfter).toBe('scene');
    expect(d.text).toMatch(/weight hold/);
    expect(d.text).toMatch(/only if it fits and only once in this scene/);
    expect(d.text).toMatch(/Give no figure/);
    expect(d.text).not.toMatch(/AUTHOR TO WRITE|\d/);
    expect(d.text).not.toMatch(NO_PRONOUN);
    expect(craftDirectives(s, reg, [ANN])).toEqual(craftDirectives(s, reg, [ANN])); // the same hash, the same answer
    expect(craftDirectives(sceneWith(false), reg, [ANN])).toEqual([]);
  });

  it('only with a record younger than 14 days and worth a line', () => {
    const fresh = sceneWith(true, { day: 20 - 14 });
    expect(craftDirectives(fresh, reg, [ANN])).toHaveLength(1);
    const old = structuredClone(fresh);
    old.relations[ANN].craft!.records!.weight.day = old.day - 15;
    expect(craftDirectives(old, reg, [ANN])).toEqual([]);
    const small = structuredClone(fresh);
    small.relations[ANN].craft!.records!.weight.longest = 30;
    expect(craftDirectives(small, reg, [ANN])).toEqual([]);
  });

  it('chooses by chance over the scenes (about two in five) and draws nothing', () => {
    const scenes: CampaignState[] = [];
    for (let i = 0; i < 300; i++) {
      const s = holdScene(reg);
      s.scene!.id = `s${i}`;
      s.relations[ANN].craft = { records: { weight: { longest: 900, clean: 0, noTap: 0, day: s.day } } };
      scenes.push(s);
    }
    const spy = vi.spyOn(Rng.prototype as unknown as { next: () => number }, 'next');
    const hits = scenes.filter((s) => craftDirectives(s, reg, [ANN]).length > 0).length;
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(hits / 300).toBeGreaterThan(0.3);
    expect(hits / 300).toBeLessThan(0.5);
  });
});

describe('the builder and the controller', () => {
  it('refresh sets the derived lines and drops the ones that no longer hold', () => {
    const s = withLesson();
    const b = new ContextBuilder();
    refreshCraftDirectives(b, s, reg);
    expect(ids(b)).toEqual([`${LESSON_PREFIX}${ANN}`]);
    s.scene!.exchanges += 1;
    refreshCraftDirectives(b, s, reg);
    expect(ids(b)).toEqual([]);
  });

  it('a chat switch and the end of a scene drop every craft directive and nothing else', () => {
    const s = withLesson();
    const b = new ContextBuilder();
    b.setDirective({ id: 'practice:tasks:x', text: 't', expiresAfter: 'scene' });
    refreshCraftDirectives(b, s, reg);
    let refreshed = 0;
    const c = createCraft({ context: b, refreshContext: () => { refreshed++; }, state: () => s });
    expect(ids(b)).toContain(`${LESSON_PREFIX}${ANN}`);
    c.onChatChanged();
    expect(ids(b)).toEqual(['practice:tasks:x']);
    refreshCraftDirectives(b, s, reg);
    c.onSceneClosed();
    expect(ids(b)).toEqual(['practice:tasks:x']);
    expect(refreshed).toBe(0);
    clearCraftDirectives(b);
  });

  it('the controller asks for a refresh on a craft event, a slip or her punishment, and on a scene that opens, not on anything else', () => {
    let refreshed = 0;
    const c = createCraft({ context: new ContextBuilder(), refreshContext: () => { refreshed++; }, state: () => null });
    c.onEvents([{ type: 'scene_exchange' }, { type: 'activity_done' }]);
    expect(refreshed).toBe(0);
    for (const type of ['lesson', 'record_set', 'physics_slip', 'posture_slip', 'punishment_issued']) c.onEvents([{ type }]);
    expect(refreshed).toBe(5);
    c.onSceneOpened();
    expect(refreshed).toBe(6);
  });
});
