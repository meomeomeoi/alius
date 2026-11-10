import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { openRequest } from '../../src/engine/world/director';
import type { CampaignState } from '../../src/engine/state/types';
import { createDirector } from '../../src/world/directorController';
import { campaign, loadCore } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
let requested: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  requested = campaign(reg, 4);
  openRequest(requested, 'day_end');
});
const valid = readFileSync('tests/fixtures/director_tick/valid.txt', 'utf8');
const directorActions = (h: { log: Array<{ type: string }> }) => h.log.filter((a) => a.type.startsWith('director/'));

describe('director controller', () => {
  it('a request leads to one LLM call and one director/apply', async () => {
    const h = worldHarness(reg, requested);
    h.st.mainReplies = [valid];
    const director = createDirector(h.deps);
    await director.onRequested();
    expect(h.st.calls).toHaveLength(1);
    expect(directorActions(h).map((a) => a.type)).toEqual(['director/apply']);
    expect(h.state().world.director!.pending).toBeUndefined();
    expect(h.state().world.spine!.proposed).toBe('beat_1');
    expect(director.busy()).toBe(false);
    // nothing open: nothing happens
    await director.onRequested();
    expect(h.st.calls).toHaveLength(1);
    expect(h.toasts).toEqual([]);
  });

  it('the apply carries the request id and the cooldown setting', async () => {
    const h = worldHarness(reg, requested, { beatCooldownDays: 1 });
    h.st.mainReplies = [valid];
    await createDirector(h.deps).onRequested();
    const apply = h.log.find((a) => a.type === 'director/apply')!;
    expect(apply.payload).toMatchObject({ requestId: 'd1', beatCooldownDays: 1 });
  });

  it('a failed call falls back', async () => {
    const h = worldHarness(reg, requested);
    h.st.mainReplies = []; // the call fails
    await createDirector(h.deps).onRequested();
    expect(directorActions(h)).toEqual([{ type: 'director/fallback', payload: { requestId: 'd1' } }]);
    expect(h.state().world.director!.pending).toBeUndefined();
    expect(h.state().missions.offered.length).toBeGreaterThan(0);
  });

  it('an invalid answer (twice) falls back too', async () => {
    const h = worldHarness(reg, requested);
    h.st.mainReplies = ['no json here', 'still none'];
    await createDirector(h.deps).onRequested();
    expect(h.st.calls).toHaveLength(2);
    expect(directorActions(h).map((a) => a.type)).toEqual(['director/fallback']);
  });

  it('directorEnabled off never calls the model', async () => {
    const h = worldHarness(reg, requested, { directorEnabled: false });
    h.st.mainReplies = [valid];
    await createDirector(h.deps).onRequested();
    expect(h.st.calls).toHaveLength(0);
    expect(directorActions(h).map((a) => a.type)).toEqual(['director/fallback']);
    expect(h.state().world.director!.pending).toBeUndefined();
  });

  it('two onRequested calls for one request make one call', async () => {
    const h = worldHarness(reg, requested);
    h.st.mainReplies = [valid, valid];
    const director = createDirector(h.deps);
    const a = director.onRequested();
    expect(director.busy()).toBe(true);
    const b = director.onRequested();
    await Promise.all([a, b]);
    expect(h.st.calls).toHaveLength(1);
    expect(directorActions(h)).toHaveLength(1);
  });

  it('a chat switch during the call drops the answer and the request stays open for the next load', async () => {
    const h = worldHarness(reg, requested);
    h.st.mainReplies = [valid];
    const original = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.switchChat('other');
      return original(req);
    };
    const director = createDirector(h.deps);
    await director.onRequested();
    expect(directorActions(h)).toEqual([]);
    expect(h.state().world.director!.pending!.id).toBe('d1');
    expect(h.toasts).toEqual([]);
    expect(director.busy()).toBe(false);
    // back in the first chat the same request can be answered
    h.switchChat('c');
    h.st.generateMain = original;
    h.st.mainReplies = [valid];
    await director.onRequested();
    expect(directorActions(h).map((a) => a.type)).toEqual(['director/apply']);
  });

  it('a stale answer (the request was closed meanwhile) is dropped without a toast', async () => {
    const h = worldHarness(reg, requested);
    h.st.mainReplies = [valid];
    const original = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.app().dispatch({ type: 'director/fallback', payload: { requestId: 'd1' } });
      return original(req);
    };
    await createDirector(h.deps).onRequested();
    expect(h.toasts).toEqual([]);
    // the late apply was tried and refused by the engine; nothing was applied twice
    expect(directorActions(h).map((a) => a.type)).toEqual(['director/fallback', 'director/apply']);
    expect(h.state().rumors.every((r) => r.text !== 'A convoy of sealed crates was left on the overpass. Three crews have gone to look.')).toBe(true);
  });

  it('in debug mode a toast lists what the engine rejected', async () => {
    const h = worldHarness(reg, requested, { debug: true });
    h.st.mainReplies = [JSON.stringify({ missionOffers: [{ templateId: 'ghost', regionId: 'ashway' }], clockAdvances: [{ clockId: 'bloom_d7', by: 9, reason: 'x' }] })];
    await createDirector(h.deps).onRequested();
    const toast = h.toasts.find((t) => /rejected/i.test(t.text))!;
    expect(toast.text).toContain('missionOffers[0]');
    expect(toast.text).toContain('clockAdvances[0]');
    const quiet = worldHarness(reg, requested);
    quiet.st.mainReplies = [JSON.stringify({ missionOffers: [{ templateId: 'ghost', regionId: 'ashway' }] })];
    await createDirector(quiet.deps).onRequested();
    expect(quiet.toasts).toEqual([]);
  });

  it('answers a scout request through the same path', async () => {
    const s = campaign(reg, 4);
    openRequest(s, 'scout');
    const h = worldHarness(reg, s);
    h.st.mainReplies = [valid];
    await createDirector(h.deps).onRequested();
    expect((h.st.calls[0] as { prompt: string }).prompt).toMatch(/rumors only/i);
    expect(h.state().missions.offered).toEqual([]);
    expect(h.state().rumors).toHaveLength(1);
  });
});
