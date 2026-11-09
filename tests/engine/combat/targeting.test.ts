import { describe, expect, it } from 'vitest';
import type { Skill } from '../../../src/content/schemas';
import { expandTargets, legalTargets, lowestHpPct, nearest, strongest } from '../../../src/engine/combat/targeting';
import { fixtureCombat } from '../../helpers/combat';

const skill = (over: Partial<Skill> = {}): Skill => ({
  id: 's', name: 'S', kind: 'active', description: 'd', cooldown: 0, usableFrom: ['front', 'back'],
  targets: { side: 'enemy', rows: ['front', 'back'], count: 'one' }, effects: [{ type: 'damage', mult: 1 }], tags: [],
  ...over,
} as Skill);
const melee = skill({ targets: { side: 'enemy', rows: ['front', 'back'], count: 'one', melee: true } });

describe('legalTargets', () => {
  it('melee hits only the front while it stands, then the back', () => {
    const cs = fixtureCombat({ enemies: [{ row: 'front' }, { row: 'back' }] });
    expect(legalTargets(cs, 's1', melee)).toEqual(['e1']);
    cs.combatants.find((c) => c.cid === 'e1')!.downed = true;
    cs.combatants.find((c) => c.cid === 'e1')!.hp = 0;
    expect(legalTargets(cs, 's1', melee)).toEqual(['e2']);
  });

  it('a front enemy that is untargetable still shields the back from melee', () => {
    const cs = fixtureCombat({ enemies: [{ row: 'front', statuses: [{ id: 'untargetable' }] }, { row: 'back' }] });
    expect(legalTargets(cs, 's1', melee)).toEqual([]);
  });

  it('ranged with rows [back] cannot hit the front', () => {
    const cs = fixtureCombat({ enemies: [{ row: 'front' }, { row: 'back' }] });
    const s = skill({ targets: { side: 'enemy', rows: ['back'], count: 'one' } });
    expect(legalTargets(cs, 's1', s)).toEqual(['e2']);
    expect(legalTargets(cs, 's1', skill())).toEqual(['e1', 'e2']);
  });

  it('ignoreRows hits anyone', () => {
    const cs = fixtureCombat({ enemies: [{ row: 'front' }, { row: 'back' }] });
    const s = skill({ targets: { side: 'enemy', rows: ['front'], count: 'one', melee: true }, effects: [{ type: 'damage', mult: 1, ignoreRows: true }] });
    expect(legalTargets(cs, 's1', s)).toEqual(['e1', 'e2']);
  });

  it('taunt forces the target', () => {
    const cs = fixtureCombat({ enemies: [{ row: 'front' }, { row: 'back', statuses: [{ id: 'taunt' }] }] });
    expect(legalTargets(cs, 's1', skill())).toEqual(['e2']);
    // a taunter outside the skill's rows does not count
    expect(legalTargets(cs, 's1', skill({ targets: { side: 'enemy', rows: ['front'], count: 'one' } }))).toEqual(['e1']);
  });

  it('untargetable is skipped', () => {
    const cs = fixtureCombat({ enemies: [{ statuses: [{ id: 'untargetable' }] }, { row: 'back' }] });
    expect(legalTargets(cs, 's1', skill())).toEqual(['e2']);
  });

  it('flags come from the registry when one is given', () => {
    const cs = fixtureCombat({ enemies: [{ statuses: [{ id: 'bait' }] }, { row: 'back' }] });
    const reg = { statuses: new Map([['bait', { id: 'bait', flags: ['taunt'] }]]) } as never;
    expect(legalTargets(cs, 's1', skill(), reg)).toEqual(['e1']);
  });

  it('a back-row unit cannot use a front-only skill', () => {
    const cs = fixtureCombat({ squad: [{ row: 'back' }] });
    expect(legalTargets(cs, 's1', skill({ usableFrom: ['front'] }))).toEqual([]);
    expect(legalTargets(cs, 's1', skill({ usableFrom: ['back'] }))).toEqual(['e1']);
  });

  it('lock restricts to the locked target until it dies', () => {
    const cs = fixtureCombat({ squad: [{ lockedTargetId: 'e2' }], enemies: [{}, { row: 'back' }, {}] });
    expect(legalTargets(cs, 's1', skill())).toEqual(['e2']);
    const e2 = cs.combatants.find((c) => c.cid === 'e2')!;
    e2.downed = true;
    e2.hp = 0;
    expect(legalTargets(cs, 's1', skill())).toEqual(['e1', 'e3']);
  });

  it('self and ally skills', () => {
    const cs = fixtureCombat({ squad: [{}, { hp: 5, maxHp: 50 }, { downed: true }] });
    expect(legalTargets(cs, 's1', skill({ targets: { side: 'self', rows: ['front', 'back'], count: 'one' } }))).toEqual(['s1']);
    const ally = skill({ targets: { side: 'ally', rows: ['front', 'back'], count: 'one' } });
    expect(legalTargets(cs, 's1', ally)).toEqual(['s1', 's2']);
  });

  it('revive targets only downed allies', () => {
    const cs = fixtureCombat({ squad: [{}, { hp: 5 }, { downed: true }] });
    const revive = skill({ targets: { side: 'ally', rows: ['front', 'back'], count: 'one' }, effects: [{ type: 'revive', pctMaxHp: 30 }] });
    expect(legalTargets(cs, 's1', revive)).toEqual(['s3']);
  });

  it('enemy actors target the squad', () => {
    const cs = fixtureCombat({ squad: [{ row: 'front' }, { row: 'back' }] });
    expect(legalTargets(cs, 'e1', melee)).toEqual(['s1']);
  });
});

