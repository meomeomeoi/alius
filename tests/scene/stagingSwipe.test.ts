import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { COMMANDER } from '../../src/engine/blocking';
import { DEBUG_NOT_ROLLED_BACK } from '../../src/scene/sceneController';
import { ANN, harness, intentJson, praised, reply, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** A scene with Ann, a confidant (the blocking is live), at the commander's quarters. */
async function setup(settings: Record<string, unknown> = {}): Promise<Harness> {
  const h = harness(reg, { settings, tweak: (s) => { s.relations[ANN]!.stateId = 'confidant'; } });
  expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'event' })).toBe(true);
  h.st.groupReplies = [[reply('Ann', 'first answer')]];
  h.st.swipeReplies = [reply('Ann', 'second answer')];
  h.st.on('message_swiped', (i) => h.controller.onSwipe(i as number));
  return h;
}
const posture = (h: Harness, value: string) => h.controller.stage({ type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value } });
const blocking = (h: Harness) => h.state().scene!.blocking;

describe('stage(action)', () => {
  it('dispatches the action with the chat index it was made at', async () => {
    const h = await setup();
    h.st.mainReplies = [intentJson()];
    await h.controller.send('Hello');
    const at = h.st.chatLength();
    const events = posture(h, 'kneeling_upright');
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
    expect(events.some((e) => e.type === 'blocking_changed')).toBe(true);
    expect(h.state().scene!.stagingLog![0]!.at).toBe(at);
    expect(h.actions).toContain('blocking/set');
  });

  it('keeps an explicit `at`, and reports a refusal as an error event without changing anything', async () => {
    const h = await setup();
    const ok = h.controller.stage({ type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'sitting', at: 7 } });
    expect(ok.find((e) => e.type === 'error')).toBeUndefined();
    expect(h.state().scene!.stagingLog![0]!.at).toBe(7);
    const before = h.state();
    const bad = h.controller.stage({ type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'levitating' } });
    expect(bad.some((e) => e.type === 'error')).toBe(true);
    expect(h.state()).toBe(before);
  });
});

describe('a swipe takes back what was staged after the reply (R7)', () => {
  it('rollback after a chip change: the extraction and the chip made after it go together', async () => {
    const h = await setup();
    h.st.mainReplies = [intentJson([praised()]), intentJson()];
    const base = h.state().relations[ANN]!.affinity;
    await h.controller.send('Hello');
    expect(h.state().relations[ANN]!.affinity).toBe(base + 4);
    posture(h, 'kneeling_upright');
    expect(blocking(h)![COMMANDER]!.posture).toBe('kneeling_upright');
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(blocking(h)).toBeUndefined(); // the chip is gone with the reading
    expect(h.state().relations[ANN]!.affinity).toBe(base); // the new reading (empty) replaced the first
    expect(h.state().scene!.stagingLog).toBeUndefined();
    expect(h.toasts.some((t) => t.text === DEBUG_NOT_ROLLED_BACK)).toBe(false);
  });

  it('a chip made before the reply stays', async () => {
    const h = await setup();
    posture(h, 'sitting'); // before any reply: at = chat length now
    h.st.mainReplies = [intentJson(), intentJson()];
    await h.controller.send('Hello');
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(blocking(h)![COMMANDER]!.posture).toBe('sitting');
  });

  it('rollback with no extraction (intent mode scene_end): the chip at 6 goes when 5 is swiped, and stays when 7 is', async () => {
    const h = await setup({ intentMode: 'scene_end' });
    h.st.mainReplies = [];
    await h.controller.send('Hello');
    h.controller.stage({ type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'sitting', at: 6 } });
    h.controller.onSwipe(7);
    expect(blocking(h)![COMMANDER]!.posture).toBe('sitting');
    h.controller.onSwipe(5);
    expect(blocking(h)).toBeUndefined();
    expect(h.actions).toContain('blocking/rollback');
  });

  it('an older message swiped after a reading keeps what was read and staged since', async () => {
    const h = await setup();
    h.st.mainReplies = [intentJson([praised()])];
    await h.controller.send('Hello');
    posture(h, 'sitting');
    h.controller.onSwipe(0);
    expect(blocking(h)![COMMANDER]!.posture).toBe('sitting');
  });

  it('an edit of a reply that was not read yet takes the staged change back too (no extraction to restore)', async () => {
    const h = await setup({ intentMode: 'scene_end' });
    await h.controller.send('Hello');
    const reply0 = h.st.chatLength() - 1;
    posture(h, 'sitting');
    h.controller.onEdited(reply0);
    expect(blocking(h)).toBeUndefined();
  });

  it('a chip staged after the reading moves the rebase point: a second chip is taken back as well', async () => {
    const h = await setup();
    h.st.mainReplies = [intentJson([praised()]), intentJson()];
    await h.controller.send('Hello');
    posture(h, 'sitting');
    posture(h, 'standing');
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(blocking(h)).toBeUndefined();
  });
});

describe('a swipe during a hold keeps the run', () => {
  it.todo('completed in Task 21 (physics is never rolled back)');
});
