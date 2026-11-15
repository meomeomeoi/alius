import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { bondsDayStep, clearSmother, smotherActive, startSmother } from '../../../src/engine/bonds';
import { applyEffects, fireTrigger, healBonusPct, makeCtx, outgoingPct, effectiveStat } from '../../../src/engine/combat/effects';
import { issueOrder } from '../../../src/engine/combat/orders';
import { enterBreakdown } from '../../../src/engine/combat/stress';
import type { CombatState, EffectSpec } from '../../../src/engine/combat/types';
import { Rng } from '../../../src/engine/rng';
import { decideArc } from '../../../src/engine/arcs';
import { applyEventToUnit } from '../../../src/engine/relations/effects';
import type { EventIntent } from '../../../src/engine/relations/intents';
import { releaseBreakdowns } from '../../../src/engine/progression';
import type { CampaignState } from '../../../src/engine/state/types';
import { bondsDirectives } from '../../../src/bonds/directives';
import { ContextBuilder } from '../../../src/llm/context';
import { fixtureCombat, rngOf } from '../../helpers/combat';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { depart, withMission } from '../../helpers/expedition';
import { withBond } from '../../helpers/bonds';
import '../../../src/engine/actions/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

type Combat = { upside: EffectSpec[]; downside: EffectSpec[] };
const passivesOf = (id: string): Array<EffectSpec & { source: string }> => {
  const c = reg.defects.get(id)!.combat as Combat;
  return [...c.upside.map((e) => ({ ...e, source: `defect:${id}` })), ...c.downside.map((e) => ({ ...e, source: `defect:${id}:down` }))];
};
const ev = (type: string, over: Partial<EventIntent> = {}): EventIntent => ({ type: type as never, actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, ...over });
const withDefect = (id: string): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 5;
  s.squad.find((u) => u.id === ANN)!.defects = [{ id }];
  return s;
};
const stressOf = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!.stress;

describe('dominance_drive in combat', () => {
  it('deals more damage and acts faster on her own call, and stresses when ordered', () => {
    const cs = fixtureCombat({ squad: [{ passives: passivesOf('dominance_drive') }, {}] });
    const ctx = makeCtx(cs, campaign(reg, 4), reg, rngOf(3));
    expect(outgoingPct(ctx, 's1')).toBe(8);
    expect(effectiveStat(ctx, 's1', 'spd')).toBe(11); // 10 +5% rounds up
    cs.ordersThisRound.push({ orderId: 'steady', targetCid: 's1' });
    expect(outgoingPct(ctx, 's1')).toBe(0);
    expect(effectiveStat(ctx, 's1', 'spd')).toBe(10);
    fireTrigger(ctx, 'onTurnStart', { actorCid: 's1' });
    expect(cs.combatants[0].stress).toBeGreaterThan(0);
    const calm = fixtureCombat({ squad: [{ passives: passivesOf('dominance_drive') }] });
    fireTrigger(makeCtx(calm, campaign(reg, 4), reg, rngOf(3)), 'onTurnStart', { actorCid: 's1' });
    expect(calm.combatants[0].stress).toBe(0);
  });

  it('Seize Command makes allies refuse orders by chance (seeded)', () => {
    const refusals = (seed: number, seize: boolean): number => {
      const cs = fixtureCombat({ squad: [{ passives: passivesOf('dominance_drive') }, {}], cp: 3 });
      const ctx = makeCtx(cs, campaign(reg, 4), reg, rngOf(seed));
      const s = campaign(reg, 4);
      s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'dominance_drive' }];
      cs.combatants[0].unitId = ANN;
      cs.combatants[1].unitId = undefined as unknown as string; // an ally nobody owns: no disposition scaling
      const c2 = makeCtx(cs, s, reg, rngOf(seed));
      void ctx;
      if (seize) enterBreakdown(c2, 's1');
      let n = 0;
      for (let i = 0; i < 40; i++) {
        cs.cp = 3;
        cs.ordersThisRound.length = 0;
        if (!issueOrder(c2, 'steady', 's2')) n++;
      }
      return n;
    };
    expect(refusals(5, false)).toBe(0);
    const n = refusals(5, true);
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(32);
    expect(refusals(5, true)).toBe(n); // seeded
  });

  it('its breakdown ignores CP orders', () => {
    expect((reg.defects.get('dominance_drive')!.combat as { breakdown: { ignoresOrders: boolean; policy: string } }).breakdown).toMatchObject({ ignoresOrders: true, policy: 'normal' });
  });
});

