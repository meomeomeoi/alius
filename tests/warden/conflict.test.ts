import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { conflictOf, herAlternative, wardenOf, type Expectation, type ExpectationKind, type WardenOrder } from '../../src/engine/warden';
import { fixtureCombat } from '../helpers/combat';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ex = (kind: ExpectationKind, weight: number, over: Partial<Expectation> = {}): Expectation => ({ id: `e_${kind}`, kind, weight, source: 'values', known: false, ...over });
/** A LEASHSWAP campaign: Ann, Bea (the warden), Cat, Dee; her agenda is exactly the given expectations. */
function swap(list: Expectation[]): CampaignState {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat', 'Dee'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 7 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  wardenOf(r.state)!.expectations = list;
  return r.state;
}
const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat', dee: 'unit_dee' };
const only = (kind: ExpectationKind, weight = 0.5) => swap([ex(kind, weight)]);
const hit = (s: CampaignState, order: WardenOrder) => conflictOf(s, reg, order);

describe('conflictOf by kind', () => {
  it('keep_me_close: a roster without her, an expedition without her, an activity with another companion', () => {
    const s = only('keep_me_close');
    expect(hit(s, { kind: 'roster', activeIds: [ID.ann, ID.cat] })).toEqual({ expectationId: 'e_keep_me_close', weight: 0.5 });
    expect(hit(s, { kind: 'roster', activeIds: [ID.ann, ID.bea] })).toBeNull();
    expect(hit(s, { kind: 'expedition', unitIds: [ID.ann, ID.cat] })?.expectationId).toBe('e_keep_me_close');
    expect(hit(s, { kind: 'expedition', unitIds: [ID.bea] })).toBeNull();
    expect(hit(s, { kind: 'activity', activityId: 'train', companionId: ID.ann })?.expectationId).toBe('e_keep_me_close');
    expect(hit(s, { kind: 'activity', activityId: 'train', companionId: ID.bea })).toBeNull();
    expect(hit(s, { kind: 'activity', activityId: 'train' })).toBeNull(); // alone: nobody else is chosen over her
  });

  it('protect_squad: an injured or stressed unit in the party', () => {
    const s = only('protect_squad');
    expect(hit(s, { kind: 'expedition', unitIds: [ID.ann, ID.cat] })).toBeNull();
    s.squad.find((u) => u.id === ID.cat)!.stress = 70;
    expect(hit(s, { kind: 'expedition', unitIds: [ID.ann, ID.cat] })?.expectationId).toBe('e_protect_squad');
    s.squad.find((u) => u.id === ID.cat)!.stress = 69;
    s.squad.find((u) => u.id === ID.ann)!.status = 'injured';
    expect(hit(s, { kind: 'expedition', unitIds: [ID.ann] })?.expectationId).toBe('e_protect_squad');
  });

  it('protect_squad: authorize_ultimate and hold_the_line while an ally is at 25 % HP or less', () => {
    const s = only('protect_squad');
    const combat = fixtureCombat({ squad: [{ cid: 'a', unitId: ID.ann, hp: 20, maxHp: 100 }, { cid: 'b', unitId: ID.cat, hp: 80, maxHp: 100 }], enemies: [{ cid: 'e1' }] });
    s.combat = combat;
    expect(hit(s, { kind: 'combat_order', orderId: 'authorize_ultimate', targetCid: 'b' })?.expectationId).toBe('e_protect_squad');
    expect(hit(s, { kind: 'combat_order', orderId: 'hold_the_line' })?.expectationId).toBe('e_protect_squad');
    expect(hit(s, { kind: 'combat_order', orderId: 'focus_fire', targetCid: 'e1' })).toBeNull();
    combat.combatants.find((c) => c.cid === 'a')!.hp = 26;
    expect(hit(s, { kind: 'combat_order', orderId: 'hold_the_line' })).toBeNull();
    combat.combatants.find((c) => c.cid === 'a')!.hp = 25;
    expect(hit(s, { kind: 'combat_order', orderId: 'hold_the_line' })).not.toBeNull();
  });

  it('obey_oversight: fall_back', () => {
    const s = only('obey_oversight');
    s.combat = fixtureCombat({ squad: [{ cid: 'a', unitId: ID.ann }], enemies: [{ cid: 'e1' }] });
    expect(hit(s, { kind: 'combat_order', orderId: 'fall_back', targetCid: 'a' })?.expectationId).toBe('e_obey_oversight');
    expect(hit(s, { kind: 'combat_order', orderId: 'steady', targetCid: 'a' })).toBeNull();
  });

  it('meet_quota: rest or mess while a mission is due within 2 days; work is never in conflict', () => {
    const s = only('meet_quota');
    expect(hit(s, { kind: 'activity', activityId: 'rest' })).toBeNull(); // no mission on the board
    s.missions.offered.push({ id: 'm1', deadlineDay: s.day + 3 } as never);
    expect(hit(s, { kind: 'activity', activityId: 'rest' })).toBeNull();
    s.missions.offered[0].deadlineDay = s.day + 2;
    expect(hit(s, { kind: 'activity', activityId: 'rest' })?.expectationId).toBe('e_meet_quota');
    expect(hit(s, { kind: 'activity', activityId: 'mess' })?.expectationId).toBe('e_meet_quota');
    expect(hit(s, { kind: 'activity', activityId: 'work' })).toBeNull();
    expect(hit(s, { kind: 'activity', activityId: 'train' })).toBeNull();
  });

  it('no_romance_with_others: a companion in a romantic-tier state, the warden excluded', () => {
    const s = only('no_romance_with_others');
    const romantic = [...reg.relationshipStates.values()].find((st) => st.bondTier === 'romantic')!;
    s.relations[ID.cat].stateId = String(romantic.id);
    s.relations[ID.bea].stateId = String(romantic.id);
    expect(hit(s, { kind: 'activity', activityId: 'rest', companionId: ID.cat })?.expectationId).toBe('e_no_romance_with_others');
    expect(hit(s, { kind: 'activity', activityId: 'rest', companionId: ID.bea })).toBeNull();
    expect(hit(s, { kind: 'activity', activityId: 'rest', companionId: ID.ann })).toBeNull();
  });

  it('dilemma options: mercy −1 and corporate −1 axes, standing and credit costs, harm to the party', () => {
    const s = swap([ex('no_civilian_harm', 0.3), ex('obey_oversight', 0.2), ex('meet_quota', 0.2), ex('protect_squad', 0.3)]);
    s.dilemmas = { seq: 1, open: {
      id: 'd1', templateId: 't', scale: 'major', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [ID.ann, ID.cat], beatId: 'b',
      options: [
        { label: 'safe', effects: [], magnitudes: [] },
        { label: 'mercy cut', effects: [{ type: 'unit_event', event: 'sided_against', severity: 'minor', targets: 'party', valueAxes: [{ axis: 'mercy', direction: -1 }] }], magnitudes: [] },
        { label: 'corp cut', effects: [{ type: 'unit_event', event: 'sided_against', severity: 'minor', targets: 'party', valueAxes: [{ axis: 'corporate', direction: -1 }] }], magnitudes: [] },
        { label: 'pay', effects: [{ type: 'resource', resource: 'credits', amount: -20 }], magnitudes: [] },
        { label: 'standing', effects: [{ type: 'faction', factionId: s.commander.corporationId!, amount: -10 }], magnitudes: [] },
        { label: 'stress', effects: [{ type: 'party_stress', amount: 10 }], magnitudes: [] },
      ],
    } as never };
    const at = (index: number) => hit(s, { kind: 'dilemma', index })?.expectationId ?? null;
    expect(at(0)).toBeNull();
    expect(at(1)).toBe('e_no_civilian_harm');
    expect(at(2)).toBe('e_obey_oversight');
    expect(at(3)).toBe('e_meet_quota');
    expect(at(4)).toBe('e_obey_oversight'); // 0.2 vs meet_quota 0.2: the first in the list wins a tie
    expect(at(5)).toBe('e_protect_squad');
  });
});

