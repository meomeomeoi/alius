import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import { presenceOf, matchedTastes } from '../../../src/engine/commander/presence';
import { aftermathWeights } from '../../../src/engine/dynamic/aftermath';
import { dynamicDayStep } from '../../../src/engine/dynamic/dayStep';
import { regardBandOf, regardDayStep, regardFall, regardFeed, regardFromEvents, regardOf, regardRise, regardStart, regardTone, ensureRegard, squadRegardAverage } from '../../../src/engine/dynamic/regard';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, ProfileStyle } from '../../../src/engine/dynamic/types';
import { dynamicTerm, standingMalus } from '../../../src/engine/dynamic/witness';
import { applyEventToUnit } from '../../../src/engine/relations/effects';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, ctxOf, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const bond = (primary: ProfileStyle) => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});

/** Ann practises in `style` and holds at `frame`; Bea and Cat have no practice section. */
function world(style: ProfileStyle = 'cold', frame: Frame = 'play'): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = bond(style);
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold: 50 };
  return s;
}
const regard = (s: CampaignState, id = ANN): number | undefined => s.relations[id].regard;
const types = (events: Array<{ type: string }>) => events.map((e) => e.type);

describe('the start value', () => {
  it('is 50 plus the first impression (the Presence times her tastes, halved, at most 15)', () => {
    const s = world();
    const mult = matchedTastes(s, reg, unitOf(s, BEA)).reduce((m, t) => m * (typeof t.presenceMult === 'number' ? t.presenceMult : 1), 1);
    const expected = 50 + Math.min(15, Math.max(-15, presenceOf(s, reg) * mult * 0.5));
    expect(regardStart(s, reg, BEA)).toBeCloseTo(expected, 3);
    expect(regardOf(s, reg, BEA)).toBe(regardStart(s, reg, BEA));
    expect(regard(s, BEA)).toBeUndefined(); // reading it writes nothing
  });

  it('is 10 lower when she knows a crime her values read as bad, and only then', () => {
    const s = world();
    s.commander.crimeId = 'liquidation'; // sacrifice + and ingroup + are bad
    const base = regardStart(s, reg, ANN);
    unitOf(s, ANN).values.sacrifice = 1;
    expect(regardStart(s, reg, ANN)).toBe(base); // she does not know it
    s.relations[ANN].flags.push('knows_crime');
    expect(regardStart(s, reg, ANN)).toBeCloseTo(base - 10, 3);
    unitOf(s, ANN).values.sacrifice = -1; // the crime's reaction does not touch her
    expect(regardStart(s, reg, ANN)).toBe(base);
  });

  it('is written once, by ensureRegard, while the dynamic is on', () => {
    const s = world();
    const n = ensureRegard(s, reg, BEA);
    expect(regard(s, BEA)).toBe(n);
    s.relations[BEA].regard = 70;
    expect(ensureRegard(s, reg, BEA)).toBe(70);
  });
});

describe('the bands and the tone', () => {
  it('reads the five bands from the registry', () => {
    expect([100, 80, 79.5, 60, 59, 40, 39.9, 20, 19, 0].map((n) => regardBandOf(reg, n))).toEqual(['esteem', 'esteem', 'respect', 'respect', 'neutral', 'neutral', 'low', 'low', 'none', 'none']);
  });

  it("the tone word is the style's form at low or none and absent above", () => {
    const s = world('cruel');
    for (const [n, form] of [[90, null], [65, null], [45, null], [30, 'contempt, enjoyed'], [5, 'contempt, enjoyed']] as const) {
      s.relations[ANN].regard = n;
      expect(regardTone(s, reg, ANN), String(n)).toBe(form);
    }
    s.relations[BEA].regard = 5;
    expect(regardTone(s, reg, BEA)).toBeNull(); // no style, no form
    s.relations[ANN].regard = 5;
    s.dynamic = undefined;
    expect(regardTone(s, reg, ANN)).toBeNull(); // off
  });

  it('reaches the holder directive as a phrase, never as a number', () => {
    const s = world('cruel');
    s.scene = { id: 'sc1', participants: [ANN] } as unknown as CampaignState['scene'];
    s.relations[ANN].regard = 55;
    const line = (n: number) => { s.relations[ANN].regard = n; return dynamicDirectives(s, reg, [ANN]).find((d) => d.id === `dynamic:${ANN}`)?.text ?? ''; };
    expect(line(55)).not.toContain('Her tone toward the commander');
    expect(line(25)).toContain('Her tone toward the commander: contempt, enjoyed.');
    expect(line(25)).not.toMatch(/\d{2}/);
  });
});

