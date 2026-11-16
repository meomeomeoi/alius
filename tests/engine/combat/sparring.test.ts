import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { commanderMaxHp } from '../../../src/engine/combat/crisis';
import { makeCtx } from '../../../src/engine/combat/effects';
import { usableSkills } from '../../../src/engine/combat/skills';
import { commanderSparrer, sparringBout } from '../../../src/engine/combat/sparring';
import { commanderProfile } from '../../../src/engine/commander/profile';
import { challenge, playWager } from '../../../src/engine/personal/wagers';
import { personalOf } from '../../../src/engine/personal/state';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState, Wager } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ANN, ctxFrom, errors, loadCore, ofType, partner, plain, run } from '../../helpers/personal';
import type { CombatState } from '../../../src/engine/combat/types';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const stakeOf = (effect: string): string => [...reg.wagerStakes.values()].find((x) => x.effect === effect)!.id as string;
const handicaps = () => (reg.wagerGames.get('sparring')!.handicaps as Array<{ id: string; minAffinity: number }>).map((h) => h.id);

/** Ann is a balanced friend with Affinity 60, day 5, the morning. */
function fresh(affinity = 60): CampaignState {
  const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity });
  s.day = 5;
  s.slot = 'morning';
  return s;
}
const bout = (s: CampaignState, seed: number, handicap: string) => sparringBout(s, reg, new Rng(seedRng(seed)), ANN, handicap);
const rate = (s: CampaignState, handicap: string, n = 200): number => {
  let wins = 0;
  for (let seed = 1; seed <= n; seed++) if (bout(s, seed, handicap).winner === 'commander') wins++;
  return wins / n;
};
const sparWager = (over: Partial<Wager> = {}): Wager =>
  ({ id: 'wg_1', unitId: ANN, by: 'commander', gameId: 'sparring', stakeId: stakeOf('privilege'), day: 5, status: 'accepted', pick: 'none', ...over });

describe('the commander as a sparrer', () => {
  it('atk 6 + 3·strength, def 4 + 2·endurance, spd 6 + 2·reflexes, crit 5, HP of a crisis', () => {
    const s = fresh();
    const body = commanderProfile(s).body;
    const c = commanderSparrer(s, reg);
    expect(c).toMatchObject({ side: 'squad', row: 'front', downed: false, stress: 0 });
    expect(c.base).toEqual({ hp: commanderMaxHp(s, reg), atk: 6 + 3 * body.strength, def: 4 + 2 * body.endurance, spd: 6 + 2 * body.reflexes, crit: 5 });
    expect(c.hp).toBe(c.maxHp);
    expect(c.skills).toEqual([TUNING.personal.sparring.commanderSkill]);
  });

  it('the commander skill is a single-target basic attack that usableSkills accepts for a combatant with no role', () => {
    const skillId = TUNING.personal.sparring.commanderSkill;
    const skill = reg.skills.get(skillId)!;
    expect(skill.kind).toBe('active');
    expect(skill.cooldown ?? 0).toBe(0);
    expect(skill.cp ?? 0).toBe(0);
    expect((skill.effects as Array<{ type: string }>).map((e) => e.type)).toEqual(['damage']);
    const s = fresh();
    const me = commanderSparrer(s, reg);
    const her = { ...structuredClone(me), cid: 'e1', side: 'enemy' as const, enemyId: 'husk', unitId: undefined };
    const cs = { combatants: [me, her], round: 1, cp: 0, log: [] } as unknown as CombatState;
    const usable = usableSkills(makeCtx(cs, s, reg, new Rng(seedRng(1))), me.cid);
    expect(usable.map((u) => u.skill.id)).toEqual([skillId]);
    expect(usable[0].targets).toEqual(['e1']);
  });
});

