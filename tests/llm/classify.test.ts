import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { FakeStAdapter } from '../../src/st/fake';
import { attemptLlm, callLlm, compileRefusals, type LlmDeps } from '../../src/llm/orchestrator';
import { llmLog } from '../../src/llm/log';
import { DEFAULT_SETTINGS, getSettings, type AliusSettings } from '../../src/settings';
import { emptyRegistries } from '../../src/content/types';
import { LlmRefusalSchema } from '../../src/content/schemas';
import '../../src/llm/calls/dmReply';
import {
  AI_REFUSAL_JSON, CUT_JSON, EMPTY, GOOD_PING, IN_CHARACTER_NO, INVALID_OBJECT, REFUSAL, THINKING_ONLY,
} from '../fixtures/llm/failures';

function setup(over: Partial<AliusSettings> = {}) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  st.profiles = [{ id: 'mech', name: 'Mech', api: 'openrouter', model: 'm' }];
  const settings: AliusSettings = { ...getSettings(st), mechanicProfileId: 'mech', requestFloor: 0, ...over };
  const deps: LlmDeps = { st, settings };
  return { st, settings, deps };
}

async function refusalPatterns() {
  const raw = JSON.parse(await readFile('content/core/llmRefusals.json', 'utf8')) as Array<Record<string, unknown> & { id: string }>;
  const reg = emptyRegistries();
  for (const e of raw) reg.llmRefusals.set(e.id, LlmRefusalSchema.parse(e) as never);
  return compileRefusals(reg);
}

const DM_INPUT = { unitName: 'Ann', commanderName: 'Vale', slotText: 'Day 1', stateHint: 'wary', bands: { trust: 'mid', affinity: 'mid', attraction: 'low', stress: 'low' }, recentFacts: [], history: [], mode: 'reply' };

beforeEach(() => llmLog.clear());
afterEach(() => vi.useRealTimers());

