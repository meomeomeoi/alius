import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { makeCtx } from '../../../src/engine/combat/effects';
import { checkOrder, repeatLastOrder } from '../../../src/engine/combat/orders';
import { completeAction, performAction, runUntilInput, startRound } from '../../../src/engine/combat/turn';
import { defaultFormation } from '../../../src/engine/combat/stats';
import { chooseAction } from '../../../src/engine/combat/ai';
import type { StartPayload } from '../../../src/engine/combat/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/world';
import { fixtureCombat, rngOf } from '../../helpers/combat';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
const husk = { enemyId: 'husk', level: 1, affixes: [] as string[] };
const payload = (s: CampaignState, over: Partial<StartPayload> = {}): StartPayload => ({
  encounter: { enemies: [husk], danger: 1 }, formation: defaultFormation(s, reg, s.roster.activeIds), ...over,
});

describe('review fixes', () => {
  it('other actions are refused while a combat is open (retry stays an exact restore)', () => {
    const open = run(base, reg, { type: 'combat/start', payload: payload(base) }).state;
    for (const action of [
      { type: 'squad/set_loadout', payload: { unitId: 'unit_ann', skillIds: ['as_burst'] } },
      { type: 'calendar/consume_slot', payload: { slots: 1 } },
      { type: 'base/recruit_grunt', payload: {} },
      { type: 'activity/do', payload: { activityId: 'rest' } },
      { type: 'item/equip', payload: { unitId: 'unit_ann', uid: 'x' } },
    ]) {
      const r = run(open, reg, action);
      expect(errors(r.events), action.type).toHaveLength(1);
      expect(r.state).toBe(open);
    }
    expect(errors(run(open, reg, { type: 'combat/auto', payload: { on: false } }).events)).toEqual([]);
  });

  it('a unit downed during an extra action never becomes the awaited one', () => {
    const r2 = structuredClone(reg);
    r2.skills.set('test_suicide', {
      id: 'test_suicide', name: 'Suicide', kind: 'active', description: 'd', cooldown: 0, usableFrom: ['front'],
      targets: { side: 'enemy', rows: ['front', 'back'], count: 'one' },
      effects: [{ type: 'damage', mult: 50 }, { type: 'damage', pctMaxHp: 100, target: 'self' }], tags: [],
    } as never);
    const cs = fixtureCombat({
      squad: [
        { skills: ['test_suicide'], spd: 30, atk: 100, passives: [{ type: 'extra_action', trigger: 'onKill', source: 't' } as never] },
        { skills: ['as_strike'], spd: 5 },
      ],
      enemies: [{ hp: 1 }, { hp: 9999, maxHp: 9999, spd: 1 }],
    });
    cs.round = 0;
    const ctx = makeCtx(cs, structuredClone(base), r2, rngOf(2));
    startRound(ctx);
    runUntilInput(ctx);
    expect(cs.awaitingCid).toBe('s1');
    performAction(ctx, 's1', { kind: 'skill', skillId: 'test_suicide', targetCid: 'e1' });
    completeAction(ctx, 's1');
    runUntilInput(ctx);
    expect(cs.combatants.find((c) => c.cid === 's1')!.downed).toBe(true);
    expect(cs.awaitingCid).toBe('s2');
  });

  it('a missing loot table on a win fails soft', () => {
    const open = run(base, reg, { type: 'combat/start', payload: payload(base) }).state;
    const draft = structuredClone(open);
    const noTables = structuredClone(reg);
    noTables.lootTables.clear();
    const r = run(draft, noTables, { type: 'combat/auto', payload: { on: true } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.lastCombat!.loot).toEqual([]);
  });

  it('enemy rows and levels are validated', () => {
    for (const bad of [{ ...husk, row: 'middle' }, { ...husk, level: 1e9 }, { ...husk, level: 1.5 }]) {
      const r = run(base, reg, { type: 'combat/start', payload: payload(base, { encounter: { enemies: [bad as never], danger: 1 } }) });
      expect(errors(r.events), JSON.stringify(bad)).toHaveLength(1);
    }
  });

  it('an enemy protector ignores the squad commander', () => {
    const cs = fixtureCombat({
      squad: [{}],
      enemies: [{ skills: ['en_sidearm', 'en_shield_wall'], aiProfile: 'protector', row: 'back' }],
    });
    cs.commander = { hp: 10, maxHp: 60, def: 10, coverId: 's1', downed: false };
    const ctx = makeCtx(cs, structuredClone(base), reg, rngOf());
    expect(chooseAction(ctx, 'e1')).toMatchObject({ skillId: 'en_sidearm' });
  });

  it('focus fire cannot target an untargetable enemy; a repeated order skips a unit that ignores orders', () => {
    const cs = fixtureCombat({ squad: [{}], enemies: [{ statuses: [{ id: 'untargetable' }] }], cp: 5 });
    cs.awaitingCid = 's1';
    const ctx = makeCtx(cs, structuredClone(base), reg, rngOf());
    expect(checkOrder(ctx, 'focus_fire', 'e1')).toMatch(/standing target/);
    const cs2 = fixtureCombat({ squad: [{ stress: 50, breakdown: { defectId: 'x', policy: 'skip', ignoresOrders: true, actionEffects: [] } }], cp: 5 });
    cs2.lastOrder = { orderId: 'steady', targetCid: 's1' };
    const c2 = makeCtx(cs2, structuredClone(base), reg, rngOf());
    repeatLastOrder(c2);
    expect(cs2.combatants[0].stress).toBe(50);
  });
});
