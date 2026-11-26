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
 * `shoe` / `shoeheels` / `shoehold`: shoe service (P10e-e Task 28), see below.
 * `gulp` / `gulphold`: gulp (P10e-e Task 30), see below.
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
import { demoActivity, demoBreath, demoGulp, demoJaw, demoScent, demoService, demoShoe, demoSlap, demoThrone, demoWeight } from '../../src/ui/stage/demo';
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
 * The instrument fixtures (P10e-e Tasks 12–30) come from the stage preview's demo states (`src/ui/stage/demo.ts`: one copy), with Ann as
 * the holder. `slap` / `slaphold`: her slap (possessive: a 450 ms swing; the entry holds it back with `&deferSlap=1`), `slaphold` with a hold
 * running, so the stop word's pill must stay clickable through the slap. `breath` / `breathhold`: she sits on the commander's face, her
 * openings every second beat (the shots clear them with `&quiet=1`). `weight` (human_chair) / `weightfoot` (footrest) / `weightup`
 * (boot_on_chest) / `weighthold`: her weight, a shift every fourth beat. `scent` / `scenthold`: her feet on the commander's face.
 * `jaw` (her toes) / `jawring` / `jawhold` (the ring). `activity` / `activityhold`: her frame, the commander under her desk. `throne` /
 * `thronehold`: the throne. `service` / `servicehold`: foot service in her frame. `shoe` / `shoeheels` / `shoehold`: shoe service (the page
 * gives her two pictures). `gulp` / `gulphold`: gulp. Each `…hold`: the stop word's pill (and the input) must stay clickable and end the hold.
 */
const HER = { id: ANN, cardRef: 'ann.png', displayName: 'Ann' };
const slaphold = demoSlap(reg, HER);
setBlocking(slaphold, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, { at: 1, source: 'engine' });
if (!slaphold.scene!.physics) throw new Error('slaphold: no hold runs');
slaphold.scene!.physics.segment = { n: 1, state: 'running', plan: { beats: [{ cue: 'warning', attention: 'watching' }, { attention: 'watching' }, { attention: 'watching' }, { attention: 'watching' }] } };
out.slap = demoSlap(reg, HER);
out.slaphold = slaphold;
out.breath = demoBreath(reg, HER);
out.breathhold = demoBreath(reg, HER);
out.weight = demoWeight(reg, HER, 'human_chair');
out.weightfoot = demoWeight(reg, HER, 'footrest');
out.weightup = demoWeight(reg, HER, 'boot_on_chest');
out.weighthold = demoWeight(reg, HER, 'human_chair');
out.scent = demoScent(reg, HER);
out.scenthold = demoScent(reg, HER);
out.jaw = demoJaw(reg, HER, 'toes');
out.jawring = demoJaw(reg, HER, 'ring');
out.jawhold = demoJaw(reg, HER, 'ring');
out.activity = demoActivity(reg, HER);
out.activityhold = demoActivity(reg, HER);
out.throne = demoThrone(reg, HER);
out.thronehold = demoThrone(reg, HER);
out.service = demoService(reg, HER);
out.servicehold = demoService(reg, HER);
out.shoe = demoShoe(reg, HER);
out.shoehold = demoShoe(reg, HER);
out.shoeheels = demoShoe(reg, HER, 'heels');
out.gulp = demoGulp(reg, HER);
out.gulphold = demoGulp(reg, HER);

writeFileSync(process.argv[2] ?? 'states.json', JSON.stringify(out));
