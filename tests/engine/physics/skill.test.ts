import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { addEnduranceXp, commanderSkill, herSkillOf, practise, trainEndurance } from '../../../src/engine/physics/skill';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, loadCore } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetPhysicsHooks());
const ANN = 'unit_ann';

describe('the commander\'s endurance', () => {
  it('levels at 30 / 80 / 150 / 250 / 400 xp, per physics', () => {
    const s = campaign(reg, 4);
    expect(commanderSkill(s, 'breath')).toBe(0);
    const levels = [29, 30, 79, 80, 149, 150, 249, 250, 399, 400, 900].map((xp) => {
      const d = campaign(reg, 4);
      addEnduranceXp(d, 'breath', xp);
      return commanderSkill(d, 'breath');
    });
    expect(levels).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    const d = campaign(reg, 4);
    addEnduranceXp(d, 'weight', 40);
    expect(commanderSkill(d, 'weight')).toBe(1);
    expect(commanderSkill(d, 'breath')).toBe(0);
  });

  it('three routes: a hold endured +10, a caught opening after three in a row +2, a drill +15 once a day', () => {
    expect(TUNING.physics.endurance).toMatchObject({ hold: 10, streak: 2, training: 15 });
    const d = campaign(reg, 4);
    expect(addEnduranceXp(d, 'breath', TUNING.physics.endurance.hold)).toMatchObject({ type: 'endurance_gained', physicsId: 'breath', xp: 10, level: 0 });
    expect(d.commander.endurance!.breath!.xp).toBe(10);
    addEnduranceXp(d, 'breath', TUNING.physics.endurance.streak * 3);
    expect(d.commander.endurance!.breath!.xp).toBe(16);
    expect(trainEndurance(d, 'breath')).toMatchObject({ type: 'endurance_gained', xp: 31 });
    expect(trainEndurance(d, 'breath')).toBeNull(); // once a day
    expect(d.commander.endurance!.breath!.xp).toBe(31);
    expect(trainEndurance(d, 'weight')).not.toBeNull(); // each physics has its own day
    d.day += 1;
    expect(trainEndurance(d, 'breath')).not.toBeNull();
  });

  it('says when a level is gained', () => {
    const d = campaign(reg, 4);
    expect(addEnduranceXp(d, 'breath', 30)).toMatchObject({ level: 1, leveledUp: true });
    expect(addEnduranceXp(d, 'breath', 10)).toMatchObject({ level: 1, leveledUp: false });
  });
});

describe('her skills', () => {
  it('grow one level per 8 practices of the kind, to 5', () => {
    const d = campaign(reg, 4);
    expect(herSkillOf(d, ANN)).toMatchObject({ seal: 0, weight: 0, reading: 0, swing: 0, rhythm: 0 });
    for (let i = 0; i < 7; i++) expect(practise(d, ANN, ['seal'], 'neutral')).toEqual([]);
    expect(practise(d, ANN, ['seal'], 'neutral')).toEqual([{ type: 'her_skill_gained', unitId: ANN, skill: 'seal', level: 1 }]);
    expect(herSkillOf(d, ANN).seal).toBe(1);
    for (let i = 0; i < 100; i++) practise(d, ANN, ['seal'], 'neutral');
    expect(herSkillOf(d, ANN).seal).toBe(5);
    expect(herSkillOf(d, ANN).weight).toBe(0);
    expect(d.relations[ANN]!.herSkill!.practice.seal).toBeGreaterThan(8);
  });

  it('the style multiplies the practice: drill and clinical ×1.5, affectionate ×0.7', () => {
    const levelAfter = (style: Parameters<typeof practise>[3], n: number): number => {
      const d = campaign(reg, 4);
      for (let i = 0; i < n; i++) practise(d, ANN, ['reading'], style);
      return herSkillOf(d, ANN).reading;
    };
    expect(levelAfter('neutral', 6)).toBe(0);
    expect(levelAfter('drill', 6)).toBe(1); // 9
    expect(levelAfter('clinical', 6)).toBe(1);
    expect(levelAfter('affectionate', 11)).toBe(0); // 7.7
    expect(levelAfter('affectionate', 12)).toBe(1); // 8.4
  });

  it('a unit with no relation reads zeros and practises nothing', () => {
    const d = campaign(reg, 4);
    expect(herSkillOf(d, 'nobody')).toMatchObject({ seal: 0 });
    expect(practise(d, 'nobody', ['seal'], 'neutral')).toEqual([]);
    void registerPhysicsStyle;
  });
});
