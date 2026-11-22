// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { blankPractices, type Task } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { drawInitiativeChips, type InitiativeHandlers } from '../../../src/ui/practice/initiativeChips';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore } from '../../helpers/world';
import { ANN, BEA, holderBond, unitOf, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

function holder(): CampaignState {
  const s = withService(world(reg, 'play'));
  unitOf(s, ANN).bond!.practice!.style = { primary: 'ritual' };
  return s;
}
function draw(s: CampaignState, over: { pick?: (id: string) => boolean } = {}) {
  const host = h('div');
  document.body.append(host);
  const handlers = { onAsk: vi.fn(), onConfess: vi.fn(), onAskPermission: vi.fn() } satisfies InitiativeHandlers;
  drawInitiativeChips(host, { state: s, reg, pick: over.pick ?? (() => true), ...handlers });
  return { host, ...handlers };
}
const chip = (host: HTMLElement, action: string, unit?: string) => host.querySelector<HTMLButtonElement>(`[data-action="${action}"]${unit !== undefined ? `[data-unit="${unit}"]` : ''}`);
const routine = (s: CampaignState): Task => ({
  id: 'pt9', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'AUTHOR TO WRITE: Her mornings.', summary: 'her morning routine',
  status: 'open', routine: true, acceptForm: 'button', day: s.day, answeredDay: s.day,
});

describe('ASK FOR A TASK and ASK FOR PUNISHMENT', () => {
  it('show for a holder, and for an eligible unit at equal; not for a woman who could not hold and holds nothing', () => {
    const own = draw(holder());
    expect(chip(own.host, 'ask-task')!.textContent).toBe('[ ASK FOR A TASK ]');
    expect(chip(own.host, 'ask-punishment')!.textContent).toBe('[ ASK FOR PUNISHMENT ]');
    const eligible = world(reg, 'equal');
    delete eligible.relations[ANN].dynamic;
    expect(chip(draw(eligible).host, 'ask-task')).not.toBeNull();
    const never = world(reg, 'equal');
    delete never.relations[ANN].dynamic;
    unitOf(never, ANN).bond!.practice!.inclination = 'none';
    expect(draw(never).host.querySelector('[data-action^="ask-"]')).toBeNull();
    expect(draw(holder(), { pick: () => false }).host.children).toHaveLength(0);
  });

  it('press calls the handler with her id and what is asked; with several women each chip carries her name', () => {
    const s = holder();
    unitOf(s, BEA).bond = holderBond();
    dynamicOf(s, ANN)!.domains = [{ id: 'others', since: s.day }]; // she lets the commander turn to others
    const d = draw(s);
    expect(chip(d.host, 'ask-task', ANN)!.textContent).toBe('[ ASK FOR A TASK > ANN ]');
    chip(d.host, 'ask-task', BEA)!.click();
    expect(d.onAsk).toHaveBeenCalledWith(BEA, 'task');
    chip(d.host, 'ask-punishment', ANN)!.click();
    expect(d.onAsk).toHaveBeenLastCalledWith(ANN, 'punishment');
  });

  it('a chip the engine would refuse is aria-disabled with the reason and sends nothing', () => {
    const s = holder();
    s.practices = { ...blankPractices(), askedOn: { [ANN]: s.day } };
    const d = draw(s);
    const c = chip(d.host, 'ask-task')!;
    expect(c.getAttribute('aria-disabled')).toBe('true');
    expect(c.title).toMatch(/already/i);
    c.click();
    expect(d.onAsk).not.toHaveBeenCalled();
  });

  it('nothing while the dynamic is off', () => {
    const s = holder();
    delete s.dynamic;
    expect(draw(s).host.children).toHaveLength(0);
  });
});

describe('I DIDN’T', () => {
  it('shows for an open routine of a present holder, tells the routine and sends its id; not for a routine told today or a plain task', () => {
    const s = holder();
    s.practices = { ...blankPractices(), tasks: [routine(s)] };
    const d = draw(s);
    const c = chip(d.host, 'confess')!;
    expect(c.textContent).toBe("[ I DIDN'T ]");
    expect(c.getAttribute('data-task')).toBe('pt9');
    c.click();
    expect(d.onConfess).toHaveBeenCalledWith('pt9');
    const told = holder();
    told.practices = { ...blankPractices(), tasks: [{ ...routine(told), brokenDay: told.day }] };
    expect(chip(draw(told).host, 'confess')).toBeNull();
    const plain = holder();
    plain.practices = { ...blankPractices(), tasks: [{ ...routine(plain), routine: undefined }] };
    expect(chip(draw(plain).host, 'confess')).toBeNull();
    expect(chip(draw(s, { pick: () => false }).host, 'confess')).toBeNull();
  });
});

describe('ASK PERMISSION and her answer line', () => {
  const ruled = (): CampaignState => {
    const s = holder();
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'ask_permission', text: 'Ask me first.', status: 'active', day: s.day, brokenCount: 0, delivered: true }] };
    return s;
  };

  it('shows while a permission rule of hers is active and sends her id', () => {
    expect(chip(draw(holder()).host, 'ask-permission')).toBeNull();
    const d = draw(ruled());
    expect(chip(d.host, 'ask-permission')!.textContent).toBe('[ ASK PERMISSION ]');
    chip(d.host, 'ask-permission')!.click();
    expect(d.onAskPermission).toHaveBeenCalledWith(ANN);
  });

  it('once answered her answer is a line in her voice under the chip, by the answer; nothing before it is asked', () => {
    expect(draw(ruled()).host.querySelector('[data-permission-answer]')).toBeNull();
    for (const answer of ['grant', 'deny', 'wait', 'earn'] as const) {
      const s = ruled();
      s.practices = { ...blankPractices(), permission: { holderId: ANN, ruleId: 'r1', asked: { day: s.day, answer, ...(answer === 'wait' ? { untilDay: s.day + 1 } : {}) } } };
      const line = draw(s).host.querySelector('[data-permission-answer]')!;
      expect(line.getAttribute('data-permission-answer'), answer).toBe(answer);
      expect(line.textContent).not.toMatch(/AUTHOR TO WRITE/);
      expect(line.textContent).not.toMatch(/\d/);
      expect(line.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
      expect(line.textContent!.length).toBeGreaterThan(0);
    }
    // an answer of an earlier day is not shown
    const old = ruled();
    old.practices = { ...blankPractices(), permission: { holderId: ANN, ruleId: 'r1', asked: { day: old.day - 2, answer: 'grant' } } };
    expect(draw(old).host.querySelector('[data-permission-answer]')).toBeNull();
    expect(TUNING.practice.permission.lines.grant).toBeTruthy();
  });
});

describe('analysis (P7a)', () => {
  it('every chip and the answer line carry data-analyze and resolve; the chips are reachable', () => {
    const s = ruled();
    function ruled(): CampaignState {
      const x = holder();
      x.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'ask_permission', text: 'Ask me first.', status: 'active', day: x.day, brokenCount: 0, delivered: true }] };
      x.practices = { ...blankPractices(), tasks: [routine(x)], permission: { holderId: ANN, ruleId: 'r1', asked: { day: x.day, answer: 'wait', untilDay: x.day + 1 } } };
      return x;
    }
    const { host } = draw(s);
    const addresses = [...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze'));
    expect(addresses).toEqual(expect.arrayContaining(['glossary:ask_for_task', 'glossary:ask_for_punishment', 'glossary:confess', 'glossary:ask_permission']));
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(dynamicOf(s, ANN)).toBeDefined();
  });
});
