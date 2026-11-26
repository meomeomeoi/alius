/**
 * P10e: builds the campaign states the layout test renders and writes them as JSON (Node side; `npm run test:layout` bundles and runs this).
 * `one`: one woman; `physics`: one woman and a running hold (a ring gag: its card, its cue and the stop word's pill);
 * `three` / `four`: three or four women in the commander's quarters with her cards open (a moment, a milestone, a task and a punishment: a tall dock)
 * and a hold on the commander (the pill).
 * `dialname` / `dialwide`: Ann (ritual) has named the commander's posture (P16): `Low` for bowing (cards.html's own), or a name of 30
 * characters for bowing (it wraps, over the base name and EYES DOWN: the tallest label; the circle stays where it is for `standing`).
 * `call`: Ann (ritual) has four named postures and calls Low (P10e-e Task 9: her posture call as a full-frame moment); `callhold`: the same with a
 * hold running (the stop word's pill must stay clickable over the fan). `slap` / `slaphold`: her slap (P10e-e Task 12), see below.
 * `breath` / `breathhold`: the breath instrument (P10e-e Task 14), see below.
 * `weight` / `weightfoot` / `weightup` / `weighthold`: the weight instrument (P10e-e Task 16), see below.
 * `scent` / `scenthold`: the scent instrument (P10e-e Task 18), see below.
 * `jaw` / `jawring` / `jawhold`: the jaw instrument (P10e-e Task 20), see below.
 * `activity` / `activityhold`: her frame (P10e-e Task 24), see below.
 */
import { writeFileSync } from 'node:fs';
import { COMMANDER, registerFrameReader, setBlocking } from '../../src/engine/blocking';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { fireMoment } from '../../src/engine/moments/fire';
import { blankPractices } from '../../src/engine/practice/state';
import type { CampaignState } from '../../src/engine/state/types';
import { enable } from '../helpers/bonds';
import { campaign, loadCore, run, setRelation } from '../helpers/loyalty';
import { ANN, holderBond, unitOf, withService, world } from '../engine/practice/world';
import '../../src/engine/actions/blocking';
import '../../src/engine/actions/physics';

const reg = await loadCore();
const out: Record<string, unknown> = {};
registerFrameReader(() => 'play'); // the contacts are dynamic; the entry registers the same reader in the page

function scene(participants: string[], location: string, held: boolean, extra: string[] = []): CampaignState {
  const s = campaign(reg, 4);
  for (const id of participants) setRelation(s, id, { stateId: 'confidant' });
  enable(s, 'pet_play', 'restraint', ...extra);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: location, participants, origin: 'event', consumesSlot: false, startIndex: 0 } });
  if (held) setBlocking(r.state, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'paw_mitts' }, { at: 1, source: 'engine' });
  if (held) setBlocking(r.state, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'kneeling_upright' }, { at: 2, source: 'engine' });
  return r.state;
}

/** Her cards: Ann holds at play; a moment, a milestone, a task and a punishment are open, so the dock is as tall as it gets. */
function withCards(participants: string[]): CampaignState {
  const s = campaign(reg, 4);
  const ann = s.squad.find((u) => u.id === 'unit_ann')!;
  ann.bond = holderBond(['public_humiliation', 'denial']);
  s.content = { enabled: ['restraint', 'public_humiliation', 'denial', 'service', 'pet_play'] };
  ann.bond.practice!.categories.service = { as: 'enjoys', witness: 'indifferent' };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.day = 20;
  s.relations.unit_ann.dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 30 };
  for (const id of participants) setRelation(s, id, { stateId: 'confidant' });
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants, origin: 'event', consumesSlot: false, startIndex: 0 } });
  const d = r.state;
  setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'paw_mitts' }, { at: 1, source: 'engine' });
  setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'kneeling_upright' }, { at: 2, source: 'engine' });
  fireMoment(d, { registries: reg }, 'third_party', 'unit_ann');
  d.dynamic!.open.milestones.push({ id: 'dm1', unitId: 'unit_ann', milestoneId: 'handover', day: d.day, form: 'scene' });
  d.practices = {
    ...blankPractices(), seq: 9,
    tasks: [{ id: 'pt1', holderId: 'unit_ann', kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'slot_with_her', proof: 'none', text: 'Bring me the patrol roster before evening mess. Folded, and on your knees.', summary: 'bring the roster', status: 'offered', acceptForm: 'button_cost', day: d.day, deadline: { day: d.day, slot: 'evening' } }],
    punishments: [{ id: 'pp1', holderId: 'unit_ann', entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: d.day }, text: 'A day without messages.', summary: 'a day without messages', status: 'offered', day: d.day }],
  } as never;
  return d;
}

