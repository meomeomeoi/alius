import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import { addCraftXp, craftLevel } from '../../../src/engine/craft/book';
import { decayCraft, stepDownXp } from '../../../src/engine/craft/decay';
import { commanderSkill } from '../../../src/engine/physics/skill';
import type { CampaignState } from '../../../src/engine/state/types';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

/** Level 3 stillness (160 xp) earned on day 20. */
function trained(): CampaignState {
  const s = world(reg, 'play');
  addCraftXp(s, reg, 'stillness', 160, 'test');
  expect(craftLevel(s, 'stillness')).toBe(3);
  return s;
}

describe('stepDownXp', () => {
  it('falls to the threshold of the level below and holds at level 1', () => {
    expect(stepDownXp(400)).toBe(250);
    expect(stepDownXp(160)).toBe(80);
    expect(stepDownXp(80)).toBe(30);
    expect(stepDownXp(30)).toBeNull();
    expect(stepDownXp(29)).toBeNull();
    expect(stepDownXp(0)).toBeNull();
  });
});

describe('decayCraft', () => {
  it('day 21 drops nothing and day 22 drops one step (with a craft_level that fell)', () => {
    const s = trained();
    s.day += 21;
    expect(decayCraft(s, reg)).toEqual([]);
    expect(craftLevel(s, 'stillness')).toBe(3);
    s.day += 1;
    const ev = decayCraft(s, reg);
    expect(ev).toEqual([{ type: 'craft_level', key: 'stillness', level: 2, word: 'practised', fell: true }]);
    expect(s.commander.craft!.stillness).toMatchObject({ xp: 80, level: 2, lastDay: 20, decayedDay: 42 });
  });

  it('the clock restarts after a step: the next one comes 22 days later, and never twice in a row', () => {
    const s = trained();
    s.day += 22;
    decayCraft(s, reg);
    s.day += 21;
    expect(decayCraft(s, reg)).toEqual([]);
    s.day += 1;
    expect(decayCraft(s, reg)).toHaveLength(1);
    expect(craftLevel(s, 'stillness')).toBe(1);
  });

  it('level 1 holds for ever', () => {
    const s = world(reg, 'play');
    addCraftXp(s, reg, 'speech', 40, 'test');
    s.day += 400;
    expect(decayCraft(s, reg)).toEqual([]);
    expect(craftLevel(s, 'speech')).toBe(1);
    expect(s.commander.craft!.speech.xp).toBe(40);
  });

  it('a use on day 20 of the idle days resets the count', () => {
    const s = trained();
    s.day += 20;
    addCraftXp(s, reg, 'stillness', 1, 'test'); // used again
    s.day += 20;
    expect(decayCraft(s, reg)).toEqual([]); // 20 days since the use, though 40 since the first
    expect(craftLevel(s, 'stillness')).toBe(3);
    s.day += 2;
    expect(decayCraft(s, reg)).toHaveLength(1);
  });

  it('endurance:* decays through Commander.endurance and keeps that book\'s shape', () => {
    const s = world(reg, 'play');
    addCraftXp(s, reg, 'endurance:weight', 200, 'test'); // level 3
    expect(commanderSkill(s, 'weight')).toBe(3);
    s.day += 22;
    const ev = decayCraft(s, reg);
    expect(ev).toEqual([{ type: 'craft_level', key: 'endurance:weight', level: 2, word: 'practised', fell: true }]);
    expect(s.commander.endurance!.weight).toEqual({ xp: 80, level: 2 });
    expect(s.commander.craft!['endurance:weight']).toMatchObject({ xp: 0, level: 0 }); // nothing mirrored
  });

  it('an endurance the commander trained before any holder was live starts its clock when one is', () => {
    const s = world(reg, 'play');
    s.commander.endurance = { breath: { xp: 200, level: 3 } };
    expect(decayCraft(s, reg)).toEqual([]);
    expect(s.commander.craft!['endurance:breath'].lastDay).toBe(s.day);
    s.day += 22;
    expect(decayCraft(s, reg)).toHaveLength(1);
    expect(commanderSkill(s, 'breath')).toBe(2);
  });

  it('what the pair has learnt fades after 42 days, not before, and level 1 holds', () => {
    const s = world(reg, 'play');
    s.relations[ANN].craft = {
      postures: { a: { xp: 100, day: s.day }, b: { xp: 40, day: s.day } },
      rhythm: { xp: 260, day: s.day },
      routine: { xp: 90, day: s.day },
      signals: { tap2: { named: true, answered: 4, day: s.day }, sole: { named: true, answered: 1, day: s.day } },
    };
    s.day += 42;
    expect(decayCraft(s, reg)).toEqual([]);
    expect(s.relations[ANN].craft!.rhythm!.xp).toBe(260);
    s.day += 1;
    expect(decayCraft(s, reg)).toEqual([]); // the pair fades quietly
    const c = s.relations[ANN].craft!;
    expect(c.postures!.a.xp).toBe(30);
    expect(c.postures!.b.xp).toBe(40);
    expect(c.rhythm!.xp).toBe(150); // level 4 (260) falls to the threshold of level 3
    expect(c.routine!.xp).toBe(30);
    expect(c.signals!.tap2).toMatchObject({ named: true, answered: 3 });
    expect(c.signals!.sole).toMatchObject({ named: true, answered: 1 });
  });

  it('does nothing and writes nothing when nothing is written and nobody is live', () => {
    const s = world(reg, 'equal');
    s.day += 500;
    expect(decayCraft(s, reg)).toEqual([]);
    expect(s.commander.craft).toBeUndefined();
    const live = world(reg, 'play');
    expect(decayCraft(live, reg)).toEqual([]);
    expect(live.commander.craft).toBeUndefined(); // no endurance either: nothing to stamp
  });
});

describe('the day-end step and the stamp of a drill', () => {
  it('a drill stamps the day of its endurance (while a holder is live) and an idle key falls through the real day end', () => {
    let s = world(reg, 'play');
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'train', focus: 'endurance_breath' } });
    expect(errors(r.events)).toEqual([]);
    s = r.state;
    expect(s.commander.craft!['endurance:breath'].lastDay).toBe(s.day);
  });

  it('a drill leaves the craft book alone while nobody is live', () => {
    const s = world(reg, 'equal');
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'train', focus: 'endurance_breath' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.commander.craft).toBeUndefined();
    expect(r.state.commander.endurance!.breath.xp).toBe(15);
  });
});
