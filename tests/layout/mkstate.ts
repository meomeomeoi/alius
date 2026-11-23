/**
 * P10e: builds the campaign states the layout test renders and writes them as JSON (Node side; `npm run test:layout` bundles and runs this).
 * `one`: one woman; `physics`: one woman and a running hold (a ring gag: its card, its cue and the stop word's pill);
 * `three` / `four`: three or four women in the commander's quarters with her cards open (a moment, a milestone, a task and a punishment: a tall dock)
 * and a hold on the commander (the pill).
 */
import { writeFileSync } from 'node:fs';
import { COMMANDER, registerFrameReader, setBlocking } from '../../src/engine/blocking';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { fireMoment } from '../../src/engine/moments/fire';
import { blankPractices } from '../../src/engine/practice/state';
import type { CampaignState } from '../../src/engine/state/types';
import { enable } from '../helpers/bonds';
import { campaign, loadCore, run, setRelation } from '../helpers/loyalty';
import { holderBond } from '../engine/practice/world';
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
    tasks: [{ id: 'pt1', holderId: 'unit_ann', kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Bring the roster.', summary: 'bring the roster', status: 'offered', acceptForm: 'button_cost', day: d.day }],
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

writeFileSync(process.argv[2] ?? 'states.json', JSON.stringify(out));
