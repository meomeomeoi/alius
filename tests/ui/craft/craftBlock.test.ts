// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetKnowledgeRules } from '../../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { CRAFT_WORDS } from '../../../src/engine/craft/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { renderCmdrCard } from '../../../src/ui/commander/cmdrCard';
import { recordLine } from '../../../src/ui/craft/craftBlock';
import { h } from '../../../src/ui/dom';
import { hiddenFixture } from '../../fixtures/analyze/hidden';
import { leaks } from '../../helpers/analyze';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; resetKnowledgeRules(); });

const ANN = 'unit_ann';
const env = (state: CampaignState, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
function card(state: CampaignState, raw = false): HTMLElement {
  const host = h('div');
  document.body.append(host);
  renderCmdrCard(host, { state, registries: reg, raw });
  return host;
}
const craftOf = (host: HTMLElement): HTMLElement => host.querySelector('[data-craft]')!;
const chips = (host: HTMLElement): Record<string, string> => Object.fromEntries([...host.querySelectorAll('[data-craft-discipline]')].map((e) => [e.getAttribute('data-craft-discipline')!, e.textContent!]));

describe('CMDR › CRAFT', () => {
  it('with no craft every discipline is untrained, and no woman has a line', () => {
    const s = campaign(reg, 3);
    const host = card(s);
    const c = chips(host);
    expect(Object.keys(c)).toEqual(['stillness', 'posture', 'rhythm', 'memory', 'composure', 'speech', 'pain', 'endurance:saturation', 'endurance:gulp']); // HOLDS keeps breath, weight and jaw; depth waits for its game
    for (const text of Object.values(c)) expect(text).toMatch(/UNTRAINED$/);
    expect(host.querySelector('[data-craft-pair]')).toBeNull();
    expect(host.querySelector('[data-commander-holds]')!.textContent).toBe('HOLDS — BREATH: UNTRAINED · WEIGHT: UNTRAINED · JAW: UNTRAINED');
    expect(craftOf(host).textContent).not.toMatch(/\d/);
    expect(s.commander.craft).toBeUndefined();
  });

  it('the words follow the levels, for the endurance of a physics too', () => {
    const s = campaign(reg, 3);
    s.commander.craft = { stillness: { xp: 30, level: 1, lastDay: 1 }, posture: { xp: 150, level: 3, lastDay: 1 }, pain: { xp: 400, level: 5, lastDay: 1 } };
    s.commander.endurance = { saturation: { xp: 80, level: 2 } };
    const c = chips(card(s));
    expect(c.stillness).toBe('STILLNESS: RAW');
    expect(c.posture).toBe('POSTURE: STEADY');
    expect(c.pain).toBe('PAIN: MASTERFUL');
    expect(c['endurance:saturation']).toBe('SATURATION: PRACTISED');
    expect(CRAFT_WORDS).toHaveLength(6);
    expect(c.rhythm).toBe('RHYTHM: UNTRAINED');
  });

  it('depth is listed once it has been written', () => {
    const s = campaign(reg, 3);
    s.commander.craft = { depth: { xp: 30, level: 1, lastDay: 1 } };
    expect(chips(card(s)).depth).toBe('DEPTH: RAW');
  });

  it('records are in fiction time, in her hand, as margin lines; her rhythm and what she has named are words', () => {
    const s = campaign(reg, 3);
    s.relations[ANN].craft = {
      rhythm: { xp: 90, day: 12 }, postures: { kneeling_upright: { xp: 40, day: 12 }, sitting: { xp: 40, day: 12 } },
      signals: { tap2: { named: true, answered: 1, day: 12 }, stamp: { named: false, answered: 0, day: 12 } },
      records: { weight: { longest: 720, clean: 0, noTap: 0, day: 12 }, breath: { longest: 2400, clean: 2400, noTap: 2400, day: 90 } },
    };
    const host = card(s);
    const pair = host.querySelector(`[data-craft-pair="${ANN}"]`)!;
    expect(pair.textContent).toContain('RHYTHM: PRACTISED');
    expect(pair.textContent).toContain('POSTURES: 2');
    expect(pair.textContent).toMatch(/SIGNALS: TWO TAPS/);
    expect(pair.textContent).not.toMatch(/STAMP/i); // not named: not shown
    const lines = [...host.querySelectorAll(`[data-craft-record="${ANN}"]`)] as HTMLElement[];
    expect(lines.map((l) => l.textContent)).toEqual(['Day 12 — 12 minutes under my weight.', 'Day 90 — 40 minutes without air, not a slip.']);
    for (const l of lines) expect(l.style.getPropertyValue('--alius-font-hand')).not.toBe(''); // her hand
    expect(craftOf(host).textContent).not.toMatch(/AUTHOR TO WRITE/);
  });

  it('a record line and its template: the kind picks the template, an unknown place falls to the default', () => {
    expect(recordLine(reg, { key: 'weight', kind: 'noTap', seconds: 2400, day: 90 })).toBe('Day 90 — 40 minutes under my weight, no taps.');
    expect(recordLine(reg, { key: 'nowhere', kind: 'longest', seconds: 45 * 60, day: 3 })).toBe('Day 3 — 45 minutes held for me.');
  });

  it('a posture\'s record names the posture, not its key', () => {
    const line = recordLine(reg, { key: 'posture:kneel_open', kind: 'longest', seconds: 15 * 60, day: 9 });
    expect(line).not.toMatch(/posture:|kneel_open/);
    expect(line).toContain(String(reg.servicePostures.get('kneel_open')!.label).toLowerCase());
    expect(line).not.toMatch(/AUTHOR TO WRITE|\{/);
  });

  it('every element carries data-analyze, resolves and is reachable', () => {
    const s = campaign(reg, 3);
    s.relations[ANN].craft = { rhythm: { xp: 90, day: 12 }, postures: { sitting: { xp: 40, day: 12 } }, signals: { tap2: { named: true, answered: 1, day: 12 } }, records: { weight: { longest: 720, clean: 0, noTap: 0, day: 12 } } };
    const host = card(s);
    const block = craftOf(host) as HTMLElement;
    expect(markedWithout(block)).toEqual([]);
    expect(unresolved(block, env(s))).toEqual([]);
    expect(unreachable(block)).toEqual([]);
    expect(block.querySelectorAll('[data-analyze]').length).toBeGreaterThan(9);
  });

  it('hidden values never reach the block: no xp without raw values, never the count, an unnamed signal or the point she has not said', () => {
    const { state, sentinels } = hiddenFixture(reg);
    const off = card(state, false);
    expect(leaks(craftOf(off).outerHTML, { numbers: sentinels.numbers.filter((n) => [183.5, 271.3, 119.9, 211.7, 79, 89].includes(n)), texts: sentinels.texts })).toEqual([]);
    expect(craftOf(off).textContent).toMatch(/STILLNESS: STEADY/);
    expect(craftOf(off).textContent).toMatch(/POSTURE: SEASONED/);
    expect(craftOf(off).textContent).toMatch(/RHYTHM: PRACTISED/);
    expect(craftOf(off).textContent).not.toMatch(/\d{3}/); // no xp: (the only digits are a day and a count of minutes)
    const on = card(state, true);
    expect(craftOf(on).textContent).toContain('STILLNESS: STEADY (183.5)'); // raw values: the xp joins the word
    expect(leaks(craftOf(on).outerHTML, { numbers: [119.9, 211.7, 79, 89], texts: sentinels.texts })).toEqual([]); // the pair's xp, the count and the unnamed signal never
    expect(craftOf(on).outerHTML).not.toMatch(/streak|slips|lesson|answered|decayedDay/);
  });

  it('no pronoun for the commander in anything it writes', () => {
    const s = campaign(reg, 3);
    s.relations[ANN].craft = { rhythm: { xp: 90, day: 12 }, signals: { tap2: { named: true, answered: 1, day: 12 }, push: { named: true, answered: 1, day: 12 } }, records: { weight: { longest: 720, clean: 720, noTap: 720, day: 12 }, breath: { longest: 2400, clean: 0, noTap: 2400, day: 90 } } };
    expect(craftOf(card(s)).textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});
