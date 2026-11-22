import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import { answerProbe } from '../../src/engine/dynamic/probes';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { Frame, ProfileStyle } from '../../src/engine/dynamic/types';
import type { CampaignState } from '../../src/engine/state/types';
import { clearDynamicDirectives, DYNAMIC_PREFIX, dynamicDirectives, refreshDynamicDirectives } from '../../src/dynamic/directives';
import { createDynamic } from '../../src/dynamic/controller';
import type { Directive } from '../../src/llm/context';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Ann holds at `frame` (a scene with her open); her pair `primary` + `secondary`. */
function world(over: { frame?: Frame; primary?: ProfileStyle; secondary?: ProfileStyle; present?: string[]; scene?: boolean } = {}): CampaignState {
  const s = campaign(reg, 3);
  setRelation(s, ANN, { stateId: 'comrade' });
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } },
      style: over.secondary === undefined ? { primary: over.primary ?? 'cold' } : { primary: over.primary ?? 'cold', secondary: over.secondary },
      audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'play', hold: 30 };
  if (over.scene === false) return s;
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: over.present ?? [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const withProbe = (s: CampaignState): CampaignState => {
  dynamicOf(s, ANN)!.probes = { pending: { axis: 'space', tier: 1, day: s.day }, lastDay: s.day, answers: [], issued: 1 };
  dynamicOf(s, ANN)!.frame = 'equal';
  s.dynamic!.queue = [ANN];
  return s;
};
/** A stand-in for the context builder that keeps the directives it was given. */
function builder() {
  const map = new Map<string, Directive>();
  return {
    setDirective: (d: Directive) => { map.set(d.id, d); },
    clearMatching: (f: (d: Directive) => boolean) => { for (const d of [...map.values()]) if (f(d)) map.delete(d.id); },
    directiveIds: () => [...map.keys()],
  };
}
const dirs = (s: CampaignState, present = s.scene?.participants ?? [ANN]): Directive[] => dynamicDirectives(s, reg, present);
const byId = (ds: Directive[], id: string): Directive | undefined => ds.find((d) => d.id === id);

describe('the tone of low Regard reaches every woman in the room (I5)', () => {
  it('a present non-holder at low Regard gets dynamic:regard:<id> with her style form; one with no practice section gets a neutral form; no number', () => {
    const s = world({ frame: 'equal', primary: 'cruel', present: [ANN, BEA] });
    s.relations[ANN].regard = 25;
    s.relations[BEA].regard = 5;
    const ds = dirs(s);
    const ann = byId(ds, `dynamic:regard:${ANN}`)!;
    expect(ann.expiresAfter).toBe('scene');
    expect(ann.text).toContain('contempt, enjoyed');
    expect(ann.text).toContain('Ann');
    const bea = byId(ds, `dynamic:regard:${BEA}`)!;
    expect(bea.text).toContain('Bea');
    expect(bea.text).toMatch(/cool/i); // the neutral form
    for (const d of [ann, bea]) {
      expect(d.text).not.toMatch(/\d/);
      expect(d.text).not.toMatch(/\b(he|him|his)\b/i);
    }
  });

  it('nothing at neutral or above, for a woman not in the room, for a holder (her own line carries it) or while off', () => {
    const s = world({ frame: 'equal', primary: 'cruel', present: [ANN, BEA] });
    s.relations[ANN].regard = 55;
    s.relations[BEA].regard = 70;
    expect(dirs(s).filter((d) => d.id.startsWith('dynamic:regard:'))).toEqual([]);
    s.relations[ANN].regard = 25;
    s.relations[BEA].regard = 25;
    expect(dirs(s, [ANN]).map((d) => d.id)).toContain(`dynamic:regard:${ANN}`);
    expect(dirs(s, [ANN]).map((d) => d.id)).not.toContain(`dynamic:regard:${BEA}`);
    dynamicOf(s, ANN)!.frame = 'play';
    expect(dirs(s).map((d) => d.id)).not.toContain(`dynamic:regard:${ANN}`);
    expect(byId(dirs(s), `dynamic:${ANN}`)!.text).toContain('Her tone toward the commander');
    s.dynamic = undefined;
    expect(dirs(s)).toEqual([]);
  });
});

describe('the holder directive', () => {
  it('dynamic:<unitId> for a present holder at play: the frame\'s hint, the style line, no digit', () => {
    const s = world({ frame: 'play', primary: 'cold', secondary: 'ritual' });
    const d = byId(dirs(s), `dynamic:${ANN}`)!;
    expect(d).toBeDefined();
    expect(d.expiresAfter).toBe('scene');
    expect(d.text).toContain(reg.dynamicFrames.get('play')!.promptHint as string);
    expect(d.text).toContain('Ann');
    expect(d.text.toLowerCase()).toContain('cold');
    expect(d.text.toLowerCase()).toContain('ritual');
    expect(d.text).not.toMatch(/\d/);
  });

  it('with a claimed household_protocol, its words; a domain she has not claimed adds nothing', () => {
    const s = world({ frame: 'role' });
    expect(byId(dirs(s), `dynamic:${ANN}`)!.text).not.toContain(reg.dynamicDomains.get('household')!.promptHint as string);
    dynamicOf(s, ANN)!.domains = [{ id: 'household', since: s.day }];
    const d = byId(dirs(s), `dynamic:${ANN}`)!;
    expect(d.text).toContain(reg.dynamicDomains.get('household')!.promptHint as string);
    expect(d.text).toContain(reg.dynamicFrames.get('role')!.promptHint as string);
    expect(d.text).not.toMatch(/\d/);
  });

  it('the secondary that leads shows now; a recent refusal and an open milestone are hers to answer', () => {
    const s = world({ frame: 'play', primary: 'cold', secondary: 'ritual' });
    s.scene!.participants = [ANN, BEA];
    expect(byId(dirs(s), `dynamic:${ANN}`)!.text).toMatch(/ritual side/i); // before others: the secondary surfaces
    const calm = world({ frame: 'play' });
    expect(byId(dirs(calm), `dynamic:${ANN}`)!.text).not.toMatch(/answer/i);
    dynamicOf(calm, ANN)!.refusals = [calm.day];
    expect(byId(dirs(calm), `dynamic:${ANN}`)!.text).toMatch(/refus/i);
    const milestone = world({ frame: 'play' });
    milestone.dynamic!.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: reg.dynamicMilestones.keys().next().value as string, day: milestone.day, form: 'scene' });
    expect(byId(dirs(milestone), `dynamic:${ANN}`)!.text).toMatch(/waiting for the commander's answer/i);
  });

  it('not at equal, not for an absent holder', () => {
    expect(byId(dirs(world({ frame: 'equal' })), `dynamic:${ANN}`)).toBeUndefined();
    expect(dirs(world({ frame: 'play', present: [BEA] }), [BEA])).toEqual([]);
  });
});