out.one = scene(['unit_ann'], 'mess_hall', false);
const physics = scene(['unit_ann'], 'quarters_commander', false, ['humiliation']);
setBlocking(physics, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, { at: 1, source: 'engine' });
if (physics.scene!.physics) {
  // the first segment is running: the card shows its controls and the cue of the beat
  physics.scene!.physics.segment = { n: 1, state: 'running', plan: { beats: [{ cue: 'warning', attention: 'watching' }, { attention: 'watching' }, { attention: 'watching' }, { attention: 'watching' }] } };
}
out.physics = physics;
out.two = scene(['unit_ann', 'unit_bea'], 'quarters_commander', true);
out.three = withCards(['unit_ann', 'unit_bea', 'unit_cat']);
out.four = withCards(['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee']);

/** Ann (ritual) named the commander's posture `postureId` `name`; the commander holds it. */
function named(postureId: string, name: string): CampaignState {
  const base = withService(world(reg, 'role'));
  unitOf(base, ANN).bond!.practice!.style = { primary: 'ritual' };
  base.practices = { ...blankPractices(), seq: 1, postures: { [ANN]: [{ postureId, name, day: 20 }] } };
  setRelation(base, ANN, { stateId: 'confidant' });
  enable(base, 'pet_play', 'restraint');
  const r = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  setBlocking(r.state, { registries: reg }, { person: COMMANDER, field: 'posture', value: postureId }, { at: 1, source: 'engine' });
  return r.state;
}
out.dialname = named('bowing', 'Low');
out.dialwide = named('bowing', 'All the way down, where I want'); // 30 characters, over BOWING and EYES DOWN: the tallest label

/** P10e-e Task 9: Ann (ritual) named four postures and calls Low (bowing) while the commander kneels upright: her word, her foot, the fan. */
const called = named('kneeling_upright', 'Attention');
called.practices!.postures[ANN] = [
  { postureId: 'kneeling_upright', name: 'Attention', day: 20 }, { postureId: 'kneeling_sitting', name: 'Rest', day: 20 },
  { postureId: 'bowing', name: 'Low', day: 20 }, { postureId: 'all_fours', name: 'Pup', day: 20 },
];
called.practices!.call = { id: 'pc1', holderId: ANN, postureId: 'bowing', sceneId: called.scene!.id, at: 1 };
out.call = called;
/** Review I1: the same call while a hold runs (a ring gag): the stop word's pill must stay clickable over the fan. */
const callhold = structuredClone(called);
callhold.content = { enabled: [...(callhold.content?.enabled ?? []), 'humiliation'] };
setBlocking(callhold, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, { at: 2, source: 'engine' });
if (!callhold.scene!.physics) throw new Error('callhold: no hold runs');
callhold.scene!.physics.segment = { n: 1, state: 'running', plan: { beats: [{ cue: 'warning', attention: 'watching' }, { attention: 'watching' }, { attention: 'watching' }, { attention: 'watching' }] } };
out.callhold = callhold;

/**
 * P10e-e Task 12: Ann (possessive: a 450 ms swing) slaps the commander in the commander's quarters (`slap`, the shots: the entry holds it back
 * with `&deferSlap=1`); `slaphold`: the same with a hold running, so the stop word's pill is there and must stay clickable through the slap.
 */
