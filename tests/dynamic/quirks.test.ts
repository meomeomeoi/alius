import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import { dynamicDirectives, refreshDynamicDirectives } from '../../src/dynamic/directives';
import { applyDynamicIntent, dynamicIntentInput } from '../../src/engine/dynamic/intents';
import { quirkSyncDue, quirksDue } from '../../src/engine/dynamic/quirks';
import { hasCommanderPronoun } from '../../src/engine/dynamic/pronoun';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { Frame, Quirk } from '../../src/engine/dynamic/types';
import { validateIntents, type EventIntent } from '../../src/engine/relations/intents';
import { DYNAMIC_INTENT_TYPES, EVENT_TYPES } from '../../src/engine/relations/vocab';
import type { CampaignState } from '../../src/engine/state/types';
import type { Directive } from '../../src/llm/context';
import { createDynamic } from '../../src/dynamic/controller';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

const QUIRKS: Quirk[] = [
  { when: 'switch', text: 'she locks the door and takes off her glasses' },
  { when: 'during', text: 'she hums under her breath' },
  { when: 'after', text: 'she makes tea and does not speak' },
  { when: 'address', text: 'she calls the commander by rank, mockingly' },
];

function world(over: { quirks?: Quirk[] | null; present?: string[]; frame?: Frame } = {}): CampaignState {
  const s = campaign(reg, 3);
  setRelation(s, ANN, { stateId: 'comrade' });
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
      manner: { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 }, drawnBy: ['reaction'], everyday: 'Kind and odd.',
      ...(over.quirks === null ? {} : { quirks: over.quirks ?? QUIRKS }),
    },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'play', hold: 30 };
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN, ...(over.present ?? [])], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const running = (s: CampaignState): void => { s.scene!.physics = { id: 'p1', holderId: ANN } as unknown as NonNullable<CampaignState['scene']>['physics']; };
const stopped = (s: CampaignState): void => { delete s.scene!.physics; };
const whens = (s: CampaignState): string[] => quirksDue(s, reg).map((q) => q.when);
const quirkLine = (s: CampaignState): Directive | undefined => dynamicDirectives(s, reg, s.scene!.participants).find((d) => d.id === `dynamic:quirk:${ANN}`);
const sync = (s: CampaignState): CampaignState => {
  const r = run(s, reg, { type: 'dynamic/quirk_sync', payload: {} });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};
