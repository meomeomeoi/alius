import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { chooseAction } from '../../../src/engine/combat/ai';
import { commanderMaxHp, presenceKind } from '../../../src/engine/combat/crisis';
import { dealDamage, makeCtx } from '../../../src/engine/combat/effects';
import { checkOrder, issueOrder, orderCost } from '../../../src/engine/combat/orders';
import { finalizeCombat } from '../../../src/engine/combat/outcome';
import { defaultFormation } from '../../../src/engine/combat/stats';
import type { CombatState, StartPayload } from '../../../src/engine/combat/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';
import { fixtureCombat, rngOf, type FixtureCombatant } from '../../helpers/combat';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const husk = { enemyId: 'husk', level: 1, affixes: [] as string[] };
const body = (strength: number, endurance: number, reflexes: number) => ({ strength, endurance, reflexes });
const withBody = (b: ReturnType<typeof body>): CampaignState => {
  const s = structuredClone(base);
  s.commander.body = b;
  return s;
};
const payload = (s: CampaignState, over: Partial<StartPayload> = {}): StartPayload => ({
  encounter: { enemies: [husk], danger: 1, exposesCommander: true },
  formation: defaultFormation(s, reg, s.roster.activeIds),
  coverId: s.roster.activeIds[0],
  ...over,
});
const started = (s: CampaignState, over: Partial<StartPayload> = {}) => {
  const r = run(s, reg, { type: 'combat/start', payload: payload(s, over) });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};
const c = (cs: CombatState, cid: string) => cs.combatants.find((x) => x.cid === cid)!;

/** A fixture combat with an exposed commander whose cover is down, so every hit reaches him. */
function exposed(b: ReturnType<typeof body>, seed = 3, o: { squad?: FixtureCombatant[]; enemies?: FixtureCombatant[] } = {}) {
  const cs = fixtureCombat({ squad: [{ downed: true }, ...(o.squad ?? [{}])], enemies: o.enemies ?? [{ atk: 20 }] });
  cs.commander = { hp: 1_000_000, maxHp: 1_000_000, def: 10, coverId: 's1', downed: false };
  const state = withBody(b);
  return { cs, ctx: makeCtx(cs, state, reg, rngOf(seed)) };
}

describe('commander HP', () => {
  it('endurance 1 and 5 give 30 and 70 HP', () => {
    expect(commanderMaxHp(withBody(body(3, 1, 3)), reg)).toBe(30);
    expect(commanderMaxHp(withBody(body(3, 5, 3)), reg)).toBe(70);
  });

  it('the default commander has 50 HP in a started Crisis', () => {
    const open = started(base);
    expect(open.combat!.commander).toMatchObject({ hp: 50, maxHp: 50 });
  });
});

describe('dodge', () => {
  const dodges = (reflexes: number, hits: number, seed = 7): number => {
    const { cs, ctx } = exposed(body(3, 3, reflexes), seed);
    let n = 0;
    for (let i = 0; i < hits; i++) {
      const before = cs.commander!.hp;
      dealDamage(ctx, 'e1', 'commander', 1);
      if (cs.commander!.hp === before) n++;
    }
    return n;
  };

  it('reflexes 5 dodges 30% of uncovered hits over a seeded run', () => {
    const n = dodges(5, 1000);
    expect(n).toBeGreaterThan(260);
    expect(n).toBeLessThan(340);
    expect(n).toBe(DODGES_AT_5);
  });

  it('reflexes 1 dodges 6%', () => {
    const n = dodges(1, 1000);
    expect(n).toBeGreaterThan(30);
    expect(n).toBeLessThan(95);
  });

  it('a dodge is logged against the commander', () => {
    const { cs, ctx } = exposed(body(3, 3, 5), 1);
    for (let i = 0; i < 40 && !cs.log.some((l) => l.kind === 'dodge'); i++) dealDamage(ctx, 'e1', 'commander', 1);
    expect(cs.log.find((l) => l.kind === 'dodge')).toMatchObject({ kind: 'dodge', target: 'commander' });
  });

  it('a covered hit never rolls a dodge', () => {
    const cs = fixtureCombat({ squad: [{ hp: 1_000_000, maxHp: 1_000_000 }], enemies: [{ atk: 20 }] });
    cs.commander = { hp: 100, maxHp: 100, def: 10, coverId: 's1', downed: false };
    const ctx = makeCtx(cs, withBody(body(3, 3, 5)), reg, rngOf(2));
    for (let i = 0; i < 100; i++) dealDamage(ctx, 'e1', 'commander', 1);
    expect(cs.log.some((l) => l.kind === 'dodge')).toBe(false);
    expect(cs.commander.hp).toBe(100);
  });
});

