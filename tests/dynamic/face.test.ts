import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import { dynamicDirectives, offerDirective, refreshDynamicDirectives } from '../../src/dynamic/directives';
import { faceNow, herRunning, type Face } from '../../src/engine/dynamic/face';
import { dynamicIntentInput } from '../../src/engine/dynamic/intents';
import { gossipChanceFor, knowledgeDayStep } from '../../src/engine/dynamic/knowledge';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { Audience, Contrast, Frame } from '../../src/engine/dynamic/types';
import { pickAudience, selectFewOf } from '../../src/engine/practice/audience';
import type { CampaignState, Publicity } from '../../src/engine/state/types';
import { hasCommanderPronoun } from '../../src/engine/dynamic/pronoun';
import { TUNING } from '../../src/engine/tuning';
import type { Directive } from '../../src/llm/context';
import { campaign, ctxOf, errors, loadCore, run, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const EVERYDAY = 'A bit of a loner, but always helps; kind and odd.';

interface Over { frame?: Frame; audience?: Audience; present?: string[]; manner?: boolean; everyday?: string | null; contrast?: Contrast; romance?: Publicity }

/** Ann holds at `frame` and is in a scene with `present` (besides the commander). Nobody knows of the dynamic unless a test says so. */
function world(over: Over = {}): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'comrade' });
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: over.audience ?? 'indifferent',
      inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
      ...(over.manner === false ? {} : { manner: { intensity: 1, warmth: -1, order: 0, voice: 0, tempo: 0, curiosity: 0 }, drawnBy: ['reaction'] as ['reaction'] }),
      ...(over.everyday === null ? {} : { everyday: over.everyday ?? EVERYDAY }),
      ...(over.contrast !== undefined ? { contrast: over.contrast } : {}),
    },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'play', hold: 30 };
  if (over.romance !== undefined) s.relations[ANN].publicity = { level: over.romance, since: 1 };
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN, ...(over.present ?? [])], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const knows = (s: CampaignState, observer: string): void => {
  s.dynamic!.knowledge[observer] = { [ANN]: { suspicion: 100, level: 'knows_dynamic', levelDay: 1, peakDay: s.day } };
};
const dirs = (s: CampaignState): Directive[] => dynamicDirectives(s, reg, s.scene?.participants ?? [ANN]);
const holder = (s: CampaignState): Directive | undefined => dirs(s).find((d) => d.id === `dynamic:${ANN}`);
const faceOf = (s: CampaignState, present = (s.scene?.participants ?? []).filter((id) => id !== ANN)): Face => faceNow(s, reg, ANN, present);