describe('expandTargets', () => {
  it('one, row and all', () => {
    const cs = fixtureCombat({ enemies: [{ row: 'front' }, { row: 'front' }, { row: 'back' }] });
    const t = (count: 'one' | 'row' | 'all') => skill({ targets: { side: 'enemy', rows: ['front', 'back'], count } });
    expect(expandTargets(cs, 's1', t('one'), 'e2')).toEqual(['e2']);
    expect(expandTargets(cs, 's1', t('row'), 'e1')).toEqual(['e1', 'e2']);
    expect(expandTargets(cs, 's1', t('row'), 'e3')).toEqual(['e3']);
    expect(expandTargets(cs, 's1', t('all'), undefined)).toEqual(['e1', 'e2', 'e3']);
    expect(expandTargets(cs, 's1', t('one'), undefined)).toEqual([]);
    expect(expandTargets(cs, 's1', skill({ targets: { side: 'self', rows: ['front'], count: 'one' } }), undefined)).toEqual(['s1']);
  });

  it('an illegal primary expands to nothing', () => {
    const cs = fixtureCombat({ enemies: [{ row: 'front' }, { row: 'back' }] });
    expect(expandTargets(cs, 's1', melee, 'e2')).toEqual([]);
  });
});

describe('selectors', () => {
  const cs = () => fixtureCombat({
    squad: [{ row: 'back', atk: 30 }, { row: 'front', atk: 10, hp: 20, maxHp: 100 }],
    enemies: [{ row: 'back', atk: 50, hp: 90, maxHp: 100 }, { row: 'front', atk: 20, hp: 30, maxHp: 100 }, { row: 'front', atk: 50, hp: 95, maxHp: 100 }],
  });

  it('nearest prefers the front row, then the lowest index', () => {
    expect(nearest(cs(), 's1', 'enemy')).toBe('e2');
    expect(nearest(cs(), 's1', 'squad')).toBe('s2');
    expect(nearest(cs(), 'e1', 'squad')).toBe('s2');
  });

  it('nearest any includes allies and prefers enemies on ties', () => {
    expect(nearest(cs(), 's1', 'any')).toBe('e2');
    const lonely = fixtureCombat({ squad: [{ row: 'back' }, { row: 'front' }], enemies: [{ row: 'back' }] });
    expect(nearest(lonely, 's1', 'any')).toBe('s2');
  });

  it('strongest is highest ATK, then HP', () => {
    expect(strongest(cs(), 'enemy')).toBe('e3');
    expect(strongest(cs(), 'squad')).toBe('s1');
  });

  it('lowestHpPct picks the most hurt', () => {
    expect(lowestHpPct(cs(), 'enemy')).toBe('e2');
    expect(lowestHpPct(cs(), 'squad')).toBe('s2');
  });
});