describe('presence action', () => {
  it('presence kind follows the archetype', () => {
    expect(['frail', 'slight', 'average', 'fit', 'hardened'].map((a) => presenceKind(a as never)))
      .toEqual(['unnoticed', 'unnoticed', 'steady_voice', 'rally', 'rally']);
  });

  it('a started combat stores the kind and no use', () => {
    expect(started(withBody(body(1, 1, 1))).combat!.presence).toEqual({ kind: 'unnoticed', used: false });
    expect(started(base).combat!.presence).toEqual({ kind: 'steady_voice', used: false });
    expect(started(withBody(body(4, 4, 4))).combat!.presence).toEqual({ kind: 'rally', used: false });
  });

  it('rally lowers every standing ally\'s stress by 10', () => {
    const open = structuredClone(started(withBody(body(4, 3, 3))));
    const squad = open.combat!.combatants.filter((x) => x.side === 'squad');
    squad.forEach((x, i) => { x.stress = 5 + i * 20; });
    squad[3].downed = true;
    squad[3].hp = 0;
    const before = squad.map((x) => x.stress);
    const r = run(open, reg, { type: 'combat/presence', payload: {} });
    expect(errors(r.events)).toEqual([]);
    const after = r.state.combat!.combatants.filter((x) => x.side === 'squad').map((x) => x.stress);
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3).map((v) => Math.max(0, v - 10)));
    expect(after[3]).toBe(before[3]); // the downed unit is not standing
    expect(r.state.combat!.presence).toMatchObject({ kind: 'rally', used: true });
    expect(ofType(r.events, 'combat_presence')).toEqual([{ type: 'combat_presence', kind: 'rally' }]);
  });

  it('steady voice makes one order 1 CP cheaper, then normal', () => {
    const cs = fixtureCombat({ cp: 5, enemies: [{ def: 0 }] });
    cs.awaitingCid = 's1';
    cs.presence = { kind: 'steady_voice', used: true, steadyVoicePending: true };
    const ctx = makeCtx(cs, structuredClone(base), reg, rngOf(4));
    expect(orderCost(ctx, 'focus_fire', 'e1')).toBe(1); // 2 − 1
    issueOrder(ctx, 'focus_fire', 'e1');
    expect(cs.cp).toBe(4);
    expect(cs.presence.steadyVoicePending).toBeFalsy();
    expect(orderCost(ctx, 'focus_fire', 'e1')).toBe(2);
    issueOrder(ctx, 'focus_fire', 'e1');
    expect(cs.cp).toBe(2);
  });

  it('a free order does not use up steady voice, and a 1-CP order costs 0', () => {
    const cs = fixtureCombat({ cp: 0, enemies: [{}] });
    cs.awaitingCid = 's1';
    cs.presence = { kind: 'steady_voice', used: true, steadyVoicePending: true };
    const ctx = makeCtx(cs, structuredClone(base), reg, rngOf(4));
    expect(reg.orders.get('steady')!.cost).toBe(1);
    expect(checkOrder(ctx, 'steady', 's1')).toBeNull(); // 0 CP is enough
    issueOrder(ctx, 'steady', 's1', { free: true });
    expect(cs.presence.steadyVoicePending).toBe(true);
    issueOrder(ctx, 'steady', 's1');
    expect(cs.cp).toBe(0);
    expect(cs.presence.steadyVoicePending).toBeFalsy();
    expect(checkOrder(ctx, 'steady', 's1')).toMatch(/needs 1 CP/);
  });

  it('unnoticed skips the commander option about half the time', () => {
    const pick = (unnoticed: boolean): number => {
      const cs = fixtureCombat({ squad: [{ def: 200, row: 'back' }, { def: 200, row: 'back' }], enemies: [{ skills: ['en_rifle_burst'], row: 'back', atk: 40 }] });
      cs.commander = { hp: 50, maxHp: 50, def: 10, coverId: 's1', downed: false };
      if (unnoticed) cs.presence = { kind: 'unnoticed', used: true };
      const ctx = makeCtx(cs, structuredClone(base), reg, rngOf(11));
      let n = 0;
      for (let i = 0; i < 400; i++) if (chooseAction(ctx, 'e1').targetCid === 'commander') n++;
      return n;
    };
    expect(pick(false)).toBe(400);
    const n = pick(true);
    expect(n).toBeGreaterThan(160);
    expect(n).toBeLessThan(240);
    expect(n).toBe(UNNOTICED_PICKS);
  });

  it('unnoticed never applies before it is used', () => {
    const cs = fixtureCombat({ squad: [{ def: 200, row: 'back' }], enemies: [{ skills: ['en_rifle_burst'], row: 'back', atk: 40 }] });
    cs.commander = { hp: 50, maxHp: 50, def: 10, coverId: 's1', downed: false };
    cs.presence = { kind: 'unnoticed', used: false };
    const ctx = makeCtx(cs, structuredClone(base), reg, rngOf(11));
    for (let i = 0; i < 50; i++) expect(chooseAction(ctx, 'e1').targetCid).toBe('commander');
  });

  it('presence twice is rejected and changes nothing', () => {
    const once = run(started(base), reg, { type: 'combat/presence', payload: {} }).state;
    const twice = run(once, reg, { type: 'combat/presence', payload: {} });
    expect(errors(twice.events).map((e) => String(e.message))).toEqual([expect.stringContaining('already used')]);
    expect(twice.state).toEqual(once);
  });

  it('without a combat or without a commander it is rejected', () => {
    expect(errors(run(base, reg, { type: 'combat/presence', payload: {} }).events)).toHaveLength(1);
    const legacy = structuredClone(started(base));
    delete legacy.combat!.presence; // a combat saved before P7
    const r = run(legacy, reg, { type: 'combat/presence', payload: {} });
    expect(errors(r.events).map((e) => String(e.message))).toEqual([expect.stringContaining('No commander')]);
    expect(r.state).toEqual(legacy);
  });
});

