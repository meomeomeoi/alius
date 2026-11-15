import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { ANN, harness, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';
import { withBond } from '../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const directives = (h: Harness) => h.context.build(h.state(), 5000).directives;
const lover = (s: import('../../src/engine/state/types').CampaignState) => {
  s.relations[ANN].stateId = 'lover';
  withBond(s, ANN, { leadStyle: 'dominant' });
};
const open = async (h: Harness) => {
  expect(await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' })).toBe(true);
};

describe('the lead chips act through the scene controller (Task 8)', () => {
  it('a scene with a lover opens with a lead', async () => {
    const h = harness(reg, { tweak: lover });
    await open(h);
    expect(h.state().scene!.lead).toMatchObject({ by: 'unit', unitId: ANN });
  });

  it('FOLLOW applies followed_lead once and shows the Affinity pulse; a second press says no', async () => {
    const h = harness(reg, { tweak: lover });
    await open(h);
    const aff = h.state().relations[ANN].affinity;
    h.controller.follow();
    expect(h.state().relations[ANN].affinity).toBe(aff + 2);
    expect(h.ui).toContainEqual(expect.objectContaining({ type: 'pulse', unitId: ANN, axis: 'affinity', up: true }));
    h.controller.follow();
    expect(h.state().relations[ANN].affinity).toBe(aff + 2);
    expect(h.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringMatching(/already followed/i) });
  });

  it('ASK sets a directive for the next reply only', async () => {
    const h = harness(reg, { tweak: lover });
    await open(h);
    h.controller.ask();
    expect(directives(h)).toContain('The commander asks Ann what she wants; she answers plainly, in character.');
    h.context.onReplyReceived();
    expect(directives(h)).not.toContain('what she wants');
  });

  it('ASK without a lead does nothing', async () => {
    const h = harness(reg);
    await open(h);
    h.controller.ask();
    expect(directives(h)).not.toContain('what she wants');
  });

  it('SET A LIMIT writes the boundary into the scene and the memory; empty text is ignored', async () => {
    const h = harness(reg, { tweak: lover });
    await open(h);
    h.controller.limit('Nothing past the door.');
    expect(h.state().scene!.limits).toEqual(['Nothing past the door.']);
    expect(h.state().memory.facts.some((f) => f.tags.includes('limit'))).toBe(true);
    const calls = h.actions.length;
    h.controller.limit('   ');
    expect(h.actions.length).toBe(calls);
  });

  it('the chips only act while a lead exists', async () => {
    const h = harness(reg);
    await open(h);
    const calls = h.actions.length;
    h.controller.follow();
    h.controller.limit('x');
    expect(h.state().scene!.followed).toBeUndefined();
    expect(h.state().scene!.limits).toBeUndefined();
    expect(h.actions.length).toBe(calls); // nothing was even dispatched
  });
});
