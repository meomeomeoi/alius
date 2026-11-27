import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/development';
import { dynamicDirectives } from '../../src/dynamic/directives';
import { mannerProposals, turnRead } from '../../src/engine/development/mannerDrift';
import { momentDirective, stampMoments } from '../../src/engine/development/moments';
import { applyReview, eligibleAxes, fallbackReview, undoReview, validateReview } from '../../src/engine/development/review';
import { developmentOf, ensureDevelopment } from '../../src/engine/development/state';
import { changedAxes } from '../../src/engine/development/words';
import { holderAgenda } from '../../src/engine/dynamic/command';
import { addHold, compatibilityOf } from '../../src/engine/dynamic/hold';
import { mannerOf } from '../../src/engine/dynamic/manner';
import { requiresMet } from '../../src/engine/dynamic/milestones';
import { answerProbe } from '../../src/engine/dynamic/probes';
import { styleOf } from '../../src/engine/dynamic/profile';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { aftermathWeights, runAftermathEffect } from '../../src/engine/dynamic/aftermath';
import { MANNER_AXES, type DynamicMilestoneEntry, type MannerAxis, type ProfileStyle } from '../../src/engine/dynamic/types';
import { consentProblem } from '../../src/engine/personal/bookings';
import type { CampaignState, Unit } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const BEA = 'unit_bea';
const unitOf = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const dynOf = (s: CampaignState) => s.relations[ANN].dynamic!;
const T = TUNING.manner.turn;
const ZERO = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const placeOf = (id: string): Record<MannerAxis, number> => (reg.practiceStyles.get(id) as unknown as { manner: Record<MannerAxis, number> }).manner;

