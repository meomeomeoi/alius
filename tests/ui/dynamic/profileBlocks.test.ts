// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import { buildPanelModel, type AnalyzeEnv } from '../../../src/analysis/model';
import { parseSubject } from '../../../src/analysis/subject';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { dispatch } from '../../../src/engine/dispatch';
import { validatePractice } from '../../../src/engine/dynamic/profile';
import type { Practice } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { Wizard } from '../../../src/setup/wizard';
import { renderExpectationsBlock, renderPracticeBlock, type ExpectationsBlockCtx, type PracticeBlockCtx } from '../../../src/ui/dynamic/profileBlocks';
import { h } from '../../../src/ui/dom';
import { renderCalibration } from '../../../src/ui/setup/calibration';
import { renderSquadTab } from '../../../src/ui/squad/squadTab';
import { campaign, loadCore } from '../../helpers/world';
import { markedWithout, markerCount, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};
const env = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS } });
const click = (el: Element | null) => (el as HTMLElement).click();
const change = (el: Element | null, value: string) => {
  (el as HTMLInputElement).value = value;
  el!.dispatchEvent(new Event('change'));
};

const CATS = [{ id: 'restraint', label: 'Restraint' }, { id: 'service', label: 'Service' }];
const PRACTICE = (): Practice => validatePractice({
  style: { primary: 'cold', secondary: 'playful' }, audience: 'select_few', inclination: 'eager', fairness: 'strict', hintStyle: 'hints', drive: 'high',
  categories: { restraint: { as: 'craves', witness: 'drawn' }, service: { as: 'tolerates', witness: 'dislikes' } },
}, reg).practice!;

function practiceBlock(over: Partial<PracticeBlockCtx> = {}) {
  const host = mount();
  const onSet = vi.fn();
  const onLock = vi.fn();
  renderPracticeBlock(host, { unit: { id: 'unit_ann', displayName: 'Ann' }, practice: PRACTICE(), categories: CATS, locks: [], editable: true, onSet, onLock, ...over });
  return { host, onSet, onLock };
}

const TARGETS = [{ id: 'feet', label: 'Feet' }, { id: 'hair', label: 'Hair' }];
const SOURCES = [{ id: 'her_demand', label: 'Her demand', types: ['yielded', 'resisted', 'deflected'] }, { id: 'her_offer', label: 'Her offer', types: ['yielded', 'resisted', 'returned'] }];
function expectationsBlock(over: Partial<ExpectationsBlockCtx> = {}) {
  const host = mount();
  const onSet = vi.fn();
  const onLock = vi.fn();
  renderExpectationsBlock(host, {
    unit: { id: 'unit_ann', displayName: 'Ann' }, expectations: { holdsUntil: 'limit', worship: { feet: { attitude: 'craves', meaning: 'reward' } }, moments: { her_demand: { type: 'yielded', strength: 2 } } },
    targets: TARGETS, sources: SOURCES, locks: [], editable: true, onSet, onLock, ...over,
  });
  return { host, onSet, onLock };
}