describe('faceNow: the table', () => {
  it('nobody else present, or an empty list: her manner toward the commander', () => {
    const s = world();
    expect(faceOf(s, [])).toBe('dynamic');
    expect(faceOf(s, ['commander'])).toBe('dynamic'); // the commander is never "someone else"
    expect(faceOf(s, [ANN])).toBe('dynamic'); // nor is she
  });

  it('a practice, a physics or a moment of hers runs: dynamic whoever is present', () => {
    const s = world({ present: [BEA] });
    expect(faceOf(s)).toBe('mask');
    expect(herRunning(s, ANN)).toBe(false);
    s.scene!.physics = { id: 'p1', holderId: ANN } as unknown as NonNullable<CampaignState['scene']>['physics'];
    expect(herRunning(s, ANN)).toBe(true);
    expect(faceOf(s)).toBe('dynamic');
    delete s.scene!.physics;
    s.scene!.moments = { fired: [], open: { id: 'm1', unitId: ANN, sourceId: 'x', exchange: 1, options: [] } };
    expect(herRunning(s, ANN)).toBe(true);
    expect(faceOf(s)).toBe('dynamic');
    s.scene!.moments = { fired: [], open: { id: 'm2', unitId: BEA, sourceId: 'x', exchange: 1, options: [] } }; // another woman's moment is not hers
    expect(herRunning(s, ANN)).toBe(false);
    s.practices = { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [], held: { by: ANN } } as unknown as CampaignState['practices'];
    expect(faceOf(s)).toBe('dynamic');
  });

  it('only people who know, and her audience allows it: dynamic_to_commander', () => {
    for (const audience of ['show_off', 'indifferent'] as const) {
      const s = world({ audience, present: [BEA] });
      knows(s, BEA);
      expect(faceOf(s), audience).toBe('dynamic_to_commander');
    }
    const s = world({ audience: 'select_few', present: [BEA] });
    knows(s, BEA);
    s.relations[BEA].trust = 90; // close to the commander: among her few
    expect(faceOf(s)).toBe('dynamic_to_commander');
  });

  it('only people who know, and her audience does not allow it: everyday', () => {
    const priv = world({ audience: 'private_only', present: [BEA] });
    knows(priv, BEA);
    expect(faceOf(priv)).toBe('everyday');
    const few = world({ audience: 'select_few', present: [BEA, CAT] });
    knows(few, BEA);
    knows(few, CAT);
    few.relations[BEA].trust = 90;
    few.relations[CAT].trust = 0;
    few.relations[CAT].affinity = 0;
    expect(selectFewOf(few, reg, ANN)).toContain(BEA);
    expect(selectFewOf(few, reg, ANN)).not.toContain(CAT);
    expect(faceOf(few)).toBe('everyday'); // one of them is not among her few
  });

  it('a public romance is not knowing of the dynamic (author, 2026-11-27): before someone who does not know it is everyday, whatever her audience', () => {
    expect(faceOf(world({ audience: 'show_off', present: [BEA], romance: 'public' }))).toBe('everyday');
    expect(faceOf(world({ audience: 'indifferent', present: [BEA], romance: 'public' }))).toBe('everyday');
    expect(faceOf(world({ audience: 'private_only', present: [BEA], romance: 'public' }))).toBe('everyday');
  });

  it('anyone who does not know: mask with no romance or a secret one, everyday with a known one (planning ruling 2)', () => {
    expect(faceOf(world({ present: [BEA] }))).toBe('mask');
    expect(faceOf(world({ present: [BEA], romance: 'secret' }))).toBe('mask');
    expect(faceOf(world({ present: [BEA], romance: 'known' }))).toBe('everyday');
    expect(faceOf(world({ present: [BEA], romance: 'public' }))).toBe('everyday');
  });

  it('mixed company: one who knows and one who does not', () => {
    const none = world({ audience: 'show_off', present: [BEA, CAT] });
    knows(none, BEA);
    expect(faceOf(none)).toBe('mask');
    const known = world({ audience: 'show_off', present: [BEA, CAT], romance: 'known' });
    knows(known, BEA);
    expect(faceOf(known)).toBe('everyday');
  });

  it('a holder with no manner gets the same faces (the face rule is the fix for every holder)', () => {
    expect(faceOf(world({ manner: false, present: [BEA] }))).toBe('mask');
    expect(faceOf(world({ manner: false }))).toBe('dynamic');
  });
});

describe('selectFewOf: the one set of pickAudience', () => {
  it('pickAudience reads it unchanged: the leader or a close unit, at base', () => {
    const s = world({ audience: 'select_few', present: [BEA] });
    s.relations[BEA].trust = 90;
    s.relations[CAT].trust = 0;
    s.relations[CAT].affinity = 0;
    s.relations[DEE].trust = 90;
    const few = selectFewOf(s, reg, ANN);
    expect(few).toContain(BEA);
    expect(few).toContain(DEE);
    expect(few).not.toContain(CAT);
    expect(few).not.toContain(ANN);
    expect(pickAudience(s, reg, ANN, 'evening').cards).toEqual(few.slice(0, TUNING.practice.demonstration.cardsMax));
  });
});

