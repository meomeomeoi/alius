import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import { currentStep } from '../../src/engine/onboarding';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createOnboarding, sceneLocation } from '../../src/onboarding/controller';
import type { OnboardingDeps } from '../../src/onboarding/deps';
import { campaign, loadCore } from '../helpers/world';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

interface Rig {
  h: WorldHarness;
  ctx: ContextBuilder;
  ob: ReturnType<typeof createOnboarding>;
  modal: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  /** Dispatches like the app does: the events go through the controller afterwards. */
  act(type: string, payload?: unknown): EngineEvent[];
}

function rig(tweak: (s: CampaignState) => void = () => {}, answer: string | null = 'move'): Rig {
  const s = campaign(reg, 4, { onboarding: 'prologue' });
  tweak(s);
  const h = worldHarness(reg, s);
  const ctx = new ContextBuilder();
  const modal = vi.fn(async (_o: unknown): Promise<string | null> => answer);
  const resume = vi.fn();
  // eslint-disable-next-line prefer-const
  let ob!: ReturnType<typeof createOnboarding>;
  const act = (type: string, payload?: unknown): EngineEvent[] => {
    const events = h.app().dispatch({ type, payload });
    ob.onEvents(events);
    return events;
  };
  const deps: OnboardingDeps = {
    ...h.deps, context: ctx, refreshContext: vi.fn(), modal: modal as never, resumeScene: resume, openExpedition: vi.fn(),
    startScene: async (o) => {
      const events = act('scene/start', { ...o, startIndex: 0 });
      if (events.some((e) => e.type === 'error')) return false;
      ob.onSceneOpened();
      return true;
    },
    endScene: async () => { act('scene/end', {}); },
  };
  ob = createOnboarding(deps);
  return { h, ctx, ob, modal, resume, act };
}
const dirs = (r: Rig) => r.ctx.build(r.h.state(), 5000).directives;
const step = (r: Rig) => currentStep(r.h.state(), reg)!;
const flush = () => new Promise((res) => setTimeout(res, 0));
const lineup = (r: Rig) => (reg.prologues.get('prologue_vesper')!.steps as Record<string, { directive: string }>).lineup.directive;

describe('sceneLocation', () => {
  it('is the step location when it is open this slot', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    const r = rig();
    expect(sceneLocation(s, reg, step(r))).toBe('garage');
  });

  it('falls back to the first location open now, in registry order', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.slot = 'night';
    const r = rig();
    const first = [...reg.locations.values()].find((l) => (l.slots as string[]).includes('night'))!.id;
    expect(sceneLocation(s, reg, step(r))).toBe(first);
    expect(first).toBe('quarters_commander');
  });
});