describe('the PRACTICE block', () => {
  it('one row per enabled category with as and witness chips', () => {
    const { host, onSet } = practiceBlock();
    const rows = host.querySelectorAll('[data-practice-category]');
    expect([...rows].map((r) => r.getAttribute('data-practice-category'))).toEqual(['restraint', 'service']);
    for (const row of rows) {
      expect(row.querySelectorAll('[data-practice-as]')).toHaveLength(4);
      expect(row.querySelectorAll('[data-practice-witness]')).toHaveLength(3);
    }
    expect(host.querySelector('[data-practice-category="restraint"] [data-practice-as="craves"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-practice-category="restraint"] [data-practice-witness="drawn"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-practice-category="service"] [data-practice-as="craves"]')!.getAttribute('aria-pressed')).toBe('false');
    click(host.querySelector('[data-practice-category="service"] [data-practice-as="enjoys"]'));
    expect(onSet).toHaveBeenCalledWith({ categories: { service: { as: 'enjoys' } } });
    click(host.querySelector('[data-practice-category="restraint"] [data-practice-witness="dislikes"]'));
    expect(onSet).toHaveBeenLastCalledWith({ categories: { restraint: { witness: 'dislikes' } } });
    // the style pair and the other fields
    click(host.querySelector('[data-practice-style="primary"] [data-id="ritual"]'));
    expect(onSet).toHaveBeenLastCalledWith({ style: { primary: 'ritual', secondary: 'playful' } });
    click(host.querySelector('[data-practice-style="primary"] [data-id="playful"]')); // the secondary goes when it becomes the primary
    expect(onSet).toHaveBeenLastCalledWith({ style: { primary: 'playful' } });
    click(host.querySelector('[data-practice-style="secondary"] [data-id="cruel"]'));
    expect(onSet).toHaveBeenLastCalledWith({ style: { primary: 'cold', secondary: 'cruel' } });
    click(host.querySelector('[data-practice-style="secondary"] [data-id="none"]'));
    expect(onSet).toHaveBeenLastCalledWith({ style: { primary: 'cold' } });
    click(host.querySelector('[data-practice-field="drive"] [data-id="low"]'));
    expect(onSet).toHaveBeenLastCalledWith({ drive: 'low' });
    for (const f of ['audience', 'inclination', 'fairness', 'hintStyle', 'drive']) expect(host.querySelector(`[data-practice-field="${f}"]`), f).not.toBeNull();
    // a chip that is already pressed does nothing
    onSet.mockClear();
    click(host.querySelector('[data-practice-field="drive"] [data-id="high"]'));
    expect(onSet).not.toHaveBeenCalled();
  });

  it('with no section only the primary style is offered', () => {
    const { host, onSet } = practiceBlock({ practice: undefined });
    expect(host.querySelectorAll('[data-practice-category]')).toHaveLength(0);
    expect(host.querySelector('[data-practice-style="secondary"]')).toBeNull();
    click(host.querySelector('[data-practice-style="primary"] [data-id="drill"]'));
    expect(onSet).toHaveBeenCalledWith({ style: { primary: 'drill' } });
  });

  it("a locked field's chips are aria-disabled, and the lock toggles", () => {
    const { host, onSet, onLock } = practiceBlock({ locks: ['categories.restraint', 'drive', 'style'] });
    const dis = (sel: string) => [...host.querySelectorAll(sel)].map((c) => c.getAttribute('aria-disabled'));
    expect(dis('[data-practice-category="restraint"] [data-practice-as], [data-practice-category="restraint"] [data-practice-witness]').every((v) => v === 'true')).toBe(true);
    expect(dis('[data-practice-category="service"] [data-practice-as]').every((v) => v === null)).toBe(true);
    expect(dis('[data-practice-field="drive"] [data-id]').every((v) => v === 'true')).toBe(true);
    expect(dis('[data-practice-style] [data-id]').every((v) => v === 'true')).toBe(true);
    click(host.querySelector('[data-practice-category="restraint"] [data-practice-as="none"]'));
    click(host.querySelector('[data-practice-field="drive"] [data-id="low"]'));
    expect(onSet).not.toHaveBeenCalled();
    expect(host.querySelector('[data-lock="drive"]')!.getAttribute('aria-pressed')).toBe('true');
    click(host.querySelector('[data-lock="drive"]'));
    expect(onLock).toHaveBeenLastCalledWith('drive', false);
    click(host.querySelector('[data-lock="categories.service"]'));
    expect(onLock).toHaveBeenLastCalledWith('categories.service', true);
    click(host.querySelector('[data-lock="style"]'));
    expect(onLock).toHaveBeenLastCalledWith('style', false);
  });

  it('not editable: every control is aria-disabled and does nothing', () => {
    const { host, onSet, onLock } = practiceBlock({ editable: false });
    const controls = [...host.querySelectorAll('button, select, input')];
    expect(controls.length).toBeGreaterThan(20);
    for (const c of controls) expect(c.getAttribute('aria-disabled'), c.outerHTML.slice(0, 90)).toBe('true');
    for (const c of controls) click(c);
    expect(onSet).not.toHaveBeenCalled();
    expect(onLock).not.toHaveBeenCalled();
  });
});

