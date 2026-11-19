import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import { currentStep, prologueFor, stepsOf } from '../../src/engine/onboarding';
import { dispatch } from '../../src/engine/dispatch';
import { buildCampaign, type SetupResult } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { revealPending, wardenOf } from '../../src/engine/warden';
import { ContextBuilder } from '../../src/llm/context';
import { createOnboarding } from '../../src/onboarding/controller';
import type { OnboardingDeps } from '../../src/onboarding/deps';
import { loadCore, unitSetup } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import '../../src/engine/actions/warden';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const build = (over: Partial<SetupResult> = {}, prologue: string | null = 'prologue_vesper_leashswap'): CampaignState => {
  const r: SetupResult = {
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
    ...(prologue ? { onboarding: { prologueId: prologue, veteran: false } } : {}), ...over,
  };
  const out = buildCampaign(r, reg, { desireBondDefects: false, seed: 11 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};

describe('prologueFor', () => {
  it('prefers the leashswap entry', () => {
    expect(prologueFor(reg, 'start_vesper', 'leashswap')?.id).toBe('prologue_vesper_leashswap');
    expect(prologueFor(reg, 'start_kestrel', 'leashswap')?.id).toBe('prologue_kestrel_leashswap');
  });

  it('without a mode the old entry is returned', () => {
    expect(prologueFor(reg, 'start_vesper')?.id).toBe('prologue_vesper');
    expect(prologueFor(reg, 'start_kestrel')?.id).toBe('prologue_kestrel');
  });

  it('a start with no leashswap entry falls back to the one without a mode', () => {
    const slim: Registries = { ...reg, prologues: new Map([...reg.prologues].filter(([, e]) => e.mode === undefined)) };
    expect(prologueFor(slim, 'start_vesper', 'leashswap')?.id).toBe('prologue_vesper');
  });

  it('the leashswap prologue adds one corporate warden_reveal scene right after the line-up, with only the warden', () => {
    const steps = stepsOf(reg.prologues.get('prologue_vesper_leashswap')!);
    const ids = steps.map((s) => s.id);
    expect(ids[ids.indexOf('lineup') + 1]).toBe('warden_reveal');
    const reveal = steps.find((s) => s.id === 'warden_reveal')!;
    expect(reveal).toMatchObject({ kind: 'scene', voice: 'corporate', participants: 'warden', completion: 'no_open_scene' });
    expect(steps.filter((s) => s.participants === 'warden')).toHaveLength(1);
    expect(stepsOf(reg.prologues.get('prologue_vesper')!).some((s) => s.participants === 'warden')).toBe(false);
  });
});

describe('the reveal step', () => {
  function rig() {
    const s = build();
    const h = worldHarness(reg, s);
    const ctx = new ContextBuilder();
    // eslint-disable-next-line prefer-const
    let ob!: ReturnType<typeof createOnboarding>;
    const act = (type: string, payload?: unknown): EngineEvent[] => {
      const events = h.app().dispatch({ type, payload });
      ob.onEvents(events);
      return events;
    };
    const deps: OnboardingDeps = {
      ...h.deps, context: ctx, refreshContext: vi.fn(), modal: vi.fn(async () => 'move') as never, resumeScene: vi.fn(), openExpedition: vi.fn(),
      initiateDm: vi.fn(async () => {}), talkAt: vi.fn(async () => true), debrief: vi.fn(async () => true),
      startScene: async (o) => {
        const events = act('scene/start', { ...o, startIndex: 0 });
        if (events.some((e) => e.type === 'error')) return false;
        ob.onSceneOpened();
        return true;
      },
      endScene: async () => { act('scene/end', {}); },
    };
    ob = createOnboarding(deps);
    return { h, ob, act };
  }

  it('starts a scene with only the warden', async () => {
    const r = rig();
    // play the line-up out first
    await r.ob.startLineup();
    r.act('scene/end', {});
    expect(currentStep(r.h.state(), reg)?.id).toBe('warden_reveal');
    expect(await r.ob.startLineup()).toBe(true);
    const scene = r.h.state().scene!;
    expect(scene).toMatchObject({ origin: 'prologue', consumesSlot: false });
    expect(scene.participants).toEqual([wardenOf(r.h.state())!.unitId]);
    r.act('scene/end', {});
    expect(currentStep(r.h.state(), reg)?.id).not.toBe('warden_reveal');
  });

  it('is skipped when nobody holds the leash', () => {
    const s = build();
    delete s.leashswap!.warden;
    s.onboarding!.stepId = 'lineup';
    const out = dispatch(s, { type: 'onboarding/complete_step', payload: { stepId: 'lineup' } }, reg);
    expect(out.state.onboarding!.skipped).toContain('warden_reveal');
  });
});

describe('the reveal card', () => {
  it('a veteran campaign without a prologue shows the reveal once', () => {
    const s = build({}, null);
    expect(revealPending(s, reg)).toBe(true);
    const out = dispatch(s, { type: 'warden/revealed', payload: {} }, reg);
    expect(out.events.some((e) => e.type === 'error')).toBe(false);
    expect(out.state.leashswap!.revealed).toBe(true);
    expect(revealPending(out.state, reg)).toBe(false);
    const again = dispatch(out.state, { type: 'warden/revealed', payload: {} }, reg);
    expect(again.events.some((e) => e.type === 'error')).toBe(true);
  });

  it('is not shown while the prologue still has the reveal scene ahead, nor after it was played; shown when it was skipped', () => {
    const s = build();
    expect(revealPending(s, reg)).toBe(false); // ahead
    s.onboarding!.completed.push('warden_reveal');
    expect(revealPending(s, reg)).toBe(false); // played
    s.onboarding!.completed = s.onboarding!.completed.filter((x) => x !== 'warden_reveal');
    s.onboarding!.skipped.push('warden_reveal');
    expect(revealPending(s, reg)).toBe(true); // skipped
  });

  it('is never pending in the default mode', () => {
    const s = build({ mode: undefined }, 'prologue_vesper');
    expect(revealPending(s, reg)).toBe(false);
  });

  it('refuses outside the mode', () => {
    const s = build({ mode: undefined }, null);
    const out = dispatch(s, { type: 'warden/revealed', payload: {} }, reg);
    expect(out.events.some((e) => e.type === 'error')).toBe(true);
  });
});