describe('conflictOf: the weight', () => {
  it('the highest weight among the matching expectations wins', () => {
    const s = swap([ex('keep_me_close', 0.2), ex('protect_squad', 0.6)]);
    s.squad.find((u) => u.id === ID.cat)!.stress = 90;
    expect(hit(s, { kind: 'expedition', unitIds: [ID.ann, ID.cat] })).toEqual({ expectationId: 'e_protect_squad', weight: 0.6 });
  });

  it('personal never matches by rule', () => {
    const s = swap([ex('personal', 0.9, { text: 'Never leave a window open.' }), ex('meet_quota', 0.1)]);
    expect(hit(s, { kind: 'roster', activeIds: [ID.ann] })).toBeNull();
  });

  it('a judged personal matches at half (minor) or full (major) weight; none does not', () => {
    const s = swap([ex('personal', 0.4, { text: 'x' })]);
    const order: WardenOrder = { kind: 'activity', activityId: 'rest' };
    expect(conflictOf(s, reg, order, { expectationId: 'e_personal', conflict: 'minor' })).toEqual({ expectationId: 'e_personal', weight: 0.2 });
    expect(conflictOf(s, reg, order, { expectationId: 'e_personal', conflict: 'major' })).toEqual({ expectationId: 'e_personal', weight: 0.4 });
    expect(conflictOf(s, reg, order, { expectationId: 'e_personal', conflict: 'none' })).toBeNull();
  });

  it('a judged id that is not a personal expectation of her is ignored', () => {
    const s = swap([ex('personal', 0.4, { text: 'x' }), ex('meet_quota', 0.3)]);
    const order: WardenOrder = { kind: 'activity', activityId: 'rest' };
    expect(conflictOf(s, reg, order, { expectationId: 'e_meet_quota', conflict: 'major' })).toBeNull();
    expect(conflictOf(s, reg, order, { expectationId: 'nope', conflict: 'major' })).toBeNull();
  });

  it('the higher of the rule and the judge wins', () => {
    const s = swap([ex('personal', 0.9, { text: 'x' }), ex('keep_me_close', 0.3)]);
    const order: WardenOrder = { kind: 'roster', activeIds: [ID.ann] };
    expect(conflictOf(s, reg, order, { expectationId: 'e_personal', conflict: 'major' })?.expectationId).toBe('e_personal');
    expect(conflictOf(s, reg, order, { expectationId: 'e_personal', conflict: 'minor' })?.expectationId).toBe('e_personal');
    const light = swap([ex('personal', 0.4, { text: 'x' }), ex('keep_me_close', 0.5)]);
    expect(conflictOf(light, reg, order, { expectationId: 'e_personal', conflict: 'major' })?.expectationId).toBe('e_keep_me_close');
  });

  it('no warden in service, or no mode: null', () => {
    const s = only('keep_me_close');
    s.leashswap!.status = 'investigation';
    expect(hit(s, { kind: 'roster', activeIds: [ID.ann] })).toBeNull();
    const plain = only('keep_me_close');
    delete plain.leashswap;
    expect(hit(plain, { kind: 'roster', activeIds: [ID.ann] })).toBeNull();
  });
});