describe('dominance_drive out of combat', () => {
  const stressAfter = (s: CampaignState, e: EventIntent): number => {
    const d = structuredClone(s);
    applyEventToUnit(d, reg, ANN, e);
    return stressOf(d);
  };
  it('commander_enforced stresses her; followed_lead relieves her', () => {
    const s = withDefect('dominance_drive');
    s.squad.find((u) => u.id === ANN)!.stress = 30;
    const plain = withDefect('echo_bleed');
    plain.squad.find((u) => u.id === ANN)!.stress = 30;
    plain.squad.find((u) => u.id === ANN)!.defects = [];
    expect(stressAfter(s, ev('commander_enforced'))).toBe(stressAfter(plain, ev('commander_enforced')) + 4);
    expect(stressAfter(s, ev('followed_lead'))).toBe(stressAfter(plain, ev('followed_lead')) - 3);
  });

  it('embracing it writes co_command, halves the positives and sets the directive', () => {
    const s = withDefect('dominance_drive');
    s.squad.find((u) => u.id === ANN)!.stress = 30;
    const before = stressAfter(s, ev('commander_enforced'));
    const rel = s.relations[ANN];
    expect(rel.flags).not.toContain('co_command');
    const d = structuredClone(s);
    d.resources.credits = 9999; d.resources.supplies = 99; d.resources.plyx = 99;
    d.squad.find((u) => u.id === ANN)!.defects = [{ id: 'dominance_drive' }];
    d.relations[ANN].stateId = 'devoted';
    d.relations[ANN].flags.push('arc_raised');
    d.day = 30;
    d.base.facilities.medbay = 3;
    const events = decideArc(d, { registries: reg, rng: new Rng(d.rng) }, { unitId: ANN, defectId: 'dominance_drive', path: 'embrace', compel: true });
    expect(events.some((e) => e.type === 'arc_decided')).toBe(true);
    expect(d.relations[ANN].flags).toContain('co_command');
    d.squad.find((u) => u.id === ANN)!.stress = 30;
    const after = stressAfter(d, ev('commander_enforced'));
    expect(after).toBeLessThan(before + 1);
    // the directive, while she is in the scene
    d.scene = { id: 's1', day: 30, slot: 'morning', locationId: 'quarters_unit', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    const b = new ContextBuilder();
    bondsDirectives(b, d, reg);
    expect(b.build(d, 5000).directives).toContain('Ann shares command with the commander by open agreement.');
    delete d.scene;
    bondsDirectives(b, d, reg);
    expect(b.build(d, 5000).directives).not.toContain('shares command');
  });
});

describe('caretaker_overdrive', () => {
  it('heals more when allies are hurt and gains def with a frail commander', () => {
    const passives = passivesOf('caretaker_overdrive');
    const heal = (hurt: boolean): number => {
      const cs = fixtureCombat({ squad: [{ passives }, { hp: hurt ? 20 : 100, maxHp: 100 }], cp: 1 });
      const ctx = makeCtx(cs, campaign(reg, 4), reg, rngOf(3));
      cs.combatants[1].hp = hurt ? 20 : 100;
      expect(healBonusPct(ctx, 's1')).toBe(hurt ? 40 : 0); // 80% missing × 0.5
      return healBonusPct(ctx, 's1');
    };
    expect(heal(true)).toBeGreaterThan(heal(false));
    const cs = fixtureCombat({ squad: [{ passives }] });
    const ctx = makeCtx(cs, campaign(reg, 4), reg, rngOf(3));
    expect(effectiveStat(ctx, 's1', 'def')).toBe(10);
    cs.commander = { hp: 60, maxHp: 60, def: 10, coverId: 's1', downed: false, build: 'frail' };
    expect(effectiveStat(ctx, 's1', 'def')).toBe(11);
    cs.commander.build = 'fit';
    expect(effectiveStat(ctx, 's1', 'def')).toBe(10);
  });

  it('a heal of hers restores more while allies are hurt, and only hers', () => {
    const healed = (passives: Array<EffectSpec & { source: string }>, owner: 's1' | 's2'): number => {
      const cs = fixtureCombat({ squad: [{ passives }, { hp: 20, maxHp: 100 }, { hp: 20, maxHp: 100 }] });
      applyEffects(makeCtx(cs, campaign(reg, 4), reg, rngOf(3)), owner, [{ type: 'heal', pctMaxHp: 10, target: 'allies_other' }], {});
      return cs.combatants[owner === 's1' ? 1 : 2].hp - 20;
    };
    expect(healed([], 's1')).toBe(10);
    expect(healed(passivesOf('caretaker_overdrive'), 's1')).toBe(14); // allies 80% missing × 0.5 = +40%
    expect(healed(passivesOf('caretaker_overdrive'), 's2')).toBe(10); // her passive boosts her own heals only
    expect(outgoingPct(makeCtx(fixtureCombat({ squad: [{ passives: passivesOf('caretaker_overdrive') }, { hp: 20 }] }), campaign(reg, 4), reg, rngOf(3)), 's1')).toBe(0); // never her damage
  });

  it('stresses her while the commander is exposed', () => {
    const cs = fixtureCombat({ squad: [{ passives: passivesOf('caretaker_overdrive') }] });
    cs.commander = { hp: 60, maxHp: 60, def: 10, coverId: 's1', downed: false, build: 'fit' };
    fireTrigger(makeCtx(cs, campaign(reg, 4), reg, rngOf(3)), 'onRoundStart', {});
    expect(cs.combatants[0].stress).toBeGreaterThan(0);
  });

  it('endangered stresses her out of combat', () => {
    const s = withDefect('caretaker_overdrive');
    const plain = withDefect('echo_bleed');
    plain.squad.find((u) => u.id === ANN)!.defects = [];
    const a = structuredClone(s), b = structuredClone(plain);
    applyEventToUnit(a, reg, ANN, ev('endangered'));
    applyEventToUnit(b, reg, ANN, ev('endangered'));
    expect(stressOf(a)).toBe(stressOf(b) + 4);
  });
});

describe('smother', () => {
  const smothering = (): CampaignState => {
    const s = withDefect('caretaker_overdrive');
    return s;
  };

  it('starts from the Want breakdown and from a released combat breakdown', () => {
    const s = smothering();
    s.squad.find((u) => u.id === ANN)!.breakdown = { defectId: 'caretaker_overdrive', day: 5 };
    const events = releaseBreakdowns(s, undefined, reg);
    expect(ofType(events, 'smother_started')).toMatchObject([{ unitId: ANN, untilDay: 6 }]);
    expect(smotherActive(s)).toEqual({ unitId: ANN, untilDay: 6 });
    expect(releaseBreakdowns(smothering(), undefined, reg)).toEqual([]);
  });

  it('refuses expedition/start until the next day', () => {
    const base = campaign(reg, 4);
    const { state, mission } = withMission(reg, base);
    const held = structuredClone(state);
    held.bonds = { rules: [], smother: { unitId: ANN, untilDay: held.day + 1 } };
    const r = run(held, reg, { type: 'expedition/start', payload: { missionId: mission.id, unitIds: held.roster.activeIds.slice(0, 4), formation: { front: held.roster.activeIds.slice(0, 2), back: held.roster.activeIds.slice(2, 4) }, supplies: 4 } });
    expect(errors(r.events).map((e) => String(e.message ?? e.code))).toEqual([expect.stringMatching(/has locked the hangar: the commander stays at base today\./)]);
    // after her day it opens again
    held.day += 2;
    held.bonds = { rules: [], smother: { unitId: ANN, untilDay: held.day - 1 } };
    expect(smotherActive(held)).toBeNull();
    expect(() => depart(reg, state, mission.id)).not.toThrow();
  });

  it('the day step ends a hold whose day is past', () => {
    const s = smothering();
    s.bonds = { rules: [], smother: { unitId: ANN, untilDay: 4 } };
    const d = structuredClone(s);
    const events = bondsDayStep(d, { registries: reg, rng: new Rng(d.rng) });
    expect(ofType(events, 'smother_ended')).toHaveLength(1);
    expect(d.bonds?.smother).toBeUndefined();
  });

  it('the scene she holds ends her smother', () => {
    const s = smothering();
    expect(startSmother(s, ANN)).toHaveLength(1);
    const open = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const ended = run(open, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(ended.state.bonds?.smother).toBeUndefined();
    expect(ofType(ended.events, 'smother_ended')).toHaveLength(1);
  });

  it('a Leash Suppress clears it; so does removing her from service', () => {
    const s = smothering();
    startSmother(s, ANN);
    expect(clearSmother(structuredClone(s), BEA)).toEqual([]);
    expect(clearSmother(structuredClone(s), ANN)).toHaveLength(1);
  });

  it('one hold at a time', () => {
    const s = smothering();
    expect(startSmother(s, ANN)).toHaveLength(1);
    expect(startSmother(s, BEA)).toEqual([]);
  });
});

describe('content', () => {
  it('lists 20 defects; both belong to desire_bond; caretaker needs the trait', () => {
    expect(reg.defects.size).toBe(20);
    expect(reg.defects.get('dominance_drive')!.category).toBe('desire_bond');
    expect(reg.defects.get('caretaker_overdrive')).toMatchObject({ category: 'desire_bond', requiresBond: { caretaker: true } });
    const s = campaign(reg, 4);
    withBond(s, ANN, { caretaker: false });
    expect(s.squad.find((u) => u.id === ANN)!.bond?.caretaker).toBe(false);
  });
});
