import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import { addCraftXp, craftCapacity, craftLevel, craftWordOf } from '../../../src/engine/craft/book';
import { careOpen, craftHolders, craftLive, craftOn } from '../../../src/engine/craft/gate';
import { CRAFT_EVENT_TYPES, CRAFT_WORDS, DISCIPLINES, craftRoll, craftWord, enduranceOf } from '../../../src/engine/craft/state';
import { commanderSkill, enduranceLevelOf, setEnduranceXp, trainedToday, trainEndurance } from '../../../src/engine/physics/skill';
import { practiceLive } from '../../../src/engine/practice/gate';
import { RESERVED_EVENT_TYPES } from '../../../src/content/schemas';
import { loadCore } from '../../helpers/world';
import { ANN, BEA, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

describe('the gate', () => {
  it('craftLive is practiceLive, craftOn is "some holder is live"', () => {
    const live = world(reg, 'play');
    expect(craftLive(live, reg, ANN)).toBe(practiceLive(live, reg, ANN));
    expect(craftLive(live, reg, ANN)).toBe(true);
    expect(craftOn(live, reg)).toBe(true);
    expect(craftHolders(live, reg)).toEqual([ANN]);
    const equal = world(reg, 'equal');
    expect(craftLive(equal, reg, ANN)).toBe(false);
    expect(craftOn(equal, reg)).toBe(false);
  });

  it('careOpen needs the dynamic, her profile and a dynamic block with the commander, not a frame', () => {
    expect(careOpen(world(reg, 'equal'), reg, ANN)).toBe(true);
    expect(careOpen(world(reg, 'play'), reg, ANN)).toBe(true);
    expect(careOpen(world(reg, 'play'), reg, BEA)).toBe(false); // no profile, no block
    const off = world(reg, 'play');
    delete off.dynamic;
    expect(careOpen(off, reg, ANN)).toBe(false);
    const blockless = world(reg, 'play');
    delete blockless.relations[ANN].dynamic;
    expect(careOpen(blockless, reg, ANN)).toBe(false);
  });

  it('craftRoll draws nothing and is stable for one unit, key and day', () => {
    const s = world(reg, 'play');
    const before = JSON.stringify(s.rng);
    const a = craftRoll(s, ANN, 'k');
    expect(craftRoll(s, ANN, 'k')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(craftRoll(s, ANN, 'other')).not.toBe(a);
    expect(JSON.stringify(s.rng)).toBe(before);
  });
});

describe('the book', () => {
  it('lists eight disciplines and the endurance key reads its physics', () => {
    expect(DISCIPLINES).toHaveLength(8);
    expect(enduranceOf('endurance:breath')).toBe('breath');
    expect(enduranceOf('stillness')).toBeNull();
  });

  it('xp adds and levels at 30 / 80 / 150 / 250 / 400, craft_level fires on each rise', () => {
    const s = world(reg, 'play');
    const levels: number[] = [];
    let total = 0;
    for (const step of [30, 50, 70, 100, 150]) {
      const ev = addCraftXp(s, reg, 'stillness', step, 'test');
      total += step;
      expect(craftLevel(s, 'stillness')).toBe([30, 80, 150, 250, 400].filter((t) => total >= t).length);
      for (const e of ev) if (e.type === 'craft_level') levels.push((e as unknown as { level: number }).level);
    }
    expect(levels).toEqual([1, 2, 3, 4, 5]);
    expect(s.commander.craft!.stillness!.lastDay).toBe(s.day);
    const small = addCraftXp(s, reg, 'speech', 10, 'test');
    expect(small.map((e) => e.type)).toEqual(['craft_xp']);
    expect(craftLevel(s, 'speech')).toBe(0);
  });

  it('endurance:breath goes through Commander.endurance with the same xp and only stamps its day in the craft book', () => {
    const s = world(reg, 'play');
    const ev = addCraftXp(s, reg, 'endurance:breath', 35, 'test');
    expect(ev.map((e) => e.type)).toEqual(['endurance_gained', 'craft_xp', 'craft_level']);
    expect(s.commander.endurance!.breath).toEqual({ xp: 35, level: 1 });
    expect(commanderSkill(s, 'breath')).toBe(1);
    expect(craftLevel(s, 'endurance:breath')).toBe(1);
    expect(s.commander.craft!['endurance:breath']).toEqual({ xp: 0, level: 0, lastDay: s.day }); // the xp is not mirrored
    expect(craftWordOf(s, 'endurance:breath')).toBe('raw');
  });

  it('writes nothing, and returns no event, while nobody is craft-live', () => {
    const s = world(reg, 'equal');
    expect(addCraftXp(s, reg, 'stillness', 50, 'test')).toEqual([]);
    expect(addCraftXp(s, reg, 'endurance:weight', 50, 'test')).toEqual([]);
    expect(s.commander.craft).toBeUndefined();
    expect(s.commander.endurance).toBeUndefined();
    const live = world(reg, 'play');
    expect(addCraftXp(live, reg, 'stillness', 0, 'test')).toEqual([]);
    expect(addCraftXp(live, reg, 'stillness', -3, 'test')).toEqual([]);
    expect(live.commander.craft).toBeUndefined();
  });

  it('the words follow the levels', () => {
    expect(CRAFT_WORDS).toEqual(['untrained', 'raw', 'practised', 'steady', 'seasoned', 'masterful']);
    expect([0, 1, 2, 3, 4, 5].map(craftWord)).toEqual([...CRAFT_WORDS]);
    expect(craftWord(9)).toBe('masterful');
    expect(craftWord(-1)).toBe('untrained');
    const s = world(reg, 'play');
    expect(craftWordOf(s, 'stillness')).toBe('untrained');
    addCraftXp(s, reg, 'stillness', 160, 'test');
    expect(craftWordOf(s, 'stillness')).toBe('steady'); // 150 is level 3
  });

  it('the body route adds to posture and pain only, and never below the level', () => {
    const s = world(reg, 'play');
    s.commander.body = { strength: 3, endurance: 5, reflexes: 2 };
    for (const k of DISCIPLINES) {
      if (k === 'posture' || k === 'pain') expect(craftCapacity(s, k), k).toBeGreaterThan(craftLevel(s, k));
      else expect(craftCapacity(s, k), k).toBe(craftLevel(s, k));
    }
    expect(craftCapacity(s, 'endurance:breath')).toBe(0);
    s.commander.body = { strength: 3, endurance: 1, reflexes: 2 }; // frail: no malus
    expect(craftCapacity(s, 'posture')).toBe(0);
    s.commander.body = { strength: 3, endurance: 3, reflexes: 2 };
    expect(craftCapacity(s, 'posture')).toBe(0);
    addCraftXp(s, reg, 'posture', 90, 'test'); // level 2
    s.commander.body.endurance = 5;
    expect(craftCapacity(s, 'posture')).toBe(3);
    expect(craftCapacity(s, 'pain')).toBe(1);
  });

  it('every event of the package is reserved', () => {
    for (const t of CRAFT_EVENT_TYPES) expect(RESERVED_EVENT_TYPES, t).toContain(t);
    expect(CRAFT_EVENT_TYPES).toHaveLength(20);
    expect(new Set(CRAFT_EVENT_TYPES).size).toBe(20);
  });
});

describe('the readers that replaced the raw reads of Commander.endurance (the same numbers)', () => {
  it('enduranceLevelOf is the strongest level, trainedToday the once-a-day mark, setEnduranceXp moves the level with the xp', () => {
    const s = world(reg, 'equal');
    expect(enduranceLevelOf(s)).toBe(0);
    expect(trainedToday(s, 'breath')).toBe(false);
    s.commander.endurance = { breath: { xp: 90, level: 2 }, weight: { xp: 300, level: 4, trainedDay: s.day } };
    expect(enduranceLevelOf(s)).toBe(4);
    expect(trainedToday(s, 'weight')).toBe(true);
    expect(trainedToday(s, 'breath')).toBe(false);
    s.day += 1;
    expect(trainedToday(s, 'weight')).toBe(false);
    setEnduranceXp(s, 'weight', 100);
    expect(s.commander.endurance.weight).toMatchObject({ xp: 100, level: 2 });
    setEnduranceXp(s, 'jaw', 100); // a physics with no xp is not created
    expect(s.commander.endurance.jaw).toBeUndefined();
  });

  it('a drill still marks the day and pays the same xp', () => {
    const s = world(reg, 'equal');
    expect(trainEndurance(s, 'breath')).toMatchObject({ type: 'endurance_gained', xp: 15, gained: 15 });
    expect(trainedToday(s, 'breath')).toBe(true);
    expect(trainEndurance(s, 'breath')).toBeNull();
  });
});
