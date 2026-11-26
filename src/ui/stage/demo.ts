/**
 * P10e-f: the demo states that start each instrument, with her as the holder: the preview of a slot (`preview.ts`) runs the real scene
 * screen on one, and the layout test (`tests/layout/mkstate.ts`) builds its instrument fixtures from the same builders, so there is one
 * copy. Each is a throwaway campaign built as the wizard builds one (her and three others, the Vesper start), a scene in the commander's
 * quarters with her, the blocking that starts the instrument and its first segment running in real time (the campaign's mirror on).
 *
 * Fixture data, never a campaign: nothing here is saved, dispatched into the open campaign or remembered. The engine actions it runs
 * (`scene/start`) must be registered by the caller (the app registers every action; the layout test its helpers').
 */
import type { Registries } from '../../content/types';
import { COMMANDER, registerFrameReader, setBlocking } from '../../engine/blocking';
import { dispatch } from '../../engine/dispatch';
import { blankDynamic, newDynamicCampaign } from '../../engine/dynamic/state';
import type { Frame } from '../../engine/dynamic/types';
import { flowOf } from '../../engine/physics/gulp';
import { blankPractices } from '../../engine/practice/state';
import { buildCampaign, type UnitSetup } from '../../engine/setup';
import type { Bond, CampaignState } from '../../engine/state/types';
import { GULP_STYLES } from '../../engine/tuning';
import type { SlotKey } from './slots';

/** Her as the demo needs her: her card (the sprites and her stage folder are keyed by it) and her name. */
export interface DemoUnit {
  id: string;
  cardRef: string;
  displayName: string;
}

/**
 * While a demo is built (synchronously), a contact of `scope: 'dynamic'` needs her at frame `play`: the demo has no dynamic of its own,
 * so a reader answers `play` for that moment only and null at every other time (the open campaign never reads it). Registered at the
 * first build, after the app's own readers; the layout test registers a `play` reader of its own before it builds.
 */
let building = false;
let readerOn = false;
function withPlayFrame<T>(fn: () => T): T {
  if (!readerOn) {
    registerFrameReader(() => (building ? 'play' : null));
    readerOn = true;
  }
  building = true;
  try {
    return fn();
  } finally {
    building = false;
  }
}

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const setupOf = (displayName: string, cardRef: string): UnitSetup => ({
  cardRef, displayName, roleId: 'assault',
  signature: { templateId: 'sig_last_stand', name: 'Last Stand', description: 'She holds the line.' },
  defects: [{ id: 'echo_bleed', origin: 'Heard things.' }],
  values: { ...ZERO }, likes: [], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 },
});
const OTHERS = ['Bea', 'Cat', 'Dee', 'Eve', 'Fay', 'Gia'];
const slugOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** A campaign as the wizard builds one: her first, then `n - 1` others (named apart from her), the Vesper start, the mutiny crime. */
function base(reg: Registries, her: DemoUnit, n: number): CampaignState {
  const others = OTHERS.filter((nm) => slugOf(nm) !== slugOf(her.displayName) && `${nm.toLowerCase()}.png` !== her.cardRef).slice(0, n - 1);
  const r = buildCampaign(
    { commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [setupOf(her.displayName, her.cardRef), ...others.map((nm) => setupOf(nm, `${nm.toLowerCase()}.png`))] },
    reg, { desireBondDefects: false, seed: 11 },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
}

/** Her in a demo state: the first of the squad (her id follows the wizard's rule, `unit_<her name>`; she is found by her card). */
const herOf = (s: CampaignState) => s.squad[0]!;
const confide = (s: CampaignState, id: string): void => { s.relations[id]!.stateId = 'confidant'; };
const enable = (s: CampaignState, ...ids: string[]): void => { s.content = { enabled: [...ids] }; };
const start = (s: CampaignState, reg: Registries, participants: string[]): CampaignState => {
  const r = dispatch(s, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants, origin: 'event', consumesSlot: false, startIndex: 0 } }, reg);
  if (r.events.some((e) => e.type === 'error')) throw new Error(JSON.stringify(r.events.filter((e) => e.type === 'error')));
  return r.state;
};
const running = (d: CampaignState, beats: NonNullable<NonNullable<CampaignState['scene']>['physics']>['segment']['plan']): void => {
  d.scene!.physics!.segment = { n: 1, state: 'running', plan: beats };
};
const busy = (n: number) => ({ beats: Array.from({ length: n }, () => ({ attention: 'busy' as const })) });

