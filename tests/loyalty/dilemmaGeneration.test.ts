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
const wording = (title: string) => JSON.stringify({
  title, setup: 'The mess hall is short again.',
  options: [
    { label: 'Cut portions', effects: [eff('resource', 'supplies', 1), eff('stress', 'squad', 1)] },
    { label: 'Buy on the black market', effects: [eff('resource', 'supplies', 1), eff('resource', 'credits', -1), eff('faction', 'sable', 1)] },
  ],
});
const bad = JSON.stringify({ title: 'T', setup: 'S', options: [{ label: 'a', effects: [eff('resource', 'gold', 1)] }, { label: 'b', effects: [eff('resource', 'credits', 1)] }] });

function requested(over: Partial<Parameters<typeof worldHarness>[2]> = {}): WorldHarness {
  const h = worldHarness(reg, base, { autoRetry: 0, ...over });
  const events = h.app().dispatch({ type: 'dilemma/request', payload: { templateId: 'dil_rations', context: 'base' } });
  expect(events.some((e) => e.type === 'error')).toBe(false);
  return h;
}
const open = (h: WorldHarness) => h.state().dilemmas!.open!;
const records = (h: WorldHarness) => h.state().generations?.records ?? [];

describe('dilemma.generate', () => {
  it('a failed dilemma presents the authored block and records with fallbackApplied', async () => {
    const h = requested();
    await createDilemmas(h.deps).onRequested();
    expect(open(h)).toMatchObject({ status: 'presented', source: 'fallback' });
    expect(records(h)).toMatchObject([{ siteId: 'dilemma.generate', key: 'dl1', reason: 'network', fallbackApplied: true, status: 'open' }]);
  });

  it('RETRY rewords it before an answer', async () => {
    const h = requested();
    await createDilemmas(h.deps).onRequested();
    h.st.mainReplies = [wording('Short rations')];
    expect((await h.deps.generations.retry('g1')).kind).toBe('applied');
    expect(open(h)).toMatchObject({ status: 'presented', source: 'model', title: 'Short rations' });
    expect(records(h)).toEqual([]);
    expect(h.log.map((a) => a.type)).toContain('dilemma/reword');
  });

  it('a wording the engine rejects changes nothing', async () => {
    const h = requested();
    await createDilemmas(h.deps).onRequested();
    const card = structuredClone(open(h));
    h.st.mainReplies = [bad];
    const out = await h.deps.generations.retry('g1');
    expect(out).toMatchObject({ kind: 'failed', reason: 'invalid_output' });
    expect(open(h)).toEqual(card);
    expect(records(h)).toHaveLength(1);
  });

  it('REROLL before an answer replaces the wording; after an answer it is refused with the reason', async () => {
    const h = requested();
    h.st.mainReplies = [wording('First wording')];
    const ctrl = createDilemmas(h.deps);
    await ctrl.onRequested();
    expect(h.deps.generations.rerollState('dilemma.generate', 'dl1')).toEqual({ enabled: true });
    h.st.mainReplies = [wording('Second wording')];
    expect((await h.deps.generations.reroll('dilemma.generate', 'dl1')).kind).toBe('applied');
    expect(open(h).title).toBe('Second wording');
    expect(records(h)).toEqual([]);
    ctrl.choose(0);
    expect(h.deps.generations.rerollState('dilemma.generate', 'dl1')).toEqual({ enabled: false, reason: 'It was answered.' });
    const calls = h.st.calls.length;
    expect(await h.deps.generations.reroll('dilemma.generate', 'dl1')).toEqual({ kind: 'expired', why: 'It was answered.' });
    expect(h.st.calls).toHaveLength(calls);
  });

  it('a failed reroll keeps the wording that was there', async () => {
    const h = requested();
    h.st.mainReplies = [wording('First wording')];
    await createDilemmas(h.deps).onRequested();
    h.st.mainReplies = [];
    expect(await h.deps.generations.reroll('dilemma.generate', 'dl1')).toMatchObject({ kind: 'failed', fallbackApplied: false });
    expect(open(h)).toMatchObject({ source: 'model', title: 'First wording' });
  });

  it('an engine rejection retries within autoRetry, then the authored block shows with a record', async () => {
    const h = requested({ autoRetry: 1 });
    h.st.mainReplies = [bad, bad];
    await createDilemmas(h.deps).onRequested();
    expect(h.st.calls).toHaveLength(2);
    expect(open(h)).toMatchObject({ status: 'presented', source: 'fallback' });
    expect(records(h)).toMatchObject([{ reason: 'invalid_output', fallbackApplied: true, attempts: 2 }]);
  });

  it('with autoRetry 0 one rejection is final: the request falls back and a record stays', async () => {
    const h = requested({ autoRetry: 0 });
    h.st.mainReplies = [bad];
    await createDilemmas(h.deps).onRequested();
    expect(h.st.calls).toHaveLength(1);
    expect(open(h)).toMatchObject({ status: 'presented', source: 'fallback' });
    expect(records(h)).toHaveLength(1);
  });

  it('a record expires once the decision was answered', async () => {
    const h = requested();
    const ctrl = createDilemmas(h.deps);
    await ctrl.onRequested();
    ctrl.choose(0);
    expect(await h.deps.generations.retry('g1')).toEqual({ kind: 'expired', why: 'The decision was made.' });
    expect(records(h)[0]).toMatchObject({ status: 'expired' });
  });
});