describe('the falls', () => {
  it('a cruel holder: humiliation 3 is 3 x 1.5 x 1.3 x 1.3 = 7.605', () => {
    const s = world('cruel');
    s.relations[ANN].regard = 50;
    const events = regardFall(s, reg, ANN, 3, { witness: false });
    expect(regard(s)).toBeCloseTo(50 - 7.605, 4);
    expect(events[0]).toMatchObject({ type: 'regard_changed', unitId: ANN, from: 50, cause: 'act' });
  });

  it('a witness counts 0.7 of it', () => {
    const s = world('cruel');
    s.relations[ANN].regard = 50;
    regardFall(s, reg, ANN, 3, { witness: true });
    expect(regard(s)).toBeCloseTo(50 - 7.605 * 0.7, 4);
  });

  it('never goes below the style floor (possessive 35), and never lifts a value already under it', () => {
    const s = world('possessive');
    s.relations[ANN].regard = 40;
    regardFall(s, reg, ANN, 5, { witness: false });
    expect(regard(s)).toBeCloseTo(40 - 5 * 1.5 * 0.4 * 0.4, 4); // very slow, and barely matters to her
    for (let i = 0; i < 6; i++) regardFall(s, reg, ANN, 5, { witness: false });
    expect(regard(s)).toBe(35);
    expect(regardFall(s, reg, ANN, 5, { witness: false })).toEqual([]);
    s.relations[ANN].regard = 20;
    regardFall(s, reg, ANN, 5, { witness: false });
    expect(regard(s)).toBe(20);
  });

  it('a woman with no practice section falls at factor 1, speed normal, floor 0', () => {
    const s = world();
    s.relations[BEA].regard = 50;
    regardFall(s, reg, BEA, 2, { witness: false });
    expect(regard(s, BEA)).toBe(47);
  });

  it('writes the start first when nothing was stored, and says when a band is crossed', () => {
    const s = world('cold');
    s.relations[ANN].regard = 61;
    const events = regardFall(s, reg, ANN, 2, { witness: false }); // 2 x 1.5 x 1.2 x 1.3 = 4.68
    expect(types(events)).toEqual(['regard_changed', 'regard_band_changed']);
    expect(events[1]).toMatchObject({ from: 'respect', to: 'neutral' });
    const fresh = world('cold');
    regardFall(fresh, reg, ANN, 1, { witness: false });
    expect(regard(fresh)).toBeCloseTo(regardStart(fresh, reg, ANN) - 1.5 * 1.2 * 1.3, 3);
  });
});

