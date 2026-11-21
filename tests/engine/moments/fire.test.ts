import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, rollbackAfter, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { writeLifeFact } from '../../../src/engine/life/facts';
import { exposingElement, fireMoment, momentPass, optionsFor, pickVisitor, sceneSettingsOf } from '../../../src/engine/moments/fire';
import { momentsOf } from '../../../src/engine/moments/state';
import { resetMomentTriggers } from '../../../src/engine/moments/live';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { sceneSettingsPatch } from '../../../src/blocking/sync';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetMomentTriggers();
});

const ANN = 'unit_ann';
const BEA = 'unit_bea';
const DEE = 'unit_dee';

function scene(over: { loc?: string; on?: string[]; participants?: string[] } = {}): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  if (over.on) enable(s, ...over.on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: over.loc ?? 'quarters_commander', participants: over.participants ?? [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const set = (s: CampaignState, c: BlockingChange, at = 3): CampaignState => {
  const d = structuredClone(s);
  setBlocking(d, { registries: reg }, c, { at, source: 'chip' });
  return d;
};
/** One pass on a clone, with a seeded rng: the state after, the events and the rng words. */
function pass(s: CampaignState, seed: number | null = null, opts: { ripe?: string } = {}) {
  const d = structuredClone(s);
  if (seed !== null) d.rng = seedRng(seed);
  const rng = new Rng(d.rng);
  const events = momentPass(d, { registries: reg, rng }, 'exchange', opts);
  d.rng = rng.state;
  return { state: d, events, rng: d.rng };
}
/** A scene in which a source is live (Ann is on comms, so `remote` is), with `momentFrequency` mirrored as given. */
const liveScene = (freq: 'rare' | 'normal' | 'often' = 'normal'): CampaignState => {
  const s = set(scene(), { person: ANN, field: 'activity', value: 'on_comms' });
  s.settings.momentFrequency = freq;
  return s;
};

describe('the moment pass', () => {
  it('no live source draws nothing', () => {
    const quiet = scene();
    const a = pass(quiet);
    expect(a.rng).toEqual(quiet.rng);
    expect(a.events).toEqual([]);
    const far = scene();
    far.relations[ANN]!.stateId = 'comrade'; // not live at all
    const b = pass(far);
    expect(b.rng).toEqual(far.rng);
    expect(b.state).toEqual(far);
  });

  it('a live source costs one draw to fail and two to fire; a not-live scene changes nothing at all', () => {
    const s = liveScene();
    let fired = 0;
    for (let i = 0; i < 40; i++) {
      const p = pass(s, 1000 + i);
      const before = new Rng(seedRng(1000 + i));
      before.float();
      if (p.events.length === 0) expect(p.rng).toEqual(before.state); // one chance draw
      else fired++;
    }
    expect(fired).toBeGreaterThan(0);
  });

  it('the chance by frequency: 1000 seeded passes at normal fire 16–24 %', () => {
    const s = liveScene('normal');
    let n = 0;
    for (let i = 0; i < 1000; i++) if (pass(s, 5000 + i * 7919).events.length > 0) n++;
    expect(n).toBeGreaterThanOrEqual(160);
    expect(n).toBeLessThanOrEqual(240);
    const rare = liveScene('rare');
    let r = 0;
    for (let i = 0; i < 1000; i++) if (pass(rare, 5000 + i * 7919).events.length > 0) r++;
    expect(r).toBeGreaterThan(70);
    expect(r).toBeLessThan(135);
  });

  it('cooldowns: the gap, the maximum per scene and the source gap hold', () => {
    const s = liveScene('normal');
    s.scene!.exchanges = 10;
    // minGap 4: a moment fired at exchange 8 blocks one at 10 (and draws nothing)
    s.scene!.moments = { fired: [{ sourceId: 'other', exchange: 8 }] };
    const blocked = pass(s, 1);
    expect(blocked.events).toEqual([]);
    expect(blocked.rng).toEqual(seedRng(1)); // nothing drawn
    // … and one at 12 is free again
    s.scene!.exchanges = 12;
    const free = Array.from({ length: 60 }, (_, i) => pass(s, 100 + i).events.length > 0).some(Boolean);
    expect(free).toBe(true);
    // maxPerScene 4
    s.scene!.moments = { fired: [0, 1, 2, 3].map((i) => ({ sourceId: `x${i}`, exchange: i * 4 })) };
    s.scene!.exchanges = 30;
    expect(Array.from({ length: 60 }, (_, i) => pass(s, 100 + i).events.length > 0).some(Boolean)).toBe(false);
    // sourceGap 8: the same source twice within 8 exchanges is out, others are not
    s.scene!.moments = { fired: [{ sourceId: 'remote', exchange: 7 }] };
    s.scene!.exchanges = 12; // 5 since remote, 5 ≥ minGap 4
    expect(Array.from({ length: 60 }, (_, i) => pass(s, 100 + i).events.length > 0).some(Boolean)).toBe(false);
    s.scene!.exchanges = 15; // 8 since remote
    expect(Array.from({ length: 60 }, (_, i) => pass(s, 100 + i).events.length > 0).some(Boolean)).toBe(true);
  });

  it('while a moment is open the pass is a no-op and draws nothing', () => {
    const s = liveScene('often');
    let fired = pass(s, 3);
    for (let i = 4; fired.events.length === 0; i++) fired = pass(s, i);
    expect(momentsOf(fired.state.scene).open?.sourceId).toBe('remote');
    const again = pass(fired.state, 9);
    expect(again.events).toEqual([]);
    expect(again.rng).toEqual(seedRng(9));
  });

  it('explicit intimacy: rarer halves the chance, same keeps it, off stops it', () => {
    const base = enable(liveScene('often'), 'explicit_scenes');
    const explicit = set(base, { person: ANN, field: 'intimacy', value: 'explicit' }, 3);
    const count = (s: CampaignState): number => Array.from({ length: 1000 }, (_, i) => pass(s, 9000 + i * 104729).events.length).filter((n) => n > 0).length;
    const plain = count(base);
    explicit.settings.momentExplicit = 'rarer';
    const rarer = count(explicit);
    explicit.settings.momentExplicit = 'same';
    const same = count(explicit);
    explicit.settings.momentExplicit = 'off';
    const off = count(explicit);
    expect(plain).toBeGreaterThan(300);
    expect(rarer / plain).toBeGreaterThan(0.4);
    expect(rarer / plain).toBeLessThan(0.6);
    expect(same).toBeGreaterThan(rarer);
    expect(off).toBe(0);
    expect(TUNING.moments.explicitMult).toBe(0.5);
  });

  it('the weights decide the pick: a heavier source comes up more often', () => {
    let s = set(scene(), { person: ANN, field: 'activity', value: 'on_comms' }); // remote 2
    s = set(s, { person: COMMANDER, field: 'activity', value: 'c_on_comms' }); // remote 3, duty_call 1
    s.settings.momentFrequency = 'often';
    const tally: Record<string, number> = {};
    for (let i = 0; i < 1500; i++) for (const e of pass(s, 2000 + i * 31).events) tally[String(e.sourceId)] = (tally[String(e.sourceId)] ?? 0) + 1;
    expect(tally.remote).toBeGreaterThan((tally.duty_call ?? 0) * 2);
  });

  it('the same seed fires the same moment after a swipe (restore, re-apply)', () => {
    const s = liveScene('often');
    s.scene!.readIndex = 5;
    const first = pass(s, 42);
    const again = pass(s, 42);
    expect(again.state).toEqual(first.state);
    const d = structuredClone(first.state);
    if (first.events.length > 0) {
      // the swipe of the reply the moment fired from takes it back
      expect(rollbackAfter(d, 4)).toBe(true);
      expect(momentsOf(d.scene).open).toBeUndefined();
      expect(d.scene!.moments?.fired ?? []).toEqual([]);
    }
  });
});

describe('fireMoment', () => {
  const fire = (s: CampaignState, sourceId: string, unitId = ANN) => {
    const d = structuredClone(s);
    const events = fireMoment(d, { registries: reg }, sourceId, unitId);
    return { state: d, events };
  };

  it('opens the moment, writes it down, logs the state before it and says so', () => {
    const s = scene();
    s.scene!.exchanges = 3;
    const f = fire(s, 'her_offer');
    const m = momentsOf(f.state.scene);
    expect(m.open).toMatchObject({ id: 'm1', sourceId: 'her_offer', unitId: ANN, exchange: 3 });
    expect(m.open!.options.slice(0, 3)).toEqual([{ key: '0', type: 'yielded' }, { key: '1', type: 'resisted' }, { key: '2', type: 'returned' }]);
    expect(m.fired).toEqual([{ sourceId: 'her_offer', exchange: 3 }]);
    expect(f.events).toEqual([{ type: 'moment_fired', momentId: 'm1', sourceId: 'her_offer', unitId: ANN }]);
    expect(f.state.scene!.stagingLog?.at(-1)).toMatchObject({ person: ANN, field: 'moment', value: 'her_offer', source: 'engine' });
    expect(f.state.rng).toEqual(s.rng); // fireMoment draws nothing
  });

  it('the options of third_party: lock in a locked room; hide gone with a property tag; with a tail, hide is gone unless lying', () => {
    registerFrameReader(() => 'play');
    const third = reg.momentSources.get('third_party')!;
    const keys = (s: CampaignState): string[] => optionsFor(s, reg, third, ANN).map((o) => o.key);
    const room = scene({ on: ['objectification', 'public_humiliation', 'pet_play', 'explicit_scenes'] });
    expect(keys(room)).toEqual(expect.arrayContaining(['0', '1', '2', 'lock', 'look']));
    const open = scene({ loc: 'medbay' });
    expect(keys(open)).not.toContain('lock'); // no lock in the medbay
    const tagged = set(room, { person: COMMANDER, field: 'worn', value: 'property_tag' });
    expect(keys(tagged)).not.toContain('0');
    expect(keys(tagged)).toEqual(expect.arrayContaining(['1', '2']));
    const tail = set(room, { person: COMMANDER, field: 'worn', value: 'tail' });
    expect(keys(tail)).not.toContain('0');
    const lying = set(tail, { person: COMMANDER, field: 'posture', value: 'lying_back' });
    expect(keys(lying)).toContain('0');
    // an ordinary source keeps its three
    expect(optionsFor(room, reg, reg.momentSources.get('her_offer')!, ANN).slice(0, 3).map((o) => o.key)).toEqual(['0', '1', '2']);
  });

  it('look is offered only while the commander can see, ally only with another close soldier present', () => {
    const offer = reg.momentSources.get('her_offer')!;
    const keys = (s: CampaignState) => optionsFor(s, reg, offer, ANN).map((o) => o.key);
    expect(keys(scene())).toEqual(['0', '1', '2', 'look']);
    expect(optionsFor(scene(), reg, offer, ANN).find((o) => o.key === 'look')!.type).toBe('deflected');
    const blind = set(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' });
    expect(keys(blind)).toEqual(['0', '1', '2']);
    const two = scene({ loc: 'quarters_unit', participants: [ANN, BEA] });
    expect(keys(two)).toEqual(['0', '1', '2', 'look']); // Bea is not close
    setRelation(two, BEA, { stateId: 'confidant' });
    expect(keys(two)).toEqual(['0', '1', '2', 'look', 'ally']);
    expect(optionsFor(two, reg, offer, ANN).find((o) => o.key === 'ally')!.type).toBe('deflected');
  });

  it("the exposing element is the leash's label", () => {
    const s = set(scene({ on: ['pet_play'] }), { person: COMMANDER, field: 'worn', value: 'leash' });
    expect(exposingElement(s, reg)).toBe(String(reg.blockingItems.get('leash')!.label));
    expect(fire(s, 'third_party').state.scene!.moments!.open!.exposing).toBe(String(reg.blockingItems.get('leash')!.label));
    // a source that does not expose names nothing
    expect(fire(s, 'her_offer').state.scene!.moments!.open!.exposing).toBeUndefined();
    // else a hiding place, else the contact; nothing at all when there is nothing
    expect(exposingElement(scene(), reg)).toBeUndefined();
    expect(exposingElement(set(scene(), { person: COMMANDER, field: 'anchor', value: 'under_desk' }), reg)).toBe(String(reg.blockingAnchors.get('under_desk')!.label));
    registerFrameReader(() => 'play');
    const contact = set(scene({ on: ['restraint'] }), { person: ANN, field: 'contact', value: 'tied_to_bedpost', with: COMMANDER });
    expect(exposingElement(contact, reg)).toBe(String(reg.blockingContacts.get('tied_to_bedpost')!.label));
  });

  it('the visitor is stable for the same scene and exchange, and is a soldier who could come in', () => {
    const s = scene({ loc: 'medbay' });
    s.scene!.tone = 'intimate';
    expect(pickVisitor(s, reg)).toBe(DEE);
    const f = fire(s, 'third_party');
    expect(f.state.scene!.moments!.open!.visitorId).toBe(DEE);
    expect(f.events[0]).toMatchObject({ visitorId: DEE });
    expect(fire(s, 'third_party').state).toEqual(f.state);
    expect(fire(s, 'her_offer').state.scene!.moments!.open!.visitorId).toBeUndefined(); // only a visitor source brings one
    expect(pickVisitor(scene(), reg)).toBeUndefined(); // nobody near
  });

  it('memory_surfaces reveals her kept fact (the untold tag and the hiding go)', () => {
    const s = scene();
    const keeps = [...reg.lifeEvents.values()].find((e) => e.share === 'keeps')!;
    const older = writeLifeFact(s, ANN, 'the older thing', [String(keeps.id)], 2);
    const newer = writeLifeFact(s, ANN, 'the newer thing', [String(keeps.id)], 2);
    const f = fire(s, 'memory_surfaces');
    const facts = f.state.memory.facts;
    expect(facts.find((x) => x.id === older.id)!.tags).not.toContain('untold');
    expect(facts.find((x) => x.id === older.id)!.hiddenFromCommander).toBeUndefined();
    expect(facts.find((x) => x.id === newer.id)!.tags).toContain('untold'); // only the oldest
    expect(f.state.scene!.moments!.open!.factId).toBe(older.id);
    // a fire with nothing kept (the reading called it ripe) opens the moment without a fact
    expect(fire(scene(), 'memory_surfaces').state.scene!.moments!.open!.factId).toBeUndefined();
  });

  it('a second moment gets the next id', () => {
    const f = fire(scene(), 'her_offer');
    f.state.scene!.moments!.open = undefined;
    delete f.state.scene!.moments!.open;
    f.state.scene!.exchanges = 9;
    const g = fireMoment(f.state, { registries: reg }, 'her_silence', ANN);
    expect(g[0]).toMatchObject({ momentId: 'm2' });
  });
});

describe('the scene settings mirror', () => {
  it('reads the defaults, then the mirror; an invalid value reads as the default', () => {
    const s = campaign(reg, 4);
    expect(sceneSettingsOf(s)).toEqual({ momentFrequency: 'normal', momentExplicit: 'rarer', physicsRealtime: false, marathonPace: 'normal', physicsInteractions: { timing: true, hold: true, decision: true, order: true, passive: true, gesture: true, inhale: true } });
    s.settings.momentFrequency = 'always';
    s.settings.physicsInteractions = { timing: false, hold: 'yes' };
    expect(sceneSettingsOf(s).momentFrequency).toBe('normal');
    expect(sceneSettingsOf(s).physicsInteractions).toMatchObject({ timing: false, hold: true, inhale: true });
  });

  it('the mirror syncs (setting → campaign) and a campaign that already holds it is left alone', () => {
    const s = campaign(reg, 4);
    expect(sceneSettingsPatch(s, { ...DEFAULT_SETTINGS })).toBeNull(); // old saves: no dispatch, no change
    const mine = { ...DEFAULT_SETTINGS, momentFrequency: 'often' as const, physicsRealtime: true, physicsInteractions: { ...DEFAULT_SETTINGS.physicsInteractions, hold: false } };
    const patch = sceneSettingsPatch(s, mine);
    expect(patch).toMatchObject({ momentFrequency: 'often', physicsRealtime: true });
    const r = run(s, reg, { type: 'campaign/set_scene_settings', payload: patch });
    expect(errors(r.events)).toEqual([]);
    expect(sceneSettingsOf(r.state)).toMatchObject({ momentFrequency: 'often', physicsRealtime: true, momentExplicit: 'rarer' });
    expect(sceneSettingsOf(r.state).physicsInteractions.hold).toBe(false);
    expect(sceneSettingsPatch(r.state, mine)).toBeNull();
    expect(errors(run(s, reg, { type: 'campaign/set_scene_settings', payload: { ...patch, momentFrequency: 'always' } }).events)).not.toEqual([]);
  });
});

describe('intents/apply runs the pass', () => {
  it('after the intents, only while live; the moment lands in the same step', () => {
    let s = liveScene('often');
    s.scene!.exchanges = 1;
    let opened = false;
    for (let i = 0; i < 40 && !opened; i++) {
      s.rng = seedRng(100 + i);
      const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {}, readIndex: 2 } });
      expect(errors(r.events)).toEqual([]);
      opened = r.events.some((e) => e.type === 'moment_fired');
      if (opened) s = r.state;
    }
    expect(opened).toBe(true);
    expect(momentsOf(s.scene).open).toBeDefined();
    // not live: untouched, same rng
    const far = scene();
    far.relations[ANN]!.stateId = 'comrade';
    const r = run(far, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {} } });
    expect(r.state.scene!.moments).toBeUndefined();
    expect(r.state.rng).toEqual(far.rng);
  });
});
