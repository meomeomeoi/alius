import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch as engineDispatch, type Action, type EngineEvent } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { createEnvelope, type EnvelopeHost } from '../../src/llm/envelope';
import { describeFailure } from '../../src/llm/describe';
import { generationSite, generationSites, registerGenerationSite, type SiteDecl } from '../../src/llm/sites';
import { llmLog } from '../../src/llm/log';
import { getSettings, type AliusSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import '../../src/engine/actions/generations';
import { campaign, loadCore } from '../helpers/world';
import { INVALID_OBJECT, REFUSAL } from '../fixtures/llm/failures';

let core: Registries;
beforeAll(async () => {
  core = await loadCore();
});
beforeEach(() => llmLog.clear());

const echo = (v: string) => `{"pong":true,"echo":${JSON.stringify(v)}}`;
const decl = (id: string, over: Partial<SiteDecl> = {}): SiteDecl => ({
  id, callType: 'ping', surface: 'sys', reroll: 'free', record: 'full', glossary: 'generation_failed', label: () => `Test ${id.split('.')[1]}`, ...over,
});
for (const d of [
  decl('test.free'), decl('test.quiet', { record: 'quiet' }), decl('test.none', { reroll: 'none' }), decl('test.revert', { reroll: 'revert' }),
  decl('test.commit', { reroll: 'before_commit' }), decl('test.unbound'),
]) registerGenerationSite(d);

function world(over: Partial<AliusSettings> = {}) {
  const st = new FakeStAdapter({ chatId: 'chat-1', isGroup: true, groupId: 'g1' });
  st.profiles = [{ id: 'mech', name: 'Mech', api: 'openrouter', model: 'm' }];
  const settings: AliusSettings = { ...getSettings(st), mechanicProfileId: 'mech', requestFloor: 0, autoRetry: 0, ...over };
  let state: CampaignState = campaign(core, 4);
  state.day = 5;
  const actions: string[] = [];
  const toasts: Array<{ kind: string; text: string }> = [];
  const host: EnvelopeHost = {
    st,
    settings: () => settings,
    registries: () => core,
    state: () => state,
    chatId: () => st.getActiveChat()?.chatId,
    dispatch(action: Action, opts?: { expectChatId?: string }): EngineEvent[] {
      if (opts?.expectChatId !== undefined && st.getActiveChat()?.chatId !== opts.expectChatId) return [{ type: 'error', code: 'chat_changed', message: 'x' }];
      const r = engineDispatch(state, action, core);
      state = r.state;
      actions.push(action.type);
      return r.events;
    },
    restoreSnapshot(snap, expected) {
      if (state !== expected) return false;
      state = snap;
      return true;
    },
    contentLine: () => '',
    toast: (kind, text) => toasts.push({ kind, text }),
  };
  const env = createEnvelope(host);
  const applied: string[] = [];
  const bind = (siteId: string, h: Partial<Parameters<typeof env.bind<string, string>>[1]> = {}) =>
    env.bind<string, string>(siteId, {
      build: (key) => key,
      parse: (raw) => ((raw as { echo?: string }).echo ?? null),
      apply: (_k, v) => { applied.push(v); return 'ok'; },
      ...h,
    });
  const poke = () => { state = engineDispatch(state, { type: 'calendar/cancel_scene', payload: {} }, core).state; state = { ...state }; };
  return { st, settings, env, host, actions, toasts, applied, bind, poke, state: () => state, set: (s: CampaignState) => { state = s; } };
}

const records = (w: ReturnType<typeof world>) => w.state().generations?.records ?? [];

describe('the site registry', () => {
  it('declares every site of the plan as data', () => {
    const ids = generationSites().map((s) => s.id).filter((id) => !id.startsWith('test.'));
    expect(ids).toHaveLength(42); // P16: + practice.<kind> ×6, flavor.posture_name; P11b: + setup.head_start_recap; P14b: + development.review, flavor.habit; P14c: + flavor.life_share, flavor.life_trace, opinion.form; P15a: + physics.cues
    expect(generationSite('scene.summary')).toMatchObject({ callType: 'scene_summary', surface: 'day', reroll: 'revert', record: 'full' });
    expect(generationSite('flavor.frequency_fragment')).toMatchObject({ reroll: 'none', record: 'none' });
    expect(generationSite('dm.initiate')).toMatchObject({ record: 'quiet', reroll: 'none' });
    expect(generationSite('nope')).toBeUndefined();
    for (const s of generationSites()) {
      expect(typeof s.label(null, 'k')).toBe('string');
      expect(s.label(null, 'k').length).toBeGreaterThan(0);
    }
  });

  it('refuses a duplicate site', () => {
    expect(() => registerGenerationSite(decl('test.free'))).toThrow(/Duplicate/);
  });
});

describe('generate', () => {
  it('success applies and closes open records of the key', async () => {
    const w = world();
    w.bind('test.free');
    w.host.dispatch({ type: 'generation/failed', payload: { siteId: 'test.free', key: 'k', reason: 'empty', detail: '', attempts: 1, at: 1, budgetMult: 1 } });
    expect(records(w)).toHaveLength(1);
    w.st.profileReplies = [echo('k')];
    const out = await w.env.generate<string>('test.free', 'k');
    expect(out).toEqual({ kind: 'applied', value: 'k' });
    expect(w.applied).toEqual(['k']);
    expect(records(w)).toEqual([]);
    expect(w.actions).toContain('generation/close');
  });

  it('a success with no record dispatches nothing', async () => {
    const w = world();
    w.bind('test.free');
    w.st.profileReplies = [echo('k')];
    await w.env.generate('test.free', 'k');
    expect(w.actions).toEqual([]);
  });

  it('failure records, emits, toasts for full, not for quiet', async () => {
    const w = world();
    w.bind('test.free');
    w.bind('test.quiet');
    w.st.profileReplies = [INVALID_OBJECT, INVALID_OBJECT];
    const out = await w.env.generate('test.free', 'k1');
    expect(out).toMatchObject({ kind: 'failed', reason: 'invalid_output', recordId: 'g1', fallbackApplied: false });
    expect(records(w)[0]).toMatchObject({ id: 'g1', siteId: 'test.free', key: 'k1', reason: 'invalid_output', attempts: 1, status: 'open', budgetMult: 1 });
    expect(records(w)[0].quiet).toBeUndefined();
    expect(w.toasts).toEqual([{ kind: 'warn', text: 'Test free: the answer did not fit the form.' }]);
    await w.env.generate('test.quiet', 'k2');
    expect(records(w)[1]).toMatchObject({ siteId: 'test.quiet', quiet: true });
    expect(w.toasts).toHaveLength(1);
  });

  it('a second failure of the same key updates the record and toasts once', async () => {
    const w = world();
    w.bind('test.free');
    w.st.profileReplies = [INVALID_OBJECT, REFUSAL];
    await w.env.generate('test.free', 'k');
    await w.env.generate('test.free', 'k');
    expect(records(w)).toHaveLength(1);
    expect(records(w)[0].attempts).toBe(2);
    expect(w.toasts).toHaveLength(1);
  });

  it('a failure of another key of a site that already shows a chip does not toast again', async () => {
    const w = world();
    w.bind('test.free');
    w.st.profileReplies = [INVALID_OBJECT, INVALID_OBJECT];
    await w.env.generate('test.free', 'k1');
    await w.env.generate('test.free', 'k2');
    expect(records(w)).toHaveLength(2);
    expect(w.toasts).toHaveLength(1);
  });

  it('fallback runs next to the record and sets fallbackApplied', async () => {
    const w = world();
    let ran = 0;
    w.bind('test.free', { fallback: () => { ran += 1; return true; } });
    w.st.profileReplies = [INVALID_OBJECT, INVALID_OBJECT];
    const out = await w.env.generate('test.free', 'k');
    expect(ran).toBe(1);
    expect(out).toMatchObject({ kind: 'failed', fallbackApplied: true });
    expect(records(w)[0].fallbackApplied).toBe(true);
    await w.env.generate('test.free', 'k'); // a record already says it ran
    expect(ran).toBe(1);
  });

  it('fallback with reroll none writes no record', async () => {
    const w = world();
    let ran = 0;
    w.bind('test.none', { fallback: () => { ran += 1; return true; } });
    w.st.profileReplies = [INVALID_OBJECT];
    const out = await w.env.generate('test.none', 'k');
    expect(out).toMatchObject({ kind: 'failed', fallbackApplied: true });
    expect(out).not.toHaveProperty('recordId');
    expect(ran).toBe(1);
    expect(w.state().generations).toBeUndefined();
    expect(w.toasts).toEqual([]);
  });

  it('no_profile writes no record but the fallback still runs', async () => {
    const w = world({ mechanicProfileId: '', mechanicFallbackToMain: false });
    let ran = 0;
    w.bind('test.free', { fallback: () => { ran += 1; return true; } });
    const out = await w.env.generate('test.free', 'k');
    expect(out).toMatchObject({ kind: 'failed', reason: 'no_profile', fallbackApplied: true });
    expect(ran).toBe(1);
    expect(w.state().generations).toBeUndefined();
    expect(w.st.calls).toHaveLength(0);
  });

  it('noRecord keeps the outcome and writes nothing', async () => {
    const w = world();
    w.bind('test.free');
    w.st.profileReplies = [INVALID_OBJECT];
    const out = await w.env.generate('test.free', 'k', { noRecord: true });
    expect(out).toMatchObject({ kind: 'failed', reason: 'invalid_output' });
    expect(w.state().generations).toBeUndefined();
  });

  it('build expired closes the record as expired with its text', async () => {
    const w = world();
    w.bind('test.free');
    w.st.profileReplies = [INVALID_OBJECT];
    await w.env.generate('test.free', 'k');
    w.bind('test.free', { build: () => ({ expired: 'The scene was closed.' }) });
    const out = await w.env.generate('test.free', 'k');
    expect(out).toEqual({ kind: 'expired', why: 'The scene was closed.' });
    expect(records(w)[0]).toMatchObject({ status: 'expired', reason: 'expired', expiredWhy: 'The scene was closed.', expiredDay: 5 });
    expect(w.st.calls).toHaveLength(1);
  });

  it('a retry answer after a chat switch is dropped', async () => {
    const w = world();
    w.bind('test.free');
    w.st.profileReplies = [INVALID_OBJECT];
    await w.env.generate('test.free', 'k');
    const real = w.st.generateWithProfile.bind(w.st);
    w.st.generateWithProfile = async (req) => {
      w.st.switchChat({ chatId: 'chat-2', isGroup: true, groupId: 'g2' });
      return real(req);
    };
    w.st.profileReplies = [echo('k')];
    const before = w.actions.length;
    const out = await w.env.retry('g1');
    expect(out).toEqual({ kind: 'stale' });
    expect(w.applied).toEqual([]);
    expect(w.actions.length).toBe(before);
  });

  it('build is asked again after the answer and a changed moment discards it', async () => {
    const w = world();
    let asked = 0;
    w.bind('test.free', { build: (key) => (++asked === 1 ? key : { expired: 'Her thread moved on.' }) });
    w.st.profileReplies = [echo('k')];
    const out = await w.env.generate('test.free', 'k');
    expect(asked).toBe(2);
    expect(out).toEqual({ kind: 'expired', why: 'Her thread moved on.' });
    expect(w.applied).toEqual([]);
  });

  it('a second generate for a key that is running is stale', async () => {
    const w = world();
    w.bind('test.free');
    let release: (a: { text: string }) => void = () => {};
    w.st.generateWithProfile = () => new Promise((res) => { release = res; });
    const first = w.env.generate('test.free', 'k');
    await Promise.resolve();
    expect(await w.env.generate('test.free', 'k')).toEqual({ kind: 'stale' });
    release({ text: echo('k') });
    expect(await first).toEqual({ kind: 'applied', value: 'k' });
    delete (w.st as { generateWithProfile?: unknown }).generateWithProfile; // back to the fake's own
    w.st.profileReplies = [echo('k')];
    expect(await w.env.generate('test.free', 'k')).toEqual({ kind: 'applied', value: 'k' }); // the flight is over
  });

  it('retry with ×2 and the main profile sends that budget and generateMain', async () => {
    const w = world();
    w.bind('test.free');
    w.st.profileReplies = [INVALID_OBJECT];
    await w.env.generate('test.free', 'k');
    w.st.mainReplies = [echo('k')];
    const out = await w.env.retry('g1', { budgetMult: 2, profile: 'main' });
    expect(out).toEqual({ kind: 'applied', value: 'k' });
    expect(w.st.calls[1]).toMatchObject({ kind: 'main', maxTokens: 200 });
    expect(records(w)).toEqual([]);
  });

  it('unbound site retry returns unbound and keeps the record', async () => {
    const w = world();
    w.host.dispatch({ type: 'generation/failed', payload: { siteId: 'test.unbound', key: 'k', reason: 'empty', detail: '', attempts: 1, at: 1, budgetMult: 1 } });
    expect(await w.env.retry('g1')).toEqual({ kind: 'unbound' });
    expect(await w.env.generate('nope.site', 'k')).toEqual({ kind: 'unbound' });
    expect(records(w)).toHaveLength(1);
    expect(await w.env.retry('g99')).toEqual({ kind: 'stale' });
  });

  it('retry of an expired record says why and calls nothing', async () => {
    const w = world();
    w.bind('test.free');
    w.host.dispatch({ type: 'generation/failed', payload: { siteId: 'test.free', key: 'k', reason: 'empty', detail: '', attempts: 1, at: 1, budgetMult: 1 } });
    w.host.dispatch({ type: 'generation/expire', payload: { id: 'g1', why: 'It is over.' } });
    expect(await w.env.retry('g1')).toEqual({ kind: 'expired', why: 'It is over.' });
    expect(w.st.calls).toHaveLength(0);
  });

  it('rejected apply retries within autoRetry then fails invalid_output', async () => {
    const w = world({ autoRetry: 1 });
    w.bind('test.free', { apply: () => ({ rejected: 'the engine said no' }) });
    w.st.profileReplies = [echo('a'), echo('b')];
    const out = await w.env.generate('test.free', 'k');
    expect(w.st.calls).toHaveLength(2);
    expect(out).toMatchObject({ kind: 'failed', reason: 'invalid_output', detail: 'the engine said no' });
    expect(records(w)[0]).toMatchObject({ reason: 'invalid_output', attempts: 2 });
  });

  it('a stale apply leaves everything alone', async () => {
    const w = world();
    w.bind('test.free', { apply: () => ({ stale: true }) });
    w.st.profileReplies = [echo('a')];
    expect(await w.env.generate('test.free', 'k')).toEqual({ kind: 'stale' });
    expect(w.state().generations).toBeUndefined();
  });

  it('a parse that gives null is invalid_output', async () => {
    const w = world();
    w.bind('test.free', { parse: () => null });
    w.st.profileReplies = [echo('a')];
    expect(await w.env.generate('test.free', 'k')).toMatchObject({ kind: 'failed', reason: 'invalid_output' });
  });

  it('useFallback runs fallback and closes kept_fallback', async () => {
    const w = world();
    let ran = 0;
    w.bind('test.free', { fallback: () => { ran += 1; return true; } });
    w.host.dispatch({ type: 'generation/failed', payload: { siteId: 'test.free', key: 'k', reason: 'refused', detail: '', attempts: 1, at: 1, budgetMult: 1 } });
    await w.env.useFallback('g1');
    expect(ran).toBe(1);
    expect(records(w)).toEqual([]);
    expect(w.actions).toContain('generation/close');
  });

  it('drop closes a record without any call', async () => {
    const w = world();
    w.host.dispatch({ type: 'generation/failed', payload: { siteId: 'test.free', key: 'k', reason: 'refused', detail: '', attempts: 1, at: 1, budgetMult: 1 } });
    w.env.drop('g1');
    expect(records(w)).toEqual([]);
    expect(w.st.calls).toHaveLength(0);
  });
});

describe('reroll', () => {
  it('none cannot be rerolled', async () => {
    const w = world();
    w.bind('test.none');
    expect(w.env.rerollState('test.none', 'k')).toEqual({ enabled: false, reason: 'This cannot be rerolled.' });
    expect(await w.env.reroll('test.none', 'k')).toMatchObject({ kind: 'expired', why: 'This cannot be rerolled.' });
  });

  it('free replaces through apply and never runs the fallback', async () => {
    const w = world();
    let ran = 0;
    w.bind('test.free', { fallback: () => { ran += 1; return true; } });
    expect(w.env.rerollState('test.free', 'k')).toEqual({ enabled: true });
    w.st.profileReplies = [echo('again')];
    expect(await w.env.reroll('test.free', 'k')).toEqual({ kind: 'applied', value: 'again' });
    w.st.profileReplies = [INVALID_OBJECT];
    await w.env.reroll('test.free', 'k');
    expect(ran).toBe(0);
  });

  it('before_commit reroll refused once committed, with the reason', async () => {
    const w = world();
    let answered = false;
    w.bind('test.commit', { committed: () => (answered ? 'It was answered.' : null) });
    expect(w.env.rerollState('test.commit', 'k')).toEqual({ enabled: true });
    answered = true;
    expect(w.env.rerollState('test.commit', 'k')).toEqual({ enabled: false, reason: 'It was answered.' });
    expect(await w.env.reroll('test.commit', 'k')).toEqual({ kind: 'expired', why: 'It was answered.' });
    expect(w.st.calls).toHaveLength(0);
  });

  it('a reroll whose state moved restores nothing', async () => {
    const w = world();
    let applyCalls = 0;
    w.bind('test.revert', { apply: () => { applyCalls += 1; return 'ok'; } });
    const before = w.state();
    w.poke();
    const after = w.state();
    w.env.takeSnapshot('test.revert', 'k', before, after);
    expect(w.env.rerollState('test.revert', 'k')).toEqual({ enabled: true });
    w.poke(); // something else happened
    const moved = w.state();
    expect(w.env.rerollState('test.revert', 'k')).toEqual({ enabled: false, reason: 'Something happened since: this can no longer be rerolled.' });
    expect(await w.env.reroll('test.revert', 'k')).toMatchObject({ kind: 'expired' });
    expect(w.state()).toBe(moved);
    expect(applyCalls).toBe(0);
    expect(w.st.calls).toHaveLength(0);
  });

  it('revert reroll restores the snapshot and applies the new value', async () => {
    const w = world();
    const seen: CampaignState[] = [];
    w.bind('test.revert', { apply: (_k, v) => { seen.push(w.state()); w.applied.push(v); return 'ok'; } });
    const before = w.state();
    w.poke();
    const after = w.state();
    w.env.takeSnapshot('test.revert', 'k', before, after);
    w.st.profileReplies = [echo('new')];
    const out = await w.env.reroll('test.revert', 'k');
    expect(out).toEqual({ kind: 'applied', value: 'new' });
    expect(seen[0]).toBe(before);
    expect(w.applied).toEqual(['new']);
    // the snapshot was spent
    expect(w.env.rerollState('test.revert', 'k').enabled).toBe(false);
  });

  it('a revert site with its own undo asks the site', async () => {
    const w = world();
    let undone = 0;
    w.bind('test.revert', { canUndo: () => null, undo: () => { undone += 1; return null; } });
    expect(w.env.rerollState('test.revert', 'k')).toEqual({ enabled: true });
    w.st.profileReplies = [echo('n')];
    expect(await w.env.reroll('test.revert', 'k')).toEqual({ kind: 'applied', value: 'n' });
    expect(undone).toBe(1);
    w.bind('test.revert', { canUndo: () => 'Another exchange came after it.', undo: () => 'Another exchange came after it.' });
    expect(w.env.rerollState('test.revert', 'k')).toEqual({ enabled: false, reason: 'Another exchange came after it.' });
  });

  it('snapshots are cleared on request and bound to their chat', () => {
    const w = world();
    w.bind('test.revert');
    const before = w.state();
    w.poke();
    w.env.takeSnapshot('test.revert', 'k', before, w.state());
    w.st.switchChat({ chatId: 'chat-2', isGroup: true, groupId: 'g2' });
    expect(w.env.rerollState('test.revert', 'k').enabled).toBe(false);
    w.st.switchChat({ chatId: 'chat-1', isGroup: true, groupId: 'g1' });
    w.env.clearSnapshots();
    expect(w.env.rerollState('test.revert', 'k').enabled).toBe(false);
  });
});

describe('describeFailure', () => {
  it('texts', () => {
    const l = 'Profile import';
    expect(describeFailure({ label: l, reason: 'refused' })).toBe('Profile import: the model refused.');
    expect(describeFailure({ label: l, reason: 'truncated', budget: 800 })).toBe('Profile import: the answer was cut off at 800 tokens.');
    expect(describeFailure({ label: l, reason: 'truncated' })).toBe('Profile import: the answer was cut off.');
    expect(describeFailure({ label: l, reason: 'timeout', timeoutMs: 120000 })).toBe('Profile import: no answer within 120 s.');
    expect(describeFailure({ label: l, reason: 'network' })).toBe('Profile import: the connection failed.');
    expect(describeFailure({ label: l, reason: 'invalid_output' })).toBe('Profile import: the answer did not fit the form.');
    expect(describeFailure({ label: l, reason: 'empty' })).toBe('Profile import: nothing came back.');
    expect(describeFailure({ label: l, reason: 'no_profile' })).toBe('Profile import: no mechanic profile is selected.');
    expect(describeFailure({ label: 'World planning', reason: 'expired', expiredWhy: 'The day ended: the engine planned the world.' })).toBe('World planning: The day ended: the engine planned the world.');
    expect(describeFailure({ label: l, reason: 'expired', expiredWhy: 'It is over' })).toBe('Profile import: It is over.');
  });
});
