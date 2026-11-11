import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { llmLog } from '../../src/llm/log';
import { createDilemmas } from '../../src/loyalty/dilemmaController';
import { campaign, loadCore } from '../helpers/loyalty';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
beforeEach(() => llmLog.clear());

const eff = (kind: string, target: string, direction: 1 | -1, magnitude = 'small') => ({ kind, target, direction, magnitude });
const valid = JSON.stringify({
  title: 'Short rations', setup: 'The mess hall is short again.',
  options: [
    { label: 'Cut portions', effects: [eff('resource', 'supplies', 1), eff('stress', 'squad', 1)] },
    { label: 'Buy on the black market', effects: [eff('resource', 'supplies', 1), eff('resource', 'credits', -1), eff('faction', 'sable', 1)] },
  ],
});
/** Engine-invalid but well-shaped: it reaches the engine, which rejects it. */
const bad = JSON.stringify({ title: 'T', setup: 'S', options: [{ label: 'a', effects: [eff('resource', 'gold', 1)] }, { label: 'b', effects: [eff('resource', 'credits', 1)] }] });

function requested(over: Partial<Parameters<typeof worldHarness>[2]> = {}): WorldHarness {
  const h = worldHarness(reg, base, over);
  const events = h.app().dispatch({ type: 'dilemma/request', payload: { templateId: 'dil_rations', context: 'base' } });
  expect(events.some((e) => e.type === 'error')).toBe(false);
  return h;
}
const kinds = (h: WorldHarness) => h.log.map((a) => a.type).filter((t) => t.startsWith('dilemma/'));
const open = (h: WorldHarness) => h.state().dilemmas!.open!;