/** A bond profile that practises `restraint` (and the categories in `also`) as `enjoys`. */
function holderBond(also: string[] = []): Bond {
  return {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: Object.fromEntries(['restraint', ...also].map((c) => [c, { as: 'enjoys' as const, witness: 'indifferent' as const }])),
      style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    },
  } as Bond;
}

/** She holds at `frame` (the dynamic on, `restraint`, `public_humiliation`, `denial` and `service` enabled), two others with no profile. */
function holding(reg: Registries, her: DemoUnit, frame: Frame): CampaignState {
  const s = base(reg, her, 3);
  const id = herOf(s).id;
  herOf(s).bond = holderBond(['public_humiliation', 'denial']);
  s.content = { enabled: ['restraint', 'public_humiliation', 'denial', 'service'] };
  herOf(s).bond!.practice!.categories.service = { as: 'enjoys', witness: 'indifferent' };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.day = 20;
  s.relations[id]!.dynamic = { ...blankDynamic(s.day), frame, hold: frame === 'equal' ? 10 : 30 };
  return s;
}

/** Her slap (possessive: a 450 ms swing) in the commander's quarters, the mirror of real time on. */
export function demoSlap(reg: Registries, her: DemoUnit): CampaignState {
  return withPlayFrame(() => {
    const s = holding(reg, her, 'role');
    const id = herOf(s).id;
    herOf(s).bond!.practice!.style = { primary: 'possessive' };
    confide(s, id);
    enable(s, 'pet_play', 'restraint', 'physical_discipline_shown', 'humiliation');
    const d = start(s, reg, [id]);
    d.settings.physicsRealtime = true; // the campaign's mirror of real time (the slap reads only reduced motion and the timing toggle)
    d.practices = { ...(d.practices ?? blankPractices()), seq: 2, slap: { id: 'ps1', holderId: id, sceneId: d.scene!.id, windowMs: 450, feints: 0 } };
    return d;
  });
}

/** She sits on the commander's face (`under_her_seat`: breath), the first segment running with her openings every second beat. */
export function demoBreath(reg: Registries, her: DemoUnit): CampaignState {
  return withPlayFrame(() => {
    const s = base(reg, her, 4);
    const id = herOf(s).id;
    confide(s, id);
    enable(s, 'objectification', 'restraint');
    s.settings.physicsRealtime = true;
    const d = start(s, reg, [id]);
    setBlocking(d, { registries: reg }, { person: id, field: 'contact', value: 'under_her_seat', with: COMMANDER }, { at: 1, source: 'engine' });
    if (!d.scene!.physics) throw new Error('breath: no hold runs');
    running(d, { beats: Array.from({ length: 14 }, (_, i) => (i % 2 === 1 ? { attention: 'watching' as const, cue: 'window_open' as const, opening: { widthMs: 600 } } : { attention: 'watching' as const })) });
    return d;
  });
}

/** Her weight on the commander (`human_chair`, `footrest` or `boot_on_chest`: face up, the `over` slot), a shift every fourth beat. */
export function demoWeight(reg: Registries, her: DemoUnit, contact: string): CampaignState {
  return withPlayFrame(() => {
    const s = base(reg, her, 4);
    const id = herOf(s).id;
    confide(s, id);
    enable(s, 'objectification', 'restraint', 'humiliation', 'pain_rough');
    s.settings.physicsRealtime = true;
    const d = start(s, reg, [id]);
    setBlocking(d, { registries: reg }, { person: id, field: 'contact', value: contact, with: COMMANDER }, { at: 1, source: 'engine' });
    if (d.scene!.physics?.physicsId !== 'weight') throw new Error(`weight (${contact}): no weight runs`);
    running(d, { beats: Array.from({ length: 20 }, (_, i) => (i % 4 === 3 ? { attention: 'busy' as const, cue: 'shift' as const, shift: 20 } : { attention: 'busy' as const })) });
    return d;
  });
}

