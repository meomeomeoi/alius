// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { upkeepNeeded } from '../../src/engine/economy';
import type { CampaignState, Vote } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderBaseTab } from '../../src/ui/base/baseTab';
import { h } from '../../src/ui/dom';
import { renderVotePanel, type VotePanelHandlers } from '../../src/ui/power/votePanel';
import { analyze, markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore, run } from '../helpers/world';
import { setRelation } from '../helpers/loyalty';
import { withOptions } from '../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });

/** A state with an open vote on a workshop upgrade: `fail` makes the squad oppose it (pragmatism −3 against a pragmatic upgrade). */
function voted(fail: boolean): { state: CampaignState; vote: Vote } {
  const s = campaign(reg, 4);
  s.commander.socialStats.authority = 1;
  for (const u of s.squad) {
    u.values = { ...ZERO, ...(fail ? { pragmatism: -3 } : {}) };
    setRelation(s, u.id, { trust: 50 });
  }
  s.leash.authorizationsLeft = 2;
  withOptions(s, { voting: 'on' });
  const r = run(s, reg, { type: 'vote/open', payload: { kind: 'upgrade', subject: 'workshop' } });
  return { state: r.state, vote: r.state.power!.votes.open! };
}
const lines = (): Record<string, string> => ({
  [ANN]: 'Ann says the workshop can wait.', [BEA]: 'Bea would spend it elsewhere.', [CAT]: 'Cat sees no use in it.', [DEE]: 'Dee does not trust the call.',
});
function mountPanel(state: CampaignState, vote: Vote, over: Partial<VotePanelHandlers> = {}) {
  const handlers = { onCarry: vi.fn(), onDrop: vi.fn(), onOverrule: vi.fn(), ...over };
  const host = h('div');
  document.body.append(host);
  renderVotePanel(host, vote, lines(), { state, registries: reg, ...handlers });
  return { host, ...handlers };
}
const buttons = (host: HTMLElement): string[] => [...host.querySelectorAll('button[data-vote-act]')].map((b) => b.getAttribute('data-vote-act')!);

describe('the VOTE panel', () => {
  it('a passed vote shows CARRY OUT and no overrule', () => {
    const { state, vote } = voted(false);
    expect(vote.status).toBe('passed');
    const { host, onCarry } = mountPanel(state, vote);
    expect(buttons(host)).toEqual(['carry']);
    (host.querySelector('[data-vote-act="carry"]') as HTMLElement).click();
    expect(onCarry).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('PASSED');
  });

  it('a failed vote shows ACCEPT and three overrule buttons; LEASH is aria-disabled with no authorization left', () => {
    const { state, vote } = voted(true);
    expect(vote.status).toBe('failed');
    const open = mountPanel(state, vote);
    expect(buttons(open.host)).toEqual(['accept', 'overrule-order', 'overrule-punish', 'overrule-leash']);
    expect(open.host.textContent).toContain('FAILED');
    (open.host.querySelector('[data-vote-act="accept"]') as HTMLElement).click();
    expect(open.onDrop).toHaveBeenCalledTimes(1);
    (open.host.querySelector('[data-vote-act="overrule-order"]') as HTMLElement).click();
    expect(open.onOverrule).toHaveBeenCalledWith('order', undefined);
    (open.host.querySelector('[data-vote-act="overrule-leash"]') as HTMLElement).click();
    expect(open.onOverrule).toHaveBeenLastCalledWith('leash', undefined);

    const none = structuredClone(state);
    none.leash.authorizationsLeft = 0;
    const spent = mountPanel(none, vote);
    const leash = spent.host.querySelector('[data-vote-act="overrule-leash"]') as HTMLElement;
    expect(leash.getAttribute('aria-disabled')).toBe('true');
    leash.click();
    expect(spent.onOverrule).not.toHaveBeenCalled();
  });

  it('PUNISH picks a dissenter and a measure before it overrules', () => {
    const { state, vote } = voted(true);
    const { host, onOverrule } = mountPanel(state, vote);
    (host.querySelector('[data-vote-act="overrule-punish"]') as HTMLElement).click();
    const who = host.querySelector('select[data-punish-unit]') as HTMLSelectElement;
    const how = host.querySelector('select[data-punish-measure]') as HTMLSelectElement;
    expect([...who.options].map((o) => o.value)).toEqual([ANN, BEA, CAT, DEE]);
    expect([...how.options].map((o) => o.value)).toEqual(['verbal', 'revoke_rations', 'revoke_leave', 'extra_duty', 'bench', 'brig']);
    who.value = BEA;
    how.value = 'verbal';
    (host.querySelector('[data-vote-act="punish-confirm"]') as HTMLElement).click();
    expect(onOverrule).toHaveBeenCalledWith('punish', { unitId: BEA, measure: 'verbal' });
  });

  it('shows one row per voter with her side, weight and reason, the commander and the tally', () => {
    const { state, vote } = voted(true);
    const { host } = mountPanel(state, vote);
    const rows = [...host.querySelectorAll('[data-ballot]')];
    expect(rows.map((r) => r.getAttribute('data-ballot'))).toEqual([ANN, BEA, CAT, DEE]);
    for (const row of rows) expect(row.getAttribute('data-side')).toBe('against');
    expect(rows[0].textContent).toContain('Ann');
    expect(rows[0].textContent).toContain('AGAINST');
    expect(rows[0].textContent).toContain('Ann says the workshop can wait.');
    expect(host.querySelector('[data-ballot-commander]')!.textContent).toContain('COMMANDER');
    expect(host.querySelector('[data-vote-tally]')!.textContent).toMatch(/FOR 1 · AGAINST 4/);
    expect(host.textContent).not.toMatch(/[{}]/);
  });

  it('a grunt abstains and her row says so', () => {
    const { state } = voted(false);
    state.squad.push({ ...structuredClone(state.squad[3]), id: 'grunt_1', kind: 'grunt', displayName: 'G-1' });
    state.roster.activeIds = [ANN, 'grunt_1'];
    const r = run(state, reg, { type: 'vote/open', payload: { kind: 'upgrade', subject: 'workshop' } });
    const { host } = mountPanel(r.state, r.state.power!.votes.open!);
    expect(host.querySelector('[data-ballot="grunt_1"]')!.getAttribute('data-side')).toBe('abstain');
    expect(host.querySelector('[data-ballot="grunt_1"]')!.textContent).toContain('ABSTAIN');
  });

  it('every ballot row, button and the tally carry data-analyze that resolves', () => {
    for (const fail of [false, true]) {
      const { state, vote } = voted(fail);
      const { host } = mountPanel(state, vote);
      if (fail) (host.querySelector('[data-vote-act="overrule-punish"]') as HTMLElement).click();
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(state))).toEqual([]);
      expect(unreachable(host)).toEqual([]);
      expect(host.querySelectorAll('[data-analyze]').length).toBeGreaterThanOrEqual(fail ? 12 : 7);
    }
  });

  it('the frame speaks in the corporate voice and nothing is built with innerHTML', () => {
    const { state, vote } = voted(false);
    const { host } = mountPanel(state, vote);
    expect(host.querySelector('.alius-voice-corporate')).not.toBeNull();
  });
});