describe('dilemma controller', () => {
  it('a request is answered with present after one call', async () => {
    const h = requested();
    h.st.mainReplies = [valid];
    await createDilemmas({ ...h.deps }).onRequested();
    expect(h.st.calls).toHaveLength(1);
    expect(kinds(h)).toEqual(['dilemma/request', 'dilemma/present']);
    expect(open(h)).toMatchObject({ status: 'presented', source: 'model', title: 'Short rations' });
    expect(h.toasts).toEqual([]);
    const prompt = (h.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('dil_rations');
    expect(prompt).toContain('Write exactly 2 options');
  });

  it('a rejected first answer triggers exactly one more call', async () => {
    const h = requested();
    h.st.mainReplies = [bad, valid];
    await createDilemmas(h.deps).onRequested();
    expect(h.st.calls).toHaveLength(2);
    expect(kinds(h)).toEqual(['dilemma/request', 'dilemma/present', 'dilemma/present']);
    expect(open(h)).toMatchObject({ status: 'presented', source: 'model', attempts: 2 });
  });

  it('two rejected answers make two calls and the engine presents its authored block', async () => {
    const h = requested();
    h.st.mainReplies = [bad, bad, valid];
    await createDilemmas(h.deps).onRequested();
    expect(h.st.calls).toHaveLength(2);
    expect(open(h)).toMatchObject({ status: 'presented', source: 'fallback' });
  });

  it('a failed call, a missing profile and the setting off all answer with fallback', async () => {
    // a failed call: nothing queued, the fake throws
    const failed = requested();
    await createDilemmas(failed.deps).onRequested();
    expect(kinds(failed)).toEqual(['dilemma/request', 'dilemma/fallback']);
    expect(open(failed)).toMatchObject({ status: 'presented', source: 'fallback' });
    expect(failed.toasts).toEqual([]);

    // no profile and no fallback to the main model: no call at all
    const noProfile = requested({ mechanicProfileId: '', mechanicFallbackToMain: false });
    noProfile.st.mainReplies = [valid];
    await createDilemmas(noProfile.deps).onRequested();
    expect(noProfile.st.calls).toHaveLength(0);
    expect(kinds(noProfile)).toEqual(['dilemma/request', 'dilemma/fallback']);

    // the setting off
    const off = requested({ dilemmasEnabled: false });
    off.st.mainReplies = [valid];
    await createDilemmas(off.deps).onRequested();
    expect(off.st.calls).toHaveLength(0);
    expect(kinds(off)).toEqual(['dilemma/request', 'dilemma/fallback']);
  });

  it('two onRequested for one request make one call', async () => {
    const h = requested();
    h.st.mainReplies = [valid];
    const ctrl = createDilemmas(h.deps);
    const a = ctrl.onRequested();
    const b = ctrl.onRequested();
    expect(ctrl.busy()).toBe(true);
    await Promise.all([a, b]);
    expect(h.st.calls).toHaveLength(1);
    expect(ctrl.busy()).toBe(false);
    expect(kinds(h)).toEqual(['dilemma/request', 'dilemma/present']);
    // nothing left to answer
    await ctrl.onRequested();
    expect(h.st.calls).toHaveLength(1);
  });

  it('a chat switch during the call drops the answer and leaves the request open', async () => {
    const h = requested();
    h.st.mainReplies = [valid];
    const original = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.switchChat('other');
      return original(req);
    };
    const ctrl = createDilemmas(h.deps);
    await ctrl.onRequested();
    expect(kinds(h)).toEqual(['dilemma/request']);
    expect(open(h).status).toBe('requested');
    expect(h.toasts).toEqual([]);
    expect(ctrl.busy()).toBe(false);
    h.switchChat('c');
    h.st.generateMain = original;
    h.st.mainReplies = [valid];
    await ctrl.onRequested();
    expect(open(h).status).toBe('presented');
  });

  it('never toasts a stale answer, a chat change or a fight in progress', async () => {
    const h = requested();
    h.st.mainReplies = [valid];
    const original = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.app().dispatch({ type: 'dilemma/fallback', payload: { requestId: 'dl1' } }); // closed meanwhile
      return original(req);
    };
    await createDilemmas(h.deps).onRequested();
    expect(h.toasts).toEqual([]);
    expect(open(h).source).toBe('fallback');

    const fight = requested();
    fight.setState((s) => { s.combat = { id: 'x' } as never; });
    fight.st.mainReplies = [valid];
    await createDilemmas(fight.deps).onRequested();
    expect(fight.toasts).toEqual([]);
  });

  it('in debug mode the rejection reasons are shown', async () => {
    const h = requested({ debug: true });
    h.st.mainReplies = [bad, valid];
    await createDilemmas(h.deps).onRequested();
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0].kind).toBe('info');
    expect(h.toasts[0].text).toMatch(/Dilemma answer rejected/);
    expect(h.toasts[0].text).toMatch(/gold|resource/i);
    const quiet = requested({ debug: false });
    quiet.st.mainReplies = [bad, valid];
    await createDilemmas(quiet.deps).onRequested();
    expect(quiet.toasts).toEqual([]);
  });

  it('choose dispatches dilemma/choose for the open dilemma and returns the events', async () => {
    const h = requested();
    h.st.mainReplies = [valid];
    const ctrl = createDilemmas(h.deps);
    await ctrl.onRequested();
    const events = ctrl.choose(1);
    expect(events.some((e) => e.type === 'dilemma_resolved')).toBe(true);
    expect(h.state().dilemmas!.open).toBeUndefined();
    expect(h.log.at(-1)).toEqual({ type: 'dilemma/choose', payload: { id: 'dl1', index: 1 } });
    // nothing open: nothing dispatched, no toast
    const before = h.log.length;
    expect(ctrl.choose(0)).toEqual([]);
    expect(h.log).toHaveLength(before);
  });

  it('a request whose template vanished is answered with the fallback, which resolves it', async () => {
    const h = requested();
    const gone = worldHarness({ ...reg, dilemmaTemplates: new Map([...reg.dilemmaTemplates].filter(([id]) => id !== 'dil_rations')) } as Registries, h.state());
    gone.st.mainReplies = [valid];
    await createDilemmas(gone.deps).onRequested();
    expect(gone.state().dilemmas!.open).toBeUndefined();
    expect(gone.st.calls).toHaveLength(0);
  });
});
