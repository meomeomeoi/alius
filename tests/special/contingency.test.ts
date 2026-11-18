import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dealDamage, makeCtx } from '../../src/engine/combat/effects';
import { checkOrder, issueOrder } from '../../src/engine/combat/orders';
import { isTurningAttacker, orderUnlocked, takeContingency } from '../../src/engine/combat/contingency';
import type { Combatant, CombatState } from '../../src/engine/combat/types';
import type { CampaignState } from '../../src/engine/state/types';
import { fixtureCombat, rngOf, type FixtureCombatant } from '../helpers/combat';
import { loadCore } from '../helpers/world';
import { specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const paranoid = (): CampaignState => specialCampaign(reg, 'bloom_paranoia');

/** An exposed commander whose cover (s1) is down, a cover candidate s2, a turning enemy (a mutineer, e1) and an ordinary one (e2). */
function exposed(o: { squad?: FixtureCombatant[]; enemies?: FixtureCombatant[]; state?: CampaignState; seed?: number } = {}) {
  const cs = fixtureCombat({
    squad: [{ downed: true }, ...(o.squad ?? [{ hp: 500, maxHp: 500 }, { hp: 500, maxHp: 500 }])],
    enemies: o.enemies ?? [{ unitId: 'unit_ann', enemyId: undefined as unknown as string, atk: 20 }, { atk: 20 }],
    cp: 5,
  });
  const mutineer = cs.combatants.find((c) => c.cid === 'e1');
  if (mutineer) delete (mutineer as Partial<Combatant>).enemyId;
  cs.awaitingCid = 's2';
  cs.commander = { hp: 1_000_000, maxHp: 1_000_000, def: 10, coverId: 's1', downed: false };
  const state = o.state ?? paranoid();
  return { cs, ctx: makeCtx(cs, state, reg, rngOf(o.seed ?? 3)), state };
}
const hp = (cs: CombatState, cid: string) => cs.combatants.find((c) => c.cid === cid)!.hp;
const covers = (cs: CombatState) => cs.log.filter((l) => (l.kind as string) === 'contingency_cover');

describe('the order', () => {
  it('is locked without the unlock effect and available with bloom_paranoia', () => {
    const locked = exposed({ state: specialCampaign(reg) });
    expect(orderUnlocked(locked.state, reg, 'contingency')).toBe(false);
    expect(checkOrder(locked.ctx, 'contingency', 's2')).toBe('Not available to this commander.');
    const open = exposed();
    expect(orderUnlocked(open.state, reg, 'contingency')).toBe(true);
    expect(checkOrder(open.ctx, 'contingency', 's2')).toBeNull();
    // an ordinary order is never locked
    expect(orderUnlocked(locked.state, reg, 'steady')).toBe(true);
  });

  it('costs 2 CP, takes an ally and sets the cover; once per combat', () => {
    const { cs, ctx } = exposed();
    expect(reg.orders.get('contingency')).toMatchObject({ cost: 2, target: 'ally', requiresUnlock: true });
    expect(issueOrder(ctx, 'contingency', 's2')).toBe(true);
    expect(cs.cp).toBe(3);
    expect(cs.contingency).toEqual({ cid: 's2', used: false });
    expect(ctx.events.find((e) => e.type === 'contingency_set')).toEqual({ type: 'contingency_set', cid: 's2' });
    expect(checkOrder(ctx, 'contingency', 's3')).toBe('A contingency is already set for this combat.');
  });

  it('needs a standing ally target and the CP', () => {
    const { cs, ctx } = exposed();
    expect(checkOrder(ctx, 'contingency', 'e1')).toMatch(/squad unit/);
    cs.cp = 1;
    expect(checkOrder(ctx, 'contingency', 's2')).toMatch(/needs 2 CP/);
  });
});

describe('the cover', () => {
  it('intercepts the first hit from a turning unit, then the second follows today\'s rules', () => {
    const { cs, ctx } = exposed();
    issueOrder(ctx, 'contingency', 's2');
    const before = hp(cs, 's2');
    dealDamage(ctx, 'e1', 'commander', 1);
    expect(covers(cs)).toHaveLength(1);
    expect(covers(cs)[0]).toMatchObject({ actor: 's2', target: 'commander' });
    expect(hp(cs, 's2')).toBeLessThan(before);
    expect(cs.commander!.hp).toBe(1_000_000);
    expect(cs.contingency!.used).toBe(true);
    expect(ctx.events.find((e) => e.type === 'contingency_cover')).toEqual({ type: 'contingency_cover', cid: 's2' });
    // the second hit lands on the commander (or is dodged), never on the cover again
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) { dealDamage(ctx, 'e1', 'commander', 1); reached = cs.commander!.hp < 1_000_000; }
    expect(reached).toBe(true);
    expect(covers(cs)).toHaveLength(1);
  });

  it('a hit from an ordinary enemy does not use it', () => {
    const { cs, ctx } = exposed();
    issueOrder(ctx, 'contingency', 's2');
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) { dealDamage(ctx, 'e2', 'commander', 1); reached = cs.commander!.hp < 1_000_000; }
    expect(reached).toBe(true);
    expect(cs.contingency!.used).toBe(false);
    expect(covers(cs)).toEqual([]);
  });

  it('a squad unit in breakdown counts as turning', () => {
    const turned: FixtureCombatant = { hp: 500, maxHp: 500, breakdown: { defectId: 'x', policy: 'aggressive' as never, ignoresOrders: false, actionEffects: [] } };
    const { cs, ctx } = exposed({ squad: [{ hp: 500, maxHp: 500 }, turned] });
    issueOrder(ctx, 'contingency', 's2');
    expect(isTurningAttacker(cs, 's3')).toBe(true);
    expect(isTurningAttacker(cs, 's2')).toBe(false);
    dealDamage(ctx, 's3', 'commander', 1);
    expect(covers(cs)).toHaveLength(1);
  });

  it('a mutineer (enemy side with a unit id) is turning; a plain enemy is not', () => {
    const { cs } = exposed();
    expect(isTurningAttacker(cs, 'e1')).toBe(true);
    expect(isTurningAttacker(cs, 'e2')).toBe(false);
  });

  it('with no contingency, or with the cover unit down, hitCommander is unchanged', () => {
    const run = (setup: (e: ReturnType<typeof exposed>) => void) => {
      const e = exposed({ seed: 7 });
      setup(e);
      for (let i = 0; i < 8; i++) dealDamage(e.ctx, 'e1', 'commander', 1);
      return { hp: e.cs.commander!.hp, log: e.cs.log.map((l) => l.kind).filter((k) => k !== 'stress') }; // (a downed ally takes no stress)
    };
    const plain = run(() => {});
    const downed = run((e) => { e.cs.contingency = { cid: 's2', used: false }; const c = e.cs.combatants.find((x) => x.cid === 's2')!; c.downed = true; c.hp = 0; });
    expect(downed).toEqual(plain);
    expect(takeContingency(exposed().ctx, 'e1')).toBeNull();
  });
});
