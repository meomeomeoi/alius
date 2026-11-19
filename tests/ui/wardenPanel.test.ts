// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { wardenOf } from '../../src/engine/warden';
import { h } from '../../src/ui/dom';
import { renderWardenPanel, satisfactionBand, weightBand } from '../../src/ui/warden/wardenPanel';
import { wardenNotice } from '../../src/ui/warden/notices';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

function swap(): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 4 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  const w = wardenOf(out.state)!;
  w.expectations = [
    { id: 'x1', kind: 'meet_quota', weight: 0.5, source: 'corporate', known: true },
    { id: 'x2', kind: 'protect_squad', weight: 0.2, source: 'values', known: false },
    { id: 'x3', kind: 'personal', weight: 0.3, source: 'card', known: false, text: 'SECRET_WORDS_OF_HERS' },
  ];
  w.satisfaction = 43;
  w.defiance = 55;
  w.warnings = [{ level: 1, day: 2 }];
  w.restrictions = [{ what: 'no_dms', untilDay: out.state.day + 1 }];
  w.punishLog = [{ punishmentId: 'reprimand', day: 2, severity: 1 }];
  return out.state;
}
const draw = (s: CampaignState, deps = {}) => {
  const host = h('div');
  document.body.append(host);
  renderWardenPanel(host, s, reg, deps);
  return host;
};

describe('the WARDEN panel', () => {
  it('shows her, a satisfaction band, the defiance meter with its marks and the warnings', () => {
    const host = draw(swap());
    expect(host.textContent).toContain('BEA holds the controller.');
    expect(host.textContent).toContain('SATISFACTION: WARY');
    expect(host.textContent).not.toContain('43');
    const meter = host.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-valuenow')).toBe('55');
    expect(meter.querySelectorAll('.alius-defiance-mark')).toHaveLength(2);
    expect(host.textContent).toContain('WARNING — day 2');
  });

  it('shows the active restrictions, the Leash left and the punishment log', () => {
    const host = draw(swap());
    expect(host.querySelector('[data-restriction="no_dms"]')!.textContent).toMatch(/NO MESSAGES until day/);
    expect(host.textContent).toContain('AUTHORIZATIONS LEFT: 2');
    expect(host.textContent).toMatch(/Day 2: Reprimand/);
  });

  it('an unknown expectation renders only as ? (neither its kind, its text nor its weight is in the page)', () => {
    const s = swap();
    const host = draw(s);
    expect(host.querySelectorAll('.alius-unknown')).toHaveLength(2);
    for (const el of host.querySelectorAll('.alius-unknown')) expect(el.textContent).toBe('? UNKNOWN EXPECTATION');
    expect(host.innerHTML).not.toContain('SECRET_WORDS_OF_HERS');
    expect(host.innerHTML).not.toMatch(/protect_squad|Protect the squad/i);
    expect(host.innerHTML).not.toMatch(/x2|x3/);
    // the one she has shown reads label and weight band
    expect(host.textContent).toContain('Meet the quota — HIGH');
    // learning one moves it from ? to its words
    wardenOf(s)!.expectations[2].known = true;
    const again = draw(s);
    expect(again.textContent).toContain('SECRET_WORDS_OF_HERS');
    expect(again.querySelectorAll('.alius-unknown')).toHaveLength(1);
  });

  it('numbers appear only with raw values on', () => {
    const raw = draw(swap(), { showRaw: true });
    expect(raw.textContent).toContain('(43)');
  });

  it('every marked element has data-analyze that resolves and can be reached by keyboard', () => {
    const host = draw(swap());
    expect(markedWithout(host)).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: swap(), settings: DEFAULT_SETTINGS })).toEqual([]);
  });

  it('draws nothing without a warden in service; no pronoun for the commander', () => {
    const s = swap();
    expect(draw(s).textContent).not.toMatch(/\b(he|him|his)\b/i);
    s.leashswap!.status = 'investigation';
    expect(draw(s).querySelector('.alius-warden-panel')).toBeNull();
  });

  it('the bands', () => {
    expect([0, 25, 50, 70, 95].map(satisfactionBand)).toEqual(['HOSTILE', 'COLD', 'WARY', 'SATISFIED', 'PLEASED']);
    expect([0.1, 0.25, 0.5].map(weightBand)).toEqual(['LOW', 'MEDIUM', 'HIGH']);
  });
});

describe('notices', () => {
  it('a warning, a punishment, the Leash and a denial have corporate notices with no commander pronoun and no number', () => {
    const s = swap();
    const events = [
      { type: 'warden_warning', level: 1 }, { type: 'warden_warning', level: 2 }, { type: 'commander_punished', punishmentId: 'reprimand' },
      { type: 'commander_leashed', kind: 'compel' }, { type: 'commander_leashed', kind: 'suppress' }, { type: 'leash_cosign_denied', unitId: 'unit_ann', kind: 'compel' },
      { type: 'commander_terminated' },
    ];
    for (const e of events) {
      const n = wardenNotice(e, s, reg)!;
      expect(n, e.type).not.toBeNull();
      expect(n.text).not.toMatch(/\b(he|him|his)\b/i);
      expect(n.text).not.toMatch(/\d/);
    }
    expect(wardenNotice({ type: 'warden_warning', level: 2 }, s, reg)!.title).toBe('FINAL WARNING');
    expect(wardenNotice({ type: 'activity_done' }, s, reg)).toBeNull();
  });
});
