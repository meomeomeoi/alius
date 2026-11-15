import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { CONTENT_GATED_REGISTRIES, contentAllowed, enabledCategories, setCategories } from '../../../src/engine/bonds';
import { Rng } from '../../../src/engine/rng';
import { enqueueNight, rollNight } from '../../../src/engine/night';
import { openDemand } from '../../../src/engine/discipline';
import type { CampaignState, NightEntry } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { enable, GATE_FIXTURE, GATE_PROBES, loadGate, withBond } from '../../helpers/bonds';

let reg: Registries;
let gate: Registries;
beforeAll(async () => {
  reg = await loadCore();
  gate = await loadGate();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

describe('the gate', () => {
  it('all categories start disabled', () => {
    const s = campaign(reg, 4);
    expect(s.content).toBeUndefined();
    expect(enabledCategories(s)).toEqual([]);
  });

  it('contentAllowed is false for a tagged entry until its category is enabled', () => {
    const s = campaign(reg, 4);
    const tagged = { id: 'x', contentTags: ['restraint'] };
    expect(contentAllowed(s, reg, tagged)).toBe(false);
    expect(contentAllowed(s, reg, { id: 'y' })).toBe(true);
    expect(contentAllowed(s, reg, { id: 'y', contentTags: [] })).toBe(true);
    enable(s, 'restraint');
    expect(contentAllowed(s, reg, tagged)).toBe(true);
    expect(contentAllowed(s, reg, { id: 'z', contentTags: ['restraint', 'humiliation'] })).toBe(false);
  });

  it('contentAllowed with a unit honours her ownLimits even when enabled', () => {
    const s = campaign(reg, 4);
    enable(s, 'restraint', 'humiliation');
    withBond(s, ANN, { ownLimits: { categories: ['restraint'] } });
    const tagged = { id: 'x', contentTags: ['restraint'] };
    expect(contentAllowed(s, reg, tagged)).toBe(true);
    expect(contentAllowed(s, reg, tagged, ANN)).toBe(false);
    expect(contentAllowed(s, reg, tagged, BEA)).toBe(true);
    expect(contentAllowed(s, reg, { id: 'h', contentTags: ['humiliation'] }, ANN)).toBe(true);
  });

  it('a grunt or an unknown unit has no limits', () => {
    const s = campaign(reg, 4);
    enable(s, 'restraint');
    expect(contentAllowed(s, reg, { id: 'x', contentTags: ['restraint'] }, 'nobody')).toBe(true);
  });

  it('a tagged dilemma template is never drawn while disabled (familyEnabled)', () => {
    const s = campaign(gate, 4);
    const ids = GATE_PROBES.dilemmaTemplates(s, gate);
    for (const id of GATE_FIXTURE.dilemmaTemplates.ids) expect(ids).not.toContain(id);
  });

  it('a tagged demand template is not eligible while disabled', () => {
    const s = campaign(gate, 4);
    expect(GATE_PROBES.demandTemplates(s, gate)).not.toContain('gate_demand');
    enable(s, 'humiliation');
    expect(GATE_PROBES.demandTemplates(s, gate)).toContain('gate_demand');
  });

  it('a tagged defect night spec is never queued while disabled', () => {
    const r = structuredClone(reg);
    r.defects.get('imprint_hunger')!.nightEvents = [{ id: 'tagged_visit', kind: 'tagged_visit', chance: 1, priority: 50, trigger: 'daily', framing: '{name} knocks.', ignore: { event: 'dismissed', severity: 'minor' }, contentTags: ['restraint'] }];
    const s = campaign(r, 4);
    s.squad.find((u) => u.id === BEA)!.defects = [{ id: 'imprint_hunger' }];
    const roll = (state: CampaignState) => rollNight(state, r, new Rng(state.rng), 'daily');
    const off = structuredClone(s);
    roll(off);
    expect(off.calendar.nightEventsQueue.filter((e) => e.kind === 'tagged_visit')).toEqual([]);
    const on = enable(structuredClone(s), 'restraint');
    roll(on);
    expect(on.calendar.nightEventsQueue.filter((e) => e.kind === 'tagged_visit')).toHaveLength(1);
    // her own limit holds even with the category enabled
    withBond(on, BEA, { ownLimits: { categories: ['restraint'] } });
    on.calendar.nightEventsQueue = [];
    roll(on);
    expect(on.calendar.nightEventsQueue.filter((e) => e.kind === 'tagged_visit')).toEqual([]);
  });

  it('every registry in CONTENT_GATED_REGISTRIES has a probe and no probe returns a tagged entry while disabled', () => {
    expect(Object.keys(GATE_PROBES).sort()).toEqual([...CONTENT_GATED_REGISTRIES].sort());
    for (const registry of CONTENT_GATED_REGISTRIES) {
      const { ids, category } = GATE_FIXTURE[registry];
      for (const id of ids) expect(gate[registry].get(id)?.contentTags, `${registry}/${id} is tagged in the fixture`).toEqual([category]);
      const s = campaign(gate, 4);
      const off = GATE_PROBES[registry](s, gate);
      for (const id of ids) expect(off, `${registry}: ${id} while disabled`).not.toContain(id);
      // the probe is live: with the category on, at least one tagged entry shows up
      const on = GATE_PROBES[registry](enable(structuredClone(s), category), gate);
      expect(ids.some((id) => on.includes(id)), `${registry}: a tagged entry shows up once ${category} is on`).toBe(true);
    }
  });
});

describe('setCategories / content/set_categories', () => {
  it('drops unknown ids, keeps registry order and emits content_changed with what moved', () => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: ['restraint', 'nope', 'humiliation', 'restraint'] } });
    expect(errors(r.events)).toEqual([]);
    expect(enabledCategories(r.state)).toEqual(['humiliation', 'restraint']);
    expect(ofType(r.events, 'content_changed')).toEqual([{ type: 'content_changed', added: ['humiliation', 'restraint'], removed: [] }]);
    const r2 = run(r.state, reg, { type: 'content/set_categories', payload: { enabled: ['restraint'] } });
    expect(ofType(r2.events, 'content_changed')).toEqual([{ type: 'content_changed', added: [], removed: ['humiliation'] }]);
  });

  it('a change that moves nothing emits no event', () => {
    const s = enable(campaign(reg, 4), 'restraint');
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: ['restraint'] } });
    expect(ofType(r.events, 'content_changed')).toEqual([]);
  });

  it('a malformed payload is rejected and changes nothing', () => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: 'restraint' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(s);
  });

  it('works while a scene is open and an expedition is not required', () => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: ['explicit_scenes'] } });
    expect(errors(r.events)).toEqual([]);
  });

  it('disabling withdraws an open tagged demand and night entry with no deltas', () => {
    const s = enable(campaign(gate, 4), 'humiliation', 'restraint');
    // an open tagged demand for Ann (delivered in the scene, so no DM is written either way)
    const opened = openDemand(s, { registries: { ...gate, demandTemplates: new Map([['gate_demand', gate.demandTemplates.get('gate_demand')!]]) }, rng: new Rng(s.rng) }, ANN)!;
    expect(opened.demand.templateId).toBe('gate_demand');
    s.calendar.nightEventsQueue.push({ id: 'n1', unitId: BEA, kind: 'x', priority: 50, framing: 'k', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99, contentTags: ['restraint'] } as NightEntry);
    enqueueNight(s, { id: 'n2', unitId: ANN, kind: 'visit', priority: 10, framing: 'k', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99 });
    const before = structuredClone(s);
    const r = run(s, gate, { type: 'content/set_categories', payload: { enabled: ['restraint'] } });
    expect(r.state.discipline?.demands).toEqual([]);
    expect(r.state.calendar.nightEventsQueue.map((e) => e.id)).toEqual(['n1', 'n2']);
    const r2 = run(r.state, gate, { type: 'content/set_categories', payload: { enabled: [] } });
    expect(r2.state.calendar.nightEventsQueue.map((e) => e.id)).toEqual(['n2']);
    // no deltas: relations, stress and resources are untouched
    expect(r2.state.relations).toEqual(before.relations);
    expect(r2.state.squad.map((u) => u.stress)).toEqual(before.squad.map((u) => u.stress));
    expect(r2.state.resources).toEqual(before.resources);
    expect(r2.events.map((e) => e.type)).toEqual(['content_changed']);
  });

  it('the night entry being played is also withdrawn', () => {
    const s = enable(campaign(reg, 4), 'restraint');
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n1', unitId: BEA, kind: 'x', priority: 50, framing: 'k', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99, contentTags: ['restraint'] };
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: [] } });
    expect(r.state.calendar.nightEvent).toBeUndefined();
  });

  it('setCategories can be called on a draft directly', () => {
    const s = campaign(reg, 4);
    const events = setCategories(s, reg, ['restraint']);
    expect(events).toEqual([{ type: 'content_changed', added: ['restraint'], removed: [] }]);
  });
});

describe('an old save', () => {
  it('without any P9d field plays a day end and reads the defaults (Review Focus 1)', () => {
    const s = campaign(reg, 4);
    for (const key of ['content', 'bonds'] as const) expect(s[key]).toBeUndefined();
    for (const u of s.squad) expect(u.bond).toBeUndefined();
    const after = endDay(s, reg);
    expect(after.day).toBe(s.day + 1);
    expect(enabledCategories(after)).toEqual([]);
  });
});
