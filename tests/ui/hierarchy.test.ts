// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderLogTab } from '../../src/ui/log/logTab';
import { drawCountermandChips } from '../../src/ui/power/chips';
import { renderHierarchyBlock, standingBand } from '../../src/ui/power/hierarchy';
import { renderSquadTab } from '../../src/ui/squad/squadTab';
import { analyze, markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore, run } from '../helpers/loyalty';
import { withLeader } from '../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};
const led = (opts: { endorsed?: boolean } = {}): CampaignState => withLeader(campaign(reg, 4), ANN, opts);
const block = (state: CampaignState, unitId: string, over: Partial<Parameters<typeof renderHierarchyBlock>[4]> = {}, raw = false) => {
  const host = mount();
  const handlers = { onEndorse: vi.fn(), onChallenge: vi.fn(), ...over };
  renderHierarchyBlock(host, state, reg, unitId, handlers, { raw });
  return { host, ...handlers };
};

describe('the hierarchy block of the dossier', () => {
  it('shows STANDING as a band and the LEADER badge on the leader only', () => {
    const s = led();
    const a = block(s, ANN).host;
    const b = block(s, BEA).host;
    expect(a.querySelector('[data-standing]')!.textContent).toMatch(/^STANDING: (LOW|NOTABLE|DOMINANT)$/);
    expect(a.querySelector('[data-leader-badge]')!.textContent).toBe('SQUAD LEADER');
    expect(b.querySelector('[data-standing]')!.textContent).toMatch(/^STANDING: (LOW|NOTABLE|DOMINANT)$/);
    expect(b.querySelector('[data-leader-badge]')).toBeNull();
    expect(block(led({ endorsed: true }), ANN).host.querySelector('[data-leader-badge]')!.textContent).toBe('SECOND-IN-COMMAND');
  });

  it('the band words: low under 40, notable under 70, dominant from 70; the number only with raw values on', () => {
    expect([0, 39, 40, 69, 70, 120].map(standingBand)).toEqual(['low', 'low', 'notable', 'notable', 'dominant', 'dominant']);
    const s = led();
    expect(block(s, BEA).host.querySelector('[data-standing]')!.textContent).not.toMatch(/\d/);
    expect(block(s, BEA, {}, true).host.querySelector('[data-standing]')!.textContent).toMatch(/\(\d+\)/);
  });

  it('a grunt, a unit out of service and a squad with no named unit get nothing', () => {
    const s = led();
    s.squad.push({ ...structuredClone(s.squad[3]), id: 'grunt_1', kind: 'grunt', displayName: 'G-1' });
    expect(block(s, 'grunt_1').host.childElementCount).toBe(0);
    s.squad.find((u) => u.id === BEA)!.status = 'dead';
    expect(block(s, BEA).host.childElementCount).toBe(0);
    expect(block(s, 'unit_ghost').host.childElementCount).toBe(0);
  });

  it('ENDORSE and CHALLENGE show only on the leader; ENDORSE goes once endorsed', () => {
    const s = led();
    const a = block(s, ANN);
    expect(a.host.querySelector('[data-power-act="endorse"]')).not.toBeNull();
    expect(a.host.querySelector('[data-power-act="challenge"]')).not.toBeNull();
    (a.host.querySelector('[data-power-act="endorse"]') as HTMLElement).click();
    expect(a.onEndorse).toHaveBeenCalledTimes(1);
    const b = block(s, BEA).host;
    expect(b.querySelector('[data-power-act]')).toBeNull();
    const e = block(led({ endorsed: true }), ANN).host;
    expect(e.querySelector('[data-power-act="endorse"]')).toBeNull();
    expect(e.querySelector('[data-power-act="challenge"]')).not.toBeNull();
  });

  it("CHALLENGE opens a stat picker with each stat's chance in words, and picking one challenges", () => {
    const s = led();
    const { host, onChallenge } = block(s, ANN);
    (host.querySelector('[data-power-act="challenge"]') as HTMLElement).click();
    const stats = [...host.querySelectorAll('[data-challenge-stat]')].map((b) => b.getAttribute('data-challenge-stat'));
    expect(stats).toEqual(['authority', 'empathy', 'strength', 'endurance', 'reflexes']);
    for (const b of host.querySelectorAll('[data-challenge-stat]')) expect(b.textContent).toMatch(/UNLIKELY|EVEN|LIKELY/);
    expect(host.querySelector('[data-challenge-stat]')!.textContent).not.toMatch(/\d/);
    (host.querySelector('[data-challenge-stat="strength"]') as HTMLElement).click();
    expect(onChallenge).toHaveBeenCalledWith('strength');
    const raw = block(s, ANN, {}, true).host;
    (raw.querySelector('[data-power-act="challenge"]') as HTMLElement).click();
    expect(raw.querySelector('[data-challenge-stat="authority"]')!.textContent).toMatch(/\d+ ?%/);
  });

  it('CHALLENGE is aria-disabled in the cooldown with the days left', () => {
    const s = led();
    s.power!.hierarchy!.challengeCooldownUntil = s.day + 9;
    const { host, onChallenge } = block(s, ANN);
    const button = host.querySelector('[data-power-act="challenge"]') as HTMLElement;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('title')).toMatch(/9 days/);
    button.click();
    expect(host.querySelector('[data-challenge-stat]')).toBeNull();
    expect(onChallenge).not.toHaveBeenCalled();
    expect(host.textContent).toMatch(/9 DAYS/);
  });

  it('is part of the SQUAD dossier of a named unit', () => {
    const s = led();
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = mount();
    renderSquadTab(host, {
      st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => getSettings(st), onNewCampaign: vi.fn(),
      onEndorse: vi.fn(), onChallenge: vi.fn(),
    });
    expect(host.querySelectorAll('[data-standing]').length).toBe(4);
    expect(host.querySelectorAll('[data-leader-badge]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-power-act="endorse"]')).toHaveLength(1);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });

  it('every control carries data-analyze that resolves and can be reached', () => {
    const s = led();
    const { host } = block(s, ANN);
    (host.querySelector('[data-power-act="challenge"]') as HTMLElement).click();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('[data-analyze]').length).toBeGreaterThanOrEqual(9);
  });
});