describe('the rises', () => {
  it("cost +3, and only when her reading's readiness is 0 or less", () => {
    const s = world();
    s.relations[ANN].regard = 50;
    dynamicOf(s, ANN)!.readOf.r = 0.4;
    expect(regardRise(s, reg, ANN, 'cost')).toEqual([]);
    dynamicOf(s, ANN)!.readOf.r = 0;
    regardRise(s, reg, ANN, 'cost');
    expect(regard(s)).toBe(53);
    s.relations[BEA].regard = 50; // no reading of the commander at all
    expect(regardRise(s, reg, BEA, 'cost')).toEqual([]);
  });

  it('record +2 on marathon_done (not one the stop word ended), dignity +2 on a clean released, a feat +3, a run won +2, a quiet meeting +1, a kept promise +2', () => {
    const s = world();
    for (const id of [ANN, BEA, CAT]) s.relations[id].regard = 50;
    const at = (events: Array<{ type: string; [k: string]: unknown }>) => { regardFromEvents(s, reg, events); return regard(s); };
    expect(at([{ type: 'marathon_done', unitId: ANN, result: 'stopped', hours: 1 }])).toBe(50);
    expect(at([{ type: 'marathon_done', unitId: ANN, result: 'released', hours: 1 }])).toBe(52);
    expect(at([{ type: 'physics_outcome', runId: 'p1', holderId: ANN, result: 'released' }])).toBe(54);
    expect(at([{ type: 'physics_outcome', runId: 'p2', holderId: ANN, result: 'blackout' }])).toBe(54);
    expect(at([{ type: 'outside_feat', featId: 'f' }])).toBe(57);
    expect(regard(s, BEA)).toBe(53); // everyone saw the feat
    s.lastExpedition = { id: 'r1', party: [ANN, CAT] } as unknown as CampaignState['lastExpedition'];
    expect(at([{ type: 'expedition_ended', outcome: 'failed', reportId: 'r1' }])).toBe(57);
    expect(at([{ type: 'expedition_ended', outcome: 'success', reportId: 'r1' }])).toBe(59);
    expect(regard(s, BEA)).toBe(53); // not in the party
    expect(regard(s, CAT)).toBe(55);
    const ev = (type: string): EventIntent => ({ type, actor: 'commander', targets: [BEA], severity: 'minor', evidence: 'x', confidence: 1 } as EventIntent);
    applyEventToUnit(s, reg, BEA, ev('time_together'));
    expect(regard(s, BEA)).toBe(54);
    applyEventToUnit(s, reg, BEA, ev('kept_promise'));
    expect(regard(s, BEA)).toBe(56);
    regardFeed(s, reg, BEA, { type: 'kept_promise', actor: BEA });
    expect(regard(s, BEA)).toBe(56); // only the commander's own
  });

  it('a slip or a caught cheat falls for the one who held the commander and spoils the clean end of its run', () => {
    const s = world('ritual');
    s.relations[ANN].regard = 60;
    regardFromEvents(s, reg, [
      { type: 'physics_started', runId: 'p1', holderId: ANN },
      { type: 'physics_slip', runId: 'p1', holderId: ANN, kind: 'slip' },
      { type: 'physics_caught', runId: 'p1', holderId: ANN, kind: 'cheat' },
      { type: 'physics_outcome', runId: 'p1', holderId: ANN, result: 'released' },
    ]);
    expect(regard(s)).toBeCloseTo(60 - 1 * 1.5 - 2 * 1.5, 4); // ritual: factor 1, speed normal
    expect(s.dynamic!.noted?.dirtyRun).toBeUndefined();
    regardFromEvents(s, reg, [{ type: 'physics_started', runId: 'p1', holderId: ANN }, { type: 'physics_outcome', runId: 'p1', holderId: ANN, result: 'checked' }]);
    expect(regard(s)).toBeCloseTo(60 - 4.5 + 2, 4); // the next run of the same id is clean
  });

  it('drill doubles the rises that are mastery (a record, a high pleased) and no other', () => {
    const s = world('drill');
    s.relations[ANN].regard = 50;
    regardRise(s, reg, ANN, 'record');
    expect(regard(s)).toBe(54);
    regardRise(s, reg, ANN, 'pleased_high');
    expect(regard(s)).toBe(56);
    regardRise(s, reg, ANN, 'dignity');
    expect(regard(s)).toBe(58);
    const plain = world('cold');
    plain.relations[ANN].regard = 50;
    regardRise(plain, reg, ANN, 'record');
    expect(regard(plain)).toBe(52);
  });

  it('a value rise is held to 1 to 4', () => {
    const s = world();
    s.relations[BEA].regard = 50;
    regardRise(s, reg, BEA, 'value', 9);
    expect(regard(s, BEA)).toBe(54);
    regardRise(s, reg, BEA, 'value', 0);
    expect(regard(s, BEA)).toBe(55);
    regardRise(s, reg, BEA, 'value');
    expect(regard(s, BEA)).toBe(56);
  });

  it('vindictive: +1 for each week served without a slip, and a slip starts the count over', () => {
    const s = world('vindictive');
    s.relations[ANN].regard = 50;
    const step = (n: number) => { for (let i = 0; i < n; i++) { s.day += 1; dynamicDayStep(s, ctxOf(s, reg)); } };
    step(1); // the step sees her for the first time
    expect(dynamicOf(s, ANN)!.served).toEqual({ since: s.day });
    step(7);
    expect(regard(s)).toBe(51);
    step(3);
    regardFromEvents(s, reg, [{ type: 'physics_slip', runId: 'p9', holderId: ANN, kind: 'slip' }]);
    const after = regard(s)!;
    step(6);
    expect(regard(s)).toBe(after);
    step(1);
    expect(regard(s)).toBe(after + 1);
    // a style that does not count served days gets nothing
    const cold = world('cold');
    cold.relations[ANN].regard = 50;
    for (let i = 0; i < 20; i++) { cold.day += 1; dynamicDayStep(cold, ctxOf(cold, reg)); }
    expect(regard(cold)).toBe(50);
    expect(regardDayStep(cold, reg, [BEA])).toEqual([]);
  });
});