describe('the probe directive', () => {
  it('dynamic:probe:<unitId> while her probe is pending and she is present, and gone after the answer', () => {
    const s = withProbe(world({ frame: 'equal' }));
    const d = byId(dirs(s), `dynamic:probe:${ANN}`)!;
    expect(d).toBeDefined();
    expect(d.expiresAfter).toBe('scene');
    const axis = reg.probeAxes.get('space')!;
    expect(d.text).toContain(axis.label as string);
    expect(d.text).toContain(axis.promptHint as string);
    expect(d.text).toMatch(/never name it/i);
    expect(d.text).not.toMatch(/\d/);
    expect(byId(dirs(s), `dynamic:${ANN}`)).toBeUndefined(); // no holder line at equal
    answerProbe(s, { registries: reg }, ANN, 'yielded', undefined, 1);
    expect(byId(dirs(s), `dynamic:probe:${ANN}`)).toBeUndefined();
  });

  it('not when she is not present, and one a scene', () => {
    expect(dirs(withProbe(world({ frame: 'equal', present: [BEA] })), [BEA])).toEqual([]);
    const s = withProbe(world({ frame: 'equal', present: [ANN, BEA] }));
    unitOf(s, BEA).bond = structuredClone(unitOf(s, ANN).bond!);
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), probes: { pending: { axis: 'touch', tier: 2, day: s.day }, answers: [], issued: 1 } };
    expect(dirs(s).filter((d) => d.id.startsWith('dynamic:probe:'))).toHaveLength(1);
  });
});

describe('while off', () => {
  it('nothing while off: no block, holders 0, or no practice category on', () => {
    const on = withProbe(world());
    expect(dirs(on).length).toBeGreaterThan(0);
    const none = structuredClone(on);
    delete none.dynamic;
    expect(dirs(none)).toEqual([]);
    const zero = structuredClone(on);
    zero.dynamic!.setup.holders = 0;
    expect(dirs(zero)).toEqual([]);
    const cat = structuredClone(on);
    cat.content = { enabled: [] };
    expect(dirs(cat)).toEqual([]);
  });

  it('refresh with no state clears; refresh sets and replaces', () => {
    const b = builder();
    refreshDynamicDirectives(b as never, world({ frame: 'play' }), reg);
    expect(b.directiveIds()).toContain(`dynamic:${ANN}`);
    refreshDynamicDirectives(b as never, withProbe(world()), reg);
    expect(b.directiveIds()).not.toContain(`dynamic:${ANN}`);
    expect(b.directiveIds()).toContain(`dynamic:probe:${ANN}`);
    b.setDirective({ id: 'life:news:x', text: 'x', expiresAfter: 'scene' });
    refreshDynamicDirectives(b as never, null, reg);
    expect(b.directiveIds()).toEqual(['life:news:x']);
    refreshDynamicDirectives(b as never, world({ frame: 'play' }), reg);
    clearDynamicDirectives(b as never);
    expect(b.directiveIds()).toEqual(['life:news:x']);
  });
});

