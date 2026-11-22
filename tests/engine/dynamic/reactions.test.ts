import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { knowInstantly, addSign } from '../../../src/engine/dynamic/knowledge';
import { reactToDynamic } from '../../../src/engine/dynamic/reactions';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, ProfileStyle, Witness } from '../../../src/engine/dynamic/types';
import { dynamicTerm, registerProtection, standingMalus } from '../../../src/engine/dynamic/witness';
import { standingOf } from '../../../src/engine/power/standing';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
// This file is about the reaction half of the Impunity term (R14). The other half, the protection a holder's standing gives (R19, Task 38), is the exchange's and is
// tested in `exchange.test.ts`; here it is switched off so a holder in the world does not move the numbers that follow.
beforeEach(() => registerProtection(() => 0));
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Gives `id` a practice section: she enjoys restraint, takes a `witness` attitude to it and has a `style`. */
function practise(s: CampaignState, id: string, over: { witness?: Witness; style?: ProfileStyle; lead?: 'dominant' | 'balanced' | 'yielding' } = {}): void {
  unitOf(s, id).bond = {
    leadStyle: over.lead ?? 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: over.witness ?? 'indifferent' } }, style: { primary: over.style ?? 'cold' }, audience: 'indifferent',
      inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    },
  };
}

/** Ann holds at `frame` with `hold`; everybody else is an observer with the witness attitude `witness`. */
function world(frame: Frame, witness: Witness, over: { holders?: 'any' | 1; hold?: number } = {}): CampaignState {
  const s = campaign(reg, 4);
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: over.holders ?? 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.day = 20;
  s.slot = 'morning';
  practise(s, ANN, { witness: 'indifferent' });
  for (const id of [BEA, CAT, DEE]) practise(s, id, { witness, lead: 'balanced' });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold: over.hold ?? 50 };
  return s;
}
const know = (s: CampaignState, observer = BEA) => knowInstantly(s, ctxOf(s, reg), observer, ANN, 'holder_tells');
const facts = (s: CampaignState) => s.memory.facts.filter((f) => f.tags.includes('dynamic_knowledge'));