/** Her feet on the commander's face (`feet_on_face`: saturation), her attention busy. */
export function demoScent(reg: Registries, her: DemoUnit): CampaignState {
  return withPlayFrame(() => {
    const s = base(reg, her, 4);
    const id = herOf(s).id;
    confide(s, id);
    enable(s, 'objectification', 'restraint', 'humiliation', 'worship', 'bodily_fluids');
    s.settings.physicsRealtime = true;
    const d = start(s, reg, [id]);
    setBlocking(d, { registries: reg }, { person: id, field: 'contact', value: 'feet_on_face', with: COMMANDER }, { at: 1, source: 'engine' });
    if (d.scene!.physics?.physicsId !== 'saturation') throw new Error('scent: no saturation runs');
    running(d, busy(20));
    return d;
  });
}

/** The jaw: her toes in the commander's mouth (`sole_to_mouth`) or the commander ring-gagged before her. */
export function demoJaw(reg: Registries, her: DemoUnit, source: 'toes' | 'ring'): CampaignState {
  return withPlayFrame(() => {
    const s = base(reg, her, 4);
    const id = herOf(s).id;
    confide(s, id);
    enable(s, 'objectification', 'restraint', 'humiliation', 'worship', 'service');
    s.settings.physicsRealtime = true;
    const d = start(s, reg, [id]);
    if (source === 'toes') setBlocking(d, { registries: reg }, { person: id, field: 'contact', value: 'sole_to_mouth', with: COMMANDER }, { at: 1, source: 'engine' });
    else setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, { at: 1, source: 'engine' });
    if (d.scene!.physics?.physicsId !== 'jaw') throw new Error(`jaw (${source}): no jaw runs`);
    running(d, { beats: Array.from({ length: 20 }, () => ({ attention: 'watching' as const })) });
    return d;
  });
}

/**
 * Her frame: she reads reports in the evening; the commander under her desk (`under_desk`: her legs seated) or, with `anchor`
 * `at_her_feet`, before her on the floor (her feet on the floor).
 */
export function demoActivity(reg: Registries, her: DemoUnit, anchor = 'under_desk'): CampaignState {
  return withPlayFrame(() => {
    const s = base(reg, her, 4);
    const id = herOf(s).id;
    confide(s, id);
    enable(s, 'objectification', 'worship', 'service');
    s.settings.physicsRealtime = true;
    s.slot = 'evening'; // the prototype's evening (18:00)
    const d = start(s, reg, [id]);
    setBlocking(d, { registries: reg }, { person: id, field: 'activity', value: 'reading_reports' }, { at: 1, source: 'engine' });
    setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'anchor', value: anchor }, { at: 1, source: 'engine' });
    if (d.scene!.physics?.sourceKind !== 'activity') throw new Error('activity: no frame runs');
    running(d, busy(20));
    return d;
  });
}

/** The throne: she holds an audience sitting on the commander's back (`human_chair` inside her frame: her legs astride). */
export function demoThrone(reg: Registries, her: DemoUnit): CampaignState {
  return withPlayFrame(() => {
    const s = base(reg, her, 4);
    const id = herOf(s).id;
    confide(s, id);
    enable(s, 'objectification', 'worship', 'service', 'humiliation', 'restraint');
    s.settings.physicsRealtime = true;
    s.slot = 'evening';
    const d = start(s, reg, [id]);
    setBlocking(d, { registries: reg }, { person: id, field: 'activity', value: 'reading_reports' }, { at: 1, source: 'engine' });
    setBlocking(d, { registries: reg }, { person: id, field: 'contact', value: 'human_chair', with: COMMANDER }, { at: 1, source: 'engine' });
    if (d.scene!.physics?.second?.physicsId !== 'weight') throw new Error('throne: no weight inside her frame');
    running(d, busy(20));
    return d;
  });
}