function slapping(): CampaignState {
  const base = withService(world(reg, 'role'));
  unitOf(base, ANN).bond!.practice!.style = { primary: 'possessive' };
  setRelation(base, ANN, { stateId: 'confidant' });
  enable(base, 'pet_play', 'restraint', 'physical_discipline_shown', 'humiliation');
  const r = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  const d = r.state;
  d.settings.physicsRealtime = true; // the campaign's mirror of real time (the instruments need it; the slap reads only reduced motion and the timing toggle)
  d.practices = { ...(d.practices ?? blankPractices()), seq: 2, slap: { id: 'ps1', holderId: ANN, sceneId: d.scene!.id, windowMs: 450, feints: 0 } };
  return d;
}
out.slap = slapping();
const slaphold = slapping();
setBlocking(slaphold, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, { at: 1, source: 'engine' });
if (!slaphold.scene!.physics) throw new Error('slaphold: no hold runs');
slaphold.scene!.physics.segment = { n: 1, state: 'running', plan: { beats: [{ cue: 'warning', attention: 'watching' }, { attention: 'watching' }, { attention: 'watching' }, { attention: 'watching' }] } };
out.slaphold = slaphold;

/**
 * P10e-e Task 14: Ann sits on the commander's face (`under_her_seat`: breath, her silhouette from below, and her own activity) in the commander's quarters,
 * real time mirrored, the first segment running with her openings every second beat (`breathhold`: the stop word's pill must stay clickable
 * and end the hold mid-breath; `breath`: the shots, whose page clears the plan's openings with `&quiet=1` and drives the windows itself).
 */
function breathing(): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'objectification', 'restraint');
  s.settings.physicsRealtime = true; // the campaign's mirror of real time (the instrument needs it)
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  const d = r.state;
  setBlocking(d, { registries: reg }, { person: ANN, field: 'contact', value: 'under_her_seat', with: COMMANDER }, { at: 1, source: 'engine' });
  if (!d.scene!.physics) throw new Error('breath: no hold runs');
  d.scene!.physics.segment = {
    n: 1, state: 'running',
    plan: { beats: Array.from({ length: 14 }, (_, i) => (i % 2 === 1 ? { attention: 'watching' as const, cue: 'window_open' as const, opening: { widthMs: 600 } } : { attention: 'watching' as const })) },
  };
  return d;
}
out.breath = breathing();
out.breathhold = breathing();

/**
 * P10e-e Task 16: Ann rests her weight on the commander in the commander's quarters, real time mirrored, the first segment running with a shift
 * every fourth beat: `weight` (human_chair: face down, her legs), `weightfoot` (footrest: face down, out of view), `weightup` (boot_on_chest:
 * face up, her sprite from below) for the shots, whose page clears the plan's shifts with `&quiet=1` and drives them itself; `weighthold`
 * (human_chair): the stop word's pill must stay clickable and end the hold mid-weight.
 */
function weighting(contact: string): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'objectification', 'restraint', 'humiliation', 'pain_rough');
  s.settings.physicsRealtime = true; // the campaign's mirror of real time (the instrument needs it)
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  const d = r.state;
  setBlocking(d, { registries: reg }, { person: ANN, field: 'contact', value: contact, with: COMMANDER }, { at: 1, source: 'engine' });
  if (d.scene!.physics?.physicsId !== 'weight') throw new Error(`weight (${contact}): no weight runs`);
  d.scene!.physics.segment = {
    n: 1, state: 'running',
    plan: { beats: Array.from({ length: 20 }, (_, i) => (i % 4 === 3 ? { attention: 'busy' as const, cue: 'shift' as const, shift: 20 } : { attention: 'busy' as const })) },
  };
  return d;
}
out.weight = weighting('human_chair');
out.weightfoot = weighting('footrest');
out.weightup = weighting('boot_on_chest');
out.weighthold = weighting('human_chair');

/**
 * P10e-e Task 18: Ann's feet on the commander's face (`feet_on_face`: saturation, the gap between her soles, with her own activity) in the
 * commander's quarters, real time mirrored, the first segment running, her attention busy: `scent` for the shots (whose page drives her
 * orders and her question itself, `&quiet=1` holding the prototype's own schedule off), `scenthold`: the stop word's pill must stay clickable
 * and end the hold mid-breath, her question's pills up.
 */
