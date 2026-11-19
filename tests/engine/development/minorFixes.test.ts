// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/generations';
import { createDevelopment } from '../../../src/development/controller';
import { ensureDevelopment, developmentOf } from '../../../src/engine/development/state';
import { validateReview, type ReviewValue } from '../../../src/engine/development/review';
import type { Appraisal, CampaignState, DevMoment, Unit } from '../../../src/engine/state/types';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import { sanitizeReview } from '../../../src/llm/calls/developmentReview';
import { DEFAULT_SETTINGS, getSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderSquadTab } from '../../../src/ui/squad/squadTab';
import { campaign, ctxOf, loadCore } from '../../helpers/world';
import { worldHarness } from '../../helpers/worldApp';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea', CAT = 'unit_cat';
const unit = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const ap = (i: number): Appraisal => ({
  id: `ap${i}`, day: 1, kind: 'praised', target: 'her', role: 'subject', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', severity: 'moderate', subject: ANN, pushes: [], summary: `s${i}`,
});
const world = (): CampaignState => { const s = campaign(reg, 4); s.settings.characterDevelopment = 'normal'; s.day = 8; return s; };
const moment = (over: Partial<DevMoment>): DevMoment => ({ id: 'dm0', axis: 'value:mercy', from: '1', to: '2', reason: 'kindness', day: 3, sceneId: 's1', shownDay: 4, ...over });
const view = (s: CampaignState) => buildKnowledge(s, DEFAULT_SETTINGS).development(ANN, reg);

describe('the view shows only what she has shown (minor 1)', () => {
  it('a later unshown step changes nothing on the line', () => {
    const s = world();
    unit(s).values.mercy = 1;
    const dev = ensureDevelopment(unit(s));
    dev.drift.mercy = 1; // shown: 1 -> 2
    dev.moments = [moment({})];
    expect(view(s).axes.map((a) => [a.axis, a.up, a.reason])).toEqual([['value:mercy', true, 'kindness']]);
    // an unshown step back down overshoots past the import: the current state says "harder", the view still says what she showed
    dev.drift.mercy = -1;
    dev.moments.push(moment({ id: 'dm1', from: '2', to: '0', reason: 'SENTINEL-LATER', sceneId: undefined, shownDay: undefined }));
    const v = view(s);
    expect(v.axes.map((a) => [a.up, a.reason])).toEqual([[true, 'kindness']]);
  });

  it('a shown change that returns to the import disappears', () => {
    const s = world();
    unit(s).values.mercy = 1;
    const dev = ensureDevelopment(unit(s));
    dev.drift.mercy = 0;
    dev.moments = [moment({}), moment({ id: 'dm1', from: '2', to: '1', reason: 'back', shownDay: 6 })];
    expect(view(s).axes).toEqual([]);
  });

  it('a like gained and shown, then lost and shown, is gone; gained and not yet lost stays', () => {
    const s = world();
    const dev = ensureDevelopment(unit(s));
    dev.gained = { likes: ['tea'] };
    dev.moments = [moment({ id: 'dm0', axis: 'like:tea', from: 'no', to: 'yes' })];
    expect(view(s).axes.map((a) => a.axis)).toEqual(['like:tea']);
    dev.gained = undefined;
    dev.moments.push(moment({ id: 'dm1', axis: 'like:tea', from: 'yes', to: 'no', shownDay: 7 }));
    expect(view(s).axes).toEqual([]);
  });

  it('an unshown change alone is not listed, even though the state changed', () => {
    const s = world();
    const dev = ensureDevelopment(unit(s));
    dev.drift.mercy = 1;
    dev.moments = [moment({ sceneId: undefined, shownDay: undefined })];
    expect(view(s).axes).toEqual([]);
  });
});

