// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dilemma';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { dilemmaOptions } from '../../../src/engine/dilemma/flow';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import type { CampaignState, Vote } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { renderDilemma } from '../../../src/ui/dilemma/dilemmaPanel';
import { h } from '../../../src/ui/dom';
import { renderExpeditionScreen } from '../../../src/ui/expedition/expeditionScreen';
import { askHerView } from '../../../src/ui/practice/askHer';
import { renderVotePanel } from '../../../src/ui/power/votePanel';
import type { ExpeditionController } from '../../../src/world/expeditionController';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore, run } from '../../helpers/world';
import { depart, withMission } from '../../helpers/expedition';
import { ANN, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

const praise = { label: 'Praise', effects: [{ type: 'unit_event', event: 'praised', severity: 'moderate', targets: 'named' }], magnitudes: [] };
const insult = { label: 'Insult', effects: [{ type: 'unit_event', event: 'insulted', severity: 'moderate', targets: 'named' }], magnitudes: [] };
const shrug = { label: 'Shrug', effects: [{ type: 'resource', resource: 'credits', amount: 1 }], magnitudes: [] };

function dilemmaState(frame: 'play' | 'role' | 'rule' = 'role', holds = true, command = false, options: unknown[] = [praise, insult, shrug]): CampaignState {
  const s = withService(world(reg, frame));
  if (!holds) s.relations[ANN].dynamic!.frame = 'equal';
  if (command) dynamicOf(s, ANN)!.domains = [{ id: 'command', since: s.day }];
  dynamicOf(s, ANN)!.hold = { play: 30, role: 60, rule: 75 }[frame];
  s.dilemmas = { seq: 1, open: { id: 'dl_1', templateId: 't', scale: 'minor', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [ANN, 'unit_bea'], beatId: 'b', title: 'T', options: options as never } };
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;
const asked = (s: CampaignState) => run(s, reg, { type: 'practice/ask_her', payload: { context: 'dilemma', ref: 'dl_1' } }).state;

function panel(s: CampaignState, withAsk = true) {
  const host = h('div');
  document.body.append(host);
  const onChoose = vi.fn();
  const onAsk = vi.fn();
  const view = askHerView(s, reg, 'dilemma', 'dl_1');
  renderDilemma(host, { title: 'T', setup: 'S', scale: 'minor', waiting: false, options: dilemmaOptions(s, reg), onChoose, ...(withAsk && view ? { askHer: { view, onAsk } } : {}) });
  return { host, onChoose, onAsk };
}
const opts = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-dilemma-option]')];

describe('the dilemma card', () => {
  it('shows [ ASK HER ] while a live holder holds the commander, with data-analyze, and asks on press', () => {
    const { host, onAsk } = panel(dilemmaState());
    const chip = host.querySelector<HTMLButtonElement>('[data-action="ask-her"]')!;
    expect(chip.textContent).toBe('[ ASK HER ]');
    expect(chip.getAttribute('data-analyze')).toBe('glossary:ask_her');
    chip.click();
    expect(onAsk).toHaveBeenCalled();
    expect(opts(host).every((b) => !b.hasAttribute('data-preselected'))).toBe(true);
  });

  it('nothing without a live holder: the card is as it was, no chip, no mark', () => {
    const s = dilemmaState('role', false);
    expect(askHerView(s, reg, 'dilemma', 'dl_1')).toBeNull();
    const { host } = panel(s);
    expect(host.querySelector('[data-action="ask-her"]')).toBeNull();
    expect(host.querySelector('.alius-askher')).toBeNull();
    expect(opts(host)).toHaveLength(3);
  });

  it('once she was asked her pick is marked, the others say they defy her, and the chip is gone', () => {
    const { host } = panel(asked(dilemmaState()));
    expect(host.querySelector('[data-action="ask-her"]')).toBeNull();
    expect(opts(host).map((b) => b.getAttribute('data-preselected'))).toEqual(['true', null, null]);
    expect([...host.querySelectorAll('[data-defies]')].map((e) => e.getAttribute('data-defies'))).toEqual(['Ann', 'Ann']);
    expect(host.querySelector('[data-askher-note]')!.textContent).toBe('Her pick is marked.');
  });

  it('nothing touches her: she leaves it to the commander, nothing is marked', () => {
    const { host } = panel(asked(dilemmaState('role', true, false, [shrug, { label: 'Wait', effects: [], magnitudes: [] }])));
    expect(host.querySelector('[data-askher-note]')!.textContent).toBe('She leaves it to the commander.');
    expect(host.querySelector('[data-preselected]')).toBeNull();
    expect(host.querySelector('[data-defies]')).toBeNull();
  });

  it('every new element carries data-analyze and resolves', () => {
    const s = asked(dilemmaState());
    const { host } = panel(s);
    expect(host.querySelector('[data-askher-note]')!.getAttribute('data-analyze')).toBe('glossary:ask_her');
    const fresh = panel(dilemmaState()).host;
    expect(markedWithout(fresh)).toEqual([]);
    expect(unresolved(fresh, env(dilemmaState()))).toEqual([]);
    expect(unreachable(fresh)).toEqual([]);
  });
});

describe('pre-selected at rule with the command', () => {
  const pre = () => dilemmaState('rule', true, true);

  it('only her pick is shown, with [ CONFIRM ] and [ DEFY ]; confirming chooses her pick', () => {
    const { host, onChoose } = panel(pre());
    expect(opts(host)).toHaveLength(0);
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['[ CONFIRM ]', '[ DEFY ]']);
    expect(host.querySelector('.alius-askher-choice')!.textContent).toContain('Praise');
    for (const b of host.querySelectorAll('button')) expect(b.getAttribute('data-analyze')).toBe('glossary:ask_her');
    host.querySelector<HTMLButtonElement>('[data-action="confirm-her"]')!.click();
    expect(onChoose).toHaveBeenCalledWith(0);
  });

  it('DEFY opens the other options; choosing one of them goes through the normal choose', () => {
    const s = pre();
    const host = h('div');
    document.body.append(host);
    const onChoose = vi.fn();
    const ctx = { title: 'T', setup: 'S', scale: 'minor' as const, waiting: false, options: dilemmaOptions(s, reg), onChoose, askHer: { view: askHerView(s, reg, 'dilemma', 'dl_1')!, onAsk: vi.fn() } };
    renderDilemma(host, ctx);
    host.querySelector<HTMLButtonElement>('[data-action="defy-her"]')!.click();
    expect(opts(host)).toHaveLength(3);
    expect(host.querySelector('[data-action="confirm-her"]')).toBeNull();
    opts(host)[1].click();
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('a holder without the command does not pre-select', () => {
    const { host } = panel(dilemmaState('rule', true, false));
    expect(opts(host)).toHaveLength(3);
    expect(host.querySelector('[data-action="ask-her"]')).not.toBeNull();
  });
});

describe('the vote panel', () => {
  const vote = (ballot: 'for' | 'against', status: Vote['status']): Vote => ({
    id: 'v1', kind: 'mission', subject: 'm1', day: 20, commanderWeight: 1, forWeight: 2, againstWeight: 1, passed: status === 'passed', status,
    ballots: [{ unitId: ANN, vote: ballot, weight: 1, score: 1, term: 'values' }],
  });
  function draw(ballot: 'for' | 'against', status: Vote['status'], ask: boolean, frame: 'role' | 'rule' = 'role', command = false) {
    const s = withService(world(reg, frame));
    dynamicOf(s, ANN)!.hold = frame === 'rule' ? 75 : 60;
    if (command) dynamicOf(s, ANN)!.domains = [{ id: 'command', since: s.day }];
    s.power = { votes: { open: vote(ballot, status), log: [], seq: 1 } };
    const state = ask ? run(s, reg, { type: 'practice/ask_her', payload: { context: 'vote', ref: 'v1' } }).state : s;
    const host = h('div');
    document.body.append(host);
    const handlers = { onCarry: vi.fn(), onDrop: vi.fn(), onOverrule: vi.fn(), onAsk: vi.fn() };
    const view = askHerView(state, reg, 'vote', 'v1');
    renderVotePanel(host, vote(ballot, status), {}, { state, registries: reg, onCarry: handlers.onCarry, onDrop: handlers.onDrop, onOverrule: handlers.onOverrule, ...(view ? { askHer: { view, onAsk: handlers.onAsk } } : {}) });
    return { host, ...handlers };
  }
  const act = (host: HTMLElement, id: string) => host.querySelector<HTMLButtonElement>(`[data-vote-act="${id}"]`);

  it('[ ASK HER ] on a vote that was taken; her side marked afterwards: carry it out when she voted for it, drop it when against', () => {
    const before = draw('against', 'passed', false);
    expect(before.host.querySelector('[data-action="ask-her"]')).not.toBeNull();
    before.host.querySelector<HTMLButtonElement>('[data-action="ask-her"]')!.click();
    expect(before.onAsk).toHaveBeenCalled();
    const against = draw('against', 'passed', true);
    expect(act(against.host, 'drop')!.getAttribute('data-preselected')).toBe('true');
    expect(act(against.host, 'carry')!.hasAttribute('data-preselected')).toBe(false);
    expect(against.host.querySelector('[data-defies]')).not.toBeNull();
    const forHer = draw('for', 'passed', true);
    expect(act(forHer.host, 'carry')!.getAttribute('data-preselected')).toBe('true');
    expect(act(forHer.host, 'drop')).toBeNull();
    expect(act(draw('against', 'failed', true).host, 'accept')!.getAttribute('data-preselected')).toBe('true');
  });

  it('she pre-selects: only her pick with CONFIRM and DEFY; confirm does it, defy shows the rest', () => {
    const r = draw('against', 'passed', false, 'rule', true);
    expect([...r.host.querySelectorAll('.alius-askher-preselected button')].map((b) => b.textContent)).toEqual(['[ CONFIRM ]', '[ DEFY ]']);
    expect(act(r.host, 'carry')).toBeNull();
    r.host.querySelector<HTMLButtonElement>('[data-action="confirm-her"]')!.click();
    expect(r.onDrop).toHaveBeenCalled();
    const d = draw('against', 'passed', false, 'rule', true);
    d.host.querySelector<HTMLButtonElement>('[data-action="defy-her"]')!.click();
    expect(act(d.host, 'carry')).not.toBeNull();
  });

  it('no live holder: the panel is as it was', () => {
    const s = withService(world(reg, 'role'));
    s.relations[ANN].dynamic!.frame = 'equal';
    s.power = { votes: { open: vote('for', 'passed'), log: [], seq: 1 } };
    const host = h('div');
    document.body.append(host);
    renderVotePanel(host, vote('for', 'passed'), {}, { state: s, registries: reg, onCarry: vi.fn(), onDrop: vi.fn(), onOverrule: vi.fn() });
    expect(host.querySelector('[data-action="ask-her"]')).toBeNull();
    expect(host.querySelector('.alius-askher')).toBeNull();
  });
});

describe('the expedition event', () => {
  const fixed = { title: 'Ruin', setup: 'A door, half open.', options: [
    { label: 'Insult', effects: [{ type: 'unit_event', event: 'insulted', severity: 'moderate', targets: 'named' }] },
    { label: 'Praise', effects: [{ type: 'unit_event', event: 'praised', severity: 'moderate', targets: 'named' }] },
    { label: 'Walk on', effects: [] },
  ] };
  const own = (): Registries => ({ ...reg, dilemmaTemplates: new Map([...reg.dilemmaTemplates, ['t_ruin', { id: 't_ruin', fixed } as never]]) }) as never;

  /** Ann holds the commander (live) and is on the run; an event of the pack's own is pending. */
  function atEvent(holds = true, frame: 'role' | 'rule' = 'role', command = false): CampaignState {
    const base = withService(world(reg, frame));
    if (!holds) base.relations[ANN].dynamic!.frame = 'equal';
    if (command) dynamicOf(base, ANN)!.domains = [{ id: 'command', since: base.day }];
    dynamicOf(base, ANN)!.hold = frame === 'rule' ? 75 : 60;
    const { state, mission } = withMission(reg, base);
    const s = structuredClone(depart(reg, state, mission.id));
    if (!s.expedition!.party.includes(ANN)) s.expedition!.party = [ANN, ...s.expedition!.party.slice(1)];
    s.expedition!.phase = 'event';
    s.expedition!.pending = { kind: 'event', nodeId: 'n1', templateId: 't_ruin' };
    return s;
  }
  function screen(state: CampaignState, withAsk = true) {
    const host = h('div');
    document.body.append(host);
    const onAskHer = vi.fn();
    const controller = { choose: vi.fn(), move: vi.fn(), treat: vi.fn(), setFormation: vi.fn(), retreat: vi.fn(), return: vi.fn(), planning: vi.fn(() => null) } as unknown as ExpeditionController;
    renderExpeditionScreen(host, { getState: () => state, registries: own(), settings: () => DEFAULT_SETTINGS, controller, onClose: () => {}, ...(withAsk ? { onAskHer } : {}) });
    return { host, onAskHer, controller };
  }
  const options = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-option]')];

  it('nothing without a live holder or without the handler: the event is as it was, no chip', () => {
    expect(screen(atEvent(false)).host.querySelector('[data-action="ask-her"]')).toBeNull();
    expect(options(screen(atEvent(false)).host)).toHaveLength(3);
    expect(screen(atEvent(), false).host.querySelector('[data-action="ask-her"]')).toBeNull();
  });

  it('with a live holder the chip shows and asks for the node', () => {
    const { host, onAskHer } = screen(atEvent());
    const chip = host.querySelector<HTMLButtonElement>('[data-action="ask-her"]')!;
    expect(chip.getAttribute('data-analyze')).toBe('glossary:ask_her');
    chip.click();
    expect(onAskHer).toHaveBeenCalledWith('expedition', 'n1');
  });

  it('once she was asked her pick is marked and the others defy her', () => {
    const r = run(atEvent(), own(), { type: 'practice/ask_her', payload: { context: 'expedition', ref: 'n1' } });
    const s = r.state;
    const { host } = screen(s);
    expect(options(host).map((b) => b.getAttribute('data-preselected'))).toEqual([null, 'true', null]);
    expect(host.querySelectorAll('[data-defies]')).toHaveLength(2);
    expect(host.querySelector('[data-action="ask-her"]')).toBeNull();
  });

  it('she pre-selects: only her pick with CONFIRM and DEFY; confirm chooses it, defy shows the options', () => {
    const { host, controller } = screen(atEvent(true, 'rule', true));
    expect(options(host)).toHaveLength(0);
    host.querySelector<HTMLButtonElement>('[data-action="confirm-her"]')!.click();
    expect(controller.choose).toHaveBeenCalledWith(1);
    const d = screen(atEvent(true, 'rule', true));
    d.host.querySelector<HTMLButtonElement>('[data-action="defy-her"]')!.click();
    expect(options(d.host)).toHaveLength(3);
  });
});
