// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { ArcPathInfo } from '../../src/engine/arcs';
import { trustBand } from '../../src/engine/relations/bands';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderBaseTab } from '../../src/ui/base/baseTab';
import { renderInvTab } from '../../src/ui/inv/invTab';
import { createShell } from '../../src/ui/shell/shell';
import { renderStatusHeader } from '../../src/ui/shell/status';
import { renderSquadTab } from '../../src/ui/squad/squadTab';
import { campaign, loadCore } from '../helpers/world';
import { markedWithout, markerCount, unresolved } from '../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};

/** A campaign with a worn, affixed item, a spare item, an injured commander and a supply shortage. */
function world(): CampaignState {
  const s = campaign(reg, 4);
  s.resources = { credits: 500, supplies: 30, plyx: 120 };
  s.inventory.push(
    { uid: 'it_1', itemId: 'item_blade', rarity: 'refined', upgrade: 1, affixes: ['honed', 'keen'] },
    { uid: 'it_2', itemId: 'upper_light', rarity: 'standard', upgrade: 0, affixes: [] },
    { uid: 'it_3', itemId: 'item_smg', rarity: 'standard', upgrade: 0, affixes: ['calming'] },
  );
  Object.assign(s.squad[0].equipment, { weapon: 'it_1' });
  s.squad[0].stress = 63;
  s.commander.injuredUntilDay = s.day + 2;
  s.calendar.shortageStreak = 1;
  return s;
}

const ARC_PATHS: ArcPathInfo[] = (['cure', 'manage', 'embrace'] as const).map((path) => ({
  path, available: true, reason: null, wanted: path === 'manage', refuses: path === 'cure', cost: { credits: 5 }, text: `${path} text`,
}));

function squad(state: CampaignState, raw: boolean) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const host = mount();
  const settings = { ...getSettings(st), showRawValues: raw };
  renderSquadTab(host, {
    st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings,
    onNewCampaign: vi.fn(), onUnlock: vi.fn(), onRespec: vi.fn(), onSetLoadout: vi.fn(), onEquip: vi.fn(), onUnequip: vi.fn(),
    onLeash: vi.fn(), onArc: vi.fn(), arcPaths: () => ARC_PATHS, canTerminate: () => null,
  });
  return host;
}

function inv(state: CampaignState) {
  const host = mount();
  renderInvTab(host, { getState: () => state, registries: reg, onEquip: vi.fn(), onCraft: vi.fn(), onUpgrade: vi.fn(), onReroll: vi.fn(), onDismantle: vi.fn() });
  host.querySelector<HTMLElement>('[data-uid="it_1"]')!.click(); // select the worn blade: compare panel and workshop actions
  return host;
}