interface Over { style?: ProfileStyle; secondary?: ProfileStyle; manner?: Partial<typeof ZERO>; overlay?: Partial<typeof ZERO>; since?: number; turnedTo?: ProfileStyle; romantic?: boolean }
/** Ann holds; her import says `style` (and `manner`), her drift overlay `overlay` / a turn to `turnedTo`; her dynamic has run `since` days at play. */
function world(o: Over = {}): CampaignState {
  const s = campaign(reg, 3);
  s.day = 200;
  s.settings.characterDevelopment = 'normal';
  for (const id of [ANN, BEA]) setRelation(s, id, { stateId: o.romantic === true ? 'lover' : 'comrade' });
  unitOf(s).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: o.style ?? 'affectionate', ...(o.secondary !== undefined ? { secondary: o.secondary } : {}) }, audience: 'indifferent',
      inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate', manner: { ...ZERO, ...o.manner }, drawnBy: ['reaction'],
    },
  };
  unitOf(s).values.mercy = 0;
  if (o.overlay !== undefined || o.turnedTo !== undefined) ensureDevelopment(unitOf(s)).practice = { ...(o.overlay !== undefined ? { manner: o.overlay } : {}), ...(o.turnedTo !== undefined ? { primary: o.turnedTo } : {}) };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  const since = o.since ?? 100;
  s.relations[ANN].dynamic = { ...blankDynamic(s.day - since), frame: 'play', hold: 30, playSince: s.day - since };
  return s;
}
/** The arc of the spec: intensity +2, warmth -2, order +2 over an affectionate style (her place is 2 from regal, 6 from affectionate). */
const ARC = { intensity: 2, warmth: -2, order: 2 };
const review = (s: CampaignState): void => { applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback'); };
const axesOf = (s: CampaignState) => mannerOf(s, reg, ANN)!.axes;
const absolute = (s: CampaignState): number[] => {
  const place = placeOf(styleOf(unitOf(s))!.primary);
  return MANNER_AXES.map((a) => place[a] + axesOf(s)[a]);
};

describe('the turn of her style (spec §7)', () => {
  it('the places of the styles are the spec\'s, and the arc is 2 from regal and 6 from affectionate', () => {
    const s = world({ overlay: ARC });
    const read = turnRead(reg, unitOf(s))!;
    expect(read.to).toBe('regal');
    expect([read.own, read.near]).toEqual([6, 2]);
    expect(read.abs).toEqual({ intensity: 1, warmth: 1, order: 2, voice: 1, tempo: -1, curiosity: 0 });
  });

  it('the arc turns to regal after two qualifying reviews and 56 days, and her place does not jump', () => {
    const s = world({ overlay: ARC, since: 70 });
    const before = absolute(s);
    expect(mannerProposals(s, reg, unitOf(s))).toEqual([]);
    review(s); // the first qualifying review only counts
    expect(styleOf(unitOf(s))!.primary).toBe('affectionate');
    expect(dynOf(s).mannerTurn).toMatchObject({ candidate: 'regal', reviews: 1 });
    s.day += 7;
    expect(mannerProposals(s, reg, unitOf(s)).map((p) => p.axis)).toEqual(['manner:turn']);
    expect(eligibleAxes(s, reg, unitOf(s))).toContainEqual({ axis: 'manner:turn', direction: 'up', support: 'strong', proposed: true });
    const events = applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback');
    expect(events.filter((e) => e.type === 'development_moment')).toHaveLength(1);
    expect(styleOf(unitOf(s))).toEqual({ primary: 'regal', secondary: 'affectionate' });
    expect(unitOf(s).bond!.practice!.style).toEqual({ primary: 'affectionate' }); // the import is untouched
    expect(axesOf(s)).toEqual({ intensity: 0, warmth: 1, order: 0, voice: 0, tempo: 0, curiosity: 1 });
    expect(absolute(s)).toEqual(before); // the rebase
    expect(developmentOf(unitOf(s)).practice).toEqual({ manner: { warmth: 1, curiosity: 1 }, primary: 'regal', secondary: 'affectionate' });
    expect(developmentOf(unitOf(s)).moments.at(-1)).toMatchObject({ axis: 'manner:turn', from: 'affectionate', to: 'regal' });
    expect(dynOf(s).mannerTurn).toMatchObject({ reviews: 0, lastDay: s.day });
    // another turn waits for another 56 days
    s.day += 7;
    expect(mannerProposals(s, reg, unitOf(s))).toEqual([]);
  });

  it('is a quiet moment with its scene, naming the style she turned to', () => {
    const s = world({ overlay: ARC, since: 70 });
    review(s);
    s.day += 7;
    review(s);
    s.scene = { id: 'sc1', participants: [ANN], locationId: 'x' } as unknown as CampaignState['scene'];
    stampMoments(s, [ANN], 'sc1');
    const d = momentDirective(s, reg, ANN)!;
    expect(d.text).toMatch(/regal/i);
    expect(d.text).not.toMatch(/AUTHOR TO WRITE|\{style\}/);
  });

  it('one qualifying review is not enough, and a review that does not qualify ends the run', () => {
    const s = world({ overlay: ARC, since: 70 });
    review(s);
    expect(dynOf(s).mannerTurn!.reviews).toBe(1);
    s.day += 7;
    unitOf(s).development!.practice!.manner = { intensity: 1 }; // she drifted back: no longer nearer by the margin
    review(s);
    expect(dynOf(s).mannerTurn!.reviews).toBe(0);
    s.day += 7;
    unitOf(s).development!.practice!.manner = ARC;
    expect(mannerProposals(s, reg, unitOf(s))).toEqual([]);
    expect(styleOf(unitOf(s))!.primary).toBe('affectionate');
  });

  it('needs the 56 days: from playSince, and from her last turn', () => {
    const young = world({ overlay: ARC, since: T.days - 8 });
    review(young);
    young.day += 7; // 55 days
    expect(mannerProposals(young, reg, unitOf(young))).toEqual([]);
    young.day += 1;
    expect(mannerProposals(young, reg, unitOf(young)).map((p) => p.axis)).toEqual(['manner:turn']);
    const again = world({ overlay: ARC, since: 70 });
    dynOf(again).mannerTurn = { candidate: 'regal', reviews: 1, lastDay: again.day - (T.days - 1) };
    expect(mannerProposals(again, reg, unitOf(again))).toEqual([]);
    dynOf(again).mannerTurn = { candidate: 'regal', reviews: 1, lastDay: again.day - T.days };
    expect(mannerProposals(again, reg, unitOf(again)).map((p) => p.axis)).toEqual(['manner:turn']);
  });

  it('needs the margin: a place only as near to another style as to her own does not turn', () => {
    const s = world({ overlay: { intensity: 2, warmth: -2 } }); // 4 from affectionate and 4 from regal
    expect(turnRead(reg, unitOf(s))).toBeNull();
    expect(mannerProposals(s, reg, unitOf(s))).toEqual([]);
  });

  it('a former secondary that is closer stays; one that is further gives way to the former primary; the new primary was the secondary: the former primary takes its place', () => {
    const keep = world({ overlay: ARC, since: 70, secondary: 'possessive' }); // possessive is 5 from her place, affectionate 6: the secondary stays
    dynOf(keep).mannerTurn = { candidate: 'regal', reviews: 1 };
    review(keep);
    expect(styleOf(unitOf(keep))).toEqual({ primary: 'regal', secondary: 'possessive' });
    const drill = world({ overlay: ARC, since: 70, secondary: 'drill' }); // drill is 7 away: the former primary is nearer and takes its place
    dynOf(drill).mannerTurn = { candidate: 'regal', reviews: 1 };
    review(drill);
    expect(styleOf(unitOf(drill))).toEqual({ primary: 'regal', secondary: 'affectionate' });
    const swap = world({ overlay: ARC, since: 70, secondary: 'regal' });
    dynOf(swap).mannerTurn = { candidate: 'regal', reviews: 1 };
    review(swap);
    expect(styleOf(unitOf(swap))).toEqual({ primary: 'regal', secondary: 'affectionate' });
    const further = world({ overlay: ARC, since: 70, secondary: 'cold' });
    dynOf(further).mannerTurn = { candidate: 'regal', reviews: 1 };
    review(further);
    expect(styleOf(unitOf(further))).toEqual({ primary: 'regal', secondary: 'affectionate' });
  });

  it('the rebase clamps to the scale and still reads the new place', () => {
    // a cold holder far out on several axes is nearest to ritual, whose place is further than +-2 from hers on warmth: the rebase clamps
    const s = world({ style: 'cold', manner: { intensity: -2, warmth: -2, order: 1, voice: 2, tempo: -2, curiosity: -2 }, since: 70 });
    const read = turnRead(reg, unitOf(s))!;
    expect(read.to).toBe('ritual');
    dynOf(s).mannerTurn = { candidate: 'ritual', reviews: 1 };
    review(s);
    expect(styleOf(unitOf(s))!.primary).toBe('ritual');
    for (const a of MANNER_AXES) expect(axesOf(s)[a]).toBe(Math.max(-2, Math.min(2, read.abs[a] - placeOf('ritual')[a])));
    expect(axesOf(s).warmth).toBe(-2); // -4 clamped
    // the overlay is what is added to the import, so the import is untouched
    expect(unitOf(s).bond!.practice!.manner).toEqual({ intensity: -2, warmth: -2, order: 1, voice: 2, tempo: -2, curiosity: -2 });
  });

  it('a locked style or manner never turns, and UNDO takes the turn back with its counters', () => {
    for (const lock of ['style', 'manner']) {
      const s = world({ overlay: ARC, since: 70 });
      unitOf(s).practiceLocks = [lock];
      dynOf(s).mannerTurn = { candidate: 'regal', reviews: 1 };
      expect(mannerProposals(s, reg, unitOf(s)).map((p) => p.axis)).not.toContain('manner:turn');
    }
    const s = world({ overlay: ARC, since: 70 });
    dynOf(s).mannerTurn = { candidate: 'regal', reviews: 1 };
    const turnBefore = structuredClone(dynOf(s).mannerTurn);
    review(s);
    expect(styleOf(unitOf(s))!.primary).toBe('regal');
    expect(undoReview(s, ANN)).toBe(true);
    expect(styleOf(unitOf(s))!.primary).toBe('affectionate');
    expect(developmentOf(unitOf(s)).practice).toEqual({ manner: ARC });
    expect(dynOf(s).mannerTurn).toEqual(turnBefore);
  });

  it('validateReview takes a proposed turn and drops one the engine did not propose', () => {
    const s = world({ overlay: ARC, since: 70 });
    const v = { shifts: [{ axis: 'manner:turn', direction: 'up' as const, size: 'step' as const, reason: 'she is a different woman' }], facts: [] };
    expect(validateReview(s, reg, ANN, v).dropped[0].why).toBe('the engine proposed no such step');
    dynOf(s).mannerTurn = { candidate: 'regal', reviews: 1 };
    expect(validateReview(s, reg, ANN, v).shifts).toHaveLength(1);
  });

  it('a turn is proposed alone: no axis step comes with it', () => {
    const s = world({ overlay: ARC, since: 70 });
    dynOf(s).mannerTurn = { candidate: 'regal', reviews: 1 };
    ensureDevelopment(unitOf(s)).acc = { 'manner:curiosity': 5 };
    expect(mannerProposals(s, reg, unitOf(s)).map((p) => p.axis)).toEqual(['manner:turn']);
  });

  it('a run open at the turn keeps its style: nothing is proposed while a physics, a hold, a slap or a ceremony of hers is open', () => {
    const open: Array<[string, (s: CampaignState) => void]> = [
      ['physics', (s) => { s.scene = { id: 'sc', participants: [ANN], physics: { holderId: ANN } } as unknown as CampaignState['scene']; }],
      ['hold', (s) => { s.practices = { held: { by: ANN } } as unknown as CampaignState['practices']; }],
      ['slap', (s) => { s.practices = { slap: { id: 'ps0', holderId: ANN } } as unknown as CampaignState['practices']; }],
      ['ceremony', (s) => { s.practices = { punishments: [{ id: 'pp0', holderId: ANN, ceremony: { steps: ['a'], done: [] } }] } as unknown as CampaignState['practices']; }],
    ];
    for (const [name, make] of open) {
      const s = world({ overlay: ARC, since: 70 });
      dynOf(s).mannerTurn = { candidate: 'regal', reviews: 1 };
      expect(mannerProposals(s, reg, unitOf(s)).map((p) => p.axis), name).toEqual(['manner:turn']);
      make(s);
      expect(mannerProposals(s, reg, unitOf(s)), name).toEqual([]);
    }
    // someone else's run does not hold her turn
    const other = world({ overlay: ARC, since: 70 });
    dynOf(other).mannerTurn = { candidate: 'regal', reviews: 1 };
    other.scene = { id: 'sc', participants: [BEA], physics: { holderId: BEA } } as unknown as CampaignState['scene'];
    expect(mannerProposals(other, reg, unitOf(other)).map((p) => p.axis)).toEqual(['manner:turn']);
  });

  it('a retired secondary line: practice:style.secondary is never proposed, but a drifted one stays readable', () => {
    const s = world({ secondary: 'playful' });
    ensureDevelopment(unitOf(s)).acc = { 'practice:style.secondary': 9 };
    expect(eligibleAxes(s, reg, unitOf(s)).map((a) => a.axis)).not.toContain('practice:style.secondary');
    expect(fallbackReview(s, reg, ANN).shifts).toEqual([]);
    ensureDevelopment(unitOf(s)).practice = { secondary: 'regal' };
    expect(styleOf(unitOf(s))).toEqual({ primary: 'affectionate', secondary: 'regal' });
    expect(reg.developmentAxes.has('practice:style.secondary')).toBe(true);
  });
});

/** A world whose import says `imported` and a twin whose import says something else and that has turned to `imported`: every reader must read them alike. */
function twins(imported: ProfileStyle, other: ProfileStyle, o: Over = {}): { want: CampaignState; turned: CampaignState } {
  return { want: world({ ...o, style: imported }), turned: world({ ...o, style: other, turnedTo: imported }) };
}

describe('every reader of her style sees the turned style', () => {
  it('styleOf and practiceOf', () => {
    const { turned } = twins('regal', 'cold');
    expect(styleOf(unitOf(turned))).toEqual({ primary: 'regal' });
  });

  it('a milestone that asks for a style (requires.styles)', () => {
    const base = [...reg.dynamicMilestones.values()][0] as unknown as DynamicMilestoneEntry;
    const m = { ...base, contentTags: [], requires: { holdBand: String([...reg.holdBands.values()][0].id), styles: ['possessive'] } } as unknown as DynamicMilestoneEntry;
    const { want, turned } = twins('possessive', 'cold');
    expect(requiresMet(want, reg, ANN, m)).toBe(true);
    expect(requiresMet(turned, reg, ANN, m)).toBe(true);
    expect(requiresMet(world({ style: 'cold' }), reg, ANN, m)).toBe(false);
  });

  it('the answer to a probe (playful and cruel like a return more)', () => {
    const gain = (s: CampaignState): number => { const h = dynOf(s).hold; answerProbe(s, { registries: reg }, ANN, 'returned', undefined, 0.5); return dynOf(s).hold - h; };
    const { want, turned } = twins('playful', 'cold');
    const cold = gain(world({ style: 'cold' }));
    expect(gain(turned)).toBeCloseTo(gain(want), 6);
    expect(gain(want)).toBeGreaterThan(cold);
  });

  it('the possessive agenda of a holder', () => {
    const kinds = (s: CampaignState): string[] => holderAgenda(s, reg, ANN).map((x) => x.kind).sort();
    const { want, turned } = twins('possessive', 'cold');
    expect(kinds(turned)).toEqual(kinds(want));
    expect(kinds(turned)).toContain('keep_me_close');
    expect(kinds(world({ style: 'cold' }))).not.toContain('keep_me_close');
  });

  it('another holder\'s booking is refused by a possessive keeper', () => {
    const keeper = (s: CampaignState): CampaignState => {
      s.relations[ANN].dynamic!.domains = [{ id: 'others', since: 1 }];
      s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
      return s;
    };
    const { want, turned } = twins('possessive', 'cold');
    expect(consentProblem(keeper(want), reg, { unitId: BEA })).toEqual(expect.any(String));
    expect(consentProblem(keeper(turned), reg, { unitId: BEA })).toEqual(expect.any(String));
    expect(consentProblem(keeper(world({ style: 'cold' })), reg, { unitId: BEA })).toBeNull();
  });

  it('the weights of an aftermath, and the terms of her return offer', () => {
    const left = (s: CampaignState): CampaignState => { const d = dynOf(s); d.frame = 'equal'; d.hold = 0; d.formerHolder = { endedDay: s.day, frame: 'role', sworn: false, successor: '' }; return s; };
    const W = (s: CampaignState) => aftermathWeights(left(s), reg, ANN, { route: 'abrupt', clean: false, force: false });
    const a = twins('possessive', 'cold');
    expect(W(a.turned)).toEqual(W(a.want));
    expect(W(a.turned)).not.toEqual(W(world({ style: 'cold' })));
    const terms = (s: CampaignState): string | undefined => { runAftermathEffect(s, { registries: reg }, ANN, { type: 'return_offer' } as never); return s.dynamic!.open.returnOffer?.terms; };
    const d = twins('drill', 'cold');
    expect(terms(d.want)).toBe('after_punishment');
    expect(terms(d.turned)).toBe('after_punishment');
    expect(terms(world({ style: 'cold' }))).toBe('lower_band');
  });

  it('her compatibility and the romantic tier of a gain', () => {
    const { want, turned } = twins('affectionate', 'cold', { romantic: true });
    dynOf(want).readOf.updates = 1; dynOf(turned).readOf.updates = 1;
    expect(compatibilityOf(turned, reg, ANN)).toBeCloseTo(compatibilityOf(want, reg, ANN), 9);
    const cold = world({ style: 'cold', romantic: true });
    dynOf(cold).readOf.updates = 1;
    const gain = (s: CampaignState): number => { const h = dynOf(s).hold; addHold(s, { registries: reg }, ANN, 10, 'test'); return dynOf(s).hold - h; };
    expect(gain(turned)).toBeCloseTo(gain(want), 6);
    expect(gain(want)).not.toBeCloseTo(gain(cold), 6);
  });

  it('the holder directive words her style as she is now', () => {
    const { want, turned } = twins('regal', 'cold');
    const line = (s: CampaignState): string => dynamicDirectives(s, reg, [ANN]).map((d) => d.text).join(' ');
    expect(line(turned)).toBe(line(want));
    expect(line(turned)).toMatch(/regal/i);
  });

  it('without an overlay every reader returns what it did', () => {
    const s = world({ style: 'cold', secondary: 'playful' });
    expect(styleOf(unitOf(s))).toEqual({ primary: 'cold', secondary: 'playful' });
    ensureDevelopment(unitOf(s)).practice = { manner: { intensity: 1 } };
    expect(styleOf(unitOf(s))).toEqual({ primary: 'cold', secondary: 'playful' });
  });
});

describe('since joining lists the drift of her practice and her manner (ruling 11)', () => {
  it('a practice category and a manner step are told', () => {
    const s = world({ overlay: { intensity: 1 } });
    ensureDevelopment(unitOf(s)).practice!.categories = { restraint: { as: 'craves' } };
    const words = changedAxes(unitOf(s), reg, ['restraint']).map((a) => a.axis);
    expect(words).toContain('manner:intensity');
    expect(words).toContain('practice:restraint.as');
    // a category the campaign switched off, or that she limits, is not named; nor is any when the caller does not say what is on
    expect(changedAxes(unitOf(s), reg, []).map((a) => a.axis)).not.toContain('practice:restraint.as');
    expect(changedAxes(unitOf(s), reg).map((a) => a.axis)).not.toContain('practice:restraint.as');
    unitOf(s).bond!.ownLimits.categories = ['restraint'];
    expect(changedAxes(unitOf(s), reg, ['restraint']).map((a) => a.axis)).not.toContain('practice:restraint.as');
  });

  it('a turn, a second drawn to and a secondary changed are told with the style she turned to', () => {
    const s = world({ turnedTo: 'regal', secondary: 'playful' });
    ensureDevelopment(unitOf(s)).practice!.drawnBy = ['reaction', 'power'];
    ensureDevelopment(unitOf(s)).practice!.secondary = 'affectionate';
    const changed = changedAxes(unitOf(s), reg, ['restraint']);
    expect(changed.map((a) => a.axis)).toEqual(expect.arrayContaining(['manner:turn', 'manner:drawn_by', 'practice:style.secondary']));
    expect(changed.find((a) => a.axis === 'manner:turn')!.words).toMatch(/regal/);
    expect(changed.every((a) => !/AUTHOR TO WRITE|\{/.test(a.words))).toBe(true);
  });

  it('what is back at the import is not told, and an expectation moved is', () => {
    const s = world({ overlay: {} });
    expect(changedAxes(unitOf(s), reg, ['restraint'])).toEqual([]);
    unitOf(s).expectations = { holdsUntil: 'limit' };
    ensureDevelopment(unitOf(s)).expect = { holdsUntil: 'blackout' };
    expect(changedAxes(unitOf(s), reg, ['restraint']).map((a) => a.axis)).toContain('expect:holds_until');
  });
});

describe('no reader outside the profile reads her imported style (a guard)', () => {
  it('the engine, the dynamic and the practices read the style through styleOf / practiceOf', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
    const allowed = ['src/engine/dynamic/profile.ts', 'src/engine/development/axes.ts', 'src/engine/development/words.ts', 'src/engine/development/mannerDrift.ts'];
    const raw = /practice\??\.style\b|practice!\.style\b/;
    const hits = ['src/engine', 'src/dynamic', 'src/practice', 'src/scene', 'src/llm'].flatMap(walk)
      .filter((f) => !allowed.includes(f) && raw.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
