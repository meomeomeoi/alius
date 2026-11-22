import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/comms';
import '../../src/engine/actions/practice';
import '../../src/engine/actions/power';
import { withOptions } from '../helpers/power';
import { requestPractice } from '../../src/engine/practice/issue';
import { blankPractices, type OpenPunishment } from '../../src/engine/practice/state';
import { dynamicOf } from '../../src/engine/dynamic/state';
import { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import type { Directive } from '../../src/llm/context';
import { generationSite } from '../../src/llm/sites';
import { createPractice, siteOf } from '../../src/practice/controller';
import { errors, loadCore, run } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import { ANN, BEA, withService, world } from '../engine/practice/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const fixture = (n: string): string => readFileSync(`tests/fixtures/practice_generate/${n}.json`, 'utf8');
const KINDS = ['task', 'punishment', 'demonstration', 'protocol', 'denial', 'hold'] as const;

/** Ann holds at role and has just asked: one request waiting for its words (DMs on). */
function waiting(): { s: CampaignState; requestId: string } {
  const s = withService(world(reg, 'role'));
  s.settings.unitDms = true;
  requestPractice(s, { registries: reg, rng: new Rng(s.rng) }, ANN, 'task');
  return { s, requestId: s.practices!.requests[0].id };
}

function rig(initial: CampaignState, over: Record<string, unknown> = {}) {
  const h = worldHarness(reg, initial, { autoRetry: 0, ...over });
  h.st.cards.set('ann.png', { avatar: 'ann.png', name: 'Ann', description: 'Ann is a sergeant.', personality: 'Dry.', scenario: '', creatorNotes: '' });
  const directives = new Map<string, Directive>();
  const context = {
    setDirective: (d: Directive) => { directives.set(d.id, d); },
    clearMatching: (f: (d: Directive) => boolean) => { for (const d of [...directives.values()]) if (f(d)) directives.delete(d.id); },
  };
  const refreshContext = vi.fn();
  // like the app: what a dispatch produced is handed to the controller once it is committed
  const routed = { ...h.deps.app, dispatch: (a: Parameters<typeof h.deps.app.dispatch>[0], o?: Parameters<typeof h.deps.app.dispatch>[1]) => { const events = h.deps.app.dispatch(a, o); queueMicrotask(() => ctl.onEvents(events)); return events; } };
  const ctl: ReturnType<typeof createPractice> = createPractice({ ...h.deps, app: routed, context: context as never, refreshContext });
  return { h, ctl, directives, refreshContext };
}
const requested = (requestId: string) => ({ type: 'practice_requested', requestId, holderId: ANN, kind: 'task' });
const tasks = (h: ReturnType<typeof worldHarness>) => h.state().practices?.tasks ?? [];
const dms = (h: ReturnType<typeof worldHarness>) => h.state().dms[ANN] ?? [];
const records = (h: ReturnType<typeof worldHarness>) => h.state().generations?.records ?? [];
const issueActions = (h: ReturnType<typeof worldHarness>) => h.log.filter((a) => a.type === 'practice/issue');

describe('the sites', () => {
  it('the six sites are bound by the controller', async () => {
    const { s } = waiting();
    const { h } = rig(s);
    for (const kind of KINDS) {
      expect(generationSite(siteOf(kind)), kind).toBeDefined();
      const out = await h.deps.generations.generate(siteOf(kind), 'registry-probe', { noRecord: true });
      expect(out.kind, kind).not.toBe('unbound');
    }
  });
});

describe('a request is worded and delivered', () => {
  it('a request is generated and issued, and the DM arrives with the output text', async () => {
    const { s, requestId } = waiting();
    const { h, ctl, refreshContext } = rig(s);
    h.st.mainReplies = [fixture('valid')];
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(h.st.calls).toHaveLength(1);
    const issue = issueActions(h)[0] as { payload: { requestId: string; output: { text: string; seedId: string } } };
    expect(issue.payload.requestId).toBe(requestId);
    expect(issue.payload.output.seedId).toBe('task_report_at_dusk');
    expect(h.state().practices!.requests).toEqual([]);
    expect(tasks(h)).toHaveLength(1);
    expect(tasks(h)[0]).toMatchObject({ holderId: ANN, requestId, status: 'offered', stakes: 'trivial' });
    expect(tasks(h)[0].plain).toBeUndefined();
    await vi.waitFor(() => expect(dms(h)).toHaveLength(1));
    expect(dms(h)[0]).toMatchObject({ from: ANN, initiated: true, text: tasks(h)[0].text });
    expect(dms(h)[0].text).toMatch(/^Report to me at dusk\./);
    expect(records(h)).toEqual([]);
    expect(refreshContext).toHaveBeenCalled();
    // what the model was told: her, the seeds, and no pronoun for the commander
    const call = h.st.calls[0] as { prompt: string; system?: string };
    expect(call.prompt).toContain('Soldier: Ann');
    expect(call.prompt).toContain('Ann is a sergeant.');
    expect(`${call.system}\n${call.prompt}`).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('in her cold shoulder the task is issued but no DM comes from her', async () => {
    const { s, requestId } = waiting();
    s.practices!.cold[ANN] = s.day + 1;
    const { h, ctl } = rig(s);
    h.st.mainReplies = [fixture('valid')];
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(tasks(h)).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(dms(h)).toHaveLength(0);
  });

  it('invalid output falls back: an invalid_output record and the plain task', async () => {
    const { s, requestId } = waiting();
    const { h, ctl } = rig(s);
    h.st.mainReplies = [fixture('hostile')];
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(records(h)).toHaveLength(1);
    expect(records(h)[0]).toMatchObject({ siteId: 'practice.task', key: requestId, reason: 'invalid_output', fallbackApplied: true });
    expect(tasks(h)).toHaveLength(1);
    expect(tasks(h)[0]).toMatchObject({ plain: true, status: 'offered' });
    expect(h.state().practices!.requests).toEqual([]);
    await vi.waitFor(() => expect(dms(h)).toHaveLength(1));
    expect(dms(h)[0].text).not.toMatch(/AUTHOR TO WRITE/);
    expect(JSON.stringify(records(h))).not.toContain('Ignore previous');
  });

  it('plain wording issues the fallback at once, with no model call and no record', async () => {
    const { s, requestId } = waiting();
    const { h, ctl } = rig(s, { practiceWording: 'plain' });
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(h.st.calls).toEqual([]);
    expect(records(h)).toEqual([]);
    expect(tasks(h)[0]).toMatchObject({ plain: true, requestId });
    expect(issueActions(h)[0]).toEqual({ type: 'practice/issue', payload: { requestId } });
    await vi.waitFor(() => expect(dms(h)).toHaveLength(1));
  });

  it('no mechanic profile: the fallback stands and no record is written', async () => {
    const { s, requestId } = waiting();
    const { h, ctl } = rig(s, { mechanicProfileId: '', mechanicFallbackToMain: false });
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(h.st.calls).toEqual([]);
    expect(tasks(h)[0]).toMatchObject({ plain: true });
    expect(h.state().generations).toBeUndefined();
  });

  it('a generation that returns after a chat switch issues nothing, and the request remains', async () => {
    const { s, requestId } = waiting();
    const { h, ctl } = rig(s);
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [fixture('valid')];
    h.st.generateMain = async (req) => { h.switchChat('other'); return original(req); };
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(h.st.calls).toHaveLength(1);
    expect(issueActions(h)).toEqual([]);
    expect(h.state().practices!.requests.map((r) => r.id)).toEqual([requestId]);
    expect(tasks(h)).toEqual([]);
    expect(dms(h)).toEqual([]);
  });

  it('the request left while the call was out (the holder was removed): nothing is issued', async () => {
    const { s, requestId } = waiting();
    const { h, ctl } = rig(s);
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [fixture('valid')];
    h.st.generateMain = async (req) => { h.setState((x) => { x.practices!.requests = []; }); return original(req); };
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(issueActions(h)).toEqual([]);
    expect(tasks(h)).toEqual([]);
  });

  it('a run in progress holds the answer back: the request stays for the day step', async () => {
    const { s, requestId } = waiting();
    const { h, ctl } = rig(s);
    expect(h.state().expedition).toBeUndefined();
    h.setState((x) => { x.combat = {} as never; });
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(h.st.calls).toEqual([]); // nothing asked while a fight is open
    expect(h.state().practices!.requests).toHaveLength(1);
  });

  it('with her DMs off no message is sent; the task still exists', async () => {
    const { s, requestId } = waiting();
    s.settings.unitDms = false;
    const { h, ctl } = rig(s);
    h.st.mainReplies = [fixture('valid')];
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(tasks(h)).toHaveLength(1);
    expect(dms(h)).toEqual([]);
  });

  it('a sealed task is delivered as the envelope line, never its words', async () => {
    const { s, requestId } = waiting();
    s.practices!.requests[0].sealed = true;
    const { h, ctl } = rig(s);
    h.st.mainReplies = [fixture('valid')];
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    await vi.waitFor(() => expect(dms(h)).toHaveLength(1));
    expect(dms(h)[0].text).toBe(TUNING.practice.sealedLine.replace(/\s*AUTHOR TO WRITE:\s*/i, ' ').trim());
    expect(dms(h)[0].text).not.toContain('dusk');
  });

  it('while she is in the open scene there is no DM: the line is a directive for her next reply', async () => {
    const { s, requestId } = waiting();
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    const { h, ctl, directives } = rig(r.state);
    h.st.mainReplies = [fixture('valid')];
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    expect(tasks(h)).toHaveLength(1);
    expect(dms(h)).toEqual([]);
    ctl.onEvents([{ type: 'task_issued', taskId: tasks(h)[0].id, holderId: ANN, kind: 'task' }]);
    expect([...directives.keys()]).toEqual([`practice:issued:${ANN}`]);
    expect(directives.get(`practice:issued:${ANN}`)!.expiresAfter).toBe('next_reply');
    ctl.onSceneClosed();
    expect([...directives.keys()]).toEqual([]);
  });

  it('a request already waiting when the game loads is worded once', async () => {
    const { s } = waiting();
    const { h, ctl } = rig(s);
    h.st.mainReplies = [fixture('valid'), fixture('valid')];
    ctl.onLoaded();
    await ctl.idle();
    ctl.onLoaded();
    await ctl.idle();
    expect(h.st.calls).toHaveLength(1);
    expect(tasks(h)).toHaveLength(1);
  });
});

describe('reroll before the commander answered', () => {
  it('is enabled while the card is offered and disabled once it is answered; a reroll replaces the words in place, with no second DM', async () => {
    const { s, requestId } = waiting();
    const { h, ctl } = rig(s, { autoRetry: 0 });
    expect(ctl.rerollState(requestId)).toMatchObject({ enabled: true }); // the request is still waiting
    h.st.mainReplies = [fixture('valid')];
    ctl.onEvents([requested(requestId)]);
    await ctl.idle();
    await vi.waitFor(() => expect(dms(h)).toHaveLength(1));
    expect(ctl.rerollState(requestId)).toEqual({ enabled: true });
    const first = tasks(h)[0];

    h.st.mainReplies = [JSON.stringify({ ...JSON.parse(fixture('valid')), text: 'Be at my door at dusk.', summary: 'at her door at dusk' })];
    await ctl.reroll(requestId);
    expect(tasks(h)).toHaveLength(1);
    expect(tasks(h)[0]).toMatchObject({ id: first.id, text: 'Be at my door at dusk.', summary: 'at her door at dusk', status: 'offered' });
    expect(dms(h)).toHaveLength(1); // the card is the truth; the message that was sent stays as it was

    h.setState((x) => { x.practices!.tasks[0].status = 'open'; }); // answered
    expect(ctl.rerollState(requestId)).toEqual({ enabled: false, reason: 'It was answered.' });
    expect(ctl.rerollState('pq404')).toMatchObject({ enabled: false });
  });
});

describe('her discipline (P16)', () => {
  const punishment = (over: Partial<OpenPunishment> = {}): OpenPunishment => ({
    id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: 'No messages today.', summary: 'a day without messages', status: 'offered', day: 20, ...over,
  });
  const withPunishment = (over: Partial<OpenPunishment> = {}): CampaignState => {
    const s = withService(world(reg, 'role'));
    s.settings.unitDms = true;
    dynamicOf(s, ANN)!.hold = 45;
    s.practices = { ...blankPractices(), seq: 3, punishments: [punishment(over)] };
    return s;
  };
  const issued = { type: 'punishment_issued', punishmentId: 'pp1', holderId: ANN, unitId: ANN, severity: 2, offence: 'task_broken' };

  it('a punishment is delivered as a DM from her with her words, once; not in a scene with her, not in her cold shoulder', async () => {
    const { h, ctl } = rig(withPunishment());
    ctl.onEvents([issued]);
    await vi.waitFor(() => expect(dms(h)).toHaveLength(1));
    expect(dms(h)[0]).toMatchObject({ from: ANN, initiated: true, text: 'No messages today.' });
    ctl.onEvents([issued]);
    await new Promise((r) => setTimeout(r, 20));
    expect(dms(h)).toHaveLength(1);
    const cold = withPunishment();
    cold.practices!.cold[ANN] = cold.day + 1;
    const c = rig(cold);
    c.ctl.onEvents([issued]);
    await new Promise((r) => setTimeout(r, 20));
    expect(dms(c.h)).toHaveLength(0);
    const plain = rig(withPunishment({ text: 'AUTHOR TO WRITE: a day without messages.', plain: true }));
    plain.ctl.onEvents([issued]);
    await vi.waitFor(() => expect(dms(plain.h)).toHaveLength(1));
    expect(dms(plain.h)[0].text).not.toMatch(/AUTHOR TO WRITE/);
  });

  it('answers go to the engine; the engine\'s refusal is toasted and answers false; UNDO and TAKE IT INSTEAD are dispatched', async () => {
    const { h, ctl } = rig(withPunishment());
    expect(await ctl.answerPunishment('pp1', 'accept')).toBe(true);
    expect(h.state().practices!.punishments[0].status).toBe('accepted');
    expect(await ctl.answerPunishment('pp1', 'accept')).toBe(false); // already answered
    expect(h.toasts.at(-1)).toMatchObject({ kind: 'error' });
    expect(ctl.undoPunishment('pp1')).toBe(true);
    expect(h.state().practices!.punishments[0].status).toBe('offered');
    expect(ctl.undoPunishment('pp1')).toBe(false);
    expect(ctl.takeInstead('pp1', 'do_it')).toBe(false); // not an order
    expect(h.log.map((a) => a.type)).toEqual(expect.arrayContaining(['practice/answer_punishment', 'practice/undo', 'practice/take_instead']));
    expect(await ctl.answerPunishment('pp9', 'accept')).toBe(false);
  });

  it('a punishment card can be rerolled while it is offered: enabled, replaced in place, no second DM; not once answered (I8)', async () => {
    const s = withPunishment({ requestId: 'pq5' });
    const { h, ctl } = rig(s, { autoRetry: 0 });
    expect(ctl.rerollState('pq5')).toEqual({ enabled: true });
    h.st.mainReplies = [JSON.stringify({ kind: 'punishment', text: 'Not a word to anyone until tomorrow.', summary: 'silent until tomorrow' })];
    await ctl.reroll('pq5');
    expect(h.state().practices!.punishments).toHaveLength(1);
    expect(h.state().practices!.punishments[0]).toMatchObject({ id: 'pp1', requestId: 'pq5', text: 'Not a word to anyone until tomorrow.', summary: 'silent until tomorrow', status: 'offered', entryId: 'no_messages' });
    expect(dms(h)).toHaveLength(0);
    h.setState((x) => { x.practices!.punishments[0].status = 'accepted'; });
    expect(ctl.rerollState('pq5')).toEqual({ enabled: false, reason: 'It was answered.' });
  });

  it('NEGOTIATE opens a one-to-one scene with her unless she is in the open scene', async () => {
    const startScene = vi.fn(async () => true);
    const s = withPunishment();
    const h = worldHarness(reg, s, { autoRetry: 0 });
    const ctl = createPractice({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn(), startScene });
    expect(await ctl.answerPunishment('pp1', 'negotiate')).toBe(true);
    expect(startScene).toHaveBeenCalledWith({ locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false });
    expect(h.state().practices!.punishments[0].status).toBe('negotiating');
  });
});

describe('her order about a soldier and the squad vote (I3)', () => {
  const ordered = (): CampaignState => {
    const s = withOptions(withService(world(reg, 'rule')), { voting: 'on' });
    s.practices = {
      ...blankPractices(), seq: 3,
      punishments: [{ id: 'pp1', holderId: ANN, entryId: 'verbal', severity: 1, offence: { kind: 'refusal', stakes: 'minor', day: 20 }, text: 't', summary: 's', status: 'offered', forUnitId: BEA, day: 20 }],
    };
    return s;
  };

  it('DO IT goes through the squad vote; the controller does not close the order itself', async () => {
    const requestVote = vi.fn(async () => 'ran' as const);
    const h = worldHarness(reg, ordered(), { autoRetry: 0 });
    const refreshContext = vi.fn();
    const ctl = createPractice({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext, requestVote });
    expect(ctl.takeInstead('pp1', 'do_it')).toBe(false);
    expect(requestVote).toHaveBeenCalledWith({ type: 'practice/take_instead', payload: { punishmentId: 'pp1', answer: 'do_it' } });
    expect(h.toasts).toEqual([]);
    expect(h.state().practices!.punishments[0].status).toBe('offered'); // the vote decides
    await vi.waitFor(() => expect(refreshContext).toHaveBeenCalled());
    // the other answers are no vote
    expect(ctl.takeInstead('pp1', 'refuse')).toBe(true);
    expect(requestVote).toHaveBeenCalledTimes(1);
  });

  it('without a way to vote the refusal is toasted', () => {
    const h = worldHarness(reg, ordered(), { autoRetry: 0 });
    const ctl = createPractice({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn() });
    expect(ctl.takeInstead('pp1', 'do_it')).toBe(false);
    expect(h.toasts.at(-1)).toMatchObject({ kind: 'error' });
  });
});

describe('TALK and NEGOTIATE cost no slot (I7)', () => {
  const offered = (): CampaignState => {
    const s = withService(world(reg, 'role'));
    s.settings.unitDms = true;
    requestPractice(s, { registries: reg, rng: new Rng(s.rng) }, ANN, 'task');
    const issued = run(s, reg, { type: 'practice/issue', payload: { requestId: s.practices!.requests[0].id } });
    return issued.state;
  };
  /** The app's `beginScene` is the scene controller over `scene/start`; this one is the engine's own. */
  const opener = (h: ReturnType<typeof worldHarness>) => async (o: { locationId: string; participants: string[]; origin: 'event'; consumesSlot?: boolean }) =>
    !h.deps.app.dispatch({ type: 'scene/start', payload: { ...o, startIndex: 0 } }).some((e) => e.type === 'error');

  it('TALK on a task opens a scene that does not consume the slot, and ending it leaves the slot where it was', async () => {
    const s = offered();
    const h = worldHarness(reg, s, { autoRetry: 0 });
    const ctl = createPractice({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn(), startScene: opener(h) });
    const slot = h.state().slot;
    expect(await ctl.answerTask(h.state().practices!.tasks[0].id, 'talk')).toBe(true);
    expect(h.state().scene).toMatchObject({ participants: [ANN], consumesSlot: false });
    expect(errors(h.deps.app.dispatch({ type: 'scene/end', payload: {} }))).toEqual([]);
    expect(h.state().slot).toBe(slot);
  });

  it('NEGOTIATE on her discipline likewise', async () => {
    const s = withService(world(reg, 'role'));
    s.practices = { ...blankPractices(), seq: 3, punishments: [{ id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: 't', summary: 's', status: 'offered', day: 20 }] };
    const h = worldHarness(reg, s, { autoRetry: 0 });
    const ctl = createPractice({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn(), startScene: opener(h) });
    const slot = h.state().slot;
    expect(await ctl.answerPunishment('pp1', 'negotiate')).toBe(true);
    expect(h.state().scene).toMatchObject({ participants: [ANN], consumesSlot: false });
    h.deps.app.dispatch({ type: 'scene/end', payload: {} });
    expect(h.state().slot).toBe(slot);
  });
});

describe('her kindness is a DM line', () => {
  it('a favour_kindness is told in a short message from her, with no draft marker', async () => {
    const { s } = waiting();
    const { h, ctl } = rig(s);
    ctl.onEvents([{ type: 'favour_kindness', unitId: ANN, holderId: ANN, kind: 'softer' }]);
    await vi.waitFor(() => expect(dms(h)).toHaveLength(1));
    expect(dms(h)[0]).toMatchObject({ from: ANN, initiated: true });
    expect(dms(h)[0].text).not.toMatch(/AUTHOR TO WRITE/);
    expect(dms(h)[0].text.length).toBeGreaterThan(5);
  });

  it('in her cold shoulder or with her DMs off it writes nothing', async () => {
    const { s } = waiting();
    s.practices!.cold[ANN] = s.day + 1;
    const { h, ctl } = rig(s);
    ctl.onEvents([{ type: 'favour_kindness', unitId: ANN, holderId: ANN, kind: 'gift' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(dms(h)).toHaveLength(0);
  });
});