describe('what a woman does when she knows', () => {
  it('drawn and eligible: her own hold +5', () => {
    const s = world('role', 'drawn');
    practise(s, BEA, { witness: 'drawn', lead: 'dominant' }); // a dominant woman may come to hold
    const events = know(s);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hold_changed', unitId: BEA, cause: 'witness_drawn' }));
    expect(dynamicOf(s, BEA)!.hold).toBeGreaterThanOrEqual(4);
    expect(dynamicOf(s, BEA)!.hold).toBeLessThanOrEqual(6); // 5 times her compatibility with the style
  });

  it('drawn at the cap: nothing', () => {
    const s = world('play', 'drawn', { holders: 1 }); // Ann already holds at play: the one place is taken
    practise(s, BEA, { witness: 'drawn', lead: 'dominant' });
    const events = know(s);
    expect(dynamicOf(s, BEA)).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(['dynamic_known']);
  });

  it('indifferent: a fact only', () => {
    const s = world('role', 'indifferent');
    const before = impunityOf(s, reg, BEA)!.value;
    const events = know(s);
    expect(events.map((e) => e.type)).toEqual(['dynamic_known']);
    expect(facts(s)).toHaveLength(1);
    expect(dynamicOf(s, BEA)).toBeUndefined();
    expect(impunityOf(s, reg, BEA)!.value).toBe(before);
    expect(dynamicTerm(s, reg, BEA)).toBe(0);
    expect(s.discipline?.demands ?? []).toEqual([]);
  });

  it('dislikes: Impunity term +5, the holder\'s standing -5, and a hashed demand about it', () => {
    const s = world('role', 'dislikes');
    const impunity = impunityOf(s, reg, BEA)!;
    const standing = standingOf(s, reg, ANN)!;
    know(s);
    const after = impunityOf(s, reg, BEA)!;
    expect(after.terms.dynamic).toBe(5);
    expect(after.value).toBe(impunity.value + 5);
    expect(standingOf(s, reg, ANN)).toBe(standing - 5);
    expect(dynamicTerm(s, reg, BEA)).toBe(5);
    expect(dynamicTerm(s, reg, CAT)).toBe(0); // she does not know
    // a second witness takes another 5 off the holder
    know(s, CAT);
    expect(standingOf(s, reg, ANN)).toBe(standing - 10);
  });

  it('with the practice categories turned off mid-campaign the term and the malus go quiet, and come back with them (review M4)', () => {
    const s = world('role', 'dislikes');
    know(s);
    expect(dynamicTerm(s, reg, BEA)).toBe(5);
    expect(standingMalus(s, reg, ANN)).toBe(5);
    const impunity = impunityOf(s, reg, BEA)!.value;
    const standing = standingOf(s, reg, ANN)!;
    s.content = { enabled: [] };
    expect(dynamicTerm(s, reg, BEA)).toBe(0);
    expect(standingMalus(s, reg, ANN)).toBe(0);
    expect(impunityOf(s, reg, BEA)!.value).toBe(impunity - 5);
    expect(standingOf(s, reg, ANN)).toBe(standing + 5);
    s.content = { enabled: ['restraint'] };
    expect(dynamicTerm(s, reg, BEA)).toBe(5);
  });

  it('the demand about it is hashed: one day in three, the same on the same day, no rng draw', () => {
    const asked: number[] = [];
    for (let day = 1; day <= 36; day++) {
      const s = world('role', 'dislikes');
      s.day = day;
      const before = JSON.stringify(s.rng);
      know(s);
      expect(JSON.stringify(s.rng)).toBe(before);
      const demand = (s.discipline?.demands ?? []).find((d) => d.unitId === BEA);
      if (demand !== undefined) {
        asked.push(day);
        expect(reg.demandTemplates.get(demand.templateId)?.kind).toBe('interpersonal');
      }
      const again = world('role', 'dislikes');
      again.day = day;
      know(again);
      expect((again.discipline?.demands ?? []).some((d) => d.unitId === BEA)).toBe(demand !== undefined); // the same seed, the same day
    }
    expect(asked.length).toBeGreaterThan(4);
    expect(asked.length).toBeLessThan(20);
  });

  it('the demand about it keeps the roll\'s own limits: not while two are open in the squad, not in her acquaintance period (review M6)', () => {
    let day = 0;
    for (let d = 1; d <= 36 && day === 0; d++) {
      const s = world('role', 'dislikes');
      s.day = d;
      know(s);
      if ((s.discipline?.demands ?? []).some((x) => x.unitId === BEA)) day = d;
    }
    expect(day).toBeGreaterThan(0); // a day she asks
    const crowded = world('role', 'dislikes');
    crowded.day = day;
    crowded.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [
      { id: 'd90', unitId: CAT, templateId: 'double_ration', text: 't', day, expiresDay: day + 2, status: 'open', impunityDriven: false },
      { id: 'd91', unitId: DEE, templateId: 'double_ration', text: 't', day, expiresDay: day + 2, status: 'open', impunityDriven: false },
    ], demandLog: [] } as unknown as CampaignState['discipline'];
    know(crowded);
    expect((crowded.discipline?.demands ?? []).some((x) => x.unitId === BEA)).toBe(false);
    const fresh = world('role', 'dislikes');
    fresh.day = day;
    fresh.world.options = { ...(fresh.world.options ?? {}), acquaintance: 'd14' };
    fresh.relations[BEA].metDay = day - 1; // she met the commander yesterday
    know(fresh);
    expect((fresh.discipline?.demands ?? []).some((x) => x.unitId === BEA)).toBe(false);
    const known = world('role', 'dislikes');
    known.day = day;
    known.world.options = { ...(known.world.options ?? {}), acquaintance: 'd14' };
    known.relations[BEA].metDay = day - 30; // a month ago: she asks as before
    know(known);
    expect((known.discipline?.demands ?? []).some((x) => x.unitId === BEA)).toBe(true);
  });

  it('a possessive holder who learns of another competes: a claim against a domain she could claim herself', () => {
    const s = world('role', 'indifferent', { hold: 70 });
    s.relations[ANN].dynamic!.domains = [{ id: 'private_time', since: 1 }, { id: 'command', since: 2 }];
    practise(s, BEA, { style: 'possessive', lead: 'dominant' });
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
    const events = know(s);
    const fight = events.filter((e) => e.type === 'domain_contested');
    // the command is only ever handed over by a milestone, and the rest need more than she has: private time is the one she could ask for
    expect(fight).toHaveLength(1);
    expect(fight[0]).toMatchObject({ domainId: 'private_time', claimantId: BEA, holderId: ANN });
  });

  it('a play competitor against a rule holder with the command takes nothing', () => {
    const s = world('rule', 'indifferent', { hold: 85 });
    s.relations[ANN].dynamic!.domains = [{ id: 'command', since: 2 }, { id: 'device', since: 3 }, { id: 'body', since: 3 }];
    practise(s, BEA, { style: 'possessive', lead: 'dominant' });
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
    const events = know(s);
    expect(events.some((e) => e.type === 'domain_contested')).toBe(false);
    expect(dynamicOf(s, ANN)!.domains.map((d) => d.id)).toEqual(['command', 'device', 'body']);
    expect(dynamicOf(s, BEA)!.domains).toEqual([]);
    expect(dynamicOf(s, ANN)!.hold).toBe(85); // she lost nothing
    expect(facts(s).some((f) => /wants what/.test(f.text))).toBe(true); // her intent is still a fact
    // a rival at role with the hold for it takes a domain that can be claimed, but still never the command
    const strong = world('rule', 'indifferent', { hold: 85 });
    strong.relations[ANN].dynamic!.domains = [{ id: 'command', since: 2 }, { id: 'body', since: 3 }];
    practise(strong, BEA, { style: 'possessive', lead: 'dominant' });
    strong.relations[BEA].dynamic = { ...blankDynamic(strong.day), frame: 'role', hold: 60 };
    const fight = know(strong).filter((e) => e.type === 'domain_contested');
    expect(fight.map((e) => e.domainId)).toEqual(['body']);
    expect(dynamicOf(strong, ANN)!.domains.map((d) => d.id)).toContain('command');
  });

  it('a ritual holder respects it: a fact, no claim', () => {
    const s = world('role', 'indifferent', { hold: 70 });
    s.relations[ANN].dynamic!.domains = [{ id: 'private_time', since: 1 }];
    practise(s, BEA, { style: 'ritual', lead: 'dominant' });
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
    const events = know(s);
    expect(events.some((e) => e.type === 'domain_contested')).toBe(false);
    expect(facts(s)).toHaveLength(2); // what she knows, and that she respects it
    expect(facts(s).every((f) => f.hiddenFromCommander === true && f.knownBy.join() === BEA)).toBe(true);
    expect(dynamicOf(s, ANN)!.domains).toHaveLength(1);
  });

  it('reactToDynamic does nothing while the dynamic is off, or for the holder herself', () => {
    const s = world('role', 'dislikes');
    expect(reactToDynamic(s, ctxOf(s, reg), ANN, ANN)).toEqual([]);
    s.dynamic!.setup.holders = 0;
    expect(reactToDynamic(s, ctxOf(s, reg), BEA, ANN)).toEqual([]);
    expect(dynamicTerm(s, reg, BEA)).toBe(0);
  });
});