/** Foot service under her desk: her frame with her practices live (she holds at `play`, practises service and worship): the sole. */
export function demoService(reg: Registries, her: DemoUnit): CampaignState {
  const d = demoActivity(reg, her);
  const id = herOf(d).id;
  herOf(d).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { service: { as: 'enjoys', witness: 'indifferent' }, worship: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  } as Bond;
  d.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  d.relations[id]!.dynamic = { ...blankDynamic(1), frame: 'play', hold: 40 };
  return d;
}

/** Shoe service: her boots (`boot_worship`: tongue work on her footwear), her attention busy; `heels`: she likes high heels, so she wears them. */
export function demoShoe(reg: Registries, her: DemoUnit, footwear: 'boots' | 'heels' = 'boots'): CampaignState {
  return withPlayFrame(() => {
    const s = base(reg, her, 4);
    const id = herOf(s).id;
    confide(s, id);
    enable(s, 'objectification', 'worship', 'service', 'humiliation');
    s.settings.physicsRealtime = true;
    const d = start(s, reg, [id]);
    setBlocking(d, { registries: reg }, { person: id, field: 'contact', value: 'boot_worship', with: COMMANDER }, { at: 1, source: 'engine' });
    if (d.scene!.physics?.physicsId !== 'tongue_work') throw new Error('shoe: no tongue work runs');
    running(d, busy(27));
    if (footwear === 'heels') herOf(d).likes = [...herOf(d).likes, 'high heels'];
    return d;
  });
}

/** Gulp: she stands over the commander, her planned flow (neutral's row, by hash); the run is written as `physics/start` writes it. */
export function demoGulp(reg: Registries, her: DemoUnit): CampaignState {
  return withPlayFrame(() => {
    const s = base(reg, her, 4);
    const id = herOf(s).id;
    confide(s, id);
    enable(s, 'bodily_fluids', 'watersports');
    s.settings.physicsRealtime = true;
    const d = start(s, reg, [id]);
    const flow = flowOf(d.life?.salt ?? 0, 'p1', GULP_STYLES.neutral!, 14);
    d.scene!.physics = {
      id: 'p1', physicsId: 'gulp', sourceKind: 'contact', sourceId: 'kneeling_between_legs', holderId: id, gauge: 0, capacity: 100,
      segment: { n: 1, state: 'running', plan: { beats: flow.map((f) => ({ attention: 'watching' as const, flow: f })) } }, startedExchange: 0, taps: 0, streak: 0, extend: 0,
    };
    return d;
  });
}

/**
 * The demo state that starts `instrument` (a `SLOT_INFO[key].instrument`) with her as the holder, or null when there is none (or the
 * content cannot build it). `key` picks the view of a slot inside one instrument: the frame (`her_activity`) plays her legs seated by
 * default, her feet on the floor for `feet_floor`, the throne for `legs_astride`, the service for `sole_close`; the shoe her heels for a
 * `.heels` key; the weight its face-up view (her `over` picture).
 */
export function demoStateFor(instrument: string, unit: DemoUnit, reg: Registries, key?: SlotKey): CampaignState | null {
  try {
    switch (instrument) {
      case 'slap': return demoSlap(reg, unit);
      case 'breath': return demoBreath(reg, unit);
      case 'weight': return demoWeight(reg, unit, 'boot_on_chest');
      case 'scent': return demoScent(reg, unit);
      case 'jaw': return demoJaw(reg, unit, 'toes');
      case 'shoe': return demoShoe(reg, unit, key !== undefined && key.endsWith('.heels') ? 'heels' : 'boots');
      case 'gulp': return demoGulp(reg, unit);
      case 'her_activity':
        if (key === 'sole_close') return demoService(reg, unit);
        if (key === 'legs_astride' || key === 'legs_astride.left' || key === 'legs_astride.right') return demoThrone(reg, unit);
        if (key === 'feet_floor') return demoActivity(reg, unit, 'at_her_feet');
        return demoActivity(reg, unit);
      default: return null;
    }
  } catch (err) {
    console.warn(`[Alius] stage preview: no demo for ${instrument}`, err);
    return null;
  }
}
