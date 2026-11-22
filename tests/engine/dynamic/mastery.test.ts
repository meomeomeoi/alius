import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/physics';
import { COMMANDER } from '../../../src/engine/blocking';
import { answerOffer, offerChoices } from '../../../src/engine/dynamic/offer';
import { addMastery, masteryFromEvents, masteryLevel, moodSigns, revealedExpectations } from '../../../src/engine/dynamic/mastery';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { expectTag, zoneTag } from '../../../src/engine/dynamic/zones';
import { addFact } from '../../../src/engine/memory/facts';
import type { Frame, ProfileStyle } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const bond = (primary: ProfileStyle) => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] as string[] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});
const ON = ['restraint', 'worship', 'humiliation'];

function world(frame: Frame = 'play'): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = bond('cold');
  unitOf(s, ANN).expectations = {
    worship: { feet: { attitude: 'craves', how: 'slowly, with the lips' }, toes: { attitude: 'enjoys' }, armpits: { attitude: 'enjoys' } },
    tells: { irritation: 'taps her pen', pleasure: 'lets her shoulders drop' },
  };
  s.content = { enabled: ON };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold: 30 };
  return s;
}
const ctx = () => ({ registries: reg });
const outcome = (over: Record<string, unknown> = {}) => ({ type: 'physics_outcome', runId: 'p1', physicsId: 'breath', holderId: ANN, result: 'released', targetId: 'feet', ...over });

describe('xp and levels', () => {
  it('+5 per act, +3 when her how is set and the act ended clean', () => {
    const s = world();
    masteryFromEvents(s, ctx(), [outcome()]);
    expect(s.relations[ANN].mastery).toEqual({ feet: 8 }); // her how is set
    masteryFromEvents(s, ctx(), [outcome({ targetId: 'toes' })]);
    expect(s.relations[ANN].mastery!.toes).toBe(5); // she said nothing of how
    masteryFromEvents(s, ctx(), [outcome({ result: 'collapse' })]);
    expect(s.relations[ANN].mastery!.feet).toBe(13); // a dirty one counts the act only
    masteryFromEvents(s, ctx(), [{ type: 'mouth_act', kind: 'kiss', unitId: ANN }, { type: 'mouth_act', kind: 'long', unitId: ANN }, { type: 'mouth_act_done', kind: 'counted', unitId: ANN, n: 20, tries: 0 }]);
    expect(s.relations[ANN].mastery!.feet).toBe(13); // no contact in the scene: no target, nothing
  });

  it('a kiss and a counted kiss are an act on the contact target; a run that has its own outcome is not counted twice', () => {
    const s = world();
    s.scene = { id: 'sc1', participants: [ANN], blocking: { commander: { contact: { id: 'foot_worship', with: ANN, direction: 'from', target: 'feet', since: 0 } } } } as unknown as CampaignState['scene'];
    masteryFromEvents(s, ctx(), [{ type: 'mouth_act', kind: 'kiss', unitId: ANN }]);
    expect(s.relations[ANN].mastery).toEqual({ feet: 8 });
    masteryFromEvents(s, ctx(), [{ type: 'mouth_act_done', kind: 'counted', unitId: ANN, n: 20, tries: 0 }]);
    expect(s.relations[ANN].mastery).toEqual({ feet: 16 });
    masteryFromEvents(s, ctx(), [{ type: 'mouth_act', kind: 'long', unitId: ANN }, { type: 'mouth_act', kind: 'lick', unitId: ANN }, { type: 'mouth_act', kind: 'counted', unitId: ANN, n: 20 }]);
    expect(s.relations[ANN].mastery).toEqual({ feet: 16 }); // the physics outcome and the count's end are the acts
  });

  it('levels are 20 / 60 / 120 / 200 / 320 and mastery_gained comes once per level', () => {
    const s = world();
    const levels: number[] = [];
    for (let i = 0; i < 4; i++) levels.push(...ofType(addMastery(s, reg, ANN, 'toes', 5), 'mastery_gained').map((e) => Number(e.level)));
    expect(levels).toEqual([1]); // 20 xp
    expect(masteryLevel(s, ANN, 'toes')).toBe(1);
    expect(ofType(addMastery(s, reg, ANN, 'toes', 5), 'mastery_gained')).toEqual([]); // 25: no new level
    const jump = ofType(addMastery(s, reg, ANN, 'toes', 100), 'mastery_gained').map((e) => Number(e.level));
    expect(jump).toEqual([2, 3]); // 125 crosses 60 and 120
    expect(ofType(addMastery(s, reg, ANN, 'toes', 500), 'mastery_gained').map((e) => Number(e.level))).toEqual([4, 5]);
    expect(masteryLevel(s, ANN, 'toes')).toBe(5);
    expect(ofType(addMastery(s, reg, ANN, 'toes', 5), 'mastery_gained')).toEqual([]);
    expect(ofType(addMastery(s, reg, ANN, 'toes', 5), 'mastery_gained')[0]).toBeUndefined();
  });

  it('another woman starts from zero', () => {
    const s = world();
    addMastery(s, reg, ANN, 'feet', 70);
    expect(masteryLevel(s, ANN, 'feet')).toBe(2);
    expect(masteryLevel(s, BEA, 'feet')).toBe(0);
    expect(s.relations[BEA].mastery).toBeUndefined();
  });

  it('nothing is written while the dynamic is off', () => {
    const s = world();
    s.dynamic = undefined;
    expect(addMastery(s, reg, ANN, 'feet', 50)).toEqual([]);
    expect(masteryFromEvents(s, ctx(), [outcome()])).toEqual([]);
    expect(s.relations[ANN].mastery).toBeUndefined();
  });

  it('a real hold on a contact with a target counts: the outcome names the target', () => {
    const s0 = world();
    const started = run(s0, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    const set = run(started.state, reg, { type: 'blocking/set', payload: { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER, target: 'armpits', at: 3 } });
    expect(errors(set.events)).toEqual([]);
    expect(set.state.scene!.physics).toBeDefined();
    const stopped = run(set.state, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'removed', value: 'smothered_armpit', at: 4 } });
    expect(errors(stopped.events)).toEqual([]);
    expect(ofType(stopped.events, 'physics_outcome')[0]).toMatchObject({ result: 'released', targetId: 'armpits' });
    expect(stopped.state.relations[ANN].mastery).toEqual({ armpits: 5 }); // she said nothing of how for the armpits
  });
});