describe('the countermand chips', () => {
  const held = (): CampaignState => {
    const s = led();
    s.power!.countermand = { leaderId: ANN, unitId: BEA, payload: { activityId: 'train', companionId: BEA }, day: s.day, slot: s.slot };
    return s;
  };

  it('call power/countermand: ACCEPT and OVERRULE', () => {
    const s = held();
    const host = mount();
    const onAnswer = vi.fn();
    drawCountermandChips(host, s, reg, onAnswer);
    expect(host.textContent).toContain('Ann');
    expect(host.textContent).toContain('Bea');
    expect(host.textContent).toContain('Train');
    (host.querySelector('[data-countermand="accept"]') as HTMLElement).click();
    (host.querySelector('[data-countermand="overrule"]') as HTMLElement).click();
    expect(onAnswer.mock.calls).toEqual([['accept'], ['overrule']]);
  });

  it('show nothing without an open countermand or once the slot has passed', () => {
    const none = mount();
    drawCountermandChips(none, led(), reg, vi.fn());
    expect(none.childElementCount).toBe(0);
    const stale = held();
    stale.slot = stale.slot === 'morning' ? 'afternoon' : 'morning';
    const host = mount();
    drawCountermandChips(host, stale, reg, vi.fn());
    expect(host.childElementCount).toBe(0);
  });

  it('every chip carries data-analyze that resolves', () => {
    const s = held();
    const host = mount();
    drawCountermandChips(host, s, reg, vi.fn());
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('redrawing replaces the chips', () => {
    const s = held();
    const host = mount();
    drawCountermandChips(host, s, reg, vi.fn());
    drawCountermandChips(host, s, reg, vi.fn());
    expect(host.querySelectorAll('[data-countermand="accept"]')).toHaveLength(1);
  });
});

describe('the oversight log', () => {
  it('the voice card shows CC: {Name} for a request copied to the leader', () => {
    const s = led();
    s.leash.log = [
      { no: 1, unitId: BEA, kind: 'compel', day: 2, context: 'scene', outcome: 'done', cc: ANN },
      { no: 2, unitId: BEA, kind: 'compel', day: 3, context: 'scene', outcome: 'done' },
    ];
    const host = mount();
    renderLogTab(host, { getState: () => s });
    const entries = [...host.querySelectorAll('.alius-oversight-entry')];
    expect(entries.find((e) => e.getAttribute('data-no') === '1')!.textContent).toContain('CC: Ann');
    expect(entries.find((e) => e.getAttribute('data-no') === '2')!.textContent).not.toContain('CC:');
    expect(host.querySelector('.alius-oversight-log')!.classList.contains('alius-voice-corporate')).toBe(true);
  });
});

describe('the readings', () => {
  it('standing reads as a band and the leader; raw values add the number', () => {
    const s = led();
    const off = analyze('glossary:standing', env(s), { unitId: ANN }).join('\n');
    expect(off).toMatch(/low|notable|dominant/i);
    expect(off).toMatch(/squad leader/i);
    expect(off).not.toMatch(/\d/);
    expect(analyze('glossary:standing', env(s, true), { unitId: ANN }).join('\n')).toMatch(/Standing: \d+/);
    expect(analyze('glossary:standing', env(s), { unitId: 'unit_ghost' })).toEqual([]);
  });

  it('the leader, outside perception and the challenge read in words; days only with raw values', () => {
    const s = led();
    s.power!.hierarchy!.outsideSuppressedUntil = s.day + 6;
    const leader = analyze('glossary:squad_leader', env(s)).join('\n');
    expect(leader).toContain('Ann');
    expect(leader).not.toMatch(/\d/);
    const outside = analyze('glossary:outside_perception', env(s)).join('\n');
    expect(outside).toMatch(/held back|suppressed|feat/i);
    expect(outside).not.toMatch(/\d/);
    expect(analyze('glossary:outside_perception', env(s, true)).join('\n')).toMatch(/6 days/);
    const ch = analyze('glossary:challenge', env(s), { stat: 'authority' }).join('\n');
    expect(ch).toMatch(/unlikely|even|likely/i);
    expect(ch).not.toMatch(/\d/);
    expect(analyze('glossary:challenge', env(s, true), { stat: 'authority' }).join('\n')).toMatch(/\d+ ?%/);
    const none = campaign(reg, 4);
    expect(analyze('glossary:squad_leader', env(none)).join('\n')).toMatch(/no one|nobody|no leader/i);
  });

  it('a countermand reads who made it', () => {
    const s = led();
    s.power!.countermand = { leaderId: ANN, unitId: BEA, payload: { activityId: 'train', companionId: BEA }, day: s.day, slot: s.slot };
    expect(analyze('glossary:countermand', env(s)).join('\n')).toContain('Ann');
    expect(run(s, reg, { type: 'power/countermand', payload: { answer: 'accept' } }).state.power!.countermand).toBeUndefined();
  });
});
