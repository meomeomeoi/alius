import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { finalizeCombat } from '../../../src/engine/combat/outcome';
import { defaultFormation } from '../../../src/engine/combat/stats';
import type { CombatState, LogEntry, StartPayload } from '../../../src/engine/combat/types';
import type { EngineEvent } from '../../../src/engine/dispatch';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const husk = { enemyId: 'husk', level: 1, affixes: [] as string[] };
const giants = Array.from({ length: 4 }, () => ({ enemyId: 'warlord', level: 30, affixes: [] as string[] }));
const payload = (s: CampaignState, over: Partial<StartPayload> = {}, enemies = [husk]): StartPayload => ({
  encounter: { enemies, danger: 1 }, formation: defaultFormation(s, reg, s.roster.activeIds), ...over,
});
const started = (s: CampaignState = base, over: Partial<StartPayload> = {}, enemies = [husk]) =>
  run(s, reg, { type: 'combat/start', payload: payload(s, over, enemies) }).state;
const c = (cs: CombatState, cid: string) => cs.combatants.find((x) => x.cid === cid)!;

/** Finalizes an open combat after `mutate` shaped it; returns the new state and events. */
function finalize(open: CampaignState, outcome: 'won' | 'lost' | 'retreated', mutate: (cs: CombatState, s: CampaignState) => void = () => {}, seed = 5) {
  const draft = structuredClone(open);
  mutate(draft.combat!, draft);
  const events: EngineEvent[] = finalizeCombat(draft, reg, new Rng(seedRng(seed)), outcome);
  return { state: draft, events };
}
const downAll = (cs: CombatState, side: 'squad' | 'enemy') => {
  for (const x of cs.combatants.filter((y) => y.side === side)) {
    x.downed = true;
    x.hp = 0;
  }
};

describe('winning', () => {
  it('grants xp, levels and loot once', () => {
    const open = started(base, { bankLoot: true });
    const r = finalize(open, 'won', (cs, s) => { downAll(cs, 'enemy'); s.squad[0].xp = 59; });
    expect(r.state.combat).toBeUndefined();
    const res = r.state.lastCombat!;
    expect(res).toMatchObject({ outcome: 'won', banked: true });
    expect(res.xp.unit_ann).toBe(23); // 20 + 3 × enemy level 1
    expect(r.state.squad[0]).toMatchObject({ level: 2, xp: 22 });
    expect(res.levelUps).toEqual([{ unitId: 'unit_ann', level: 2 }]);
    expect(ofType(r.events, 'level_up')).toHaveLength(1);
    expect(ofType(r.events, 'loot_banked')).toHaveLength(1);
    expect(ofType(r.events, 'combat_ended')).toEqual([{ type: 'combat_ended', outcome: 'won', result: res.id }]);
    const credits = res.loot.filter((d) => d.kind === 'credits').reduce((n, d) => n + (d as { amount: number }).amount, 0);
    expect(r.state.resources.credits).toBe(open.resources.credits + credits);
    expect(r.state.inventory.length).toBe(res.loot.filter((d) => d.kind === 'item').length);
    expect(() => finalizeCombat(r.state, reg, new Rng(seedRng(1)), 'won')).toThrow(/no combat/);
  });

  it('bankLoot false only records the loot; extra loot rolls and the table are honoured', () => {
    const open = started(base, { bankLoot: false });
    const r = finalize(open, 'won', (cs) => { downAll(cs, 'enemy'); cs.pendingLootRolls = 3; });
    expect(r.state.lastCombat!.banked).toBe(false);
    expect(r.state.lastCombat!.loot).toHaveLength(2 + 3);
    expect(r.state.resources).toEqual(open.resources);
    expect(r.state.inventory).toEqual(open.inventory);
    expect(ofType(r.events, 'loot_banked')).toHaveLength(0);
    const cache = started(base, { encounter: { enemies: [husk], danger: 1, lootTableId: 'loot_cache' } });
    const rc = finalize(cache, 'won', (cs) => downAll(cs, 'enemy'));
    expect(rc.state.lastCombat!.loot.length).toBe(2);
  });

  it('stress is kept and hp is written back', () => {
    const open = started();
    const r = finalize(open, 'won', (cs) => { downAll(cs, 'enemy'); c(cs, 's1').stress = 37; c(cs, 's1').hp = 55; });
    expect(r.state.squad[0]).toMatchObject({ stress: 37, currentHp: 55 });
    expect(r.state.lastCombat!.stressDelta.unit_ann).toBe(37 - open.squad[0].stress);
    expect(r.state.squad[0].status).toBe('active');
  });
});