describe('what Regard does not do', () => {
  it('never changes hold or frame, and emits no hold event', () => {
    const s = world('cruel');
    s.relations[ANN].regard = 50;
    const events = [...regardFall(s, reg, ANN, 5, { witness: false }), ...regardRise(s, reg, ANN, 'value', 4), ...regardRise(s, reg, ANN, 'record')];
    expect(types(events).filter((t) => t.startsWith('hold') || t === 'frame_changed')).toEqual([]);
    expect(dynamicOf(s, ANN)).toMatchObject({ hold: 50, frame: 'play' });
  });

  it('off: nothing is written, nothing answers', () => {
    const s = world('cruel');
    s.dynamic = undefined;
    expect(regardFall(s, reg, ANN, 5, { witness: false })).toEqual([]);
    expect(regardRise(s, reg, ANN, 'value', 4)).toEqual([]);
    expect(regardFromEvents(s, reg, [{ type: 'outside_feat', featId: 'f' }, { type: 'marathon_done', unitId: ANN, result: 'released' }])).toEqual([]);
    ensureRegard(s, reg, ANN);
    const ev = { type: 'kept_promise', actor: 'commander', targets: [BEA], severity: 'minor', evidence: 'x', confidence: 1 } as EventIntent;
    applyEventToUnit(s, reg, BEA, ev);
    expect(JSON.stringify(s)).not.toContain('"regard"');
    expect(squadRegardAverage(s, reg)).toBeNull();
    expect(dynamicDayStep(s, ctxOf(s, reg))).toEqual([]);
  });
});

describe('what reads it', () => {
  it("the aftermath weights read her Regard band (low raises cold_contempt, high raises grief and return_offer)", () => {
    const s = world('affectionate', 'role');
    dynamicOf(s, ANN)!.formerHolder = { endedDay: s.day, frame: 'role', sworn: false, successor: '' };
    dynamicOf(s, ANN)!.frame = 'equal';
    const weights = () => aftermathWeights(s, reg, ANN, { route: 'abrupt', clean: false, force: false });
    s.relations[ANN].regard = 50;
    const neutral = weights();
    s.relations[ANN].regard = 25;
    const low = weights();
    s.relations[ANN].regard = 90;
    const high = weights();
    expect(low.cold_contempt).toBeCloseTo(neutral.cold_contempt * 1.5, 6);
    expect(high.grief).toBeCloseTo(neutral.grief * 1.5, 6);
    expect(high.return_offer).toBeCloseTo(neutral.return_offer * 1.5, 6);
  });

  it('a witness who dislikes counts 1.5 times while her Regard is low or none (her Impunity term, the holder standing)', () => {
    const s = world('cold');
    s.dynamic!.knowledge[BEA] = { [ANN]: { suspicion: 100, level: 'knows_dynamic' } };
    unitOf(s, BEA).bond = bond('cold');
    unitOf(s, BEA).bond!.practice!.categories.restraint.witness = 'dislikes';
    s.relations[BEA].regard = 60;
    const dTerm = dynamicTerm(s, reg, BEA);
    expect(dTerm).toBe(TUNING.squadKnowledge.reaction.dislikesImpunity);
    const malus = standingMalus(s, reg, ANN);
    s.relations[BEA].regard = 25;
    expect(dynamicTerm(s, reg, BEA)).toBe(Math.round(dTerm * TUNING.regard.dislikes));
    expect(standingMalus(s, reg, ANN)).toBe(Math.round(malus * TUNING.regard.dislikes));
    s.relations[BEA].regard = 5;
    expect(dynamicTerm(s, reg, BEA)).toBe(Math.round(dTerm * TUNING.regard.dislikes));
  });
});
