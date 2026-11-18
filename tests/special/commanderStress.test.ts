// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge } from '../../src/analysis/knowledge';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { finalizeCombat } from '../../src/engine/combat/outcome';
import { defaultFormation } from '../../src/engine/combat/stats';
import type { CombatState, StartPayload } from '../../src/engine/combat/types';
import { recordLedger } from '../../src/engine/ledger';
import { Rng, seedRng } from '../../src/engine/rng';
import { socialRank } from '../../src/engine/social';
import { addCommanderStress, commanderStress, commanderStressBand } from '../../src/engine/special/commanderStress';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import '../../src/engine/actions/special';
import { endDay } from '../helpers/loyalty';
import { campaign, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });

const set = (s: CampaignState, n: number): CampaignState => { s.commander.stress = n; return s; };
const fresh = (): CampaignState => { const s = campaign(reg, 4); s.slot = 'morning'; s.base.facilities.medbay = Math.max(1, s.base.facilities.medbay ?? 0); return s; };

describe('addCommanderStress', () => {
  it('clamps 0..100 and emits the delta and its source', () => {
    const s = fresh();
    expect(addCommanderStress(s, 30, 'test')).toEqual([{ type: 'commander_stress_changed', delta: 30, source: 'test' }]);
    expect(commanderStress(s)).toBe(30);
    expect(addCommanderStress(s, 500, 'test')[0]).toMatchObject({ delta: 70 });
    expect(commanderStress(s)).toBe(100);
    expect(addCommanderStress(s, -500, 'test')[0]).toMatchObject({ delta: -100 });
    expect(commanderStress(s)).toBe(0);
    expect(addCommanderStress(s, -5, 'test')).toEqual([]); // nothing moved: no event
  });

  it('an old save without stress reads 0 and calm', () => {
    const s = fresh();
    delete s.commander.stress;
    expect(commanderStress(s)).toBe(0);
    expect(commanderStressBand(s)).toBe('calm');
  });

  it('bands follow the unit bands', () => {
    const s = fresh();
    expect([10, 30, 60, 90].map((n) => commanderStressBand(set(s, n)))).toEqual(['calm', 'tense', 'strained', 'breaking']);
  });

  it('draws nothing: the rng is unchanged across a day end at stress 40', () => {
    const s = set(fresh(), 40);
    const next = endDay(s, reg);
    // the day end draws for other reasons; compare against the same day end with no stress
    const plain = endDay(fresh(), reg);
    expect(next.rng).toEqual(plain.rng);
    expect(commanderStress(next)).toBe(35);
  });
});

describe('Empathy at high stress', () => {
  it('one rank lower from 70, floor 1, and stacked with the sleepless penalty', () => {
    const s = fresh();
    s.commander.socialStats.empathy = 3;
    expect(socialRank(s, 'empathy')).toBe(3);
    set(s, 69);
    expect(socialRank(s, 'empathy')).toBe(3);
    set(s, 70);
    expect(socialRank(s, 'empathy')).toBe(2);
    expect(socialRank(s, 'authority')).toBe(s.commander.socialStats.authority); // only Empathy
    s.commander.sleeplessDay = s.day;
    s.commander.sleeplessRank = { empathy: -1 };
    expect(socialRank(s, 'empathy')).toBe(1);
    s.commander.socialStats.empathy = 1;
    expect(socialRank(s, 'empathy')).toBe(1); // floor
  });
});

describe('sources and relief', () => {
  it('the medbay commander focus takes 20 off', () => {
    const s = set(fresh(), 50);
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'medbay', focus: 'commander' } });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(commanderStress(r.state)).toBe(30);
    expect(r.events.find((e) => e.type === 'commander_stress_changed')).toMatchObject({ delta: -20, source: 'medbay' });
  });

  it('a quiet-night sleep takes 15 off', () => {
    const s = set(fresh(), 50);
    s.slot = 'night';
    delete s.calendar.nightEvent;
    const r = run(s, reg, { type: 'calendar/sleep' });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(commanderStress(r.state)).toBe(35); // the day end already ran at dusk, so only the sleep's 15 applies
  });

  it('a day end takes 5 off in every campaign', () => {
    expect(commanderStress(endDay(set(fresh(), 40), reg))).toBe(35);
    expect(commanderStress(endDay(fresh(), reg))).toBe(0);
  });

  it('a downed commander gains 10 at finalize', () => {
    const base = fresh();
    const payload: StartPayload = {
      encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1, exposesCommander: true },
      formation: defaultFormation(base, reg, base.roster.activeIds), coverId: 'unit_ann',
    };
    const open = run(base, reg, { type: 'combat/start', payload }).state;
    const down = (cs: CombatState) => { cs.commander!.downed = true; cs.commander!.hp = 0; };
    const lost = structuredClone(open);
    down(lost.combat!);
    finalizeCombat(lost, reg, new Rng(seedRng(5)), 'lost');
    expect(commanderStress(lost)).toBe(10);
    const fine = structuredClone(open);
    for (const x of fine.combat!.combatants.filter((y) => y.side === 'enemy')) { x.downed = true; x.hp = 0; }
    finalizeCombat(fine, reg, new Rng(seedRng(5)), 'won');
    expect(commanderStress(fine)).toBe(0);
  });
});

describe('the ledger and the CMDR card', () => {
  it('the ledger records res:cmdr_stress', () => {
    const before = fresh();
    const after = structuredClone(before);
    after.commander.stress = 10;
    recordLedger(before, after, 'test');
    expect(after.ledger).toContainEqual(expect.objectContaining({ key: 'res:cmdr_stress', delta: 10 }));
  });

  it('the CMDR card shows the band chip with data-analyze, calm on an old save', () => {
    const s = fresh();
    delete s.commander.stress;
    const host = h('div');
    renderCmdrCard(host, { state: s, registries: reg, raw: false });
    const chip = host.querySelector('[data-analyze="glossary:commander_stress"]')!;
    expect(chip.className).toContain('alius-chip');
    expect(chip.textContent).toBe('STRESS: calm');
    const strained = h('div');
    renderCmdrCard(strained, { state: set(s, 60), registries: reg, raw: true });
    expect(strained.querySelector('[data-analyze="glossary:commander_stress"]')!.textContent).toBe('STRESS: strained');
  });

  it('the reading shows the band, and the number only with raw values on', () => {
    const s = set(fresh(), 60);
    const read = (raw: boolean) => readingFor(parseSubject('glossary:commander_stress')!, { registries: reg, state: s, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } })!.lines.join(' ');
    expect(read(false)).toMatch(/strained/);
    expect(read(false)).not.toMatch(/\b60\b/);
    expect(read(true)).toMatch(/\b60\b/);
    expect(buildKnowledge(s, DEFAULT_SETTINGS).showRaw).toBe(false);
  });
});
