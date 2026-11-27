/**
 * P16b Task 16: the craft's intents (ruling 22). `praise_given`, `foot_signal_answered` and `care_noticed` are offered to the mechanic model only while their subject exists; the engine
 * re-validates what it reports against what was offered and applies it. The commander's own words of the exchange (`said`) reach only `praise_given`, never a prompt or an event.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/scene';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { applyCraftIntent, craftIntentInput, registerPraiseGiven, registerPraiseOpen, resetPraiseHooks, SAID_MAX } from '../../../src/engine/craft/intents';
import { installCraftHooks } from '../../../src/engine/craft/hooks';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { CRAFT_INTENT_TYPES } from '../../../src/engine/relations/vocab';
import { applyIntents } from '../../../src/engine/relations/apply';
import { validateIntents } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, holdScene, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); resetPraiseHooks(); installCraftHooks(); });

const offer = (s: CampaignState, ids: string[] = [ANN], channel: 'scene' | 'dm' = 'scene') => craftIntentInput(s, reg, ids, channel).craft;
const withCares = (s: CampaignState, cares: NonNullable<NonNullable<CampaignState['relations'][string]['craft']>['cares']>): CampaignState => { s.relations[ANN].craft = { ...(s.relations[ANN].craft ?? {}), cares }; return s; };
const withSignals = (s: CampaignState, named: string[]): CampaignState => { s.relations[ANN].craft = { ...(s.relations[ANN].craft ?? {}), signals: Object.fromEntries(named.map((m) => [m, { named: true, answered: 1, day: s.day }])) }; return s; };
const ev = (type: string, over: Record<string, unknown> = {}) => ({ type, actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'quoted', confidence: 0.9, ...over });

describe('the journal rows of the craft\'s relation events', () => {
  it('only care_noticed has a journal phrase (the other two never reach applyEventToUnit, so a phrase would be dead)', () => {
    const rows = (id: string) => reg.eventDeltas.get(id) as { journal?: string } | undefined;
    expect(typeof rows('care_noticed')?.journal).toBe('string');
    for (const id of ['praise_given', 'foot_signal_answered']) {
      expect(rows(id), id).toBeDefined();
      expect(rows(id)!.journal, id).toBeUndefined();
    }
  });
});

describe('what is offered', () => {
  it('nothing without a subject: a campaign that never wrote the craft, a holder at equal with no care, and no scene give {}', () => {
    expect(craftIntentInput(world(reg, 'play'), reg, [ANN], 'scene')).toEqual({});
    expect(craftIntentInput(world(reg, 'equal'), reg, [ANN], 'scene')).toEqual({});
    expect(craftIntentInput(world(reg, 'play'), reg, [], 'scene')).toEqual({});
  });

  it('care_noticed: while she has a care she did not notice within the 7 days, a unit at a time, in a scene or a DM, even at equal', () => {
    const s = withCares(world(reg, 'equal'), [{ day: world(reg).day - 2, careId: 'polishing_her_boots', noticed: false }]);
    for (const ch of ['scene', 'dm'] as const) {
      expect(offer(s, [ANN], ch)).toMatchObject({ types: ['care_noticed'], cares: [{ unitId: ANN, what: 'polishing her boots' }] });
    }
    expect(offer(s, [BEA])).toBeUndefined();
    // a care she noticed, one already shown, and one older than a week are not offered
    const unseen = { day: s.day - 2, careId: 'polishing_her_boots', noticed: false };
    for (const c of [{ ...unseen, noticed: true }, { ...unseen, voiced: true as const }, { ...unseen, day: s.day - 8 }]) {
      expect(offer(withCares(world(reg, 'equal'), [c]))).toBeUndefined();
    }
  });

  it('foot_signal_answered: a craft-live holder with a signal she has named, while a foot contact is live (scene only); never an unnamed one', () => {
    const s = withSignals(holdScene(reg), ['tap2', 'stamp']);
    const o = offer(s)!;
    expect(o.types).toContain('foot_signal_answered');
    expect(o.signals.map((x) => x.motion).sort()).toEqual(['stamp', 'tap2']);
    expect(o.signals.every((x) => x.unitId === ANN && x.words !== '' && !/AUTHOR TO WRITE/.test(x.words))).toBe(true);
    expect(JSON.stringify(o)).not.toMatch(/sole|push|hook|point|nudge/); // she has not named these
    expect(offer(s, [ANN], 'dm')).toBeUndefined();
    const none = withSignals(holdScene(reg), []);
    expect(offer(none)).toBeUndefined();
    const noContact = withSignals(holdScene(reg), ['tap2']);
    delete noContact.scene!.blocking!.commander!.contact;
    expect(offer(noContact)).toBeUndefined();
    const eq = withSignals(holdScene(reg), ['tap2']);
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(offer(eq)).toBeUndefined();
  });

  it('praise_given: only while a reader says she takes praise (Task 20 registers it); never otherwise', () => {
    const s = holdScene(reg);
    expect(offer(s)).toBeUndefined();
    registerPraiseOpen((_st, _reg, id) => id === ANN);
    expect(offer(s)).toMatchObject({ types: ['praise_given'], praise: [ANN] });
    expect(offer(s, [BEA])).toBeUndefined();
    expect(offer(world(reg, 'equal'))).toBeUndefined(); // the craft is not live
  });

  it('reads only; draws nothing', () => {
    const s = withSignals(holdScene(reg), ['tap2']);
    const before = JSON.stringify(s);
    offer(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('what the engine accepts', () => {
  const check = (s: CampaignState, events: unknown[]) => validateIntents({ events }, { participants: [ANN], squad: s.squad, ...craftIntentInput(s, reg, [ANN], 'scene') }).events;

  it('drops every craft type that was not offered, whatever else is in the answer', () => {
    const s = holdScene(reg);
    expect(check(s, CRAFT_INTENT_TYPES.map((t) => ev(t)))).toEqual([]);
  });

  it('keeps care_noticed for a unit it was offered for, and drops it for another', () => {
    const s = withCares(holdScene(reg), [{ day: holdScene(reg).day - 1, careId: 'tidying_her_quarters', noticed: false }]);
    expect(check(s, [ev('care_noticed')])).toHaveLength(1);
    expect(check(s, [ev('care_noticed', { targets: [BEA] })])).toEqual([]);
    expect(check(s, [ev('care_noticed'), ev('care_noticed')])).toHaveLength(1); // the same report twice counts once
  });

  it('keeps foot_signal_answered with a motion she has named; an unnamed or unknown one drops the event', () => {
    const s = withSignals(holdScene(reg), ['tap2']);
    const [kept] = check(s, [ev('foot_signal_answered', { motion: 'tap2' })]);
    expect(kept).toMatchObject({ type: 'foot_signal_answered', motion: 'tap2', actor: 'commander', targets: [ANN] });
    expect(check(s, [ev('foot_signal_answered', { motion: 'stamp' }), ev('foot_signal_answered', { motion: 'wave' }), ev('foot_signal_answered')])).toEqual([]);
    expect(check(s, [ev('foot_signal_answered', { motion: 'tap2', actor: ANN, targets: [] })])).toHaveLength(1); // whichever side she is written on
  });

  it('keeps praise_given for a unit it was offered for', () => {
    registerPraiseOpen((_st, _r, id) => id === ANN);
    const s = holdScene(reg);
    expect(check(s, [ev('praise_given')])).toHaveLength(1);
  });
});

describe('what the engine does with it', () => {
  const apply = (s: CampaignState, events: unknown[], extra: { said?: string } = {}) => {
    const d = structuredClone(s);
    const out = applyIntents(d, ctxOf(d, reg), { channel: 'scene', participants: [ANN], intents: { events: events.map((e) => ({ targets: [ANN], actor: 'commander', ...(e as object) })) }, sceneId: s.scene!.id, ...extra } as never);
    return { d, out };
  };

  it('care_noticed turns a care she did not notice into one she shows: the same landing as a noticed one, once', () => {
    const s = withCares(holdScene(reg), [{ day: holdScene(reg).day - 3, careId: 'polishing_her_boots', noticed: false }, { day: holdScene(reg).day - 1, careId: 'doing_her_laundry', noticed: false }]);
    const favour = dynamicOf(s, ANN)!.favour;
    const { d, out } = apply(s, [ev('care_noticed')]);
    expect(ofType(out, 'care_noticed')).toEqual([{ type: 'care_noticed', unitId: ANN, careId: 'polishing_her_boots' }]);
    expect(d.relations[ANN].craft!.cares![0]).toMatchObject({ noticed: true, voiced: true, scene: s.scene!.id });
    expect(d.relations[ANN].craft!.cares![1]).toMatchObject({ noticed: false });
    expect(dynamicOf(d, ANN)!.favour).toBe(favour + 1); // at play
    expect(d.relations[ANN].history.filter((h) => h.type === 'care_noticed')).toHaveLength(1);
  });

  it('foot_signal_answered counts as an answered bout of that motion, with the memory xp', () => {
    const s = withSignals(holdScene(reg), ['tap2']);
    const { d, out } = apply(s, [ev('foot_signal_answered', { motion: 'tap2' })]);
    expect(d.relations[ANN].craft!.signals!.tap2!.answered).toBe(2);
    expect(out.some((e) => e.type === 'craft_xp' && e.key === 'memory')).toBe(true);
    expect(out.some((e) => e.type === 'foot_signal_given')).toBe(false); // she named it long ago
  });

  it('praise_given hands the commander\'s own words (said, at most 400) to the writer, and nothing else sees them', () => {
    const seen: string[] = [];
    registerPraiseOpen((_st, _r, id) => id === ANN);
    registerPraiseGiven((_d, _c, unitId, said) => { seen.push(`${unitId}:${said}`); return [{ type: 'probe_x', unitId }] as never; });
    const s = holdScene(reg);
    const said = `${'You carry yourself well. '.repeat(30)}END`;
    const { out } = apply(s, [ev('praise_given')], { said });
    expect(seen).toEqual([`${ANN}:${said.replace(/\s+/g, ' ').trim().slice(0, SAID_MAX).trim()}`]);
    expect(SAID_MAX).toBe(400);
    expect(JSON.stringify(out)).not.toContain('You carry yourself');
    // without words nothing is given
    seen.length = 0;
    apply(s, [ev('praise_given')]);
    expect(seen).toEqual([]);
    // a type that is not the praise never reads it
    apply(withSignals(holdScene(reg), ['tap2']), [ev('foot_signal_answered', { motion: 'tap2' })], { said: 'x' });
    expect(seen).toEqual([]);
  });

  it('applyCraftIntent does nothing for a type it does not know, and nothing without craft', () => {
    const s = world(reg, 'equal');
    expect(applyCraftIntent(s, { registries: reg }, ANN, ev('foot_signal_answered', { motion: 'tap2' }) as never, {})).toEqual([]);
    expect(applyCraftIntent(s, { registries: reg }, ANN, ev('praised') as never, {})).toEqual([]);
  });

  it('draws no rng', () => {
    const s = withSignals(holdScene(reg), ['tap2']);
    const { d } = apply(s, [ev('foot_signal_answered', { motion: 'tap2' })]);
    expect(d.rng).toEqual(s.rng);
    void errors; void run;
  });
});
