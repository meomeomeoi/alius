import { beforeAll, describe, expect, it } from 'vitest';
import type { HerCallSpec } from '../../src/content/schemas';
import { isCostEffect } from '../../src/content/schemas';
import type { Entry, Registries } from '../../src/content/types';
import { CORE_GLOSSARY_IDS } from '../../src/analysis/providers/core';
import { herCallCandidates } from '../../src/engine/power/herCall';
import { ableParty, eventPool } from '../../src/engine/world/expedition';
import type { WorldEffect } from '../../src/engine/world/types';
import { withBond } from '../helpers/bonds';
import { depart, withMission } from '../helpers/expedition';
import { campaign, loadCore } from '../helpers/loyalty';
import '../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const herCalls = (r: Registries = reg) => [...r.dilemmaTemplates.values()].filter((t) => t.herCall !== undefined);
const specOf = (t: Entry) => t.herCall as HerCallSpec;
const poolIds = (s: ReturnType<typeof campaign>, r: Registries): string[] => [...r.regions.keys()].flatMap((rid) => eventPool(s, r, rid).map((t) => String(t.id)));
const without = (): Registries => ({ ...reg, dilemmaTemplates: new Map([...reg.dilemmaTemplates].filter(([, t]) => t.herCall === undefined)) });

/** A run of the harness squad (all named units as `campaign` builds them) on a command mission. */
function runOf(setup: (s: ReturnType<typeof campaign>) => void = () => {}) {
  const base = campaign(reg, 4);
  setup(base);
  const { state, mission } = withMission(reg, base);
  return depart(reg, state, mission.id);
}

describe('P9e content: the her-call events', () => {
  it('core ships 4 to 6 her-call templates, each with one good and one bad outcome', () => {
    const list = herCalls();
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.length).toBeLessThanOrEqual(6);
    for (const t of list) {
      expect(specOf(t).outcomes.map((o) => o.id).sort(), String(t.id)).toEqual(['bad', 'good']);
      expect(t.scale, String(t.id)).toBe('minor');
      expect(t.contexts, String(t.id)).toEqual(['expedition_event']);
      expect(t.regions, String(t.id)).toBeUndefined();
    }
  });

  it('each one has a commander fixed block: two options, each with a cost effect; outcomes follow the cost rule', () => {
    for (const t of herCalls()) {
      const fixed = t.fixed as { setup: string; options: Array<{ effects: WorldEffect[] }> };
      expect(fixed.options, String(t.id)).toHaveLength(2);
      for (const o of fixed.options) expect(o.effects.some(isCostEffect), String(t.id)).toBe(true);
      const [good] = specOf(t).outcomes.filter((o) => o.id === 'good');
      const [bad] = specOf(t).outcomes.filter((o) => o.id === 'bad');
      expect((good.effects as WorldEffect[]).some(isCostEffect), String(t.id)).toBe(false);
      expect((bad.effects as WorldEffect[]).some(isCostEffect), String(t.id)).toBe(true);
      expect(fixed.setup, `${String(t.id)} is a draft`).toMatch(/^AUTHOR TO WRITE/);
    }
  });

  it('an outcome text is a past-tense clause of her own ("she …"), so it reads after both frames', () => {
    for (const t of herCalls()) {
      for (const o of specOf(t).outcomes) {
        expect(o.text, `${String(t.id)} ${o.id}`).toMatch(/^she [a-z]+ed?\b|^she (let|took|led|gave|broke|called|made|went|ran|held)\b/);
        expect(o.text.length, `${String(t.id)} ${o.id}`).toBeLessThanOrEqual(160);
        // "Ann took the decision herself: she …" (log, card) and "… it went well: she …" (fact)
        expect(`Ann took the decision herself: ${o.text}`).toMatch(/herself: she /);
      }
    }
  });

  it('a bad outcome bites about as hard as the worst option of an ordinary minor event (supplies 2–3, stress +10, HP −10 %)', () => {
    for (const t of herCalls()) {
      const bad = specOf(t).outcomes.find((o) => o.id === 'bad')!.effects as WorldEffect[];
      for (const e of bad) {
        if (e.type === 'carried_supplies') expect(e.amount, String(t.id)).toBeGreaterThanOrEqual(-3);
        if (e.type === 'party_stress') expect(e.amount, String(t.id)).toBeLessThanOrEqual(10);
        if (e.type === 'party_hp') expect(e.pct, String(t.id)).toBeGreaterThanOrEqual(-10);
      }
    }
  });

  it('triggers use the lead ranks and stances of the plan, and the defect tilts are by category', () => {
    const by = Object.fromEntries(herCalls().map((t) => [String(t.id), specOf(t)]));
    expect(Object.keys(by).sort()).toEqual(['evt_hc_cache', 'evt_hc_fallback', 'evt_hc_orders', 'evt_hc_prisoner', 'evt_hc_route']);
    expect(by.evt_hc_route.trigger).toEqual({ minLeadRank: 2 });
    expect(by.evt_hc_cache.trigger).toEqual({ minLeadRank: 2 });
    expect(by.evt_hc_prisoner.trigger).toEqual({ stances: ['open_defiance', 'defiant_loyal'], minImpunity: 50 });
    expect(by.evt_hc_fallback.trigger).toEqual({ minLeadRank: 2, stances: ['defiant_loyal'], minImpunity: 50 });
    expect(by.evt_hc_orders.trigger).toEqual({ stances: ['open_defiance'], minImpunity: 50 });
    expect(by.evt_hc_route.defectTilt).toEqual([{ category: 'neural', shift: -0.1 }]);
    expect(by.evt_hc_cache.defectTilt).toEqual([{ category: 'cybernetic', shift: 0.1 }]);
    for (const [id, spec] of Object.entries(by)) {
      for (const o of spec.outcomes) for (const v of Object.values(o.lean)) expect(Math.abs(v as number), id).toBeLessThanOrEqual(2);
    }
  });
});

describe('P9e content: the pool', () => {
  it('the core pool stays unchanged for the harness squad with nobody eligible', () => {
    const s = runOf((b) => {
      for (const u of b.squad) withBond(b, u.id, { leadStyle: 'yielding' });
    });
    expect(herCalls().every((t) => herCallCandidates(s, reg, specOf(t), ableParty(s)).length === 0)).toBe(true);
    expect(poolIds(s, reg)).toEqual(poolIds(s, without()));
    expect(poolIds(s, reg).some((id) => id.startsWith('evt_hc_'))).toBe(false);
  });

  it('with an assertive soldier in the party the core pool includes the minLeadRank templates', () => {
    const s = runOf((b) => withBond(b, b.roster.activeIds[0], { leadStyle: 'assertive' }));
    const ids = new Set(poolIds(s, reg));
    const byRank = herCalls().filter((t) => specOf(t).trigger.minLeadRank !== undefined && specOf(t).trigger.minLeadRank! <= 2).map((t) => String(t.id));
    expect(byRank.length).toBeGreaterThanOrEqual(2);
    for (const id of byRank) expect(ids.has(id), id).toBe(true);
    // a template that waits on stances alone stays out while nobody holds one
    expect(ids.has('evt_hc_orders')).toBe(false);
  });
});

describe('P9e content: the glossary', () => {
  it('has her_call and ask_first, addressed by the code', () => {
    for (const id of ['her_call', 'ask_first']) {
      const g = reg.glossary.get(id)!;
      expect(g, id).toBeDefined();
      expect(String(g.short).length, id).toBeGreaterThan(0);
      expect(typeof g.long, id).toBe('string');
      expect(CORE_GLOSSARY_IDS).toContain(id);
    }
  });
});