describe('line-up', () => {
  it('startLineup starts a prologue scene with every living named unit at the step location and sets prologue:goal', async () => {
    const r = rig((s) => { s.squad[3].status = 'dead'; });
    expect(await r.ob.startLineup()).toBe(true);
    const scene = r.h.state().scene!;
    expect(scene).toMatchObject({ origin: 'prologue', locationId: 'garage', consumesSlot: false });
    expect(scene.participants).toEqual(['unit_ann', 'unit_bea', 'unit_cat']);
    expect(dirs(r)).toContain(lineup(r));
  });

  it('the goal is a scene directive that is cleared with the scene, not with a reply', async () => {
    const r = rig();
    await r.ob.startLineup();
    r.ctx.onReplyReceived();
    expect(dirs(r)).toContain(lineup(r));
  });

  it('line-up at night falls back to an open location', async () => {
    const r = rig((s) => { s.slot = 'night'; });
    expect(await r.ob.startLineup()).toBe(true);
    expect(r.h.state().scene!.locationId).toBe('quarters_commander');
  });

  it('a unit in the brig is left out; nobody to meet refuses', async () => {
    const r = rig((s) => {
      s.discipline = { restrictions: [{ id: 'r1', unitId: 'unit_ann', kind: 'confined', untilDay: 5 }] } as never;
    });
    await r.ob.startLineup();
    expect(r.h.state().scene!.participants).not.toContain('unit_ann');
    const none = rig((s) => { s.squad.forEach((u) => { u.status = 'dead'; }); });
    expect(await none.ob.startLineup()).toBe(false);
    expect(none.h.state().scene).toBeUndefined();
  });

  it('refuses on a step that is not a scene step', async () => {
    const r = rig((s) => { s.onboarding!.stepId = 'tutorial'; });
    expect(await r.ob.startLineup()).toBe(false);
    expect(r.h.state().scene).toBeUndefined();
  });

  it('at exchangeCap the wrap directive is set and Move on? is asked once', async () => {
    const r = rig(undefined, 'keep');
    await r.ob.startLineup();
    const cap = step(r).exchangeCap!;
    for (let i = 0; i < cap - 1; i++) r.act('scene/exchange');
    await flush();
    expect(r.modal).not.toHaveBeenCalled();
    expect(dirs(r)).not.toContain('natural close');
    r.act('scene/exchange');
    await flush();
    expect(r.modal).toHaveBeenCalledTimes(1);
    expect(r.modal.mock.calls[0][0]).toMatchObject({ title: 'Move on?', actions: [{ label: 'MOVE ON' }, { label: 'Keep talking' }] });
    expect(dirs(r)).toContain('Bring this scene to a natural close within the next reply or two; do not open new topics.');
    r.act('scene/exchange');
    r.act('scene/exchange');
    await flush();
    expect(r.modal).toHaveBeenCalledTimes(1);
  });

  it('MOVE ON ends the scene', async () => {
    const r = rig(undefined, 'move');
    await r.ob.startLineup();
    for (let i = 0; i < step(r).exchangeCap!; i++) r.act('scene/exchange');
    await flush();
    expect(r.h.state().scene).toBeUndefined();
  });

  it('Keep talking leaves it open and does not ask again', async () => {
    const r = rig(undefined, 'keep');
    await r.ob.startLineup();
    for (let i = 0; i < step(r).exchangeCap! + 2; i++) r.act('scene/exchange');
    await flush();
    expect(r.h.state().scene).toBeDefined();
    expect(r.modal).toHaveBeenCalledTimes(1);
  });

  it('a dismissed Move on? (escape) keeps the scene too', async () => {
    const r = rig(undefined, null);
    await r.ob.startLineup();
    for (let i = 0; i < step(r).exchangeCap!; i++) r.act('scene/exchange');
    await flush();
    expect(r.h.state().scene).toBeDefined();
  });

  it('closing the line-up scene completes the step and clears the prologue directives', async () => {
    const r = rig();
    await r.ob.startLineup();
    r.act('scene/end', {});
    await flush();
    expect(r.h.state().onboarding).toMatchObject({ stepId: 'first_words', completed: expect.arrayContaining(['lineup']) });
    expect(dirs(r)).not.toContain(lineup(r));
    expect(dirs(r)).not.toContain('natural close');
  });

  it('an aborted line-up does not complete the step but clears the directives', async () => {
    const r = rig();
    await r.ob.startLineup();
    r.act('scene/abort', {});
    await flush();
    expect(r.h.state().onboarding!.stepId).toBe('lineup');
    expect(dirs(r)).not.toContain(lineup(r));
  });

  it('a scene that is not a prologue scene changes nothing', async () => {
    const r = rig();
    r.act('scene/start', { locationId: 'mess_hall', participants: ['unit_ann'], origin: 'event', startIndex: 0 });
    for (let i = 0; i < 8; i++) r.act('scene/exchange');
    r.act('scene/end', {});
    await flush();
    expect(r.modal).not.toHaveBeenCalled();
    expect(r.h.state().onboarding!.stepId).toBe('lineup');
  });

  it('after a reload the open prologue scene is picked up again (goal directive, cap, completion)', async () => {
    const r = rig();
    await r.ob.startLineup();
    // a fresh controller and context, as after a reload: the scene is in the state, the memory is gone
    const ctx2 = new ContextBuilder();
    const modal2 = vi.fn(async () => 'keep');
    const ob2 = createOnboarding({ ...r.h.deps, context: ctx2, refreshContext: vi.fn(), modal: modal2 as never, resumeScene: vi.fn(), openExpedition: vi.fn(), startScene: async () => true, endScene: async () => {} });
    ob2.onSceneOpened();
    expect(ctx2.build(r.h.state(), 5000).directives).toContain(lineup(r));
    const ended = r.h.app().dispatch({ type: 'scene/end', payload: {} });
    ob2.onEvents(ended);
    await flush();
    expect(r.h.state().onboarding!.stepId).toBe('first_words');
  });
});