describe('injuries and deaths', () => {
  const down = (cs: CombatState) => { c(cs, 's1').downed = true; c(cs, 's1').hp = 0; };

  it('a downed named unit is injured, never dead', () => {
    const r = finalize(started(), 'lost', down);
    expect(r.state.squad[0]).toMatchObject({ status: 'injured', currentHp: 1, injuryDays: 2, injuries: ['wounded'] });
    expect(r.state.lastCombat!.injuries).toEqual(['unit_ann']);
    expect(r.state.lastCombat!.deaths).toEqual([]);
  });

  it('a grunt dies on a loss and, seeded, in about 10 % of wins', () => {
    const asGrunt = (cs: CombatState, s: CampaignState) => { s.squad[0].kind = 'grunt'; down(cs); };
    const lost = finalize(started(), 'lost', asGrunt);
    expect(lost.state.squad[0].status).toBe('dead');
    expect(lost.state.lastCombat!.deaths).toEqual(['unit_ann']);
    let dead = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = finalize(started(), 'won', (cs, s) => { asGrunt(cs, s); downAll(cs, 'enemy'); }, seed);
      if (r.state.squad[0].status === 'dead') dead += 1;
      else expect(r.state.squad[0].status).toBe('injured');
    }
    expect(dead / 400).toBeGreaterThan(0.06);
    expect(dead / 400).toBeLessThan(0.14);
  });

  it('pain_inversion injuries last 50 % longer', () => {
    const r = finalize(started(), 'lost', (cs, s) => {
      s.squad[0].defects = [{ id: 'pain_inversion', origin: '' }];
      down(cs);
      c(cs, 's1').passives = (reg.defects.get('pain_inversion')!.combat as { downside: never[] }).downside.map((e) => ({ ...(e as object), source: 'd' })) as never;
    });
    expect(r.state.squad[0].injuryDays).toBe(3);
  });

  it('a longer existing injury is kept', () => {
    const r = finalize(started(), 'lost', (cs, s) => { s.squad[0].injuryDays = 6; down(cs); });
    expect(r.state.squad[0].injuryDays).toBe(6);
  });

  it('loss adds stress to every fielded unit, clamped at 100', () => {
    const open = started();
    const r = finalize(open, 'lost', (cs) => { c(cs, 's2').stress = 95; });
    for (const cb of open.combat!.combatants.filter((x) => x.side === 'squad')) {
      const was = cb.cid === 's2' ? 95 : cb.stress;
      expect(r.state.squad.find((u) => u.id === cb.unitId)!.stress, cb.cid).toBe(Math.min(100, was + 10));
    }
    expect(r.state.squad[1].stress).toBe(100);
  });

  it('stress and breakdown persist into the campaign during an expedition; standalone combats release them', () => {
    const mutate = (cs: CombatState) => { c(cs, 's1').stress = 100; c(cs, 's1').breakdown = { defectId: 'rage_governor', policy: 'attack', ignoresOrders: true, actionEffects: [] }; downAll(cs, 'enemy'); };
    const exp = finalize(started(base, { expedition: true }), 'won', mutate);
    expect(exp.state.squad[0]).toMatchObject({ stress: 100, breakdown: { defectId: 'rage_governor', day: 1 } });
    expect(exp.state.lastCombat!.breakdowns).toEqual(['unit_ann']);
    expect(ofType(exp.events, 'breakdown_released')).toHaveLength(0);
    const solo = finalize(started(base, { expedition: false }), 'won', mutate);
    expect(solo.state.squad[0].breakdown).toBeUndefined();
    expect(solo.state.squad[0].stress).toBe(100);
    expect(solo.state.lastCombat!.breakdowns).toEqual(['unit_ann']);
    expect(ofType(solo.events, 'breakdown_released')).toEqual([{ type: 'breakdown_released', unitId: 'unit_ann' }]);
  });

  it('commander down injures the commander and emits commander_injured', () => {
    const open = started(base, { coverId: 'unit_ann', encounter: { enemies: [husk], danger: 1, exposesCommander: true } });
    expect(open.combat!.commander).toBeDefined();
    const r = finalize(open, 'lost', (cs) => { cs.commander!.downed = true; cs.commander!.hp = 0; });
    expect(r.state.commander.injuredUntilDay).toBe(open.day + 3);
    expect(ofType(r.events, 'commander_injured')).toEqual([{ type: 'commander_injured', days: 3, until: open.day + 3 }]);
    expect(r.state.lastCombat!.commanderInjured).toBe(true);
    expect(finalize(open, 'won', (cs) => downAll(cs, 'enemy')).state.lastCombat!.commanderInjured).toBe(false);
  });
});

