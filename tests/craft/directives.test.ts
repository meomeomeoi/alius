import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/craft';
import { createCraft } from '../../src/craft/controller';
import { CARE_PREFIX, CRAFT_PREFIX, FEET_PREFIX, LESSON_PREFIX, NAMED_PREFIX, POSTURE_PREFIX, RECORD_PREFIX, clearCraftDirectives, craftDirectives, refreshCraftDirectives } from '../../src/craft/directives';
import { COMMANDER, resetBlockingHooks, setBlocking } from '../../src/engine/blocking';
import { noteSlips } from '../../src/engine/craft/lesson';
import { craftRoll } from '../../src/engine/craft/state';
import { resetPhysicsHooks } from '../../src/engine/physics/style';
import { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { ContextBuilder } from '../../src/llm/context';
import { loadCore } from '../helpers/world';
import { ANN, BEA, holdScene, unitOf } from '../engine/craft/world';

/** A scene with her, with no foot contact live (the day of her feet is told only while one is: its own tests are at the end). */
const bare = (): CampaignState => { const s = holdScene(reg); delete s.scene!.blocking!.commander!.contact; return s; };

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
  const s = style(bare(), 'drill');
  s.scene!.exchanges = 2;
  noteSlips(s, ctx(), [slip]);
  expect(s.relations[ANN].craft!.lesson).toBeDefined();
  return s;
}

describe('no directive without the craft', () => {
  it('a campaign that never wrote the craft, a holder at equal and no scene give none, and refresh clears', () => {
    const s = bare();
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
    const s = style(bare(), 'playful');
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
    const s = style(bare(), 'cruel');
    noteSlips(s, ctx(), [slip]);
    expect(craftDirectives(s, reg, [ANN])).toEqual([]);
  });
});