describe('what mastery shows', () => {
  it('mastery >= 2 reveals an unknown target without a corrected answer', () => {
    const s = world();
    const asks = [{ tab: 'part' as const, ids: ['toes'] }];
    expect(answerOffer(s, reg, ANN, asks).answer).toBe('corrected');
    const events = addMastery(s, reg, ANN, 'toes', 60);
    expect(ofType(events, 'zone_revealed')[0]).toMatchObject({ unitId: ANN, targetId: 'toes', via: 'mastery' });
    // the fact lands through the dispatcher; with the xp alone (no fact yet) the answer is already hers, not a correction
    const answer = answerOffer(s, reg, ANN, asks);
    expect(answer).toMatchObject({ answer: 'accepted', hold: 3, reveal: 'toes' });
    expect(answer.corrected).toBeUndefined();
  });

  it('a level reached through the dispatcher shows the zone: the memory rule writes its fact', () => {
    const s = world();
    s.relations[ANN].mastery = { armpits: 58 };
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    const set = run(started, reg, { type: 'blocking/set', payload: { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER, target: 'armpits', at: 3 } });
    const stopped = run(set.state, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'removed', value: 'smothered_armpit', at: 4 } });
    expect(errors(stopped.events)).toEqual([]);
    expect(ofType(stopped.events, 'mastery_gained')[0]).toMatchObject({ unitId: ANN, targetId: 'armpits', level: 2 });
    expect(ofType(stopped.events, 'zone_revealed')[0]).toMatchObject({ targetId: 'armpits', via: 'mastery' });
    expect(stopped.state.memory.facts.filter((f) => f.tags.includes(zoneTag('armpits')))).toHaveLength(1);
    expect(offerChoices(stopped.state, reg, ANN).part.find((c) => c.id === 'armpits')!.known).toBe('enjoys');
  });

  it('revealed shows only fields with a fact', () => {
    const s = world();
    expect(revealedExpectations(s, reg, ANN)).toEqual({});
    addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: feet', tags: ['dynamic', zoneTag('feet')], importance: 2, day: s.day, knownBy: [ANN] });
    expect(revealedExpectations(s, reg, ANN)).toEqual({ worship: { feet: { attitude: 'craves', how: 'slowly, with the lips' } } });
    // a fact the commander does not have shows nothing
    addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: toes', tags: ['dynamic', zoneTag('toes')], importance: 2, day: s.day, knownBy: [ANN], hiddenFromCommander: true });
    expect(Object.keys(revealedExpectations(s, reg, ANN).worship ?? {})).toEqual(['feet']);
    // a fact about another woman shows nothing of hers
    addFact(s, { about: [BEA], text: 'AUTHOR TO WRITE: armpits', tags: ['dynamic', zoneTag('armpits')], importance: 2, day: s.day, knownBy: [BEA] });
    expect(Object.keys(revealedExpectations(s, reg, ANN).worship ?? {})).toEqual(['feet']);
    addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: tells', tags: ['dynamic', expectTag('tells')], importance: 2, day: s.day, knownBy: [ANN] });
    expect(revealedExpectations(s, reg, ANN).tells).toEqual({ irritation: 'taps her pen', pleasure: 'lets her shoulders drop' });
    expect(revealedExpectations(s, reg, ANN).offset).toBeUndefined(); // her offset is never shown
  });

  it('the offer composer reads a shown zone from the same facts', () => {
    const s = world();
    addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: feet', tags: ['dynamic', zoneTag('feet')], importance: 2, day: s.day, knownBy: [ANN] });
    expect(offerChoices(s, reg, ANN).part.find((c) => c.id === 'feet')!.known).toBe('craves');
  });
});