describe('herAlternative', () => {
  it('an activity: the same one with her as companion', () => {
    const s = only('keep_me_close');
    const alt = herAlternative(s, reg, { kind: 'activity', activityId: 'train', companionId: ID.ann }, 'e_keep_me_close');
    expect(alt.order).toEqual({ kind: 'activity', activityId: 'train', companionId: ID.bea });
    expect(alt.label).toContain('Bea');
  });

  it('an activity with no companion slot (or one she cannot join) falls to hold', () => {
    const s = only('keep_me_close');
    const alt = herAlternative(s, reg, { kind: 'activity', activityId: 'work', companionId: ID.ann }, 'e_keep_me_close');
    expect(alt.order).toBeNull();
  });

  it('meet_quota: the first activity marked quota (work); hold when work is not open', () => {
    const s = only('meet_quota');
    const alt = herAlternative(s, reg, { kind: 'activity', activityId: 'rest' }, 'e_meet_quota');
    expect(alt.order).toEqual({ kind: 'activity', activityId: 'work' });
    s.commander.injuredUntilDay = s.day + 3; // work is blocked while the commander is injured
    expect(herAlternative(s, reg, { kind: 'activity', activityId: 'rest' }, 'e_meet_quota').order).toBeNull();
  });

  it('a roster or an expedition: her in place of the last unit, or without the injured and stressed', () => {
    const s = only('keep_me_close');
    expect(herAlternative(s, reg, { kind: 'roster', activeIds: [ID.ann, ID.cat] }, 'e_keep_me_close').order).toEqual({ kind: 'roster', activeIds: [ID.ann, ID.bea] });
    const full = [ID.ann, ID.cat, ID.dee];
    const alt = herAlternative(s, reg, { kind: 'expedition', unitIds: full }, 'e_keep_me_close').order as { unitIds: string[] };
    expect(alt.unitIds).toContain(ID.bea);
    const p = only('protect_squad');
    p.squad.find((u) => u.id === ID.cat)!.stress = 80;
    expect(herAlternative(p, reg, { kind: 'expedition', unitIds: [ID.ann, ID.cat] }, 'e_protect_squad').order).toEqual({ kind: 'expedition', unitIds: [ID.ann] });
    expect(herAlternative(p, reg, { kind: 'expedition', unitIds: [ID.cat] }, 'e_protect_squad').order).toBeNull(); // nobody left: hold
  });

  it("a dilemma: her pick, else the first enabled option that does not conflict", () => {
    const s = swap([ex('no_civilian_harm', 0.5)]);
    s.dilemmas = { seq: 1, open: {
      id: 'd1', templateId: 't', scale: 'major', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [ID.ann], beatId: 'b',
      options: [
        { label: 'cut', effects: [{ type: 'unit_event', event: 'sided_against', severity: 'minor', targets: 'party', valueAxes: [{ axis: 'mercy', direction: -1 }] }], magnitudes: [] },
        { label: 'spare', effects: [], magnitudes: [] },
      ],
    } as never };
    const alt = herAlternative(s, reg, { kind: 'dilemma', index: 0 }, 'e_no_civilian_harm');
    expect(alt.order).toEqual({ kind: 'dilemma', index: 1 });
    expect(alt.label).toContain('spare');
  });

  it('combat: hold (no order is given)', () => {
    const s = only('obey_oversight');
    s.combat = fixtureCombat({ squad: [{ cid: 'a', unitId: ID.ann }], enemies: [{ cid: 'e1' }] });
    const alt = herAlternative(s, reg, { kind: 'combat_order', orderId: 'fall_back', targetCid: 'a' }, 'e_obey_oversight');
    expect(alt.order).toBeNull();
    expect(alt.label).toMatch(/hold/i);
  });

  it('no warden: hold with a plain label', () => {
    const s = only('keep_me_close');
    delete s.leashswap;
    expect(herAlternative(s, reg, { kind: 'roster', activeIds: [] }, 'x').order).toBeNull();
  });
});

describe('purity', () => {
  it('draws nothing', () => {
    const s = only('keep_me_close');
    const before = structuredClone(s.rng);
    hit(s, { kind: 'roster', activeIds: [ID.ann] });
    herAlternative(s, reg, { kind: 'roster', activeIds: [ID.ann] }, 'e_keep_me_close');
    expect(s.rng).toEqual(before);
  });
});