describe('the record she brings up', () => {
  /** A scene whose id (and so whose hash) makes her bring it up, or not. */
  function sceneWith(bring: boolean, over: { day?: number; seconds?: number } = {}): CampaignState {
    for (let i = 0; i < 200; i++) {
      const s = bare();
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
      const s = bare();
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

describe('the posture she expects (P16b, Task 13)', () => {
  /** A scene with a hold of kneel_open open: Ann is the holder, and she named the posture. */
  function holding(over: { until?: number; hidden?: boolean; style?: string } = {}): CampaignState {
    const s = style(bare(), over.style ?? 'cold');
    delete s.scene!.blocking;
    setBlocking(s, ctx(), { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_open' }, { at: 1, source: 'engine' });
    s.practices = { seq: 3, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [],
      postures: { [ANN]: [{ postureId: 'kneel_open', name: 'Offer', day: s.day }] },
      postureRun: { id: 'pr1', holderId: ANN, presetId: 'kneel_open', startedAt: 0, present: [ANN], beats: 0, slips: 0, corrections: 0, source: 'take', ...(over.until !== undefined ? { until: over.until } : {}), ...(over.hidden ? { hidden: true } : {}) } } as never;
    return s;
  }
  const mine = (s: CampaignState, present = [ANN]) => craftDirectives(s, reg, present).filter((d) => d.id.startsWith(POSTURE_PREFIX));

  it('appears only while a posture hold is open: her name for it and the preset\'s own words, "if it fits, once", no number and no pronoun for the commander', () => {
    expect(mine(style(bare(), 'cold'))).toEqual([]);
    const [d] = mine(holding());
    expect(d.id).toBe(`${POSTURE_PREFIX}${ANN}`);
    expect(d.expiresAfter).toBe('scene');
    expect(d.text).toContain(unitOf(holding(), ANN).displayName);
    expect(d.text).toContain('Offer'); // her name for it
    expect(d.text).toContain(String(reg.servicePostures.get('kneel_open')!.promptHint)); // the preset's hint
    expect(d.text).toMatch(/If it fits/);
    expect(d.text).toMatch(/only once/);
    expect(d.text).not.toMatch(/AUTHOR TO WRITE|\d/);
    expect(d.text).not.toMatch(NO_PRONOUN);
  });

  it('without her name the preset\'s label stands; an old base name in her set reads as its default preset', () => {
    const s = holding();
    s.practices!.postures[ANN] = [];
    expect(mine(s)[0].text).toContain('Kneel open');
    const old = holding();
    old.practices!.postures[ANN] = [{ postureId: 'kneeling_upright', name: 'Down', day: old.day }];
    old.practices!.postureRun!.presetId = 'kneel_upright';
    setBlocking(old, ctx(), { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_upright' }, { at: 2, source: 'engine' });
    expect(mine(old)[0].text).toContain('Down');
  });

  it('never tells how long it lasts: the planned end and a hidden end are not in it, nor the settling-in count', () => {
    const open = mine(holding({ until: 7777 }))[0].text;
    const shut = mine(holding({ until: 7777, hidden: true }))[0].text;
    expect(open).not.toMatch(/7777|beats?\b/i);
    expect(shut).not.toMatch(/7777/);
    expect(mine(holding({ hidden: true }))[0].text).not.toMatch(/how long|duration/i);
  });

  it('a load she added is a thing she may do, never a figure: each kind is worded without a digit', () => {
    for (const load of TUNING.craft.settling.modifiers) {
      const s = holding();
      s.practices!.postureRun!.load = load;
      const t = mine(s)[0].text;
      expect(t, load).not.toMatch(/\d|AUTHOR TO WRITE/);
      expect(t, load).not.toMatch(NO_PRONOUN);
      expect(t.length, load).toBeGreaterThan(mine(holding())[0].text.length); // a load adds a clause
    }
  });

  it('is gone for a woman who is not in the room, when she is no longer live, when the run is another\'s, and when the hold ends', () => {
    expect(mine(holding(), [BEA])).toEqual([]);
    expect(mine(holding(), [])).toEqual([]);
    const idle = holding();
    idle.relations[ANN].dynamic!.frame = 'equal';
    expect(mine(idle)).toEqual([]);
    const other = holding();
    other.practices!.postureRun!.holderId = BEA;
    expect(mine(other)).toEqual([]);
    const ended = holding();
    delete ended.practices!.postureRun;
    expect(mine(ended)).toEqual([]);
  });

  it('draws nothing and refresh sets it, then drops it with the run', () => {
    const s = holding();
    const b = new ContextBuilder();
    const spy = vi.spyOn(Rng.prototype as unknown as { next: () => number }, 'next');
    refreshCraftDirectives(b, s, reg);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(ids(b)).toContain(`${POSTURE_PREFIX}${ANN}`);
    delete s.practices!.postureRun;
    refreshCraftDirectives(b, s, reg);
    expect(ids(b)).not.toContain(`${POSTURE_PREFIX}${ANN}`);
  });

  it('the controller refreshes on the events of a hold: taken and ended', () => {
    let refreshed = 0;
    const c = createCraft({ context: new ContextBuilder(), refreshContext: () => { refreshed++; }, state: () => null });
    for (const type of ['posture_taken', 'posture_ended']) c.onEvents([{ type }]);
    expect(refreshed).toBe(2);
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

describe('unasked care (Task 15)', () => {
  /** A scene with her in which a noticed care has just landed (`voiced`, in this scene). */
  function shown(over: { named?: boolean; style?: string; frame?: 'equal' | 'play' } = {}): CampaignState {
    const s = style(bare(), over.style ?? 'affectionate');
    s.relations[ANN].dynamic!.frame = over.frame ?? 'play';
    s.relations[ANN].craft = { cares: [{ day: s.day - 1, careId: 'polishing_her_boots', noticed: true, voiced: true, scene: s.scene!.id, ...(over.named === true ? { named: true as const } : {}) }] };
    return s;
  }

  it('what she may show is one directive for the scene the care landed in, worded "if it fits, once", by her style, with no number and no pronoun', () => {
    const d = craftDirectives(shown(), reg, [ANN]);
    expect(d.map((x) => x.id)).toEqual([`${CARE_PREFIX}${ANN}`]);
    expect(d[0]!.expiresAfter).toBe('scene');
    expect(d[0]!.text).toMatch(/only if it fits and only once/);
    expect(d[0]!.text).toMatch(/polishing her boots/);
    expect(d[0]!.text).toMatch(/warmly/);
    expect(d[0]!.text).not.toMatch(/\d/);
    expect(d[0]!.text).not.toMatch(NO_PRONOUN);
    expect(d[0]!.text).not.toMatch(/AUTHOR TO WRITE/);
    const cold = craftDirectives(shown({ style: 'cold' }), reg, [ANN])[0]!.text;
    expect(cold).not.toBe(d[0]!.text);
  });

  it('works at equal too (care is open toward any woman with a dynamic block), and is gone for another scene, a woman not in the room, or a care not shown', () => {
    expect(craftDirectives(shown({ frame: 'equal' }), reg, [ANN]).map((x) => x.id)).toEqual([`${CARE_PREFIX}${ANN}`]);
    const other = shown();
    other.relations[ANN].craft!.cares![0]!.scene = 'another';
    expect(craftDirectives(other, reg, [ANN])).toEqual([]);
    expect(craftDirectives(shown(), reg, [BEA])).toEqual([]);
    const unseen = shown();
    delete unseen.relations[ANN].craft!.cares![0]!.voiced;
    expect(craftDirectives(unseen, reg, [ANN])).toEqual([]);
  });

  it('the fourth shown care gives the line instead, once: she asks whether she asked for it', () => {
    const d = craftDirectives(shown({ named: true, frame: 'equal' }), reg, [ANN]);
    expect(d.map((x) => x.id)).toEqual([`${NAMED_PREFIX}${ANN}`]);
    expect(d[0]!.text).toMatch(/fourth time this week/);
    expect(d[0]!.text).toMatch(/Say it only once/);
    expect(d[0]!.text).not.toMatch(/\d/);
    expect(d[0]!.text).not.toMatch(NO_PRONOUN);
  });

  it('is cleared with every other craft directive when the scene ends', () => {
    const s = shown();
    const b = new ContextBuilder();
    refreshCraftDirectives(b, s, reg);
    expect(ids(b)).toEqual([`${CARE_PREFIX}${ANN}`]);
    delete s.scene;
    refreshCraftDirectives(b, s, reg);
    expect(ids(b)).toEqual([]);
  });
});

describe('the day of her feet (Task 16)', () => {
  const ranYesterday = (s: CampaignState): CampaignState => { s.lastExpedition = { id: 'r', day: s.day - 1, party: [ANN], regionId: 'x', missionId: 'm', missionTitle: 'm', outcome: 'success', nodes: [], log: [], loot: [], injuries: [], deaths: [], breakdowns: [], acknowledged: true, debriefed: true } as never; return s; };

  it('while a foot contact is live (holdScene has her feet on the commander), one line for the scene: how her feet are, worded "if it fits, once", with no number', () => {
    const d = craftDirectives(ranYesterday(holdScene(reg)), reg, [ANN]).filter((x) => x.id.startsWith(FEET_PREFIX));
    expect(d.map((x) => x.id)).toEqual([`${FEET_PREFIX}${ANN}`]);
    expect(d[0]!.expiresAfter).toBe('scene');
    expect(d[0]!.text).toMatch(/sore/);
    expect(d[0]!.text).toMatch(/only if it fits and only once/);
    expect(d[0]!.text).not.toMatch(/\d/);
    expect(d[0]!.text).not.toMatch(NO_PRONOUN);
    expect(d[0]!.text).not.toMatch(/AUTHOR TO WRITE/);
  });

  it('says boots or heels as she wears them, and nothing of it once the contact is gone, for a woman not in the room, or without the craft', () => {
    const heels = ranYesterday(holdScene(reg));
    unitOf(heels, ANN).likes = ['high heels'];
    expect(craftDirectives(heels, reg, [ANN]).find((x) => x.id.startsWith(FEET_PREFIX))!.text).toMatch(/heels/);
    expect(craftDirectives(ranYesterday(holdScene(reg)), reg, [ANN]).find((x) => x.id.startsWith(FEET_PREFIX))!.text).toMatch(/boots/);
    const gone = ranYesterday(holdScene(reg));
    delete gone.scene!.blocking!.commander!.contact;
    expect(craftDirectives(gone, reg, [ANN]).filter((x) => x.id.startsWith(FEET_PREFIX))).toEqual([]);
    expect(craftDirectives(ranYesterday(holdScene(reg)), reg, [BEA]).filter((x) => x.id.startsWith(FEET_PREFIX))).toEqual([]);
    const eq = ranYesterday(holdScene(reg));
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(craftDirectives(eq, reg, [ANN]).filter((x) => x.id.startsWith(FEET_PREFIX))).toEqual([]);
  });

  it('is the state of her feet that day, so it changes with the day and says nothing about care', () => {
    const fresh = holdScene(reg);
    fresh.slot = 'morning';
    const words = new Set<string>();
    for (let day = 3; day < 40; day++) { fresh.day = day; words.add(craftDirectives(fresh, reg, [ANN]).find((x) => x.id.startsWith(FEET_PREFIX))?.text ?? ''); }
    expect(words.size).toBeGreaterThan(1);
    for (const w of words) expect(w).not.toMatch(/cared|neglect|pleased/i);
  });
});
