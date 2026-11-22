/**
 * P10e: builds the campaign states the layout test renders and writes them as JSON (Node side; `npm run test:layout` bundles and runs this).
 * `one`: one woman; `three`: three women with a hold on the commander (a card in the dock, the stop word in the chip row).
 */
import { writeFileSync } from 'node:fs';
import { COMMANDER, setBlocking } from '../../src/engine/blocking';
import { enable } from '../helpers/bonds';
import { campaign, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/blocking';

const reg = await loadCore();
const out: Record<string, unknown> = {};

function scene(participants: string[], location: string, held: boolean) {
  const s = campaign(reg, 4);
  for (const id of participants) setRelation(s, id, { stateId: 'confidant' });
  enable(s, 'pet_play', 'restraint');
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: location, participants, origin: 'event', consumesSlot: false, startIndex: 0 } });
  if (held) setBlocking(r.state, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'paw_mitts' }, { at: 1, source: 'engine' });
  if (held) setBlocking(r.state, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'kneeling_upright' }, { at: 2, source: 'engine' });
  return r.state;
}
out.one = scene(['unit_ann'], 'mess_hall', false);
out.physics = scene(['unit_ann'], 'quarters_commander', true);
out.three = scene(['unit_ann', 'unit_bea', 'unit_cat'], 'quarters_commander', true);

writeFileSync(process.argv[2] ?? 'states.json', JSON.stringify(out));