describe('the SQUAD bond chips read the effective bond (minor 2)', () => {
  it('a stepped lead style shows', () => {
    const s = world();
    unit(s).bond = { leadStyle: 'balanced', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known' };
    ensureDevelopment(unit(s)).bond = { leadStyle: 'dominant', desire: 'medium' };
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = document.createElement('div');
    document.body.append(host);
    renderSquadTab(host, { st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => getSettings(st), onNewCampaign: () => {} });
    const text = host.textContent ?? '';
    expect(text).toContain('LEADS: DOMINANT');
    expect(text).toContain('DESIRE: MEDIUM');
    expect(text).not.toContain('LEADS: BALANCED');
  });
});

describe('two gains in one review stay inside the list cap (minor 3)', () => {
  it('likes at 5 of 6 take one more, not two', () => {
    const s = world();
    unit(s).likes = ['a', 'b', 'c', 'd', 'e'];
    ensureDevelopment(unit(s)).acc = { 'like:x': 4, 'like:y': 4 };
    ensureDevelopment(unit(s)).pending = [ap(0), ap(1), ap(2)];
    const v: ReviewValue = { shifts: ['like:x', 'like:y'].map((axis) => ({ axis, direction: 'up' as const, size: 'step' as const, reason: 'r' })), facts: [] };
    const r = validateReview(s, reg, ANN, v);
    expect(r.shifts.map((x) => x.axis)).toEqual(['like:x']);
    expect(r.dropped.map((d) => d.axis)).toEqual(['like:y']);
  });

  it('a loss in the same review makes room', () => {
    const s = world();
    unit(s).likes = ['a', 'b', 'c', 'd', 'e', 'f'];
    ensureDevelopment(unit(s)).acc = { 'like:x': 4, 'like:a': -4 };
    const v: ReviewValue = { shifts: [{ axis: 'like:a', direction: 'down', size: 'step', reason: 'r' }, { axis: 'like:x', direction: 'up', size: 'step', reason: 'r' }], facts: [] };
    expect(validateReview(s, reg, ANN, v).shifts.map((x) => x.axis)).toEqual(['like:a', 'like:x']);
  });
});

describe('the model never gives the commander a pronoun (minor 4)', () => {
  it('a fact with one is dropped and a reason with one is blanked', () => {
    const r = sanitizeReview({
      shifts: [{ axis: 'value:mercy', direction: 'up', size: 'nudge', reason: 'She admired him.' }, { axis: 'value:mercy', direction: 'up', size: 'nudge', reason: 'She admired the commander.' }],
      facts: [{ text: 'She follows him everywhere.', kind: 'attitude' }, { text: 'She follows the commander everywhere.', kind: 'attitude' }],
    }, { axes: [{ axis: 'value:mercy', direction: 'up', support: 'weak' }] })!;
    expect(r.facts.map((f) => f.text)).toEqual(['She follows the commander everywhere.']);
    expect(r.shifts.map((s) => s.reason)).toEqual(['', 'She admired the commander.']);
  });
});

describe('bystanders of a world effect are witnesses (minor 6)', () => {
  it('a unit_event on the witnesses of a scapegoat records them as witnesses of the subject', () => {
    const s = world();
    const d = structuredClone(s);
    applyWorldEffects(d, ctxOf(d, reg), [{ type: 'unit_event', event: 'coerced', targets: 'witnesses', severity: 'moderate' }] as never, { kind: 'event', id: 'x', subjectId: ANN, witnessIds: [BEA, CAT] });
    expect(developmentOf(unit(d, BEA)).pending).toMatchObject([{ kind: 'coerced', role: 'witness', target: `unit:${ANN}`, subject: ANN }]);
    expect(developmentOf(unit(d, ANN)).pending).toEqual([]);
  });
});

describe('the controller (minors 5 and 7)', () => {
  function rig(initial: CampaignState, over: Record<string, unknown> = {}) {
    const h = worldHarness(reg, initial, { autoRetry: 0, ...over });
    h.st.cards.set('ann.png', { avatar: 'ann.png', name: 'ann', description: 'soldier', personality: 'dry', scenario: '', creatorNotes: '' });
    const ctl = createDevelopment({ ...h.deps, context: { setDirective() {}, clearMatching() {} } as never, refreshContext() {} });
    return { h, ctl };
  }
  const due = (s: CampaignState): CampaignState => {
    const dev = ensureDevelopment(unit(s));
    dev.pending = [ap(10), ap(11), ap(12)];
    dev.acc = { 'value:mercy': 2 };
    return s;
  };

  it('a provider that stays down costs one failing call per batch, not one per dispatch', async () => {
    const { h, ctl } = rig(due(world()));
    h.st.mainReplies = ['I cannot help with that.', 'I cannot help with that.'];
    await ctl.run(); // week one: fails, the fallback applies, a quiet record stays open
    expect(h.st.calls).toHaveLength(1);
    expect(developmentOf(unit(h.state())).pending).toEqual([]);
    await ctl.run();
    await ctl.run();
    expect(h.st.calls).toHaveLength(1); // not due: nothing is asked
    h.setState((s) => { s.day = 20; due(s); });
    await ctl.run(); // week two: fails again; the new fallback applies although an old record is open
    expect(h.st.calls).toHaveLength(2);
    expect(developmentOf(unit(h.state())).pending).toEqual([]);
    await ctl.run();
    expect(h.st.calls).toHaveLength(2);
    expect(h.state().generations!.records.filter((r) => r.siteId === 'development.review' && r.status === 'open')).toHaveLength(1);
  });

  it('a new batch that stops being due while the model writes does not replace the last review', async () => {
    const s = world();
    const dev = ensureDevelopment(unit(s));
    dev.drift.mercy = 1; // last week's review, not shown yet
    dev.lastApplied = { drift: {}, bond: undefined, gained: undefined, lost: undefined, acc: {}, factIds: [], momentIds: [], pending: [] };
    dev.lastReview = 1;
    due(s);
    const { h, ctl } = rig(s);
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [JSON.stringify({ shifts: [], facts: [{ text: 'She changed her mind.', kind: 'attitude' }] })];
    h.st.generateMain = async (req) => { h.setState((x) => { unit(x).development!.pending = []; }); return original(req); }; // the batch is gone
    await ctl.run();
    expect(developmentOf(unit(h.state())).drift.mercy).toBe(1); // last week's review is still there
    expect(developmentOf(unit(h.state())).facts).toEqual([]);
    expect(developmentOf(unit(h.state())).lastApplied).toBeDefined();
  });
});