describe('the EXPECTATIONS block', () => {
  it('worship rows only for the allowed targets, moment rows for the ones set, and the edits', () => {
    const { host, onSet } = expectationsBlock();
    expect([...host.querySelectorAll('[data-worship]')].map((r) => r.getAttribute('data-worship'))).toEqual(['feet', 'hair']);
    expect(host.querySelector('[data-worship="genitalia"]')).toBeNull();
    expect(host.querySelector('[data-worship="feet"] [data-attitude="craves"]')!.getAttribute('aria-pressed')).toBe('true');
    click(host.querySelector('[data-worship="hair"] [data-attitude="enjoys"]'));
    expect(onSet).toHaveBeenLastCalledWith({ worship: { hair: { attitude: 'enjoys' } } });
    click(host.querySelector('[data-worship="feet"] [data-attitude="craves"]')); // pressed again: cleared
    expect(onSet).toHaveBeenLastCalledWith({ worship: { feet: null } });
    change(host.querySelector('[data-worship="feet"] [data-meaning]'), 'duty');
    expect(onSet).toHaveBeenLastCalledWith({ worship: { feet: { attitude: 'craves', meaning: 'duty' } } });
    click(host.querySelector('[data-holds-until] [data-id="signal"]'));
    expect(onSet).toHaveBeenLastCalledWith({ holdsUntil: 'signal' });
    // moments: the ones set are rows, the rest come from the picker, and only the allowed sources are offered
    expect([...host.querySelectorAll('[data-moment]')].map((r) => r.getAttribute('data-moment'))).toEqual(['her_demand']);
    const options = [...host.querySelectorAll('[data-add-moment] option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual(['', 'her_offer']);
    change(host.querySelector('[data-add-moment]'), 'her_offer');
    expect(onSet).toHaveBeenLastCalledWith({ moments: { her_offer: { type: 'yielded', strength: 2 } } });
    click(host.querySelector('[data-moment="her_demand"] [data-strength="3"]'));
    expect(onSet).toHaveBeenLastCalledWith({ moments: { her_demand: { type: 'yielded', strength: 3 } } });
    click(host.querySelector('[data-moment="her_demand"] [data-type="resisted"]'));
    expect(onSet).toHaveBeenLastCalledWith({ moments: { her_demand: { type: 'resisted', strength: 2 } } });
    click(host.querySelector('[data-moment="her_demand"] [data-remove-moment]'));
    expect(onSet).toHaveBeenLastCalledWith({ moments: { her_demand: null } });
    change(host.querySelector('[data-tell="irritation"]'), 'a long, even breath');
    expect(onSet).toHaveBeenLastCalledWith({ tells: { irritation: 'a long, even breath' } });
    click(host.querySelector('[data-hair] [data-id="bob"]'));
    expect(onSet).toHaveBeenLastCalledWith({ hair: 'bob' });
  });

  it('a locked field or entry is aria-disabled; not editable disables everything', () => {
    const { host, onSet, onLock } = expectationsBlock({ locks: ['holdsUntil', 'worship.feet'] });
    expect([...host.querySelectorAll('[data-holds-until] [data-id]')].every((c) => c.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect([...host.querySelectorAll('[data-worship="feet"] [data-attitude]')].every((c) => c.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect([...host.querySelectorAll('[data-worship="hair"] [data-attitude]')].every((c) => c.getAttribute('aria-disabled') === null)).toBe(true);
    click(host.querySelector('[data-worship="feet"] [data-attitude="dislikes"]'));
    expect(onSet).not.toHaveBeenCalled();
    click(host.querySelector('[data-lock="worship.feet"]'));
    expect(onLock).toHaveBeenLastCalledWith('worship.feet', false);
    click(host.querySelector('[data-lock="worship.hair"]'));
    expect(onLock).toHaveBeenLastCalledWith('worship.hair', true);
    onSet.mockClear();
    const off = expectationsBlock({ editable: false });
    const controls = [...off.host.querySelectorAll('button, select, input')];
    expect(controls.length).toBeGreaterThan(20);
    for (const c of controls) expect(c.getAttribute('aria-disabled'), c.outerHTML.slice(0, 90)).toBe('true');
    for (const c of controls) click(c);
    expect(off.onSet).not.toHaveBeenCalled();
  });
});

describe('P15b: her manner in the PRACTICE block', () => {
  const ZERO = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
  const MANNERED = (): Practice => ({
    ...PRACTICE(), manner: { ...ZERO, intensity: 2, warmth: -1 }, drawnBy: ['power'], everyday: 'Kind and odd.', contrast: 'high',
    quirks: [{ when: 'switch', text: 'She takes off her glasses.' }, { when: 'after', text: 'Tea, in silence.' }],
  });
  const steps = (host: HTMLElement, axis: string) => [...host.querySelectorAll(`[data-manner-axis="${axis}"] [data-step]`)] as HTMLElement[];

  it('five steps per axis, the word at ±1 / ±2 and nothing at 0; the stored step is pressed', () => {
    const { host } = practiceBlock({ practice: MANNERED() });
    for (const a of ['intensity', 'warmth', 'order', 'voice', 'tempo', 'curiosity'] as const) {
      const row = steps(host, a);
      expect(row.map((b) => b.getAttribute('data-step'))).toEqual(['-2', '-1', '0', '1', '2']);
      expect(row[2].textContent).not.toMatch(/[a-z]/i);
      for (const i of [0, 1, 3, 4]) expect(row[i].textContent, `${a} ${i}`).toMatch(/[a-z]/i);
    }
    expect(steps(host, 'intensity')[0].textContent!.toLowerCase()).toContain('gentle');
    expect(steps(host, 'intensity')[4].textContent!.toLowerCase()).toContain('all the way');
    expect(steps(host, 'intensity')[4].getAttribute('aria-pressed')).toBe('true');
    expect(steps(host, 'warmth')[1].getAttribute('aria-pressed')).toBe('true');
    expect(steps(host, 'order')[2].getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-contrast]')!.textContent).toContain('HIGH');
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('setting a step, what draws her, the everyday line and the quirks call onSet', () => {
    const { host, onSet } = practiceBlock({ practice: MANNERED() });
    click(steps(host, 'tempo')[0]);
    expect(onSet).toHaveBeenLastCalledWith({ manner: { tempo: -2 } });
    click(host.querySelector('[data-drawn-by="pain"]'));
    expect(onSet).toHaveBeenLastCalledWith({ drawnBy: ['power', 'pain'] });
    click(host.querySelector('[data-drawn-by="power"]'));
    expect(onSet).toHaveBeenLastCalledWith({ drawnBy: null });
    change(host.querySelector('[data-everyday]'), 'Loud at cards.');
    expect(onSet).toHaveBeenLastCalledWith({ everyday: 'Loud at cards.' });
    change(host.querySelector('[data-everyday]'), '');
    expect(onSet).toHaveBeenLastCalledWith({ everyday: null });
    change(host.querySelector('[data-quirk="1"] [data-quirk-text]'), 'A cigarette.');
    expect(onSet).toHaveBeenLastCalledWith({ quirks: [{ when: 'switch', text: 'She takes off her glasses.' }, { when: 'after', text: 'A cigarette.' }] });
    change(host.querySelector('[data-quirk="0"] [data-quirk-when]'), 'during');
    expect(onSet).toHaveBeenLastCalledWith({ quirks: [{ when: 'during', text: 'She takes off her glasses.' }, { when: 'after', text: 'Tea, in silence.' }] });
    click(host.querySelector('[data-quirk="0"] [data-remove-quirk]'));
    expect(onSet).toHaveBeenLastCalledWith({ quirks: [{ when: 'after', text: 'Tea, in silence.' }] });
    change(host.querySelector('[data-quirk="new"] [data-quirk-text]'), 'By rank, mockingly.');
    expect(onSet).toHaveBeenLastCalledWith({ quirks: [...MANNERED().quirks!, { when: 'switch', text: 'By rank, mockingly.' }] });
  });

  it('without a manner block nothing is pressed and a step creates it', () => {
    const { host, onSet } = practiceBlock();
    expect(steps(host, 'warmth').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    click(steps(host, 'warmth')[2]);
    expect(onSet).toHaveBeenLastCalledWith({ manner: { warmth: 0 } });
  });

  it('a locked or non-editable block is disabled', () => {
    const { host, onSet, onLock } = practiceBlock({ practice: MANNERED(), locks: ['manner', 'drawnBy', 'everyday', 'quirks'] });
    for (const el of [...host.querySelectorAll('[data-manner-axis] [data-step], [data-drawn-by], [data-everyday], [data-quirk] input, [data-quirk] select, [data-quirk] button:not([data-lock])')]) {
      expect(el.getAttribute('aria-disabled'), el.outerHTML.slice(0, 80)).toBe('true');
      click(el);
    }
    change(host.querySelector('[data-everyday]'), 'x');
    expect(onSet).not.toHaveBeenCalled();
    for (const f of ['manner', 'drawnBy', 'everyday', 'quirks']) expect(host.querySelector(`[data-lock="${f}"]`)!.textContent).toBe('[ LOCKED ]');
    click(host.querySelector('[data-lock="manner"]'));
    expect(onLock).toHaveBeenLastCalledWith('manner', false);
    const off = practiceBlock({ practice: MANNERED(), editable: false });
    for (const el of [...off.host.querySelectorAll('[data-step], [data-drawn-by], [data-everyday], [data-quirk] input')]) expect(el.getAttribute('aria-disabled')).toBe('true');
  });

  it('a drifted axis shows its current step with the since-joining mark', () => {
    const { host } = practiceBlock({ practice: MANNERED(), drift: { warmth: 2, order: 0 } });
    const warmth = steps(host, 'warmth');
    expect(warmth[1].getAttribute('aria-pressed')).toBe('true'); // the imported step stays the one she edits
    expect(warmth[3].getAttribute('data-since-joining')).toBe('true'); // -1 + 2 = +1: where she is now
    expect(host.querySelector('[data-manner-axis="warmth"] .alius-since-joining')).not.toBeNull();
    expect(host.querySelector('[data-manner-axis="order"] .alius-since-joining')).toBeNull();
    expect(host.querySelectorAll('[data-since-joining]')).toHaveLength(1);
  });

  it('every new control resolves data-analyze', () => {
    const state = campaign(reg, 2);
    const { host } = practiceBlock({ practice: MANNERED(), drift: { warmth: 1 } });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(state))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    for (const el of host.querySelectorAll('[data-manner-axis] [data-step], [data-drawn-by], [data-everyday], [data-quirk] input, [data-contrast], .alius-since-joining')) {
      expect(el.closest('[data-analyze]'), el.outerHTML.slice(0, 80)).not.toBeNull();
    }
    for (const id of ['manner_intensity', 'manner_warmth', 'manner_order', 'manner_voice', 'manner_tempo', 'manner_curiosity', 'drawn_by', 'face_everyday', 'face_dynamic', 'quirks', 'contrast', 'style_turn']) {
      expect(reg.glossary.has(id), id).toBe(true);
    }
  });

  it('the reading of practiceStyles:regal names its place in words, with no number', () => {
    const model = buildPanelModel(parseSubject('practiceStyles:regal')!, env(null));
    const text = [model.text ?? '', ...model.effects].join(' ');
    expect(model.effects.join(' ')).toMatch(/ritual/);
    expect(model.effects.join(' ')).not.toMatch(/[0-9]/);
    expect(text).not.toMatch(/[+-]?[123]\b/);
  });
});

describe('analyze coverage', () => {
  it('every chip and lock carries data-analyze and resolves', () => {
    const state = campaign(reg, 2);
    for (const { host } of [practiceBlock(), expectationsBlock(), practiceBlock({ locks: ['drive'] }), expectationsBlock({ locks: ['holdsUntil'] })]) {
      expect(markerCount(host)).toBeGreaterThan(20);
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(state))).toEqual([]);
      expect(unreachable(host)).toEqual([]);
      for (const el of host.querySelectorAll('.alius-option')) expect(el.getAttribute('data-analyze'), el.outerHTML.slice(0, 80)).not.toBeNull();
    }
  });
});

describe('the calibration', () => {
  function calibration(content: string[] | undefined, over: Record<string, unknown> = {}) {
    const w = new Wizard({ registries: reg, desireBondDefects: false, importer: vi.fn(), onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
    w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    const draft = w.state.units[0];
    draft.status = 'ready';
    draft.candidates = { roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: '' };
    Object.assign(draft.choice, over);
    const onUpdate = vi.fn();
    const onRegenerate = vi.fn();
    const host = mount();
    renderCalibration(host, { draft, registries: reg, desireBondDefects: false, onUpdate, onRegenerate, onManual: vi.fn(), ...(content !== undefined ? { content } : {}) });
    return { host, onUpdate, onRegenerate, draft };
  }

  it('the blocks are absent while no practice category is on', () => {
    for (const content of [undefined, [], ['explicit_scenes', 'body_modification']]) {
      const { host } = calibration(content);
      expect(host.querySelector('[data-section="practice"]')).toBeNull();
      expect(host.querySelector('[data-section="expectations"]')).toBeNull();
      expect(host.querySelector('[data-practice-style]')).toBeNull();
    }
  });

  it('with a practice category on, PRACTICE and EXPECTATIONS show with a regenerate each, only the enabled categories, and edit through onUpdate', () => {
    const { host, onUpdate, onRegenerate } = calibration(['restraint', 'service', 'worship'], { bond: { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: PRACTICE() } });
    expect([...host.querySelectorAll('[data-section="practice"] [data-practice-category]')].map((r) => r.getAttribute('data-practice-category'))).toEqual(['service', 'restraint']);
    expect([...host.querySelectorAll('[data-section="expectations"] [data-worship]')].map((r) => r.getAttribute('data-worship'))).not.toContain('genitalia'); // explicit_scenes is off
    expect(host.querySelectorAll('[data-section="expectations"] [data-worship]').length).toBeGreaterThan(10);
    click(host.querySelector('[data-section="practice"] [data-regenerate]'));
    expect(onRegenerate).toHaveBeenLastCalledWith('practice');
    click(host.querySelector('[data-section="expectations"] [data-regenerate]'));
    expect(onRegenerate).toHaveBeenLastCalledWith('expectations');
    click(host.querySelector('[data-practice-field="drive"] [data-id="low"]'));
    expect(onUpdate).toHaveBeenLastCalledWith({ bond: expect.objectContaining({ leadStyle: 'dominant', practice: expect.objectContaining({ drive: 'low', style: { primary: 'cold', secondary: 'playful' } }) }) });
    click(host.querySelector('[data-lock="drive"]'));
    expect(onUpdate).toHaveBeenLastCalledWith({ practiceLocks: ['drive'] });
    click(host.querySelector('[data-section="expectations"] [data-holds-until] [data-id="limit"]'));
    expect(onUpdate).toHaveBeenLastCalledWith({ expectations: { holdsUntil: 'limit' } });
    click(host.querySelector('[data-section="expectations"] [data-lock="holdsUntil"]'));
    expect(onUpdate).toHaveBeenLastCalledWith({ expectationLocks: ['holdsUntil'] });
  });

  it('a first style creates the section on a modest bond', () => {
    const { host, onUpdate } = calibration(['restraint']);
    click(host.querySelector('[data-section="practice"] [data-practice-style="primary"] [data-id="ritual"]'));
    expect(onUpdate).toHaveBeenLastCalledWith({ bond: expect.objectContaining({ leadStyle: 'balanced', practice: expect.objectContaining({ style: { primary: 'ritual' }, fairness: 'fair' }) }) });
  });

  it('the blocks and the regeneration are analyzable and resolve', () => {
    const { host } = calibration(['restraint', 'service', 'worship'], { bond: { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: PRACTICE() } });
    const section = h('div');
    section.append(...host.querySelectorAll('[data-section="practice"], [data-section="expectations"]'));
    expect(markedWithout(section)).toEqual([]);
    expect(unresolved(section, env(campaign(reg, 2)))).toEqual([]);
  });
});

describe('the dossier', () => {
  function dossier(opts: { editLock: boolean; enabled?: string[]; practice?: boolean }) {
    let state = campaign(reg, 2);
    state.content = { enabled: opts.enabled ?? ['restraint', 'service', 'worship'] };
    const unitState = state.squad.find((u) => u.id === 'unit_ann')!;
    if (opts.practice !== false) {
      unitState.bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: PRACTICE() };
      unitState.expectations = { holdsUntil: 'limit' };
    }
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const calls: Array<{ type: string; payload?: unknown }> = [];
    const onChanged = vi.fn();
    const host = mount();
    renderSquadTab(host, {
      st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS, editLock: opts.editLock }),
      onNewCampaign: vi.fn(),
      dynamic: { dispatch: (a) => { calls.push(a); const r = dispatch(state, a, reg); state = r.state; return r.events as never; }, onChanged },
    });
    const unit = host.querySelector('article.alius-unit')!;
    return { host, unit, calls, onChanged, state: () => state };
  }

  it('with the edit lock on the hidden profile is not drawn', () => {
    const { unit } = dossier({ editLock: true });
    expect(unit.querySelector('.alius-dynamic-profile')).toBeNull();
    expect(unit.querySelector('[data-practice-style]')).toBeNull();
    expect(unit.querySelector('[data-worship]')).toBeNull();
  });

  it('with it off the edits dispatch their actions, one field at a time, and the lock', () => {
    const { unit, calls, onChanged, state } = dossier({ editLock: false });
    expect(unit.querySelector('.alius-dynamic-profile')).not.toBeNull();
    click(unit.querySelector('[data-practice-field="drive"] [data-id="low"]'));
    expect(calls.at(-1)).toEqual({ type: 'profile/set_practice', payload: { unitId: 'unit_ann', practice: { drive: 'low' } } });
    expect(state().squad.find((u) => u.id === 'unit_ann')!.bond!.practice!.drive).toBe('low');
    click(unit.querySelector('[data-lock="drive"]'));
    expect(calls.at(-1)).toEqual({ type: 'profile/lock_practice', payload: { unitId: 'unit_ann', field: 'drive', on: true } });
    click(unit.querySelector('[data-worship="feet"] [data-attitude="craves"]'));
    expect(calls.at(-1)).toEqual({ type: 'profile/set_expectation', payload: { unitId: 'unit_ann', patch: { worship: { feet: { attitude: 'craves' } } } } });
    expect(state().squad.find((u) => u.id === 'unit_ann')!.expectations!.worship!.feet).toEqual({ attitude: 'craves' });
    click(unit.querySelector('[data-lock="worship.feet"]'));
    expect(calls.at(-1)).toEqual({ type: 'profile/lock_expectation', payload: { unitId: 'unit_ann', field: 'worship.feet', on: true } });
    expect(onChanged).toHaveBeenCalledTimes(4);
  });

  it('is absent while no practice category is on, and for a unit with no section it offers the style', () => {
    expect(dossier({ editLock: false, enabled: ['explicit_scenes'] }).unit.querySelector('.alius-dynamic-profile')).toBeNull();
    const { unit } = dossier({ editLock: false, practice: false });
    expect(unit.querySelector('[data-practice-style="primary"]')).not.toBeNull();
    expect(unit.querySelector('[data-practice-category]')).toBeNull();
  });
});
