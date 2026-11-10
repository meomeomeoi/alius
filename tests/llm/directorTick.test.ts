import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildDigest, validateDirectorOutput } from '../../src/engine/world/director';
import { runDirectorTick } from '../../src/llm/calls/directorTick';
import { llmLog } from '../../src/llm/log';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => llmLog.clear());

const fixture = (n: string) => readFileSync(`tests/fixtures/director_tick/${n}.txt`, 'utf8');
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};
const digestInput = (reason: 'day_end' | 'expedition' | 'scout' = 'day_end') => ({ digest: buildDigest(campaign(reg, 4), reg), reason });
const run = async (reply: string | string[], reason: 'day_end' | 'expedition' | 'scout' = 'day_end') => {
  const { st, settings } = setup();
  st.mainReplies = Array.isArray(reply) ? reply : [reply];
  const out = (await runDirectorTick(digestInput(reason), { st, settings })) as Record<string, unknown> | null;
  return { out, st };
};
/** What the engine keeps of a hostile answer, on a campaign with the biggest comms room. */
const validated = (raw: unknown) => {
  const s = campaign(reg, 4);
  s.base.facilities.comms = 3;
  return validateDirectorOutput(s, reg, raw, { cooldownDays: 3 });
};

describe('director_tick call', () => {
  it('valid fixture returns the five parts', async () => {
    const { out } = await run(fixture('valid'));
    expect(Object.keys(out!).sort()).toEqual(['clockAdvances', 'missionOffers', 'rumors', 'storyBeatProposal', 'threadUpdates']);
    expect((out!.missionOffers as unknown[])).toHaveLength(1);
    expect(out!.storyBeatProposal).toMatchObject({ beatId: 'beat_1' });
    // and the engine accepts all of it
    const r = validated(out);
    expect(r.rejected).toEqual([]);
    expect(r.output.missionOffers).toHaveLength(1);
    expect(r.output.rumors[0].leadsTo).toBe('mission');
    expect(r.output.clockAdvances).toHaveLength(1);
    expect(r.output.threadUpdates[0].threadId).toBe('new');
    expect(r.output.storyBeatProposal!.beatId).toBe('beat_1');
  });

  it('prose-wrapped JSON is recovered', async () => {
    const { out } = await run(fixture('prose_wrapped'));
    expect((out!.rumors as unknown[])).toHaveLength(1);
  });

  it('truncated fixture keeps the complete parts or retries once with a 1.5× budget, then returns null', async () => {
    const { out, st } = await run(fixture('truncated'));
    expect(out).not.toBeNull();
    expect((out!.missionOffers as unknown[])).toHaveLength(1);
    expect((out!.rumors as unknown[])).toHaveLength(1);
    expect(st.calls).toHaveLength(1);
    // a cut that leaves nothing usable: retry once with 1.5× the budget, then null
    const { settings, st: st2 } = setup();
    st2.mainReplies = ['{"missionOffers": [{"templateId": "tpl_sw', '{"missionOffers": [{"templateId": "tpl_sw'];
    expect(await runDirectorTick(digestInput(), { st: st2, settings })).toBeNull();
    expect(st2.calls).toHaveLength(2);
    const [a, b] = st2.calls as Array<{ maxTokens: number }>;
    // the retry never asks for less (the request floor of mechanic calls may lift both to the same size)
    expect(b.maxTokens).toBeGreaterThanOrEqual(a.maxTokens);
  });

  it('invalid fixture returns null and the log has two attempts', async () => {
    const { out, st } = await run([fixture('invalid'), fixture('invalid')]);
    expect(out).toBeNull();
    expect(st.calls).toHaveLength(2);
    expect(llmLog.entries().filter((e) => e.callType === 'director_tick')).toHaveLength(2);
  });

  it('a bad entry does not fail the whole answer', async () => {
    const { out } = await run(JSON.stringify({ missionOffers: 'nope', rumors: [1, { text: 'ok' }], clockAdvances: [{ clockId: 'bloom_d7', by: 1, reason: 'r' }] }));
    expect(out).not.toBeNull();
    expect(out!.missionOffers).toBeUndefined();
    expect((out!.rumors as unknown[])).toHaveLength(2);
    expect(validated(out).output.rumors).toEqual([{ text: 'ok', leadsTo: 'none', tags: [] }]);
  });

  it('hostile_ids passes the shape and nothing illegal survives validateDirectorOutput', async () => {
    const { out } = await run(fixture('hostile_ids'));
    expect(out).not.toBeNull();
    const r = validated(out);
    expect(r.output.missionOffers).toEqual([]);
    expect(r.output.rumors).toEqual([]);
    expect(r.output.threadUpdates).toEqual([]);
    expect(r.output.clockAdvances).toEqual([]);
    expect(r.output.storyBeatProposal).toBeUndefined();
    expect(r.rejected.length).toBeGreaterThanOrEqual(8);
  });

  it('hostile_amounts passes the shape and no amount is read', async () => {
    const { out } = await run(fixture('hostile_amounts'));
    const r = validated(out);
    expect(r.output.missionOffers).toEqual([{ templateId: 'tpl_sweep', regionId: 'ashway', danger: 2, rewardsTier: 'tier_1' }]);
    expect(r.output.rumors[0]).toEqual({ text: 'Free money for everyone.', leadsTo: 'none', tags: [] });
    expect(r.output.clockAdvances).toEqual([]);
    expect(r.output.storyBeatProposal).toEqual({ beatId: 'beat_1', framing: 'Go.' });
    expect(JSON.stringify(r.output)).not.toMatch(/9999|5000|1e\+?9|credits/);
  });

  it('hostile_flood is cut down to the limits', async () => {
    const { out } = await run(fixture('hostile_flood'));
    const r = validated(out);
    expect(r.output.missionOffers.length).toBeLessThanOrEqual(2);
    expect(r.output.rumors.length).toBeLessThanOrEqual(3);
    expect(r.output.threadUpdates.length).toBeLessThanOrEqual(1);
    expect(r.output.clockAdvances.reduce((n, c) => n + c.by, 0)).toBeLessThanOrEqual(3);
    expect(r.rejected.length).toBeGreaterThan(50);
  });

  it('no mechanic profile and no fallback-to-main returns null without a call', async () => {
    const { st, settings } = setup();
    settings.mechanicFallbackToMain = false;
    st.mainReplies = [fixture('valid')];
    expect(await runDirectorTick(digestInput(), { st, settings })).toBeNull();
    expect(st.calls).toHaveLength(0);
  });

  it('a failing call returns null', async () => {
    const { st, settings } = setup();
    st.mainReplies = [];
    expect(await runDirectorTick(digestInput(), { st, settings })).toBeNull();
  });

  it('the prompt contains the digest and never a unit id', async () => {
    const { st } = await run(fixture('valid'), 'expedition');
    const call = st.calls[0] as { prompt: string; system: string };
    const s = campaign(reg, 4);
    expect(call.prompt).toContain(JSON.stringify(buildDigest(s, reg)));
    expect(call.prompt).toContain('expedition');
    for (const u of s.squad) expect(call.prompt).not.toContain(u.id);
    expect(call.system).toMatch(/never write amounts/i);
    expect(call.system).toMatch(/at most 2 mission offers and 3 rumors/i);
    expect(call.system).toMatch(/never skip or invent story beats/i);
  });

  it('a scout request tells the model to answer with rumors only', async () => {
    const { st } = await run(fixture('valid'), 'scout');
    expect((st.calls[0] as { prompt: string }).prompt).toMatch(/rumors only/i);
  });
});