describe('what the main model reads', () => {
  /** Every directive the states below can produce. */
  function all(): Directive[] {
    const states: CampaignState[] = [];
    states.push(world({ frame: 'play', primary: 'cruel', secondary: 'affectionate' }));
    const role = world({ frame: 'role', primary: 'possessive', secondary: 'ritual', present: [ANN, BEA] });
    dynamicOf(role, ANN)!.domains = reg.dynamicDomains.size > 0 ? [...reg.dynamicDomains.keys()].map((id) => ({ id, since: role.day })) : [];
    dynamicOf(role, ANN)!.refusals = [role.day];
    role.dynamic!.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: reg.dynamicMilestones.keys().next().value as string, day: role.day, form: 'scene' });
    states.push(role, withProbe(world()), world({ frame: 'rule', primary: 'regal' }));
    return states.flatMap((s) => dirs(s));
  }

  it('no pronoun for the commander and no feeling word about the commander', () => {
    const texts = all().map((d) => d.text);
    expect(texts.length).toBeGreaterThanOrEqual(4);
    for (const t of texts) {
      expect(t).not.toMatch(/\b(he|him|his|himself)\b/i);
      expect(t).not.toMatch(/commander[^.]*\btheir\b/i);
      for (const w of ['feels', 'feel', 'wants to', 'ashamed', 'aroused', 'loves', 'fears']) expect(t, w).not.toMatch(new RegExp(`the commander[^.]*\\b${w}\\b`, 'i'));
      expect(t).not.toMatch(/\d/);
    }
  });

  it('the prefix is not reserved by another package, and every id starts with dynamic:', () => {
    const OLDER = [
      'loyalty:', 'refusal:', 'threat:', 'discipline:', 'demand:', 'reputation:', 'nickname', 'content', 'limits:', 'lead', 'boundary:', 'want:', 'rule:',
      'publicity:', 'co_command:', 'ask:', 'prologue:', 'world:', 'stance:', 'friction:', 'personal:', 'special:', 'power:', 'warden:', 'development:', 'head_start:',
      'smother:', 'life:', 'blocking:', 'moment:', 'physics:', 'onboarding:', 'night', 'proposal:',
    ];
    expect(DYNAMIC_PREFIX).toBe('dynamic:');
    for (const p of OLDER) {
      expect('dynamic:'.startsWith(p), p).toBe(false);
      expect(p.startsWith('dynamic:'), p).toBe(false);
    }
    for (const d of all()) {
      expect(d.id.startsWith('dynamic:'), d.id).toBe(true);
      expect(OLDER.some((p) => d.id.startsWith(p)), d.id).toBe(false);
    }
  });
});

describe('the controller', () => {
  function rig(initial: CampaignState) {
    const h = worldHarness(reg, initial);
    const directives = new Map<string, { id: string; text: string }>();
    const context = {
      setDirective: (d: { id: string; text: string }) => { directives.set(d.id, d); },
      clearMatching: (f: (d: { id: string }) => boolean) => { for (const d of [...directives.values()]) if (f(d)) directives.delete(d.id); },
    };
    const refreshContext = vi.fn();
    const ctl = createDynamic({ ...h.deps, context: context as never, refreshContext });
    return { h, ctl, directives, refreshContext };
  }

  it('a scene opening sets the directives, closing it (a chat switch too) clears them', () => {
    const { ctl, directives, refreshContext } = rig(world({ frame: 'play' }));
    ctl.onSceneOpened();
    expect([...directives.keys()]).toEqual([`dynamic:${ANN}`]);
    expect(refreshContext).toHaveBeenCalled();
    refreshContext.mockClear();
    ctl.onSceneClosed();
    expect([...directives.keys()]).toEqual([]);
    expect(refreshContext).toHaveBeenCalled();
  });

  it('a chat switch clears them: another chat\'s directives are never carried over', () => {
    const { h, ctl, directives } = rig(world({ frame: 'play' }));
    ctl.onSceneOpened();
    h.switchChat('other');
    ctl.onSceneClosed(); // what the app does on a load
    expect(directives.size).toBe(0);
  });

  it('events of the dynamic refresh the context; others do not', () => {
    const { ctl, refreshContext } = rig(world({ frame: 'equal' }));
    ctl.onEvents([{ type: 'relation_changed' }, { type: 'scene_exchange' }]);
    expect(refreshContext).not.toHaveBeenCalled();
    ctl.onEvents([{ type: 'probe_issued', unitId: ANN, axis: 'space', tier: 1 }]);
    expect(refreshContext).toHaveBeenCalledTimes(1);
    ctl.onEvents([{ type: 'hold_band_changed', unitId: ANN, from: 'interest', to: 'testing' }]);
    expect(refreshContext).toHaveBeenCalledTimes(2);
    ctl.onEvents([{ type: 'compromat_revealed', unitId: ANN, factId: 'fr1' }]); // what she keeps and says changes the lines of the dynamic (M9)
    ctl.onEvents([{ type: 'compromat_told', unitId: ANN, factId: 'fr1' }]);
    expect(refreshContext).toHaveBeenCalledTimes(4);
  });

  it('nothing is set while off', () => {
    const s = world({ frame: 'play' });
    delete s.dynamic;
    const { ctl, directives } = rig(s);
    ctl.onSceneOpened();
    expect(directives.size).toBe(0);
  });
});