describe('impunityOf without a dynamic', () => {
  it('is unchanged: no dynamic term, the same sum', () => {
    const s = world('role', 'dislikes');
    delete s.dynamic;
    const plain = impunityOf(s, reg, BEA)!;
    expect(plain.terms.dynamic).toBeUndefined();
    expect(Object.keys(plain.terms).sort()).toEqual(['base', 'contagion', 'dependency', 'held', 'leash', 'leverage', 'presence', 'record']);
    const withBlock = world('role', 'dislikes'); // a dynamic nobody knows of yet adds nothing either
    expect(impunityOf(withBlock, reg, BEA)).toEqual(plain);
  });
});

describe('the witness directive', () => {
  const witnessOf = (s: CampaignState, present: string[], id = BEA) => dynamicDirectives(s, reg, present).find((d) => d.id === `dynamic:witness:${id}`);

  it('is cautious at suspects and full at knows, by her profile', () => {
    const s = world('role', 'dislikes');
    expect(witnessOf(s, [BEA, ANN])).toBeUndefined(); // she has noticed nothing
    for (let i = 0; i < 3; i++) addSign(s, ctxOf(s, reg), BEA, ANN, 'protocol_slip');
    const careful = witnessOf(s, [BEA, ANN])!;
    expect(careful.text).toMatch(/suspects/);
    expect(careful.text).toMatch(/cautious/);
    expect(careful.text).not.toMatch(/dislikes it/);
    know(s);
    const full = witnessOf(s, [BEA, ANN])!;
    expect(full.text).toMatch(/knows/);
    expect(full.text).toMatch(/dislikes it/);
    expect(full.expiresAfter).toBe('scene');
    const drawn = world('role', 'drawn');
    know(drawn);
    expect(witnessOf(drawn, [BEA, ANN])!.text).toMatch(/drawn to it/);
  });

  it('only while she is in the room (the holder or the commander with her)', () => {
    const s = world('role', 'dislikes');
    know(s);
    expect(witnessOf(s, [])).toBeUndefined(); // no scene: nobody is present
    expect(witnessOf(s, [CAT])).toBeUndefined(); // another woman, who knows nothing
    expect(witnessOf(s, [BEA])).toBeDefined(); // she is with the commander
    expect(witnessOf(s, [BEA, ANN])).toBeDefined(); // she is with the holder
  });

  it('names no pronoun for the commander', () => {
    const s = world('role', 'dislikes');
    know(s);
    const text = witnessOf(s, [BEA, ANN])!.text;
    expect(text).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('nothing while the dynamic is off', () => {
    const s = world('role', 'dislikes');
    know(s);
    s.dynamic!.setup.holders = 0;
    expect(witnessOf(s, [BEA, ANN])).toBeUndefined();
  });
});

describe('the draft marker stays in the data and never reaches a fact or a directive (P15 follow-up to review M10)', () => {
  const MARK = /AUTHOR TO WRITE/;

  it('the facts of what a woman knows and how she reacts and the witness directive are plain; the memory rules of the dynamic keep the marker in the data', () => {
    // the three levels of knowledge, and a reaction fact of each kind
    const s = world('role', 'indifferent');
    for (let i = 0; i < 3; i++) addSign(s, ctxOf(s, reg), BEA, ANN, 'protocol_slip');
    know(s);
    expect(facts(s).length).toBeGreaterThanOrEqual(2);
    for (const f of facts(s)) expect(f.text, f.text).not.toMatch(MARK);
    const rival = world('role', 'indifferent', { hold: 70 });
    rival.relations[ANN].dynamic!.domains = [{ id: 'private_time', since: 1 }];
    practise(rival, BEA, { style: 'ritual', lead: 'dominant' });
    rival.relations[BEA].dynamic = { ...blankDynamic(rival.day), frame: 'play', hold: 45 };
    know(rival);
    expect(facts(rival).filter((f) => f.tags.includes('reaction')).length).toBeGreaterThan(0);
    for (const f of facts(rival)) expect(f.text, f.text).not.toMatch(MARK);
    // the witness directive: every line of it
    const d = dynamicDirectives(s, reg, [BEA, ANN]).find((x) => x.id === 'dynamic:witness:unit_bea')!;
    expect(d.text).not.toMatch(MARK);
    // the memory rules the dynamic added are drafts in the data (authors search for the marker); the fact a rule writes drops it
    for (const id of ['dynamic_frame_play', 'dynamic_frame_role', 'dynamic_frame_rule', 'dynamic_sworn', 'dynamic_domain_yielded', 'dynamic_break', 'dynamic_ended', 'aftermath_return_refused']) {
      expect(String(reg.memoryRules.get(id)?.text), id).toMatch(/^AUTHOR TO WRITE: /);
    }
  });
});
