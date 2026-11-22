import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/comms';
import '../../src/engine/actions/practice';
import { blankPractices, type OpenDemonstration } from '../../src/engine/practice/state';
import type { CampaignState } from '../../src/engine/state/types';
import { createPractice } from '../../src/practice/controller';
import { loadCore } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import { ANN, BEA, CAT, unitOf, withService, world } from '../engine/practice/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const demo = (over: Partial<OpenDemonstration> = {}): OpenDemonstration => ({
  id: 'pd1', holderId: ANN, tags: ['service'], summary: 'service at the mess table', text: 'You will serve me at the mess table tonight.', audienceIds: [BEA], narrated: [CAT], stage: 'mess_hall', slot: 'evening', day: 20, status: 'offered', requestId: 'pq1', stakes: 'minor', ...over,
});
function offered(over: Partial<OpenDemonstration> = {}): CampaignState {
  const s = withService(world(reg, 'play'));
  unitOf(s, ANN).bond!.practice!.audience = 'select_few';
  s.relations[BEA].trust = 60;
  s.relations[CAT].trust = 60;
  s.slot = 'evening'; // GO is the slot she named
  s.settings.unitDms = true;
  s.practices = { ...blankPractices(), seq: 3, demonstrations: [demo(over)] };
  return s;
}
const rig = (s: CampaignState, startScene?: (o: { locationId: string; participants: string[]; origin: 'event'; consumesSlot?: boolean }) => Promise<boolean>) => {
  const h = worldHarness(reg, s, { autoRetry: 0 });
  const refreshContext = vi.fn();
  const ctl = createPractice({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext, ...(startScene !== undefined ? { startScene } : {}) });
  return { h, ctl, refreshContext };
};
const dms = (h: ReturnType<typeof worldHarness>) => h.state().dms[ANN] ?? [];
const issued = { type: 'task_issued', taskId: 'pd1', holderId: ANN, unitId: ANN, kind: 'demonstration', requestId: 'pq1' };

describe('the demonstration controller', () => {
  it('GO opens the scene the engine describes: her and exactly the units on the card, at the stage, costing the slot', async () => {
    const opened: unknown[] = [];
    const { h, ctl, refreshContext } = rig(offered(), async (o) => { opened.push(o); return true; });
    expect(await ctl.answerDemonstration('pd1', 'go')).toBe(true);
    expect(opened).toEqual([{ locationId: 'mess_hall', participants: [ANN, BEA, CAT], origin: 'event', consumesSlot: true }]);
    expect(h.state().practices!.demonstrations[0].status).toBe('open');
    expect(refreshContext).toHaveBeenCalled();
  });

  it('the card on a narrated audience brings only the cards: Cat is narrated, never on the scene', async () => {
    const opened: Array<{ participants: string[] }> = [];
    const s = offered({ audienceIds: [BEA, CAT], narrated: ['unit_dee'] });
    const { ctl } = rig(s, async (o) => { opened.push(o); return true; });
    await ctl.answerDemonstration('pd1', 'go');
    expect(opened[0].participants).toEqual([ANN, BEA, CAT]);
  });

  it('a scene that would not open says so; the card stays to be pressed again', async () => {
    const { h, ctl } = rig(offered(), async () => false);
    expect(await ctl.answerDemonstration('pd1', 'go')).toBe(false);
    expect(h.toasts.at(-1)).toMatchObject({ kind: 'error' });
    expect(h.state().practices!.demonstrations[0]).toMatchObject({ status: 'open' });
    expect(h.state().practices!.demonstrations[0].sceneId).toBeUndefined();
  });

  it('REFUSE dispatches the refusal and opens nothing; an answered card and a gone one answer false', async () => {
    const startScene = vi.fn(async () => true);
    const { h, ctl } = rig(offered(), startScene);
    expect(await ctl.answerDemonstration('pd1', 'refuse')).toBe(true);
    expect(startScene).not.toHaveBeenCalled();
    expect(h.state().practices!.demonstrations[0].status).toBe('refused');
    expect(h.log.map((a) => a.type)).toContain('practice/answer_demonstration');
    expect(await ctl.answerDemonstration('pd1', 'refuse')).toBe(false);
    expect(h.toasts.at(-1)).toMatchObject({ kind: 'error' });
    expect(await ctl.answerDemonstration('pd9', 'go')).toBe(false);
  });

  it('with no scene opener GO still records the answer (nothing opens)', async () => {
    const { h, ctl } = rig(offered());
    expect(await ctl.answerDemonstration('pd1', 'go')).toBe(true);
    expect(h.state().practices!.demonstrations[0].status).toBe('open');
  });

  it('a new demonstration is delivered as a DM from her with her words, once; not in a scene with her, not in her cold shoulder; a plain card hides the draft marker', async () => {
    const { h, ctl } = rig(offered());
    ctl.onEvents([issued]);
    await vi.waitFor(() => expect(dms(h)).toHaveLength(1));
    expect(dms(h)[0]).toMatchObject({ from: ANN, initiated: true, text: 'You will serve me at the mess table tonight.' });
    ctl.onEvents([issued]);
    ctl.onEvents([{ ...issued, rerolled: true }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(dms(h)).toHaveLength(1);
    const cold = offered();
    cold.practices!.cold[ANN] = cold.day + 1;
    const c = rig(cold);
    c.ctl.onEvents([issued]);
    await new Promise((r) => setTimeout(r, 20));
    expect(dms(c.h)).toHaveLength(0);
    const inScene = offered();
    inScene.scene = { id: 's1', day: 20, slot: 'afternoon', locationId: 'mess_hall', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    const i = rig(inScene);
    i.ctl.onEvents([issued]);
    await new Promise((r) => setTimeout(r, 20));
    expect(dms(i.h)).toHaveLength(0);
    const plain = rig(offered({ text: 'AUTHOR TO WRITE: serve me before the others.', plain: true }));
    plain.ctl.onEvents([issued]);
    await vi.waitFor(() => expect(dms(plain.h)).toHaveLength(1));
    expect(dms(plain.h)[0].text).not.toMatch(/AUTHOR TO WRITE/);
  });
});