function scenting(): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'objectification', 'restraint', 'humiliation', 'worship', 'bodily_fluids'); // her sweat (the prototype's default scent) may reach the commander
  s.settings.physicsRealtime = true; // the campaign's mirror of real time (the instrument needs it)
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  const d = r.state;
  setBlocking(d, { registries: reg }, { person: ANN, field: 'contact', value: 'feet_on_face', with: COMMANDER }, { at: 1, source: 'engine' });
  if (d.scene!.physics?.physicsId !== 'saturation') throw new Error('scent: no saturation runs');
  d.scene!.physics.segment = { n: 1, state: 'running', plan: { beats: Array.from({ length: 20 }, () => ({ attention: 'busy' as const })) } };
  return d;
}
out.scent = scenting();
out.scenthold = scenting();

/**
 * P10e-e Task 20: the jaw in the commander's quarters, real time mirrored, the first segment running (her attention on the commander): `jaw`
 * (Ann's toes in the commander's mouth, `sole_to_mouth`) and `jawring` (the commander ring-gagged before her) for the shots, whose page drives
 * her moves itself (`&quiet=1` clears the plan's); `jawhold` (the ring): the stop word's pill must stay clickable and end the hold, her band
 * up and the field speaking through the ring.
 */
function jawing(source: 'toes' | 'ring'): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'objectification', 'restraint', 'humiliation', 'worship', 'service');
  s.settings.physicsRealtime = true; // the campaign's mirror of real time (the instrument needs it)
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  const d = r.state;
  if (source === 'toes') setBlocking(d, { registries: reg }, { person: ANN, field: 'contact', value: 'sole_to_mouth', with: COMMANDER }, { at: 1, source: 'engine' });
  else setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, { at: 1, source: 'engine' });
  if (d.scene!.physics?.physicsId !== 'jaw') throw new Error(`jaw (${source}): no jaw runs`);
  d.scene!.physics.segment = { n: 1, state: 'running', plan: { beats: Array.from({ length: 20 }, () => ({ attention: 'watching' as const })) } };
  return d;
}
out.jaw = jawing('toes');
out.jawring = jawing('ring');
out.jawhold = jawing('ring');

/**
 * P10e-e Task 24: her frame in the commander's quarters, real time mirrored: Ann reading reports, the commander placed under her desk (her
 * anchor, set in the fiction), the first segment running. `activity` for the shots; `activityhold`: the stop word's pill must stay clickable
 * and end the hold, the forgotten end included.
 */
function framing(): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'objectification', 'worship', 'service');
  s.settings.physicsRealtime = true;
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  const d = r.state;
  setBlocking(d, { registries: reg }, { person: ANN, field: 'activity', value: 'reading_reports' }, { at: 1, source: 'engine' });
  setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'under_desk' }, { at: 1, source: 'engine' });
  if (d.scene!.physics?.sourceKind !== 'activity') throw new Error('activity: no frame runs');
  d.scene!.physics.segment = { n: 1, state: 'running', plan: { beats: Array.from({ length: 20 }, () => ({ attention: 'busy' as const })) } };
  return d;
}
out.activity = framing();
out.activityhold = framing();

/**
 * P10e-e Task 24b: the throne: Ann holding an audience, sitting on the commander's back (`human_chair`: the weight inside her frame). `throne`
 * for the shots; `thronehold`: the stop word's pill must stay clickable and end the hold, with her mug on the commander's back.
 */
function throning(): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'objectification', 'worship', 'service', 'humiliation', 'restraint');
  s.settings.physicsRealtime = true;
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  const d = r.state;
  setBlocking(d, { registries: reg }, { person: ANN, field: 'activity', value: 'reading_reports' }, { at: 1, source: 'engine' });
  setBlocking(d, { registries: reg }, { person: ANN, field: 'contact', value: 'human_chair', with: COMMANDER }, { at: 1, source: 'engine' });
  if (d.scene!.physics?.second?.physicsId !== 'weight') throw new Error('throne: no weight inside her frame');
  d.scene!.physics.segment = { n: 1, state: 'running', plan: { beats: Array.from({ length: 20 }, () => ({ attention: 'busy' as const })) } };
  return d;
}
out.throne = throning();
out.thronehold = throning();

writeFileSync(process.argv[2] ?? 'states.json', JSON.stringify(out));