describe('failure reasons', () => {
  it('no profile', async () => {
    const { deps, st } = setup({ mechanicProfileId: 'missing', mechanicFallbackToMain: false });
    const r = await callLlm('ping', 'x', deps);
    expect(r).toMatchObject({ ok: false, reason: 'no_profile', attempts: 0 });
    expect(st.calls).toHaveLength(0);
  });

  it('a thrown error is network', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.profileReplies = [new Error('ECONNRESET')];
    const r = await callLlm('ping', 'x', deps);
    expect(r).toMatchObject({ ok: false, reason: 'network', attempts: 1 });
    if (!r.ok) expect(r.detail).toContain('ECONNRESET');
  });

  it('an abort is timeout', async () => {
    vi.useFakeTimers();
    const { deps, st } = setup({ llmTimeoutMs: 10000, autoRetry: 0 });
    st.hangNext(true);
    const p = callLlm('ping', 'x', deps);
    await vi.advanceTimersByTimeAsync(10000);
    const r = await p;
    expect(r).toMatchObject({ ok: false, reason: 'timeout', attempts: 1 });
  });

  it('a main call past the timeout is timeout and the late answer is logged late', async () => {
    vi.useFakeTimers();
    const { deps, st } = setup({ llmTimeoutMs: 10000, autoRetry: 0, mechanicFallbackToMain: true, mechanicProfileId: '' });
    st.generateMain = () => new Promise((res) => setTimeout(() => res({ text: GOOD_PING }), 15000)); // ignores the signal
    const p = callLlm('ping', 'x', deps);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await p).toMatchObject({ ok: false, reason: 'timeout' });
    expect(llmLog.entries().filter((e) => e.late)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(6000);
    const late = llmLog.entries().filter((e) => e.late);
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ raw: GOOD_PING, ok: false });
  });

  it('thinking only is truncated', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.profileReplies = [THINKING_ONLY];
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'truncated' });
  });

  it('empty with a length stop is truncated, plain empty is empty', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.queueAnswer({ text: '', finishReason: 'length' }, true);
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'truncated' });
    st.profileReplies = [EMPTY];
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('empty is empty', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.profileReplies = ['   '];
    const r = await callLlm('ping', 'x', deps);
    expect(r).toMatchObject({ ok: false, reason: 'empty', attempts: 1 });
  });

  it('a cut JSON is truncated', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.profileReplies = ['{"pong": tr'];
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'truncated' });
    st.profileReplies = [CUT_JSON.slice(0, 9)];
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'truncated' });
  });

  it('finishReason length with a failing schema is truncated', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.queueAnswer({ text: INVALID_OBJECT, finishReason: 'length' }, true);
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'truncated' });
  });

  it('finishReason length with no JSON at all is truncated', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.queueAnswer({ text: 'Here is the answer you asked for', finishReason: 'length' }, true);
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'truncated' });
  });

  it('refusal text with no JSON is refused', async () => {
    const refusals = await refusalPatterns();
    const { deps, st } = setup();
    st.profileReplies = [REFUSAL];
    const r = await callLlm('ping', 'x', { ...deps, refusals });
    expect(r).toMatchObject({ ok: false, reason: 'refused', attempts: 1 });
    st.profileReplies = [AI_REFUSAL_JSON];
    expect(await callLlm('ping', 'x', { ...deps, refusals })).toMatchObject({ ok: false, reason: 'refused' });
  });

  it('{} where the schema needs fields is refused', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.profileReplies = ['{}'];
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'refused' });
    st.profileReplies = ['[]'];
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, reason: 'refused' });
  });

  it('a wrong field is invalid_output with the zod path in detail', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.profileReplies = [INVALID_OBJECT];
    const r = await callLlm('ping', 'x', deps);
    expect(r).toMatchObject({ ok: false, reason: 'invalid_output' });
    if (!r.ok) expect(r.detail).toMatch(/pong|echo/);
  });

  it('prose with an in-character no is ok', async () => {
    const refusals = await refusalPatterns();
    const { deps, st } = setup({ mechanicFallbackToMain: true });
    st.mainReplies = [IN_CHARACTER_NO];
    const r = await callLlm('dm_reply', DM_INPUT, { ...deps, refusals });
    expect(r).toMatchObject({ ok: true, value: IN_CHARACTER_NO });
  });

  it('an AI-voice refusal in prose is refused', async () => {
    const refusals = await refusalPatterns();
    const { deps, st } = setup({ autoRetry: 0 });
    st.mainReplies = ['As an AI language model, I am unable to continue this roleplay.'];
    expect(await callLlm('dm_reply', DM_INPUT, { ...deps, refusals })).toMatchObject({ ok: false, reason: 'refused' });
  });

  it('scope json patterns are not tried on prose', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    const refusals = [{ re: /^\s*sorry/i, scope: 'json' as const }, { re: /as an ai/i, scope: 'any' as const }];
    st.mainReplies = ['Sorry, I was late.'];
    expect((await callLlm('dm_reply', DM_INPUT, { ...deps, refusals })).ok).toBe(true);
    st.mainReplies = ['Sorry, I was late. As an AI I mean nothing by it.'];
    expect((await callLlm('dm_reply', DM_INPUT, { ...deps, refusals })).ok).toBe(false);
  });

  it('attemptLlm makes exactly one attempt and reports the log timestamp', async () => {
    const { deps, st } = setup();
    st.profileReplies = [INVALID_OBJECT, GOOD_PING];
    const r = await attemptLlm('ping', 'x', deps, { budget: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_output', attempts: 1, budget: 100 });
    expect(st.calls).toHaveLength(1);
    expect(r.at).toBe(llmLog.entries()[0].at);
    expect(llmLog.entries()[0]).toMatchObject({ ok: false, reason: 'invalid_output' });
  });
});

