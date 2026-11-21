// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import type { Entry, Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import { dispatch } from '../../../src/engine/dispatch';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { Wizard } from '../../../src/setup/wizard';
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

const ids = (kind: 'hobbies' | 'opinionTopics') => [...reg[kind].keys()];
const posIds = (t: Entry) => (t.positions as Array<{ id: string }>).map((p) => p.id);
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

// --- the calibration

function calibration(over: Record<string, unknown> = {}) {
  const w = new Wizard({ registries: reg, desireBondDefects: false, importer: vi.fn(), onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
  w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
  const draft = w.state.units[0];
  draft.status = 'ready';
  draft.candidates = { roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: '' };
  Object.assign(draft.choice, over);
  const onUpdate = vi.fn();
  const onRegenerate = vi.fn();
  const host = mount();
  renderCalibration(host, { draft, registries: reg, desireBondDefects: false, onUpdate, onRegenerate, onManual: vi.fn() });
  return { host, onUpdate, onRegenerate, draft };
}

describe('the calibration blocks (P14c)', () => {
  it('shows TEMPERAMENT, HOBBIES and OPINIONS with a regenerate each, and edits through onUpdate', () => {
    const [h0, h1] = ids('hobbies');
    const t = reg.opinionTopics.get(ids('opinionTopics')[0]) as Entry;
    const { host, onUpdate, onRegenerate } = calibration({
      temperament: { talkativeness: 'silent', volatility: 'steady', humor: 'dry' }, hobbies: [h0], aptitudes: { high: [h1], low: [] },
      opinions: { [t.id]: { position: posIds(t)[0], text: 'Words.' } },
    });
    for (const s of ['temperament', 'hobbies', 'opinions']) {
      expect(host.querySelector(`section[data-section="${s}"]`), s).not.toBeNull();
      click(host.querySelector(`[data-regenerate="${s}"]`));
      expect(onRegenerate).toHaveBeenLastCalledWith(s);
    }
    click(host.querySelector('[data-temperament="humor"][data-id="warm"]'));
    expect(onUpdate).toHaveBeenLastCalledWith({ temperament: { talkativeness: 'silent', volatility: 'steady', humor: 'warm' } });
    click(host.querySelector('[data-lock="volatility"]'));
    expect(onUpdate).toHaveBeenLastCalledWith({ temperamentLocks: ['volatility'] });
    click(host.querySelector(`[data-remove-hobby="${h0}"]`));
    expect(onUpdate).toHaveBeenLastCalledWith({ hobbies: [], aptitudes: { high: [h1], low: [] } });
    change(host.querySelector('[data-add-hobby]'), ids('hobbies')[5]);
    expect(onUpdate).toHaveBeenLastCalledWith({ hobbies: [h0, ids('hobbies')[5]], aptitudes: { high: [h1], low: [] } });
    change(host.querySelector('[data-add-aptitude="low"]'), ids('hobbies')[6]);
    expect(onUpdate).toHaveBeenLastCalledWith({ hobbies: [h0], aptitudes: { high: [h1], low: [ids('hobbies')[6]] } });
    click(host.querySelector(`[data-aptitude="high"][data-id="${h1}"]`));
    expect(onUpdate).toHaveBeenLastCalledWith({ hobbies: [h0], aptitudes: { high: [], low: [] } });
    change(host.querySelector(`[data-opinion-position="${t.id}"]`), posIds(t)[1]);
    expect(onUpdate).toHaveBeenLastCalledWith({ opinions: { [t.id]: { position: posIds(t)[1], text: 'Words.' } } });
    change(host.querySelector(`[data-opinion-text="${t.id}"]`), 'Other.');
    expect(onUpdate).toHaveBeenLastCalledWith({ opinions: { [t.id]: { position: posIds(t)[0], text: 'Other.' } } });
    click(host.querySelector(`[data-remove-opinion="${t.id}"]`));
    expect(onUpdate).toHaveBeenLastCalledWith({ opinions: {} });
    const other = ids('opinionTopics')[3];
    change(host.querySelector('[data-add-opinion]'), other);
    const added = (reg.opinionTopics.get(other) as Entry).positions as Array<{ id: string }>;
    expect(onUpdate).toHaveBeenLastCalledWith({ opinions: { [t.id]: { position: posIds(t)[0], text: 'Words.' }, [other]: { position: added[Math.floor(added.length / 2)].id } } });
  });

  it('stops adding at the import cap and at three active hobbies', () => {
    const three = ids('hobbies').slice(0, 3);
    const twelve = Object.fromEntries(ids('opinionTopics').slice(0, 12).map((id) => [id, { position: posIds(reg.opinionTopics.get(id) as Entry)[0] }]));
    const { host } = calibration({ hobbies: three, opinions: twelve });
    expect(host.querySelector('[data-add-hobby]')!.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('[data-add-opinion]')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('every marker has data-analyze, every address resolves and is reachable', () => {
    const [h0] = ids('hobbies');
    const t = reg.opinionTopics.get(ids('opinionTopics')[0]) as Entry;
    const { host } = calibration({ hobbies: [h0], aptitudes: { high: [ids('hobbies')[1]], low: [ids('hobbies')[2]] }, opinions: { [t.id]: { position: posIds(t)[0] } } });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(null))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    const addresses = [...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze'));
    for (const a of ['glossary:temperament', 'glossary:talkativeness', 'glossary:volatility', 'glossary:humor', `hobbies:${h0}`, `opinionTopics:${t.id}`]) expect(addresses).toContain(a);
  });
});

// --- the dossier

const ANN = 'unit_ann';
function dossier(opts: { editLock: boolean; mutate?: (s: CampaignState) => void }) {
  let state = campaign(reg, 2);
  const [h0, h1, h2] = ids('hobbies');
  const t0 = reg.opinionTopics.get(ids('opinionTopics')[0]) as Entry;
  const t1 = reg.opinionTopics.get(ids('opinionTopics')[1]) as Entry;
  Object.assign(state.squad[0], {
    hobbies: [{ id: h0, skill: 47, interest: 83, state: 'active', since: 1, milestones: ['a', 'b'] }, { id: h1, skill: 5, interest: 20, state: 'cooling', since: 1, milestones: [] }],
    aptitudes: { high: [h2], low: [] },
    opinions: { [t0.id]: { position: posIds(t0)[0], strength: 'strong', text: 'Voiced words.', formedDay: 1, voicedDay: 3 }, [t1.id]: { position: posIds(t1)[0], strength: 'strong', text: 'Secret words.', formedDay: 1 } },
  });
  opts.mutate?.(state);
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const calls: Array<{ type: string; payload?: unknown }> = [];
  const onChanged = vi.fn();
  const host = mount();
  renderSquadTab(host, {
    st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS, editLock: opts.editLock }),
    onNewCampaign: vi.fn(),
    life: { dispatch: (a) => { calls.push(a); const r = dispatch(state, a, reg); state = r.state; return r.events as never; }, onChanged },
  });
  const unit = host.querySelector('article.alius-unit')!;
  return { host, unit, calls, onChanged, state: () => state, h0, h1, h2, t0, t1 };
}

describe('the dossier blocks (P14c)', () => {
  it('with the edit lock on every control is aria-disabled, analyzable, and sends nothing', () => {
    const { unit, calls, h0, t0 } = dossier({ editLock: true });
    const controls = [...unit.querySelectorAll('.alius-life-profile button, .alius-life-profile select, .alius-life-profile input')];
    expect(controls.length).toBeGreaterThan(8);
    for (const c of controls) expect(c.getAttribute('aria-disabled'), c.outerHTML.slice(0, 80)).toBe('true');
    click(unit.querySelector('[data-temperament="humor"][data-id="warm"]'));
    click(unit.querySelector('[data-lock="humor"]'));
    click(unit.querySelector(`[data-remove-hobby="${h0}"]`));
    change(unit.querySelector('[data-add-hobby]'), ids('hobbies')[7]);
    change(unit.querySelector(`[data-opinion-position="${t0.id}"]`), posIds(t0)[1]);
    expect(unit.querySelector('[data-add-opinion]')).toBeNull(); // not drawn while locked
    expect(calls).toEqual([]);
    for (const el of unit.querySelectorAll('.alius-life-profile .alius-option')) expect(el.getAttribute('data-analyze'), el.outerHTML.slice(0, 80)).not.toBeNull();
  });

  it('with it off the edits dispatch their actions: one changed field, lock, hobbies, opinion', () => {
    const { unit, calls, onChanged, h0, h2, t0, state: now } = dossier({ editLock: false });
    click(unit.querySelector('[data-temperament="humor"][data-id="warm"]'));
    expect(calls.at(-1)).toEqual({ type: 'profile/set_temperament', payload: { unitId: ANN, temperament: { humor: 'warm' } } });
    click(unit.querySelector('[data-lock="volatility"]'));
    expect(calls.at(-1)).toEqual({ type: 'profile/lock_temperament', payload: { unitId: ANN, field: 'volatility', on: true } });
    click(unit.querySelector(`[data-remove-hobby="${h0}"]`));
    expect(calls.at(-1)).toEqual({ type: 'profile/set_hobbies', payload: { unitId: ANN, hobbies: [ids('hobbies')[1]], aptitudes: { high: [h2], low: [] } } });
    change(unit.querySelector(`[data-opinion-position="${t0.id}"]`), posIds(t0)[1]);
    expect(calls.at(-1)).toEqual({ type: 'profile/set_opinion', payload: { unitId: ANN, topicId: t0.id, position: posIds(t0)[1] } });
    change(unit.querySelector(`[data-opinion-text="${t0.id}"]`), 'New words.');
    expect(calls.at(-1)).toEqual({ type: 'profile/set_opinion', payload: { unitId: ANN, topicId: t0.id, position: posIds(t0)[0], text: 'New words.' } });
    expect(onChanged).toHaveBeenCalledTimes(5);
    expect(now().squad[0].temperament).toEqual({ talkativeness: 'terse', volatility: 'steady', humor: 'warm' });
    expect(now().squad[0].temperamentLocks).toEqual(['volatility']);
  });

  it('a locked field is not changed: its words are disabled until it is unlocked, and an edit sends only the field that changed', () => {
    const { unit, calls } = dossier({ editLock: false, mutate: (s) => { s.squad[0].temperamentLocks = ['humor']; } });
    const word = unit.querySelector('[data-temperament="humor"][data-id="warm"]')!;
    expect(word.getAttribute('aria-disabled')).toBe('true');
    click(word);
    expect(calls).toEqual([]);
    expect(unit.querySelector('[data-lock="humor"]')!.getAttribute('aria-pressed')).toBe('true');
    click(unit.querySelector('[data-temperament="volatility"][data-id="moody"]'));
    expect(calls).toEqual([{ type: 'profile/set_temperament', payload: { unitId: ANN, temperament: { volatility: 'moody' } } }]);
  });

  it('hides her aptitudes and an opinion she has not voiced with the lock on, and draws them with it off', () => {
    const on = dossier({ editLock: true });
    expect(on.unit.querySelector('[data-aptitude]')).toBeNull();
    expect(on.unit.querySelector('[data-add-aptitude]')).toBeNull();
    expect(on.unit.querySelector(`[data-opinion="${on.t0.id}"]`)).not.toBeNull();
    expect(on.unit.querySelector(`[data-opinion="${on.t1.id}"]`)).toBeNull();
    expect(on.unit.textContent).not.toContain('Secret words.');
    expect(on.unit.querySelector('.alius-life-profile')!.innerHTML).not.toContain('Secret words.');
    expect(on.unit.querySelector('.alius-life-profile')!.innerHTML).not.toContain(on.t1.id); // nor the topic she holds it on (no picker to diff)
    expect(on.unit.querySelector('[data-add-opinion]')).toBeNull();
    document.body.innerHTML = '';
    const off = dossier({ editLock: false });
    expect(off.unit.querySelector(`[data-aptitude="high"][data-id="${off.h2}"]`)).not.toBeNull();
    expect(off.unit.querySelector('[data-add-aptitude="low"]')).not.toBeNull();
    expect(off.unit.querySelector(`[data-opinion="${off.t1.id}"]`)).not.toBeNull();
    expect(off.unit.querySelector('[data-add-opinion]')).not.toBeNull();
  });

  it('renders no number: skill is a count of milestones as marks, interest a word', () => {
    for (const editLock of [true, false]) {
      document.body.innerHTML = '';
      const { unit, h0 } = dossier({ editLock });
      const block = unit.querySelector('.alius-life-profile')!;
      const text = block.textContent!;
      expect(text).not.toMatch(/\b(47|83|20)\b/);
      const row = block.querySelector(`[data-hobby="${h0}"]`)!;
      expect(row.querySelector('.alius-life-dots')!.textContent).toBe('◆◆◇◇');
      expect(row.querySelector('.alius-life-dots')!.getAttribute('data-milestones')).toBe('2');
      expect(block.querySelector(`[data-hobby="${ids('hobbies')[1]}"]`)!.textContent).toContain('COOLING');
      expect(block.querySelector('.alius-life-row[data-hobby] [data-analyze]')).not.toBeNull();
    }
  });

  it('every marker has data-analyze and every address resolves, locked and unlocked', () => {
    for (const editLock of [true, false]) {
      document.body.innerHTML = '';
      const { unit, state: now } = dossier({ editLock });
      const state = now();
      const block = unit.querySelector<HTMLElement>('.alius-life-profile')!;
      expect(markedWithout(block)).toEqual([]);
      expect(unresolved(block, env(state))).toEqual([]);
      expect(unreachable(block)).toEqual([]);
      expect(markerCount(block)).toBeGreaterThanOrEqual(10);
    }
  });

  it('a grunt gets no block, and a squad tab without life gets none', () => {
    const { unit } = dossier({ editLock: false, mutate: (s) => { s.squad[1].kind = 'grunt'; s.squad[1].designation = 'K-1'; } });
    expect(document.body.querySelectorAll('.alius-life-profile')).toHaveLength(1);
    expect(unit).toBeTruthy();
  });
});