describe('the holder directive by face', () => {
  it('dynamic: the frame, the style line with her axes and what draws her', () => {
    const t = holder(world())!.text;
    expect(t).toMatch(/holds the lead with the commander/);
    expect(t).toMatch(/Her manner is cold/);
    expect(t).toContain('she pushes hard'); // intensity +1
    expect(t).toContain('cool, little comfort'); // warmth -1
    expect(t).toMatch(/What draws her is what the commander shows/); // drawnBy reaction
    expect(t).not.toContain(EVERYDAY);
    expect(t).not.toMatch(/Nothing of the dynamic shows/i);
  });

  it('a holder with no manner keeps today\'s line: no axes, no draw', () => {
    const t = holder(world({ manner: false, everyday: null }))!.text;
    expect(t).toMatch(/Her manner is cold\./);
    expect(t).not.toMatch(/What draws her/);
  });

  it('dynamic_to_commander: her manner toward the commander and her everyday self toward the others', () => {
    const s = world({ audience: 'indifferent', present: [BEA] });
    knows(s, BEA);
    const t = holder(s)!.text;
    expect(t).toMatch(/holds the lead with the commander/);
    expect(t).toMatch(/Her manner is cold/);
    expect(t).toContain(EVERYDAY.replace(/[.\s]+$/, ''));
    expect(t).toMatch(/others present/);
  });

  it('everyday: her everyday line and nothing of the dynamic, in place of the whole directive', () => {
    const s = world({ audience: 'private_only', present: [BEA], romance: 'known' });
    s.relations[ANN].dynamic!.refusals = [s.day];
    const t = holder(s)!.text;
    expect(t).toContain(EVERYDAY.replace(/[.\s]+$/, ''));
    expect(t).toMatch(/Nothing of the dynamic shows/i);
    expect(t).not.toMatch(/holds the lead|Her manner|refusal|claimed|Regard|waiting/);
  });

  it('mask: her everyday line and the appearance that all is ordinary between them', () => {
    const t = holder(world({ present: [BEA] }))!.text;
    expect(t).toContain(EVERYDAY.replace(/[.\s]+$/, ''));
    expect(t).toMatch(/keeps up the appearance that all is ordinary/);
    expect(t).not.toMatch(/holds the lead|Her manner/);
  });

  it('the face governs the waiting milestone and the compromat too (the whole holder directive)', () => {
    const s = world({ present: [BEA] });
    s.dynamic!.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: reg.dynamicMilestones.keys().next().value as string, day: s.day, form: 'scene' });
    expect(holder(s)!.text).not.toMatch(/waiting for the commander/);
    const alone = world();
    alone.dynamic!.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: reg.dynamicMilestones.keys().next().value as string, day: alone.day, form: 'scene' });
    expect(holder(alone)!.text).toMatch(/waiting for the commander/);
  });

  it('without an everyday line the everyday and mask lines still say what they must', () => {
    const t = holder(world({ present: [BEA], everyday: null }))!.text;
    expect(t).toMatch(/keeps up the appearance/);
    const e = holder(world({ present: [BEA], romance: 'known', everyday: null }))!.text;
    expect(e).toMatch(/Nothing of the dynamic shows/i);
  });

  it('at equal there is no everyday line (her card is enough until she holds); alone, the milestone she waits on still shows', () => {
    const s = world({ frame: 'equal', present: [BEA] });
    expect(holder(s)).toBeUndefined();
    for (const d of dirs(s)) expect(d.text).not.toContain(EVERYDAY.replace(/[.\s]+$/, ''));
    const alone = world({ frame: 'equal' });
    alone.dynamic!.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: reg.dynamicMilestones.keys().next().value as string, day: alone.day, form: 'scene' });
    expect(holder(alone)!.text).toMatch(/waiting for the commander/);
    expect(holder(alone)!.text).not.toContain(EVERYDAY.replace(/[.\s]+$/, ''));
  });

  it('a directive of something that runs (practice:, physics:, moment:) is untouched by a refresh in every face', () => {
    for (const s of [world({ present: [BEA] }), world(), world({ audience: 'private_only', present: [BEA], romance: 'known' })]) {
      const map = new Map<string, Directive>();
      const b = { setDirective: (d: Directive) => { map.set(d.id, d); }, clearMatching: (f: (d: Directive) => boolean) => { for (const d of [...map.values()]) if (f(d)) map.delete(d.id); } };
      const kept = [`practice:tasks:${ANN}`, `physics:${ANN}`, `moment:${ANN}`].map((id): Directive => ({ id, expiresAfter: 'scene', text: `${id} text` }));
      for (const d of kept) b.setDirective(d);
      refreshDynamicDirectives(b as never, s, reg);
      for (const d of kept) expect(map.get(d.id)).toEqual(d);
    }
  });

  it('the command, witness and Leash-block lines are not the face\'s: they stay as they were', () => {
    const s = world({ present: [BEA] });
    s.dynamic!.knowledge[BEA] = { [ANN]: { suspicion: 70, level: 'suspects_dynamic', levelDay: 1, peakDay: s.day } };
    const ids = dirs(s).map((d) => d.id);
    expect(ids).toContain(`dynamic:witness:${BEA}`);
  });

  it('the probe line follows the face: it shows alone and before people she lets in, not before those who do not know', () => {
    const probe = (s: CampaignState): CampaignState => {
      dynamicOf(s, ANN)!.probes = { pending: { axis: 'space', tier: 1, day: s.day }, lastDay: s.day, answers: [], issued: 1 };
      dynamicOf(s, ANN)!.frame = 'equal';
      s.dynamic!.queue = [ANN];
      return s;
    };
    expect(dirs(probe(world())).map((d) => d.id)).toContain(`dynamic:probe:${ANN}`);
    expect(dirs(probe(world({ present: [BEA] }))).map((d) => d.id)).not.toContain(`dynamic:probe:${ANN}`);
    const open = world({ audience: 'show_off', present: [BEA] });
    knows(open, BEA);
    expect(dirs(probe(open)).map((d) => d.id)).toContain(`dynamic:probe:${ANN}`);
  });

  it('the extractor is offered the probe only where the directive shows it (the same face rule)', () => {
    const probe = (s: CampaignState, axis = 'space'): CampaignState => {
      dynamicOf(s, ANN)!.probes = { pending: { axis, tier: 1, day: s.day }, lastDay: s.day, answers: [], issued: 1 };
      dynamicOf(s, ANN)!.frame = 'equal';
      s.dynamic!.queue = [ANN];
      return s;
    };
    const offer = (s: CampaignState) => dynamicIntentInput(s, reg, s.scene!.participants, 'scene').dynamic;
    expect(offer(probe(world()))?.types).toContain('probe_answered');
    for (const axis of ['space', 'hypothetical']) {
      const before = probe(world({ present: [BEA] }), axis);
      const o = offer(before);
      expect(o?.types ?? []).not.toContain('probe_answered');
      expect(o?.types ?? []).not.toContain('hypothetical_answered');
      expect(o?.probes ?? []).toEqual([]);
    }
    const open = world({ audience: 'show_off', present: [BEA] });
    knows(open, BEA);
    expect(offer(probe(open))?.types).toContain('probe_answered');
  });

  it('the offer line follows the face: unchanged alone, a deniable answer before those who do not know, unchanged in a DM', () => {
    const event = { type: 'offer_made', unitId: ANN, answer: 'accepted', what: 'a favour' };
    const alone = offerDirective(event, world(), reg)!;
    expect(alone.text).toMatch(/takes it up, in her own manner/);
    expect(alone.text).not.toMatch(/do not know/);
    const masked = offerDirective(event, world({ present: [BEA] }), reg)!;
    expect(masked.text).toMatch(/takes it up, in her own manner/); // the engine's answer stands
    expect(masked.text).toMatch(/do not know of it/);
    const noScene = world();
    delete noScene.scene;
    expect(offerDirective(event, noScene, reg)!.text).toEqual(alone.text);
  });

  it('no pronoun for the commander and no number in any face', () => {
    const states = [
      world(), world({ audience: 'indifferent', present: [BEA] }), world({ present: [BEA] }), world({ present: [BEA], romance: 'known' }),
      world({ audience: 'private_only', present: [BEA], romance: 'known' }),
    ];
    knows(states[1], BEA);
    for (const s of states) for (const d of dirs(s)) {
      expect(hasCommanderPronoun(d.text), d.text).toBe(false);
      expect(d.text, d.text).not.toMatch(/\d/);
    }
  });
});

