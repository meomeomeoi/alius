import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { commanderProfile } from '../../../src/engine/commander/profile';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

describe('CombatState.commander.build (P9d)', () => {
  const fight = (archetypeBody: { strength: number; endurance: number; reflexes: number } | null) => {
    const s = campaign(reg, 4);
    if (archetypeBody) s.commander.body = archetypeBody;
    const ids = s.roster.activeIds;
    const r = run(s, reg, {
      type: 'combat/start',
      payload: {
        encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1, exposesCommander: true },
        formation: { front: ids.slice(0, 2), back: ids.slice(2) }, coverId: ids[0],
      },
    });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };

  it('copies the commander archetype when the commander is exposed', () => {
    const frail = fight({ strength: 1, endurance: 1, reflexes: 1 });
    expect(frail.combat!.commander!.build).toBe(commanderProfile(frail).archetype);
    expect(['frail', 'slight']).toContain(frail.combat!.commander!.build);
    const strong = fight({ strength: 4, endurance: 4, reflexes: 4 });
    expect(['fit', 'hardened']).toContain(strong.combat!.commander!.build);
  });

  it('is absent when the commander is covered (no commander in the fight)', () => {
    const s = campaign(reg, 4);
    const ids = s.roster.activeIds;
    const r = run(s, reg, { type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: { front: ids.slice(0, 2), back: ids.slice(2) } } });
    expect(r.state.combat!.commander).toBeUndefined();
  });
});
