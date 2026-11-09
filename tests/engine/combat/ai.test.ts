import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { canAutoResolve, chooseAction } from '../../../src/engine/combat/ai';
import { makeCtx } from '../../../src/engine/combat/effects';
import { usableSkills } from '../../../src/engine/combat/skills';
import { defaultFormation, encounterPower, squadPower } from '../../../src/engine/combat/stats';
import type { CombatState } from '../../../src/engine/combat/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';
import { fixtureCombat, rngOf, type FixtureCombatant } from '../../helpers/combat';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const setup = (o: { squad?: FixtureCombatant[]; enemies?: FixtureCombatant[]; seed?: number }) => {
  const cs = fixtureCombat(o);
  return { cs, ctx: makeCtx(cs, structuredClone(base), reg, rngOf(o.seed ?? 3)) };
};
const c = (cs: CombatState, cid: string) => cs.combatants.find((x) => x.cid === cid)!;

describe('chooseAction', () => {
  it('aggressive picks the heaviest hit', () => {
    const { ctx } = setup({ squad: [{ row: 'front' }, { row: 'front' }], enemies: [{ skills: ['en_claw', 'en_savage'], aiProfile: 'aggressive' }] });
    expect(chooseAction(ctx, 'e1')).toEqual({ kind: 'skill', skillId: 'en_savage', targetCid: 's1' });
  });

  it('aggressive prefers the target it hurts most (lowest DEF), ties keep the earlier target', () => {
    const { ctx } = setup({ squad: [{ def: 40 }, { def: 5 }, { def: 5 }], enemies: [{ skills: ['en_claw'] }] });
    expect(chooseAction(ctx, 'e1')).toEqual({ kind: 'skill', skillId: 'en_claw', targetCid: 's2' });
  });

  it('an all-target skill counts every target it hits', () => {
    const { ctx } = setup({ squad: [{}, {}, {}], enemies: [{ skills: ['en_slam', 'en_rift'], aiProfile: 'aggressive', row: 'back' }] });
    expect(chooseAction(ctx, 'e1')).toMatchObject({ skillId: 'en_rift' });
  });

  it('predator finishes the weakest', () => {
    const { ctx } = setup({
      squad: [{ hp: 100, maxHp: 100 }, { hp: 20, maxHp: 100 }, { hp: 60, maxHp: 100 }],
      enemies: [{ skills: ['en_pounce', 'en_claw'], aiProfile: 'predator' }],
    });
    expect(chooseAction(ctx, 'e1')).toMatchObject({ targetCid: 's2' });
  });

  it('protector heals an ally under half HP, else attacks', () => {
    const hurt = setup({
      squad: [{}],
      enemies: [{ skills: ['en_sidearm', 'en_triage'], aiProfile: 'protector', row: 'back' }, { hp: 30, maxHp: 100, row: 'back' }],
    });
    expect(chooseAction(hurt.ctx, 'e1')).toEqual({ kind: 'skill', skillId: 'en_triage', targetCid: 'e2' });
    const fine = setup({
      squad: [{}],
      enemies: [{ skills: ['en_sidearm', 'en_triage'], aiProfile: 'protector', row: 'back' }, { hp: 80, maxHp: 100, row: 'back' }],
    });
    expect(chooseAction(fine.ctx, 'e1')).toMatchObject({ skillId: 'en_sidearm' });
  });

  it('protector revives a fallen ally first, and covers an exposed commander that was hit', () => {
    const { cs, ctx } = setup({
      squad: [{ skills: ['me_resuscitate', 'me_sidearm'], aiProfile: 'protector', row: 'back' }, { downed: true }],
      enemies: [{}],
    });
    expect(chooseAction(ctx, 's1')).toEqual({ kind: 'skill', skillId: 'me_resuscitate', targetCid: 's2' });
    const cover = setup({ squad: [{ skills: ['df_cover_ally', 'df_bash'], aiProfile: 'protector' }, {}], enemies: [{}] });
    cover.cs.commander = { hp: 30, maxHp: 60, def: 10, coverId: 's2', downed: false };
    expect(chooseAction(cover.ctx, 's1')).toMatchObject({ skillId: 'df_cover_ally' });
    expect(cs.combatants).toHaveLength(3);
  });

  it('disruptor applies a missing status, else attacks', () => {
    const { cs, ctx } = setup({ squad: [{ statuses: [{ id: 'corrode' }] }, {}], enemies: [{ skills: ['en_emitter', 'en_corrode_shot'], aiProfile: 'disruptor', row: 'back' }] });
    expect(chooseAction(ctx, 'e1')).toEqual({ kind: 'skill', skillId: 'en_corrode_shot', targetCid: 's2' });
    c(cs, 's2').statuses.push({ id: 'corrode', turns: 2, stacks: 1, sourceCid: 'e1' });
    expect(chooseAction(ctx, 'e1')).toMatchObject({ skillId: 'en_emitter' });
  });

  it('stressor targets the most stressed squad unit that has not broken', () => {
    const { ctx } = setup({ squad: [{ stress: 40 }, { stress: 70 }, { stress: 100 }], enemies: [{ skills: ['en_whisper'], aiProfile: 'stressor', row: 'back' }] });
    expect(chooseAction(ctx, 'e1')).toEqual({ kind: 'skill', skillId: 'en_whisper', targetCid: 's2' });
  });

  it('erratic stays legal over 200 seeded picks and varies', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const { ctx } = setup({ squad: [{}, { row: 'back' }], enemies: [{ skills: ['en_glitch_strike', 'en_rift'], aiProfile: 'erratic', row: 'back' }], seed });
      const a = chooseAction(ctx, 'e1');
      expect(a.kind).toBe('skill');
      const usable = usableSkills(ctx, 'e1').find((u) => u.skill.id === a.skillId)!;
      expect(usable.targets).toContain(a.targetCid);
      seen.add(`${a.skillId}:${a.targetCid}`);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('no usable skill → guard', () => {
    const { cs, ctx } = setup({ squad: [{}], enemies: [{ skills: ['en_claw'] }] });
    c(cs, 'e1').cooldowns = { en_claw: 2 };
    expect(chooseAction(ctx, 'e1')).toEqual({ kind: 'guard' });
    expect(chooseAction(setup({ squad: [{}], enemies: [{ skills: [] }] }).ctx, 'e1')).toEqual({ kind: 'guard' });
  });

  it('a support with only utility skills still acts', () => {
    const { ctx } = setup({ squad: [{ skills: ['su_rally'], aiProfile: 'protector' }, {}], enemies: [{}] });
    expect(chooseAction(ctx, 's1')).toMatchObject({ kind: 'skill', skillId: 'su_rally' });
  });
});

describe('auto-resolve', () => {
  const start = (s: CampaignState, enemies = [{ enemyId: 'husk', level: 1, affixes: [] as string[] }]) => ({
    encounter: { enemies, danger: 1 }, formation: defaultFormation(s, reg, s.roster.activeIds),
  });
  const auto = (s: CampaignState) => {
    const started = run(s, reg, { type: 'combat/start', payload: start(s) });
    return run(started.state, reg, { type: 'combat/auto', payload: { on: true } });
  };

  it('auto-resolve is deterministic for a seed', () => {
    const a = auto(base);
    const b = auto(structuredClone(base));
    expect(errors(a.events)).toEqual([]);
    expect(a.state.combat!.phase).toBe('ended');
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(ofType(a.events, 'combat_ended')).toHaveLength(1);
    const other = structuredClone(base);
    other.rng = [1, 2, 3, 4];
    expect(JSON.stringify(auto(other).state.combat!.log)).not.toBe(JSON.stringify(a.state.combat!.log));
  });

  it('runs to the end in one dispatch, with CP orders left to the player', () => {
    const r = auto(base);
    expect(r.state.combat!.outcome).toBe('won');
    expect(r.state.combat!.ordersThisRound).toEqual([]);
  });

  it('can be switched off while the combat waits, and is refused without a combat or after the end', () => {
    const started = run(base, reg, { type: 'combat/start', payload: start(base) }).state;
    const off = run(started, reg, { type: 'combat/auto', payload: { on: false } });
    expect(off.state.combat!.auto).toBe(false);
    expect(off.state.combat!.phase).toBe('awaiting');
    expect(off.state.combat!.awaitingCid).toBe(started.combat!.awaitingCid);
    expect(errors(run(base, reg, { type: 'combat/auto', payload: { on: true } }).events)).toHaveLength(1);
    const ended = auto(base).state;
    expect(errors(run(ended, reg, { type: 'combat/auto', payload: { on: true } }).events)).toHaveLength(1);
    expect(errors(run(started, reg, { type: 'combat/auto', payload: { on: 'yes' } }).events)).toHaveLength(1);
  });

  it('canAutoResolve at 60 % and not at 61 %', () => {
    const p = start(base);
    const squad = squadPower(base, reg, [...p.formation.front, ...p.formation.back]);
    const husk = reg.enemies.get('husk')!;
    const at = (ratio: number) => {
      const cloned = structuredClone(reg);
      const unit = encounterPower(reg, p.encounter, 'normal') / (husk.power as number);
      cloned.enemies.set('husk', { ...husk, power: (ratio * squad) / unit });
      return canAutoResolve(base, cloned, p);
    };
    expect(at(0.5999)).toBe(true);
    expect(at(0.59)).toBe(true);
    expect(at(0.61)).toBe(false);
    expect(canAutoResolve(base, reg, p)).toBe(true); // a lone husk is far below 60 % of a squad of four
  });
});