describe('relation hints', () => {
  it('cover protected, steady on a wounded unit, downed endangered — one per pair at the highest severity', () => {
    const open = started(base, { coverId: 'unit_ann', encounter: { enemies: [husk], danger: 1, exposesCommander: true } });
    const hit = (target: string, amount: number): LogEntry => ({ round: 1, kind: 'hit', actor: 'e1', target, amount });
    const r = finalize(open, 'lost', (cs) => {
      cs.log.push({ round: 1, kind: 'cover', actor: 's1', target: 'commander' }, hit('s1', 10), hit('s1', 20), hit('s1', 5));
      cs.hints.push({ type: 'protected', actor: 'commander', targets: ['unit_bea'], severity: 'moderate' });
      cs.hints.push({ type: 'protected', actor: 'commander', targets: ['unit_bea'], severity: 'major' });
      c(cs, 's3').downed = true;
      c(cs, 's3').hp = 0;
    });
    const hints = r.state.lastCombat!.relationHints;
    const find = (type: string, actor: string, target?: string) => hints.filter((h) => h.type === type && h.actor === actor && (target === undefined || h.targets.includes(target)));
    expect(find('protected', 'unit_ann')).toEqual([{ type: 'protected', actor: 'unit_ann', targets: [], severity: 'moderate' }]); // 35 of 110 HP
    expect(find('protected', 'commander', 'unit_bea')).toEqual([{ type: 'protected', actor: 'commander', targets: ['unit_bea'], severity: 'major' }]);
    expect(find('endangered', 'commander', 'unit_cat')).toHaveLength(1);
    expect(hints).toHaveLength(3);
  });

  it('a cover that never took a hit earns no hint', () => {
    const open = started(base, { coverId: 'unit_ann', encounter: { enemies: [husk], danger: 1, exposesCommander: true } });
    const r = finalize(open, 'won', (cs) => downAll(cs, 'enemy'));
    expect(r.state.lastCombat!.relationHints).toEqual([]);
  });

  it('never writes relationships, memory or the chronicle', () => {
    const open = started();
    const r = finalize(open, 'lost', (cs) => { c(cs, 's1').downed = true; c(cs, 's1').hp = 0; });
    expect(r.state.relations).toEqual(open.relations);
    expect(r.state.memory).toEqual(open.memory);
  });
});

