import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dilemma';
import { scapegoatOptionId } from '../../../src/engine/power/scapegoat';
import { openScapegoat } from '../../../src/engine/power/scapegoat';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

describe('dilemma_resolved carries what the open dilemma took with it (P3b)', () => {
  it('dilemma_resolved carries context, optionId, subjectId and units', () => {
    const s = campaign(reg, 4);
    s.leash.authorizationsLeft = 3;
    openScapegoat(s, ctxOf(s, reg), { missionId: 'm1', unitId: ANN, witnessIds: [BEA, CAT] });
    const open = s.dilemmas!.open!;
    const index = open.options!.findIndex((o) => scapegoatOptionId(o) === 'shift_blame');
    const r = run(s, reg, { type: 'dilemma/choose', payload: { id: open.id, index } });
    expect(errors(r.events)).toEqual([]);
    const resolved = ofType(r.events, 'dilemma_resolved')[0];
    expect(resolved).toMatchObject({ context: 'scapegoat', optionId: 'shift_blame', subjectId: ANN, units: [ANN, BEA, CAT] });
    expect(r.state.dilemmas?.open).toBeUndefined(); // the emitter had to carry it: the open one is gone
  });

  it('an option without an authored id carries none, and a base dilemma has no subject', () => {
    const s = campaign(reg, 4);
    s.dilemmas = {
      seq: 1,
      open: {
        id: 'dl1', templateId: 'x', scale: 'minor', context: 'base', day: 1, status: 'presented', attempts: 0, units: [ANN], beatId: 'open', title: 'T', setup: 'S', source: 'fallback',
        options: [{ label: 'Wait', effects: [], magnitudes: [] }],
      },
    } as never;
    const r = run(s, reg, { type: 'dilemma/choose', payload: { id: 'dl1', index: 0 } });
    expect(errors(r.events)).toEqual([]);
    const e = ofType(r.events, 'dilemma_resolved')[0];
    expect(e).toMatchObject({ context: 'base', units: [ANN] });
    expect('optionId' in e).toBe(false);
    expect('subjectId' in e).toBe(false);
  });
});