describe('mood signs', () => {
  const sharedScene = (s: CampaignState) => { s.scene = { id: 'sc1', day: s.day, participants: [ANN] } as unknown as CampaignState['scene']; };
  const reveal = (s: CampaignState) => addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: tells', tags: ['dynamic', expectTag('tells')], importance: 2, day: s.day, knownBy: [ANN] });

  it('shows her tell only once it is revealed, by her mood', () => {
    const s = world();
    s.relations[ANN].dynamic!.favour = -6; // frustrated
    expect(moodSigns(s, reg, ANN)).toEqual([]); // nothing seen, nothing shown
    reveal(s);
    expect(moodSigns(s, reg, ANN)).toEqual(['taps her pen']);
    s.relations[ANN].dynamic!.favour = 6; // content
    expect(moodSigns(s, reg, ANN)).toEqual(['lets her shoulders drop']);
    s.relations[ANN].dynamic!.favour = 0;
    expect(moodSigns(s, reg, ANN)).toEqual([]);
  });

  it('shows the satisfaction word only after a shared scene today', () => {
    const s = world();
    s.relations[ANN].dynamic!.favour = -6;
    expect(moodSigns(s, reg, ANN)).toEqual([]);
    sharedScene(s);
    expect(moodSigns(s, reg, ANN)).toEqual(['irritated']);
    s.relations[ANN].dynamic!.favour = 6;
    expect(moodSigns(s, reg, ANN)).toEqual(['content']);
    s.relations[ANN].dynamic!.favour = 0;
    expect(moodSigns(s, reg, ANN)).toEqual(['even']);
    // an ended scene of today counts; one of another day does not
    delete s.scene;
    s.memory.scenes = [{ sceneId: 's1', from: 0, to: 2, summarized: false, day: s.day, participants: [ANN] }];
    expect(moodSigns(s, reg, ANN)).toEqual(['even']);
    s.memory.scenes = [{ sceneId: 's1', from: 0, to: 2, summarized: false, day: s.day - 1, participants: [ANN] }];
    expect(moodSigns(s, reg, ANN)).toEqual([]);
  });

  it('adds the length of her last replies when the thread has them, and never a number', () => {
    const s = world();
    const msg = (text: string, i: number) => ({ id: `m${i}`, from: ANN, text, day: s.day, slot: s.slot, read: true });
    s.dms[ANN] = [msg('ok', 1), msg('fine', 2), msg('no', 3)];
    expect(moodSigns(s, reg, ANN)).toEqual(['her replies are short']);
    s.dms[ANN] = [msg('x'.repeat(300), 1), msg('y'.repeat(260), 2), msg('z'.repeat(280), 3)];
    expect(moodSigns(s, reg, ANN)).toEqual(['her replies are long']);
    s.dms[ANN] = [msg('x'.repeat(100), 1)];
    expect(moodSigns(s, reg, ANN)).toEqual([]);
    for (const line of moodSigns(s, reg, ANN)) expect(line).not.toMatch(/\d/);
  });

  it('nothing for a woman with no dynamic, or while it is off', () => {
    const s = world();
    sharedScene(s);
    s.dynamic = undefined;
    expect(moodSigns(s, reg, ANN)).toEqual([]);
  });
});