describe('first words', () => {
  const atFirstWords = (tweak: (s: CampaignState) => void = () => {}) => rig((s) => { s.onboarding!.stepId = 'first_words'; tweak(s); });

  it('starts a scene with one unit and the step goal', async () => {
    const r = atFirstWords();
    expect(await r.ob.talkFirstWords('unit_bea')).toBe(true);
    expect(r.h.state().scene).toMatchObject({ origin: 'prologue', participants: ['unit_bea'], mode: 'private', consumesSlot: false });
    const goal = (reg.prologues.get('prologue_vesper')!.steps as Record<string, { directive: string }>).first_words.directive;
    expect(dirs(r)).toContain(goal);
  });

  it('on close marks her spoken; after the last unit the step completes', async () => {
    const r = atFirstWords();
    const ids = r.h.state().squad.map((u) => u.id);
    for (const [i, id] of ids.entries()) {
      expect(await r.ob.talkFirstWords(id)).toBe(true);
      r.act('scene/end', {});
      await flush();
      if (i < ids.length - 1) {
        expect(r.h.state().onboarding!.spoken).toEqual(ids.slice(0, i + 1));
        expect(r.h.state().onboarding!.stepId).toBe('first_words');
      }
    }
    expect(r.h.state().onboarding).toMatchObject({ stepId: 'tutorial', completed: expect.arrayContaining(['first_words']) });
  });

  it('refuses a unit that already spoke, a dead one and a grunt', async () => {
    const r = atFirstWords((s) => { s.onboarding!.spoken = ['unit_ann']; s.squad[1].status = 'dead'; });
    expect(await r.ob.talkFirstWords('unit_ann')).toBe(false);
    expect(await r.ob.talkFirstWords('unit_bea')).toBe(false);
    expect(await r.ob.talkFirstWords('ghost')).toBe(false);
    expect(r.h.state().scene).toBeUndefined();
  });

  it('skipFirstWords counts the unit as spoken and completes the step with the last one', async () => {
    const r = atFirstWords();
    const ids = r.h.state().squad.map((u) => u.id);
    for (const id of ids) r.ob.skipFirstWords(id);
    await flush();
    expect(r.h.state().onboarding!.stepId).toBe('tutorial');
  });

  it('confined unit offers only skip: a talk is refused with the restriction, SKIP still works', async () => {
    const r = atFirstWords((s) => {
      s.discipline = { restrictions: [{ id: 'r1', unitId: 'unit_ann', kind: 'confined', untilDay: 5 }] } as never;
    });
    expect(await r.ob.talkFirstWords('unit_ann')).toBe(false);
    expect(r.h.toasts.length).toBe(1);
    expect(r.h.state().scene).toBeUndefined();
    r.ob.skipFirstWords('unit_ann');
    expect(r.h.state().onboarding!.spoken).toEqual(['unit_ann']);
  });

  it('a first-words scene closes at its own cap (three exchanges)', async () => {
    const r = atFirstWords();
    await r.ob.talkFirstWords('unit_ann');
    const cap = step(r).exchangeCap!;
    expect(cap).toBe(3);
    for (let i = 0; i < cap; i++) r.act('scene/exchange');
    await flush();
    expect(r.modal).toHaveBeenCalledTimes(1);
  });
});

describe('skipStep', () => {
  it('asks, then dispatches skip_step', async () => {
    const r = rig(undefined, 'skip');
    await r.ob.skipStep();
    expect(r.modal).toHaveBeenCalledTimes(1);
    expect(r.modal.mock.calls[0][0]).toMatchObject({ actions: [{ value: 'skip' }, { value: 'keep' }] });
    expect(r.h.state().onboarding).toMatchObject({ stepId: 'first_words', skipped: ['lineup'] });
  });

  it('does nothing when the player keeps the step', async () => {
    const r = rig(undefined, 'keep');
    await r.ob.skipStep();
    expect(r.h.state().onboarding!.stepId).toBe('lineup');
  });

  it('a chat that changed while the modal was open drops the skip', async () => {
    const r = rig();
    r.modal.mockImplementationOnce(async () => { r.h.switchChat('other'); return 'skip'; });
    await r.ob.skipStep();
    expect(r.h.state().onboarding!.stepId).toBe('lineup');
  });

  it('does not ask when the prologue is over', async () => {
    const r = rig((s) => { s.onboarding!.done = true; });
    await r.ob.skipStep();
    expect(r.modal).not.toHaveBeenCalled();
  });
});

describe('resumeScene', () => {
  it('hands over to the app', () => {
    const r = rig();
    r.ob.resumeScene();
    expect(r.resume).toHaveBeenCalledTimes(1);
  });
});