describe('the bout', () => {
  it('uses the P4 engine: same seed same result, and the state is never touched', () => {
    const s = fresh();
    const before = structuredClone(s);
    const a = bout(s, 7, 'none');
    const b = bout(s, 7, 'none');
    expect(a).toEqual(b);
    expect(a.rounds).toBeGreaterThan(0);
    expect(s).toEqual(before); // no combat, no last combat, no stats, no rng written back
    expect(s.combat).toBeUndefined();
    expect(s.lastCombat).toBeUndefined();
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(bout(s, seed, 'none')))).size).toBeGreaterThan(1); // the seed matters
  });

  it('with no handicap an average commander almost never wins a level-1 soldier of any role; the best handicap wins 25 to 40 %', () => {
    const over = (id: string): number => {
      let wins = 0;
      let n = 0;
      for (const role of reg.roles.keys()) {
        const s = fresh(100);
        const u = s.squad.find((x) => x.id === ANN)!;
        u.roleId = role;
        s.commander.body = { strength: 3, endurance: 3, reflexes: 3 }; // average
        for (let seed = 1; seed <= 100; seed++) {
          n++;
          if (bout(s, seed, id).winner === 'commander') wins++;
        }
      }
      return wins / n;
    };
    expect(over('none')).toBeLessThanOrEqual(0.05);
    const best = Math.max(...handicaps().map(over));
    expect(best).toBeGreaterThanOrEqual(0.25);
    expect(best).toBeLessThanOrEqual(0.4);
  });

  it('a handicap her Affinity does not allow is refused (at the challenge and at the play)', () => {
    const cold = fresh(20); // blindfold needs 40
    expect(() => bout(cold, 1, 'blindfold')).toThrow(/Affinity|allow/);
    expect(() => bout(cold, 1, 'nope')).toThrow();
    const ask = (s: CampaignState, pick: string) => run(s, reg, { type: 'wager/challenge', payload: { unitId: ANN, gameId: 'sparring', stakeId: stakeOf('privilege'), pick } });
    expect(errors(ask(cold, 'blindfold').events)).toHaveLength(1);
    expect(errors(ask(cold, 'first_blood').events)).toEqual([]);
    expect(errors(ask(cold, undefined as unknown as string).events)).toHaveLength(1); // a sparring wager needs a handicap
    const d = structuredClone(cold);
    personalOf(d).wagers = { open: [sparWager({ pick: 'blindfold' })], log: [] };
    expect(() => playWager(d, ctxFrom(d, reg), 'wg_1')).toThrow();
  });

  it('a 20-round draw goes to her', () => {
    const slow = {
      ...reg,
      wagerGames: new Map(reg.wagerGames),
    } as Registries;
    const sparring = structuredClone(reg.wagerGames.get('sparring')!);
    (sparring.handicaps as unknown[]).push({ id: 'wall', label: 'A wall', herAtk: 0.1, herHp: 2, herSpd: 1, minAffinity: -100 });
    slow.wagerGames.set('sparring', sparring);
    const s = fresh();
    const ann = s.squad.find((u) => u.id === ANN)!;
    ann.baseStats.hp = 3000; // too much to wear down in 20 rounds
    ann.currentHp = 3000;
    const r = sparringBout(s, slow, new Rng(seedRng(3)), ANN, 'wall');
    expect(r).toEqual({ winner: 'unit', rounds: TUNING.personal.sparring.maxRounds, draw: true });
  });
});

describe('a sparring wager', () => {
  function wagered(s = fresh()): CampaignState {
    personalOf(s).wagers = { open: [sparWager()], log: [] };
    return s;
  }
  const play = (s: CampaignState) => run(s, reg, { type: 'wager/play', payload: { wagerId: 'wg_1' } });

  it('spends one slot and gives strength XP; only the rng, the slot, the XP and the stake change', () => {
    const s = wagered();
    const r = play(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.slot).toBe('afternoon');
    const xp = (st: CampaignState) => commanderProfile(st).bodyXp.strength;
    expect(xp(r.state)).toBe(xp(s) + Math.round(TUNING.commander.bodyXpPerSession * TUNING.personal.sparring.bodyXp));
    expect(r.state.combat).toBeUndefined();
    expect(r.state.lastCombat).toBeUndefined();
    expect(r.state.rng).not.toEqual(s.rng);
    const resolved = ofType(r.events, 'wager_resolved')[0];
    expect(resolved).toMatchObject({ gameId: 'sparring', handicap: 'none' });
    expect(['commander', 'unit']).toContain(resolved.winner);
    // everything else is as it was (the stake was a privilege: her record moved and nothing else)
    const strip = (st: CampaignState) => {
      const c = structuredClone(st) as unknown as Record<string, unknown>;
      for (const k of ['rng', 'slot', 'personal', 'ledger']) delete c[k];
      (c.commander as { bodyXp?: unknown; body?: unknown }).bodyXp = undefined;
      (c.commander as { body?: unknown }).body = undefined;
      (c.commander as { archetype?: unknown }).archetype = undefined;
      for (const rel of Object.values(c.relations as Record<string, Record<string, unknown>>)) { delete rel.impunityRecord; delete rel.history; delete rel.dailyGain; }
      return c;
    };
    expect(strip(r.state)).toEqual(strip(s));
    expect(ofType(r.events, 'slot_advanced')).toHaveLength(1);
  });

  it('is refused in the Night slot and while a scene, a dilemma or a due booking holds the slot', () => {
    const night = wagered();
    night.slot = 'night';
    const r = play(night);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(night);
    const scene = wagered();
    scene.calendar.pendingScene = { unitId: ANN, day: 5, slot: 'morning' };
    expect(errors(play(scene).events)).toHaveLength(1);
    const booked = wagered();
    personalOf(booked).bookings = [{ id: 'bk_1', unitId: ANN, kindId: 'evening_with_me', day: 5, slot: 'morning', status: 'booked', source: 'roll', made: 4 }];
    expect(errors(play(booked).events)).toHaveLength(1);
  });

  it('the stake applies to the winner of the bout', () => {
    const wins = { commander: 0, unit: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      const s = wagered();
      s.rng = seedRng(seed);
      const r = play(s);
      wins[ofType(r.events, 'wager_resolved')[0].winner as 'commander' | 'unit']++;
      const delta = (r.state.relations[ANN].impunityRecord ?? 0) - (s.relations[ANN].impunityRecord ?? 0);
      expect(delta).toBe(ofType(r.events, 'wager_resolved')[0].winner === 'unit' ? 6 : -6);
    }
    expect(wins.unit).toBeGreaterThan(0);
  });

  it('the commander challenges with a handicap she allows; her own challenge names one she allows', () => {
    const s = fresh();
    const r = challenge(s, ctxFrom(s, reg), { unitId: ANN, gameId: 'sparring', stakeId: stakeOf('privilege'), pick: 'one_arm' });
    expect(ofType(r, 'wager_accepted')).toHaveLength(1);
    expect(s.personal!.wagers!.open[0]).toMatchObject({ gameId: 'sparring', pick: 'one_arm', status: 'accepted' });
  });
});