const voiced = (s: CampaignState, when: string): EventIntent => ({ type: 'quirk_voiced', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she did it', confidence: 1, when } as unknown as EventIntent);

describe('the triggers (spec §5)', () => {
  it('a holder with no quirks offers nothing', () => {
    expect(whens(world({ quirks: null }))).toEqual([]);
    expect(whens(world({ quirks: [] }))).toEqual([]);
    expect(quirkLine(world({ quirks: null }))).toBeUndefined();
  });

  it('switch: with her in the dynamic face and nothing of hers running yet', () => {
    expect(whens(world())).toEqual(['switch']);
  });

  it('switch turns on when the face turns from everyday to dynamic (the others leave)', () => {
    const s = world({ present: [BEA] }); // Bea does not know: the mask
    expect(whens(s)).toEqual([]);
    s.scene!.participants = [ANN]; // she is alone with the commander
    expect(whens(s)).toEqual(['switch']);
  });

  it('during, and address with the first during: while a practice or physics of hers runs', () => {
    const s = world();
    running(s);
    expect(whens(s).sort()).toEqual(['address', 'during']);
  });

  it('after: when it ends (a run was seen in this scene and none runs now)', () => {
    let s = world();
    running(s);
    s = sync(s); // the controller notes the run
    expect(s.dynamic!.quirkScene!.sceneId).toBe(s.scene!.id);
    stopped(s);
    expect(whens(s)).toEqual(['after']);
  });

  it('never before the face allows: the mask and the everyday face offer no quirk, a run in company still does', () => {
    const s = world({ present: [BEA] });
    expect(whens(s)).toEqual([]);
    running(s); // a run of hers shows the dynamic whoever is present (the face rule)
    expect(whens(s).sort()).toEqual(['address', 'during']);
  });

  it('a unit with only some of the kinds offers only those', () => {
    const s = world({ quirks: [{ when: 'during', text: 'she hums' }] });
    expect(whens(s)).toEqual([]);
    running(s);
    expect(whens(s)).toEqual(['during']);
  });

  it('nothing without a scene with her, and nothing while the dynamic is off', () => {
    const s = world();
    expect(quirksDue(s, reg, [])).toEqual([]);
    delete s.scene;
    expect(quirksDue(s, reg)).toEqual([]);
    const off = world();
    delete off.dynamic;
    expect(quirksDue(off, reg)).toEqual([]);
  });
});

describe('the directive: `dynamic:quirk:<unitId>`, "if it fits, once"', () => {
  it('is worded as an offer, carries the quirk text and never the manner of a mechanic', () => {
    const t = quirkLine(world())!.text;
    expect(t).toMatch(/if it fits/i);
    expect(t).toMatch(/once/i);
    expect(t).toContain('she locks the door and takes off her glasses');
    expect(t).not.toContain('hums');
    expect(t).toMatch(/never name it/i);
    expect(hasCommanderPronoun(t)).toBe(false);
    expect(t).not.toMatch(/\d/);
  });

  it('expires with the scene and keeps the `dynamic:` prefix', () => {
    const d = quirkLine(world())!;
    expect(d.expiresAfter).toBe('scene');
    expect(d.id.startsWith('dynamic:')).toBe(true);
  });

  it('while running, one line carries the during and the address quirks, not the switch', () => {
    const s = world();
    running(s);
    const t = quirkLine(s)!.text;
    expect(t).toContain('hums under her breath');
    expect(t).toContain('by rank, mockingly');
    expect(t).not.toContain('locks the door');
  });

  it('a refresh sets it and a refresh drops it once nothing is due (it is derived, never stored)', () => {
    const map = new Map<string, Directive>();
    const b = { setDirective: (d: Directive) => { map.set(d.id, d); }, clearMatching: (f: (d: Directive) => boolean) => { for (const d of [...map.values()]) if (f(d)) map.delete(d.id); } };
    const s = world();
    refreshDynamicDirectives(b as never, s, reg);
    expect(map.has(`dynamic:quirk:${ANN}`)).toBe(true);
    s.scene!.participants = [ANN, BEA];
    refreshDynamicDirectives(b as never, s, reg);
    expect(map.has(`dynamic:quirk:${ANN}`)).toBe(false);
  });
});

describe('the report: `quirk_voiced { unitId, when }`', () => {
  it('is a model-reportable dynamic type with a row of zeros', () => {
    expect(EVENT_TYPES as readonly string[]).toContain('quirk_voiced');
    expect(DYNAMIC_INTENT_TYPES).toContain('quirk_voiced');
    expect(typeof reg.eventDeltas.get('quirk_voiced')?.cause).toBe('string');
    for (const sev of ['minor', 'moderate', 'major', 'extreme'] as const) expect((reg.eventDeltas.get('quirk_voiced') as unknown as { rows: Record<string, unknown> }).rows[sev]).toEqual({});
  });

  it('is offered with the due quirks and their words, only in a scene', () => {
    const s = world();
    const o = dynamicIntentInput(s, reg, s.scene!.participants, 'scene').dynamic!;
    expect(o.types).toContain('quirk_voiced');
    expect(o.quirks).toEqual([{ unitId: ANN, when: 'switch' }]);
    expect(o.quirkTexts).toEqual({ [`${ANN}:switch`]: 'she locks the door and takes off her glasses' });
    expect(dynamicIntentInput(s, reg, [ANN], 'dm').dynamic?.quirks ?? []).toEqual([]);
    const none = dynamicIntentInput(world({ quirks: null }), reg, [ANN], 'scene');
    expect(none.dynamic?.types ?? []).not.toContain('quirk_voiced');
  });

  it('validateIntents keeps a reported `when` that was offered and drops an unknown or an unoffered one', () => {
    const s = world();
    const offer = dynamicIntentInput(s, reg, s.scene!.participants, 'scene').dynamic!;
    const ctx = { participants: [ANN], squad: s.squad, dynamic: offer };
    const e = (when: unknown) => ({ type: 'quirk_voiced', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she locked the door', confidence: 0.9, when });
    const kept = validateIntents({ events: [e('switch')] }, ctx).events;
    expect(kept).toHaveLength(1);
    expect((kept[0] as unknown as { when: string }).when).toBe('switch');
    expect(validateIntents({ events: [e('forever')] }, ctx).events).toEqual([]); // an unknown when
    expect(validateIntents({ events: [e('after')] }, ctx).events).toEqual([]); // not offered now
    expect(validateIntents({ events: [e(undefined)] }, ctx).events).toEqual([]);
    expect(validateIntents({ events: [e('switch')] }, { participants: [ANN], squad: s.squad }).events).toEqual([]); // no offer at all
    expect(validateIntents({ events: [e('switch'), e('switch')] }, ctx).events).toHaveLength(1); // counted once
  });

  it('applying it spends the quirk for the scene: no more offer, no more line, and a second report does nothing', () => {
    const s = world();
    expect(applyDynamicIntent(s, { registries: reg }, ANN, voiced(s, 'switch'))).toEqual([]);
    expect(s.dynamic!.quirkScene).toEqual({ sceneId: s.scene!.id, units: { [ANN]: { voiced: ['switch'] } } });
    expect(whens(s)).toEqual([]);
    expect(quirkLine(s)).toBeUndefined();
    expect(dynamicIntentInput(s, reg, [ANN], 'scene').dynamic?.quirks ?? []).toEqual([]);
    const before = structuredClone(s.dynamic);
    applyDynamicIntent(s, { registries: reg }, ANN, voiced(s, 'switch'));
    expect(s.dynamic).toEqual(before);
    running(s); // the other kinds are still there
    expect(whens(s).sort()).toEqual(['address', 'during']);
  });

  it('an unknown or an unoffered `when` in a report that got this far writes nothing', () => {
    const s = world();
    const before = structuredClone(s.dynamic);
    applyDynamicIntent(s, { registries: reg }, ANN, voiced(s, 'forever'));
    applyDynamicIntent(s, { registries: reg }, ANN, voiced(s, 'after'));
    expect(s.dynamic).toEqual(before);
  });

  it('a new scene forgets what was voiced and what ran (ids repeat across campaigns; the set is keyed by the scene)', () => {
    let s = world();
    applyDynamicIntent(s, { registries: reg }, ANN, voiced(s, 'switch'));
    running(s);
    s = sync(s);
    expect(s.dynamic!.quirkScene!.units[ANN]).toEqual({ voiced: ['switch'], ran: true });
    s.scene!.id = 'another_scene';
    stopped(s);
    expect(whens(s)).toEqual(['switch']); // not spent, and nothing ran, in this scene
    s = sync(s); // nothing runs: the sync writes nothing
    expect(s.dynamic!.quirkScene!.sceneId).not.toBe('another_scene');
    running(s);
    s = sync(s);
    expect(s.dynamic!.quirkScene).toEqual({ sceneId: 'another_scene', units: { [ANN]: { voiced: [], ran: true } } });
  });
});

describe('the sync (which writes the one thing a derived directive cannot know: that a run was seen)', () => {
  it('is due only while a run of a holder with quirks is on and not noted; it writes nothing when no one runs', () => {
    const s = world();
    expect(quirkSyncDue(s, reg)).toBe(false);
    running(s);
    expect(quirkSyncDue(s, reg)).toBe(true);
    const after = sync(s);
    expect(quirkSyncDue(after, reg)).toBe(false); // noted: no loop
    const calm = world();
    const same = sync(calm);
    expect(same.dynamic!.quirkScene).toBeUndefined();
  });

  it('a holder with no quirks is never noted', () => {
    const s = world({ quirks: null });
    running(s);
    expect(quirkSyncDue(s, reg)).toBe(false);
    expect(sync(s).dynamic!.quirkScene).toBeUndefined();
  });
});

describe('the controller notes a run once, only while it is due', () => {
  function rig(initial: CampaignState) {
    const h = worldHarness(reg, initial);
    const context = { setDirective: () => {}, clearMatching: () => {} };
    const ctl = createDynamic({ ...h.deps, context: context as never, refreshContext: vi.fn() });
    return { h, ctl };
  }

  it('a settled dispatch while a run of hers is on dispatches the sync once; nothing is dispatched when no run is on', () => {
    const s = world();
    running(s);
    const { h, ctl } = rig(s);
    const spy = vi.spyOn(h.deps.app, 'dispatch');
    ctl.onEvents([{ type: 'scene_exchange' }]);
    expect(spy.mock.calls.filter(([a]) => a.type === 'dynamic/quirk_sync')).toHaveLength(1);
    expect(h.deps.app.current().state!.dynamic!.quirkScene!.units[ANN].ran).toBe(true);
    spy.mockClear();
    ctl.onEvents([{ type: 'scene_exchange' }]); // noted: no second dispatch
    expect(spy).not.toHaveBeenCalled();
    const calm = rig(world());
    const calmSpy = vi.spyOn(calm.h.deps.app, 'dispatch');
    calm.ctl.onEvents([{ type: 'scene_exchange' }]);
    calm.ctl.onSceneOpened();
    expect(calmSpy).not.toHaveBeenCalled();
  });
});