describe('easy retry', () => {
  const lossStart = () => started(base, { allowRetry: true }, giants);
  const auto = (s: CampaignState) => run(s, reg, { type: 'combat/auto', payload: { on: true } });
  const same = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));

  it('a lost combat with easy retry waits and writes nothing', () => {
    const s0 = lossStart();
    const r = auto(s0);
    expect(r.state.combat!.phase).toBe('lost_pending');
    expect(ofType(r.events, 'combat_lost_pending')).toHaveLength(1);
    expect(ofType(r.events, 'combat_ended')).toHaveLength(0);
    expect(r.state.lastCombat).toBeUndefined();
    expect(r.state.squad).toEqual(s0.squad);
    expect(r.state.resources).toEqual(s0.resources);
  });

  it('retry restores the state right after combat/start exactly, twice', () => {
    const s0 = lossStart();
    const pending = auto(s0).state;
    const back = run(pending, reg, { type: 'combat/retry' });
    expect(errors(back.events)).toEqual([]);
    same(back.state, s0);
    expect(ofType(back.events, 'combat_started')).toHaveLength(1);
    const again = run(auto(back.state).state, reg, { type: 'combat/retry' });
    same(again.state, s0);
  });

  it('accept after a retry finalizes the second attempt only: xp, loss stress and loot are applied once', () => {
    const s0 = lossStart();
    const second = auto(run(auto(s0).state, reg, { type: 'combat/retry' }).state).state;
    const accepted = run(second, reg, { type: 'combat/accept' });
    expect(errors(accepted.events)).toEqual([]);
    expect(accepted.state.combat).toBeUndefined();
    expect(accepted.state.lastCombat).toMatchObject({ outcome: 'lost', xp: {}, loot: [] });
    expect(accepted.state.lastCombat!.stressDelta.unit_ann).toBeGreaterThanOrEqual(10);
    expect(accepted.state.lastCombat!.stressDelta.unit_ann).toBeLessThan(25); // not applied twice
    expect(ofType(accepted.events, 'combat_ended')).toHaveLength(1);
    same(accepted.state.lastCombat!.log, second.combat!.log.slice(-300));
  });

  it('retry is rejected without allowRetry and after a win; accept needs a pending loss', () => {
    const noRetry = auto(started(base, { allowRetry: false }, giants));
    expect(noRetry.state.combat).toBeUndefined();
    expect(noRetry.state.lastCombat!.outcome).toBe('lost');
    expect(errors(run(noRetry.state, reg, { type: 'combat/retry' }).events)).toHaveLength(1);
    const win = auto(started(base, { allowRetry: true }));
    expect(win.state.lastCombat!.outcome).toBe('won');
    expect(errors(run(win.state, reg, { type: 'combat/retry' }).events)).toHaveLength(1);
    const running = started(base, { allowRetry: true });
    for (const type of ['combat/retry', 'combat/accept']) {
      const r = run(running, reg, { type });
      expect(errors(r.events)).toHaveLength(1);
      expect(r.state).toBe(running);
    }
  });

  it('the chronicle and memory never change through combat and retries', () => {
    const s0 = lossStart();
    const end = run(auto(run(auto(s0).state, reg, { type: 'combat/retry' }).state).state, reg, { type: 'combat/accept' }).state;
    same(end.memory, base.memory);
    same(end.dms, base.dms);
    same(end.relations, base.relations);
  });
});

describe('log cap and retreat', () => {
  it('lastCombat.log is capped at 300', () => {
    const r = finalize(started(), 'won', (cs) => {
      downAll(cs, 'enemy');
      for (let i = 0; i < 450; i++) cs.log.push({ round: 1, kind: 'pass', actor: 's1', amount: i });
    });
    expect(r.state.lastCombat!.log).toHaveLength(300);
    expect(r.state.lastCombat!.log.at(-1)!.amount).toBe(449);
  });

  it('combat/log in a running combat stays within the cap too', () => {
    const open = started();
    expect(open.combat!.log.length).toBeLessThanOrEqual(300);
  });

  it('retreat finalizes as retreated: loss stress, no xp, no loot', () => {
    const open = started();
    const r = run(open, reg, { type: 'combat/retreat' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.combat).toBeUndefined();
    expect(r.state.lastCombat).toMatchObject({ outcome: 'retreated', xp: {}, loot: [], banked: false });
    expect(r.state.lastCombat!.stressDelta.unit_ann).toBeGreaterThanOrEqual(10);
    expect(ofType(r.events, 'combat_ended')[0].outcome).toBe('retreated');
    expect(errors(run(r.state, reg, { type: 'combat/retreat' }).events)).toHaveLength(1);
  });

  it('retreat with easy retry is final (no RETRY offered)', () => {
    const r = run(started(base, { allowRetry: true }), reg, { type: 'combat/retreat' });
    expect(r.state.lastCombat!.outcome).toBe('retreated');
  });
});