describe('Crisis scars', () => {
  const lost = (s: CampaignState, seed: number) => {
    const draft = structuredClone(started(s));
    draft.combat!.commander!.downed = true;
    draft.combat!.commander!.hp = 0;
    const events = finalizeCombat(draft, reg, new Rng(seedRng(seed)), 'lost');
    return { state: draft, events };
  };

  it('a downed commander scars with a fixed seed: endurance −1, seasoning +1', () => {
    const r = lost(withBody(body(3, 3, 1)), SCAR_SEED); // reflexes is 1: only endurance can go
    expect(r.state.commander.body).toEqual(body(3, 2, 1));
    expect(r.state.commander.seasoning).toBe(4);
    expect(r.state.commander.archetype).toBe('slight');
    expect(ofType(r.events, 'commander_scarred')).toEqual([{ type: 'commander_scarred', stat: 'endurance', seasoning: 4 }]);
  });

  it('with nothing left to lose the scar only raises seasoning, to at most 5', () => {
    const s = withBody(body(3, 1, 1));
    s.commander.seasoning = 5;
    const r = lost(s, SCAR_SEED);
    expect(r.state.commander.body).toEqual(body(3, 1, 1));
    expect(r.state.commander.seasoning).toBe(5);
    expect(ofType(r.events, 'commander_scarred')).toEqual([{ type: 'commander_scarred', stat: null, seasoning: 5 }]);
  });

  it('most downed commanders do not scar', () => {
    let scarred = 0;
    for (let seed = 1; seed <= 200; seed++) if (ofType(lost(base, seed).events, 'commander_scarred').length > 0) scarred++;
    expect(scarred).toBeGreaterThan(10);
    expect(scarred).toBeLessThan(60);
  });

  it('a retried combat never scars', () => {
    const open = structuredClone(started(base, { allowRetry: true }));
    open.combat!.commander!.downed = true;
    open.combat!.commander!.hp = 0;
    open.combat!.phase = 'lost_pending';
    const retried = run(open, reg, { type: 'combat/retry', payload: {} });
    expect(errors(retried.events)).toEqual([]);
    expect(retried.state.commander.body).toEqual(open.commander.body);
    expect(retried.state.commander.seasoning).toBe(open.commander.seasoning);
    expect(ofType(retried.events, 'commander_scarred')).toHaveLength(0);
  });
});

// pinned from the seeded runs above (expected: 30% of 1000, half of 400, and the first rng draw of finalizeCombat for the scar)
const DODGES_AT_5 = 312;
const UNNOTICED_PICKS = 191;
const SCAR_SEED = 12;