describe('coverage: header', () => {
  it('every marker has data-analyze, every address resolves, and the header is not vacuous', () => {
    const s = world();
    const host = mount();
    renderStatusHeader(host, s);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(5);
    // clock, three resources, Leash, injury and shortage
    const addresses = [...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze'));
    expect(addresses).toEqual(expect.arrayContaining([
      'glossary:slots', 'glossary:credits', 'glossary:supplies', 'glossary:plyx', 'glossary:leash', 'glossary:commander_injury', 'glossary:upkeep',
    ]));
  });

  it('the header text is unchanged', () => {
    const s = world();
    const host = mount();
    renderStatusHeader(host, s);
    expect(host.querySelector('.alius-resources')!.textContent).toBe('CR 500 · SUP 30 · PLYX 120');
    expect(host.querySelector('.alius-leash')!.textContent).toBe(`LEASH ${s.leash.authorizationsLeft}`);
    expect(host.textContent).toContain('INJURED 2d');
    expect(host.textContent).toContain('SHORTAGE 1d');
  });

  it('a header without a campaign has nothing to mark', () => {
    const host = mount();
    renderStatusHeader(host, null);
    expect(markerCount(host)).toBe(0);
  });
});

describe('coverage: SQUAD', () => {
  for (const raw of [false, true]) {
    it(`every marker has data-analyze and every address resolves (raw values ${raw ? 'on' : 'off'}, named unit and grunt)`, () => {
      const s = world();
      s.squad[1].kind = 'grunt';
      s.squad[1].designation = 'K-117';
      const host = squad(s, raw);
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(s, raw))).toEqual([]);
      expect(markerCount(host)).toBeGreaterThanOrEqual(25);
      const addresses = new Set([...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze')));
      for (const wanted of [
        'glossary:trust', 'glossary:affinity', 'glossary:attraction', 'glossary:loyalty_band', 'glossary:stress', 'glossary:level_xp',
        'glossary:skill_points', 'glossary:stat_hp', 'glossary:stat_crit', 'glossary:value_mercy', 'glossary:arc_cure', 'glossary:leash_compel',
        'glossary:leash_suppress', 'glossary:leash_terminate', 'roles:assault', 'items:item_blade', 'defects:echo_bleed', 'signatures:sig_last_stand',
      ]) expect(addresses.has(wanted), wanted).toBe(true);
      expect([...addresses].some((a) => a!.startsWith('relationshipStates:'))).toBe(true);
      expect([...addresses].some((a) => a!.startsWith('skills:'))).toBe(true);
    });
  }

  it('live chips carry the unit in their ctx', () => {
    const s = world();
    const host = squad(s, false);
    const trust = host.querySelector<HTMLElement>('[data-analyze="glossary:trust"]')!;
    expect(JSON.parse(trust.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: s.squad[0].id });
    expect(JSON.parse(host.querySelector('[data-analyze="glossary:stat_atk"]')!.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: s.squad[0].id });
  });

  it('the SQUAD stress chip shows a band and no number with raw values off', () => {
    const s = world();
    const off = squad(s, false);
    const chip = off.querySelector<HTMLElement>('.alius-stress [data-analyze="glossary:stress"]')!;
    expect(chip.textContent).toBe('STRESS STRAINED');
    expect(off.querySelector('.alius-stress')!.textContent).not.toMatch(/\d/);
    document.body.innerHTML = '';
    const on = squad(s, true);
    expect(on.querySelector('.alius-stress [data-analyze="glossary:stress"]')!.textContent).toBe('STRESS STRAINED (63)');
  });

  it('the existing unit text is unchanged', () => {
    const s = world();
    const host = squad(s, false);
    const unit = host.querySelector('article')!;
    const text = unit.textContent!;
    expect(text).toMatch(/TRUST [A-Z]+ · AFFINITY [A-Z]+ · ATTRACTION [A-Z]+/);
    expect(text).toContain('LOYALTY: ');
    expect(text).toMatch(/Assault · LVL 1/);
    expect(text).toMatch(/XP 0\/\d+ · SKILL POINTS \d+/);
    expect(text).toMatch(/HP \d+ · ATK \d+ · DEF \d+ · SPD \d+ · CRIT \d+%/);
    expect(text).toMatch(/PRAGMATISM: [A-Z]+ · AUTONOMY: [A-Z]+/);
    expect(unit.querySelector('.alius-values')!.children.length).toBe(6);
  });
});

describe('coverage: BASE', () => {
  it('every marker has data-analyze, every address resolves, and the tab is not vacuous', () => {
    const s = world();
    const host = mount();
    renderBaseTab(host, { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onUpgrade: vi.fn(), onRecruit: vi.fn(), onSetRoster: vi.fn() });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(6);
    const addresses = new Set([...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze')));
    expect(addresses.has('glossary:roster')).toBe(true);
    expect(addresses.has('glossary:grunt')).toBe(true);
    expect([...addresses].some((a) => a!.startsWith('facilities:'))).toBe(true);
    expect(host.querySelector('.alius-facility h3')!.textContent).toMatch(/^.+ — LEVEL \d\/\d$/);
  });
});

describe('coverage: INV', () => {
  it('every marker has data-analyze, every address resolves, and the tab is not vacuous', () => {
    const s = world();
    s.workshopSession = { day: s.day, opsLeft: 3 };
    const host = inv(s);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(markerCount(host)).toBeGreaterThanOrEqual(6);
    const addresses = new Set([...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze')));
    for (const wanted of ['glossary:credits', 'glossary:supplies', 'glossary:plyx', 'glossary:rarity', 'glossary:workshop', 'items:item_blade', 'affixes:honed', 'affixes:keen']) {
      expect(addresses.has(wanted), wanted).toBe(true);
    }
    expect([...addresses].some((a) => a!.startsWith('glossary:stat_'))).toBe(true);
    expect(host.querySelector('.alius-inv-res')!.textContent).toBe('CREDITS 500 · SUPPLIES 30 · PLYX 120');
  });
});

describe('coverage: end to end', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hovering a SQUAD trust chip in a real shell shows a reading with the band', () => {
    const s = world();
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    const shell = createShell({ st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), analyze: { registries: () => reg } });
    try {
      shell.registerTab('squad', (host) => renderSquadTab(host, {
        st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => getSettings(st), onNewCampaign: vi.fn(),
      }));
      shell.open();
      const chip = document.querySelector<HTMLElement>('#alius-shell [data-analyze="glossary:trust"]')!;
      chip.dispatchEvent(Object.assign(new Event('pointerover', { bubbles: true }), { pointerType: 'mouse', clientX: 30, clientY: 30 }));
      vi.advanceTimersByTime(250);
      const panel = document.querySelector('#alius-shell .alius-analyze')!;
      const band = trustBand(s.relations[s.squad[0].id].trust).toUpperCase();
      expect(panel.textContent).toContain('Trust');
      expect(panel.textContent).toContain('CURRENT READING');
      expect(panel.textContent).toContain(`${s.squad[0].displayName}: ${band}`);
    } finally {
      shell.destroy();
    }
  });
});
