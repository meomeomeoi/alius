import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { overrideOpen, wardenOf } from '../../src/engine/warden';
import { createWarden } from '../../src/warden/controller';
import { ContextBuilder } from '../../src/llm/context';
import { loadCore, unitSetup } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/scene';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

function overridden(): CampaignState {
  for (let seed = 1; seed < 300; seed++) {
    const out = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
      mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
    }, reg, { desireBondDefects: false, seed });
    if (!out.ok) throw new Error(out.errors.join('; '));
    const w = wardenOf(out.state)!;
    w.expectations = [{ id: 'e1', kind: 'keep_me_close', weight: 0.5, source: 'values', known: false }];
    w.satisfaction = 0;
    const r = dispatch(out.state, { type: 'activity/do', payload: { activityId: 'train', companionId: 'unit_ann' } }, reg);
    if (overrideOpen(r.state)) return r.state;
  }
  throw new Error('no seed overrides');
}

function rig() {
  const h = worldHarness(reg, overridden());
  const ctx = new ContextBuilder();
  const startScene = vi.fn(async (o: { locationId: string; participants: string[] }) => {
    const events = h.app().dispatch({ type: 'scene/start', payload: { ...o, origin: 'event', consumesSlot: false, startIndex: 0 } });
    return !events.some((e) => e.type === 'error');
  });
  const ctl = createWarden({ ...h.deps, context: ctx, refreshContext: vi.fn(), restore: () => false, startScene });
  return { h, ctl, ctx, startScene };
}
const dirs = (r: ReturnType<typeof rig>) => r.ctx.build(r.h.state(), 5000).directives;

describe('WardenController.argue', () => {
  it('opens the scene with her alone, marks the override and sets warden:argue', async () => {
    const r = rig();
    expect(await r.ctl.argue()).toBe(true);
    const s = r.h.state();
    expect(s.scene).toMatchObject({ origin: 'event', consumesSlot: false, participants: ['unit_bea'] });
    expect(overrideOpen(s)!.arguing).toBe(s.scene!.id);
    const text = dirs(r);
    expect(text).toContain('Bea has overridden the commander\'s order: Train with Ann');
    expect(text).toContain('She wants: Train with Bea');
    expect(text).toContain('only by a real compromise');
    expect(text).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('the directive goes when the scene ends', async () => {
    const r = rig();
    await r.ctl.argue();
    const events = r.h.app().dispatch({ type: 'scene/end', payload: {} });
    r.ctl.onEvents(events);
    expect(dirs(r)).not.toContain('has overridden');
  });

  it('does nothing without an override, while compelled, or after the argument', async () => {
    const r = rig();
    r.h.setState((s) => { wardenOf(s)!.compelled = true; });
    expect(await r.ctl.argue()).toBe(false);
    expect(r.startScene).not.toHaveBeenCalled();
    const r2 = rig();
    r2.h.setState((s) => { wardenOf(s)!.override!.argued = true; });
    expect(await r2.ctl.argue()).toBe(false);
  });

  it('a scene that will not open leaves the override as it was', async () => {
    const r = rig();
    r.startScene.mockResolvedValueOnce(false);
    expect(await r.ctl.argue()).toBe(false);
    expect(overrideOpen(r.h.state())!.arguing).toBeUndefined();
  });
});