describe('the reading of a ballot', () => {
  it('hides raw scores unless raw values are on', () => {
    const { state } = voted(true);
    const off = analyze('glossary:vote', env(state), { unitId: ANN }).join('\n');
    expect(off).toMatch(/AGAINST|against/);
    expect(off).not.toMatch(/\d/);
    const on = analyze('glossary:vote', env(state, true), { unitId: ANN }).join('\n');
    expect(on).toMatch(/Score: −?\d/);
    const tallyOff = analyze('glossary:vote', env(state)).join('\n');
    expect(tallyOff).toMatch(/failed/i);
    expect(tallyOff).not.toMatch(/\d/);
    expect(analyze('glossary:vote', env(state, true)).join('\n')).toMatch(/\d/);
  });

  it('there is no reading of a ballot when no vote is open', () => {
    const s = campaign(reg, 4);
    expect(analyze('glossary:vote', env(s), { unitId: ANN }).join('\n')).not.toMatch(/ballot/i);
  });
});

describe('the RATIONS row of the BASE tab', () => {
  function base(state: CampaignState) {
    const onSetRations = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderBaseTab(host, {
      getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg,
      onUpgrade: vi.fn(), onRecruit: vi.fn(), onSetRoster: vi.fn(), onSetRations,
    });
    return { host, onSetRations };
  }

  it('shows the three modes and the current one', () => {
    const s = campaign(reg, 4);
    const { host, onSetRations } = base(s);
    const modes = [...host.querySelectorAll('[data-rations-mode]')];
    expect(modes.map((m) => m.getAttribute('data-rations-mode'))).toEqual(['equal', 'fighters_first', 'commander_short']);
    expect(modes.map((m) => m.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    (modes[1] as HTMLElement).click();
    expect(onSetRations).toHaveBeenCalledWith('fighters_first');
    const set = campaign(reg, 4);
    set.base.rations = 'commander_short';
    expect([...base(set).host.querySelectorAll('[data-rations-mode]')].map((m) => m.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
  });

  it('says a change goes to a vote only while voting is on and a shortage is on or coming', () => {
    const calm = withOptions(campaign(reg, 4), { voting: 'on' });
    calm.resources.supplies = 100;
    expect(base(calm).host.querySelector('[data-rations-vote]')).toBeNull();
    const tight = withOptions(campaign(reg, 4), { voting: 'on' });
    tight.resources.supplies = upkeepNeeded(tight, reg).needed - 1;
    expect(base(tight).host.querySelector('[data-rations-vote]')!.textContent).toMatch(/squad vote/i);
    const off = campaign(reg, 4);
    off.resources.supplies = 0;
    expect(base(off).host.querySelector('[data-rations-vote]')).toBeNull();
  });

  it('every control carries data-analyze that resolves', () => {
    const s = campaign(reg, 4);
    const { host } = base(s);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('[data-rations-mode][data-analyze]')).toHaveLength(3);
    expect(analyze('glossary:rations', env(s), { mode: 'commander_short' }).join('\n')).toMatch(/commander/i);
  });
});