describe('the contrast scales the gossip about her', () => {
  it('the chance is gossipChance x the factor, capped at 0.9, and a holder with no contrast keeps the base', () => {
    const T = TUNING.squadKnowledge.gossipChance;
    expect(gossipChanceFor(undefined)).toBe(T);
    expect(gossipChanceFor('low')).toBe(Math.min(0.9, T * 1));
    expect(gossipChanceFor('mid')).toBeCloseTo(Math.min(0.9, T * 1.3));
    expect(gossipChanceFor('high')).toBeCloseTo(Math.min(0.9, T * 1.6));
    for (const c of ['low', 'mid', 'high'] as const) expect(gossipChanceFor(c)).toBeLessThanOrEqual(0.9);
    expect(gossipChanceFor('high')).toBeGreaterThan(gossipChanceFor('low'));
  });

  /** On how many of 120 days does a woman who knows pass it on to Dee (a gain of the 5 a knowing woman gives)? */
  const days = (contrast: Contrast | undefined): number => {
    let n = 0;
    for (let day = 1; day <= 120; day++) {
      const s = world({ frame: 'play', ...(contrast !== undefined ? { contrast } : {}) });
      s.day = day;
      s.dynamic!.knowledge = { [BEA]: { [ANN]: { suspicion: 100, level: 'knows_dynamic', levelDay: 1, peakDay: day } } };
      for (const u of s.squad) if (u.id !== ANN) { s.relations[u.id].trust = 0; s.relations[u.id].affinity = 0; delete u.insight; }
      knowledgeDayStep(s, ctxOf(s, reg));
      if ((s.dynamic!.knowledge[DEE]?.[ANN]?.suspicion ?? 0) > 0) n++;
    }
    return n;
  };

  it('a high contrast is talked about on more days than a low one; the same hashes, the same days at the base', () => {
    const low = days('low');
    const high = days('high');
    expect(high).toBeGreaterThan(low);
    expect(days(undefined)).toBe(low); // factor 1 is the base
  });
});