describe('automatic retries', () => {
  it('refused is never retried', async () => {
    const refusals = await refusalPatterns();
    const { deps, st } = setup({ autoRetry: 2 });
    st.profileReplies = [REFUSAL];
    const r = await callLlm('ping', 'x', { ...deps, refusals });
    expect(r).toMatchObject({ ok: false, reason: 'refused', attempts: 1 });
    expect(st.calls).toHaveLength(1);
  });

  it('autoRetry 2 retries invalid with ×1.5 then ×2.25 budgets', async () => {
    const { deps, st } = setup({ autoRetry: 2, requestFloor: 0 });
    st.profileReplies = [INVALID_OBJECT, INVALID_OBJECT, INVALID_OBJECT];
    const r = await callLlm('ping', 'x', deps);
    expect(r).toMatchObject({ ok: false, reason: 'invalid_output', attempts: 3, budget: 225 });
    expect(st.calls.map((c) => c.maxTokens)).toEqual([100, 150, 225]);
  });

  it('autoRetry 0 makes one attempt', async () => {
    const { deps, st } = setup({ autoRetry: 0 });
    st.profileReplies = [INVALID_OBJECT, GOOD_PING];
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: false, attempts: 1 });
    expect(st.calls).toHaveLength(1);
  });

  it('the default is one retry', async () => {
    expect(DEFAULT_SETTINGS.autoRetry).toBe(1);
    const st = new FakeStAdapter();
    st.profiles = [{ id: 'mech', name: 'Mech', api: 'openrouter', model: 'm' }];
    Object.assign(st.getSettings(), { mechanicProfileId: 'mech', requestFloor: 0 });
    st.profileReplies = [INVALID_OBJECT, GOOD_PING];
    expect(await callLlm('ping', 'x', { st, settings: getSettings(st) })).toMatchObject({ ok: true, attempts: 2 });
  });

  it('network retries with the same budget', async () => {
    const { deps, st } = setup({ autoRetry: 2, requestFloor: 0 });
    st.profileReplies = [new Error('down'), new Error('down'), GOOD_PING];
    const r = await callLlm('ping', 'x', deps);
    expect(r).toMatchObject({ ok: true, attempts: 3 });
    expect(st.calls.map((c) => c.maxTokens)).toEqual([100, 100, 100]);
  });

  it('timeout and empty retry with the same budget too', async () => {
    const { deps, st } = setup({ autoRetry: 2, requestFloor: 0 });
    st.profileReplies = [EMPTY, EMPTY, GOOD_PING];
    expect(await callLlm('ping', 'x', deps)).toMatchObject({ ok: true, attempts: 3 });
    expect(st.calls.map((c) => c.maxTokens)).toEqual([100, 100, 100]);
  });

  it('a retry that succeeds reports the attempts and the log timestamp', async () => {
    const { deps, st } = setup({ autoRetry: 1 });
    st.profileReplies = [INVALID_OBJECT, GOOD_PING];
    const r = await callLlm('ping', 'x', deps);
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(r.at).toBe(llmLog.entries()[1].at);
  });

  it('budgetMult scales the first attempt and the profile option picks the model', async () => {
    const { deps, st } = setup({ autoRetry: 0, requestFloor: 0, mechanicFallbackToMain: true });
    st.mainReplies = [GOOD_PING];
    await callLlm('ping', 'x', deps, { budgetMult: 2, profile: 'main' });
    expect(st.calls[0]).toMatchObject({ kind: 'main', maxTokens: 200 });
  });
});

describe('the registry and the settings', () => {
  it('a bad pattern is a content error', () => {
    expect(LlmRefusalSchema.safeParse({ id: 'x', pattern: '(unclosed', lang: 'en' }).success).toBe(false);
    expect(LlmRefusalSchema.safeParse({ id: 'x', pattern: 'as an ai', lang: 'en', scope: 'any' }).success).toBe(true);
    expect(LlmRefusalSchema.parse({ id: 'x', pattern: 'as an ai', lang: 'en' }).scope).toBe('json');
  });

  it('the draft list has 8 English entries and compiles', async () => {
    const raw = JSON.parse(await readFile('content/core/llmRefusals.json', 'utf8')) as unknown[];
    expect(raw).toHaveLength(8);
    expect((await refusalPatterns())).toHaveLength(8);
  });

  it('the settings have defaults and reject out-of-range values', () => {
    const st = new FakeStAdapter();
    expect(getSettings(st)).toMatchObject({ llmTimeoutMs: 120000, autoRetry: 1 });
    Object.assign(st.getSettings(), { llmTimeoutMs: 5, autoRetry: 3 });
    expect(getSettings(st)).toMatchObject({ llmTimeoutMs: 120000, autoRetry: 1 });
    Object.assign(st.getSettings(), { llmTimeoutMs: 30000, autoRetry: 2 });
    expect(getSettings(st)).toMatchObject({ llmTimeoutMs: 30000, autoRetry: 2 });
  });
});
